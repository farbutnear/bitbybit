import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { formatCorrectAnswer, QuestionCard } from '../components/QuestionCards';
import { ResultPanel } from '../components/ResultPanel';
import { Button, ProgressBar } from '../components/ui';
import { api, type Answer, type ReviewResult, type SessionCard } from '../lib/api';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/** A card in this lesson. Missed cards are appended once more as a retry. */
type Item = { card: SessionCard; isRetry: boolean; key: string };

const REASON: Record<SessionCard['reason'], { label: string; color: string }> = {
  new: { label: 'New', color: colors.pink },
  due: { label: 'Review', color: colors.gold },
  ahead: { label: 'Extra practice', color: colors.muted },
};

function haptic(kind: 'success' | 'error') {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(
    kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  ).catch(() => {});
}

export default function Lesson() {
  const { userId, user, refresh } = useUser();
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [last, setLast] = useState<ReviewResult | null>(null);
  const [metGoal, setMetGoal] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!userId) return;
    api
      .getSession(userId)
      .then((s) => {
        startedAt.current = Date.now();
        setQueue(s.cards.map((card) => ({ card, isRetry: false, key: card.id })));
      })
      .catch((e) => setError(e.message));
  }, [userId]);

  const done = queue !== null && idx >= queue.length;
  useEffect(() => {
    if (done) refresh();
  }, [done, refresh]);

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="sad" size={120} />
        <Text style={[type.heading, { textAlign: 'center' }]}>Couldn’t start the lesson</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>{error}</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }
  if (!queue) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.pink} />
      </SafeAreaView>
    );
  }
  if (queue.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="idle" size={120} />
        <Text style={[type.heading, { textAlign: 'center' }]}>No cards yet</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>The server has no content loaded.</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }
  if (done) {
    const streak = last?.streak.current ?? user?.streak.current ?? 0;
    const goal = user?.daily_goal ?? 0;
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="happy" size={170} bounce />
        {metGoal ? (
          <>
            <View style={styles.bigStreak}>
              <Icon name="flame" size={52} />
              <Text style={[type.hero, { color: colors.gold, fontSize: 64, lineHeight: 70 }]}>{streak}</Text>
            </View>
            <Text style={type.title}>day streak</Text>
            <Text style={[type.small, { textAlign: 'center', fontSize: 16 }]}>Daily goal done. See you tomorrow.</Text>
          </>
        ) : (
          <>
            <Text style={[type.title, { textAlign: 'center' }]}>Lesson done</Text>
            <Text style={[type.small, { textAlign: 'center', fontSize: 16 }]}>
              {last?.goal_met_today
                ? 'Goal already met today. Extra reps make it stick.'
                : `${Math.min(last?.today_count ?? 0, goal)} of ${goal} cards toward today's goal.`}
            </Text>
          </>
        )}
        <View style={styles.statRow}>
          <Stat value={`${stats.correct}/${stats.answered}`} label="right first try" color={colors.jadeText} />
          <Stat value={`${last?.today_count ?? 0}`} label="cards today" color={colors.gold} />
        </View>
        <Button title="Continue" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }

  const item = queue[idx];
  const reason = item.isRetry ? { label: 'Try again', color: colors.rubyText } : REASON[item.card.reason];

  async function submit(answer: Answer) {
    if (!userId) return;
    setSubmitting(true);
    try {
      const res = await api.review(userId, {
        card_id: item.card.id,
        answer,
        is_retry: item.isRetry,
        duration_ms: Date.now() - startedAt.current,
      });
      haptic(res.correct ? 'success' : 'error');
      setResult(res);
      setLast(res);
      if (res.just_met_goal) setMetGoal(true);
      if (!item.isRetry) {
        setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (res.correct ? 1 : 0) }));
        if (!res.correct) setQueue((q) => [...q!, { card: item.card, isRetry: true, key: `${item.card.id}:retry` }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setResult(null);
    setIdx((i) => i + 1);
    startedAt.current = Date.now();
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close lesson">
          <Icon name="close" size={26} color={colors.muted} strokeWidth={2.6} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={idx / queue.length} height={16} />
        </View>
        <View style={styles.topStreak}>
          <Icon name="flame" size={22} />
          <Text style={styles.topStreakText}>{last?.streak.current ?? user?.streak.current ?? 0}</Text>
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={[styles.body, result && { paddingBottom: 420 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.reason, { borderColor: reason.color }]}>
          <Text style={[styles.reasonText, { color: reason.color }]}>{reason.label}</Text>
        </View>
        <QuestionCard key={item.key} card={item.card} result={result} submitting={submitting} onSubmit={submit} />
      </ScrollView>

      {result ? (
        <ResultPanel
          result={result}
          answerText={formatCorrectAnswer(item.card, result)}
          goal={user?.daily_goal ?? 5}
          onContinue={next}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={type.tiny}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(6),
    gap: space(3),
  },
  fullWidth: { alignSelf: 'stretch', marginTop: space(4) },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space(4), paddingHorizontal: space(5), paddingVertical: space(3) },
  topStreak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topStreakText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.gold },
  body: { padding: space(5), gap: space(4), paddingBottom: space(16) },
  reason: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: 3 },
  reasonText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  bigStreak: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  statRow: { flexDirection: 'row', gap: space(3), marginTop: space(3), alignSelf: 'stretch' },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(3),
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontFamily: fonts.displayBold, fontSize: 26 },
});
