import { native } from './native';
import type { ReportReason, RiskLevel } from '@detecta/risk-engine';

/** Emulador Android enxerga o host em 10.0.2.2. Em aparelho real, ajuste em Configurações. */
export const DEFAULT_API_URL = 'http://10.0.2.2:3000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let creds: { apiUrl: string; token: string | null } | null = null;

async function credentials() {
  if (!creds) {
    const c = await native.getCredentials();
    creds = { apiUrl: c.apiUrl ?? DEFAULT_API_URL, token: c.token };
  }
  return creds;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const c = await credentials();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && c.token) headers.Authorization = `Bearer ${c.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(c.apiUrl.replace(/\/$/, '') + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, json?.erro ?? `Erro ${res.status}`);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Registra o aparelho de forma anônima (uma vez) e configura o lado nativo. */
export async function ensureRegistered(apiUrl?: string): Promise<void> {
  const c = await credentials();
  const url = apiUrl ?? c.apiUrl;
  if (c.token && url === c.apiUrl) {
    await native.configure(url, c.token);
    return;
  }
  creds = { apiUrl: url, token: null };
  const { token } = await request<{ dispositivoId: string; token: string }>('POST', '/dispositivos', undefined, false);
  creds = { apiUrl: url, token };
  await native.configure(url, token);
}

export async function setApiUrl(url: string) {
  await ensureRegistered(url.trim());
}

export interface RemoteReputation {
  numero: string;
  uf: string | null;
  nivel: RiskLevel;
  motivo: string;
  totalDenuncias: number;
  denuncias7d: number;
  motivoPredominante: ReportReason | null;
  instituicaoOficial: string | null;
}

export const api = {
  reputation: (numero: string) => request<RemoteReputation>('GET', `/reputacao/${encodeURIComponent(numero)}`),
  report: (numero: string, motivo: ReportReason) => request<{ contabilizada: boolean }>('POST', '/denuncias', { numero, motivo }),
  sync: (desde?: string | null) => request<Record<string, unknown>>('GET', `/sync${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`),
  logCall: (c: { numero: string; nivel: string; acao: string; motivo: string; codigoMotivo: string; latenciaMs: number; recebidaEm: string }) =>
    request<{ id: number }>('POST', '/chamadas', c),
  feedback: (serverId: number, resposta: string) => request('POST', `/chamadas/${serverId}/feedback`, { resposta }),
  setPreferences: (protecao: string, modoIdoso: boolean) => request('PUT', '/preferencias', { protecao, modoIdoso }),
  setList: (numero: string, lista: string, rotulo?: string | null) =>
    request('PUT', `/listas/${encodeURIComponent(numero)}`, { lista, rotulo: rotulo ?? undefined }),
  removeList: (numero: string) => request('DELETE', `/listas/${encodeURIComponent(numero)}`),
};
