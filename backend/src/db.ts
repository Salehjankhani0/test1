/**
 * لایهٔ دیتابیس — MySQL (با mysql2/promise، از طریق یک Connection Pool).
 * برخلاف SQLite قبلی، MySQL یک سرور جداست؛ باید از قبل بالا باشد و دیتابیسش ساخته شده باشد
 * (مقادیر اتصال در .env — بخش MYSQL_*). چون این پروژه در محیطی بدون دسترسی به اینترنت/سرور
 * MySQL واقعی ساخته شده، این اتصال اینجا تست نشده — قبل از استفاده حتماً با MySQL واقعی خودتان
 * امتحانش کنید.
 *
 * جدول‌ها همانی هستند که با SQLite داشتیم، فقط با نوع‌دادهٔ MySQL:
 *  users          — هر ردیف یک شمارهٔ موبایل با وضعیت Trial و اشتراک فعلی
 *  otp_codes      — کدهای یک‌بارمصرف با زمان انقضا، تعداد تلاش و محدودیت درخواست مجدد
 *  subscriptions  — تاریخچهٔ کامل خریدهای اشتراک (نه فقط وضعیت فعلی)
 *  payments       — رکورد هر تراکنش پرداخت (برای اتصال بعدی به IAP کافه‌بازار)
 */
import mysql from 'mysql2/promise';
import { env } from './lib/env.ts';

export const db = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_general_ci',
});

/** جدول‌ها را (اگر از قبل نبودند) می‌سازد — قبل از بالا آمدن سرور یک‌بار صدا زده می‌شود.
 *  هر CREATE TABLE جدا اجرا می‌شود، نه یک رشتهٔ چندجمله‌ای، چون mysql2 به‌صورت پیش‌فرض
 *  چند دستور در یک کوئری را اجرا نمی‌کند. */
export async function ensureSchema(): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      created_at BIGINT NOT NULL,
      trial_start BIGINT NULL,
      trial_end BIGINT NULL,
      trial_used TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id VARCHAR(36) PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      code_hash VARCHAR(64) NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      consumed TINYINT NOT NULL DEFAULT 0,
      KEY idx_otp_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      plan VARCHAR(10) NOT NULL,
      start_at BIGINT NOT NULL,
      end_at BIGINT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      payment_id VARCHAR(36) NULL,
      created_at BIGINT NOT NULL,
      KEY idx_sub_user (user_id),
      CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      provider VARCHAR(20) NOT NULL,
      provider_ref VARCHAR(255) NULL,
      plan VARCHAR(10) NOT NULL,
      amount INT NULL,
      currency VARCHAR(8) DEFAULT 'IRR',
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      created_at BIGINT NOT NULL,
      verified_at BIGINT NULL,
      KEY idx_pay_user (user_id),
      CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
