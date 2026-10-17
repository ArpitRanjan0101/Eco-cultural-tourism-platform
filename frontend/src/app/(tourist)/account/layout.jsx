import { requireSession } from '@/lib/auth/requireSession';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

// Server-side guard for the tourist area (W13): anonymous visitors go to /login?next=<this path>.
export default async function AccountLayout({ children }) {
  await requireSession('/account');
  return children;
}
