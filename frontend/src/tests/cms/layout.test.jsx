import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DesktopNavigation from '@/components/layout/DesktopNavigation';
import MobileNavigation from '@/components/layout/MobileNavigation';
import PublicFooter from '@/components/layout/PublicFooter';
import PublicHeader from '@/components/layout/PublicHeader';
import SiteAnnouncement from '@/components/layout/SiteAnnouncement';
import { menuItemHref, toNavItems } from '@/cms/links';
import { formatDate, formatDuration, formatInstant } from '@/lib/formatting/dates';
import { formatMoney } from '@/lib/formatting/money';
import { expectNoAxeViolations } from '../axe';

const pathname = { value: '/destinations/sample-falls' };
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn() }) }));

const MENU = [
  { id: '1', label: 'Destinations', linkType: 'internal', linkValue: '/destinations', children: [
    { id: '1a', label: 'Sample Falls', linkType: 'destination', linkValue: 'sample-falls', children: [] },
    { id: '1b', label: 'Ranchi', linkType: 'district', linkValue: 'ranchi', children: [
      { id: '1b1', label: 'Deep', linkType: 'page', linkValue: 'deep', children: [
        { id: 'too-deep', label: 'Level 4', linkType: 'internal', linkValue: '/x', children: [] },
      ] },
    ] },
  ] },
  { id: '2', label: 'About', linkType: 'page', linkValue: 'about', children: [] },
  { id: '3', label: 'Partner site', linkType: 'external', linkValue: 'https://example.org', children: [] },
  { id: '4', label: 'Bad', linkType: 'external', linkValue: 'javascript:alert(1)', children: [] },
  { id: '5', label: 'Waterfalls', linkType: 'category', linkValue: 'waterfalls', children: [] },
];
const NAV = toNavItems(MENU);

describe('CMS menu links (4.2–4.4)', () => {
  it.each([
    [{ linkType: 'internal', linkValue: '/stays' }, '/stays'],
    [{ linkType: 'internal', linkValue: '//evil.example' }, null],
    [{ linkType: 'external', linkValue: 'https://example.org' }, 'https://example.org'],
    [{ linkType: 'external', linkValue: 'http://example.org' }, null],
    [{ linkType: 'page', linkValue: 'about-us' }, '/pages/about-us'],
    [{ linkType: 'destination', linkValue: 'Bad Slug' }, null],
    [{ linkType: 'district', linkValue: 'ranchi' }, '/districts/ranchi'],
    [{ linkType: 'category', linkValue: 'waterfalls' }, '/destinations?category=waterfalls'],
    [{ linkType: 'script', linkValue: 'x' }, null],
  ])('menuItemHref(%j) → %s', (item, expected) => {
    expect(menuItemHref(item)).toBe(expected);
  });

  it('toNavItems drops unsafe items and anything deeper than three levels', () => {
    expect(NAV.map((item) => item.label)).toEqual(['Destinations', 'About', 'Partner site', 'Waterfalls']);
    expect(NAV[0].children[1].children[0].children).toEqual([]);
    expect(NAV[2].external).toBe(true);
  });
});

describe('DesktopNavigation (4.2)', () => {
  it('marks the current section and opens submenus by button; Escape closes and returns focus', async () => {
    const { container } = render(<DesktopNavigation items={NAV} />);
    const toggle = screen.getByRole('button', { name: 'Destinations' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Sample Falls' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All destinations' })).toHaveAttribute('href', '/destinations');
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Partner site (opens in a new tab)' })).toHaveAttribute('target', '_blank');
    await expectNoAxeViolations(container);
  });
});

describe('MobileNavigation (4.3)', () => {
  it('opens a drawer with the full tree and account actions, closing on navigation', async () => {
    render(<MobileNavigation items={NAV} siteName="Sample site" accountItems={[{ id: 'login', label: 'Sign in', href: '/login' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Sample site' });
    const main = within(drawer).getByRole('navigation', { name: 'Main' });
    expect(within(main).getByRole('link', { name: 'Ranchi' })).toHaveAttribute('href', '/districts/ranchi');
    expect(within(main).getByRole('link', { name: 'Deep' })).toHaveAttribute('href', '/pages/deep');
    expect(within(drawer).getByRole('navigation', { name: 'Account' })).toHaveTextContent('Sign in');
    await userEvent.click(within(main).getByRole('link', { name: 'About' }));
    expect(drawer).not.toHaveAttribute('open');
  });
});

describe('PublicHeader, PublicFooter, SiteAnnouncement (4.1, 4.4, 4.5)', () => {
  it('header: skip link, home link, desktop navigation and account actions', async () => {
    const { container } = render(<PublicHeader siteName="Sample site" navItems={NAV} accountItems={[{ id: 'login', label: 'Sign in', href: '/login' }, { id: 'register', label: 'Create account', href: '/register', primary: true }]} />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('link', { name: 'Sample site' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    await expectNoAxeViolations(container);
  });

  it('footer: CMS columns for items with children, other links grouped', async () => {
    const { container } = render(<PublicFooter siteName="Sample site" description="Desc" items={NAV} year={2026} />);
    const column = screen.getByRole('navigation', { name: 'Destinations' });
    expect(within(column).getByRole('link', { name: 'Ranchi' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/pages/about');
    expect(screen.getByText('© 2026 Sample site')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('announcements: shown with safe links only; nothing when there are none', () => {
    const { container, rerender } = render(
      <SiteAnnouncement
        announcements={[
          { id: 'a', title: 'Festival', message: 'Roads busy.', link: '/pages/festival' },
          { id: 'b', title: 'Monsoon', message: 'Check routes.', link: 'javascript:alert(1)' },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Announcements' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Learn more' })).toHaveLength(1);
    rerender(<SiteAnnouncement announcements={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('formatting (W12)', () => {
  it('money from decimal strings, no floats; invalid → null', () => {
    expect(formatMoney('2400.00')).toBe('₹2,400');
    expect(formatMoney('123456.50')).toBe('₹1,23,456.5');
    expect(formatMoney('0.10')).toBe('₹0.1');
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney('12abc')).toBeNull();
  });

  it('calendar dates without time-zone shift; instants in India time; durations', () => {
    expect(formatDate('2026-12-10')).toBe('10 Dec 2026');
    expect(formatDate('10/12/2026')).toBeNull();
    expect(formatInstant('2026-12-09T20:30:00Z')).toMatch(/10 Dec 2026/);
    expect(formatDuration(150)).toBe('2 h 30 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(0)).toBeNull();
  });
});
