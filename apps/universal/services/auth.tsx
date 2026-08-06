import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as api from '@/services/api';
import {
  clearTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeTokens,
} from '@/services/tokenStorage';

type AuthContextValue = {
  user: api.AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  setSession: (accessToken: string, refreshToken: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof atob !== 'function') {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === 'number' ? data.exp : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapped = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  const applySession = useCallback(
    async (nextAccess: string, nextRefresh: string, nextUser: api.AuthUser) => {
      await storeTokens(nextAccess, nextRefresh);
      setAccessToken(nextAccess);
      setUser(nextUser);
      clearRefreshTimer();

      const exp = decodeJwtExp(nextAccess);
      if (exp) {
        const msUntilRefresh = exp * 1000 - Date.now() - 60_000;
        if (msUntilRefresh > 0) {
          refreshTimer.current = setTimeout(() => {
            void refreshAuthRef.current?.();
          }, msUntilRefresh);
        }
      }
    },
    [clearRefreshTimer]
  );

  const refreshAuthRef = useRef<(() => Promise<boolean>) | null>(null);

  const refreshAuth = useCallback(async (): Promise<boolean> => {
    const storedRefresh = await getStoredRefreshToken();
    if (!storedRefresh) {
      await clearTokens();
      setAccessToken(null);
      setUser(null);
      return false;
    }

    try {
      const tokens = await api.refreshToken(storedRefresh);
      const me = await api.getMe(tokens.accessToken);
      await applySession(tokens.accessToken, tokens.refreshToken, me.user);
      return true;
    } catch {
      clearRefreshTimer();
      await clearTokens();
      setAccessToken(null);
      setUser(null);
      return false;
    }
  }, [applySession, clearRefreshTimer]);

  refreshAuthRef.current = refreshAuth;

  const setSession = useCallback(
    async (nextAccess: string, nextRefresh: string) => {
      const me = await api.getMe(nextAccess);
      await applySession(nextAccess, nextRefresh, me.user);
    },
    [applySession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.login(email, password);
      await applySession(result.accessToken, result.refreshToken, result.user);
    },
    [applySession]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password);
      const result = await api.login(email, password);
      await applySession(result.accessToken, result.refreshToken, result.user);
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    clearRefreshTimer();
    const storedRefresh = await getStoredRefreshToken();
    if (storedRefresh) {
      try {
        await api.logout(storedRefresh);
      } catch {
        // Still clear local session if server logout fails.
      }
    }
    await clearTokens();
    setAccessToken(null);
    setUser(null);
  }, [clearRefreshTimer]);

  useEffect(() => {
    if (bootstrapped.current) {
      return;
    }
    bootstrapped.current = true;

    (async () => {
      try {
        const existingAccess = await getStoredAccessToken();
        const existingRefresh = await getStoredRefreshToken();

        if (existingAccess) {
          try {
            const me = await api.getMe(existingAccess);
            if (existingRefresh) {
              await applySession(existingAccess, existingRefresh, me.user);
            } else {
              setAccessToken(existingAccess);
              setUser(me.user);
            }
            return;
          } catch {
            // Fall through to refresh.
          }
        }

        if (existingRefresh) {
          await refreshAuth();
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      clearRefreshTimer();
    };
  }, [applySession, clearRefreshTimer, refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      login,
      register,
      logout,
      refreshAuth,
      setSession,
    }),
    [user, accessToken, isLoading, login, register, logout, refreshAuth, setSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
