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

export type CardKind = 'mcq' | 'order' | 'numeric' | 'slider' | 'spot' | 'build' | 'match';

/** An architecture diagram: nodes on a small grid (x = column, y = row), edges, and optional animated request flows. */
export type DiagramNode = { id: string; kind: string; label?: string; note?: string; x: number; y: number };
export type Diagram = {
  nodes: DiagramNode[];
  edges: [string, string][];
  flows?: { path: string[]; speed: 'fast' | 'slow' }[];
};

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
  learned_count: number;
  has_push: boolean;
  active_track_id: string | null;
  track_ids: string[];
  bits: number;
  bits_earned: number;
  equipped: Record<Slot, string | null>;
  history: UptimeDay[];
};

/** One local day on the uptime bar. frozen = missed, but a streak freeze covered it. */
export type UptimeDay = { date: string; state: 'met' | 'frozen' | 'missed' | 'today'; count: number };

export type Slot = 'head' | 'face' | 'neck';
export type Rarity = 'common' | 'rare' | 'legendary';
export type Perk = 'second_try' | 'strike_option' | 'clear_node';
/** Charges left this session for the perks that are spent during play. */
export type PerkCharges = Record<Perk, number>;
export type PlaySession = { id: string; perks: PerkCharges };
export type Gear = {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  perk: string;
  blurb: string;
  owned: boolean;
  copies: number;
  equipped: boolean;
};
export type Loot = {
  bits: number;
  bits_earned: number;
  pack: {
    cost: number;
    size: number;
    odds: Record<Rarity, number>;
    pity_every: number;
    packs_until_guaranteed_legendary: number;
    duplicate_refund: Record<Rarity, number>;
    opened: number;
  };
  freeze: { cost: number; held: number; max: number };
  slots: Slot[];
  gear: Gear[];
};
export type PackCard = Omit<Gear, 'owned' | 'copies' | 'equipped'> & { new: boolean; refund: number };
export type OpenedPack = { cards: PackCard[]; bits: number; loot: Loot };

export type Track = {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  available: boolean;
  lessons_total: number;
  lessons_done: number;
  chosen: boolean;
  active: boolean;
};

export type LessonStatus = 'done' | 'next' | 'locked';
export type PathLesson = { id: string; title: string; status: LessonStatus; card_count: number };
export type PathUnit = { id: string; title: string; number: number; lessons: PathLesson[] };
export type TrackPath = {
  track: Pick<Track, 'id' | 'title' | 'blurb' | 'icon'>;
  units: PathUnit[];
  lessons_done: number;
  lessons_total: number;
};

export type TeachStep = { type: 'teach'; title: string; body: string; llama?: string; diagram?: Diagram };
export type CardStep = { type: 'card'; card: SessionCard };
export type Lesson = {
  id: string;
  title: string;
  track_id: string;
  unit_title: string;
  status: LessonStatus;
  steps: (TeachStep | CardStep)[];
  session: PlaySession;
};
export type LessonCompletion = {
  first_time: boolean;
  next_lesson: { id: string; title: string } | null;
  track_complete: boolean;
  lessons_done: number;
  lessons_total: number;
  bits_earned: number;
  bits: number;
};

export type SessionCard = {
  id: string;
  track_id: string;
  kind: CardKind;
  prompt: string;
  reason: 'due' | 'new' | 'ahead';
  options?: string[];
  diagram?: Diagram | null;
  items?: string[];
  unit?: string;
  hint?: string | null;
  min?: number;
  max?: number;
  bank?: string[];
  left?: string[];
  right?: string[];
};

export type ReviewQueue = {
  cards: SessionCard[];
  due_count: number;
  learned_count: number;
  next_due: string | null;
  session: PlaySession | null;
};

/** mcq: option index. order: items. numeric/slider: number. spot: node id. build: slot -> component. match: [left, right] pairs. */
export type Answer = number | string | string[] | Record<string, string> | [string, string][];

/** The Rollback cap caught a wrong answer: nothing was recorded or revealed, so the card is answered again. */
export type RolledBack = { rolled_back: true; correct: false; perks: PerkCharges };

export type ReviewResult = {
  rolled_back: false;
  assisted: boolean;
  bits_earned: number;
  bits: number;
  perks: PerkCharges | null;
  correct: boolean;
  correct_answer: Answer;
  explanation: string;
  next_due: string | null;
  today_count: number;
  goal_met_today: boolean;
  just_met_goal: boolean;
  streak: Streak;
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
  createUser: (body: { name: string; timezone: string; daily_goal: number; reminder_hour: number; track_ids: string[] }) =>
    request<UserSummary>('/users', { method: 'POST', body: json(body) }),
  getUser: (id: string) => request<UserSummary>(`/users/${id}`),
  updateUser: (id: string, body: Partial<Pick<UserSummary, 'name' | 'timezone' | 'daily_goal' | 'reminder_hour' | 'reminder_minute'>>) =>
    request<UserSummary>(`/users/${id}`, { method: 'PATCH', body: json(body) }),
  catalogue: () => request<Track[]>('/tracks'),
  tracks: (id: string) => request<Track[]>(`/users/${id}/tracks`),
  setTracks: (id: string, track_ids: string[], active_track_id?: string) =>
    request<UserSummary>(`/users/${id}/tracks`, { method: 'PUT', body: json({ track_ids, active_track_id }) }),
  path: (id: string, trackId: string) => request<TrackPath>(`/users/${id}/tracks/${trackId}/path`),
  lesson: (id: string, lessonId: string) => request<Lesson>(`/users/${id}/lessons/${lessonId}`),
  completeLesson: (id: string, lessonId: string) =>
    request<LessonCompletion>(`/users/${id}/lessons/${lessonId}/complete`, { method: 'POST' }),
  reviewQueue: (id: string, practice = false) =>
    request<ReviewQueue>(`/users/${id}/review${practice ? '?practice=true' : ''}`),
  review: (id: string, body: { card_id: string; answer: Answer; is_retry: boolean; duration_ms: number; session_id?: string }) =>
    request<ReviewResult | RolledBack>(`/users/${id}/reviews`, { method: 'POST', body: json(body) }),
  loot: (id: string) => request<Loot>(`/users/${id}/loot`),
  openPack: (id: string) => request<OpenedPack>(`/users/${id}/packs/open`, { method: 'POST' }),
  equip: (id: string, gearId: string, on: boolean) =>
    request<Loot>(`/users/${id}/gear/${gearId}/${on ? 'equip' : 'unequip'}`, { method: 'POST' }),
  buyFreeze: (id: string) => request<Loot>(`/users/${id}/shop/freeze`, { method: 'POST' }),
  usePerk: (id: string, body: { session_id: string; perk: 'strike_option' | 'clear_node'; card_id: string }) =>
    request<{ removed_option?: number; cleared_node?: string; perks: PerkCharges }>(`/users/${id}/perks/use`, {
      method: 'POST',
      body: json(body),
    }),
  registerPushToken: (id: string, token: string, platform: string) =>
    request<{ ok: boolean }>(`/users/${id}/push-tokens`, { method: 'POST', body: json({ token, platform }) }),
  testServerPush: (id: string) =>
    request<{ sent: number; failed: number; errors?: string[]; detail?: string }>(`/debug/users/${id}/test-push`, {
      method: 'POST',
    }),
};
