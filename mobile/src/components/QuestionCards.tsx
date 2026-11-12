/**
 * One component per card kind. Each owns its input state and calls onSubmit with the
 * answer shape the backend expects: mcq -> option index, order -> list of item strings,
 * numeric -> number.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Answer, ReviewResult, SessionCard } from '../lib/api';
import { colors, fonts, mono, radius, space, type } from '../lib/theme';
import { Icon } from './Icon';
import { Button } from './ui';

type Props = {
  card: SessionCard;
  result: ReviewResult | null; // set once graded; inputs lock
  submitting: boolean;
  onSubmit: (answer: Answer) => void;
};

type TileState = 'idle' | 'chosen' | 'right' | 'wrong';

const TILE: Record<TileState, { bg: string; border: string; edge: string; key: string; keyInk: string }> = {
  idle: { bg: colors.card, border: colors.border, edge: '#2F0D24', key: colors.cardRaised, keyInk: colors.muted },
  chosen: { bg: '#4A1638', border: colors.pink, edge: colors.pinkDark, key: colors.pink, keyInk: colors.pinkInk },
  right: { bg: colors.jadeBg, border: colors.jade, edge: colors.jadeDark, key: colors.jade, keyInk: '#F0FFF7' },
  wrong: { bg: colors.rubyBg, border: colors.ruby, edge: colors.rubyDark, key: colors.ruby, keyInk: '#FFF0F2' },
};

function Tile({
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
      onPress={onPress}
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

export function QuestionCard(props: Props) {
  const { card } = props;
  return (
    <View style={{ gap: space(4) }}>
      <Text style={styles.prompt}>{card.prompt}</Text>
      {card.diagram ? (
        <View style={styles.diagram}>
          <Text style={styles.diagramText}>{card.diagram}</Text>
        </View>
      ) : null}
      {card.kind === 'mcq' && <McqInput {...props} />}
      {card.kind === 'order' && <OrderInput {...props} />}
      {card.kind === 'numeric' && <NumericInput {...props} />}
    </View>
  );
}

function McqInput({ card, result, submitting, onSubmit }: Props) {
  const [choice, setChoice] = useState<number | null>(null);
  const locked = result !== null;
  return (
    <View style={{ gap: space(3) }}>
      {card.options!.map((opt, i) => {
        let state: TileState = choice === i ? 'chosen' : 'idle';
        if (locked) {
          if (result!.correct_answer === i) state = 'right';
          else if (choice === i) state = 'wrong';
          else state = 'idle';
        }
        return (
          <Tile key={i} label={opt} badge={String.fromCharCode(65 + i)} state={state} disabled={locked} onPress={() => setChoice(i)} />
        );
      })}
      {!locked && <Button title="Check" disabled={choice === null} loading={submitting} onPress={() => onSubmit(choice!)} />}
    </View>
  );
}

function OrderInput({ card, result, submitting, onSubmit }: Props) {
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
            <Tile
              key={it}
              label={it}
              badge={String(i + 1)}
              state={state}
              disabled={locked}
              onPress={() => setPlaced(placed.filter((p) => p !== it))}
            />
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

function NumericInput({ card, result, submitting, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [showHint, setShowHint] = useState(false);
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
          placeholder="2.3k"
          placeholderTextColor={colors.faint}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => value !== null && onSubmit(value)}
          style={styles.numericInput}
        />
        {card.unit ? <Text style={styles.unit}>{card.unit}</Text> : null}
      </View>
      <Text style={type.small}>Estimates in the right ballpark count. Shorthand like 2.3k or 1.5M works.</Text>
      {card.hint && !locked ? (
        showHint ? (
          <View style={styles.hint}>
            <Icon name="hint" size={20} color={colors.gold} />
            <Text style={[type.small, { color: colors.gold, flex: 1 }]}>{card.hint}</Text>
          </View>
        ) : (
          <Pressable onPress={() => setShowHint(true)} style={styles.hintLink} hitSlop={8}>
            <Icon name="hint" size={18} color={colors.pink} />
            <Text style={[type.small, { color: colors.pink, fontFamily: fonts.bodyBold }]}>Show hint</Text>
          </Pressable>
        )
      ) : null}
      {!locked && <Button title="Check" disabled={value === null} loading={submitting} onPress={() => onSubmit(value!)} />}
    </View>
  );
}

export function formatCorrectAnswer(card: SessionCard, result: ReviewResult): string {
  if (card.kind === 'mcq') return card.options![result.correct_answer as number];
  if (card.kind === 'order') return (result.correct_answer as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n');
  const n = result.correct_answer as unknown as number;
  return `${n.toLocaleString()}${card.unit ? ` ${card.unit}` : ''}`;
}

const styles = StyleSheet.create({
  prompt: { fontFamily: fonts.display, fontSize: 23, lineHeight: 30, color: colors.text },
  diagram: {
    backgroundColor: '#1F0815',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(3),
  },
  diagramText: { color: colors.pink, fontFamily: mono, fontSize: 12, lineHeight: 18 },
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
