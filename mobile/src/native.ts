import { NativeModules } from 'react-native';
import type { CallAction, RiskLevel, ProtectionLevel } from '@detecta/risk-engine';

/** Ponte com o módulo Kotlin (android/app/.../bridge/DetectaModule.kt). */
const N = NativeModules.DetectaNative as {
  isScreeningEnabled(): Promise<boolean>;
  requestScreeningRole(): Promise<boolean>;
  hasNotificationPermission(): Promise<boolean>;
  configure(apiUrl: string, token: string): Promise<boolean>;
  getCredentials(): Promise<string>;
  setPreferences(protection: ProtectionLevel, elderMode: boolean): Promise<boolean>;
  getState(): Promise<string>;
  syncNow(): Promise<number>;
  applySync(json: string): Promise<boolean>;
  analyze(raw: string): Promise<string>;
  setPersonal(number: string, list: PersonalListKind, label: string | null): Promise<string>;
  removePersonal(number: string): Promise<boolean>;
  getPersonal(): Promise<string>;
  getCalls(limit: number, offset: number): Promise<string>;
  getPendingFeedback(): Promise<string | null>;
  setFeedback(id: number, feedback: Feedback | null): Promise<boolean>;
  getUnsynced(): Promise<string>;
  markSynced(id: number, serverId: number, feedbackSynced: boolean): Promise<boolean>;
  speak(text: string): void;
  stopSpeaking(): void;
};

export type PersonalListKind = 'permitido' | 'bloqueado';
export type Feedback = 'golpe' | 'telemarketing' | 'legitima';

export interface LocalCall {
  id: number;
  numero: string;
  bruto: string;
  nivel: RiskLevel;
  acao: CallAction;
  motivo: string;
  codigoMotivo: string;
  latenciaMs: number;
  recebidaEm: number;
  pedirFeedback: boolean;
  feedback: Feedback | null;
  servidorId: number | null;
}

export interface LocalState {
  protecao: ProtectionLevel;
  modoIdoso: boolean;
  ultimaSincronizacao: string | null;
  numerosNaBase: number;
  triagemAtiva: boolean;
}

export interface LocalAnalysis {
  numero: string | null;
  nivel: RiskLevel;
  acao: CallAction;
  motivo: string;
  codigoMotivo: string;
  uf: string | null;
}

export interface PersonalEntry {
  numero: string;
  lista: PersonalListKind;
  rotulo: string | null;
  criadoEm: number;
}

export interface UnsyncedCall {
  id: number;
  numero: string;
  nivel: RiskLevel;
  acao: CallAction;
  motivo: string;
  codigoMotivo: string;
  latenciaMs: number;
  recebidaEm: number;
  feedback: Feedback | null;
  servidorId: number | null;
}

export const native = {
  isScreeningEnabled: () => N.isScreeningEnabled(),
  requestScreeningRole: () => N.requestScreeningRole(),
  hasNotificationPermission: () => N.hasNotificationPermission(),
  configure: (apiUrl: string, token: string) => N.configure(apiUrl, token),
  getCredentials: async () => JSON.parse(await N.getCredentials()) as { apiUrl: string | null; token: string | null },
  setPreferences: (p: ProtectionLevel, elder: boolean) => N.setPreferences(p, elder),
  getState: async () => JSON.parse(await N.getState()) as LocalState,
  syncNow: () => N.syncNow(),
  applySync: (payload: unknown) => N.applySync(JSON.stringify(payload)),
  analyze: async (raw: string) => JSON.parse(await N.analyze(raw)) as LocalAnalysis,
  setPersonal: (n: string, l: PersonalListKind, label: string | null = null) => N.setPersonal(n, l, label),
  removePersonal: (n: string) => N.removePersonal(n),
  getPersonal: async () => JSON.parse(await N.getPersonal()) as PersonalEntry[],
  getCalls: async (limit = 50, offset = 0) => JSON.parse(await N.getCalls(limit, offset)) as LocalCall[],
  getPendingFeedback: async () => {
    const s = await N.getPendingFeedback();
    return s ? (JSON.parse(s) as LocalCall) : null;
  },
  setFeedback: (id: number, f: Feedback | null) => N.setFeedback(id, f),
  getUnsynced: async () => JSON.parse(await N.getUnsynced()) as UnsyncedCall[],
  markSynced: (id: number, serverId: number | null, feedbackSynced: boolean) => N.markSynced(id, serverId ?? 0, feedbackSynced),
  speak: (t: string) => N.speak(t),
  stopSpeaking: () => N.stopSpeaking(),
};
