import { AuthCard, EmailVerification } from '@/features/auth';

export const metadata = { title: 'Verify your email', referrer: 'no-referrer' };

// Reached from the verification email: /verify-email?token=… (backend notifications.service.js).
export default async function VerifyEmailPage({ searchParams }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Verify your email">
      <EmailVerification token={typeof token === 'string' ? token : undefined} />
    </AuthCard>
  );
}
