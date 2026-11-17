import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrackPicker } from '../components/TrackPicker';
import { Button } from '../components/ui';
import { api, type Track } from '../lib/api';
import { colors, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/** Change which tracks you're learning. Progress in a track you drop is kept. */
export default function Tracks() {
  const { userId, user, setUser } = useUser();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    api
      .tracks(userId)
      .then((all) => {
        setTracks(all);
        setPicked(all.filter((t) => t.chosen).map((t) => t.id));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!userId || !tracks) return;
    setBusy(true);
    try {
      const ids = tracks.filter((t) => picked.includes(t.id)).map((t) => t.id);
      await setUser(await api.setTracks(userId, ids));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const unchanged =
    !!tracks && picked.length === (user?.track_ids.length ?? 0) && picked.every((id) => user?.track_ids.includes(id));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[type.small, { fontSize: 16 }]}>
        Pick the areas you want on your home screen. Progress is kept if you drop one and come back.
      </Text>
      {tracks ? (
        <TrackPicker
          tracks={tracks}
          selected={picked}
          onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))}
        />
      ) : error ? null : (
        <ActivityIndicator color={colors.pink} style={{ marginVertical: space(8) }} />
      )}
      {error ? (
        <View style={{ gap: space(3) }}>
          <Text style={[type.small, { color: colors.rubyText }]}>{error}</Text>
          {!tracks ? <Button title="Try again" variant="secondary" onPress={load} /> : null}
        </View>
      ) : null}
      <Button title="Save tracks" disabled={!tracks || picked.length === 0 || unchanged} loading={busy} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(5), paddingBottom: space(12) },
});
