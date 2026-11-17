import { api, ApiError, ensureRegistered } from './api';
import { native } from './native';

/**
 * Sincronização ao abrir o app (funcionalidade 9): baixa a base, envia o registro das chamadas
 * e o feedback pendente. Falhas são silenciosas: tenta de novo na próxima vez.
 */
export async function syncAll(): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureRegistered();
    await native.syncNow();
    const pending = await native.getUnsynced();
    for (const c of pending) {
      let serverId = c.servidorId;
      if (serverId == null) {
        serverId = (await api.logCall({
          numero: c.numero, nivel: c.nivel, acao: c.acao, motivo: c.motivo, codigoMotivo: c.codigoMotivo,
          latenciaMs: c.latenciaMs, recebidaEm: new Date(c.recebidaEm).toISOString(),
        })).id;
      }
      let feedbackSynced = false;
      if (c.feedback) {
        try {
          await api.feedback(serverId, c.feedback);
        } catch (e) {
          // 409 = já denunciado antes; conta como enviado.
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
        feedbackSynced = true;
      }
      await native.markSynced(c.id, serverId, feedbackSynced);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
