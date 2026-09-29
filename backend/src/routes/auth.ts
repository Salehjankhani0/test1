import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { db } from '../db.ts';
import { env } from '../lib/env.ts';
import { generateOtp, hashOtp, normalizePhone } from '../lib/otp.ts';
import { makeSmsProvider } from '../lib/smsProvider.ts';
import { signToken } from '../lib/jwt.ts';
import { getOrCreateUser } from '../services/user.ts';

const router = Router();
const sms = makeSmsProvider(env.smsProvider, env.kavenegarApiKey, env.kavenegarTemplate);

const OTP_TTL_MS = 2 * 60 * 1000; // ۲ دقیقه اعتبار کد
const RESEND_COOLDOWN_MS = 60 * 1000; // ۶۰ ثانیه بین دو درخواست کد برای همان شماره
const MAX_ATTEMPTS = 5; // حداکثر تلاش برای واردکردن کد صحیح

/** POST /api/auth/otp/request  { phone } */
router.post('/otp/request', async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    if (!phone) return res.status(400).json({ error: 'invalid_phone' });

    const now = Date.now();
    const [lastRows] = await db.execute<RowDataPacket[]>('SELECT created_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1', [phone]);
    const last = lastRows[0] as { created_at: number } | undefined;
    if (last && now - last.created_at < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last.created_at)) / 1000);
      return res.status(429).json({ error: 'too_soon', retryAfterSeconds: wait });
    }

    const code = generateOtp();
    const id = randomUUID();
    await db.execute(
      'INSERT INTO otp_codes (id, phone, code_hash, created_at, expires_at, attempts, max_attempts, consumed) VALUES (?, ?, ?, ?, ?, 0, ?, 0)',
      [id, phone, hashOtp(code, phone), now, now + OTP_TTL_MS, MAX_ATTEMPTS],
    );

    sms.send(phone, `کد ورود برش‌یار شیشه: ${code} — تا ۲ دقیقه معتبر است.`).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('sms send failed', e);
    });

    res.json({ ok: true, expiresInSeconds: OTP_TTL_MS / 1000 });
  } catch (e) {
    next(e);
  }
});

/** POST /api/auth/otp/verify  { phone, code } */
router.post('/otp/verify', async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.body?.phone ?? ''));
    const code = String(req.body?.code ?? '').trim();
    if (!phone || !code) return res.status(400).json({ error: 'invalid_input' });

    const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM otp_codes WHERE phone = ? AND consumed = 0 ORDER BY created_at DESC LIMIT 1', [phone]);
    const row = rows[0] as { id: string; code_hash: string; expires_at: number; attempts: number; max_attempts: number } | undefined;
    if (!row) return res.status(400).json({ error: 'no_active_code' });

    const now = Date.now();
    if (now > row.expires_at) return res.status(400).json({ error: 'expired' });
    if (row.attempts >= row.max_attempts) return res.status(429).json({ error: 'too_many_attempts' });

    if (hashOtp(code, phone) !== row.code_hash) {
      await db.execute('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      const remaining = row.max_attempts - (row.attempts + 1);
      return res.status(400).json({ error: 'wrong_code', attemptsRemaining: Math.max(0, remaining) });
    }

    // کد صحیح بود — یک‌بارمصرف: بلافاصله consumed می‌شود تا با همین کد دوباره نتوان وارد شد
    await db.execute('UPDATE otp_codes SET consumed = 1 WHERE id = ?', [row.id]);

    const user = await getOrCreateUser(phone);
    const token = signToken({ sub: user.id, phone: user.phone });
    res.json({ ok: true, token });
  } catch (e) {
    next(e);
  }
});

export default router;
