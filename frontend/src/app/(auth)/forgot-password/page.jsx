import TextLink from '@/components/ui/TextLink';
import { AuthCard, ForgotPasswordForm } from '@/features/auth';

export const metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your email and we will send you a link to choose a new password."
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
