/**
 * Pesos e limiares do motor de regras (funcionalidade 4).
 * Ficam em configuração e são baixados do servidor na sincronização,
 * para serem ajustados sem publicar nova versão do app.
 */
export interface EngineConfig {
  version: number;
  weights: {
    /** Peso da 1ª denúncia recente (7 dias). */
    recentFirst: number;
    /** Acréscimo por denúncia recente adicional. */
    recentEach: number;
    recentMax: number;
    /** Peso por denúncia antiga (decaimento: valem menos que as recentes). */
    olderEach: number;
    olderMax: number;
    verificationFailed: number;
    /** Subtraído quando a operadora autentica a origem. */
    verificationApproved: number;
    /** Subtraído quando é número oficial de banco. */
    officialBank: number;
    prefix0303: number;
    unallocatedRange: number;
    invalidDdd: number;
    international: number;
    invalidNumber: number;
  };
  thresholds: { suspeito: number; alto: number };
  /** CA-05 */
  forceHighReports7d: number;
  /** HU-10 */
  elderModeBlockReports: number;
}

export const DEFAULT_CONFIG: EngineConfig = Object.freeze({
  version: 1,
  weights: {
    recentFirst: 25,
    recentEach: 5,
    recentMax: 70,
    olderEach: 2,
    olderMax: 15,
    verificationFailed: 60,
    verificationApproved: 30,
    officialBank: 50,
    prefix0303: 30,
    unallocatedRange: 25,
    invalidDdd: 25,
    international: 20,
    invalidNumber: 20,
  },
  thresholds: { suspeito: 20, alto: 60 },
  forceHighReports7d: 30,
  elderModeBlockReports: 5,
}) as EngineConfig;

/** Mescla uma configuração parcial (vinda do servidor) sobre a padrão. */
export function mergeConfig(partial?: Partial<EngineConfig> | null): EngineConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    weights: { ...DEFAULT_CONFIG.weights, ...(partial.weights ?? {}) },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(partial.thresholds ?? {}) },
  };
}
