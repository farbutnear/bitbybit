/**
 * Order-of-magnitude estimate on a logarithmic slider: each tick is 10× the last, so
 * "is it thousands or millions?" matters more than the exact figure.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { colors, fonts, space, type } from '../../lib/theme';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { Hint } from './Basic';
import type { ExerciseProps } from './Tile';

const THUMB = 34;
const NUDGE = 0.02;

export function formatNumber(n: number): string {
  const trim = (x: number) => String(Number(x.toPrecision(3)));
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}k`;
  return trim(n);
}

/** Position 0..1 on the track -> a value with two significant figures. */
function valueAt(pos: number, min: number, max: number): number {
  return Number((min * Math.pow(max / min, pos)).toPrecision(2));
}

function posOf(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, Math.log(value / min) / Math.log(max / min)));
}

export function SliderInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const min = card.min!;
  const max = card.max!;
  const [pos, setPos] = useState(0.5);
  const [touched, setTouched] = useState(false);
  const [width, setWidth] = useState(0);
  const locked = result !== null;
  const value = valueAt(pos, min, max);

  const decades: number[] = [];
  for (let v = min; v <= max * 1.0001; v *= 10) decades.push(v);

  function move(e: GestureResponderEvent) {
    if (locked || width <= 0) return;
    // Children ignore touches, so locationX is measured from the track's left edge.
    const x = e.nativeEvent.locationX;
    setPos(Math.min(1, Math.max(0, (x - THUMB / 2) / (width - THUMB))));
    setTouched(true);
  }

  function nudge(by: number) {
    if (locked) return;
    setPos((p) => Math.min(1, Math.max(0, p + by)));
    setTouched(true);
  }

  const answer = locked ? (result!.correct_answer as number) : null;
  const tone = !locked ? colors.pink : result!.correct ? colors.jade : colors.ruby;
  const usable = Math.max(0, width - THUMB);

  return (
    <View style={{ gap: space(4) }}>
      <View style={styles.readout}>
        <Text style={[styles.value, { color: touched ? colors.text : colors.faint }, locked && { color: tone }]}>
          {touched ? formatNumber(value) : '?'}
        </Text>
        {card.unit ? <Text style={styles.unit}>{card.unit}</Text> : null}
      </View>

      <View style={styles.row}>
        <Pressable onPress={() => nudge(-NUDGE)} disabled={locked} hitSlop={6} accessibilityLabel="Lower" style={styles.step}>
          <Icon name="minus" size={18} color={colors.muted} strokeWidth={2.8} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <View
            style={styles.touch}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => !locked}
            onMoveShouldSetResponder={() => !locked}
            onResponderTerminationRequest={() => false}
            onResponderGrant={move}
            onResponderMove={move}
            accessibilityRole="adjustable"
            accessibilityLabel="Estimate"
            accessibilityValue={{ text: `${formatNumber(value)} ${card.unit ?? ''}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? NUDGE : -NUDGE)}
          >
            <View pointerEvents="none" style={styles.track}>
              <View style={[styles.fill, { width: THUMB / 2 + pos * usable, backgroundColor: tone }]} />
            </View>
            {answer !== null && !result!.correct ? (
              <View pointerEvents="none" style={[styles.answerMark, { left: THUMB / 2 + posOf(answer, min, max) * usable - 3 }]} />
            ) : null}
            <View pointerEvents="none" style={[styles.thumb, { left: pos * usable, backgroundColor: tone, borderBottomColor: locked ? tone : colors.pinkDark }]} />
          </View>
          <View pointerEvents="none" style={styles.ticks}>
            {decades.map((d) => (
              <Text key={d} style={[styles.tick, { left: THUMB / 2 + posOf(d, min, max) * usable - 24 }]}>
                {formatNumber(d)}
              </Text>
            ))}
          </View>
        </View>

        <Pressable onPress={() => nudge(NUDGE)} disabled={locked} hitSlop={6} accessibilityLabel="Higher" style={styles.step}>
          <Icon name="plus" size={18} color={colors.muted} strokeWidth={2.8} />
        </Pressable>
      </View>

      <Text style={type.small}>Each mark is 10× the one before. The right ballpark counts.</Text>
      {card.hint && !locked ? <Hint text={card.hint} /> : null}
      {!locked && <Button title="Check" disabled={!touched} loading={submitting} onPress={() => onSubmit(value)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: space(2) },
  value: { fontFamily: fonts.displayBold, fontSize: 52, lineHeight: 58 },
  unit: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  step: {
    width: 36,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touch: { height: 44, justifyContent: 'center' },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.cardRaised, overflow: 'hidden' },
  fill: { height: 14, borderRadius: 7 },
  thumb: {
    position: 'absolute',
    top: 4,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: colors.text,
    borderBottomWidth: 6,
  },
  answerMark: { position: 'absolute', top: 6, width: 6, height: 32, borderRadius: 3, backgroundColor: colors.jade },
  ticks: { height: 18, marginTop: 2 },
  tick: { position: 'absolute', width: 48, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 11, color: colors.faint },
});
