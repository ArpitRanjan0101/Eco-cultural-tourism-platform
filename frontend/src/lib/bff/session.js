import { cookieNames } from './cookies';

/** Reads the session tokens from a cookie store with get(name) → { value } (NextRequest or next/headers). */
export function readSession(cookieStore, secure) {
  const names = cookieNames(secure);
  return {
    accessToken: cookieStore.get(names.access)?.value || null,
    refreshToken: cookieStore.get(names.refresh)?.value || null,
  };
}

/**
 * Expiry of a JWT in epoch ms, read from its payload without verification. Used only to decide when to refresh;
 * Express verifies every token itself.
 */
export function jwtExpiresAt(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the access token is missing, unreadable or expires within `skewMs`. */
export function accessTokenNeedsRefresh(accessToken, now = Date.now(), skewMs = 60_000) {
  if (!accessToken) return true;
  const expiresAt = jwtExpiresAt(accessToken);
  return expiresAt === null || expiresAt - now < skewMs;
}
