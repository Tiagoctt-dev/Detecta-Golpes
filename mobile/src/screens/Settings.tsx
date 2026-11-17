import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, TextInput, View } from 'react-native';
import type { ProtectionLevel } from '@detecta/risk-engine';
import { api, DEFAULT_API_URL, setApiUrl } from '../api';
import { native } from '../native';
import { Button, Card, T, colors, styles } from '../theme';

const LEVELS: Array<[ProtectionLevel, string, string]> = [
  ['baixo', 'Baixa', 'Só bloqueia alto risco. Suspeitas tocam com aviso.'],
  ['medio', 'Média (recomendada)', 'Bloqueia alto risco e silencia suspeitas.'],
  ['alto', 'Alta', 'Bloqueia também as suspeitas. Pode barrar ligações legítimas.'],
];

/** HU-19 (nível de proteção) e HU-10 (modo idoso). */
export function Settings({ elderMode, onElderModeChange }: { elderMode: boolean; onElderModeChange: (v: boolean) => void }) {
  const [protection, setProtection] = useState<ProtectionLevel>('medio');
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    native.getState().then((s) => setProtection(s.protecao));
    native.getCredentials().then((c) => setUrl(c.apiUrl ?? DEFAULT_API_URL));
  }, []);

  async function save(p: ProtectionLevel, elder: boolean) {
    setProtection(p);
    onElderModeChange(elder);
    await native.setPreferences(p, elder);
    api.setPreferences(p, elder).catch(() => {});
  }

  async function saveUrl() {
    try {
      await setApiUrl(url);
      setMsg('Servidor configurado.');
    } catch (e) {
      setMsg(`Não foi possível conectar: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Card>
        <T weight="700" size={17}>Nível de proteção</T>
        {LEVELS.map(([id, label, hint]) => (
          <Button
            key={id}
            kind={protection === id ? 'primary' : 'secondary'}
            title={label}
            onPress={() => save(id, elderMode)}
          />
        ))}
        <T color={colors.muted} size={13} style={{ marginTop: 8 }}>{LEVELS.find((l) => l[0] === protection)?.[2]}</T>
      </Card>

      <Card>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <T weight="700" size={17}>Modo simples (idosos)</T>
            <T color={colors.muted} size={13}>Letras maiores, explicação lida em voz alta e bloqueio automático de números com várias denúncias.</T>
          </View>
          <Switch value={elderMode} onValueChange={(v) => save(protection, v)} accessibilityLabel="Modo simples" />
        </View>
      </Card>

      <Card>
        <T weight="700" size={17}>Servidor</T>
        <TextInput style={[styles.input, { marginTop: 8 }]} value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
        <Button kind="secondary" title="Salvar servidor" onPress={saveUrl} />
        {msg && <T size={13} style={{ marginTop: 6 }}>{msg}</T>}
      </Card>

      <Card>
        <T weight="700" size={17}>Privacidade</T>
        <T size={14} style={{ marginTop: 4 }}>
          Sua agenda nunca sai do aparelho. Enviamos apenas números desconhecidos que ligaram para você, a decisão tomada e suas denúncias,
          com a finalidade única de prevenir fraudes (LGPD, legítimo interesse).
        </T>
        <Button kind="secondary" title="Cadastrar no Não Me Perturbe" onPress={() => Linking.openURL('https://www.naomeperturbe.com.br')} />
      </Card>
    </ScrollView>
  );
}
