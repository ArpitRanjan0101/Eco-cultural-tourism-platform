import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import { SignOutButtons } from '@/features/auth';

export const metadata = { title: 'Admin console' };

// Phase 3 placeholder behind the admin guard. The console itself is built in Phase 9.
export default function AdminHomePage() {
  return (
    <main>
      <Container>
        <PageHeader eyebrow="Administration" title="Admin console" description="The console modules arrive in a later release." />
        <div className="pb-12">
          <SignOutButtons />
        </div>
      </Container>
    </main>
  );
}
