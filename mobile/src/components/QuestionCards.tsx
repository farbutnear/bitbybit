/**
 * One component per card kind. Each owns its input state and calls onSubmit with the
 * answer shape the backend expects: mcq -> option index, order -> list of item strings,
 * numeric -> number.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Answer, ReviewResult, SessionCard } from '../lib/api';
import { colors, mono, radius, space } from '../lib/theme';
import { Button } from './ui';

type Props = {
  card: SessionCard;
  result: ReviewResult | null; // set once graded; inputs lock
  submitting: boolean;
  onSubmit: (answer: Answer) => void;
};

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
        const isChosen = choice === i;
        const isAnswer = locked && result!.correct_answer === i;
        const isWrongChoice = locked && isChosen && !result!.correct;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityState={{ selected: isChosen }}
            disabled={locked}
            onPress={() => setChoice(i)}
            style={[
              styles.option,
              isChosen && !locked && styles.optionChosen,
              isAnswer && styles.optionGood,
              isWrongChoice && styles.optionBad,
            ]}
          >
            <Text style={styles.optionKey}>{String.fromCharCode(65 + i)}</Text>
            <Text style={styles.optionText}>{opt}</Text>
          </Pressable>
        );
      })}
      {!locked && (
        <Button title="Check" disabled={choice === null} loading={submitting} onPress={() => onSubmit(choice!)} />
      )}
    </View>
  );
}

function OrderInput({ card, result, submitting, onSubmit }: Props) {
  const [placed, setPlaced] = useState<string[]>([]);
  const locked = result !== null;
  const pool = card.items!.filter((it) => !placed.includes(it));
  return (
    <View style={{ gap: space(3) }}>
      <Text style={styles.subtle}>Tap the steps in order. Tap a placed step to remove it.</Text>
      <View style={styles.slots}>
        {placed.length === 0 ? <Text style={styles.subtle}>Your order appears here</Text> : null}
        {placed.map((it, i) => (
          <Pressable
            key={it}
            disabled={locked}
            onPress={() => setPlaced(placed.filter((p) => p !== it))}
            style={[
              styles.option,
              styles.optionChosen,
              locked && (result!.correct ? styles.optionGood : (result!.correct_answer as string[])[i] === it ? styles.optionGood : styles.optionBad),
            ]}
          >
            <Text style={styles.optionKey}>{i + 1}</Text>
            <Text style={styles.optionText}>{it}</Text>
          </Pressable>
        ))}
      </View>
      {pool.map((it) => (
        <Pressable key={it} disabled={locked} onPress={() => setPlaced([...placed, it])} style={styles.option}>
          <Text style={styles.optionText}>{it}</Text>
        </Pressable>
      ))}
      {!locked && (
        <Button title="Check" disabled={pool.length > 0} loading={submitting} onPress={() => onSubmit(placed)} />
      )}
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
  return (
    <View style={{ gap: space(3) }}>
      <View
        style={[
          styles.numericRow,
          locked && (result!.correct ? styles.optionGood : styles.optionBad),
        ]}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          editable={!locked}
          placeholder="Your estimate"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={() => value !== null && onSubmit(value)}
          style={styles.numericInput}
        />
        {card.unit ? <Text style={styles.unit}>{card.unit}</Text> : null}
      </View>
      <Text style={styles.subtle}>Estimates within the expected range count. You can type 2.3k or 1.5M.</Text>
      {card.hint && !locked ? (
        showHint ? (
          <Text style={styles.hint}>💡 {card.hint}</Text>
        ) : (
          <Pressable onPress={() => setShowHint(true)}>
            <Text style={[styles.subtle, { color: colors.accent }]}>Show hint</Text>
          </Pressable>
        )
      ) : null}
      {!locked && (
        <Button title="Check" disabled={value === null} loading={submitting} onPress={() => onSubmit(value!)} />
      )}
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
  prompt: { color: colors.text, fontSize: 21, lineHeight: 29, fontWeight: '700' },
  diagram: {
    backgroundColor: '#0A0F1A',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(3),
  },
  diagramText: { color: colors.accent, fontFamily: mono, fontSize: 12, lineHeight: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
  },
  optionChosen: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  optionGood: { borderColor: colors.good, backgroundColor: colors.goodBg },
  optionBad: { borderColor: colors.bad, backgroundColor: colors.badBg },
  optionKey: { color: colors.muted, fontWeight: '800', fontSize: 14, width: 18 },
  optionText: { color: colors.text, fontSize: 16, lineHeight: 22, flex: 1 },
  slots: {
    gap: space(2),
    minHeight: 64,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: space(2),
    justifyContent: 'center',
  },
  subtle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.warn, fontSize: 15, lineHeight: 21 },
  numericRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
  },
  numericInput: { flex: 1, color: colors.text, fontSize: 24, fontWeight: '700', paddingVertical: space(3) },
  unit: { color: colors.muted, fontSize: 17, fontWeight: '600' },
});
