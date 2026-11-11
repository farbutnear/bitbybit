import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatCorrectAnswer, QuestionCard } from '../components/QuestionCards';
import { Button, ProgressBar } from '../components/ui';
import { api, type Answer, type ReviewResult, type SessionCard } from '../lib/api';
import { colors, radius, space } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/** A card in this lesson. Missed cards are appended once more as a retry, like Duolingo does. */
type Item = { card: SessionCard; isRetry: boolean; key: string };

const REASON_LABEL: Record<SessionCard['reason'], string> = { new: 'NEW', due: 'REVIEW', ahead: 'EXTRA PRACTICE' };

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
  const startedAt = useRef(Date.now());
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!userId) return;
    api
      .getSession(userId)
      .then((s) => setQueue(s.cards.map((card) => ({ card, isRetry: false, key: card.id }))))
      .catch((e) => setError(e.message));
  }, [userId]);

  const done = queue !== null && idx >= queue.length;
  useEffect(() => {
    if (done) refresh(); // updates the home screen and reschedules (or skips) today's reminder
  }, [done, refresh]);

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.endTitle}>Couldn't start the lesson</Text>
        <Text style={styles.muted}>{error}</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }
  if (!queue) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }
  if (queue.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.endTitle}>Nothing to practice yet</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }
  if (done) {
    const streak = last?.streak.current ?? user?.streak.current ?? 0;
    const goal = user?.daily_goal ?? 0;
    return (
      <SafeAreaView style={styles.centered}>
        {metGoal ? (
          <>
            <Text style={styles.bigFlame}>🔥</Text>
            <Text style={[styles.endTitle, { color: colors.flame }]}>{streak}-day streak!</Text>
            <Text style={styles.muted}>Daily goal complete. See you tomorrow.</Text>
          </>
        ) : (
          <>
            <Text style={styles.bigFlame}>✅</Text>
            <Text style={styles.endTitle}>Lesson complete</Text>
            <Text style={styles.muted}>
              {last?.goal_met_today
                ? 'Goal already met today. Extra practice still strengthens your memory.'
                : `${Math.min(last?.today_count ?? 0, goal)}/${goal} cards toward today's goal.`}
            </Text>
          </>
        )}
        <View style={styles.statRow}>
          <Stat label="First-try correct" value={`${stats.correct}/${stats.answered}`} />
          <Stat label="Today" value={`${last?.today_count ?? 0}`} />
        </View>
        <Button title="Continue" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }

  const item = queue[idx];

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
        if (!res.correct) {
          setQueue((q) => [...q!, { card: item.card, isRetry: true, key: `${item.card.id}:retry` }]);
        }
      }
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close lesson">
          <Text style={styles.close}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={idx / queue.length} height={12} />
        </View>
        <Text style={styles.topStreak}>🔥 {last?.streak.current ?? user?.streak.current ?? 0}</Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.reason}>{item.isRetry ? 'TRY AGAIN' : REASON_LABEL[item.card.reason]}</Text>
        <QuestionCard key={item.key} card={item.card} result={result} submitting={submitting} onSubmit={submit} />

        {result ? (
          <View style={[styles.feedback, { backgroundColor: result.correct ? colors.goodBg : colors.badBg }]}>
            <Text style={[styles.feedbackTitle, { color: result.correct ? colors.good : colors.bad }]}>
              {result.correct ? 'Correct!' : 'Not quite'}
            </Text>
            {!result.correct ? (
              <Text style={styles.feedbackAnswer}>Answer: {formatCorrectAnswer(item.card, result)}</Text>
            ) : null}
            <Text style={styles.feedbackText}>{result.explanation}</Text>
            {result.just_met_goal ? (
              <Text style={[styles.feedbackText, { color: colors.flame, fontWeight: '800' }]}>
                🔥 Daily goal hit! Streak: {result.streak.current}
              </Text>
            ) : null}
            <Button title="Continue" variant={result.correct ? 'good' : 'bad'} onPress={next} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  close: { color: colors.muted, fontSize: 22, fontWeight: '700' },
  topStreak: { color: colors.flame, fontWeight: '800', fontSize: 16 },
  body: { padding: space(5), gap: space(4), paddingBottom: space(16) },
  reason: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  feedback: { borderRadius: radius.lg, padding: space(4), gap: space(3) },
  feedbackTitle: { fontSize: 22, fontWeight: '900' },
  feedbackAnswer: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  feedbackText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bigFlame: { fontSize: 88 },
  endTitle: { color: colors.text, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  statRow: { flexDirection: 'row', gap: space(3), marginTop: space(4) },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space(3),
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
});
