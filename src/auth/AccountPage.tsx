import { useEffect, useState } from 'react';
import { api } from './api.ts';
import type { Plan } from './api.ts';
import { useAuth } from './AuthContext.tsx';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/ui.tsx';

const PLAN_FA: Record<string, string> = { '6m': '۶ ماهه', '12m': '۱ ساله' };
const PLAN_PRICE: Record<string, string> = { '6m': '۲۰۰', '12m': '۳۵۰' };
const DAY_MS = 86_400_000;

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString('fa-IR');
  }
}

export function AccountPage(props: { onClose: () => void }) {
  const { account, refresh, logout } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.plans().then(setPlans).catch(() => undefined);
  }, []);

  const buy = async (plan: Plan['plan']): Promise<void> => {
    setErr(null);
    setBusyPlan(plan);
    try {
      await api.purchase(plan);
      await refresh();
    } catch {
      setErr('خرید اشتراک انجام نشد، دوباره تلاش کنید.');
    } finally {
      setBusyPlan(null);
    }
  };

  if (!account) return null;

  const planName = account.subscription.plan ? (PLAN_FA[account.subscription.plan] ?? account.subscription.plan) : 'بدون اشتراک';
  // once a subscription is actually active, hide the purchase section entirely — it only
  // reappears once the current one runs out (subscription.active flips back to false)
  const subscribed = account.subscription.active;
  const daysLeft = subscribed && account.subscription.end ? Math.max(0, Math.ceil((account.subscription.end - Date.now()) / DAY_MS)) : null;
  const trialDaysLeft = account.trial.active && account.trial.end ? Math.max(0, Math.ceil((account.trial.end - Date.now()) / DAY_MS)) : 0;

  return (
    <Modal title="حساب من" onClose={props.onClose}>
      <div className="acc-wrap">
        <div className="acc-id">
          <span className="acc-avatar">
            <Icon name="user" size={20} />
          </span>
          <div className="acc-id-text">
            <b dir="ltr" className="num">
              {account.phone}
            </b>
            <span className={`acc-badge ${account.hasAccess ? 'ok' : 'bad'}`}>
              <i />
              {account.hasAccess ? 'حساب فعال' : 'نیاز به فعال‌سازی'}
            </span>
          </div>
        </div>

        <section className="card acc-card">
          <div className="acc-row">
            <span>
              <Icon name="shieldCheck" size={14} /> اشتراک
            </span>
            <b>{planName}</b>
          </div>
          <div className="acc-row">
            <span>پایان اعتبار</span>
            <b>{fmtDate(account.subscription.end)}</b>
          </div>
          {daysLeft !== null ? (
            <div className="acc-row">
              <span>روزهای باقی‌مانده</span>
              <b>{daysLeft} روز</b>
            </div>
          ) : null}
          <div className="acc-row">
            <span>دوره آزمایشی</span>
            <b>{account.trial.active ? 'فعال — ۱۰ روزه' : 'پایان یافته'}</b>
          </div>
          <div className="acc-row">
            <span>پایان دوره آزمایشی</span>
            <b>{fmtDate(account.trial.end)}</b>
          </div>
          {account.trial.active ? (
            <div className="acc-row">
              <span>روزهای باقی‌مانده Trial</span>
              <b>{trialDaysLeft} روز</b>
            </div>
          ) : null}
        </section>

        {!subscribed ? (
          <section className="card acc-card acc-buy">
            <div className="acc-card-title">خرید اشتراک</div>
            {err ? <div className="auth-err">{err}</div> : null}
            <div className="acc-plans">
              {plans.map((p) => {
                const featured = p.plan === '12m';
                return (
                  <button key={p.plan} className={`acc-plan ${featured ? 'featured' : ''}`} disabled={busyPlan !== null} onClick={() => buy(p.plan)}>
                    {featured ? <span className="acc-tag">پیشنهادی</span> : null}
                    <b>{p.label}</b>
                    <div className="acc-plan-price">
                      <strong className="num">{PLAN_PRICE[p.plan] ?? '—'}</strong>
                      <span>تومان</span>
                    </div>
                    <small>{p.days} روز دسترسی</small>
                    <span className="acc-plan-cta">{busyPlan === p.plan ? 'در حال پردازش…' : 'خرید'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <button className="btn btn-danger acc-logout" onClick={logout}>
          <Icon name="logout" size={15} /> خروج از حساب
        </button>
      </div>
    </Modal>
  );
}
