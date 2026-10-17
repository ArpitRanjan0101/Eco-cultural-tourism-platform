import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Carousel from '@/components/data-display/Carousel';
import ImageGallery from '@/components/data-display/ImageGallery';
import Timeline from '@/components/data-display/Timeline';
import DashboardShell, { isCurrent } from '@/components/layout/DashboardShell';
import Accordion from '@/components/ui/Accordion';
import { expectNoAxeViolations } from '../axe';

const IMAGES = [
  { id: '1', url: 'https://cdn.example.org/1.jpg', altText: 'Waterfall', width: 800, height: 600 },
  { id: '2', url: 'https://cdn.example.org/2.jpg', altText: null, width: 800, height: 600 },
  { id: '3', url: 'https://cdn.example.org/3.jpg', altText: 'Temple', width: 800, height: 600 },
];

describe('Group F — Accordion', () => {
  it('toggles labelled regions; single mode closes others', async () => {
    const items = [
      { id: 'a', title: 'First', content: 'First body' },
      { id: 'b', title: 'Second', content: 'Second body' },
    ];
    const { container } = render(<Accordion items={items} allowMultiple={false} defaultOpen={['a']} />);
    const first = screen.getByRole('button', { name: 'First' });
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'First' })).toHaveTextContent('First body');
    await userEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Second' })).toBeVisible();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
    await expectNoAxeViolations(container);
  });
});

describe('Group F — ImageGallery', () => {
  it('opens a lightbox at the chosen image and navigates with buttons and arrow keys', async () => {
    const { container } = render(<ImageGallery images={IMAGES} title="Netarhat photos" />);
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Open Netarhat photos, image 2 of 3' }));
    const dialog = screen.getByRole('dialog', { name: 'Netarhat photos' });
    expect(within(dialog).getByRole('img', { name: 'Netarhat photos, image 2 of 3' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next image' }));
    expect(within(dialog).getByRole('img', { name: 'Temple' })).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole('img', { name: 'Temple' }), { key: 'ArrowRight' });
    expect(within(dialog).getByRole('img', { name: 'Waterfall' })).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole('img', { name: 'Waterfall' }), { key: 'ArrowLeft' });
    expect(within(dialog).getByRole('img', { name: 'Temple' })).toBeInTheDocument();
  });

  it('renders nothing without images', () => {
    const { container } = render(<ImageGallery images={[]} title="Empty" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Group F — Carousel and Timeline', () => {
  it('Carousel announces slides, hides inactive ones and wraps', async () => {
    const { container } = render(<Carousel label="Highlights" items={IMAGES} getItemKey={(item) => item.id} renderItem={(item) => <p>{item.id}</p>} />);
    const region = screen.getByRole('region', { name: 'Highlights' });
    expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    expect(screen.getByRole('group', { name: '1 of 3' })).not.toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(screen.getByRole('group', { name: '3 of 3' })).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByRole('button', { name: 'Show slide 3' })).toHaveAttribute('aria-current', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByRole('button', { name: 'Show slide 1' })).toHaveAttribute('aria-current', 'true');
    await expectNoAxeViolations(container);
  });

  it('Timeline is an ordered list with machine-readable times', async () => {
    const { container } = render(<Timeline items={[{ id: '1', title: 'Requested', time: '1 Oct', dateTime: '2026-10-01', tone: 'info' }, { id: '2', title: 'Confirmed', tone: 'success' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('1 Oct')).toHaveAttribute('datetime', '2026-10-01');
    await expectNoAxeViolations(container);
  });
});

describe('Group F — DashboardShell', () => {
  const NAV = [
    { href: '/admin', label: 'Overview', exact: true },
    { href: '/admin/users', label: 'Users' },
  ];

  it('isCurrent matches nested paths, or exactly for area roots', () => {
    expect(isCurrent('/admin/users/42', '/admin/users')).toBe(true);
    expect(isCurrent('/admin/users', '/admin', true)).toBe(false);
    expect(isCurrent('/admin-tools', '/admin')).toBe(false);
    expect(isCurrent(null, '/admin')).toBe(false);
  });

  it('marks the current item, provides a skip link and opens mobile navigation in a drawer', async () => {
    const { container } = render(
      <DashboardShell title="Admin" navLabel="Admin navigation" navItems={NAV} currentPath="/admin/users/7">
        <h1>Users</h1>
      </DashboardShell>,
    );
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    await expectNoAxeViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Open Admin navigation' }));
    const drawer = screen.getByRole('dialog', { name: 'Admin' });
    await userEvent.click(within(drawer).getByRole('link', { name: 'Users' }));
    expect(drawer).not.toHaveAttribute('open');
  });
});
