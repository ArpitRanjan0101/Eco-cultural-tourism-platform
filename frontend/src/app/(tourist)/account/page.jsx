import Alert from '@/components/feedback/Alert';
import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import { SignOutButtons } from '@/features/auth';
import { humanizeStatus } from '@/components/ui/StatusBadge';
import { requireSession } from '@/lib/auth/requireSession';

export const metadata = { title: 'Your account' };

// Phase 3 account landing: identity from GET /auth/me and sign-out. The full account area is Phase 7.
export default async function AccountPage() {
  // Layouts and pages render in parallel; the page guards itself too (memoised, no extra backend call).
  const user = await requireSession('/account');
  return (
    <main>
      <Container size="md">
        <PageHeader eyebrow="Your account" title={`Hello, ${user.fullName}`} description={user.email} />
        <div className="flex flex-col gap-6 pb-12">
          {!user.emailVerified ? (
            <Alert tone="warning" title="Verify your email">
              Open the link we emailed you. Bookings need a verified email address.
            </Alert>
          ) : null}
          <section aria-labelledby="roles-heading" className="flex flex-col gap-2">
            <h2 id="roles-heading" className="font-sans text-base font-semibold">
              Roles
            </h2>
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Badge key={role} tone="primary">
                  {humanizeStatus(role)}
                </Badge>
              ))}
            </div>
          </section>
          <SignOutButtons />
        </div>
      </Container>
    </main>
  );
}
