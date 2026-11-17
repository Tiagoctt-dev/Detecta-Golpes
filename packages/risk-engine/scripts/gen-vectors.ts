/**
 * Gera vetores de teste a partir do motor TS para verificar que o porte em Kotlin
 * (mobile/android/.../engine/RiskEngine.kt) produz exatamente o mesmo resultado.
 * Uso: npm run vectors -w @detecta/risk-engine
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCall, type CallContext, type ReportReason } from '../src/index.js';

const numbers = [
  '+55 11 98765-4321', '(11) 98765-4321', '011 98765 4321', '0 21 11 98765-4321', '1133334444', '11187654321',
  '2098765-4321', '61 99999 0000', '0303 123 4567', '0800 123 4567', '4004 0001', '+1 415 555 0100',
  '0044 20 7946 0958', '98765-4321', '', 'privado', '+55 99 3333 4444', '+351 912 345 678',
];
const reputations: Array<CallContext['reputation']> = [
  null,
  { reports7d: 0, reportsTotal: 3 },
  { reports7d: 1, reportsTotal: 1, predominantReason: 'golpe' },
  { reports7d: 2, reportsTotal: 6, predominantReason: 'telemarketing' },
  { reports7d: 12, reportsTotal: 12, predominantReason: 'falso_banco' },
  { reports7d: 30, reportsTotal: 45, predominantReason: 'cobranca_indevida' },
  { reports7d: 1, reportsTotal: 20, predominantReason: 'falso_banco' },
];
const verifications = [undefined, 'aprovada', 'falhou', 'nao_verificada'] as const;
const protections = ['baixo', 'medio', 'alto'] as const;

const vectors: unknown[] = [];
for (const rawNumber of numbers) {
  for (const reputation of reputations) {
    for (const verification of verifications) {
      for (const protection of protections) {
        for (const elderMode of [false, true]) {
          const ctx: CallContext = { rawNumber, reputation, verification, protection, elderMode };
          const a = analyzeCall(ctx);
          vectors.push({
            input: { ...ctx, reputation: reputation ? { ...reputation, predominantReason: reputation.predominantReason ?? null } : null },
            expected: { e164: a.number.e164, kind: a.number.kind, uf: a.number.uf, score: a.score, level: a.level, action: a.action, reason: a.reason, reasonCode: a.reasonCode },
          });
        }
      }
    }
  }
}
// Casos especiais: contato, listas e banco oficial
const special: CallContext[] = [
  { rawNumber: '+5511987654321', isContact: true, reputation: { reports7d: 99, reportsTotal: 99 } },
  { rawNumber: '+5511987654321', personalList: 'permitido', reputation: { reports7d: 50, reportsTotal: 50 } },
  { rawNumber: '+5511987654321', personalList: 'bloqueado' },
  { rawNumber: '4004 0001', officialBank: 'Banco do Brasil' },
  { rawNumber: '0800 729 0001', officialBank: 'Banco do Brasil', reputation: { reports7d: 1, reportsTotal: 1, predominantReason: 'falso_banco' as ReportReason } },
];
for (const ctx of special) {
  const a = analyzeCall(ctx);
  vectors.push({
    input: { ...ctx, reputation: ctx.reputation ? { ...ctx.reputation, predominantReason: ctx.reputation.predominantReason ?? null } : null },
    expected: { e164: a.number.e164, kind: a.number.kind, uf: a.number.uf, score: a.score, level: a.level, action: a.action, reason: a.reason, reasonCode: a.reasonCode },
  });
}

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../mobile/android/app/src/test/resources/engine-vectors.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(vectors));
console.log(`${vectors.length} vetores gravados em ${out}`);
