import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken, ApiError } from './api.ts';
import type { AccountInfo } from './api.ts';

interface AuthState {
  loading: boolean;
  authed: boolean;
  account: AccountInfo | null;
  error: string | null;
  refresh: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);
const ACCOUNT_CACHE_KEY = 'brw.accountCache';
function readCachedAccount(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_CACHE_KEY);
    return raw ? JSON.parse(raw) as AccountInfo : null;
  } catch { return null; }
}
function cacheAccount(account: AccountInfo | null): void {
  try {
    if (account) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch { /* storage may be unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(() => readCachedAccount());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setAuthed(false);
      setAccount(null);
      setLoading(false);
      return;
    }
    try {
      const acc = await api.account();
      setAccount(acc);
      cacheAccount(acc);
      setAuthed(true);
      setError(null);
    } catch (e) {
      // خطای شبکه/سرور موقت نباید نشست کاربر را پاک کند؛ اطلاعات آخرین حساب برای حالت آفلاین می‌ماند.
      if (e instanceof ApiError && (e.code === 'unauthorized' || e.code === 'token_expired')) {
        setToken(null);
        setAuthed(false);
        setAccount(null);
        cacheAccount(null);
      } else {
        const cached = readCachedAccount();
        if (cached) {
          setAccount(cached);
          setAuthed(true);
        } else {
          // بدون اطلاعات حساب ذخیره‌شده، صفحه ورود نمایش داده می‌شود؛ توکن را پاک نمی‌کنیم.
          setError('اتصال به سرور برقرار نشد. برای بررسی اشتراک به اینترنت وصل شوید.');
          setAuthed(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loginWithToken = useCallback(
    async (token: string) => {
      setToken(token);
      setLoading(true);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
    setAccount(null);
    cacheAccount(null);
  }, []);

  const value = useMemo<AuthState>(() => ({ loading, authed, account, error, refresh, loginWithToken, logout }), [loading, authed, account, error, refresh, loginWithToken, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth باید داخل AuthProvider استفاده شود');
  return v;
}
