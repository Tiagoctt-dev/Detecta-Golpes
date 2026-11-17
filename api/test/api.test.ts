import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, migrate, type Db } from '../src/db.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://detecta:detecta@localhost:5433/detecta_test';
let db: Db;
let app: FastifyInstance;

const NUM = '+55 11 98765-4321';
const E164 = '+5511987654321';

async function newDevice() {
  const res = await app.inject({ method: 'POST', url: '/dispositivos' });
  const { token } = res.json() as { token: string };
  return { authorization: `Bearer ${token}` };
}

/** Cria `n` dispositivos e cada um denuncia o número. */
async function reportBy(n: number, numero = NUM, motivo = 'golpe') {
  for (let i = 0; i < n; i++) {
    const headers = await newDevice();
    const r = await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero, motivo } });
    expect(r.statusCode).toBe(201);
  }
}

beforeAll(async () => {
  db = createPool(URL);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  app = await buildApp({ db, dailyReportLimit: 3, rateLimit: { max: 10_000, reputationMax: 5 } });
});

beforeEach(async () => {
  await db.query('TRUNCATE devices, reports, personal_lists, call_decisions, official_numbers, engine_config, contestations RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe('público', () => {
  it('health e níveis de risco', async () => {
    expect((await app.inject('/health')).json()).toEqual({ ok: true });
    const niveis = (await app.inject('/niveis-risco')).json() as Array<{ id: string }>;
    expect(niveis.map((n) => n.id)).toEqual(['baixo', 'moderado', 'suspeito', 'alto']);
  });

  it('rotas autenticadas exigem token', async () => {
    expect((await app.inject('/historico')).statusCode).toBe(401);
    expect((await app.inject({ url: '/historico', headers: { authorization: 'Bearer x' } })).statusCode).toBe(401);
  });

  it('registra contestação do titular', async () => {
    const r = await app.inject({ method: 'POST', url: '/contestacoes', payload: { numero: NUM, contato: 'email@exemplo.com', mensagem: 'Este número é da minha loja.' } });
    expect(r.statusCode).toBe(201);
  });
});

describe('denúncias (HU-16)', () => {
  it('registra e impede duplicata do mesmo dispositivo', async () => {
    const headers = await newDevice();
    const r1 = await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero: NUM, motivo: 'golpe' } });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ numero: E164, contabilizada: true, reputacao: { reportsTotal: 1 } });
    const r2 = await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero: '(11) 98765-4321', motivo: 'golpe' } });
    expect(r2.statusCode).toBe(409);
    expect(r2.json().erro).toBe('Você já denunciou este número');
  });

  it('valida motivo e número', async () => {
    const headers = await newDevice();
    expect((await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero: NUM, motivo: 'xx' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero: '123', motivo: 'golpe' } })).statusCode).toBe(400);
  });

  it('CA-10: acima do limite diário fica registrada mas não pesa no score', async () => {
    const headers = await newDevice();
    const results = [];
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: 'POST', url: '/denuncias', headers, payload: { numero: `+55119876500${i}0`, motivo: 'golpe' } });
      results.push(r.json().contabilizada);
    }
    expect(results).toEqual([true, true, true, false]);
    const rep = (await app.inject({ url: '/reputacao/+5511987650030', headers })).json();
    expect(rep.totalDenuncias).toBe(0);
  });
});

