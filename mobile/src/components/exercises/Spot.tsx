/** Find the fault: tap the one component in the diagram that is causing the problem. */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { space, type } from '../../lib/theme';
import { Diagram, type NodeState } from '../Diagram';
import { Button } from '../ui';
import type { ExerciseProps } from './Tile';

export function SpotInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const locked = result !== null;

  const states: Record<string, NodeState> = {};
  if (picked) states[picked] = 'selected';
  if (locked) {
    if (picked && !result!.correct) states[picked] = 'wrong';
    states[result!.correct_answer as string] = 'right';
  }

  return (
    <View style={{ gap: space(3) }}>
      <Diagram diagram={card.diagram!} states={states} onPressNode={(n) => setPicked(n.id)} disabled={locked} />
      {!locked ? <Text style={type.small}>Read the numbers under each part, then tap the culprit.</Text> : null}
      {!locked && <Button title="Check" disabled={!picked} loading={submitting} onPress={() => onSubmit(picked!)} />}
    </View>
  );
}
