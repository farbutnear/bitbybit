import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Answer, ReviewResult, SessionCard } from '../../lib/api';
import { play } from '../../lib/sound';
import { colors, fonts, radius, space } from '../../lib/theme';
import { Icon } from '../Icon';

/** What every exercise receives. `result` is set once graded, and inputs lock. */
export type ExerciseProps = {
  card: SessionCard;
  result: ReviewResult | null;
  submitting: boolean;
  onSubmit: (answer: Answer) => void;
};

export type TileState = 'idle' | 'chosen' | 'right' | 'wrong';

export const TILE: Record<TileState, { bg: string; border: string; edge: string; key: string; keyInk: string }> = {
  idle: { bg: colors.card, border: colors.border, edge: colors.edge, key: colors.cardRaised, keyInk: colors.muted },
  chosen: { bg: colors.chosen, border: colors.pink, edge: colors.pinkDark, key: colors.pink, keyInk: colors.pinkInk },
  right: { bg: colors.jadeBg, border: colors.jade, edge: colors.jadeDark, key: colors.jade, keyInk: '#F0FFF7' },
  wrong: { bg: colors.rubyBg, border: colors.ruby, edge: colors.rubyDark, key: colors.ruby, keyInk: '#FFF0F2' },
};

/** A chunky answer tile with a badge (letter, number or +) on the left. */
export function Tile({
  label,
  badge,
  state,
  disabled,
  onPress,
}: {
  label: string;
  badge: string;
  state: TileState;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const t = TILE[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: state === 'chosen', disabled }}
      disabled={disabled}
      onPress={() => {
        play('tap');
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: t.bg, borderColor: t.border, borderBottomColor: t.edge },
        pressed && { borderBottomWidth: 2, marginTop: 3 },
      ]}
    >
      <View style={[styles.badge, { backgroundColor: t.key }]}>
        {state === 'right' ? (
          <Icon name="check" size={16} color={t.keyInk} strokeWidth={3} />
        ) : state === 'wrong' ? (
          <Icon name="close" size={16} color={t.keyInk} strokeWidth={3} />
        ) : (
          <Text style={[styles.badgeText, { color: t.keyInk }]}>{badge}</Text>
        )}
      </View>
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderWidth: 2,
    borderBottomWidth: 5,
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(3),
  },
  badge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.displayBold, fontSize: 15 },
  tileText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text, flex: 1 },
});