describe('reputação e histórico do número (HU-13, HU-20)', () => {
  it('número sem registros', async () => {
    const headers = await newDevice();
    const r = (await app.inject({ url: `/reputacao/${encodeURIComponent(NUM)}`, headers })).json();
    expect(r).toMatchObject({ numero: E164, nivel: 'moderado', motivo: 'Sem registros - número ainda não avaliado', totalDenuncias: 0, uf: 'SP' });
  });

  it('número denunciado vira suspeito e depois alto', async () => {
    await reportBy(2);
    const headers = await newDevice();
    let r = (await app.inject({ url: `/reputacao/${E164}`, headers })).json();
    expect(r.nivel).toBe('suspeito');
    expect(r.motivo).toBe('2 pessoas denunciaram como golpe esta semana');
    await reportBy(8);
    r = (await app.inject({ url: `/reputacao/${E164}`, headers })).json();
    expect(r.nivel).toBe('alto');
    const hist = (await app.inject({ url: `/numeros/${E164}/historico`, headers })).json();
    expect(hist.totalDenuncias).toBe(10);
    expect(hist.ultimas).toHaveLength(5);
  });

  it('formato inválido = 400', async () => {
    const headers = await newDevice();
    expect((await app.inject({ url: '/reputacao/abc', headers })).statusCode).toBe(400);
  });

  it('KAN-80: consulta manual tem rate limit próprio', async () => {
    const headers = await newDevice();
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await app.inject({ url: `/reputacao/${E164}`, headers })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('decisão da chamada (HU-09, HU-17, HU-19, HU-07, HU-10)', () => {
  const analisar = (headers: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/chamadas/analisar', headers, payload }).then((r) => r.json());

  it('desconhecido toca; muitas denúncias bloqueia', async () => {
    const headers = await newDevice();
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ nivel: 'moderado', acao: 'permitir' });
    await reportBy(9);
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ nivel: 'alto', acao: 'bloquear' });
  });

  it('lista de permitidos tem prioridade', async () => {
    await reportBy(9);
    const headers = await newDevice();
    await app.inject({ method: 'PUT', url: `/listas/${E164}`, headers, payload: { lista: 'permitido', rotulo: 'Oficina' } });
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ acao: 'permitir', motivo: 'Permitido por você' });
    const listas = (await app.inject({ url: '/listas', headers })).json();
    expect(listas).toEqual([expect.objectContaining({ numero: E164, lista: 'permitido', rotulo: 'Oficina' })]);
    expect((await app.inject({ method: 'DELETE', url: `/listas/${E164}`, headers })).statusCode).toBe(204);
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ acao: 'bloquear' });
  });

  it('nível de proteção altera a ação para suspeitos', async () => {
    await reportBy(2);
    const headers = await newDevice();
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ nivel: 'suspeito', acao: 'silenciar' });
    const pref = await app.inject({ method: 'PUT', url: '/preferencias', headers, payload: { protecao: 'alto' } });
    expect(pref.json()).toEqual({ protecao: 'alto', modoIdoso: false });
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ acao: 'bloquear' });
    await app.inject({ method: 'PUT', url: '/preferencias', headers, payload: { protecao: 'baixo' } });
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ acao: 'permitir' });
  });

  it('número oficial de banco é baixo risco', async () => {
    await db.query(`INSERT INTO official_numbers (e164, institution) VALUES ('40040001', 'Banco do Brasil')`);
    const headers = await newDevice();
    expect(await analisar(headers, { numero: '4004-0001' })).toMatchObject({ nivel: 'baixo', motivo: 'Número oficial do Banco do Brasil' });
  });

  it('modo idoso bloqueia números com várias denúncias', async () => {
    await reportBy(5);
    const headers = await newDevice();
    await app.inject({ method: 'PUT', url: '/preferencias', headers, payload: { modoIdoso: true } });
    expect(await analisar(headers, { numero: NUM })).toMatchObject({ acao: 'bloquear', nivel: 'alto' });
  });

  it('falha de autenticação de origem bloqueia', async () => {
    const headers = await newDevice();
    expect(await analisar(headers, { numero: NUM, verificacao: 'falhou' })).toMatchObject({ nivel: 'alto', acao: 'bloquear' });
  });
});

describe('histórico e feedback (HU-18, CA-07, CA-08)', () => {
  const log = (headers: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/chamadas', headers, payload });

  it('pagina e filtra o histórico do próprio dispositivo', async () => {
    const headers = await newDevice();
    const other = await newDevice();
    for (let i = 0; i < 5; i++) {
      const r = await log(headers, { numero: `+5511987650${i}00`, nivel: i % 2 ? 'alto' : 'moderado', acao: i % 2 ? 'bloquear' : 'permitir', motivo: 'x', codigoMotivo: 'sem_historico', latenciaMs: 12 });
      expect(r.statusCode).toBe(201);
    }
    await log(other, { numero: NUM, nivel: 'alto', acao: 'bloquear', motivo: 'x', codigoMotivo: 'y' });
    const p1 = (await app.inject({ url: '/historico?limite=2', headers })).json();
    expect(p1.total).toBe(5);
    expect(p1.itens).toHaveLength(2);
    const bloqueadas = (await app.inject({ url: '/historico?acao=bloquear', headers })).json();
    expect(bloqueadas.total).toBe(2);
    expect(bloqueadas.itens[0]).toMatchObject({ nivel: 'alto', acao: 'bloquear' });
  });

  it('"Não era golpe" libera o número; "era golpe" vira denúncia', async () => {
    const headers = await newDevice();
    const id1 = (await log(headers, { numero: NUM, nivel: 'alto', acao: 'bloquear', motivo: 'x', codigoMotivo: 'y' })).json().id;
    const fb1 = await app.inject({ method: 'POST', url: `/chamadas/${id1}/feedback`, headers, payload: { resposta: 'legitima' } });
    expect(fb1.json()).toEqual({ ok: true, denuncia: null });
    expect((await app.inject({ url: '/listas', headers })).json()[0]).toMatchObject({ numero: E164, lista: 'permitido' });

    const id2 = (await log(headers, { numero: '+5521987654321', nivel: 'moderado', acao: 'permitir', motivo: 'x', codigoMotivo: 'y' })).json().id;
    const fb2 = await app.inject({ method: 'POST', url: `/chamadas/${id2}/feedback`, headers, payload: { resposta: 'golpe' } });
    expect(fb2.json()).toEqual({ ok: true, denuncia: 'criada' });

    const other = await newDevice();
    expect((await app.inject({ method: 'POST', url: `/chamadas/${id2}/feedback`, headers: other, payload: { resposta: 'golpe' } })).statusCode).toBe(404);
  });
});

describe('sincronização (funcionalidade 9, CA-09)', () => {
  it('entrega denúncias novas e a configuração', async () => {
    const headers = await newDevice();
    const first = (await app.inject({ url: '/sync', headers })).json();
    expect(first.reputations).toEqual([]);
    expect(first.config.thresholds.alto).toBe(60);
    await reportBy(3);
    const delta = (await app.inject({ url: `/sync?desde=${first.servidorEm}`, headers })).json();
    expect(delta.reputations).toEqual([expect.objectContaining({ numero: E164, reports7d: 3, reportsTotal: 3, predominantReason: 'golpe' })]);
    const none = (await app.inject({ url: `/sync?desde=${delta.servidorEm}`, headers })).json();
    expect(none.reputations).toEqual([]);
  });
});
