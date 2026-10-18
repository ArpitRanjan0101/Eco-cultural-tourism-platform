import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

// Helpers shared by the browser suites. Everything goes through the real BFF and backend; nothing is faked.

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** WCAG 2.2 AA violations on the current page as "rule: targets" strings (empty when clean). */
export async function axeViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

/** The verification token from the real email sent to `email` (read from Mailpit, waiting up to 30 s). */
export async function verificationToken(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = `${message.Text}\n${message.HTML}`.match(/\/verify-email\?token=([^\s"'<&]+)/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`no verification email for ${email}`);
}

/**
 * API client for `page`'s browser context, through the BFF exactly as the app calls it: same-origin, with the
 * CSRF cookie echoed in the header for state-changing requests. Session cookies live in the context.
 */
export async function bffClient(page) {
  await page.goto('/login');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'jt_csrf').value;
  const headers = { origin: new URL(page.url()).origin, 'x-csrf-token': csrf };
  const send = (method) => (path, data) => page.request.fetch(path, { method, data, headers });
  return {
    get: (path) => page.request.get(path),
    post: send('POST'),
    put: send('PUT'),
    patch: send('PATCH'),
    delete: send('DELETE'),
    /** Signs this context in through the BFF session handler (tokens land in HttpOnly cookies). */
    signIn: async ({ email, password }) => expect((await page.request.post('/api/auth/login', { data: { email, password }, headers })).status(), `sign-in ${email}`).toBe(200),
  };
}

/** `bffClient` already signed in as `credentials`. */
export async function signedInClient(page, credentials) {
  const client = await bffClient(page);
  await client.signIn(credentials);
  return client;
}

/** Response JSON `data` after asserting the expected status (with the body in the failure message). */
export async function dataOf(response, status) {
  const body = await response.text();
  expect(response.status(), `${response.url()} → ${body.slice(0, 500)}`).toBe(status);
  return body ? JSON.parse(body).data : null;
}
