import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { analyzeCall, normalizeNumber, LEVEL_LABEL, SCAM_EXPLANATIONS, type RiskLevel } from '@detecta/risk-engine';
import type { Db } from './db.js';
import * as repo from './repo.js';

export interface AppOptions {
  db: Db;
  dailyReportLimit?: number;
  logger?: boolean;
  rateLimit?: { max: number; reputationMax: number };
}

declare module 'fastify' {
  interface FastifyRequest { device?: repo.Device }
}

const REASONS = ['golpe', 'falso_banco', 'telemarketing', 'cobranca_indevida'] as const;

/** Normaliza e rejeita números que não viram E.164 (400). */
function requireE164(raw: string): string {
  const n = normalizeNumber(raw);
  if (!n.e164) throw Object.assign(new Error('Número inválido'), { statusCode: 400 });
  return n.e164;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts;
  const dailyLimit = opts.dailyReportLimit ?? 10;
  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(rateLimit, { global: true, max: opts.rateLimit?.max ?? 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof z.ZodError) return reply.status(400).send({ erro: 'Dados inválidos', detalhes: err.issues });
    const status = err.statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ erro: status >= 500 ? 'Erro interno' : err.message });
  });

  const auth = async (req: FastifyRequest) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const device = token ? await repo.findDeviceByToken(db, token) : null;
    if (!device) throw Object.assign(new Error('Não autorizado'), { statusCode: 401 });
    req.device = device;
  };

  // ---------- público ----------
  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  // KAN-51: lista estática de níveis
  app.get('/niveis-risco', async () =>
    (Object.keys(LEVEL_LABEL) as RiskLevel[]).map((id) => ({ id, ...LEVEL_LABEL[id] })),
  );

  // KAN-85: catálogo de explicações simples
  app.get('/explicacoes', async () => SCAM_EXPLANATIONS);

  app.get('/config', async () => repo.getEngineConfig(db));

  // KAN-56: registro anônimo de dispositivo
  app.post('/dispositivos', async (_req, reply) => {
    const { id, token } = await repo.createDevice(db);
    return reply.status(201).send({ dispositivoId: id, token });
  });

  // Canal de contestação do titular (LGPD)
  app.post('/contestacoes', async (req, reply) => {
    const body = z.object({ numero: z.string(), contato: z.string().min(3).max(200), mensagem: z.string().min(10).max(2000) }).parse(req.body);
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO contestations (e164, contact, message) VALUES ($1, $2, $3) RETURNING id',
      [requireE164(body.numero), body.contato, body.mensagem],
    );
    return reply.status(201).send({ id: Number(rows[0]!.id), status: 'aberta' });
  });

  // ---------- autenticado ----------
  await app.register(async (r) => {
    r.addHook('onRequest', auth);

    // HU-19 / KAN-75
    r.get('/preferencias', async (req) => ({ protecao: req.device!.protection, modoIdoso: req.device!.elder_mode }));
    r.put('/preferencias', async (req) => {
      const body = z.object({ protecao: z.enum(['baixo', 'medio', 'alto']).optional(), modoIdoso: z.boolean().optional() }).parse(req.body);
      const { rows } = await db.query<{ protection: string; elder_mode: boolean }>(
        `UPDATE devices SET protection = COALESCE($2, protection), elder_mode = COALESCE($3, elder_mode)
          WHERE id = $1 RETURNING protection, elder_mode`,
        [req.device!.id, body.protecao ?? null, body.modoIdoso ?? null],
      );
      return { protecao: rows[0]!.protection, modoIdoso: rows[0]!.elder_mode };
    });

    // KAN-44: total e últimas denúncias
    r.get('/numeros/:numero/historico', async (req) => {
      const e164 = requireE164((req.params as { numero: string }).numero);
      const rep = await repo.getReputation(db, e164);
      return { numero: e164, totalDenuncias: rep.reportsTotal, denuncias7d: rep.reports7d, ultimas: await repo.getRecentReports(db, e164) };
    });

    // HU-20 / KAN-78: consulta manual (com limite próprio, KAN-80)
    r.get('/reputacao/:numero', {
      config: {
        rateLimit: {
          max: opts.rateLimit?.reputationMax ?? 30,
          timeWindow: '1 minute',
          // Por dispositivo; o limite global por IP continua valendo.
          keyGenerator: (req: FastifyRequest) => `rep:${req.device?.id ?? req.ip}`,
        },
      },
    }, async (req) => {
      const num = normalizeNumber((req.params as { numero: string }).numero);
      if (!num.e164) throw Object.assign(new Error('Número inválido'), { statusCode: 400 });
      const [reputation, officialBank, cfg] = await Promise.all([
        repo.getReputation(db, num.e164), repo.getOfficialInstitution(db, num.e164), repo.getEngineConfig(db),
      ]);
      const a = analyzeCall({ rawNumber: num.e164, reputation, officialBank }, cfg);
      const semRegistros = reputation.reportsTotal === 0 && !officialBank && a.signals.length === 0;
      return {
        numero: num.e164,
        uf: num.uf,
        nivel: a.level,
        motivo: semRegistros ? 'Sem registros - número ainda não avaliado' : a.reason,
        totalDenuncias: reputation.reportsTotal,
        denuncias7d: reputation.reports7d,
        motivoPredominante: reputation.predominantReason ?? null,
        instituicaoOficial: officialBank,
      };
    });

    // HU-16 / KAN-57
    r.post('/denuncias', async (req, reply) => {
      const body = z.object({ numero: z.string(), motivo: z.enum(REASONS) }).parse(req.body);
      const e164 = requireE164(body.numero);
      const res = await repo.createReport(db, req.device!.id, e164, body.motivo, dailyLimit);
      if (res.status === 'duplicada') return reply.status(409).send({ erro: 'Você já denunciou este número' });
      return reply.status(201).send({ numero: e164, contabilizada: res.counts, reputacao: await repo.getReputation(db, e164) });
    });

    // KAN-63: decisão online (permitir / silenciar / bloquear). O app usa o mesmo motor offline.
    r.post('/chamadas/analisar', async (req) => {
      const body = z.object({
        numero: z.string(),
        verificacao: z.enum(['aprovada', 'falhou', 'nao_verificada']).optional(),
      }).parse(req.body);
      const e164 = normalizeNumber(body.numero).e164;
      const [reputation, officialBank, personalList, cfg] = e164
        ? await Promise.all([repo.getReputation(db, e164), repo.getOfficialInstitution(db, e164), repo.getPersonalList(db, req.device!.id, e164), repo.getEngineConfig(db)])
        : [null, null, null, await repo.getEngineConfig(db)];
      const a = analyzeCall({
        rawNumber: body.numero, verification: body.verificacao, reputation, officialBank, personalList,
        protection: req.device!.protection, elderMode: req.device!.elder_mode,
      }, cfg);
      return { numero: a.number.e164, nivel: a.level, acao: a.action, motivo: a.reason, codigoMotivo: a.reasonCode };
    });

    // KAN-71: o app registra a decisão tomada no aparelho
    r.post('/chamadas', async (req, reply) => {
      const body = z.object({
        numero: z.string().max(40),
        nivel: z.enum(['baixo', 'moderado', 'suspeito', 'alto']),
        acao: z.enum(['permitir', 'silenciar', 'bloquear']),
        motivo: z.string().max(60),
        codigoMotivo: z.string().max(40),
        latenciaMs: z.number().int().nonnegative().optional(),
        recebidaEm: z.string().datetime().optional(),
      }).parse(req.body);
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO call_decisions (device_id, e164, raw_number, level, action, reason, reason_code, latency_ms, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now())) RETURNING id`,
        [req.device!.id, normalizeNumber(body.numero).e164, body.numero, body.nivel, body.acao, body.motivo, body.codigoMotivo, body.latenciaMs ?? null, body.recebidaEm ?? null],
      );
      return reply.status(201).send({ id: Number(rows[0]!.id) });
    });

    // CA-08 / HU-18: feedback pós-chamada e "Não era golpe"
    r.post('/chamadas/:id/feedback', async (req) => {
      const id = z.coerce.number().int().positive().parse((req.params as { id: string }).id);
      const { resposta } = z.object({ resposta: z.enum(['golpe', 'telemarketing', 'legitima']) }).parse(req.body);
      const { rows } = await db.query<{ e164: string | null }>(
        'UPDATE call_decisions SET feedback = $3 WHERE id = $1 AND device_id = $2 RETURNING e164',
        [id, req.device!.id, resposta],
      );
      const e164 = rows[0]?.e164;
      if (rows.length === 0) throw Object.assign(new Error('Chamada não encontrada'), { statusCode: 404 });
      let denuncia: repo.ReportResult | null = null;
      if (e164 && resposta !== 'legitima') {
        denuncia = await repo.createReport(db, req.device!.id, e164, resposta, dailyLimit);
      } else if (e164 && resposta === 'legitima') {
        // "Não era golpe": move para a lista de permitidos deste aparelho
        await db.query(
          `INSERT INTO personal_lists (device_id, e164, list) VALUES ($1, $2, 'permitido')
           ON CONFLICT (device_id, e164) DO UPDATE SET list = 'permitido'`, [req.device!.id, e164]);
      }
      return { ok: true, denuncia: denuncia?.status ?? null };
    });

    // HU-18 / KAN-72: histórico paginado com filtros
    r.get('/historico', async (req) => {
      const q = z.object({
        pagina: z.coerce.number().int().min(1).default(1),
        limite: z.coerce.number().int().min(1).max(100).default(20),
        nivel: z.enum(['baixo', 'moderado', 'suspeito', 'alto']).optional(),
        acao: z.enum(['permitir', 'silenciar', 'bloquear']).optional(),
      }).parse(req.query);
      const where = ['device_id = $1'];
      const params: unknown[] = [req.device!.id];
      if (q.nivel) { params.push(q.nivel); where.push(`level = $${params.length}`); }
      if (q.acao) { params.push(q.acao); where.push(`action = $${params.length}`); }
      const cond = where.join(' AND ');
      const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM call_decisions WHERE ${cond}`, params)).rows[0]!.n;
      params.push(q.limite, (q.pagina - 1) * q.limite);
      const { rows } = await db.query(
        `SELECT id, COALESCE(e164, raw_number) AS numero, level AS nivel, action AS acao, reason AS motivo,
                reason_code AS "codigoMotivo", feedback, received_at AS "recebidaEm"
           FROM call_decisions WHERE ${cond} ORDER BY received_at DESC, id DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
      return { pagina: q.pagina, limite: q.limite, total, itens: rows.map((r) => ({ ...r, id: Number(r.id) })) };
    });

    // HU-17 / KAN-67: listas pessoais
    r.get('/listas', async (req) => {
      const { rows } = await db.query(
        `SELECT e164 AS numero, list AS lista, label AS rotulo, created_at AS "criadoEm"
           FROM personal_lists WHERE device_id = $1 ORDER BY created_at DESC`, [req.device!.id]);
      return rows;
    });
    r.put('/listas/:numero', async (req) => {
      const e164 = requireE164((req.params as { numero: string }).numero);
      const body = z.object({ lista: z.enum(['permitido', 'bloqueado']), rotulo: z.string().max(80).optional() }).parse(req.body);
      await db.query(
        `INSERT INTO personal_lists (device_id, e164, list, label) VALUES ($1, $2, $3, $4)
         ON CONFLICT (device_id, e164) DO UPDATE SET list = EXCLUDED.list, label = EXCLUDED.label`,
        [req.device!.id, e164, body.lista, body.rotulo ?? null]);
      return { numero: e164, lista: body.lista, rotulo: body.rotulo ?? null };
    });
    r.delete('/listas/:numero', async (req, reply) => {
      const e164 = requireE164((req.params as { numero: string }).numero);
      const res = await db.query('DELETE FROM personal_lists WHERE device_id = $1 AND e164 = $2', [req.device!.id, e164]);
      return reply.status(res.rowCount ? 204 : 404).send();
    });

    // Funcionalidade 9: sincronização da base local
    r.get('/sync', async (req) => {
      const { desde } = z.object({ desde: z.string().datetime().optional() }).parse(req.query);
      const now = new Date();
      const [delta, config] = await Promise.all([repo.getSyncDelta(db, desde ? new Date(desde) : null), repo.getEngineConfig(db)]);
      return { servidorEm: now.toISOString(), config, ...delta };
    });
  });

  return app;
}
