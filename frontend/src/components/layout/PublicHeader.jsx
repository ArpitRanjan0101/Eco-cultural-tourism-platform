import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import Container from './Container';
import DesktopNavigation from './DesktopNavigation';
import MobileNavigation from './MobileNavigation';

/**
 * Public site header: skip link, wordmark, navigation (desktop list / mobile drawer) and account actions.
 * Account items arrive pre-computed by the layout (signed in or not, admin link by permission — W13).
 * @param {{ siteName: string, navItems: Array<object>, accountItems: Array<{ id: string, label: string, href: string,
 *   primary?: boolean }> }} props
 */
export default function PublicHeader({ siteName, navItems, accountItems }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/95 backdrop-blur">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-surface-raised px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to main content
      </a>
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" className="rounded-sm font-display text-lg font-bold leading-tight text-primary focus-visible:outline-2 focus-visible:outline-focus">
          {siteName}
        </Link>
        <DesktopNavigation items={navItems} className="ml-auto hidden lg:block" />
        <div className="ml-auto hidden items-center gap-2 lg:ml-2 lg:flex">
          {accountItems.map((item) => (
            <ButtonLink key={item.id} href={item.href} size="sm" variant={item.primary ? 'primary' : 'ghost'}>
              {item.label}
            </ButtonLink>
          ))}
        </div>
        <MobileNavigation items={navItems} accountItems={accountItems} siteName={siteName} className="ml-auto lg:hidden" />
      </Container>
    </header>
  );
}
