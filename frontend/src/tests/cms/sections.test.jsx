import { QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/providers/QueryProvider';
import Markdown, { safeUrlTransform } from '@/cms/Markdown';
import SectionRenderer, { firstSectionIsHero } from '@/cms/SectionRenderer';
import { SECTION_REGISTRY } from '@/cms/sectionRegistry';
import { SECTION_SCHEMAS } from '@/cms/sectionSchemas';
import { BACKEND_SECTION_TYPES } from '@/cms/sectionTypes.generated';
import { expectNoAxeViolations } from '../axe';
import { ALL_SECTIONS, SECTION_FIXTURES, cards } from './fixtures';

// Sections render inside the app's providers (home_search uses the router and TanStack Query for autocomplete).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const render = (ui) => rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider> });

afterEach(() => vi.restoreAllMocks());

describe('section registry (4.7, 4.8)', () => {
  it('covers exactly the backend section types — no unregistered type, no unused entry', () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...BACKEND_SECTION_TYPES].sort());
    expect(Object.keys(SECTION_SCHEMAS).sort()).toEqual([...BACKEND_SECTION_TYPES].sort());
    expect(Object.keys(SECTION_FIXTURES).sort()).toEqual([...BACKEND_SECTION_TYPES].sort());
  });

  it.each(Object.entries(SECTION_REGISTRY))('%s has a schema and a component, and its fixture validates', (type, entry) => {
    expect(entry.Component).toBeTypeOf('function');
    expect(entry.schema.safeParse(SECTION_FIXTURES[type]).success).toBe(true);
  });

  it.each([
    ['hero', { ...SECTION_FIXTURES.hero, cta: { label: 'x', href: 'javascript:alert(1)' } }],
    ['hero', { ...SECTION_FIXTURES.hero, cta: { label: 'x', href: '//evil.example' } }],
    ['hero', { ...SECTION_FIXTURES.hero, image: { ...SECTION_FIXTURES.hero.image, url: 'data:image/png;base64,AA' } }],
    ['image_text', { ...SECTION_FIXTURES.image_text, imagePosition: 'middle' }],
    ['featured_stays', { heading: 'x', properties: [{ ...cards.property, bookingMode: 'maybe' }] }],
    ['faq', { heading: 'x', items: [] }],
    ['statistics_strip', { items: [{ value: 3, label: 'x' }] }],
    ['cta_banner', { heading: 'x', text: 'y', image: null }],
  ])('%s rejects unsafe or malformed data', (type, data) => {
    expect(SECTION_SCHEMAS[type].safeParse(data).success).toBe(false);
  });
});

