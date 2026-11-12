import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, SKILL_ICON } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { Button, Card, ProgressBar, SectionTitle } from '../components/ui';
import { api, type SkillProgress } from '../lib/api';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

export default function Home() {
  const { ready, userId, user, error, refresh } = useUser();
  const [skills, setSkills] = useState<SkillProgress[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    await refresh();
    api.skills(userId).then(setSkills).catch(() => {});
  }, [userId, refresh]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ready) return <Centered><ActivityIndicator color={colors.pink} /></Centered>;
  if (!userId) return <Redirect href="/onboarding" />;
  if (!user) {
    return (
      <Centered>
        {error ? (
          <>
            <Mascot mood="sad" size={120} />
            <Text style={[type.heading, { marginTop: space(3) }]}>Can’t reach the server</Text>
            <Text style={[type.small, { textAlign: 'center', marginTop: space(2) }]}>{error}</Text>
            <Button title="Try again" onPress={load} style={{ marginTop: space(5), alignSelf: 'stretch' }} />
          </>
        ) : (
          <ActivityIndicator color={colors.pink} />
        )}
      </Centered>
    );
  }

  const { streak } = user;
  const done = Math.min(user.today_count, user.daily_goal);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.pink}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>bitbybit</Text>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings" style={styles.iconBtn}>
            <Icon name="settings" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Mascot mood={user.goal_met_today ? 'happy' : 'idle'} size={124} />
          <View style={{ flex: 1, gap: space(1) }}>
            <View style={styles.streakRow}>
              <Icon name="flame" size={40} color={streak.current === 0 ? colors.faint : undefined} />
              <Text style={[type.hero, { color: streak.current ? colors.gold : colors.faint }]}>{streak.current}</Text>
            </View>
            <Text style={styles.streakLabel}>day streak</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Icon name="freeze" size={16} color={colors.ice} strokeWidth={2.4} />
                <Text style={styles.statText}>{streak.freezes}</Text>
              </View>
              <View style={styles.stat}>
                <Icon name="trophy" size={16} color={colors.muted} strokeWidth={2.4} />
                <Text style={styles.statText}>best {streak.longest}</Text>
              </View>
            </View>
          </View>
        </View>

        <Card style={{ gap: space(3) }}>
          <View style={styles.between}>
            <Text style={type.heading}>Today</Text>
            <Text style={[styles.goalCount, user.goal_met_today && { color: colors.jadeText }]}>
              {done} / {user.daily_goal} cards
            </Text>
          </View>
          <ProgressBar value={done / user.daily_goal} color={user.goal_met_today ? colors.jade : colors.gold} height={16} />
          {user.goal_met_today ? (
            <Text style={[type.small, { color: colors.jadeText }]}>Goal done. Extra practice still counts toward memory.</Text>
          ) : streak.at_risk ? (
            <Text style={[type.small, { color: colors.gold }]}>
              {user.daily_goal - done} more to keep your {streak.current}-day streak.
            </Text>
          ) : (
            <Text style={type.small}>Finish {user.daily_goal} cards to start a streak.</Text>
          )}
        </Card>

        <View style={{ gap: space(2) }}>
          <Button title="Start lesson" onPress={() => router.push('/lesson')} />
          {user.due_count > 0 ? (
            <Text style={[type.small, { textAlign: 'center' }]}>
              {user.due_count} card{user.due_count === 1 ? '' : 's'} due for review
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: space(3) }}>
          <SectionTitle>Your skills</SectionTitle>
          <View style={{ gap: space(3) }}>
            {(skills ?? []).map((s) => (
              <View key={s.id} style={styles.skill}>
                <View style={[styles.skillIcon, s.seen > 0 && { backgroundColor: colors.pink }]}>
                  <Icon name={SKILL_ICON[s.id] ?? 'compute'} size={24} color={s.seen > 0 ? colors.pinkInk : colors.muted} />
                </View>
                <View style={{ flex: 1, gap: space(2) }}>
                  <View style={styles.between}>
                    <Text style={styles.skillTitle}>{s.title}</Text>
                    <Text style={styles.skillMeta}>
                      {s.seen}/{s.total}
                    </Text>
                  </View>
                  <ProgressBar value={s.mastery} height={8} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(5), paddingBottom: space(12) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.pink, letterSpacing: -0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  streakLabel: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.muted, marginTop: -space(1) },
  statsRow: { flexDirection: 'row', gap: space(3), marginTop: space(2) },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: space(3),
    paddingVertical: 5,
  },
  statText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalCount: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.gold },
  skill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space(3),
  },
  skillIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  skillMeta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.faint },
});
