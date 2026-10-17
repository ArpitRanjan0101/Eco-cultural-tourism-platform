import { redirect } from 'next/navigation';
import TextLink from '@/components/ui/TextLink';
import { AuthCard, LoginForm } from '@/features/auth';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { safeNextPath } from '@/lib/auth/safeRedirect';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to manage your trips and bookings."
      footer={
        <>
          New here? <TextLink href="/register">Create an account</TextLink>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
