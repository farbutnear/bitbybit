import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BitToken } from '../components/Bits';
import { GearImage } from '../components/GearCard';
import { Icon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { formatCorrectAnswer, KIND_LABEL, QuestionCard } from '../components/exercises';
import { ResultPanel } from '../components/ResultPanel';
import { TeachScreen } from '../components/TeachScreen';
import { Button, ProgressBar } from '../components/ui';
import {
  api,
  type Answer,
  type CardKind,
  type LessonCompletion,
  type Perk,
  type PerkCharges,
  type PlaySession,
  type ReviewResult,
  type SessionCard,
  type TeachStep,
} from '../lib/api';
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

type Loaded = { title: string; items: Item[]; learned: number; session: PlaySession | null };

/** Gear whose perk is spent during play, and the kind of card each one works on. */
const SESSION_GEAR: { gear: string; name: string; perk: Perk; kind?: CardKind; use: string }[] = [
  { gear: 'debug-visor', name: 'Debug visor', perk: 'strike_option', kind: 'mcq', use: 'Tap to strike' },
  { gear: 'tracer-lens', name: 'Tracer lens', perk: 'clear_node', kind: 'spot', use: 'Tap to rule out' },
  { gear: 'rollback-cap', name: 'Rollback cap', perk: 'second_try', use: 'Catches one miss' },
];

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
  const [perks, setPerks] = useState<PerkCharges | null>(null);
  const [struck, setStruck] = useState<Record<string, number[]>>({});
  const [cleared, setCleared] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [bitsRun, setBitsRun] = useState(0);
  const startedAt = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!userId) return;
    const load = lessonId
      ? api.lesson(userId, lessonId).then((les): Loaded => ({
          title: les.title,
          learned: 0,
          session: les.session,
          items: les.steps.map((s, i) =>
            s.type === 'teach'
              ? { type: 'teach', step: s, key: `teach:${i}` }
              : { type: 'card', card: s.card, isRetry: false, key: s.card.id },
          ),
        }))
      : api.reviewQueue(userId, practice).then((q): Loaded => ({
          title: practice ? 'Practice' : 'Review',
          learned: q.learned_count,
          session: q.session,
          items: q.cards.map((card) => ({ type: 'card', card, isRetry: false, key: card.id })),
        }));
    load
      .then((l) => {
        startedAt.current = Date.now();
        setLoaded(l);
        setPerks(l.session?.perks ?? null);
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
          <Stat value={`+${bitsRun}`} label="bits earned" color={colors.gold} />
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
  const worn = Object.values(user?.equipped ?? {});
  const tray = SESSION_GEAR.filter((g) => worn.includes(g.gear));

  async function submit(answer: Answer) {
    if (!userId || item.type !== 'card') return;
    setSubmitting(true);
    try {
      const res = await api.review(userId, {
        card_id: item.card.id,
        answer,
        is_retry: item.isRetry,
        duration_ms: Date.now() - startedAt.current,
        session_id: loaded?.session?.id,
      });
      if (res.rolled_back) {
        // The Rollback cap caught it: nothing counted and nothing is revealed, so the card stays open.
        haptic('error');
        play('tap');
        setPerks(res.perks);
        setNotice('Rollback cap caught that one. It wasn’t right, so nothing counted: try again.');
        return;
      }
      setNotice(null);
      if (res.perks) setPerks(res.perks);
      setBitsRun((b) => b + res.bits_earned);
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

  async function spendPerk(perk: 'strike_option' | 'clear_node') {
    if (!userId || item.type !== 'card' || !loaded?.session) return;
    const cardId = item.card.id;
    try {
      const res = await api.usePerk(userId, { session_id: loaded.session.id, perk, card_id: cardId });
      play('tap');
      setPerks(res.perks);
      if (res.removed_option !== undefined) setStruck((s) => ({ ...s, [cardId]: [...(s[cardId] ?? []), res.removed_option!] }));
      if (res.cleared_node !== undefined) setCleared((c) => ({ ...c, [cardId]: [...(c[cardId] ?? []), res.cleared_node!] }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }

  async function next() {
    setResult(null);
    setNotice(null);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      startedAt.current = Date.now();
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // Last step: record the lesson as finished (this unlocks the next one), then celebrate.
    setFinishing(true);
    try {
      if (userId && lessonId) {
        const done = await api.completeLesson(userId, lessonId);
        setCompletion(done);
        setBitsRun((b) => b + done.bits_earned);
      }
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
        <View style={styles.topStreak} accessibilityLabel={`${bitsRun} bits earned this session`}>
          <BitToken size={22} />
          <Text style={styles.topStreakText}>+{bitsRun}</Text>
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
            <QuestionCard
              key={item.key}
              card={item.card}
              result={result}
              submitting={submitting}
              onSubmit={submit}
              struck={struck[item.card.id]}
              cleared={cleared[item.card.id]}
            />
            {notice && !result ? (
              <View style={styles.notice} accessibilityLiveRegion="polite">
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}
            {!result && perks && tray.length ? (
              <View style={{ gap: space(2) }}>
                <Text style={type.tiny}>Your gear this session</Text>
                <View style={styles.tray}>
                  {tray.map((g) => {
                    const left = perks[g.perk];
                    const usable = g.perk !== 'second_try' && g.kind === item.card.kind && left > 0;
                    return (
                      <Pressable
                        key={g.gear}
                        accessibilityRole="button"
                        accessibilityLabel={`${g.name}: ${g.use}. ${left} ${left === 1 ? 'charge' : 'charges'} left`}
                        accessibilityState={{ disabled: !usable }}
                        disabled={!usable}
                        onPress={() => spendPerk(g.perk as 'strike_option' | 'clear_node')}
                        style={[styles.perk, usable && { borderColor: colors.pinkDark }, left === 0 && { opacity: 0.55 }]}
                      >
                        <GearImage id={g.gear} size={40} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.perkName} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <View style={styles.perkLine}>
                            <View style={[styles.led, { backgroundColor: left > 0 ? colors.pink : colors.border }]} />
                            <Text style={type.tiny} numberOfLines={1}>
                              {left === 0 ? 'used' : usable ? g.use : `${left} ready`}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
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
  notice: { backgroundColor: colors.chosen, borderRadius: radius.md, borderWidth: 2, borderColor: colors.pinkDark, padding: space(3) },
  noticeText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  tray: { flexDirection: 'row', gap: space(2) },
  perk: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.panel,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: space(2),
  },
  perkName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.text },
  perkLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  led: { width: 7, height: 7, borderRadius: 4 },
});
