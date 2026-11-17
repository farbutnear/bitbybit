import { Pressable, StyleSheet, Text } from 'react-native';

import type { Answer, ReviewResult, SessionCard } from '../../lib/api';
import { play } from '../../lib/sound';
import { colors, fonts, radius, space } from '../../lib/theme';
import { Icon } from '../Icon';
import { Hex } from '../shapes';

/** What every exercise receives. `result` is set once graded, and inputs lock. */
export type ExerciseProps = {
  card: SessionCard;
  result: ReviewResult | null;
  submitting: boolean;
  onSubmit: (answer: Answer) => void;
  /** Option indexes the Debug visor struck off (multiple choice). */
  struck?: number[];
  /** Node ids the Tracer lens ruled out (find the fault). */
  cleared?: string[];
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
  struck,
  onPress,
}: {
  label: string;
  badge: string;
  state: TileState;
  disabled?: boolean;
  /** Crossed out by a perk: shown, but no longer a choice. */
  struck?: boolean;
  onPress?: () => void;
}) {
  const t = TILE[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: state === 'chosen', disabled: disabled || struck }}
      accessibilityHint={struck ? 'Struck off by the Debug visor' : undefined}
      disabled={disabled || struck}
      onPress={() => {
        play('tap');
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: t.bg, borderColor: t.border, borderBottomColor: t.edge },
        pressed && { borderBottomWidth: 2, marginTop: 3 },
        struck && { opacity: 0.45 },
      ]}
    >
      <Hex width={30} fill={t.key}>
        {state === 'right' ? (
          <Icon name="check" size={16} color={t.keyInk} strokeWidth={3} />
        ) : state === 'wrong' ? (
          <Icon name="close" size={16} color={t.keyInk} strokeWidth={3} />
        ) : (
          <Text style={[styles.badgeText, { color: t.keyInk }]}>{badge}</Text>
        )}
      </Hex>
      <Text style={[styles.tileText, struck && { textDecorationLine: 'line-through' }]}>{label}</Text>
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
  badgeText: { fontFamily: fonts.displayBold, fontSize: 15 },
  tileText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text, flex: 1 },
});
