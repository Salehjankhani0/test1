import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import type { AuthedRequest } from '../middleware/auth.ts';
import { findUserById } from '../services/user.ts';
import { computeAccess } from '../services/trial.ts';

const router = Router();

/** GET /api/account — شماره، وضعیت Trial، وضعیت اشتراک، روزهای باقی‌مانده.
 *  فقط برای صاحب توکن (req.userId از JWT می‌آید، نه از پارامتر ورودی) — یعنی کسی نمی‌تواند
 *  با تغییر یک id در URL اطلاعات کاربر دیگری را ببیند. */
router.get('/', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user) return res.status(404).json({ error: 'not_found' });
    const access = await computeAccess(user);
    res.json({
      phone: user.phone,
      trial: { start: user.trial_start, end: user.trial_end, active: access.trialActive },
      subscription: { active: access.subscriptionActive, end: access.subscriptionEnd, plan: access.subscriptionPlan },
      hasAccess: access.hasAccess,
      daysRemaining: access.daysRemaining,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
