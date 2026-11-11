import { Redirect, Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Label, ProgressBar } from '../components/ui';
import { api, type SkillProgress } from '../lib/api';
import { colors, space } from '../lib/theme';
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

  // Reload whenever the screen comes back into view (e.g. after finishing a lesson).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ready) return <Centered><ActivityIndicator color={colors.accent} /></Centered>;
  if (!userId) return <Redirect href="/onboarding" />;
  if (!user) {
    return (
      <Centered>
        {error ? (
          <>
            <Text style={styles.errorTitle}>Can't load your progress</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Try again" onPress={load} style={{ marginTop: space(4), alignSelf: 'stretch' }} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </Centered>
    );
  }

  const { streak } = user;
  const goalProgress = Math.min(user.today_count / user.daily_goal, 1);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings">
              <Text style={{ color: colors.text, fontSize: 22 }}>⚙︎</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Text style={styles.greeting}>Hi {user.name} 👋</Text>

        <Card style={styles.streakCard}>
          <View style={styles.streakRow}>
            <Text style={[styles.flame, streak.current === 0 && { opacity: 0.35 }]}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakNumber}>{streak.current}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.meta}>🧊 {streak.freezes} freeze{streak.freezes === 1 ? '' : 's'}</Text>
              <Text style={styles.meta}>🏆 best {streak.longest}</Text>
            </View>
          </View>

          <View style={{ gap: space(2), marginTop: space(4) }}>
            <View style={styles.goalRow}>
              <Text style={styles.goalText}>
                Today: {Math.min(user.today_count, user.daily_goal)}/{user.daily_goal} cards
              </Text>
              {user.goal_met_today ? <Text style={[styles.goalText, { color: colors.good }]}>Goal met ✓</Text> : null}
            </View>
            <ProgressBar value={goalProgress} color={user.goal_met_today ? colors.good : colors.flame} height={10} />
          </View>

          {streak.at_risk ? (
            <Text style={styles.atRisk}>Practice today to keep your streak alive.</Text>
          ) : null}
        </Card>

        <Button
          title={user.due_count > 0 ? `Start lesson · ${user.due_count} due` : 'Start lesson'}
          onPress={() => router.push('/lesson')}
        />

        <View style={{ marginTop: space(2) }}>
          <Label>Skills</Label>
          <View style={{ gap: space(3) }}>
            {(skills ?? []).map((s) => (
              <Card key={s.id} style={{ gap: space(2) }}>
                <View style={styles.goalRow}>
                  <Text style={styles.skillTitle}>{s.title}</Text>
                  <Text style={styles.meta}>
                    {s.seen}/{s.total} seen
                  </Text>
                </View>
                <ProgressBar value={s.mastery} />
                <Text style={styles.meta}>
                  {s.strong > 0 ? `${s.strong} card${s.strong === 1 ? '' : 's'} in long-term memory` : s.seen ? 'Learning' : 'Not started'}
                </Text>
              </Card>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(4), paddingBottom: space(12) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
  greeting: { color: colors.text, fontSize: 26, fontWeight: '800' },
  streakCard: { paddingVertical: space(5) },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  flame: { fontSize: 52 },
  streakNumber: { color: colors.flame, fontSize: 44, fontWeight: '900', lineHeight: 48 },
  streakLabel: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  atRisk: { color: colors.warn, fontSize: 14, fontWeight: '600', marginTop: space(3) },
  skillTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: space(2) },
  errorText: { color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
