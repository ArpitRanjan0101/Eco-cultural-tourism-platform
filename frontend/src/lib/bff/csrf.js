import { randomBytes, timingSafeEqual } from 'node:crypto';

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function newCsrfToken() {
  return randomBytes(32).toString('base64url');
}

function sameOrigin(value, appOrigin) {
  try {
    return new URL(value).origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * CSRF check for state-changing BFF requests (W7): the request must come from our origin (Origin, else Referer)
 * AND echo the CSRF cookie in X-CSRF-Token. Returns null when valid, otherwise a short reason for logs.
 * @param {Request & { cookies: { get(name: string): { value: string } | undefined } }} request
 */
export function verifyCsrf(request, { appOrigin, csrfCookieName }) {
  const origin = request.headers.get('origin');
  if (origin) {
    if (origin !== appOrigin) return 'origin-mismatch';
  } else {
    const referer = request.headers.get('referer');
    if (!referer || !sameOrigin(referer, appOrigin)) return 'origin-missing';
  }
  const header = request.headers.get('x-csrf-token') ?? '';
  const cookie = request.cookies.get(csrfCookieName)?.value ?? '';
  if (!header || !cookie) return 'token-missing';
  const a = Buffer.from(header);
  const b = Buffer.from(cookie);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'token-mismatch';
  return null;
}
