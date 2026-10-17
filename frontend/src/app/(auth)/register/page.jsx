import { redirect } from 'next/navigation';
import TextLink from '@/components/ui/TextLink';
import { AuthCard, RegisterForm } from '@/features/auth';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const metadata = { title: 'Create an account' };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/account');
  return (
    <AuthCard
      title="Create an account"
      description="Save trips, book stays and experiences across Jharkhand."
      footer={
        <>
          Already have an account? <TextLink href="/login">Sign in</TextLink>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
