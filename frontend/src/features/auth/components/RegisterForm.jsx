'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Alert from '@/components/feedback/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import TextLink from '@/components/ui/TextLink';
import { applyApiErrors } from '@/lib/api/formErrors';
import { registerSchema } from '../schemas/authSchemas';
import { authService } from '../services/authService';
import FormMessage from './FormMessage';

/**
 * Account creation. The backend answers 202 with the same message whether or not the email already has an
 * account (no enumeration, backend A6), so the confirmation never claims an account was created.
 */
export default function RegisterForm() {
  const [failure, setFailure] = useState(null);
  const [accepted, setAccepted] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = formState;

  const onSubmit = handleSubmit(async ({ fullName, email, password }) => {
    setFailure(null);
    try {
      const result = await authService.register({ fullName, email, password });
      setAccepted({ email, message: result.message });
    } catch (error) {
      setFailure(applyApiErrors(error, setError, { fields: ['fullName', 'email', 'password'] }));
    }
  });

  if (accepted) {
    return (
      <Alert tone="success" title="Check your email">
        <p>{accepted.message}</p>
        <p className="mt-2">
          We sent the link to <strong>{accepted.email}</strong>. Open it to verify your address, then{' '}
          <TextLink href="/login">sign in</TextLink>.
        </p>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage {...failure} />
      <Input label="Full name" autoComplete="name" required error={errors.fullName?.message} {...register('fullName')} />
      <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
      <Input label="Password" type="password" autoComplete="new-password" required hint="At least 8 characters." error={errors.password?.message} {...register('password')} />
      <Input label="Confirm password" type="password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      <Button type="submit" loading={isSubmitting} fullWidth>
        Create account
      </Button>
    </form>
  );
}
