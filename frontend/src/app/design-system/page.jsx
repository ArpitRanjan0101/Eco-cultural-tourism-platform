import { notFound } from 'next/navigation';
import Showcase from './Showcase';

export const metadata = { title: 'Design system', robots: { index: false, follow: false } };

// Read the flag per request, not at build time.
export const dynamic = 'force-dynamic';

// Usage examples for every shared component (COMPONENT_CATALOG.md). Available in development; in production
// only when ENABLE_DESIGN_SYSTEM=true, which only the e2e target container sets (compose.dev.yml).
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DESIGN_SYSTEM !== 'true') notFound();
  return <Showcase />;
}
