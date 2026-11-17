import React, { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { SCAM_EXPLANATIONS, type ReportReason } from '@detecta/risk-engine';
import { native, type LocalCall } from '../native';
import { Button, Card, LevelBadge, T, colors, formatWhen } from '../theme';

/** Tipo de golpe a partir do motivo registrado na decisão. */
export function scamTypeOf(c: Pick<LocalCall, 'motivo' | 'codigoMotivo'>): ReportReason {
  if (c.codigoMotivo === 'prefixo_0303' || c.motivo.startsWith('Telemarketing')) return 'telemarketing';
  if (c.motivo.includes('falso banco')) return 'falso_banco';
  if (c.motivo.startsWith('Cobrança')) return 'cobranca_indevida';
  return 'golpe';
}

/**
 * HU-08 / HU-07: alerta com explicação simples, lido em voz alta no modo idoso.
 */
export function AlertDetail({ call, elderMode, onBack, onRelease }: {
  call: LocalCall; elderMode: boolean; onBack: () => void; onRelease: () => void;
}) {
  const ex = SCAM_EXPLANATIONS[scamTypeOf(call)];
  const speech = `${ex.title}. ${call.motivo}. ${ex.text} ${ex.advice}`;

  useEffect(() => {
    if (elderMode) native.speak(speech);
    return () => native.stopSpeaking();
  }, [elderMode, speech]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <LevelBadge level={call.nivel} />
        <T size={22} weight="700" style={{ marginTop: 8 }}>{ex.title}</T>
        <T size={18} style={{ marginTop: 8 }}>{call.motivo}</T>
        <T color={colors.muted} style={{ marginTop: 4 }}>{call.numero} · {formatWhen(call.recebidaEm)}</T>
      </Card>
      <Card>
        <T size={18}>{ex.text}</T>
        <T size={18} weight="700" style={{ marginTop: 12 }}>O que fazer</T>
        <T size={18} style={{ marginTop: 4 }}>{ex.advice}</T>
      </Card>
      <Button title="Ouvir explicação" onPress={() => native.speak(speech)} />
      <Button kind="secondary" title="Não era golpe: liberar este número" onPress={onRelease} />
      <Button kind="secondary" title="Voltar" onPress={onBack} />
    </ScrollView>
  );
}
