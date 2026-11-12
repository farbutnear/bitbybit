import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, space } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'jade' | 'ruby';

const VARIANTS: Record<Variant, { face: string; edge: string; ink: string }> = {
  primary: { face: colors.pink, edge: colors.pinkDark, ink: colors.pinkInk },
  secondary: { face: colors.cardRaised, edge: '#3A0E2B', ink: colors.text },
  jade: { face: colors.jade, edge: colors.jadeDark, ink: '#F0FFF7' },
  ruby: { face: colors.ruby, edge: colors.rubyDark, ink: '#FFF0F2' },
};

const EDGE = 5;

/** Chunky button: a solid bottom edge that the face sinks into when pressed. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: off ? colors.card : v.face,
          borderBottomColor: off ? colors.border : v.edge,
          borderBottomWidth: pressed ? 0 : EDGE,
          marginTop: pressed ? EDGE : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.ink} />
      ) : (
        <Text style={[styles.buttonText, { color: off ? colors.faint : v.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.pink, borderColor: colors.pink, borderBottomColor: colors.pinkDark },
        pressed && { borderBottomWidth: 1, marginTop: 3 },
      ]}
    >
      <Text style={[styles.chipText, selected && { color: colors.pinkInk }]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, color = colors.pink, height = 12 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      {pct > 0 ? (
        <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }}>
          {/* glossy highlight strip, the one bit of shine in the UI */}
          <View style={[styles.gloss, { borderRadius: height / 2, height: Math.max(2, height / 4) }]} />
        </View>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(5),
  },
  buttonText: { fontFamily: fonts.displayBold, fontSize: 18, letterSpacing: 0.3 },
  chip: {
    paddingVertical: space(2),
    paddingHorizontal: space(4),
    borderRadius: radius.sm,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.text, fontSize: 15, fontFamily: fonts.bodyBold },
  track: { backgroundColor: colors.cardRaised, overflow: 'hidden', width: '100%' },
  gloss: { position: 'absolute', top: 2, left: 6, right: 6, backgroundColor: 'rgba(255,255,255,0.28)' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(4),
  },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: space(3) },
});
