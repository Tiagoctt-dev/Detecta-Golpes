import { normalizeNumber, type NormalizedNumber } from './phone.js';
import { DEFAULT_CONFIG, type EngineConfig } from './config.js';

/** D-09: quatro níveis de risco. */
export type RiskLevel = 'baixo' | 'moderado' | 'suspeito' | 'alto';
/** Ação devolvida ao CallScreeningService. */
export type CallAction = 'permitir' | 'silenciar' | 'bloquear';
/** HU-19: nível de proteção escolhido pelo usuário. */
export type ProtectionLevel = 'baixo' | 'medio' | 'alto';
/** Autenticação de origem da operadora (Origem Verificada / STIR-SHAKEN). */
export type OriginVerification = 'aprovada' | 'falhou' | 'nao_verificada';
/** Motivos de denúncia (HU-16) e de feedback pós-chamada. */
export type ReportReason = 'golpe' | 'falso_banco' | 'telemarketing' | 'cobranca_indevida';

/** Reputação coletiva de um número (o que a base local/servidor guarda). */
export interface Reputation {
  /** Denúncias de dispositivos distintos nos últimos 7 dias (já descontando as excedentes do limite diário, CA-10). */
  reports7d: number;
  /** Denúncias válidas no total. */
  reportsTotal: number;
  /** Data ISO da última denúncia. */
  lastReportAt?: string | null;
  /** Motivo predominante das denúncias. */
  predominantReason?: ReportReason | null;
}

export interface CallContext {
  /** Número como chegou do sistema. */
  rawNumber: string;
  /** Está na agenda do aparelho (verificação feita localmente, nunca enviada ao servidor). */
  isContact?: boolean;
  verification?: OriginVerification;
  reputation?: Reputation | null;
  /** Número consta na base de números oficiais de bancos (HU-07). */
  officialBank?: string | null;
  personalList?: 'permitido' | 'bloqueado' | null;
  protection?: ProtectionLevel;
  /** HU-10: modo idoso bloqueia automaticamente números muito denunciados. */
  elderMode?: boolean;
  /** Fuso do aparelho não importa: chamada internacional é sempre "inesperada" no MVP. */
}

export type SignalId =
  | 'denuncias_recentes'
  | 'denuncias_antigas'
  | 'falha_autenticacao'
  | 'prefixo_0303'
  | 'faixa_nao_alocada'
  | 'ddd_inexistente'
  | 'internacional'
  | 'numero_invalido'
  | 'origem_autenticada'
  | 'banco_oficial';

export interface Signal {
  id: SignalId;
  weight: number;
}

