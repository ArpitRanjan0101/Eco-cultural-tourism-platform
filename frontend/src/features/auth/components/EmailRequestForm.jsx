'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Alert from '@/components/feedback/Alert';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { applyApiErrors } from '@/lib/api/formErrors';
import { emailOnlySchema } from '../schemas/authSchemas';
import FormMessage from './FormMessage';

/**
 * Single-email request form shared by "forgot password" and "resend verification". Both backend operations
 * always answer 202 with the same message (no account enumeration), which is shown as-is.
 * @param {{ action: ({ email }) => Promise<{ message: string }>, submitLabel: string, defaultEmail?: string }} props
 */
export default function EmailRequestForm({ action, submitLabel, defaultEmail = '' }) {
  const [failure, setFailure] = useState(null);
  const [accepted, setAccepted] = useState(null);
  const { register, handleSubmit, setError, formState } = useForm({ resolver: zodResolver(emailOnlySchema), defaultValues: { email: defaultEmail } });
  const { errors, isSubmitting } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      setAccepted((await action(values)).message);
    } catch (error) {
      setFailure(applyApiErrors(error, setError, { fields: ['email'] }));
    }
  });

  if (accepted) return <Alert tone="success">{accepted}</Alert>;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormMessage {...failure} />
      <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
      <Button type="submit" loading={isSubmitting} fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}
