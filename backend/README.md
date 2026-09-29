# Backend — برش‌یار شیشه

API مستقل (Node.js + Express + TypeScript + MySQL) برای حساب کاربری، OTP، دورهٔ آزمایشی و اشتراک.
Frontend (وب یا در آینده Android) فقط با همین API کار می‌کند و مستقیماً به دیتابیس دسترسی ندارد.

## پیش‌نیاز: یک سرور MySQL

برخلاف نسخهٔ قبلی (SQLite که فایل‌محور و بدون نیاز به نصب چیزی بود)، این نسخه به یک سرور MySQL
واقعی نیاز دارد که از قبل بالا باشد — روی همین سیستم (MySQL/MariaDB نصب‌شده) یا یک سرور دیگر.
قبل از اجرا، یک‌بار دیتابیس خالی را بسازید:

```sql
CREATE DATABASE glass_cut CHARACTER SET utf8mb4;
```

جدول‌ها (`users`, `otp_codes`, `subscriptions`, `payments`) را خود برنامه هنگام بالا آمدن
(در `ensureSchema()`) می‌سازد؛ کافی است دیتابیس خالی موجود باشد.

## اجرا

```
cd backend
cp .env.example .env   # اطلاعات اتصال MySQL (MYSQL_HOST/USER/PASSWORD/DATABASE) و بقیهٔ مقادیر را بگذارید
npm install
npm run dev             # روی http://localhost:4000
```

> این پروژه در محیطی ساخته شده که نه به اینترنت دسترسی داشت و نه یک سرور MySQL واقعی در
> دسترس بود، پس `npm install`، اتصال واقعی به MySQL و اجرای کامل سرور اینجا تست نشده —
> قبل از استفادهٔ واقعی حتماً با MySQL خودتان امتحانش کنید. اگر در اتصال خطا گرفتید، اول
> مطمئن شوید MySQL بالاست و مقادیر `.env` (به‌خصوص `MYSQL_PASSWORD`) درست است.

## قبل از انتشار واقعی

- `SMS_PROVIDER` را از `console` به یک سرویس واقعی (مثلاً `kavenegar`) عوض کنید و API Key واقعی بگذارید.
- `JWT_SECRET` را به یک رشتهٔ طولانی و تصادفی تغییر دهید.
- برای اتصال به پرداخت درون‌برنامه‌ای کافه‌بازار، فقط تابع verify داخل `src/routes/subscription.ts`
  (بخش کامنت‌گذاری‌شده) را با فراخوانی واقعی API بازار جایگزین کنید — بقیهٔ مسیر (ساخت
  Subscription، ذخیرهٔ Payment) از قبل آماده است.
- در محیط تولید، از یک کاربر MySQL اختصاصی با دسترسی محدود (نه root) استفاده کنید.

## مسیرهای API

| Method | Path | نیاز به توکن | توضیح |
|---|---|---|---|
| POST | /api/auth/otp/request | خیر | `{ phone }` → ارسال کد |
| POST | /api/auth/otp/verify | خیر | `{ phone, code }` → `{ token }` |
| GET | /api/account | بله | وضعیت کامل حساب/Trial/اشتراک |
| GET | /api/subscription/plans | خیر | فهرست پلن‌ها |
| POST | /api/subscription/purchase | بله | `{ plan }` — رزرو محل اتصال IAP بازار |
