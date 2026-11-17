import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, trackIcon } from '../../components/Icon';
import { Mascot } from '../../components/Mascot';
import { BitsPill } from '../../components/Bits';
import { Chamfer } from '../../components/shapes';
import { StatusBoard } from '../../components/StatusBoard';
import { SystemMap } from '../../components/SystemMap';
import { Button, Card } from '../../components/ui';
import { api, type PathLesson, type SimOverview, type Track, type TrackPath } from '../../lib/api';
import { useLoop, useReduceMotion } from '../../lib/motion';
import { play } from '../../lib/sound';
import { colors, fonts, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

/** Learn: the status board, your tracks, and the active track drawn as a system you bring online. */
export default function Learn() {
  const { userId, user, error, refresh, setUser } = useUser();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [path, setPath] = useState<TrackPath | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sims, setSims] = useState<SimOverview | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const u = await refresh();
    api
      .simOverview(userId)
      .then(setSims)
      .catch(() => {});
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

  const upNext = showPath?.units.flatMap((u) => u.lessons).find((l) => l.status === 'next') ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.topBar}>
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="bitbybit">
          <Image source={require('../../../assets/mark-b.png')} style={{ width: 17, height: 29 }} resizeMode="contain" />
          <Image source={require('../../../assets/wordmark-light.png')} style={{ width: 92, height: 25 }} resizeMode="contain" />
        </View>
        <View style={styles.pills}>
          <BitsPill bits={user.bits} />
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
        <StatusBoard user={user} />
        {sims ? <Incident incident={sims.incident} /> : null}

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
            <SystemMap key={showPath.track.id} path={showPath} onOpen={open} />
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
      {upNext ? <Continue title={upNext.title} onPress={() => open(upNext)} /> : null}
    </SafeAreaView>
  );
}

/** Today's incident: a failing system to fix in the simulator. The light blinks until it is resolved. */
function Incident({ incident }: { incident: SimOverview['incident'] }) {
  const reduce = useReduceMotion();
  const t = useLoop(1400, 0, !incident.solved && !reduce);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${incident.title}. ${incident.solved ? 'Resolved today' : `Respond for ${incident.bits} bits`}`}
      onPress={() => {
        play('tap');
        router.push({ pathname: '/sim', params: { id: 'incident' } });
      }}
    >
      <Chamfer cut={12} fill={colors.card} stroke={incident.solved ? colors.jadeDark : colors.gold} style={styles.incident}>
        <Animated.View
          style={[
            styles.incidentLed,
            { backgroundColor: incident.solved ? colors.jade : colors.gold, opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.25, 1] }) },
          ]}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.incidentTitle} numberOfLines={1}>
            {incident.title}
          </Text>
          <Text style={type.tiny}>{incident.solved ? 'Resolved today. Another one tomorrow.' : `Respond in the simulator for +${incident.bits} bits`}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="All sims"
          hitSlop={8}
          onPress={() => {
            play('tap');
            router.push('/lab');
          }}
          style={styles.lab}
        >
          <Text style={styles.labText}>All sims</Text>
        </Pressable>
      </Chamfer>
    </Pressable>
  );
}

/** The one-tap way into the next lesson. It breathes a little so the eye finds it. */
function Continue({ title, onPress }: { title: string; onPress: () => void }) {
  const reduce = useReduceMotion();
  const t = useLoop(2600, 0, !reduce);
  return (
    <Animated.View style={[styles.cta, { transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.025, 1] }) }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue: ${title}`}
        onPress={() => {
          play('tap');
          onPress();
        }}
        style={({ pressed }) => (pressed ? { transform: [{ translateY: 3 }] } : null)}
      >
        <Chamfer cut={12} fill={colors.pink} edge={colors.pinkDark} edgeHeight={5} style={styles.ctaFace}>
          <Icon name="play" size={18} color={colors.pinkInk} strokeWidth={1.5} />
          <Text style={styles.ctaText} numberOfLines={1}>
            Continue: {title}
          </Text>
        </Chamfer>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), paddingTop: space(2), gap: space(4), paddingBottom: space(24) },
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
  incident: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), paddingHorizontal: space(4) },
  incidentLed: { width: 10, height: 10, borderRadius: 5 },
  incidentTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  lab: { backgroundColor: colors.cardRaised, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: 6 },
  labText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  cta: { position: 'absolute', left: space(5), right: space(5), bottom: space(3) },
  ctaFace: { height: 56, paddingBottom: 5, paddingHorizontal: space(4), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { flexShrink: 1, fontFamily: fonts.display, fontSize: 17, color: colors.pinkInk },
});
