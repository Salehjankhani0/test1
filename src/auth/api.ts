/**
 * آدرس Backend از متغیر محیطی VITE_API_BASE می‌آید (در build با --mode یا فایل .env تنظیم
 * می‌شود) — پیش‌فرض توسعه: http://localhost:4000. Frontend مستقیم به دیتابیس دسترسی ندارد،
 * فقط با همین API صحبت می‌کند.
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:4000';
const TOKEN_KEY = 'brw.authToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function call<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('network_error', 'اتصال به سرور برقرار نشد');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? 'unknown_error', data?.error);
  return data as T;
}

export interface AccountInfo {
  phone: string;
  trial: { start: number | null; end: number | null; active: boolean };
  subscription: { active: boolean; end: number | null; plan: string | null };
  hasAccess: boolean;
}
export interface Plan {
  plan: '6m' | '12m';
  days: number;
  label: string;
}

export const api = {
  requestOtp: (phone: string) => call<{ ok: true; expiresInSeconds: number }>('/api/auth/otp/request', { method: 'POST', body: { phone } }),
  verifyOtp: (phone: string, code: string) => call<{ ok: true; token: string }>('/api/auth/otp/verify', { method: 'POST', body: { phone, code } }),
  account: () => call<AccountInfo>('/api/account', { auth: true }),
  plans: () => call<Plan[]>('/api/subscription/plans'),
  purchase: (plan: Plan['plan']) => call<{ ok: true; subscription: { plan: string; start: number; end: number } }>('/api/subscription/purchase', { method: 'POST', auth: true, body: { plan } }),
};
