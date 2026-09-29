import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { db } from '../db.ts';
import { env } from '../lib/env.ts';

export interface UserRow {
  id: string;
  phone: string;
  created_at: number;
  trial_start: number | null;
  trial_end: number | null;
  trial_used: number;
}

export async function findUserByPhone(phone: string): Promise<UserRow | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM users WHERE phone = ?', [phone]);
  return (rows[0] as UserRow | undefined) ?? undefined;
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const [rows] = await db.execute<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [id]);
  return (rows[0] as UserRow | undefined) ?? undefined;
}

/** کاربر جدید را می‌سازد و بلافاصله دورهٔ آزمایشی ۱۰روزه را شروع می‌کند — هر شماره فقط یک‌بار،
 *  چون trial_used روی همین ردیف در Database (نه مرورگر) ذخیره می‌شود و با پاک‌کردن Cache،
 *  نصب مجدد برنامه یا استفاده از مرورگر دیگر هرگز از نو شروع نمی‌شود؛ تاریخ‌ها هم از ساعت
 *  سرور (Date.now() همین‌جا روی سرور) محاسبه می‌شوند، نه ساعت گوشی کاربر. */
export async function getOrCreateUser(phone: string): Promise<UserRow> {
  const existing = await findUserByPhone(phone);
  if (existing) return existing;
  const now = Date.now();
  const trialEnd = now + 10 * 24 * 60 * 60 * 1000;
  const id = randomUUID();
  await db.execute('INSERT INTO users (id, phone, created_at, trial_start, trial_end, trial_used) VALUES (?, ?, ?, ?, ?, 1)', [id, phone, now, now, trialEnd]);
  return (await findUserById(id))!;
}
