import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { AuthedRequest } from '../middleware/auth.ts';
import { PLAN_DAYS, PLAN_LABEL, activateSubscription } from '../services/subscription.ts';
import type { Plan } from '../services/subscription.ts';

const router = Router();

/** GET /api/subscription/plans — فهرست پلن‌ها (۶/۱۲ ماهه)، بدون نیاز به ورود */
router.get('/plans', (_req, res) => {
  res.json((Object.keys(PLAN_DAYS) as Plan[]).map((plan) => ({ plan, days: PLAN_DAYS[plan], label: PLAN_LABEL[plan] })));
});

/**
 * POST /api/subscription/purchase  { plan }
 *
 * مهم — طبق درخواست شما: پرداخت واقعی کافه‌بازار اینجا پیاده نشده (چون این محیط ساخت پروژه
 * اصلاً به اینترنت دسترسی ندارد و امکان تست واقعی IAP بازار وجود نداشت). این مسیر همان
 * "Interface"ای است که قرار بود آماده باشد تا بعداً فقط Provider پرداخت واقعی به آن اضافه شود:
 *
 *   ۱) یک رکورد payments با status='pending' ساخته می‌شود.
 *   ۲) [اینجا، در نسخهٔ واقعی] توکن خرید کافه‌بازار با API بازار Verify/Consume می‌شود.
 *   ۳) فقط اگر Verify موفق بود، status به 'verified' تغییر می‌کند و activateSubscription صدا
 *      زده می‌شود — یعنی Boolean فعال‌سازی هرگز مستقیم از Frontend نمی‌آید.
 *
 * فعلاً (چون Provider واقعی وصل نیست) مرحلهٔ ۲ با provider='manual' علامت‌گذاری و بلافاصله
 * verified می‌شود، تا بتوانید جریان کامل را تست کنید؛ وقتی IAP بازار را وصل کردید همین یک
 * تابع (verifyBazaarPurchase) را جایگزین کنید و بقیهٔ مسیر دست‌نخورده می‌ماند.
 */
router.post('/purchase', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const plan = String(req.body?.plan ?? '') as Plan;
    if (!(plan in PLAN_DAYS)) return res.status(400).json({ error: 'invalid_plan' });

    const paymentId = randomUUID();
    const now = Date.now();
    await db.execute(
      'INSERT INTO payments (id, user_id, provider, provider_ref, plan, amount, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [paymentId, req.userId, 'manual', null, plan, null, 'IRR', 'pending', now],
    );

    // --- اینجا جای verify واقعی است؛ فعلاً placeholder موفق فرض می‌شود ---
    const verified = true;
    if (!verified) {
      await db.execute("UPDATE payments SET status = 'failed' WHERE id = ?", [paymentId]);
      return res.status(402).json({ error: 'payment_not_verified' });
    }
    await db.execute("UPDATE payments SET status = 'verified', verified_at = ? WHERE id = ?", [Date.now(), paymentId]);

    const sub = await activateSubscription(req.userId!, plan, paymentId);
    res.json({ ok: true, subscription: { plan: sub.plan, start: sub.start_at, end: sub.end_at } });
  } catch (e) {
    next(e);
  }
});

export default router;
