import { randomInt, createHash } from 'node:crypto';

export function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

export function hashOtp(code: string, phone: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

/** فرمت بین‌المللی سادهٔ ایران: 09xxxxxxxxx یا +989xxxxxxxxx را می‌پذیرد و به یک شکل یکسان
 *  (0912...) نگاشت می‌کند تا یک شماره با دو نگارش مختلف دو کاربر جدا نشود. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, '');
  let n = d;
  if (n.startsWith('+98')) n = '0' + n.slice(3);
  else if (n.startsWith('98') && n.length === 12) n = '0' + n.slice(2);
  if (!/^09\d{9}$/.test(n)) return null;
  return n;
}
