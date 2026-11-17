import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Hex } from '../../components/shapes';
import { LlamaStage } from '../../components/StatusBoard';
import { Button, Card } from '../../components/ui';
import { api } from '../../lib/api';
import { useLoop, useReduceMotion } from '../../lib/motion';
import { colors, fonts, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

/** "in 3 hours", "in 2 days": when the next card comes due. */
function fromNow(iso: string): string {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 60) return 'within the hour';
  if (mins < 60 * 24) {
    const h = Math.round(mins / 60);
    return `in ${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(mins / (60 * 24));
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

/** One waiting card. The row ripples from the front of the queue to the back. */
function Waiting({ index, moving }: { index: number; moving: boolean }) {
  const t = useLoop(1800, index * 120, moving);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({ inputRange: [0, 0.25, 0.5, 1], outputRange: [0.55, 1, 0.55, 0.55] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 0.25, 0.5, 1], outputRange: [0, -5, 0, 0] }) }],
      }}
    >
      <Hex width={22} fill={index === 0 ? colors.pink : colors.gold} />
    </Animated.View>
  );
}

/** Spaced repetition: the cards you've learned that are due to come back today, shown as a queue to drain. */
export default function Review() {
  const { userId, user, refresh } = useUser();
  const [nextDue, setNextDue] = useState<string | null>(null);
  const reduce = useReduceMotion();

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (userId) {
        api
          .reviewQueue(userId)
          .then((q) => setNextDue(q.next_due))
          .catch(() => {});
      }
    }, [userId, refresh]),
  );

  if (!user) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const due = user.due_count;
  const learned = user.learned_count;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.title}>Review</Text>

        <View style={styles.hero}>
          <LlamaStage mood={due > 0 ? 'idle' : 'happy'} size={150} />
          {due > 0 ? (
            <>
              <Text style={styles.count}>{due}</Text>
              <Text style={type.heading}>in the queue</Text>
              <View style={styles.queue} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {Array.from({ length: Math.min(due, 10) }, (_, i) => (
                  <Waiting key={i} index={i} moving={!reduce} />
                ))}
                {due > 10 ? <Text style={type.tiny}>+{due - 10}</Text> : null}
              </View>
              <Text style={[type.small, styles.sub]}>These are about to slip. A minute now saves relearning them later.</Text>
            </>
          ) : learned > 0 ? (
            <>
              <Text style={[type.title, { textAlign: 'center' }]}>Queue drained</Text>
              <Text style={[type.small, styles.sub]}>
                {nextDue ? `Your next card comes back ${fromNow(nextDue)}.` : 'Nothing is waiting.'}
              </Text>
            </>
          ) : (
            <>
              <Text style={[type.title, { textAlign: 'center' }]}>Nothing to review yet</Text>
              <Text style={[type.small, styles.sub]}>Finish a lesson and its cards will start coming back here.</Text>
            </>
          )}
        </View>

        {due > 0 ? (
          <Button title={`Drain the queue (${due})`} onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review' } })} />
        ) : learned > 0 ? (
          <Button
            title="Practise anyway"
            variant="secondary"
            onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review', practice: '1' } })}
          />
        ) : (
          <Button title="Go to lessons" onPress={() => router.navigate('/')} />
        )}

        <Card style={{ gap: space(2) }}>
          <Text style={type.heading}>How review works</Text>
          <Text style={type.small}>
            Every card you learn comes back just before you’d forget it. Get it right and the gap grows: a day, then a
            week, then months. Miss it and it returns sooner.
          </Text>
          <Text style={[type.small, { color: colors.text }]}>
            {learned} card{learned === 1 ? '' : 's'} in your memory so far.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(5), paddingBottom: space(10) },
  hero: { alignItems: 'center', gap: space(1), paddingVertical: space(3) },
  count: { fontFamily: fonts.displayBold, fontSize: 72, lineHeight: 78, color: colors.gold },
  queue: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space(2), height: 34 },
  sub: { textAlign: 'center', fontSize: 16, lineHeight: 23, maxWidth: 320, marginTop: space(1) },
});
