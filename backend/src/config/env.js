'use strict';

const { z } = require('zod');
const { version } = require('../../package.json');

const PLACEHOLDER = /replace-with|change-?me|example|^secret$/i;

const csvList = z
  .string()
  .optional()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const secret = (name) =>
  z
    .string({ required_error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters`);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    PUBLIC_BASE_URL: z.string().url(),
    CORS_ORIGIN: csvList.pipe(z.array(z.string().url())),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'REDIS_URL must be a redis:// URL'),

    INTERNAL_SERVICE_TOKEN: secret('INTERNAL_SERVICE_TOKEN'),
    INTERNAL_SERVICE_TOKEN_PREVIOUS: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .pipe(secret('INTERNAL_SERVICE_TOKEN_PREVIOUS').optional()),

    JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
    JWT_ISSUER: z.string().min(1).default('jharkhand-tourism-api'),
    JWT_AUDIENCE: z.string().min(1).default('jharkhand-tourism-bff'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),

    // S3-compatible object storage. The API talks to STORAGE_ENDPOINT on the private network;
    // presigned upload/download URLs are signed for STORAGE_PUBLIC_ENDPOINT (reachable by browsers).
    STORAGE_ENDPOINT: z.string().url(),
    STORAGE_PUBLIC_ENDPOINT: z.string().url(),
    STORAGE_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_ACCESS_KEY: z.string().min(8),
    STORAGE_SECRET_KEY: z.string().min(16),
    STORAGE_PUBLIC_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
    STORAGE_PRIVATE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
    STORAGE_PUBLIC_BASE_URL: z.string().url(),
    STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),

    // Payment gateway (DECISIONS O1: Razorpay). Keys may be empty in development (payment
    // routes then answer 503 PAYMENTS_NOT_CONFIGURED); they are required in production.
    PAYMENT_PROVIDER: z.enum(['razorpay']).default('razorpay'),
    PAYMENT_KEY_ID: z.string().optional().transform((value) => value || undefined),
    PAYMENT_KEY_SECRET: z.string().optional().transform((value) => value || undefined),
    PAYMENT_WEBHOOK_SECRET: z.string().optional().transform((value) => value || undefined),
    PAYMENT_API_BASE_URL: z.string().url().default('https://api.razorpay.com/v1'),
    PAYMENT_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),

    // Email (SMTP; Mailpit in development) and the web app used to build links in messages.
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    SMTP_USER: z.string().optional().transform((value) => value || undefined),
    SMTP_PASSWORD: z.string().optional().transform((value) => value || undefined),
    EMAIL_FROM: z.string().min(3).default('Jharkhand Tourism <no-reply@jharkhand-tourism.local>'),
    APP_WEB_URL: z.string().url().default('http://localhost:3000'),

    // Optional first super-admin created by `npm run db:seed`.
    BOOTSTRAP_ADMIN_EMAIL: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
    BOOTSTRAP_ADMIN_NAME: z.string().trim().max(150).optional(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128).optional().or(z.literal('').transform(() => undefined)),

    GIT_COMMIT: z.string().default('unknown'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'test' && !/_test(\?|$)/.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_URL'],
        message: 'tests must run against a database whose name ends with _test',
      });
    }
    if (env.JWT_ACCESS_SECRET === env.INTERNAL_SERVICE_TOKEN) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_ACCESS_SECRET'], message: 'must differ from INTERNAL_SERVICE_TOKEN' });
    }
    if (Boolean(env.BOOTSTRAP_ADMIN_EMAIL) !== Boolean(env.BOOTSTRAP_ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BOOTSTRAP_ADMIN_EMAIL'],
        message: 'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together',
      });
    }
    if (env.NODE_ENV === 'production') {
      for (const key of ['INTERNAL_SERVICE_TOKEN', 'INTERNAL_SERVICE_TOKEN_PREVIOUS', 'JWT_ACCESS_SECRET']) {
        if (env[key] && PLACEHOLDER.test(env[key])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is a placeholder value` });
        }
      }
      for (const key of ['PAYMENT_KEY_ID', 'PAYMENT_KEY_SECRET', 'PAYMENT_WEBHOOK_SECRET']) {
        if (!env[key] || PLACEHOLDER.test(env[key])) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production` });
        }
      }
      if (PLACEHOLDER.test(env.STORAGE_SECRET_KEY)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['STORAGE_SECRET_KEY'], message: 'STORAGE_SECRET_KEY is a placeholder value' });
      }
      if (!env.PUBLIC_BASE_URL.startsWith('https://')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_BASE_URL'], message: 'must use https in production' });
      }
    }
  });

/**
 * Validates environment variables. Error messages name the offending keys only;
 * values are never echoed because they may be secrets.
 */
function parseEnv(source) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }
  const env = result.data;
  return Object.freeze({
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    corsOrigins: env.CORS_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    // Tests are silent unless TEST_LOG_LEVEL is set (e.g. TEST_LOG_LEVEL=error to debug a failing run).
    logLevel: env.NODE_ENV === 'test' ? source.TEST_LOG_LEVEL || 'silent' : env.LOG_LEVEL,
    database: { url: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX },
    redis: { url: env.REDIS_URL },
    serviceTokens: [env.INTERNAL_SERVICE_TOKEN, env.INTERNAL_SERVICE_TOKEN_PREVIOUS].filter(Boolean),
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      emailVerificationTtlHours: env.EMAIL_VERIFICATION_TTL_HOURS,
      passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    },
    storage: {
      endpoint: env.STORAGE_ENDPOINT,
      publicEndpoint: env.STORAGE_PUBLIC_ENDPOINT,
      region: env.STORAGE_REGION,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
      publicBucket: env.STORAGE_PUBLIC_BUCKET,
      privateBucket: env.STORAGE_PRIVATE_BUCKET,
      publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, ''),
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    },
    payments: {
      provider: env.PAYMENT_PROVIDER,
      keyId: env.PAYMENT_KEY_ID,
      keySecret: env.PAYMENT_KEY_SECRET,
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET,
      apiBaseUrl: env.PAYMENT_API_BASE_URL.replace(/\/+$/, ''),
      timeoutMs: env.PAYMENT_HTTP_TIMEOUT_MS,
    },
    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    },
    webAppUrl: env.APP_WEB_URL.replace(/\/+$/, ''),
    bootstrapAdmin: env.BOOTSTRAP_ADMIN_EMAIL
      ? { email: env.BOOTSTRAP_ADMIN_EMAIL, password: env.BOOTSTRAP_ADMIN_PASSWORD, fullName: env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator' }
      : null,
    app: { name: 'jharkhand-tourism-api', version, commit: env.GIT_COMMIT },
  });
}

module.exports = { parseEnv };
