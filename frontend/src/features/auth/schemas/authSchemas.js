import { z } from 'zod';

// UX mirror of the backend request schemas (docs/api/openapi.json, /auth/*). Express validates again (W4).
const email = z.string().trim().min(1, 'Enter your email address.').max(254, 'Email is too long.').pipe(z.email('Enter a valid email address.'));
const newPassword = z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.');
const token = z.string().min(20).max(200);

const passwordsMatch = (data) => data.password === data.confirmPassword;
const mismatch = { message: 'Passwords do not match.', path: ['confirmPassword'] };

// POST /auth/login { email, password: 1..128 }
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128, 'Use at most 128 characters.'),
});

// POST /auth/register { fullName: 1..150, email, password: 8..128 } (+ client-only confirmation)
export const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter your full name.').max(150, 'Use at most 150 characters.'),
    email,
    password: newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch, mismatch);

// POST /auth/forgot-password and /auth/resend-verification { email }
export const emailOnlySchema = z.object({ email });

// POST /auth/reset-password { token: 20..200, newPassword: 8..128 } (+ client-only confirmation)
export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

/** True when a token from an email link has the shape the backend accepts. */
export const isWellFormedToken = (value) => token.safeParse(value).success;
