'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Alert from '@/components/feedback/Alert';
import TextLink from '@/components/ui/TextLink';
import Spinner from '@/components/ui/Spinner';
import { queryKeys } from '@/lib/api/queryKeys';
import { isWellFormedToken } from '../schemas/authSchemas';
import { authService } from '../services/authService';
import EmailRequestForm from './EmailRequestForm';

/**
 * Completes email verification with the token from the email link. Verification is a POST made by this page
 * (link previews and scanners that only GET the URL cannot consume the token). Tokens are single-use, so the
 * request is sent exactly once per mount, including under React Strict Mode.
 * @param {{ token?: string }} props
 */
export default function EmailVerification({ token }) {
  const queryClient = useQueryClient();
  const valid = isWellFormedToken(token);
  const [state, setState] = useState(valid ? 'verifying' : 'invalid');
  const sent = useRef(false);

  useEffect(() => {
    if (!valid || sent.current) return;
    sent.current = true;
    authService
      .verifyEmail({ token })
      .then(() => {
        setState('verified');
        queryClient.invalidateQueries({ queryKey: queryKeys.session });
      })
      .catch(() => setState('failed'));
  }, [token, valid, queryClient]);

  if (state === 'verifying') {
    return (
      <div className="flex items-center gap-3 text-muted">
        <Spinner label="Verifying your email" />
        <span aria-hidden="true">Verifying your email…</span>
      </div>
    );
  }
  if (state === 'verified') {
    return (
      <Alert tone="success" title="Email verified">
        Your email address is confirmed. <TextLink href="/login">Sign in</TextLink> to continue.
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="danger" title="Verification link not valid">
        This link is invalid, expired or was already used. Enter your email to receive a new one.
      </Alert>
      <EmailRequestForm action={authService.resendVerification} submitLabel="Send a new link" />
    </div>
  );
}
