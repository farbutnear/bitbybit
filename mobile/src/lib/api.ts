import Constants from 'expo-constants';

/**
 * Where the backend lives.
 * 1. EXPO_PUBLIC_API_URL if set (use this for a deployed backend or with `expo start --tunnel`).
 * 2. Otherwise, the same machine that serves the JS bundle, on port 8000. When you scan the
 *    QR code, Expo tells the app your laptop's LAN IP, so this works on a phone on the same Wi-Fi.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return 'http://localhost:8000';
}

export const API_URL = resolveBaseUrl();

export type CardKind = 'mcq' | 'order' | 'numeric';

export type Streak = { current: number; longest: number; freezes: number; at_risk: boolean };

export type UserSummary = {
  id: string;
  name: string;
  timezone: string;
  daily_goal: number;
  reminder_hour: number;
  reminder_minute: number;
  streak: Streak;
  today_count: number;
  goal_met_today: boolean;
  due_count: number;
  has_push: boolean;
};

export type SessionCard = {
  id: string;
  skill_id: string;
  kind: CardKind;
  prompt: string;
  reason: 'due' | 'new' | 'ahead';
  options?: string[];
  diagram?: string | null;
  items?: string[];
  unit?: string;
  hint?: string | null;
};

export type Session = { cards: SessionCard[]; due_count: number; new_count: number };

export type Answer = number | string[];

export type ReviewResult = {
  correct: boolean;
  correct_answer: number | string[];
  explanation: string;
  next_due: string | null;
  today_count: number;
  goal_met_today: boolean;
  just_met_goal: boolean;
  streak: Streak;
};

export type SkillProgress = {
  id: string;
  title: string;
  total: number;
  seen: number;
  strong: number;
  mastery: number;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {}
      throw new ApiError(res.status, detail);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running?`);
  } finally {
    clearTimeout(timer);
  }
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  createUser: (body: { name: string; timezone: string; daily_goal: number; reminder_hour: number }) =>
    request<UserSummary>('/users', { method: 'POST', body: json(body) }),
  getUser: (id: string) => request<UserSummary>(`/users/${id}`),
  updateUser: (id: string, body: Partial<Pick<UserSummary, 'name' | 'timezone' | 'daily_goal' | 'reminder_hour' | 'reminder_minute'>>) =>
    request<UserSummary>(`/users/${id}`, { method: 'PATCH', body: json(body) }),
  getSession: (id: string) => request<Session>(`/users/${id}/session`),
  review: (id: string, body: { card_id: string; answer: Answer; is_retry: boolean; duration_ms: number }) =>
    request<ReviewResult>(`/users/${id}/reviews`, { method: 'POST', body: json(body) }),
  skills: (id: string) => request<SkillProgress[]>(`/users/${id}/skills`),
  registerPushToken: (id: string, token: string, platform: string) =>
    request<{ ok: boolean }>(`/users/${id}/push-tokens`, { method: 'POST', body: json({ token, platform }) }),
  testServerPush: (id: string) =>
    request<{ sent: number; failed: number; errors?: string[]; detail?: string }>(`/debug/users/${id}/test-push`, {
      method: 'POST',
    }),
};
