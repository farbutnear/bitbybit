import { useEffect, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReviewResult } from '../lib/api';
import { colors, fonts, radius, space } from '../lib/theme';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { Button } from './ui';

/** Slides up over the bottom of the lesson after each answer. */
export function ResultPanel({
  result,
  answerText,
  goal,
  onContinue,
}: {
  result: ReviewResult;
  answerText: string;
  goal: number;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [slide] = useState(() => new Animated.Value(1));
  useEffect(() => {
    slide.setValue(1);
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [result, slide]);

  const right = result.correct;
  const c = right
    ? { bg: colors.jadeBg, line: colors.jade, title: colors.jadeText, sub: colors.jadeSub }
    : { bg: colors.rubyBg, line: colors.ruby, title: colors.rubyText, sub: colors.rubySub };

  let sub: string;
  if (result.just_met_goal) sub = `Daily goal done. ${result.streak.current}-day streak`;
  else if (right) sub = `${Math.min(result.today_count, goal)} of ${goal} cards today`;
  else sub = "You'll see this one again soon";

  return (
    <Animated.View
      style={[
        styles.panel,
        { backgroundColor: c.bg, borderTopColor: c.line, paddingBottom: insets.bottom + space(4) },
        { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] },
      ]}
    >
      <View style={styles.header}>
        <Mascot mood={right ? 'happy' : 'sad'} size={76} bounce />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.title }]}>{right ? 'Nailed it' : 'So close'}</Text>
          <View style={styles.subRow}>
            {result.just_met_goal ? <Icon name="flame" size={18} /> : null}
            <Text style={[styles.sub, { color: c.sub }]}>{sub}</Text>
          </View>
        </View>
      </View>
      <ScrollView style={{ maxHeight: 170 }} contentContainerStyle={{ gap: space(2) }}>
        {!right ? (
          <Text style={[styles.answer, { color: colors.text }]}>
            <Text style={{ color: c.title }}>Answer  </Text>
            {answerText}
          </Text>
        ) : null}
        <Text style={[styles.explanation, { color: c.sub }]}>{result.explanation}</Text>
      </ScrollView>
      <Button title={right ? 'Continue' : 'Got it'} variant={right ? 'jade' : 'ruby'} onPress={onContinue} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 5,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space(5),
    paddingTop: space(4),
    gap: space(3),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  title: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 32 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  sub: { fontFamily: fonts.bodyBold, fontSize: 14 },
  answer: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 23 },
  explanation: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
});
