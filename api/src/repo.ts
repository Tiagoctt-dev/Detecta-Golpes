import { createHash, randomBytes } from 'node:crypto';
import { DEFAULT_CONFIG, mergeConfig, type EngineConfig, type ReportReason, type Reputation } from '@detecta/risk-engine';
import type { Db } from './db.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface Device {
  id: string;
  protection: 'baixo' | 'medio' | 'alto';
  elder_mode: boolean;
}

export async function createDevice(db: Db): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await db.query<{ id: string }>('INSERT INTO devices (token_hash) VALUES ($1) RETURNING id', [hashToken(token)]);
  return { id: rows[0]!.id, token };
}

export async function findDeviceByToken(db: Db, token: string): Promise<Device | null> {
  const { rows } = await db.query<Device>(
    'UPDATE devices SET last_seen_at = now() WHERE token_hash = $1 RETURNING id, protection, elder_mode',
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

const REPUTATION_SQL = `
  SELECT e164,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS reports7d,
         count(*)::int AS reports_total,
         max(created_at) AS last_report_at,
         mode() WITHIN GROUP (ORDER BY reason) AS predominant_reason
    FROM reports
   WHERE counts AND e164 = ANY($1::text[])
   GROUP BY e164`;

interface ReputationRow { e164: string; reports7d: number; reports_total: number; last_report_at: Date | null; predominant_reason: ReportReason | null }

const toReputation = (r: ReputationRow): Reputation => ({
  reports7d: r.reports7d,
  reportsTotal: r.reports_total,
  lastReportAt: r.last_report_at?.toISOString() ?? null,
  predominantReason: r.predominant_reason,
});

export async function getReputation(db: Db, e164: string): Promise<Reputation> {
  const { rows } = await db.query<ReputationRow>(REPUTATION_SQL, [[e164]]);
  return rows[0] ? toReputation(rows[0]) : { reports7d: 0, reportsTotal: 0, lastReportAt: null, predominantReason: null };
}

export async function getRecentReports(db: Db, e164: string, limit = 5) {
  const { rows } = await db.query<{ reason: ReportReason; created_at: Date }>(
    'SELECT reason, created_at FROM reports WHERE counts AND e164 = $1 ORDER BY created_at DESC LIMIT $2',
    [e164, limit],
  );
  return rows.map((r) => ({ motivo: r.reason, data: r.created_at.toISOString() }));
}

export type ReportResult = { status: 'criada'; counts: boolean } | { status: 'duplicada' };

/**
 * Registra denúncia. Uma por dispositivo/número (HU-16). Acima do limite diário fica registrada
 * mas não pesa no score público (CA-10).
 */
export async function createReport(db: Db, deviceId: string, e164: string, reason: ReportReason, dailyLimit: number): Promise<ReportResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serializa as denúncias do mesmo dispositivo para a contagem diária ser exata.
    await client.query('SELECT 1 FROM devices WHERE id = $1 FOR UPDATE', [deviceId]);
    const { rows: [today] } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reports WHERE device_id = $1 AND counts AND created_at > now() - interval '1 day'`,
      [deviceId],
    );
    const counts = today!.n < dailyLimit;
    const ins = await client.query(
      `INSERT INTO reports (device_id, e164, reason, counts) VALUES ($1, $2, $3, $4) ON CONFLICT (device_id, e164) DO NOTHING`,
      [deviceId, e164, reason, counts],
    );
    await client.query('COMMIT');
    return ins.rowCount === 0 ? { status: 'duplicada' } : { status: 'criada', counts };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOfficialInstitution(db: Db, e164: string): Promise<string | null> {
  const { rows } = await db.query<{ institution: string }>('SELECT institution FROM official_numbers WHERE e164 = $1', [e164]);
  return rows[0]?.institution ?? null;
}

export async function getPersonalList(db: Db, deviceId: string, e164: string): Promise<'permitido' | 'bloqueado' | null> {
  const { rows } = await db.query<{ list: 'permitido' | 'bloqueado' }>('SELECT list FROM personal_lists WHERE device_id = $1 AND e164 = $2', [deviceId, e164]);
  return rows[0]?.list ?? null;
}

export async function getEngineConfig(db: Db): Promise<EngineConfig> {
  const { rows } = await db.query<{ config: Partial<EngineConfig> }>('SELECT config FROM engine_config WHERE id = 1');
  return rows[0] ? mergeConfig(rows[0].config) : DEFAULT_CONFIG;
}

/**
 * Diferenças da base desde `since` (funcionalidade 9 / CA-09): reputação atual de todo número
 * que recebeu denúncia ou saiu da janela de 7 dias no período.
 */
export async function getSyncDelta(db: Db, since: Date | null) {
  const sinceDate = since ?? new Date(0);
  const { rows: changed } = await db.query<{ e164: string }>(
    `SELECT DISTINCT e164 FROM reports
      WHERE counts AND (created_at > $1 OR (created_at + interval '7 days' > $1 AND created_at + interval '7 days' <= now()))`,
    [sinceDate],
  );
  const numbers = changed.map((r) => r.e164);
  const { rows } = numbers.length ? await db.query<ReputationRow>(REPUTATION_SQL, [numbers]) : { rows: [] as ReputationRow[] };
  const { rows: official } = await db.query<{ e164: string; institution: string }>(
    'SELECT e164, institution FROM official_numbers WHERE updated_at > $1', [sinceDate],
  );
  return {
    reputations: rows.map((r) => ({ numero: r.e164, ...toReputation(r) })),
    official: official.map((o) => ({ numero: o.e164, instituicao: o.institution })),
  };
}
