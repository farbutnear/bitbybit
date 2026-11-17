import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { formatCorrectAnswer, KIND_LABEL, QuestionCard } from '../components/exercises';
import { ResultPanel } from '../components/ResultPanel';
import { TeachScreen } from '../components/TeachScreen';
import { Button, ProgressBar } from '../components/ui';
import { api, type Answer, type LessonCompletion, type ReviewResult, type SessionCard, type TeachStep } from '../lib/api';
import { play } from '../lib/sound';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/**
 * Plays either a lesson from the path (?id=...) or a review session (?mode=review).
 * A lesson alternates teaching screens and cards; a review is cards only.
 * Missed cards come back once at the end.
 */
type Item =
  | { type: 'teach'; step: TeachStep; key: string }
  | { type: 'card'; card: SessionCard; isRetry: boolean; key: string };

type Loaded = { title: string; items: Item[]; learned: number };

function haptic(kind: 'success' | 'error') {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(
    kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  ).catch(() => {});
}

export default function LessonRoute() {
  const params = useLocalSearchParams<{ id?: string; mode?: string; practice?: string }>();
  const lessonId = params.mode === 'review' ? null : (params.id ?? null);
  const practice = params.practice === '1';
  // Keyed so that moving on to the next lesson starts from a clean slate.
  return <Player key={`${lessonId ?? 'review'}:${practice}`} lessonId={lessonId} practice={practice} />;
}

function Player({ lessonId, practice }: { lessonId: string | null; practice: boolean }) {
  const { userId, user, refresh } = useUser();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retries, setRetries] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [last, setLast] = useState<ReviewResult | null>(null);
  const [metGoal, setMetGoal] = useState(false);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [completion, setCompletion] = useState<LessonCompletion | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!userId) return;
    const load = lessonId
      ? api.lesson(userId, lessonId).then((les): Loaded => ({
          title: les.title,
          learned: 0,
          items: les.steps.map((s, i) =>
            s.type === 'teach'
              ? { type: 'teach', step: s, key: `teach:${i}` }
              : { type: 'card', card: s.card, isRetry: false, key: s.card.id },
          ),
        }))
      : api.reviewQueue(userId, practice).then((q): Loaded => ({
          title: practice ? 'Practice' : 'Review',
          learned: q.learned_count,
          items: q.cards.map((card) => ({ type: 'card', card, isRetry: false, key: card.id })),
        }));
    load
      .then((l) => {
        startedAt.current = Date.now();
        setLoaded(l);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [userId, lessonId, practice]);

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="sad" size={120} />
        <Text style={[type.heading, { textAlign: 'center' }]}>That didn’t load</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>{error}</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }
  if (!loaded) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.pink} />
      </SafeAreaView>
    );
  }

  const queue = [...loaded.items, ...retries];

  if (queue.length === 0) {
    // Only a review can be empty: nothing is due.
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="happy" size={130} />
        <Text style={[type.title, { textAlign: 'center' }]}>Nothing due</Text>
        <Text style={[type.small, { textAlign: 'center', fontSize: 16 }]}>
          {loaded.learned > 0
            ? 'Your reviews are all caught up. Cards come back when you’re about to forget them.'
            : 'Reviews appear here after your first lesson.'}
        </Text>
        {loaded.learned > 0 && !practice ? (
          <Button
            title="Practise anyway"
            onPress={() => router.replace({ pathname: '/lesson', params: { mode: 'review', practice: '1' } })}
            style={styles.fullWidth}
          />
        ) : null}
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </SafeAreaView>
    );
  }

  if (finished) {
    const streak = last?.streak.current ?? user?.streak.current ?? 0;
    const goal = user?.daily_goal ?? 0;
    const next = completion?.next_lesson ?? null;
    return (
      <SafeAreaView style={styles.centered}>
        <Mascot mood="happy" size={160} bounce />
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
            <Text style={[type.title, { textAlign: 'center' }]}>
              {lessonId ? (completion?.track_complete ? 'Track complete' : 'Lesson complete') : 'Review done'}
            </Text>
            <Text style={[type.small, { textAlign: 'center', fontSize: 16 }]}>
              {last?.goal_met_today
                ? 'Goal already met today. Extra reps make it stick.'
                : `${Math.min(last?.today_count ?? 0, goal)} of ${goal} cards toward today’s goal.`}
            </Text>
          </>
        )}
        <View style={styles.statRow}>
          <Stat value={`${stats.correct}/${stats.answered}`} label="right first try" color={colors.jadeText} />
          <Stat value={`${last?.today_count ?? user?.today_count ?? 0}`} label="cards today" color={colors.gold} />
        </View>
        {next ? (
          <>
            <Button
              title="Next lesson"
              onPress={() => router.replace({ pathname: '/lesson', params: { id: next.id } })}
              style={styles.fullWidth}
            />
            <Text style={[type.small, { textAlign: 'center' }]}>Up next: {next.title}</Text>
            <Button title="Done for now" variant="secondary" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
          </>
        ) : (
          <Button title="Continue" onPress={() => router.back()} style={styles.fullWidth} />
        )}
      </SafeAreaView>
    );
  }

  const item = queue[idx];

  async function submit(answer: Answer) {
    if (!userId || item.type !== 'card') return;
    setSubmitting(true);
    try {
      const res = await api.review(userId, {
        card_id: item.card.id,
        answer,
        is_retry: item.isRetry,
        duration_ms: Date.now() - startedAt.current,
      });
      haptic(res.correct ? 'success' : 'error');
      play(res.correct ? 'right' : 'wrong');
      setResult(res);
      setLast(res);
      if (res.just_met_goal) setMetGoal(true);
      if (!item.isRetry) {
        setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (res.correct ? 1 : 0) }));
        if (!res.correct) setRetries((r) => [...r, { type: 'card', card: item.card, isRetry: true, key: `${item.card.id}:retry` }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function next() {
    setResult(null);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      startedAt.current = Date.now();
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // Last step: record the lesson as finished (this unlocks the next one), then celebrate.
    setFinishing(true);
    try {
      if (userId && lessonId) setCompletion(await api.completeLesson(userId, lessonId));
      await refresh();
      play(metGoal ? 'goal' : 'done');
      setFinished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinishing(false);
    }
  }


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close">
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

      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.body, result ? { paddingBottom: 420 } : item.type === 'teach' ? { paddingBottom: 140 } : null]}
        keyboardShouldPersistTaps="handled"
      >
        {item.type === 'teach' ? (
          <>
            <Text style={styles.context}>{loaded.title}</Text>
            <TeachScreen key={item.key} step={item.step} />
          </>
        ) : (
          <>
            <View style={styles.kindRow}>
              <Text style={styles.context}>{KIND_LABEL[item.card.kind]}</Text>
              {item.isRetry ? (
                <View style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </View>
              ) : null}
            </View>
            <QuestionCard key={item.key} card={item.card} result={result} submitting={submitting} onSubmit={submit} />
          </>
        )}
      </ScrollView>

      {item.type === 'teach' ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space(4) }]}>
          <Button title="Got it" loading={finishing} onPress={next} />
        </View>
      ) : null}

      {item.type === 'card' && result ? (
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
  context: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.pink },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  retry: { borderWidth: 2, borderColor: colors.rubyText, borderRadius: 999, paddingHorizontal: space(2), paddingVertical: 1 },
  retryText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.rubyText },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space(5),
    paddingTop: space(3),
    backgroundColor: colors.bg,
    borderTopWidth: 2,
    borderTopColor: colors.card,
  },
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
