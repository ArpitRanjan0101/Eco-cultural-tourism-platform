import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmailVerification from '@/features/auth/components/EmailVerification';
import ForgotPasswordForm from '@/features/auth/components/ForgotPasswordForm';
import LoginForm from '@/features/auth/components/LoginForm';
import PermissionGate from '@/features/auth/components/PermissionGate';
import RegisterForm from '@/features/auth/components/RegisterForm';
import ResetPasswordForm from '@/features/auth/components/ResetPasswordForm';
import { ApiError, apiFetch } from '@/lib/api/client';
import { applyApiErrors } from '@/lib/api/formErrors';
import { createQueryClient, shouldRetry } from '@/providers/QueryProvider';
import { expectNoAxeViolations } from '../axe';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const TOKEN = 'a'.repeat(43);
let calls;

function respond(routes) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path, init) => {
      calls.push({ path, init, headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : undefined });
      const handler = routes[`${init.method} ${path}`];
      if (!handler) return Response.json({ success: false, error: { code: 'NOT_MOCKED', message: path, requestId: 'r' } }, { status: 404 });
      return handler();
    }),
  );
}
const ok = (data, status = 200) => () => Response.json({ success: true, data }, { status });
const fail = (status, code, extra = {}, headers = {}) => () => Response.json({ success: false, error: { code, message: `${code} from server`, requestId: 'req-99', ...extra } }, { status, headers: { 'x-request-id': 'req-99', ...headers } });

function renderWithQuery(ui) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  document.cookie = 'jt_csrf=csrf-cookie-value';
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('browser API client (3.7)', () => {
  it('adds the CSRF header to mutations only, and refuses non-/api paths', async () => {
    respond({ 'GET /api/session': ok(null), 'POST /api/auth/logout': () => new Response(null, { status: 204 }) });
    await apiFetch('/api/session');
    expect(await apiFetch('/api/auth/logout', { method: 'POST' })).toBeNull();
    expect(calls[0].headers.get('x-csrf-token')).toBeNull();
    expect(calls[1].headers.get('x-csrf-token')).toBe('csrf-cookie-value');
    expect(calls[1].init.credentials).toBe('same-origin');
    await expect(apiFetch('https://evil.example/api/x')).rejects.toThrow(/same-origin/);
    await expect(apiFetch('//evil.example/api/x')).rejects.toThrow(/same-origin/);
  });

  it('throws ApiError with code, details, requestId and Retry-After', async () => {
    respond({ 'POST /api/auth/login': fail(429, 'LOGIN_LOCKED', {}, { 'retry-after': '600' }) });
    const error = await apiFetch('/api/auth/login', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'LOGIN_LOCKED', requestId: 'req-99', retryAfter: '600' });
  });

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(apiFetch('/api/session')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('query retries skip 4xx answers', () => {
    expect(shouldRetry(0, new ApiError({ status: 401, code: 'X' }))).toBe(false);
    expect(shouldRetry(0, new ApiError({ status: 503, code: 'X' }))).toBe(true);
    expect(shouldRetry(2, new ApiError({ status: 503, code: 'X' }))).toBe(false);
  });

  it('applyApiErrors maps 422 details onto known fields', () => {
    const setError = vi.fn();
    const error = new ApiError({ status: 422, code: 'VALIDATION_ERROR', details: [{ location: 'body', path: 'email', message: 'Invalid email' }, { location: 'query', path: 'x', message: 'bad' }] });
    expect(applyApiErrors(error, setError, { fields: ['email'] }).message).toMatch(/check the highlighted/);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Invalid email' });
    expect(applyApiErrors(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'x', requestId: 'r1' }), setError)).toEqual({ message: 'x', requestId: 'r1' });
  });
});

