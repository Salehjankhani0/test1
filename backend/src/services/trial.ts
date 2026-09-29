import type { UserRow } from './user.ts';
import { activeSubscription } from './subscription.ts';

export interface AccessStatus {
  hasAccess: boolean;
  trialActive: boolean;
  trialEnd: number | null;
  subscriptionActive: boolean;
  subscriptionEnd: number | null;
  subscriptionPlan: string | null;
  daysRemaining: number;
}

/** همیشه با ساعت سرور (Date.now() همین سرور) محاسبه می‌شود، نه چیزی که از Frontend می‌آید —
 *  بنابراین تغییر ساعت گوشی کاربر هیچ اثری روی این محاسبه ندارد. */
export async function computeAccess(user: UserRow): Promise<AccessStatus> {
  const now = Date.now();
  const trialActive = !!user.trial_end && user.trial_end > now;
  const sub = await activeSubscription(user.id);
  const subscriptionActive = !!sub;
  const hasAccess = trialActive || subscriptionActive;
  const endRef = subscriptionActive ? sub!.end_at : user.trial_end ?? now;
  const daysRemaining = hasAccess ? Math.max(0, Math.ceil((endRef - now) / (24 * 60 * 60 * 1000))) : 0;
  return {
    hasAccess,
    trialActive,
    trialEnd: user.trial_end,
    subscriptionActive,
    subscriptionEnd: sub?.end_at ?? null,
    subscriptionPlan: sub?.plan ?? null,
    daysRemaining,
  };
}
