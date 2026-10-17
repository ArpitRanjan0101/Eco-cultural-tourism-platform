import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RatingSummary from '@/components/data-display/Rating';
import ActiveFilterChips from '@/components/navigation/ActiveFilterChips';
import ResultsPagination from '@/components/navigation/ResultsPagination';
import SortSelector from '@/components/navigation/SortSelector';
import MapListToggle from '@/components/maps/MapListToggle';
import { DestinationFilters, DestinationGrid, VisitorInformation } from '@/features/destinations';
import { RegionFilter } from '@/features/geography';
import { GlobalSearch, NearMeExplorer, SearchResults, SearchResultTabs } from '@/features/search';
import { createQueryClient } from '@/providers/QueryProvider';
import { expectNoAxeViolations } from '../axe';
import { destination, destinationDetail, district, filters } from './fixtures';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/' }));
// The real map is lazy-loaded Leaflet (browser only); here a stub proves what MapView receives.
vi.mock('next/dynamic', () => ({ default: () => (props) => <div data-testid="leaflet" data-places={props.places.length} aria-label={props.label} /> }));

const withQuery = (ui) => render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('geography (5.1, 5.2)', () => {
  it('RegionFilter marks the current region and links each', () => {
    render(<RegionFilter regions={[{ slug: 'kolhan', name: 'Kolhan' }]} value="kolhan" hrefFor={(slug) => (slug ? `/districts?region=${slug}` : '/districts')} />);
    expect(screen.getByRole('link', { name: 'Kolhan' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All regions' })).toHaveAttribute('href', '/districts');
  });
});

describe('destinations (5.3, 5.4)', () => {
  it('filters are a GET form with only the supported fields, keeping the sort', async () => {
    const { container } = render(<DestinationFilters action="/destinations" values={{ q: 'falls', sort: '-name', featured: 'true' }} regions={filters.regions} categories={filters.categories} />);
    const form = screen.getByRole('search', { name: 'Filter destinations' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/destinations');
    expect(screen.getByRole('searchbox', { name: 'Search by name' })).toHaveValue('falls');
    expect(screen.getByRole('option', { name: 'Sample District (Sample Region)' })).toHaveValue('sample-district');
    expect(screen.getByRole('checkbox', { name: 'Featured only' })).toBeChecked();
    expect(container.querySelector('input[type=hidden][name=sort]')).toHaveValue('-name');
    expect([...new FormData(form).keys()].sort()).toEqual(['category', 'district', 'featured', 'q', 'region', 'sort']);
    await expectNoAxeViolations(container);
  });

  it('grid shows distance only when asked, and a real empty state', () => {
    const { rerender } = render(<DestinationGrid destinations={[destination({ distanceKm: 4.26 })]} showDistance />);
    expect(screen.getByText('Sample District · 4.3 km away')).toBeInTheDocument();
    rerender(<DestinationGrid destinations={[]} />);
    expect(screen.getByRole('heading', { name: 'No destinations found' })).toBeInTheDocument();
  });

  it('visitor information shows only API facts: open, closed, and unpublished days', () => {
    render(<VisitorInformation destination={destinationDetail} />);
    const hours = screen.getByRole('table', { name: 'Opening hours' });
    expect(within(hours).getByRole('row', { name: 'Monday 09:00–17:00' })).toBeInTheDocument();
    expect(within(hours).getByRole('row', { name: 'Tuesday Closed' })).toBeInTheDocument();
    expect(within(hours).getByRole('row', { name: 'Sunday No hours published' })).toBeInTheDocument();
    expect(screen.getByText('₹30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in OpenStreetMap (opens in a new tab)' })).toHaveAttribute('href', expect.stringContaining('mlat=23.4'));
    render(<VisitorInformation destination={{ ...destinationDetail, entryFee: null, openingHours: null }} />);
    expect(screen.getByText('Not published')).toBeInTheDocument();
  });

  it('rating summary never invents a score', () => {
    const { rerender } = render(<RatingSummary summary={{ count: 0, average: null, distribution: {} }} />);
    expect(screen.getByText('No reviews yet.')).toBeInTheDocument();
    rerender(<RatingSummary summary={{ count: 4, average: 4.25, distribution: { 5: 2, 4: 1, 3: 1, 2: 0, 1: 0 } }} />);
    expect(screen.getByText('4.3')).toBeInTheDocument();
    expect(screen.getByText('4.3 out of 5')).toBeInTheDocument();
    expect(screen.getByText('4 reviews')).toBeInTheDocument();
  });
});

describe('list controls (5.5)', () => {
  it('sort selector keeps other filters, drops page, and submits on change', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const { container } = render(<SortSelector action="/destinations" value="name" params={{ q: 'falls', page: '3', sort: 'name' }} options={[{ value: 'name', label: 'Name' }, { value: '-name', label: 'Name desc' }]} />);
    const form = container.querySelector('form');
    form.addEventListener('submit', submit);
    expect([...form.querySelectorAll('input[type=hidden]')].map((input) => `${input.name}=${input.value}`)).toEqual(['q=falls']);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), '-name');
    expect(submit).toHaveBeenCalledOnce();
  });

  it('pagination preserves filters and respects the result window', () => {
    render(<ResultsPagination pathname="/search" params={{ q: 'falls', type: 'guide' }} meta={{ page: 1, limit: 12, total: 9000 }} maxPage={41} />);
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/search?q=falls&type=guide&page=2');
    expect(screen.getByRole('link', { name: 'Page 41' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Page 42' })).not.toBeInTheDocument();
  });

  it('active filter chips remove one filter each and clear all', () => {
    render(<ActiveFilterChips chips={[{ key: 'q', label: '“falls”', removeHref: '/destinations' }]} clearHref="/destinations" />);
    expect(screen.getByRole('link', { name: 'Remove filter: “falls”' })).toHaveAttribute('href', '/destinations');
    expect(screen.getByRole('link', { name: 'Clear all' })).toBeInTheDocument();
  });

  it('map/list toggle defaults to the list, loads the map on demand, and hides itself without coordinates', async () => {
    const { rerender } = render(<MapListToggle list={<p>the list</p>} map={<p>the map</p>} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('the map')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByText('the map')).toBeVisible();
    expect(screen.getByText('the list')).not.toBeVisible();
    rerender(<MapListToggle canShowMap={false} list={<p>only list</p>} map={<p>x</p>} />);
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument();
  });
});

describe('search (5.5)', () => {
  it('tabs: links per type from the API; types filters cannot match are unavailable', () => {
    render(<SearchResultTabs types={filters.types} active="destination" params={{ q: 'falls', region: 'kolhan', type: 'destination' }} filtered />);
    expect(screen.getByRole('link', { name: 'Destinations' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'All results' })).toHaveAttribute('href', '/search?q=falls&region=kolhan');
    expect(screen.queryByRole('link', { name: 'Stays' })).not.toBeInTheDocument();
    expect(screen.getByText('Stays')).toHaveAttribute('aria-disabled', 'true');
  });

  it('results render one card per known type and skip unknown variants', () => {
    render(
      <SearchResults
        label="Results"
        items={[
          { type: 'destination', ...destination() },
          { type: 'district', id: 'd1', name: district.name, slug: district.slug, region: district.region, location: district.location, rank: 1 },
          { type: 'mystery', id: 'm1', name: 'Unknown' },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Sample District' })).toHaveAttribute('href', '/districts/sample-district');
  });

  it('autocomplete: combobox fetches through the BFF, arrow keys move, Enter opens the suggestion', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path) => {
        calls.push(path);
        return Response.json({ success: true, data: [{ type: 'destination', id: '1', name: 'Sample Falls', slug: 'sample-falls', subtitle: 'Ranchi' }, { type: 'category', id: '2', name: 'Waterfalls', slug: 'waterfalls', subtitle: null }] });
      }),
    );
    const { container } = withQuery(<GlobalSearch />);
    const input = screen.getByRole('combobox', { name: 'Search destinations, stays, guides and more' });
    await userEvent.type(input, 'fa');
    const listbox = await screen.findByRole('listbox', { name: 'Suggestions' });
    expect(calls[0]).toBe('/api/v1/search/suggestions?q=fa&limit=8');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringMatching(/option-1$/));
    expect(within(listbox).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(router.push).toHaveBeenCalledWith('/destinations?category=waterfalls');
    await userEvent.type(input, 'l');
    await screen.findByRole('listbox', { name: 'Suggestions' });
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('fal'); // Escape closes the list without clearing the query
    expect(container.querySelector('form')).toHaveAttribute('action', '/search');
    await expectNoAxeViolations(container);
  });

  it('near me: nothing is requested until the visitor shares a location; refusal is explained', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
    withQuery(<NearMeExplorer nearbyTypes={filters.nearbyTypes} radius={filters.radiusKm} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByRole('status')).toHaveTextContent('Location permission was denied');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('near me: real coordinates go to /search/nearby via the BFF and results show with a map', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (path) => { calls.push(path); return Response.json({ success: true, data: [{ type: 'destination', ...destination({ distanceKm: 2.5 }) }], meta: { page: 1, limit: 12, total: 1 } }); }));
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 23.3441234, longitude: 85.3096789 } }) } });
    withQuery(<NearMeExplorer nearbyTypes={filters.nearbyTypes} radius={filters.radiusKm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Sample Falls' })).toBeInTheDocument());
    expect(calls[0]).toBe('/api/v1/search/nearby?lat=23.34412&lng=85.30968&radiusKm=25&type=destination&limit=12');
    expect(screen.getByTestId('leaflet')).toHaveAttribute('data-places', '1');
  });
});
