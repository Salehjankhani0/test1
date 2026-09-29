import type { ReactNode } from 'react';
import { useAuth } from './AuthContext.tsx';
import { LoginScreen } from './LoginScreen.tsx';

/** فقط ورود (OTP) را الزامی می‌کند. پایان Trial دیگر کل برنامه را قفل نمی‌کند — برش پایه
 *  همیشه در دسترس است و قابلیت‌های پولی (اولویت بهینه‌سازی، جهت برش/دانه، برچسب روی نقشه،
 *  خروجی‌ها و انبار) داخل خود App با `account.hasAccess` قفل/باز می‌شوند. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, authed } = useAuth();

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-loading">در حال بررسی حساب…</div>
      </div>
    );
  }

  if (!authed) return <LoginScreen />;
  return <>{children}</>;
}
