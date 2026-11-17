import React, { createContext, useContext } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LEVEL_LABEL, type RiskLevel } from '@detecta/risk-engine';

export const colors = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  text: '#1B1F24',
  muted: '#5B6470',
  border: '#E1E4E8',
  primary: '#1A56DB',
  danger: '#C62828',
  ok: '#2E7D32',
};

/** Modo idoso aumenta fontes e alvos de toque (HU-10: "fonte grande, um toque"). */
export const ScaleContext = createContext(1);
export const useScale = () => useContext(ScaleContext);

export function T({ style, size = 16, weight, color, children, ...rest }: {
  style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle['fontWeight']; color?: string; children: React.ReactNode; numberOfLines?: number;
}) {
  const s = useScale();
  return <Text {...rest} style={[{ fontSize: size * s, color: color ?? colors.text, fontWeight: weight }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, kind = 'primary', disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const s = useScale();
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : '#FFFFFF';
  const fg = kind === 'secondary' ? colors.primary : '#FFFFFF';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: bg, minHeight: 48 * s, opacity: disabled ? 0.5 : 1 }, kind === 'secondary' && styles.buttonSecondary, style]}>
      <T color={fg} weight="600" size={16}>{title}</T>
    </TouchableOpacity>
  );
}

/** Badge de nível de risco (KAN-52). */
export function LevelBadge({ level }: { level: RiskLevel }) {
  const l = LEVEL_LABEL[level];
  return (
    <View style={[styles.badge, { backgroundColor: l.color }]} accessibilityLabel={`Risco: ${l.label}`}>
      <T color="#FFFFFF" size={12} weight="700">{l.label.toUpperCase()}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  button: { borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonSecondary: { borderWidth: 1, borderColor: colors.primary },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#FFFFFF', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center' },
});

export function formatWhen(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export const ACTION_LABEL: Record<string, string> = { permitir: 'Tocou', silenciar: 'Silenciada', bloquear: 'Bloqueada' };
