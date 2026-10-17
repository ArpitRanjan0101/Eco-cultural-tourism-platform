import { expect, test } from '@playwright/test';

// End-to-end against the real stack: production build → nginx → Express → PostgreSQL/Redis, with the real
// verification email read from Mailpit. No fake login. One registration per run (backend limit: 10/hour per IP).
test.describe.configure({ mode: 'serial' });

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const stamp = Date.now();
const user = { fullName: 'E2E Traveller', email: `e2e.${stamp}@example.org`, password: `Pw-${stamp}-ok` };

async function verificationLink(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const id = search.messages?.[0]?.ID;
    if (id) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = `${message.Text}\n${message.HTML}`.match(/\/verify-email\?token=([^\s"'<&]+)/);
      if (match) return `/verify-email?token=${match[1]}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`no verification email for ${email}`);
}

const cookieMap = async (context) => Object.fromEntries((await context.cookies()).map((c) => [c.name, c]));

async function signIn(page, next = '/account') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, '\\$&')}$`));
}

test('register through the UI and verify with the real email link', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Full name' }).fill(user.fullName);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByLabel(/^Confirm password/).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email', { exact: true })).toBeVisible();

  await page.goto(await verificationLink(user.email));
  await expect(page.getByText('Email verified')).toBeVisible();
});

test('anonymous visitors are sent to sign in, then back to where they were going', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  await signIn(page);
  await expect(page.getByRole('heading', { level: 1, name: `Hello, ${user.fullName}` })).toBeVisible();
});

test('wrong password shows a message and sets no session', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel(/^Password/).fill('definitely-wrong-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'The email or password is incorrect.' })).toBeVisible();
  expect((await cookieMap(context)).jt_at).toBeUndefined();
});

test('session lives in HttpOnly cookies and no token reaches the page', async ({ page, context }) => {
  const loginResponse = page.waitForResponse((r) => r.url().endsWith('/api/auth/login'));
  await signIn(page);
  const body = await (await loginResponse).text();
  const cookies = await cookieMap(context);
  expect(cookies.jt_at).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(cookies.jt_rt).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  expect(cookies.jt_csrf).toMatchObject({ httpOnly: false, sameSite: 'Strict' });
  expect(body).not.toContain(cookies.jt_at.value);
  expect(body).not.toContain(cookies.jt_rt.value);
  expect(await page.content()).not.toContain(cookies.jt_rt.value);
  expect(await page.evaluate(() => document.cookie)).not.toContain('jt_at');
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(cookies.jt_at.value);
});

test('an expired access token is refreshed transparently, once, for parallel requests', async ({ page, context }) => {
  await signIn(page);
  const before = await cookieMap(context);
  await context.clearCookies({ name: 'jt_at' });
  const results = await Promise.all(Array.from({ length: 5 }, () => page.request.get('/api/session').then((r) => r.json())));
  for (const result of results) expect(result.data?.email).toBe(user.email);
  const after = await cookieMap(context);
  expect(after.jt_rt.value).not.toBe(before.jt_rt.value);
  // The rotated family is still valid: the session survived the parallel refresh.
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: `Hello, ${user.fullName}` })).toBeVisible();
});

test('replaying a rotated refresh token ends the whole session (backend reuse detection)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const stolen = (await cookieMap(context)).jt_rt.value;
  await context.clearCookies({ name: 'jt_at' });
  expect((await (await page.request.get('/api/session')).json()).data).not.toBeNull();
  const current = (await cookieMap(context)).jt_rt.value;
  expect(current).not.toBe(stolen);

  // Past the BFF's 30 s single-flight window, so the old token really reaches Express again.
  await page.waitForTimeout(31_000);
  // Leave only the stolen refresh token, so the proxy must present it to Express.
  await context.clearCookies({ name: 'jt_at' });
  await context.clearCookies({ name: 'jt_rt' });
  await context.addCookies([{ name: 'jt_rt', value: stolen, url: page.url(), httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  expect((await cookieMap(context)).jt_rt).toBeUndefined();

  // The legitimate latest token was revoked with its family.
  await context.clearCookies({ name: 'jt_at' });
  await context.addCookies([{ name: 'jt_rt', value: current, url: page.url(), httpOnly: true, sameSite: 'Lax' }]);
  expect((await (await page.request.get('/api/session')).json()).data).toBeNull();
});

test('a tourist is forbidden from the admin area, in the UI and by Express', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'You do not have access to this page' })).toBeVisible();
  const api = await page.request.get('/api/v1/admin/users');
  expect(api.status()).toBe(403);
  expect((await api.json()).error.code).toBe('FORBIDDEN');
});

test('anonymous API calls get 401 from Express; unknown BFF routes 404', async ({ request }) => {
  const me = await request.get('/api/v1/users/me');
  expect(me.status()).toBe(401);
  expect((await me.json()).error.requestId).toBeTruthy();
  expect((await request.get('/api/v1/nope')).status()).toBe(404);
  expect((await request.get('/api/v1/webhooks/payments/razorpay')).status()).toBe(404);
  // Mutations are CSRF-checked before anything else, so a cross-site POST never reaches routing or Express.
  const post = await request.post('/api/v1/webhooks/payments/razorpay', { data: {} });
  expect(post.status()).toBe(403);
  expect((await post.json()).error.code).toBe('CSRF_FAILED');
});

test('cross-site and token-less mutations are rejected (CSRF)', async ({ page }) => {
  await page.goto('/login');
  const csrf = (await page.context().cookies()).find((c) => c.name === 'jt_csrf').value;
  const data = { email: user.email, password: user.password };
  const foreign = await page.request.post('/api/auth/login', { data, headers: { origin: 'https://evil.example', 'x-csrf-token': csrf } });
  expect(foreign.status()).toBe(403);
  const tokenless = await page.request.post('/api/auth/login', { data, headers: { origin: new URL(page.url()).origin } });
  expect(tokenless.status()).toBe(403);
  expect((await tokenless.json()).error.code).toBe('CSRF_FAILED');
});

test('sign out clears the session; sign out everywhere ends other browsers too', async ({ page, browser }) => {
  await signIn(page);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  const third = await browser.newContext();
  const thirdPage = await third.newPage();
  await signIn(thirdPage);
  await thirdPage.getByRole('button', { name: 'Sign out everywhere' }).click();
  await thirdPage.getByRole('dialog').getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(thirdPage).toHaveURL(/\/login$/);

  expect((await (await otherPage.request.get('/api/session')).json()).data).toBeNull();
  await other.close();
  await third.close();
});