describe('LoginForm (3.9)', () => {
  it('validates before calling the server', async () => {
    respond({});
    renderWithQuery(<LoginForm next="/account" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('signs in through the BFF and navigates to the validated next path', async () => {
    respond({ 'POST /api/auth/login': ok({ user: { id: 'u1' } }), 'GET /api/session': ok({ id: 'u1' }) });
    renderWithQuery(<LoginForm next="/account/trips" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'asha@example.org');
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account/trips'));
    expect(calls[0]).toMatchObject({ path: '/api/auth/login', body: { email: 'asha@example.org', password: 'secret-password' } });
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, 'The email or password is incorrect.'],
    ['ACCOUNT_SUSPENDED', 403, 'This account is suspended.'],
  ])('shows a friendly message for %s', async (code, status, text) => {
    respond({ 'POST /api/auth/login': fail(status, code) });
    const { container } = renderWithQuery(<LoginForm next="/account" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'a@b.in');
    await userEvent.type(screen.getByLabelText(/^Password/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(router.replace).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it('explains lockouts with the retry time', async () => {
    respond({ 'POST /api/auth/login': fail(429, 'LOGIN_LOCKED', {}, { 'retry-after': '900' }) });
    renderWithQuery(<LoginForm next="/account" />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'a@b.in');
    await userEvent.type(screen.getByLabelText(/^Password/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in about 15 minutes.');
  });
});

describe('RegisterForm, ForgotPasswordForm, ResetPasswordForm (3.10–3.12)', () => {
  it('register: confirms matching passwords, sends only contract fields, shows the neutral message', async () => {
    respond({ 'POST /api/v1/auth/register': ok({ message: 'If the address can be used, a verification email has been sent.' }, 202) });
    renderWithQuery(<RegisterForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Full name' }), 'Asha Munda');
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'asha@example.org');
    await userEvent.type(screen.getByLabelText(/^Password/), 'long-enough-1');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'different-123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText(/^Confirm password/));
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'long-enough-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/a verification email has been sent/)).toBeInTheDocument();
    expect(calls[0].body).toEqual({ fullName: 'Asha Munda', email: 'asha@example.org', password: 'long-enough-1' });
  });

  it('register: server validation errors land on their fields', async () => {
    respond({ 'POST /api/v1/auth/register': fail(422, 'VALIDATION_ERROR', { details: [{ location: 'body', path: 'email', message: 'Invalid email address' }] }) });
    renderWithQuery(<RegisterForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Full name' }), 'A');
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'a@b.in');
    await userEvent.type(screen.getByLabelText(/^Password/), 'long-enough-1');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'long-enough-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('forgot password shows the backend message', async () => {
    respond({ 'POST /api/v1/auth/forgot-password': ok({ message: 'If an account exists, a reset email has been sent.' }, 202) });
    renderWithQuery(<ForgotPasswordForm />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Email' }), 'a@b.in');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('a reset email has been sent');
  });

  it('reset password: malformed token, success, and expired-link handling', async () => {
    const { unmount } = renderWithQuery(<ResetPasswordForm token="short" />);
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or has expired');
    unmount();

    respond({ 'POST /api/v1/auth/reset-password': fail(400, 'INVALID_OR_EXPIRED_TOKEN') });
    const { unmount: unmount2 } = renderWithQuery(<ResetPasswordForm token={TOKEN} />);
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-1');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    unmount2();

    respond({ 'POST /api/v1/auth/reset-password': () => new Response(null, { status: 204 }) });
    renderWithQuery(<ResetPasswordForm token={TOKEN} />);
    await userEvent.type(screen.getByLabelText(/^New password/), 'new-password-1');
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(calls[0].body).toEqual({ token: TOKEN, newPassword: 'new-password-1' });
  });
});

describe('EmailVerification (3.13)', () => {
  it('verifies exactly once even under Strict Mode', async () => {
    respond({ 'POST /api/v1/auth/verify-email': ok({ emailVerified: true }), 'GET /api/session': ok(null) });
    renderWithQuery(
      <StrictMode>
        <EmailVerification token={TOKEN} />
      </StrictMode>,
    );
    expect(await screen.findByText('Email verified')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/v1/auth/verify-email')).toHaveLength(1);
  });

  it('offers a new link when the token is rejected or missing', async () => {
    respond({ 'POST /api/v1/auth/verify-email': fail(400, 'INVALID_OR_EXPIRED_TOKEN') });
    const { unmount } = renderWithQuery(<EmailVerification token={TOKEN} />);
    expect(await screen.findByText('Verification link not valid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeInTheDocument();
    unmount();
    renderWithQuery(<EmailVerification />);
    expect(screen.getByText('Verification link not valid')).toBeInTheDocument();
  });
});

describe('PermissionGate (3.14)', () => {
  it('renders children only with the required permissions, else the fallback', () => {
    const user = { permissions: ['cms.manage'] };
    render(
      <>
        <PermissionGate user={user} require="cms.manage">
          <p>edit</p>
        </PermissionGate>
        <PermissionGate user={user} require={['cms.manage', 'cms.publish']} fallback={<p>no publish</p>}>
          <p>publish</p>
        </PermissionGate>
        <PermissionGate user={null} require="cms.manage">
          <p>anon</p>
        </PermissionGate>
      </>,
    );
    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('no publish')).toBeInTheDocument();
    expect(screen.queryByText('publish')).not.toBeInTheDocument();
    expect(screen.queryByText('anon')).not.toBeInTheDocument();
  });
});
