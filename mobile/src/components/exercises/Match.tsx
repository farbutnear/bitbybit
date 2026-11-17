/**
 * Match up: each statement has a socket; fill it with the matching answer from the bank.
 * Laid out as stacked rows so long statements stay readable on a phone.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space } from '../../lib/theme';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { TILE, type ExerciseProps, type TileState } from './Tile';

export function MatchInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const left = card.left!;
  const right = card.right!;
  const [picks, setPicks] = useState<Record<string, string>>({}); // left -> right
  const [focus, setFocus] = useState<string | null>(null);
  const locked = result !== null;

  const firstEmpty = left.find((l) => !picks[l]) ?? null;
  const active = locked ? null : focus && !picks[focus] ? focus : firstEmpty;
  const used = new Set(Object.values(picks));
  const want = locked ? Object.fromEntries(result!.correct_answer as [string, string][]) : null;

  function tapRow(l: string) {
    if (picks[l]) {
      const next = { ...picks };
      delete next[l];
      setPicks(next);
    }
    setFocus(l);
  }

  function tapAnswer(r: string) {
    if (!active || used.has(r)) return;
    setPicks({ ...picks, [active]: r });
    setFocus(null);
  }

  return (
    <View style={{ gap: space(3) }}>
      {left.map((l) => {
        const pick = picks[l];
        let state: TileState = active === l ? 'chosen' : 'idle';
        if (want) state = want[l] === pick ? 'right' : 'wrong';
        const t = TILE[state];
        return (
          <Pressable
            key={l}
            accessibilityRole="button"
            accessibilityLabel={`${l}. ${pick ? `Matched with ${pick}` : 'Not matched yet'}`}
            disabled={locked}
            onPress={() => tapRow(l)}
            style={[styles.row, { backgroundColor: t.bg, borderColor: t.border }]}
          >
            <Text style={styles.statement}>{l}</Text>
            <View style={[styles.socket, pick ? { backgroundColor: t.key, borderStyle: 'solid', borderColor: t.key } : { borderColor: state === 'chosen' ? colors.pink : colors.faint }]}>
              {pick ? (
                <>
                  {want ? <Icon name={state === 'right' ? 'check' : 'close'} size={15} color={t.keyInk} strokeWidth={3} /> : null}
                  <Text style={[styles.socketText, { color: state === 'idle' ? colors.text : t.keyInk }]}>{pick}</Text>
                </>
              ) : (
                <Text style={[styles.socketEmpty, state === 'chosen' && { color: colors.pink }]}>
                  {state === 'chosen' ? 'Pick an answer below' : 'Empty'}
                </Text>
              )}
            </View>
            {want && state === 'wrong' ? <Text style={styles.fix}>Should be: {want[l]}</Text> : null}
          </Pressable>
        );
      })}

      {!locked ? (
        <>
          <View style={styles.bank}>
            {right.map((r) => {
              const gone = used.has(r);
              return (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityLabel={r}
                  accessibilityState={{ disabled: gone }}
                  disabled={gone}
                  onPress={() => tapAnswer(r)}
                  style={({ pressed }) => [styles.chip, gone && styles.chipGone, pressed && { borderBottomWidth: 2, marginTop: 3 }]}
                >
                  <Text style={[styles.chipText, gone && { color: colors.faint }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            title="Check"
            disabled={left.some((l) => !picks[l])}
            loading={submitting}
            onPress={() => onSubmit(left.map((l) => [l, picks[l]] as [string, string]))}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 2, borderRadius: radius.md, padding: space(3), gap: space(2) },
  statement: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  socket: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    paddingHorizontal: space(3),
    paddingVertical: 5,
  },
  socketText: { fontFamily: fonts.bodyBold, fontSize: 15 },
  socketEmpty: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.faint },
  fix: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.jadeText },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  chip: {
    backgroundColor: colors.cardRaised,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    borderBottomColor: '#2F0D24',
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  chipGone: { backgroundColor: 'transparent', borderStyle: 'dashed', borderBottomWidth: 2 },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
