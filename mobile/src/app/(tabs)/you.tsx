import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/Icon';
import { Mascot } from '../../components/Mascot';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { api, API_URL } from '../../lib/api';
import {
  getPermissionStatus,
  isExpoGo,
  registerForServerPush,
  requestPermission,
  scheduleLocalReminders,
  sendTestLocalNotification,
  serverPushAvailability,
} from '../../lib/notifications';
import { deviceTimezone, formatHour, GOALS, REMINDER_HOURS } from '../../lib/prefs';
import { play, setSoundPref, soundLibrary, useSoundPrefs } from '../../lib/sound';
import { colors, fonts, radius, space, type } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Your progress at a glance, plus every setting. */
export default function You() {
  const { user, setUser, signOut, refresh } = useUser();
  const sound = useSoundPrefs();
  const [permission, setPermission] = useState<string>('…');
  const [busy, setBusy] = useState<string | null>(null);
  const push = serverPushAvailability();
  const tz = deviceTimezone();

  useFocusEffect(
    useCallback(() => {
      refresh();
      getPermissionStatus().then(setPermission);
    }, [refresh]),
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

  const { streak } = user;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Mascot mood={user.goal_met_today ? 'happy' : 'idle'} size={96} />
        <View style={{ flex: 1 }}>
          <Text style={type.title}>{user.name}</Text>
          <Text style={type.small}>
            {user.learned_count === 0
              ? 'No cards learned yet. Your first lesson is waiting.'
              : `${user.learned_count} card${user.learned_count === 1 ? '' : 's'} learned so far.`}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Stat icon="flame" value={streak.current} label="day streak" tint={colors.gold} />
        <Stat icon="trophy" value={streak.longest} label="best streak" tint={colors.muted} />
        <Stat icon="freeze" value={streak.freezes} label={streak.freezes === 1 ? 'streak freeze' : 'streak freezes'} tint={colors.ice} />
        <Stat icon="review" value={user.due_count} label="due for review" tint={colors.jadeText} />
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/tracks')} style={styles.link}>
        <Icon name="learn" size={22} color={colors.pink} />
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>Your tracks</Text>
          <Text style={type.small}>
            {user.track_ids.length} chosen. Add or drop areas of system design.
          </Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>

      <View>
        <SectionTitle>Daily goal</SectionTitle>
        <View style={styles.chips}>
          {GOALS.map((g) => (
            <Chip key={g} label={`${g} cards`} selected={user.daily_goal === g} onPress={() => run('goal', () => update({ daily_goal: g }))} />
          ))}
        </View>
      </View>

      <View>
        <SectionTitle>Reminder time</SectionTitle>
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
        <SectionTitle>Sound</SectionTitle>
        <Toggle
          title="Sound effects"
          note="Taps, right and wrong answers, finishing a lesson."
          value={sound.effects}
          onChange={(v) => {
            setSoundPref('effects', v);
            if (v) play('right');
          }}
        />
        <Toggle
          title="Meme mode"
          note={
            soundLibrary.memes.length
              ? `A wrong answer plays a clip instead of the plain sound. ${soundLibrary.memes.length} in the pool.`
              : 'No clips yet. Add audio files to assets/sounds/memes.'
          }
          value={sound.memes && sound.effects}
          disabled={!sound.effects || !soundLibrary.memes.length}
          onChange={(v) => {
            setSoundPref('memes', v);
            if (v) play('wrong');
          }}
        />
        <Toggle
          title="Music"
          note={soundLibrary.usingPlaceholderMusic ? 'Playing the built-in loop.' : `Playing: ${soundLibrary.music.join(', ')}`}
          value={sound.music}
          onChange={(v) => setSoundPref('music', v)}
        />
        <Text style={styles.note}>Sound follows your phone’s silent switch.</Text>
      </Card>

      <Card style={{ gap: space(3) }}>
        <SectionTitle>Notifications</SectionTitle>
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
        <SectionTitle>Account</SectionTitle>
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
          variant="ruby"
          onPress={async () => {
            await signOut();
            router.replace('/onboarding');
          }}
        />
      </Card>
    </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, value, label, tint }: { icon: IconName; value: number; label: string; tint: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={24} color={icon === 'flame' ? undefined : tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.tiny}>{label}</Text>
    </View>
  );
}

function Toggle({
  title,
  note,
  value,
  disabled,
  onChange,
}: {
  title: string;
  note: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.toggle, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={type.small}>{note}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.pinkDark }}
        thumbColor={value ? colors.pink : colors.muted}
        ios_backgroundColor={colors.border}
        {...(Platform.OS === 'web' ? { activeThumbColor: colors.pink } : null)}
      />
    </View>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    padding: space(3),
    gap: 2,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  toggleTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  statValue: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 34, color: colors.text },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.border,
    padding: space(4),
  },
  linkTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  chev: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.faint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space(4) },
  key: { color: colors.muted, fontSize: 15, fontFamily: fonts.body },
  value: { color: colors.text, fontSize: 15, fontFamily: fonts.bodyBold, flexShrink: 1, textAlign: 'right' },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
});
