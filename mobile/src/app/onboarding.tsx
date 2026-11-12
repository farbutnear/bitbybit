import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../components/Mascot';
import { Button, Chip } from '../components/ui';
import { api } from '../lib/api';
import { requestPermission, scheduleLocalReminders } from '../lib/notifications';
import { deviceTimezone, formatHour, GOALS, REMINDER_HOURS } from '../lib/prefs';
import { colors, fonts, radius, space, type } from '../lib/theme';
import { useUser } from '../lib/UserContext';

export default function Onboarding() {
  const { setUser } = useUser();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(5);
  const [hour, setHour] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = deviceTimezone();

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.createUser({ name: name.trim(), timezone, daily_goal: goal, reminder_hour: hour });
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Mascot mood="idle" size={150} />
            <Text style={styles.wordmark}>bitbybit</Text>
            <Text style={[type.title, { textAlign: 'center' }]}>System design, one bit at a time.</Text>
            <Text style={[type.small, styles.subtitle]}>
              Five-minute drills that come back right before you’d forget them. Keep a streak going.
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(6), gap: space(6), paddingBottom: space(10) },
  hero: { alignItems: 'center', gap: space(2) },
  wordmark: { fontFamily: fonts.displayBold, fontSize: 22, color: colors.pink, marginTop: space(1) },
  subtitle: { textAlign: 'center', fontSize: 16, lineHeight: 23, maxWidth: 320 },
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
