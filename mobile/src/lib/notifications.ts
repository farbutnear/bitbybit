/**
 * Notifications, two ways:
 *
 * 1. Local reminders (default). The phone schedules its own "practice today" reminders for
 *    the next 7 days at the user's reminder time, skipping today if the goal is already met.
 *    They're rescheduled every time the app opens or a goal is met. No Apple/Google push
 *    credentials needed, so this works in Expo Go on iPhone and Android.
 *
 * 2. Server push. In a development or store build (not Expo Go), the app registers an Expo
 *    push token with the backend. The backend's reminder worker then sends reminders, and
 *    local ones are switched off so the user never gets both.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, type UserSummary } from './api';

const CHANNEL_ID = 'reminders';
const LOCAL_PREFIX = 'reminder-';
const DAYS_AHEAD = 7;

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const notificationsSupported = Platform.OS !== 'web';

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Streak reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!notificationsSupported) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

export async function requestPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  await ensureAndroidChannel(); // Android 13+ only shows the prompt once a channel exists
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Why server push is or isn't available in this build. */
export function serverPushAvailability(): { available: boolean; reason?: string } {
  if (!notificationsSupported) return { available: false, reason: 'Not supported on web' };
  if (isExpoGo) return { available: false, reason: 'Expo Go does not support remote push. Use a development build.' };
  if (!Device.isDevice) return { available: false, reason: 'Push tokens need a physical device' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { available: false, reason: 'No EAS projectId. Run `npx eas-cli init` first.' };
  return { available: true };
}

export async function registerForServerPush(userId: string): Promise<{ ok: boolean; message: string }> {
  const avail = serverPushAvailability();
  if (!avail.available) return { ok: false, message: avail.reason! };
  if (!(await requestPermission())) return { ok: false, message: 'Notification permission was denied' };
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(userId, token, Platform.OS);
    await cancelLocalReminders(); // the server takes over
    return { ok: true, message: 'Server push enabled' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

async function cancelLocalReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(LOCAL_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

function reminderText(user: UserSummary, isToday: boolean): { title: string; body: string } {
  const remaining = Math.max(user.daily_goal - user.today_count, 1);
  if (isToday && user.streak.current > 0) {
    return {
      title: `🔥 Your ${user.streak.current}-day streak is on the line`,
      body: `${remaining} more card${remaining === 1 ? '' : 's'} keeps it alive.`,
    };
  }
  if (user.streak.current > 0) {
    return { title: '🔥 Keep the streak going', body: `A few cards today and it keeps growing.` };
  }
  return { title: 'Time for a quick drill', body: 'Five minutes of system design keeps the skills sharp.' };
}

/** (Re)schedule local reminders for the next week. Safe to call often. */
export async function scheduleLocalReminders(user: UserSummary): Promise<number> {
  if (!notificationsSupported) return 0;
  await cancelLocalReminders();
  if (user.has_push) return 0; // server push handles reminders for this user
  if ((await getPermissionStatus()) !== 'granted') return 0;
  await ensureAndroidChannel();

  const now = new Date();
  let count = 0;
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const at = new Date(now);
    at.setDate(now.getDate() + i);
    at.setHours(user.reminder_hour, user.reminder_minute, 0, 0);
    if (at <= now) continue;
    if (i === 0 && user.goal_met_today) continue; // already practiced today
    const { title, body } = reminderText(user, i === 0);
    await Notifications.scheduleNotificationAsync({
      identifier: `${LOCAL_PREFIX}${i}`,
      content: { title, body, sound: true, data: { type: 'reminder' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
    count++;
  }
  return count;
}

export async function sendTestLocalNotification(seconds = 5): Promise<boolean> {
  if (!(await requestPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: '🔥 Test reminder', body: 'Local notifications are working.', sound: true, data: { type: 'reminder' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
  return true;
}
