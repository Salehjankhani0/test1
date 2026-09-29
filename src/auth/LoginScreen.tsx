import { useState } from 'react';
import { api, ApiError } from './api.ts';
import { useAuth } from './AuthContext.tsx';

const ERR_FA: Record<string, string> = {
  invalid_phone: 'شمارهٔ موبایل معتبر نیست.',
  too_soon: 'کمی صبر کنید و دوباره تلاش کنید.',
  invalid_input: 'کد را کامل وارد کنید.',
  no_active_code: 'کدی برای این شماره فعال نیست، دوباره درخواست بدهید.',
  expired: 'کد منقضی شده، دوباره درخواست بدهید.',
  too_many_attempts: 'تعداد تلاش‌ها بیش از حد مجاز بود، دوباره درخواست بدهید.',
  wrong_code: 'کد وارد شده اشتباه است.',
  network_error: 'اتصال به سرور برقرار نشد.',
};

export function LoginScreen() {
  const { loginWithToken } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const requestOtp = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      await api.requestOtp(phone);
      setStep('code');
      setCooldown(60);
      const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
    } catch (e) {
      setErr(e instanceof ApiError ? (ERR_FA[e.code] ?? 'خطایی رخ داد.') : 'خطایی رخ داد.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (): Promise<void> => {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.verifyOtp(phone, code);
      await loginWithToken(r.token);
    } catch (e) {
      setErr(e instanceof ApiError ? (ERR_FA[e.code] ?? 'خطایی رخ داد.') : 'خطایی رخ داد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>ورود به برش‌یار شیشه</h1>
        {step === 'phone' ? (
          <>
            <p className="auth-hint">شمارهٔ موبایل خود را وارد کنید تا کد ورود برایتان پیامک شود.</p>
            <input
              className="cell auth-input"
              inputMode="tel"
              placeholder="09xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && phone && requestOtp()}
              dir="ltr"
              autoFocus
            />
            {err ? <div className="auth-err">{err}</div> : null}
            <button className="btn btn-primary" disabled={busy || !phone} onClick={requestOtp}>
              {busy ? 'در حال ارسال…' : 'ارسال کد'}
            </button>
          </>
        ) : (
          <>
            <p className="auth-hint">
              کد ارسال‌شده به <b dir="ltr">{phone}</b> را وارد کنید.
            </p>
            <input
              className="cell auth-input"
              inputMode="numeric"
              placeholder="کد ۶ رقمی"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && code && verify()}
              dir="ltr"
              autoFocus
            />
            {err ? <div className="auth-err">{err}</div> : null}
            <button className="btn btn-primary" disabled={busy || !code} onClick={verify}>
              {busy ? 'در حال بررسی…' : 'تأیید و ورود'}
            </button>
            <div className="auth-row">
              <button className="btn btn-ghost" onClick={() => setStep('phone')}>
                تغییر شماره
              </button>
              <button className="btn btn-ghost" disabled={cooldown > 0 || busy} onClick={requestOtp}>
                {cooldown > 0 ? `ارسال مجدد (${cooldown})` : 'ارسال مجدد کد'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
