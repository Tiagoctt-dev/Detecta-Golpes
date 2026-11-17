/**
 * Semente para desenvolvimento e piloto: números oficiais de bancos (HU-07) e configuração do motor.
 * Os números de bancos abaixo são canais de atendimento públicos; confira antes do piloto (job KAN-89).
 */
import { DEFAULT_CONFIG, normalizeNumber } from '@detecta/risk-engine';
import { createPool, migrate } from './db.js';

const OFFICIAL: Array<[string, string]> = [
  ['4004 0001', 'Banco do Brasil'],
  ['0800 729 0001', 'Banco do Brasil'],
  ['0800 726 0101', 'Caixa'],
  ['0800 727 9933', 'Itaú'],
  ['0800 704 8383', 'Bradesco'],
  ['4004 3535', 'Santander'],
  ['0800 762 7777', 'Santander'],
  ['0800 591 2117', 'Nubank'],
];

const db = createPool();
await migrate(db, console.log);
await db.query(
  `INSERT INTO engine_config (id, config) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
  [JSON.stringify(DEFAULT_CONFIG)],
);
let n = 0;
for (const [raw, inst] of OFFICIAL) {
  const e164 = normalizeNumber(raw).e164;
  if (!e164) throw new Error(`número oficial inválido: ${raw}`);
  const r = await db.query(
    `INSERT INTO official_numbers (e164, institution) VALUES ($1, $2) ON CONFLICT (e164) DO NOTHING`, [e164, inst]);
  n += r.rowCount ?? 0;
}
console.log(`seed ok: ${n} números oficiais`);
await db.end();
