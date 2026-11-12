import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, ApiError, type UserSummary } from './api';
import { scheduleLocalReminders } from './notifications';

const KEY = 'bitbybit.userId';

type Ctx = {
  ready: boolean; // finished reading the saved user id
  userId: string | null;
  user: UserSummary | null;
  error: string | null;
  refresh: () => Promise<UserSummary | null>;
  setUser: (u: UserSummary) => Promise<void>;
  signOut: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUserState] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((id) => setUserId(id))
      .finally(() => setReady(true));
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(KEY);
    setUserId(null);
    setUserState(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return null;
    try {
      const u = await api.getUser(userId);
      setUserState(u);
      setError(null);
      scheduleLocalReminders(u).catch(() => {});
      return u;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // The server no longer knows this user (e.g. the dev database was reset).
        await signOut();
        return null;
      }
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [userId, signOut]);

  // No effect fetches the user here: screens call refresh() when they come into focus
  // (and on app foreground), which covers first load and every return to the app.

  const setUser = useCallback(async (u: UserSummary) => {
    await AsyncStorage.setItem(KEY, u.id);
    setUserId(u.id);
    setUserState(u);
  }, []);

  const value = useMemo(
    () => ({ ready, userId, user, error, refresh, setUser, signOut }),
    [ready, userId, user, error, refresh, setUser, signOut],
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): Ctx {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used inside <UserProvider>');
  return ctx;
}
