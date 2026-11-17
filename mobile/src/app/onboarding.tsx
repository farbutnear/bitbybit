import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LlamaStage } from '../components/StatusBoard';
import { TrackPicker } from '../components/TrackPicker';
import { Button, Chip } from '../components/ui';
import { api, type Track } from '../lib/api';
import { requestPermission, scheduleLocalReminders } from '../lib/notifications';
import { deviceTimezone, formatHour, GOALS, REMINDER_HOURS } from '../lib/prefs';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

/** Two steps: choose what to learn, then name, daily goal and reminder time. */
export default function Onboarding() {
  const { setUser } = useUser();
  const [step, setStep] = useState<'tracks' | 'details'>('tracks');
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(5);
  const [hour, setHour] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = deviceTimezone();

  const loadTracks = useCallback(() => {
    api
      .catalogue()
      .then((all) => {
        setTracks(all);
        setError(null);
        // Beginners start with the first track that has lessons; they can change it straight away.
        const first = all.find((t) => t.available);
        setPicked((p) => (p.length ? p : first ? [first.id] : []));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    loadTracks();
  }, [loadTracks]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.createUser({
        name: name.trim(),
        timezone,
        daily_goal: goal,
        reminder_hour: hour,
        track_ids: picked,
      });
      await setUser(user);
      if (await requestPermission()) await scheduleLocalReminders(user);
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'tracks' ? (
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.hero}>
              <Image
                source={require('../../assets/logo-light.png')}
                style={{ width: 110, height: 96 }}
                resizeMode="contain"
                accessibilityLabel="bitbybit"
              />
              <Text style={[type.small, { fontSize: 16 }]}>System design, one bit at a time.</Text>
            </View>

            <View style={{ gap: space(1) }}>
              <Text style={type.title}>What do you want to get good at?</Text>
              <Text style={[type.small, { fontSize: 16 }]}>Pick one or more. You can change this any time.</Text>
            </View>

            {tracks ? (
              <TrackPicker tracks={tracks} selected={picked} onToggle={toggle} />
            ) : error ? (
              <View style={{ gap: space(3) }}>
                <Text style={[type.small, { color: colors.rubyText }]}>{error}</Text>
                <Button title="Try again" variant="secondary" onPress={loadTracks} />
              </View>
            ) : (
              <ActivityIndicator color={colors.pink} style={{ marginVertical: space(8) }} />
            )}

            <Button title="Continue" disabled={!tracks || picked.length === 0} onPress={() => setStep('details')} />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => setStep('tracks')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.back}>Back</Text>
            </Pressable>

            <View style={styles.hero}>
              <LlamaStage size={140} />
              <Text style={[type.title, { textAlign: 'center' }]}>Set your pace</Text>
              <Text style={[type.small, styles.subtitle]}>
                A little every day beats a lot once. The llama will keep you honest.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>What should we call you?</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Asher"
                placeholderTextColor={colors.faint}
                style={styles.input}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Cards per day</Text>
              <View style={styles.chips}>
                {GOALS.map((g) => (
                  <Chip key={g} label={`${g}`} selected={goal === g} onPress={() => setGoal(g)} />
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Remind me at</Text>
              <View style={styles.chips}>
                {REMINDER_HOURS.map((h) => (
                  <Chip key={h} label={formatHour(h)} selected={hour === h} onPress={() => setHour(h)} />
                ))}
              </View>
              <Text style={[type.tiny, { marginTop: space(2) }]}>Your time zone: {timezone}</Text>
            </View>

            {error ? <Text style={[type.small, { color: colors.rubyText }]}>{error}</Text> : null}

            <Button title="Start learning" disabled={!name.trim()} loading={busy} onPress={start} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(6), gap: space(6), paddingBottom: space(10) },
  hero: { alignItems: 'center', gap: space(2) },
  subtitle: { textAlign: 'center', fontSize: 16, lineHeight: 23, maxWidth: 320 },
  back: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.pink },
  field: { gap: space(3) },
  label: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bodyBold,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
});
