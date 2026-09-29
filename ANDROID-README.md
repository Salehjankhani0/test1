# ساخت APK امضاشده برای بازار / مایکت

این نسخه کاملاً مستقل و آفلاین است و برای اجرا به بک‌اند، حساب کاربری، ورود با شماره موبایل یا OTP نیاز ندارد.

قبل از هر کاری: در `capacitor.config.json` مقدار `appId` را به شناسهٔ یکتای خودتان تغییر دهید (مثلاً `ir.yourname.brushyar`). بعد از انتشار اولین نسخه دیگر قابل تغییر نیست.

1. مخزن GitHub را بسازید و کل پروژه را Push کنید.
2. Actions > «1 - Create signing key» را یک بار اجرا کنید و فایل‌های Artifact را دانلود و **همیشه نگه دارید**.
3. از `keystore-info.txt` چهار Secret بسازید: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS`.
4. Actions > «2 - Build signed release APK» را اجرا کنید و `glass-cut-release.apk` را بگیرید.
5. هر نسخهٔ جدید: دوباره workflow شماره ۲ را اجرا کنید؛ `versionCode` خودکار زیاد می‌شود.

نیازی به تنظیم `API_BASE`، متغیر محیطی بک‌اند یا CORS ندارید.

## Android security hardening

The release workflow applies Android hardening for the standalone/offline build: cleartext network traffic is disabled, mixed content is blocked, Android backup/device transfer is disabled, screenshots and screen recording are blocked with `FLAG_SECURE`, WebView remote debugging is disabled in release builds, and R8/resource shrinking is enabled for the native Android layer.

This does not make the application impossible to reverse engineer. The web UI/JavaScript shipped inside a WebView can still be extracted and analyzed. Do not embed API keys, private signing material, passwords, or other secrets in the web application bundle.
