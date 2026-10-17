import { describe, expect, it } from 'vitest';
import { parseServerEnv, ServerEnvError } from '@/config/env.server';

const TOKEN = 'a'.repeat(31) + 'Z9'; // 33 characters, not a placeholder

const valid = {
  NODE_ENV: 'development',
  BACKEND_INTERNAL_URL: 'http://nginx:8081',
  INTERNAL_SERVICE_TOKEN: TOKEN,
  APP_ORIGIN: 'http://localhost:3000',
};

const production = {
  ...valid,
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://tourism.example.org',
  SESSION_COOKIE_SECURE: 'true',
};

function issuesOf(source) {
  try {
    parseServerEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(ServerEnvError);
    return error;
  }
  throw new Error('expected parseServerEnv to throw');
}

describe('server environment validation', () => {
  it('accepts a valid development configuration and applies defaults', () => {
    const env = parseServerEnv(valid);
    expect(env.BACKEND_TIMEOUT_MS).toBe(10000);
    expect(env.SESSION_COOKIE_SECURE).toBe(false);
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('accepts a valid production configuration', () => {
    expect(parseServerEnv(production).SESSION_COOKIE_SECURE).toBe(true);
  });

  it('names every missing required key', () => {
    const error = issuesOf({ NODE_ENV: 'development' });
    expect(error.issues).toEqual(
      expect.arrayContaining([
        'BACKEND_INTERNAL_URL is required',
        'INTERNAL_SERVICE_TOKEN is required',
        'APP_ORIGIN is required',
      ]),
    );
  });

  it('rejects a short service token without echoing its value', () => {
    const error = issuesOf({ ...valid, INTERNAL_SERVICE_TOKEN: 'short-secret-value' });
    expect(error.message).toContain('INTERNAL_SERVICE_TOKEN must be at least 32 characters');
    expect(error.message).not.toContain('short-secret-value');
  });

  it('rejects non-http backend URLs and bad numbers', () => {
    const error = issuesOf({ ...valid, BACKEND_INTERNAL_URL: 'ftp://nginx', BACKEND_TIMEOUT_MS: '5' });
    expect(error.issues.some((issue) => issue.startsWith('BACKEND_INTERNAL_URL'))).toBe(true);
    expect(error.issues.some((issue) => issue.startsWith('BACKEND_TIMEOUT_MS'))).toBe(true);
  });

  it('enforces production rules: no placeholder token, https origin, secure cookies', () => {
    const placeholder = 'replace-with-the-INTERNAL_SERVICE_TOKEN-from-the-root-env';
    const error = issuesOf({ ...production, INTERNAL_SERVICE_TOKEN: placeholder, APP_ORIGIN: 'http://site.test', SESSION_COOKIE_SECURE: 'false' });
    expect(error.issues).toEqual(
      expect.arrayContaining([
        'INTERNAL_SERVICE_TOKEN is a placeholder value',
        'APP_ORIGIN must use https in production',
        'SESSION_COOKIE_SECURE must be true in production',
      ]),
    );
    expect(error.message).not.toContain(placeholder);
  });

  it('allows the example placeholder token in development', () => {
    expect(() => parseServerEnv({ ...valid, INTERNAL_SERVICE_TOKEN: 'replace-with-the-INTERNAL_SERVICE_TOKEN-from-the-root-env' })).not.toThrow();
  });
});
