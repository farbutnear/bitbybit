/** The text-based exercises: multiple choice, put-in-order and a typed number. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, space, type } from '../../lib/theme';
import { Diagram } from '../Diagram';
import { Icon } from '../Icon';
import { Button } from '../ui';
import { Tile, TILE, type ExerciseProps, type TileState } from './Tile';

export function McqInput({ card, result, submitting, onSubmit, struck = [] }: ExerciseProps) {
  const [picked, setChoice] = useState<number | null>(null);
  const locked = result !== null;
  const choice = picked !== null && struck.includes(picked) ? null : picked; // a struck option can't stay chosen
  return (
    <View style={{ gap: space(3) }}>
      {card.diagram ? <Diagram diagram={card.diagram} /> : null}
      {card.options!.map((opt, i) => {
        let state: TileState = choice === i ? 'chosen' : 'idle';
        if (locked) {
          if (result!.correct_answer === i) state = 'right';
          else if (choice === i) state = 'wrong';
          else state = 'idle';
        }
        return (
          <Tile
            key={i}
            label={opt}
            badge={String.fromCharCode(65 + i)}
            state={state}
            disabled={locked}
            struck={!locked && struck.includes(i)}
            onPress={() => setChoice(i)}
          />
        );
      })}
      {!locked && <Button title="Check" disabled={choice === null} loading={submitting} onPress={() => onSubmit(choice!)} />}
    </View>
  );
}

export function OrderInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const [placed, setPlaced] = useState<string[]>([]);
  const locked = result !== null;
  const pool = card.items!.filter((it) => !placed.includes(it));
  return (
    <View style={{ gap: space(3) }}>
      <Text style={type.small}>Tap the steps in order. Tap a placed step to take it back.</Text>
      <View style={styles.slots}>
        {placed.length === 0 ? <Text style={[type.small, { textAlign: 'center' }]}>Your order builds up here</Text> : null}
        {placed.map((it, i) => {
          let state: TileState = 'chosen';
          if (locked) state = (result!.correct_answer as string[])[i] === it ? 'right' : 'wrong';
          return (
            <Tile key={it} label={it} badge={String(i + 1)} state={state} disabled={locked} onPress={() => setPlaced(placed.filter((p) => p !== it))} />
          );
        })}
      </View>
      {pool.map((it) => (
        <Tile key={it} label={it} badge="+" state="idle" disabled={locked} onPress={() => setPlaced([...placed, it])} />
      ))}
      {!locked && <Button title="Check" disabled={pool.length > 0} loading={submitting} onPress={() => onSubmit(placed)} />}
    </View>
  );
}

/**
 * Accepts "2,300", "2.3k", "1.5M", "18 TB", "6 ms". Returns null if not a number.
 * A k/m/b suffix only counts when it stands alone, so "6 ms" is 6, not 6 million.
 */
export function parseNumber(raw: string): number | null {
  const m = raw.trim().replace(/,/g, '').match(/^(-?\d*\.?\d+)\s*([kmb](?![a-z]))?/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  const n = parseFloat(m[1]) * mult;
  return Number.isFinite(n) ? n : null;
}

export function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <View style={styles.hint}>
      <Icon name="hint" size={20} color={colors.gold} />
      <Text style={[type.small, { color: colors.gold, flex: 1 }]}>{text}</Text>
    </View>
  ) : (
    <Pressable onPress={() => setOpen(true)} style={styles.hintLink} hitSlop={8}>
      <Icon name="hint" size={18} color={colors.pink} />
      <Text style={[type.small, { color: colors.pink, fontFamily: fonts.bodyBold }]}>Show hint</Text>
    </Pressable>
  );
}

export function NumericInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const [text, setText] = useState('');
  const locked = result !== null;
  const value = parseNumber(text);
  const state: TileState = !locked ? (text ? 'chosen' : 'idle') : result!.correct ? 'right' : 'wrong';
  const t = TILE[state];
  return (
    <View style={{ gap: space(3) }}>
      <View style={[styles.numericRow, { backgroundColor: t.bg, borderColor: t.border, borderBottomColor: t.edge }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          editable={!locked}
          placeholder="Your answer"
          placeholderTextColor={colors.faint}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => value !== null && onSubmit(value)}
          style={styles.numericInput}
        />
        {card.unit ? <Text style={styles.unit}>{card.unit}</Text> : null}
      </View>
      {card.hint && !locked ? <Hint text={card.hint} /> : null}
      {!locked && <Button title="Check" disabled={value === null} loading={submitting} onPress={() => onSubmit(value!)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  slots: {
    gap: space(2),
    minHeight: 70,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(2),
    justifyContent: 'center',
  },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderBottomWidth: 5,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
  },
  numericInput: { flex: 1, minWidth: 0, width: 0, color: colors.text, fontSize: 28, fontFamily: fonts.displayBold, paddingVertical: space(3) },
  unit: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.muted, flexShrink: 0, marginLeft: space(2) },
  hint: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start' },
  hintLink: { flexDirection: 'row', gap: space(1), alignItems: 'center', alignSelf: 'flex-start' },
});
