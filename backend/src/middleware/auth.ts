import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.ts';
import { findUserById } from '../services/user.ts';

export interface AuthedRequest extends Request {
  userId?: string;
  phone?: string;
}

/** همهٔ روت‌های User/Trial/Subscription/Payment از این میدلور رد می‌شوند — بدون JWT معتبر
 *  هیچ‌کدام پاسخ نمی‌دهند، پس کاربر با دستکاری درخواست Frontend نمی‌تواند برای خودش
 *  اشتراک فعال کند یا اطلاعات کاربر دیگری را بخواند.
 *  Async است چون حالا findUserById یک کوئری MySQL می‌زند — خطای احتمالی دیتابیس را با
 *  try/catch به next(err) می‌دهیم، وگرنه در Express 4 یک Promise رد‌شده بی‌صدا گم می‌شود. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.userId = user.id;
    req.phone = user.phone;
    next();
  } catch (e) {
    next(e);
  }
}
