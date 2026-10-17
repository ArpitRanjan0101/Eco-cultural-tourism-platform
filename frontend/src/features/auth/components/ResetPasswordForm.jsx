'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Alert from '@/components/feedback/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TextLink from '@/components/ui/TextLink';
import { applyApiErrors } from '@/lib/api/formErrors';
import { queryKeys } from '@/lib/api/queryKeys';
import { isWellFormedToken, resetPasswordSchema } from '../schemas/authSchemas';
import { authService } from '../services/authService';
import FormMessage from './FormMessage';

const LINK_PROBLEM = 'This reset link is invalid or has expired. Request a new one.';

/**
 * Sets a new password with the token from the reset email. Success revokes every session (backend), so the user
 * signs in again.
 * @param {{ token?: string }} props
 */
export default function ResetPasswordForm({ token }) {
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });
  const { errors, isSubmitting } = formState;

  if (!isWellFormedToken(token)) {
    return (
      <Alert tone="danger" title="Reset link not valid">
        {LINK_PROBLEM} <TextLink href="/forgot-password">Request a new link</TextLink>.
      </Alert>
    );
  }
  if (done) {
    return (
      <Alert tone="success" title="Password changed">
        For your security every session was signed out. <TextLink href="/login">Sign in</TextLink> with your new password.
      </Alert>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFailure(null);
    try {
      await authService.resetPassword({ token, newPassword: password });
      queryClient.setQueryData(queryKeys.session, null);
      setDone(true);
    } catch (error) {
      const result = applyApiErrors(error, (name, value) => setError(name === 'newPassword' ? 'password' : name, value), {
        fields: ['newPassword'],
        messages: { INVALID_OR_EXPIRED_TOKEN: LINK_PROBLEM },
      });
      setFailure(result);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage {...failure} />
      <Input label="New password" type="password" autoComplete="new-password" required hint="At least 8 characters." error={errors.password?.message} {...register('password')} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      <Button type="submit" loading={isSubmitting} fullWidth>
        Change password
      </Button>
    </form>
  );
}
