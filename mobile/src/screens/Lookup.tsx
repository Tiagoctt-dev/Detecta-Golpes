import React, { useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import { normalizeNumber, type ReportReason } from '@detecta/risk-engine';
import { api, ApiError, type RemoteReputation } from '../api';
import { native, type LocalAnalysis } from '../native';
import { Button, Card, LevelBadge, T, colors, styles, useScale } from '../theme';

const REASONS: Array<[ReportReason, string]> = [
  ['golpe', 'Golpe'],
  ['falso_banco', 'Falso funcionário de banco'],
  ['telemarketing', 'Telemarketing'],
  ['cobranca_indevida', 'Cobrança indevida'],
];

/** HU-20: consulta manual de reputação + HU-16: denunciar número. */
export function Lookup() {
  const s = useScale();
  const [input, setInput] = useState('');
  const [remote, setRemote] = useState<RemoteReputation | null>(null);
  const [local, setLocal] = useState<LocalAnalysis | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = !!normalizeNumber(input).e164;

  async function search() {
    setBusy(true); setMsg(null); setRemote(null); setLocal(null);
    try {
      setLocal(await native.analyze(input));
      setRemote(await api.reputation(input));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Sem conexão: mostrando apenas a base do aparelho.');
    } finally {
      setBusy(false);
    }
  }

  function report() {
    Alert.alert('Denunciar número', 'Qual foi o problema?', [
      ...REASONS.map(([id, label]) => ({
        text: label,
        onPress: async () => {
          try {
            const r = await api.report(input, id);
            setMsg(r.contabilizada ? 'Obrigado! Sua denúncia já protege outras pessoas.' : 'Denúncia registrada.');
            setRemote(await api.reputation(input));
          } catch (e) {
            setMsg(e instanceof ApiError ? e.message : 'Sem conexão. Tente de novo mais tarde.');
          }
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  const shown = remote ?? (local && { nivel: local.nivel, motivo: local.motivo, totalDenuncias: null, uf: local.uf });

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <T weight="700" size={18}>Consultar um número</T>
      <T color={colors.muted} style={{ marginBottom: 8 }}>Recebeu um número por mensagem? Veja a reputação antes de ligar de volta.</T>
      <TextInput
        style={[styles.input, { fontSize: 18 * s, minHeight: 48 * s }]}
        placeholder="(11) 98765-4321"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        value={input}
        onChangeText={setInput}
        onSubmitEditing={search}
      />
      <Button title={busy ? 'Consultando...' : 'Consultar'} onPress={search} disabled={!valid || busy} />
      {!valid && input.length > 6 && <T color={colors.danger} size={13} style={{ marginTop: 4 }}>Número inválido. Inclua o DDD.</T>}

      {shown && (
        <Card style={{ marginTop: 16 }}>
          <LevelBadge level={shown.nivel} />
          <T size={18} weight="600" style={{ marginTop: 8 }}>{shown.motivo}</T>
          {shown.totalDenuncias != null && <T color={colors.muted}>{shown.totalDenuncias} denúncia(s) no total</T>}
          {shown.uf && <T color={colors.muted}>Linha registrada em {shown.uf}</T>}
          {remote?.instituicaoOficial && <T color={colors.ok}>Número oficial: {remote.instituicaoOficial}</T>}
          <Button kind="danger" title="Denunciar este número" onPress={report} />
        </Card>
      )}
      {msg && <T style={{ marginTop: 12 }}>{msg}</T>}
    </ScrollView>
  );
}