describe('SectionRenderer (4.6)', () => {
  it('renders every approved section type with validated data and no axe violations', async () => {
    const { container } = render(<SectionRenderer sections={ALL_SECTIONS} promoteFirstHero />);
    expect(screen.getByRole('heading', { level: 1, name: 'Discover the sample land' })).toBeInTheDocument();
    for (const heading of ['Must-see places', 'Ways to explore', 'Districts', 'Places to stay', 'Experiences', 'Local guides', 'Tour packages', 'Sample art', 'Living culture', 'Questions']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
    const searchSection = screen.getByRole('region', { name: 'Where to?' });
    expect(within(searchSection).getByRole('search', { name: 'Site search' })).toHaveAttribute('action', '/search');
    expect(within(searchSection).getByRole('combobox')).toHaveAttribute('placeholder', 'Waterfalls, forests…');
    expect(screen.getByText('24')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('skips unknown types and invalid data, logging instead of rendering raw content', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <SectionRenderer
        sections={[
          { id: 'a', type: 'marquee', data: { html: '<script>x</script>' } },
          { id: 'b', type: 'hero', data: { heading: 'Bad', image: null, cta: { label: 'x', href: 'javascript:alert(1)' } } },
          { id: 'c', type: '__proto__', data: {} },
          { id: 'd', type: 'rich_text', data: { markdown: 'Still here' } },
        ]}
      />,
    );
    expect(screen.queryByText('Bad')).not.toBeInTheDocument();
    expect(screen.getByText('Still here')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map(([line]) => JSON.parse(line).reason)).toEqual(['unknown-type', 'invalid-data', 'unknown-type']);
  });

  it('hero is h2 unless promoted in first position', () => {
    render(<SectionRenderer sections={[{ id: 'x', type: 'rich_text', data: { markdown: 'x' } }, { id: 'h', type: 'hero', data: SECTION_FIXTURES.hero }]} promoteFirstHero />);
    expect(screen.getByRole('heading', { level: 2, name: 'Discover the sample land' })).toBeInTheDocument();
    expect(firstSectionIsHero([{ type: 'hero', data: SECTION_FIXTURES.hero }])).toBe(true);
    expect(firstSectionIsHero([{ type: 'hero', data: {} }])).toBe(false);
  });

  it('live-card sections with no public items render nothing (no placeholder cards)', () => {
    const { container } = render(
      <SectionRenderer
        sections={[
          { id: '1', type: 'featured_stays', data: { heading: 'Stays', properties: [] } },
          { id: '2', type: 'guide_spotlight', data: { heading: 'Guides', guides: [] } },
          { id: '3', type: 'featured_destinations', data: { heading: 'Places', destinations: [] } },
        ]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('section content (4.9–4.22)', () => {
  it('cards show API values only: prices as returned, honest fallbacks, real links', () => {
    render(<SectionRenderer sections={ALL_SECTIONS} />);
    const stays = screen.getByRole('list', { name: 'Places to stay' });
    expect(within(stays).getByRole('link', { name: 'Sample Lodge' })).toHaveAttribute('href', '/stays/sample-lodge');
    expect(within(stays).getByText('₹2,400')).toBeInTheDocument();
    expect(within(stays).getByText('Instant booking')).toBeInTheDocument();
    const experiences = screen.getByRole('list', { name: 'Experiences' });
    expect(within(experiences).getByText('No upcoming sessions')).toBeInTheDocument();
    expect(within(experiences).getByText('2 h 30 min')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sample Guide' })).toHaveAttribute('href', '/guides/g1');
    expect(screen.getByText('Next departure: 10 Dec 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Waterfalls Falling water' })).toHaveAttribute('href', '/destinations?category=waterfalls');
    expect(screen.getByRole('link', { name: /Ranchi/ })).toHaveAttribute('href', '/districts/ranchi');
  });

  it('statistics are shown exactly as the editor entered them, as a description list', () => {
    render(<SectionRenderer sections={[{ id: 's', type: 'statistics_strip', data: SECTION_FIXTURES.statistics_strip }]} />);
    const terms = screen.getAllByRole('term').map((node) => node.textContent);
    const values = screen.getAllByRole('definition').map((node) => node.textContent);
    expect(terms).toEqual(['Sample districts', 'Sample waterfalls']);
    expect(values).toEqual(['24', '100+']);
  });

  it('image-text places the image on the requested side; cultural highlight external links open safely', () => {
    const { container } = render(<SectionRenderer sections={ALL_SECTIONS.filter((s) => ['image_text', 'cultural_highlights'].includes(s.type))} />);
    expect(container.querySelector('.md\\:order-2')).not.toBeNull();
    const external = screen.getByRole('link', { name: 'Read more (opens in a new tab)' });
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('Markdown safety (4.22)', () => {
  it('never renders raw HTML or script URLs; keeps safe links', () => {
    const { container } = render(
      <Markdown>{'# Title\n\nHello <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [data](data:text/html,x) [rel](//evil.example) [ok](/destinations) [ext](https://example.org)\n\n![pic](https://example.org/a.png)'}</Markdown>,
    );
    expect(container.querySelector('script, img, h1')).toBeNull();
    expect(container.querySelector('h3')).toHaveTextContent('Title');
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'rel' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute('href', '/destinations');
    expect(screen.getByRole('link', { name: 'ext (opens in a new tab)' })).toHaveAttribute('target', '_blank');
    expect(container.innerHTML).not.toMatch(/onerror|javascript:/);
  });

  it('url transform allows only paths and https', () => {
    expect(safeUrlTransform('/a')).toBe('/a');
    expect(safeUrlTransform('https://x.org')).toBe('https://x.org');
    for (const bad of ['http://x.org', 'javascript:alert(1)', '//x.org', 'mailto:a@b.c', '/\\evil']) expect(safeUrlTransform(bad)).toBeNull();
  });
});