export interface Analysis {
  number: NormalizedNumber;
  /** 0..100. Nunca deve ser exibido ao usuário (CA-06). */
  score: number;
  level: RiskLevel;
  action: CallAction;
  /** Frase curta (até 60 caracteres) em linguagem comum (funcionalidade 6). */
  reason: string;
  /** Sinal que originou a frase. */
  reasonCode: SignalId | 'contato' | 'lista_permitidos' | 'lista_bloqueados' | 'sem_historico' | 'modo_idoso';
  signals: Signal[];
  /** Se a chamada deve aparecer no histórico e gerar notificação (D-10). Contatos não são registrados (CA-02). */
  record: boolean;
  /** Mostrar card de feedback pós-chamada (CA-08). */
  askFeedback: boolean;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Calcula os sinais presentes e seus pesos. */
export function collectSignals(num: NormalizedNumber, ctx: CallContext, cfg: EngineConfig = DEFAULT_CONFIG): Signal[] {
  const w = cfg.weights;
  const s: Signal[] = [];
  const rep = ctx.reputation;
  if (rep && rep.reports7d > 0) {
    s.push({ id: 'denuncias_recentes', weight: Math.min(w.recentMax, w.recentFirst + w.recentEach * (rep.reports7d - 1)) });
  }
  const older = rep ? Math.max(0, rep.reportsTotal - rep.reports7d) : 0;
  if (older > 0) s.push({ id: 'denuncias_antigas', weight: Math.min(w.olderMax, older * w.olderEach) });
  if (ctx.verification === 'falhou') s.push({ id: 'falha_autenticacao', weight: w.verificationFailed });
  if (ctx.verification === 'aprovada') s.push({ id: 'origem_autenticada', weight: -w.verificationApproved });
  if (ctx.officialBank) s.push({ id: 'banco_oficial', weight: -w.officialBank });
  switch (num.kind) {
    case 'telemarketing_0303': s.push({ id: 'prefixo_0303', weight: w.prefix0303 }); break;
    case 'internacional': s.push({ id: 'internacional', weight: w.international }); break;
    case 'desconhecido': s.push({ id: 'numero_invalido', weight: w.invalidNumber }); break;
    default: break;
  }
  if (num.invalidDdd) s.push({ id: 'ddd_inexistente', weight: w.invalidDdd });
  else if (num.unallocatedRange) s.push({ id: 'faixa_nao_alocada', weight: w.unallocatedRange });
  return s;
}

export function scoreToLevel(score: number, cfg: EngineConfig = DEFAULT_CONFIG): Exclude<RiskLevel, 'baixo'> {
  if (score >= cfg.thresholds.alto) return 'alto';
  if (score >= cfg.thresholds.suspeito) return 'suspeito';
  return 'moderado';
}

/** Ação para cada nível, ajustada pelo nível de proteção (HU-19). */
export function actionFor(level: RiskLevel, protection: ProtectionLevel = 'medio'): CallAction {
  if (level === 'alto') return 'bloquear';
  if (level === 'suspeito') {
    if (protection === 'alto') return 'bloquear';
    if (protection === 'baixo') return 'permitir';
    return 'silenciar';
  }
  return 'permitir';
}

const POSITIVE_REASONS: Partial<Record<SignalId, string>> = {
  origem_autenticada: 'Origem confirmada pela operadora',
};

/** Frase (≤ 60 caracteres) para o sinal de maior peso. Sem jargão e sem pontuação (CA-06). */
export function reasonFor(signal: SignalId, ctx: CallContext): string {
  const rep = ctx.reputation;
  switch (signal) {
    case 'denuncias_recentes':
    case 'denuncias_antigas': {
      const n = signal === 'denuncias_recentes' ? rep?.reports7d ?? 0 : rep?.reportsTotal ?? 0;
      const who = n === 1 ? '1 pessoa' : `${n} pessoas`;
      const denounced = n === 1 ? '1 pessoa denunciou' : `${n} pessoas denunciaram`;
      switch (rep?.predominantReason) {
        case 'falso_banco': return `Possível falso banco: ${denounced}`;
        case 'telemarketing': return `Telemarketing denunciado por ${who}`;
        case 'cobranca_indevida': return `Cobrança indevida denunciada por ${who}`;
        default: return signal === 'denuncias_recentes'
          ? `${denounced} como golpe esta semana`
          : `${denounced} como golpe`;
      }
    }
    case 'falha_autenticacao': return 'A operadora não confirmou a origem: pode ser falso';
    case 'prefixo_0303': return 'Telemarketing (prefixo 0303)';
    case 'faixa_nao_alocada': return 'Número com formato estranho';
    case 'ddd_inexistente': return 'O código de área (DDD) não existe';
    case 'internacional': return 'Ligação do exterior inesperada';
    case 'numero_invalido': return 'Número oculto ou inválido';
    case 'origem_autenticada': return POSITIVE_REASONS.origem_autenticada!;
    case 'banco_oficial': return `Número oficial do ${ctx.officialBank ?? 'banco'}`;
  }
}

/**
 * Analisa uma chamada recebida. Função pura, sem I/O: roda no aparelho em poucos milissegundos (CA-03, D-12).
 */
export function analyzeCall(ctx: CallContext, cfg: EngineConfig = DEFAULT_CONFIG): Analysis {
  const num = normalizeNumber(ctx.rawNumber);
  const protection = ctx.protection ?? 'medio';

  // CA-02: contato salvo nunca sofre interferência nem é registrado.
  if (ctx.isContact) {
    return { number: num, score: 0, level: 'baixo', action: 'permitir', reason: 'Contato da sua agenda', reasonCode: 'contato', signals: [], record: false, askFeedback: false };
  }

  const signals = collectSignals(num, ctx, cfg);
  const score = clamp(signals.reduce((a, s) => a + s.weight, 0));
  const negative = signals.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight);
  const positive = signals.filter((s) => s.weight < 0).sort((a, b) => a.weight - b.weight);

  // Lista pessoal tem prioridade sobre a classificação (HU-17), mas só vale neste aparelho.
  if (ctx.personalList === 'permitido') {
    return { number: num, score, level: 'baixo', action: 'permitir', reason: 'Permitido por você', reasonCode: 'lista_permitidos', signals, record: true, askFeedback: false };
  }
  if (ctx.personalList === 'bloqueado') {
    return { number: num, score, level: 'alto', action: 'bloquear', reason: 'Bloqueado por você', reasonCode: 'lista_bloqueados', signals, record: true, askFeedback: false };
  }

  const reports7d = ctx.reputation?.reports7d ?? 0;
  let level: RiskLevel;
  // CA-05: 30+ denúncias nos últimos 7 dias = alto risco, independentemente dos demais sinais.
  if (reports7d >= cfg.forceHighReports7d) level = 'alto';
  else if (negative.length === 0 && positive.length > 0) level = 'baixo';
  else level = scoreToLevel(score, cfg);

  let reasonCode: Analysis['reasonCode'];
  let reason: string;
  if (negative.length > 0 && level !== 'baixo') {
    reasonCode = negative[0]!.id;
    reason = reasonFor(negative[0]!.id, ctx);
  } else if (positive.length > 0) {
    reasonCode = positive[0]!.id;
    reason = reasonFor(positive[0]!.id, ctx);
  } else {
    reasonCode = 'sem_historico';
    reason = 'Número desconhecido, ainda sem histórico';
  }

  let action = actionFor(level, protection);
  // HU-10: no modo idoso, números com muitas denúncias são bloqueados automaticamente.
  if (ctx.elderMode && level !== 'baixo' && (ctx.reputation?.reportsTotal ?? 0) >= cfg.elderModeBlockReports) {
    action = 'bloquear';
    if (level !== 'alto') { level = 'alto'; reasonCode = 'modo_idoso'; }
  }

  return { number: num, score, level, action, reason: reason.slice(0, 60), reasonCode, signals, record: true, askFeedback: true };
}
