import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, Label } from '../components/ui';
import { api } from '../lib/api';
import { requestPermission, scheduleLocalReminders } from '../lib/notifications';
import { deviceTimezone, formatHour, GOALS, REMINDER_HOURS } from '../lib/prefs';
import { colors, radius, space } from '../lib/theme';
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
          <View style={{ gap: space(2), marginBottom: space(4) }}>
            <Text style={styles.logo}>⛁ Sysdrill</Text>
            <Text style={styles.title}>System design, five minutes a day.</Text>
            <Text style={styles.subtitle}>
              Short drills, spaced out so you remember them. Keep a streak, get a nudge when it's at risk.
            </Text>
          </View>

          <View>
            <Label>What should we call you?</Label>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <View>
            <Label>Daily goal</Label>
            <View style={styles.chips}>
              {GOALS.map((g) => (
                <Chip key={g} label={`${g} cards`} selected={goal === g} onPress={() => setGoal(g)} />
              ))}
            </View>
          </View>

          <View>
            <Label>Remind me at</Label>
            <View style={styles.chips}>
              {REMINDER_HOURS.map((h) => (
                <Chip key={h} label={formatHour(h)} selected={hour === h} onPress={() => setHour(h)} />
              ))}
            </View>
            <Text style={styles.hint}>Timezone: {timezone}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Start drilling" disabled={!name.trim()} loading={busy} onPress={start} style={{ marginTop: space(2) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(6), gap: space(6), paddingTop: space(10) },
  logo: { color: colors.accent, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900', lineHeight: 38 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  hint: { color: colors.muted, fontSize: 13, marginTop: space(2) },
  error: { color: colors.bad, fontSize: 15, lineHeight: 21 },
});
