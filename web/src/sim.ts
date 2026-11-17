import {
  analyzeCall, normalizeNumber, DEFAULT_CONFIG,
  type Analysis, type OriginVerification, type ProtectionLevel, type ReportReason, type Reputation,
} from '@detecta/risk-engine';

/**
 * Simulador da demonstração. Faz o papel do servidor (base coletiva de denúncias) e do aparelho
 * (listas, preferências, histórico). As decisões vêm do mesmo motor usado no app Android.
 */

export type Feedback = 'golpe' | 'telemarketing' | 'legitima';

export interface CallRecord {
  id: number;
  numero: string;
  exibido: string;
  analysis: Analysis;
  latencyMs: number;
  at: number;
  feedback: Feedback | null;
  feedbackDismissed: boolean;
}

export interface SimState {
  onboarded: boolean;
  /** Reputação coletiva por número E.164 (o que vem do servidor na sincronização). */
  reputations: Record<string, Reputation>;
  official: Record<string, string>;
  personal: Record<string, 'permitido' | 'bloqueado'>;
  /** Números que ESTE aparelho já denunciou (1 por aparelho, HU-16). */
  myReports: Record<string, true>;
  protection: ProtectionLevel;
  elderMode: boolean;
  calls: CallRecord[];
  nextId: number;
}

export function initialState(): SimState {
  const now = new Date().toISOString();
  return {
    onboarded: false,
    reputations: {
      '+5511912340001': { reports7d: 31, reportsTotal: 34, lastReportAt: now, predominantReason: 'falso_banco' },
      '+5521912340002': { reports7d: 2, reportsTotal: 2, lastReportAt: now, predominantReason: 'golpe' },
      '+5562988887777': { reports7d: 4, reportsTotal: 9, lastReportAt: now, predominantReason: 'cobranca_indevida' },
    },
    official: { '40040001': 'Banco do Brasil', '08007290001': 'Banco do Brasil', '08007279933': 'Itaú' },
    personal: {},
    myReports: {},
    protection: 'medio',
    elderMode: false,
    calls: [],
    nextId: 1,
  };
}

export interface IncomingCall {
  raw: string;
  verification?: OriginVerification;
  isContact?: boolean;
  contactName?: string;
}

export function analyze(state: SimState, call: IncomingCall): { analysis: Analysis; latencyMs: number } {
  const e164 = normalizeNumber(call.raw).e164;
  const t0 = performance.now();
  const analysis = analyzeCall({
    rawNumber: call.raw,
    isContact: call.isContact,
    verification: call.verification,
    reputation: e164 ? state.reputations[e164] ?? null : null,
    officialBank: e164 ? state.official[e164] ?? null : null,
    personalList: e164 ? state.personal[e164] ?? null : null,
    protection: state.protection,
    elderMode: state.elderMode,
  }, DEFAULT_CONFIG);
  return { analysis, latencyMs: performance.now() - t0 };
}

export function recordCall(state: SimState, call: IncomingCall, analysis: Analysis, latencyMs: number): SimState {
  if (!analysis.record) return state;
  const rec: CallRecord = {
    id: state.nextId,
    numero: analysis.number.e164 ?? (call.raw || 'Número oculto'),
    exibido: formatNumber(analysis.number.e164 ?? call.raw),
    analysis, latencyMs, at: Date.now(), feedback: null, feedbackDismissed: !analysis.askFeedback,
  };
  return { ...state, calls: [rec, ...state.calls], nextId: state.nextId + 1 };
}

/** Uma denúncia de outro usuário da comunidade (efeito de rede, CA-09). */
export function communityReports(state: SimState, raw: string, count: number, reason: ReportReason): SimState {
  const e164 = normalizeNumber(raw).e164;
  if (!e164) return state;
  const cur = state.reputations[e164] ?? { reports7d: 0, reportsTotal: 0, predominantReason: null };
  return {
    ...state,
    reputations: {
      ...state.reputations,
      [e164]: {
        reports7d: cur.reports7d + count,
        reportsTotal: cur.reportsTotal + count,
        lastReportAt: new Date().toISOString(),
        predominantReason: cur.predominantReason ?? reason,
      },
    },
  };
}

export type ReportOutcome = 'criada' | 'duplicada' | 'invalida';

/** Denúncia feita por este aparelho. */
export function myReport(state: SimState, raw: string, reason: ReportReason): [SimState, ReportOutcome] {
  const e164 = normalizeNumber(raw).e164;
  if (!e164) return [state, 'invalida'];
  if (state.myReports[e164]) return [state, 'duplicada'];
  const next = communityReports(state, e164, 1, reason);
  return [{ ...next, myReports: { ...next.myReports, [e164]: true } }, 'criada'];
}

export function setFeedback(state: SimState, id: number, f: Feedback | null): SimState {
  const call = state.calls.find((c) => c.id === id);
  if (!call) return state;
  let next: SimState = {
    ...state,
    calls: state.calls.map((c) => (c.id === id ? { ...c, feedback: f, feedbackDismissed: true } : c)),
  };
  if (f === 'legitima') next = setPersonal(next, call.numero, 'permitido');
  if (f === 'golpe' || f === 'telemarketing') next = myReport(next, call.numero, f)[0];
  return next;
}

export function setPersonal(state: SimState, raw: string, list: 'permitido' | 'bloqueado' | null): SimState {
  const e164 = normalizeNumber(raw).e164;
  if (!e164) return state;
  const personal = { ...state.personal };
  if (list) personal[e164] = list; else delete personal[e164];
  return { ...state, personal };
}

export function pendingFeedback(state: SimState): CallRecord | null {
  return state.calls.find((c) => !c.feedbackDismissed && c.feedback === null) ?? null;
}

export function formatNumber(n: string): string {
  const d = n.replace(/\D/g, '');
  if (n.startsWith('+55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (n.startsWith('+55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  if (/^0303\d{7}$/.test(d) || /^0800\d{7}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^[34]00\d{5}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return n || 'Número oculto';
}

const KEY = 'detecta-demo-v1';
export function load(): SimState | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as SimState) : null;
  } catch {
    return null;
  }
}
export function save(s: SimState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* demonstração funciona sem armazenamento */ }
}
