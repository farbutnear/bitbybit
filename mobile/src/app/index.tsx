import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, trackIcon } from '../components/Icon';
import { Mascot } from '../components/Mascot';
import { PathView } from '../components/PathView';
import { Button, Card, ProgressBar } from '../components/ui';
import { api, type PathLesson, type Track, type TrackPath } from '../lib/api';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

export default function Home() {
  const { ready, userId, user, error, refresh, setUser } = useUser();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [path, setPath] = useState<TrackPath | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const u = await refresh();
    if (!u?.active_track_id) return;
    try {
      const [t, p] = await Promise.all([api.tracks(userId), api.path(userId, u.active_track_id)]);
      setTracks(t);
      setPath(p);
    } catch {
      // The user summary already failed or succeeded above; a missed path just keeps the old one.
    }
  }, [userId, refresh]);

  // Reload whenever the screen comes back into view (after a lesson, or after changing tracks).
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
  const chosen = tracks.filter((t) => t.chosen);
  const showPath = path && path.track.id === user.active_track_id ? path : null;

  async function switchTrack(id: string) {
    if (!user || id === user.active_track_id) return;
    setPath(null);
    try {
      const u = await api.setTracks(user.id, user.track_ids, id);
      await setUser(u);
      setPath(await api.path(user.id, id));
    } catch {
      load();
    }
  }

  function open(lesson: PathLesson) {
    router.push({ pathname: '/lesson', params: { id: lesson.id } });
  }

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
          <View style={styles.brand} accessibilityRole="header" accessibilityLabel="bitbybit">
            <Image source={require('../../assets/mark-b.png')} style={{ width: 17, height: 29 }} resizeMode="contain" />
            <Image source={require('../../assets/wordmark-light.png')} style={{ width: 92, height: 25 }} resizeMode="contain" />
          </View>
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Settings" style={styles.iconBtn}>
            <Icon name="settings" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <Card style={{ gap: space(3) }}>
          <View style={styles.between}>
            <View style={styles.streak}>
              <Icon name="flame" size={34} color={streak.current === 0 ? colors.faint : undefined} />
              <Text style={[styles.streakNumber, streak.current === 0 && { color: colors.faint }]}>{streak.current}</Text>
              <Text style={styles.streakLabel}>day streak</Text>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat} accessibilityLabel={`${streak.freezes} streak freezes`}>
                <Icon name="freeze" size={15} color={colors.ice} strokeWidth={2.4} />
                <Text style={styles.statText}>{streak.freezes}</Text>
              </View>
              <View style={styles.stat} accessibilityLabel={`Best streak ${streak.longest}`}>
                <Icon name="trophy" size={15} color={colors.muted} strokeWidth={2.4} />
                <Text style={styles.statText}>{streak.longest}</Text>
              </View>
            </View>
          </View>
          <ProgressBar value={done / user.daily_goal} color={user.goal_met_today ? colors.jade : colors.gold} height={14} />
          <Text style={[type.small, user.goal_met_today ? { color: colors.jadeText } : streak.at_risk ? { color: colors.gold } : null]}>
            {user.goal_met_today
              ? `${done} of ${user.daily_goal} cards. Goal done for today.`
              : streak.at_risk
                ? `${done} of ${user.daily_goal} cards. ${user.daily_goal - done} more keeps your streak.`
                : `${done} of ${user.daily_goal} cards today.`}
          </Text>
        </Card>

        {user.due_count > 0 ? (
          <Button
            title={`Review ${user.due_count} due card${user.due_count === 1 ? '' : 's'}`}
            variant="secondary"
            onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review' } })}
          />
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switcher} contentContainerStyle={styles.switcherRow}>
          {chosen.map((t) => {
            const on = t.id === user.active_track_id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => switchTrack(t.id)}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Icon name={trackIcon(t.icon)} size={18} color={on ? colors.pinkInk : colors.muted} />
                <Text style={[styles.tabText, on && { color: colors.pinkInk }]}>{t.title}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Choose tracks" onPress={() => router.push('/tracks')} style={styles.tab}>
            <Icon name="plus" size={18} color={colors.muted} />
            <Text style={styles.tabText}>Tracks</Text>
          </Pressable>
        </ScrollView>

        {showPath ? (
          <>
            <PathView path={showPath} onOpen={open} />
            {showPath.lessons_done === showPath.lessons_total ? (
              <Card style={styles.finished}>
                <Mascot mood="happy" size={96} />
                <Text style={[type.heading, { textAlign: 'center' }]}>{showPath.track.title} complete</Text>
                <Text style={[type.small, { textAlign: 'center' }]}>
                  More units are on the way. Pick another track, or replay a lesson to keep it fresh.
                </Text>
                <Button title="Choose tracks" onPress={() => router.push('/tracks')} style={{ alignSelf: 'stretch' }} />
              </Card>
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={colors.pink} style={{ marginTop: space(8) }} />
        )}

        {user.due_count === 0 && user.learned_count > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/lesson', params: { mode: 'review', practice: '1' } })}
            style={styles.practice}
            hitSlop={8}
          >
            <Icon name="review" size={18} color={colors.pink} />
            <Text style={styles.practiceText}>Practise what you’ve learned</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(4), paddingBottom: space(12) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakNumber: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38, color: colors.gold },
  streakLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.muted, marginLeft: 2 },
  stats: { flexDirection: 'row', gap: space(2) },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.cardRaised,
    borderRadius: 999,
    paddingHorizontal: space(3),
    paddingVertical: 5,
  },
  statText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  switcher: { marginHorizontal: -space(5), flexGrow: 0 },
  switcherRow: { paddingHorizontal: space(5), gap: space(2) },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  tabOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  finished: { alignItems: 'center', gap: space(2), marginTop: space(2) },
  practice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space(2) },
  practiceText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.pink },
});
