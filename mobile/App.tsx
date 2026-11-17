import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StatusBar, TouchableOpacity, View } from 'react-native';
import { native, type LocalCall } from './src/native';
import { api } from './src/api';
import { AlertDetail } from './src/screens/AlertDetail';
import { History } from './src/screens/History';
import { Home } from './src/screens/Home';
import { Lists } from './src/screens/Lists';
import { Lookup } from './src/screens/Lookup';
import { Onboarding } from './src/screens/Onboarding';
import { Settings } from './src/screens/Settings';
import { ScaleContext, T, colors } from './src/theme';

type Tab = 'inicio' | 'historico' | 'consultar' | 'listas' | 'ajustes';
const TABS: Array<[Tab, string]> = [
  ['inicio', 'Início'],
  ['historico', 'Histórico'],
  ['consultar', 'Consultar'],
  ['listas', 'Listas'],
  ['ajustes', 'Ajustes'],
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [screening, setScreening] = useState(false);
  const [elderMode, setElderMode] = useState(false);
  const [tab, setTab] = useState<Tab>('inicio');
  const [openCall, setOpenCall] = useState<LocalCall | null>(null);

  useEffect(() => {
    native.getState().then((s) => {
      setScreening(s.triagemAtiva);
      setElderMode(s.modoIdoso);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openCall) { setOpenCall(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [openCall]);

  const enableScreening = useCallback(async () => {
    try { setScreening(await native.requestScreeningRole()); } catch { /* mostrado no onboarding */ }
  }, []);

  async function release(c: LocalCall) {
    await native.setFeedback(c.id, 'legitima');
    await native.setPersonal(c.numero, 'permitido');
    api.setList(c.numero, 'permitido').catch(() => {});
    setOpenCall(null);
  }

  if (!ready) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}><ActivityIndicator /></View>;
  }

  const scale = elderMode ? 1.3 : 1;

  if (!screening) {
    return (
      <ScaleContext.Provider value={scale}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Onboarding onDone={() => setScreening(true)} />
        </View>
      </ScaleContext.Provider>
    );
  }

  let body: React.ReactNode;
  if (openCall) {
    body = <AlertDetail call={openCall} elderMode={elderMode} onBack={() => setOpenCall(null)} onRelease={() => release(openCall)} />;
  } else {
    switch (tab) {
      case 'inicio': body = <Home onOpenCall={setOpenCall} onEnableScreening={enableScreening} />; break;
      case 'historico': body = <History onOpenCall={setOpenCall} />; break;
      case 'consultar': body = <Lookup />; break;
      case 'listas': body = <Lists />; break;
      case 'ajustes': body = <Settings elderMode={elderMode} onElderModeChange={setElderMode} />; break;
    }
  }

  return (
    <ScaleContext.Provider value={scale}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1 }}>{body}</View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          {TABS.map(([id, label]) => (
            <TouchableOpacity
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              onPress={() => { setOpenCall(null); setTab(id); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 14 * scale }}>
              <T size={12} weight={tab === id ? '700' : '400'} color={tab === id ? colors.primary : colors.muted}>{label}</T>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScaleContext.Provider>
  );
}
