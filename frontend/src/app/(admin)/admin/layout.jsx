import ForbiddenState from '@/components/feedback/ForbiddenState';
import Container from '@/components/layout/Container';
import { requirePermission } from '@/lib/auth/requirePermission';
import { ADMIN_AREA_PERMISSIONS } from '@/lib/permissions/permissionGate';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Server-side guard for the admin area (W13): sign-in required, then any admin-area permission. Each admin page
// checks its own permission (Phase 9). Express answers 403 regardless of what the UI shows.
export default async function AdminLayout({ children }) {
  const { allowed } = await requirePermission(ADMIN_AREA_PERMISSIONS, { mode: 'any', fallbackPath: '/admin' });
  if (!allowed) {
    return (
      <main className="py-16">
        <Container>
          <ForbiddenState />
        </Container>
      </main>
    );
  }
  return children;
}
