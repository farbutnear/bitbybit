/**
 * Build it: the diagram has empty slots; fill each from a bank of components.
 * The highlighted slot takes the next component you tap. Tap a filled slot to empty it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, type } from '../../lib/theme';
import { COMPONENTS, componentName, Diagram, type NodeState } from '../Diagram';
import { Icon } from '../Icon';
import { Button } from '../ui';
import type { ExerciseProps } from './Tile';

export function BuildInput({ card, result, submitting, onSubmit }: ExerciseProps) {
  const slots = card.diagram!.nodes.filter((n) => n.kind === 'slot').map((n) => n.id);
  const bank = card.bank!;
  // slot id -> index of the bank tile placed there
  const [placed, setPlaced] = useState<Record<string, number>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const locked = result !== null;

  const firstEmpty = slots.find((s) => placed[s] === undefined) ?? null;
  const active = locked ? null : focus && placed[focus] === undefined ? focus : firstEmpty;
  const used = new Set(Object.values(placed));
  const full = slots.every((s) => placed[s] !== undefined);

  const fills: Record<string, string | undefined> = {};
  for (const s of slots) fills[s] = placed[s] === undefined ? undefined : bank[placed[s]];

  const states: Record<string, NodeState> = {};
  // Parts you've placed are outlined in pink until they're checked.
  for (const s of slots) if (fills[s]) states[s] = 'selected';
  if (locked) {
    const want = result!.correct_answer as Record<string, string>;
    for (const s of slots) states[s] = fills[s] === want[s] ? 'right' : 'wrong';
  }

  function tapSlot(id: string) {
    if (placed[id] !== undefined) {
      const next = { ...placed };
      delete next[id];
      setPlaced(next);
    }
    setFocus(id);
  }

  function tapTile(index: number) {
    if (!active || used.has(index)) return;
    setPlaced({ ...placed, [active]: index });
    setFocus(null);
  }

  return (
    <View style={{ gap: space(3) }}>
      <Diagram diagram={card.diagram!} fills={fills} activeSlot={active} states={states} onPressNode={(n) => tapSlot(n.id)} slotsOnly disabled={locked} />
      {!locked ? (
        <>
          <Text style={type.small}>Tap a part to drop it into the highlighted slot.</Text>
          <View style={styles.bank}>
            {bank.map((kind, i) => {
              const gone = used.has(i);
              return (
                <Pressable
                  key={`${kind}-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={componentName(kind)}
                  accessibilityState={{ disabled: gone }}
                  disabled={gone}
                  onPress={() => tapTile(i)}
                  style={({ pressed }) => [styles.part, gone && styles.partGone, pressed && { borderBottomWidth: 2, marginTop: 3 }]}
                >
                  <Icon name={COMPONENTS[kind]?.icon ?? 'compute'} size={20} color={gone ? colors.faint : colors.text} />
                  <Text style={[styles.partText, gone && { color: colors.faint }]}>{componentName(kind)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            title="Check"
            disabled={!full}
            loading={submitting}
            onPress={() => onSubmit(Object.fromEntries(slots.map((s) => [s, bank[placed[s]]])))}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  part: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.cardRaised,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    borderBottomColor: '#2F0D24',
    paddingVertical: space(2),
    paddingHorizontal: space(3),
  },
  partGone: { backgroundColor: 'transparent', borderStyle: 'dashed', borderBottomWidth: 2 },
  partText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
