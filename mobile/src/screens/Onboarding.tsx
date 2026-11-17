import React, { useState } from 'react';
import { Linking, PermissionsAndroid, ScrollView, View } from 'react-native';
import { native } from '../native';
import { Button, Card, T, colors } from '../theme';

/**
 * H-01: as pessoas concedem a permissão de triagem se o app explicar antes o que ela significa.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    setError(null);
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      const ok = await native.requestScreeningRole();
      if (ok) onDone();
      else setError('Sem essa permissão o app não consegue avisar antes de o telefone tocar. Você pode tentar de novo quando quiser.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <T size={26} weight="700" style={{ marginTop: 24 }}>Detecta Golpes</T>
      <T size={17} color={colors.muted} style={{ marginTop: 8, marginBottom: 20 }}>
        Avisamos se uma ligação desconhecida pode ser golpe, antes de você atender.
      </T>

      <Card>
        <T weight="700" size={17}>O que vamos pedir</T>
        <T style={{ marginTop: 6 }}>
          O Android vai perguntar se o Detecta Golpes pode ser seu "app de identificação de chamadas e spam".
          Isso deixa a gente olhar o número de quem liga, antes de tocar.
        </T>
      </Card>

      <Card>
        <T weight="700" size={17}>O que nunca fazemos</T>
        <T style={{ marginTop: 6 }}>• Não lemos nem enviamos sua agenda de contatos.</T>
        <T>• Contatos salvos tocam normalmente, sem interferência.</T>
        <T>• Não ouvimos nem gravamos ligações.</T>
        <T>• Nenhuma chamada some: tudo que barrarmos fica no histórico, com um botão para liberar.</T>
      </Card>

      <Card>
        <T weight="700" size={17}>Como funciona</T>
        <T style={{ marginTop: 6 }}>
          Quando alguém denuncia um número, todos os outros usuários ficam protegidos. A decisão de atender é sempre sua.
        </T>
      </Card>

      {error && <T color={colors.danger} style={{ marginBottom: 8 }}>{error}</T>}
      <Button title="Ativar proteção" onPress={grant} />
      <View style={{ height: 8 }} />
      <Button
        kind="secondary"
        title="Também quero menos telemarketing (Não Me Perturbe)"
        onPress={() => Linking.openURL('https://www.naomeperturbe.com.br')}
      />
    </ScrollView>
  );
}
