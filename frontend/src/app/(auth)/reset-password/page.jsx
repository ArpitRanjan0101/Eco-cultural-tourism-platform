import TextLink from '@/components/ui/TextLink';
import { AuthCard, ResetPasswordForm } from '@/features/auth';

export const metadata = { title: 'Choose a new password', referrer: 'no-referrer' };

// Reached from the reset email: /reset-password?token=… (backend notifications.service.js).
export default async function ResetPasswordPage({ searchParams }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" footer={<TextLink href="/login">Back to sign in</TextLink>}>
      <ResetPasswordForm token={typeof token === 'string' ? token : undefined} />
    </AuthCard>
  );
}
