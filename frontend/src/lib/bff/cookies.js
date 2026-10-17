// Session cookie names and options (W6, LLD §4). __Host- prefixed when Secure: host-only, path=/, https only.

export function cookieNames(secure) {
  const prefix = secure ? '__Host-' : '';
  return {
    access: `${prefix}jt_at`,
    refresh: `${prefix}jt_rt`,
    csrf: `${prefix}jt_csrf`,
    partner: `${prefix}jt_partner`,
  };
}

/** Browser-side names for the CSRF cookie (the client cannot know which prefix the server uses). */
export const CSRF_COOKIE_CANDIDATES = ['__Host-jt_csrf', 'jt_csrf'];

function seconds(untilIso, now) {
  const ms = Date.parse(untilIso) - now;
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

/** Cookie writes for a backend AuthSession ({ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }). */
export function sessionCookieWrites(session, secure, now = Date.now()) {
  const names = cookieNames(secure);
  const base = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  return [
    { name: names.access, value: session.accessToken, options: { ...base, maxAge: seconds(session.accessTokenExpiresAt, now) } },
    { name: names.refresh, value: session.refreshToken, options: { ...base, maxAge: seconds(session.refreshTokenExpiresAt, now) } },
  ];
}

/**
 * Expires the access, refresh and partner-context cookies. Both Max-Age=0 and an epoch Expires: when a server
 * component redirects after the proxy cleared cookies, Next.js replays the proxy's cookies without Max-Age,
 * which would otherwise leave empty session cookies behind (found by the e2e suite).
 */
export function clearedSessionCookieWrites(secure) {
  const names = cookieNames(secure);
  const base = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0, expires: new Date(0) };
  return [names.access, names.refresh, names.partner].map((name) => ({ name, value: '', options: base }));
}

/** CSRF double-submit cookie: readable by our own scripts, never sent cross-site (W7). */
export function csrfCookieWrite(token, secure) {
  return { name: cookieNames(secure).csrf, value: token, options: { httpOnly: false, secure, sameSite: 'strict', path: '/' } };
}

/** Applies writes to a ResponseCookies (NextResponse#cookies). */
export function applyCookieWrites(responseCookies, writes) {
  for (const { name, value, options } of writes) responseCookies.set(name, value, options);
}
