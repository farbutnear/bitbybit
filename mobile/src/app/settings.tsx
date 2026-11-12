import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Label } from '../components/ui';
import { api, API_URL } from '../lib/api';
import {
  getPermissionStatus,
  isExpoGo,
  registerForServerPush,
  requestPermission,
  scheduleLocalReminders,
  sendTestLocalNotification,
  serverPushAvailability,
} from '../lib/notifications';
import { deviceTimezone, formatHour, GOALS, REMINDER_HOURS } from '../lib/prefs';
import { colors, space } from '../lib/theme';
import { useUser } from '../lib/UserContext';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function Settings() {
  const { user, setUser, signOut } = useUser();
  const [permission, setPermission] = useState<string>('…');
  const [busy, setBusy] = useState<string | null>(null);
  const push = serverPushAvailability();
  const tz = deviceTimezone();

  useFocusEffect(
    useCallback(() => {
      getPermissionStatus().then(setPermission);
    }, []),
  );

  if (!user) return null;

  async function update(patch: Parameters<typeof api.updateUser>[1]) {
    const u = await api.updateUser(user!.id, patch);
    await setUser(u);
    await scheduleLocalReminders(u);
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      notify('Something went wrong', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      getPermissionStatus().then(setPermission);
    }
  }

  const mode = user.has_push ? 'Server push (backend worker)' : 'Local reminders on this device';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View>
        <Label>Daily goal</Label>
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <Chip key={g} label={`${g} cards`} selected={user.daily_goal === g} onPress={() => run('goal', () => update({ daily_goal: g }))} />
          ))}
        </View>
      </View>

      <View>
        <Label>Reminder time</Label>
        <View style={styles.chips}>
          {REMINDER_HOURS.map((h) => (
            <Chip
              key={h}
              label={formatHour(h)}
              selected={user.reminder_hour === h}
              onPress={() => run('hour', () => update({ reminder_hour: h, reminder_minute: 0 }))}
            />
          ))}
        </View>
      </View>

      <Card style={{ gap: space(3) }}>
        <Label>Notifications</Label>
        <Row k="Permission" v={permission} />
        <Row k="Reminders via" v={mode} />
        <Row k="Server push" v={push.available ? 'Available in this build' : push.reason!} />
        {permission !== 'granted' && permission !== 'unsupported' ? (
          <Button
            title="Allow notifications"
            variant="secondary"
            loading={busy === 'perm'}
            onPress={() =>
              run('perm', async () => {
                if (await requestPermission()) await scheduleLocalReminders(user);
                else notify('Notifications are off', 'Turn them on for bitbybit in your phone settings.');
              })
            }
          />
        ) : null}
        <Button
          title="Send test reminder in 5s"
          variant="secondary"
          loading={busy === 'local'}
          disabled={permission === 'unsupported'}
          onPress={() =>
            run('local', async () => {
              const ok = await sendTestLocalNotification(5);
              notify(ok ? 'Scheduled' : 'Not allowed', ok ? 'Lock your phone or switch apps to see it.' : 'Notification permission is off.');
            })
          }
        />
        {push.available && !user.has_push ? (
          <Button
            title="Enable server push"
            variant="secondary"
            loading={busy === 'push'}
            onPress={() =>
              run('push', async () => {
                const r = await registerForServerPush(user.id);
                notify(r.ok ? 'Done' : 'Could not enable', r.message);
                if (r.ok) await setUser(await api.getUser(user.id));
              })
            }
          />
        ) : null}
        {user.has_push ? (
          <Button
            title="Send test server push"
            variant="secondary"
            loading={busy === 'server'}
            onPress={() =>
              run('server', async () => {
                const r = await api.testServerPush(user.id);
                notify('Server push', r.detail ?? `Sent ${r.sent}, failed ${r.failed}${r.errors?.length ? `: ${r.errors.join(', ')}` : ''}`);
              })
            }
          />
        ) : null}
        {isExpoGo ? (
          <Text style={styles.note}>
            Running in Expo Go: reminders are local notifications scheduled on this phone. Server push needs a development build.
          </Text>
        ) : null}
      </Card>

      <Card style={{ gap: space(3) }}>
        <Label>Account</Label>
        <Row k="Name" v={user.name} />
        <Row k="Timezone" v={user.timezone} />
        {tz !== user.timezone ? (
          <Button
            title={`Switch to ${tz}`}
            variant="secondary"
            loading={busy === 'tz'}
            onPress={() => run('tz', () => update({ timezone: tz }))}
          />
        ) : null}
        <Row k="Server" v={API_URL} />
        <Button
          title="Reset this device"
          variant="bad"
          onPress={async () => {
            await signOut();
            router.replace('/onboarding');
          }}
        />
      </Card>
    </ScrollView>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.value}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space(5), gap: space(5), paddingBottom: space(12) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space(4) },
  key: { color: colors.muted, fontSize: 15 },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
