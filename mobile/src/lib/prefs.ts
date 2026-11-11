import { getCalendars } from 'expo-localization';

export const GOALS = [3, 5, 10];
export const REMINDER_HOURS = [8, 12, 18, 20, 22];

export function formatHour(h: number) {
  const suffix = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${suffix}`;
}

export function deviceTimezone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
