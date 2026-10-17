'use client';

import { authService } from '../services/authService';
import EmailRequestForm from './EmailRequestForm';

/** Requests a password-reset email (POST /auth/forgot-password). */
export default function ForgotPasswordForm() {
  return <EmailRequestForm action={authService.forgotPassword} submitLabel="Send reset link" />;
}
