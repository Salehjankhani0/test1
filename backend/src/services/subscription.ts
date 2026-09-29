import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { db } from '../db.ts';

export type Plan = '6m' | '12m';
export const PLAN_DAYS: Record<Plan, number> = { '6m': 180, '12m': 365 };
export const PLAN_LABEL: Record<Plan, string> = { '6m': '۶ ماهه', '12m': '۱ ساله' };

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: Plan;
  start_at: number;
  end_at: number;
  status: 'active' | 'expired' | 'cancelled';
  payment_id: string | null;
  created_at: number;
}

/** آخرین اشتراکی که هنوز (طبق ساعت سرور) منقضی نشده — اگر نباشد یعنی کاربر اشتراک فعال ندارد */
export async function activeSubscription(userId: string): Promise<SubscriptionRow | undefined> {
  const now = Date.now();
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT * FROM subscriptions WHERE user_id = ? AND end_at > ? ORDER BY end_at DESC LIMIT 1',
    [userId, now],
  );
  return (rows[0] as SubscriptionRow | undefined) ?? undefined;
}

/** یک اشتراک تازه فعال می‌کند — فقط بعد از اینکه Backend پرداخت را معتبر دانست صدا زده می‌شود
 *  (هرگز مستقیم از Frontend). اگر کاربر از قبل اشتراک فعال دارد، دورهٔ جدید از انتهای دورهٔ
 *  فعلی شروع می‌شود، نه از الان (تمدید، نه جایگزینی). */
export async function activateSubscription(userId: string, plan: Plan, paymentId: string | null): Promise<SubscriptionRow> {
  const now = Date.now();
  const cur = await activeSubscription(userId);
  const startAt = cur ? cur.end_at : now;
  const endAt = startAt + PLAN_DAYS[plan] * 24 * 60 * 60 * 1000;
  const id = randomUUID();
  await db.execute(
    'INSERT INTO subscriptions (id, user_id, plan, start_at, end_at, status, payment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, userId, plan, startAt, endAt, 'active', paymentId, now],
  );
  return { id, user_id: userId, plan, start_at: startAt, end_at: endAt, status: 'active', payment_id: paymentId, created_at: now };
}
