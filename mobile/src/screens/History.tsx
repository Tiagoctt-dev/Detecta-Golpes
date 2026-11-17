import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, TouchableOpacity, View } from 'react-native';
import { native, type LocalCall } from '../native';
import { api } from '../api';
import { syncAll } from '../sync';
import { ACTION_LABEL, Card, LevelBadge, T, colors, formatWhen, styles } from '../theme';

const PAGE = 30;

/**
 * Funcionalidade 8 / HU-18: histórico em ordem cronológica com número, horário, nível e motivo.
 * Toque longo permite reclassificar (CA-07: liberar número barrado).
 */
export function History({ onOpenCall }: { onOpenCall: (c: LocalCall) => void }) {
  const [items, setItems] = useState<LocalCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [end, setEnd] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const page = await native.getCalls(PAGE, 0);
    setItems(page); setEnd(page.length < PAGE); setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function more() {
    if (end || loading) return;
    const page = await native.getCalls(PAGE, items.length);
    setItems((prev) => [...prev, ...page]); setEnd(page.length < PAGE);
  }

  function reclassify(c: LocalCall) {
    Alert.alert(c.numero, 'O que era esta ligação?', [
      {
        text: 'Não era golpe (liberar)',
        onPress: async () => {
          await native.setFeedback(c.id, 'legitima');
          await native.setPersonal(c.numero, 'permitido');
          api.setList(c.numero, 'permitido').catch(() => {});
          syncAll(); reload();
        },
      },
      {
        text: 'Era golpe (denunciar)',
        onPress: async () => { await native.setFeedback(c.id, 'golpe'); syncAll(); reload(); },
      },
      {
        text: 'Bloquear sempre',
        onPress: async () => {
          await native.setPersonal(c.numero, 'bloqueado');
          api.setList(c.numero, 'bloqueado').catch(() => {});
          reload();
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={items}
      keyExtractor={(c) => String(c.id)}
      onEndReached={more}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      ListHeaderComponent={<T color={colors.muted} style={{ marginBottom: 8 }}>Toque para ver o motivo. Toque e segure para corrigir.</T>}
      ListEmptyComponent={<T color={colors.muted}>Nenhuma chamada analisada ainda.</T>}
      renderItem={({ item: c }) => (
        <TouchableOpacity onPress={() => onOpenCall(c)} onLongPress={() => reclassify(c)} accessibilityHint="Toque e segure para reclassificar">
          <Card>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <T weight="600">{c.numero}</T>
              <LevelBadge level={c.nivel} />
            </View>
            <T style={{ marginTop: 6 }}>{c.motivo}</T>
            <T size={13} color={colors.muted}>
              {ACTION_LABEL[c.acao]} · {formatWhen(c.recebidaEm)}
              {c.feedback ? ` · você disse: ${c.feedback === 'legitima' ? 'legítima' : c.feedback}` : ''}
            </T>
          </Card>
        </TouchableOpacity>
      )}
    />
  );
}
