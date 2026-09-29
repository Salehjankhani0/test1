import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { env } from './lib/env.ts';
import { ensureSchema } from './db.ts';
import authRouter from './routes/auth.ts';
import accountRouter from './routes/account.ts';
import subscriptionRouter from './routes/subscription.ts';

const app = express();
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/subscription', subscriptionRouter);

// خطاهای async روت‌ها/میدلورها (مثلاً قطعی اتصال MySQL) اینجا می‌رسند، نه اینکه بی‌صدا گم شوند
const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'server_error' });
};
app.use(onError);

// قبل از پذیرفتن درخواست، مطمئن می‌شویم جدول‌های MySQL ساخته شده‌اند — اگر اتصال به MySQL
// برقرار نباشد (سرور بالا نیست / اطلاعات .env اشتباه است) همین‌جا با خطای واضح متوقف می‌شود
await ensureSchema();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`glass-cut backend روی پورت ${env.port} بالا آمد`);
});
