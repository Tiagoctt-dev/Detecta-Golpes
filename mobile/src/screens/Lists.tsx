import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { normalizeNumber } from '@detecta/risk-engine';
import { api } from '../api';
import { native, type PersonalEntry, type PersonalListKind } from '../native';
import { Button, Card, T, colors, styles, useScale } from '../theme';

/** HU-17: listas pessoais. Valem só neste aparelho e têm prioridade sobre o risco. */
export function Lists() {
  const s = useScale();
  const [items, setItems] = useState<PersonalEntry[]>([]);
  const [numero, setNumero] = useState('');
  const [rotulo, setRotulo] = useState('');

  const load = useCallback(async () => setItems(await native.getPersonal()), []);
  useEffect(() => { load(); }, [load]);

  async function add(list: PersonalListKind) {
    const e164 = await native.setPersonal(numero, list, rotulo || null);
    api.setList(e164, list, rotulo || null).catch(() => {});
    setNumero(''); setRotulo(''); load();
  }

  async function remove(n: string) {
    await native.removePersonal(n);
    api.removeList(n).catch(() => {});
    load();
  }

  const valid = !!normalizeNumber(numero).e164;
  const section = (list: PersonalListKind, title: string, hint: string) => {
    const rows = items.filter((i) => i.lista === list);
    return (
      <Card>
        <T weight="700" size={17}>{title}</T>
        <T color={colors.muted} size={13}>{hint}</T>
        {rows.length === 0 && <T color={colors.muted} style={{ marginTop: 8 }}>Vazia.</T>}
        {rows.map((r) => (
          <View key={r.numero} style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <T weight="600">{r.numero}</T>
              {r.rotulo && <T size={13} color={colors.muted}>{r.rotulo}</T>}
            </View>
            <Button kind="secondary" title="Remover" onPress={() => remove(r.numero)} style={{ marginTop: 0 }} />
          </View>
        ))}
      </Card>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Card>
        <T weight="700" size={17}>Adicionar número</T>
        <TextInput style={[styles.input, { marginTop: 8, fontSize: 16 * s, minHeight: 44 * s }]} placeholder="Número com DDD" placeholderTextColor={colors.muted} keyboardType="phone-pad" value={numero} onChangeText={setNumero} />
        <TextInput style={[styles.input, { marginTop: 8, fontSize: 16 * s, minHeight: 44 * s }]} placeholder="Apelido (opcional), ex.: Oficina" placeholderTextColor={colors.muted} value={rotulo} onChangeText={setRotulo} />
        <View style={[styles.row, { gap: 8 }]}>
          <Button title="Sempre permitir" onPress={() => add('permitido')} disabled={!valid} style={{ flex: 1 }} />
          <Button kind="danger" title="Sempre bloquear" onPress={() => add('bloqueado')} disabled={!valid} style={{ flex: 1 }} />
        </View>
      </Card>
      {section('permitido', 'Permitidos', 'Tocam normalmente, mesmo que outras pessoas tenham denunciado.')}
      {section('bloqueado', 'Bloqueados', 'Nunca tocam. Continuam aparecendo no histórico.')}
    </ScrollView>
  );
}
