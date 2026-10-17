// Auth pages are personal and never indexed.
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }) {
  return children;
}
