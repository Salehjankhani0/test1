import type { Project, Settings } from '../domain/model.ts';

/** بخش‌هایی که بعد از پایان Trial تا خرید اشتراک قفل می‌مانند */
export const PREMIUM_NOTE = 'این قابلیت نیازمند اشتراک است';

/** تنظیمات پولی را برای کاربر بدون دسترسی به مقدار پیش‌فرض برمی‌گرداند.
 *  مقدار ذخیره‌شدهٔ پروژه دست‌نخورده می‌ماند؛ فقط نسخهٔ «مؤثر» ساخته می‌شود تا بعد از خرید
 *  اشتراک، انتخاب‌های قبلی کاربر برگردد. */
export function effectiveSettings(s: Settings, premium: boolean): Settings {
  if (premium) return s;
  return { ...s, priority: 'minWaste', cutDirection: 'auto', considerGrain: false, showLabels: false };
}

export function applyEntitlements(p: Project, premium: boolean): Project {
  if (premium) return p;
  return { ...p, settings: effectiveSettings(p.settings, premium) };
}
