# ساخت APK امضاشده برای بازار / مایکت (بدون تغییر در کد برنامه)

قبل از هر کاری: در `capacitor.config.json` مقدار `appId` را به شناسهٔ یکتای خودتان تغییر دهید
(مثلاً `ir.yourname.brushyar`). بعد از انتشار اولین نسخه دیگر قابل تغییر نیست.

1. متغیر `API_BASE` را بسازید (Settings > Secrets and variables > Actions > Variables).
2. Actions > «1 - Create signing key» را یک بار اجرا کنید و فایل‌های Artifact را دانلود و **همیشه نگه دارید**.
3. از `keystore-info.txt` چهار Secret بسازید: KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS.
4. Actions > «2 - Build signed release APK» را اجرا کنید و `glass-cut-release.apk` را بگیرید.
5. هر نسخهٔ جدید: دوباره workflow شماره ۲ (versionCode خودکار زیاد می‌شود).

CORS بک‌اند: `CORS_ORIGINS=http://localhost:5173,https://localhost`
