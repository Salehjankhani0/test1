import 'dotenv/config';

function get(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  port: Number(get('PORT', '4000')),
  jwtSecret: get('JWT_SECRET', 'dev-secret-change-me'),
  jwtTtlSeconds: Number(get('JWT_TTL_SECONDS', String(60 * 60 * 24 * 30))),
  trialDays: 10,
  smsProvider: get('SMS_PROVIDER', 'console'),
  kavenegarApiKey: get('KAVENEGAR_API_KEY', ''),
  kavenegarTemplate: get('KAVENEGAR_TEMPLATE', ''),
  corsOrigins: get('CORS_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  mysql: {
    host: get('MYSQL_HOST', '127.0.0.1'),
    port: Number(get('MYSQL_PORT', '3306')),
    user: get('MYSQL_USER', 'root'),
    password: get('MYSQL_PASSWORD', ''),
    database: get('MYSQL_DATABASE', 'glass_cut'),
  },
};
