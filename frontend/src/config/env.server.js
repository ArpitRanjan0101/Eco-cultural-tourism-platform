import 'server-only';
import { z } from 'zod';

// Same placeholder rule as the backend (backend src/config/env.js) so example values never run in production.
const PLACEHOLDER = /replace-with|change-?me|example|^secret$/i;

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_INTERNAL_URL: z.url({ protocol: /^https?$/ }),
    INTERNAL_SERVICE_TOKEN: z.string().min(32, 'must be at least 32 characters'),
    APP_ORIGIN: z.url({ protocol: /^https?$/ }),
    BACKEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    SESSION_COOKIE_SECURE: flag.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (PLACEHOLDER.test(env.INTERNAL_SERVICE_TOKEN)) {
      ctx.addIssue({ code: 'custom', path: ['INTERNAL_SERVICE_TOKEN'], message: 'is a placeholder value' });
    }
    if (!env.APP_ORIGIN.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'must use https in production' });
    }
    if (!env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_COOKIE_SECURE'], message: 'must be true in production' });
    }
  });

export class ServerEnvError extends Error {
  constructor(issues) {
    // Key names and reasons only; values (secrets) are never part of the message.
    super(`Invalid server configuration: ${issues.join('; ')}`);
    this.name = 'ServerEnvError';
    this.issues = issues;
  }
}

/** Validates a raw environment object; throws ServerEnvError naming the offending keys. */
export function parseServerEnv(source) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      const missing = issue.code === 'invalid_type' && (source[key] === undefined || source[key] === '');
      return missing ? `${key} is required` : `${key} ${issue.message}`;
    });
    throw new ServerEnvError(issues);
  }
  return Object.freeze(result.data);
}

let cached;

/** Validated server configuration, parsed once per process (W19). */
export function getServerEnv() {
  cached ??= parseServerEnv(process.env);
  return cached;
}
