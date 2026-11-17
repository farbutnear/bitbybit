import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, trackIcon } from '../../components/Icon';
import { Mascot } from '../../components/Mascot';
import { PathView } from '../../components/PathView';
import { Button, Card } from '../../components/ui';
import { api, type PathLesson, type Track, type TrackPath } from '../../lib/api';
import { colors, fonts, radius, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

/** Learn: today's goal, your tracks, and the path of lessons for the active one. */
export default function Learn() {
  const { userId, user, error, refresh, setUser } = useUser();
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
      // A missed refresh keeps showing the last path; the next focus tries again.
    }
  }, [userId, refresh]);

  // Reload whenever the screen comes back into view (after a lesson, or after changing tracks).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!user) {
    return (
      <View style={styles.centered}>
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
      </View>
    );
  }

  const { streak } = user;
  const done = Math.min(user.today_count, user.daily_goal);
  const left = user.daily_goal - done;
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

  const goalLine = user.goal_met_today
    ? 'Goal done for today'
    : streak.at_risk
      ? `${left} more to keep your streak`
      : done > 0
        ? `${left} more to hit today’s goal`
        : `${user.daily_goal} cards starts a streak`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.topBar}>
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="bitbybit">
          <Image source={require('../../../assets/mark-b.png')} style={{ width: 17, height: 29 }} resizeMode="contain" />
          <Image source={require('../../../assets/wordmark-light.png')} style={{ width: 92, height: 25 }} resizeMode="contain" />
        </View>
        <View style={styles.pills}>
          <View style={styles.pill} accessibilityLabel={`${streak.current} day streak`}>
            <Icon name="flame" size={20} color={streak.current === 0 ? colors.faint : undefined} />
            <Text style={[styles.pillText, { color: streak.current ? colors.gold : colors.faint }]}>{streak.current}</Text>
          </View>
          <View style={styles.pill} accessibilityLabel={`${streak.freezes} streak freezes`}>
            <Icon name="freeze" size={17} color={colors.ice} strokeWidth={2.4} />
            <Text style={[styles.pillText, { color: colors.ice }]}>{streak.freezes}</Text>
          </View>
        </View>
      </View>

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
        <View style={styles.goal}>
          <GoalRing done={done} goal={user.daily_goal} met={user.goal_met_today} />
          <View style={{ flex: 1 }}>
            <Text style={styles.goalTitle}>{goalLine}</Text>
            <Text style={type.small}>
              {user.goal_met_today
                ? `${streak.current}-day streak. Extra reps still count.`
                : `${done} of ${user.daily_goal} cards done today.`}
            </Text>
          </View>
        </View>

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
                <Icon name={trackIcon(t.icon)} size={18} color={on ? colors.pink : colors.muted} />
                <Text style={[styles.tabText, on && { color: colors.text }]}>{t.title}</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

/** Today's cards as a ring that fills up, gold while in progress and jade once the goal is met. */
function GoalRing({ done, goal, met }: { done: number; goal: number; met: boolean }) {
  const size = 60;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, done / Math.max(1, goal));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {frac > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={met ? colors.jade : colors.gold}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * frac} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            fill="none"
          />
        ) : null}
      </Svg>
      {met ? (
        <Icon name="check" size={28} color={colors.jadeText} strokeWidth={3.4} />
      ) : (
        <Text style={styles.ringText}>
          {done}/{goal}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), paddingTop: space(2), gap: space(4), paddingBottom: space(10) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space(5),
    paddingVertical: space(3),
  },
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pills: { flexDirection: 'row', gap: space(2) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: space(3),
    paddingVertical: 6,
  },
  pillText: { fontFamily: fonts.displayBold, fontSize: 17 },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(4),
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space(4),
  },
  goalTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.text },
  ringText: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.text },
  switcher: { marginHorizontal: -space(5), flexGrow: 0 },
  switcherRow: { paddingHorizontal: space(5), gap: space(2) },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 999,
  },
  tabOn: { backgroundColor: colors.card },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  finished: { alignItems: 'center', gap: space(2), marginTop: space(2) },
});
