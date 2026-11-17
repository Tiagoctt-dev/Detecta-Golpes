import React, { useCallback, useEffect, useState } from 'react';
import { AppState, RefreshControl, ScrollView, View } from 'react-native';
import { native, type Feedback, type LocalCall, type LocalState } from '../native';
import { syncAll } from '../sync';
import { ACTION_LABEL, Button, Card, LevelBadge, T, colors, formatWhen, styles } from '../theme';

/** Tela inicial: estado da proteção + card de feedback pós-chamada (CA-08). */
export function Home({ onOpenCall, onEnableScreening }: { onOpenCall: (c: LocalCall) => void; onEnableScreening: () => void }) {
  const [state, setState] = useState<LocalState | null>(null);
  const [pending, setPending] = useState<LocalCall | null>(null);
  const [recent, setRecent] = useState<LocalCall[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p, r] = await Promise.all([native.getState(), native.getPendingFeedback(), native.getCalls(3, 0)]);
    setState(s); setPending(p); setRecent(r);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    const res = await syncAll();
    setSyncError(res.ok ? null : res.error ?? 'Falha ao sincronizar');
    await load();
    setSyncing(false);
  }, [load]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [refresh, load]);

  async function answer(f: Feedback | null) {
    if (!pending) return;
    await native.setFeedback(pending.id, f);
    if (f === 'legitima') await native.setPersonal(pending.numero, 'permitido');
    setPending(null);
    syncAll().then(load);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} />}>
      {state && !state.triagemAtiva && (
        <Card style={{ borderColor: colors.danger }}>
          <T weight="700" color={colors.danger}>Proteção desligada</T>
          <T style={{ marginTop: 4 }}>O app ainda não está escolhido como identificador de chamadas.</T>
          <Button title="Ativar agora" onPress={onEnableScreening} />
        </Card>
      )}

      {state?.triagemAtiva && (
        <Card style={{ borderColor: colors.ok }}>
          <T weight="700" size={18} color={colors.ok}>Você está protegido</T>
          <T color={colors.muted} style={{ marginTop: 4 }}>
            {state.numerosNaBase} números denunciados na base do aparelho
            {state.ultimaSincronizacao ? ` · atualizada ${formatWhen(Date.parse(state.ultimaSincronizacao))}` : ''}
          </T>
          {syncError && <T size={13} color={colors.muted} style={{ marginTop: 4 }}>Sem conexão com o servidor agora. A proteção continua funcionando com a base do aparelho.</T>}
        </Card>
      )}

      {pending && (
        <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
          <T weight="700" size={17}>Como foi a ligação de {pending.numero}?</T>
          <T color={colors.muted} style={{ marginTop: 2 }}>{formatWhen(pending.recebidaEm)} · sua resposta protege outras pessoas</T>
          <Button kind="danger" title="Era golpe" onPress={() => answer('golpe')} />
          <Button kind="secondary" title="Era telemarketing" onPress={() => answer('telemarketing')} />
          <Button kind="secondary" title="Era legítima" onPress={() => answer('legitima')} />
          <Button kind="secondary" title="Não sei / não atendi" onPress={() => answer(null)} style={{ borderColor: colors.border }} />
        </Card>
      )}

      <T weight="700" size={17} style={{ marginVertical: 8 }}>Últimas chamadas analisadas</T>
      {recent.length === 0 && <T color={colors.muted}>Nenhuma chamada desconhecida ainda.</T>}
      {recent.map((c) => (
        <Card key={c.id}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <T weight="600">{c.numero}</T>
            <LevelBadge level={c.nivel} />
          </View>
          <T style={{ marginTop: 6 }}>{c.motivo}</T>
          <T size={13} color={colors.muted}>{ACTION_LABEL[c.acao]} · {formatWhen(c.recebidaEm)}</T>
          {(c.nivel === 'alto' || c.nivel === 'suspeito') && <Button kind="secondary" title="Entender o alerta" onPress={() => onOpenCall(c)} />}
        </Card>
      ))}
    </ScrollView>
  );
}
