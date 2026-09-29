/**
 * رابط ارسال پیامک — پیاده‌سازی واقعی (کاوه‌نگار، ملی‌پیامک، ...) را بعداً فقط با اضافه‌کردن
 * یک Provider جدید که این Interface را پیاده کند وصل کنید؛ بقیهٔ سیستم (auth.ts) کاری به این
 * ندارد که پیامک از چه سرویسی ارسال می‌شود.
 */
export interface SmsProvider {
  send(phone: string, text: string): Promise<void>;
}

/** پیش‌فرض توسعه: کد را فقط در لاگ سرور چاپ می‌کند — هیچ پیامک واقعی ارسال نمی‌شود.
 *  این محیط (sandbox ساخت این پروژه) به اینترنت دسترسی ندارد، برای همین گزینهٔ SMS واقعی
 *  اینجا تست نشده — قبل از استفاده در محیط واقعی حتماً با یک Provider واقعی جایگزین کنید. */
class ConsoleSmsProvider implements SmsProvider {
  async send(phone: string, text: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[SMS→${phone}] ${text}`);
  }
}

/** نمونهٔ اتصال به کاوه‌نگار — API Key واقعی را در .env بگذارید (هرگز در Frontend).
 *  چون این محیط به اینترنت دسترسی ندارد، این پیاده‌سازی تست نشده؛ قبل از استفادهٔ واقعی
 *  مستندات فعلی کاوه‌نگار را چک کنید. */
class KavenegarSmsProvider implements SmsProvider {
  constructor(
    private apiKey: string,
    private template: string,
  ) {}
  async send(phone: string, text: string): Promise<void> {
    const code = text.match(/\d{4,8}/)?.[0] ?? '';
    const url = `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json?receptor=${encodeURIComponent(phone)}&token=${encodeURIComponent(code)}&template=${encodeURIComponent(this.template)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ارسال پیامک ناموفق بود (${res.status})`);
  }
}

export function makeSmsProvider(kind: string, kavenegarApiKey: string, kavenegarTemplate: string): SmsProvider {
  if (kind === 'kavenegar') return new KavenegarSmsProvider(kavenegarApiKey, kavenegarTemplate);
  return new ConsoleSmsProvider();
}
