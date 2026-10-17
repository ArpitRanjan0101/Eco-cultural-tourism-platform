'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TextLink from '@/components/ui/TextLink';
import { applyApiErrors } from '@/lib/api/formErrors';
import { queryKeys } from '@/lib/api/queryKeys';
import { loginSchema } from '../schemas/authSchemas';
import { authService } from '../services/authService';
import FormMessage from './FormMessage';

const MESSAGES = {
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  LOGIN_LOCKED: 'Too many failed attempts. Sign-in is paused for this account.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support if you think this is a mistake.',
  RATE_LIMITED: 'Too many requests.',
  CSRF_FAILED: 'Your session form expired. Reload the page and try again.',
};

/**
 * Sign-in form. On success the BFF has set the session cookies; this seeds the session query and navigates to
 * `next` (already validated by the page with safeNextPath).
 * @param {{ next: string }} props
 */
export default function LoginForm({ next }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await authService.login(values);
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFailure(applyApiErrors(error, setError, { fields: ['email', 'password'], messages: MESSAGES }));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage {...failure} />
      <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
      <Input label="Password" type="password" autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
      <div className="flex justify-end text-sm">
        <TextLink href="/forgot-password" variant="subtle">
          Forgot your password?
        </TextLink>
      </div>
      <Button type="submit" loading={isSubmitting} fullWidth>
        Sign in
      </Button>
    </form>
  );
}
