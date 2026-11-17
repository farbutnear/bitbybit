import { StyleSheet, Text, View } from 'react-native';

import type { TeachStep } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Mascot } from './Mascot';

/** A teaching screen: one idea, a few sentences, and the llama's take on it. */
export function TeachScreen({ step }: { step: TeachStep }) {
  return (
    <View style={{ gap: space(5) }}>
      <View style={{ gap: space(3) }}>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </View>
      {step.llama ? (
        <View style={styles.aside}>
          <Mascot mood="idle" size={92} />
          <View style={styles.bubble}>
            <View style={styles.tail} />
            <Text style={styles.quip}>{step.llama}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 34, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 18, lineHeight: 27, color: colors.text },
  aside: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  bubble: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(3),
  },
  // A small diamond poking out of the bubble toward the llama.
  tail: {
    position: 'absolute',
    left: -8,
    top: '50%',
    width: 14,
    height: 14,
    marginTop: -7,
    backgroundColor: colors.card,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  quip: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21, color: colors.muted },
});
