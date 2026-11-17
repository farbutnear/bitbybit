/** Picks the right exercise for a card and renders the prompt above it. */
import { StyleSheet, Text, View } from 'react-native';

import type { CardKind, ReviewResult, SessionCard } from '../../lib/api';
import { colors, fonts, space } from '../../lib/theme';
import { componentName } from '../Diagram';
import { McqInput, NumericInput, OrderInput } from './Basic';
import { BuildInput } from './Build';
import { MatchInput } from './Match';
import { formatNumber, SliderInput } from './Slider';
import { SpotInput } from './Spot';
import type { ExerciseProps } from './Tile';

/** The instruction shown above the prompt: what kind of move this card asks for. */
export const KIND_LABEL: Record<CardKind, string> = {
  mcq: 'Pick one',
  order: 'Put in order',
  numeric: 'Work it out',
  slider: 'Estimate',
  spot: 'Find the fault',
  build: 'Build it',
  match: 'Match up',
};

const INPUT: Record<CardKind, (p: ExerciseProps) => React.ReactNode> = {
  mcq: McqInput,
  order: OrderInput,
  numeric: NumericInput,
  slider: SliderInput,
  spot: SpotInput,
  build: BuildInput,
  match: MatchInput,
};

export function QuestionCard(props: ExerciseProps) {
  const Input = INPUT[props.card.kind];
  return (
    <View style={{ gap: space(4) }}>
      <Text style={styles.prompt}>{props.card.prompt}</Text>
      <Input {...props} />
    </View>
  );
}

/** The right answer in words, for the result panel after a miss. */
export function formatCorrectAnswer(card: SessionCard, result: ReviewResult): string {
  const a = result.correct_answer;
  switch (card.kind) {
    case 'mcq':
      return card.options![a as number];
    case 'order':
      return (a as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n');
    case 'numeric':
    case 'slider':
      return `${card.kind === 'slider' ? formatNumber(a as number) : (a as number).toLocaleString()}${card.unit ? ` ${card.unit}` : ''}`;
    case 'spot':
      return card.diagram!.nodes.find((n) => n.id === a)?.label ?? String(a);
    case 'build': {
      const want = a as Record<string, string>;
      return card
        .diagram!.nodes.filter((n) => n.kind === 'slot')
        .map((n) => componentName(want[n.id]))
        .join(', then ');
    }
    case 'match':
      return (a as [string, string][]).map(([l, r]) => `${r}: ${l}`).join('\n');
  }
}

const styles = StyleSheet.create({
  prompt: { fontFamily: fonts.display, fontSize: 22, lineHeight: 29, color: colors.text },
});
