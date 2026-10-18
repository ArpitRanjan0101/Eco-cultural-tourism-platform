import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DestinationSupply } from '@/features/destinations';
import { ExperienceFacts, ExperienceSessions } from '@/features/experiences';
import { GuideAvailability, GuideCard, GuideFacts, GuideServices } from '@/features/guides';
import { PackageDepartures, PackageFacts, PackageInclusions, PackageItinerary } from '@/features/packages';
import { AmenityList, PropertyCard, PropertyPolicies, RoomTypes, StayAvailability, StayFacts } from '@/features/properties';
import { ReviewsSection } from '@/features/reviews';
import { SupplyFilters, SupplyListing, SupplyResults } from '@/features/supply';
import { createQueryClient } from '@/providers/QueryProvider';
import { expectNoAxeViolations } from '../axe';
import { departureAvailability, experience, guide, guideDetail, guideSlots, ids, packageDetail, property, propertyDetail, reviews, sessionAvailability, stayAvailability } from './fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/' }));

const TODAY = '2026-10-18';
const withQuery = (ui) => render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);

/** Stubs the browser fetch (the BFF) with one JSON answer per call, recording each requested path. */
function bff(...answers) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path) => {
      calls.push(String(path));
      const answer = answers[Math.min(calls.length, answers.length) - 1];
      return typeof answer === 'function' ? answer() : Response.json({ success: true, data: answer });
    }),
  );
  return calls;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('shared list pieces (5b.1)', () => {
  it('filters: GET form with the search box, the given selects and kept URL-only filters', async () => {
    const { container } = render(
      <SupplyFilters label="Filter stays" action="/stays" values={{ q: 'lodge', sort: '-name', destination: 'sample-falls', propertyType: 'camp' }} selects={[{ name: 'propertyType', label: 'Type of stay', placeholder: 'All types', options: [{ value: 'camp', label: 'Camp' }] }]} />,
    );
    const form = screen.getByRole('search', { name: 'Filter stays' });
    expect(form).toHaveAttribute('method', 'get');
    expect(screen.getByRole('combobox', { name: 'Type of stay' })).toHaveValue('camp');
    expect([...new FormData(form).entries()]).toEqual([['q', 'lodge'], ['propertyType', 'camp'], ['sort', '-name'], ['destination', 'sample-falls']]);
    await expectNoAxeViolations(container);
  });

  it('results: cards, or an empty state that says whether filters hide results', () => {
    const { rerender } = render(<SupplyResults items={[property()]} renderItem={(item) => <PropertyCard property={item} />} label="Stay results" noun="stays" filtered={false} clearHref="/stays" />);
    expect(within(screen.getByRole('list', { name: 'Stay results' })).getByRole('link', { name: 'Sample Lodge' })).toHaveAttribute('href', '/stays/sample-lodge');
    rerender(<SupplyResults items={[]} renderItem={() => null} label="Stay results" noun="stays" filtered clearHref="/stays" />);
    expect(screen.getByRole('heading', { name: 'No stays match these filters' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/stays');
    rerender(<SupplyResults items={[]} renderItem={() => null} label="Stay results" noun="stays" filtered={false} clearHref="/stays" />);
    expect(screen.getByRole('heading', { name: 'No stays are listed yet' })).toBeInTheDocument();
  });

  it('listing layout: one h1, live count, chips and filter-preserving pagination', () => {
    render(
      <SupplyListing title="Local guides" description="d" pathname="/guides" params={{ language: 'hi' }} meta={{ page: 1, limit: 12, total: 13 }} noun={['guide', 'guides']} filters={null} sort={null} chips={[{ key: 'language', label: 'Speaks Hindi', removeHref: '/guides' }]}>
        <p>results</p>
      </SupplyListing>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Local guides' })).toBeInTheDocument();
    expect(screen.getByText('13 guides')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Remove filter: Speaks Hindi' })).toHaveAttribute('href', '/guides');
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('href', '/guides?language=hi&page=2');
  });

  it('reviews section: API summary, list and "showing x of y"', () => {
    render(<ReviewsSection title="Guest reviews" reviews={reviews.data} rating={reviews.meta.rating} total={reviews.meta.total} />);
    expect(screen.getByRole('heading', { name: 'Guest reviews' })).toBeInTheDocument();
    expect(screen.getByText('7 reviews')).toBeInTheDocument();
    expect(screen.getByText('Verified booking')).toBeInTheDocument();
    expect(screen.getByText('Showing the latest 1 of 7 reviews.')).toBeInTheDocument();
  });
});

describe('stays (5b.2)', () => {
  it('live availability runs on load through the BFF and shows rooms with the API total', async () => {
    const calls = bff(stayAvailability);
    const { container } = withQuery(<StayAvailability propertyId={ids.property} today={TODAY} />);
    const rooms = await screen.findByRole('list', { name: 'Rooms for your dates' });
    expect(calls[0]).toBe(`/api/v1/properties/${ids.property}/availability?checkIn=2026-10-19&checkOut=2026-10-20&adults=2&children=0&rooms=1`);
    const items = within(rooms).getAllByRole('listitem').filter((item) => item.parentElement === rooms);
    expect(within(items[0]).getByText('2 left for these dates')).toBeInTheDocument();
    expect(within(items[0]).getByText('₹4,500')).toBeInTheDocument();
    expect(within(items[0]).getByText(/total for 2 nights, 1 room/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Not available for these dates')).toBeInTheDocument();
    expect(within(items[2]).getByText('Too small for your group')).toBeInTheDocument();
    expect(within(items[2]).queryByText('₹2,400')).not.toBeInTheDocument(); // no price for an option that cannot be booked
    expect(screen.getByRole('status')).toHaveTextContent('1 room type available');
    await expectNoAxeViolations(container);
  });

  it('invalid dates are explained and never sent; a valid change sends the new search', async () => {
    const calls = bff(stayAvailability, stayAvailability);
    withQuery(<StayAvailability propertyId={ids.property} today={TODAY} />);
    await screen.findByRole('list', { name: 'Rooms for your dates' });
    const checkOut = screen.getByLabelText('Check-out');
    await userEvent.clear(checkOut);
    await userEvent.type(checkOut, '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Check availability' }));
    expect(screen.getByText('Check up to 30 nights at a time.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    await userEvent.clear(checkOut);
    await userEvent.type(checkOut, '2026-10-22');
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Adults' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Adults' }), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Check availability' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toContain('checkIn=2026-10-19&checkOut=2026-10-22&adults=3');
  });

  it('rate limiting is explained with the backend’s Retry-After', async () => {
    bff(() => Response.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: 'r1' } }, { status: 429, headers: { 'retry-after': '30' } }));
    withQuery(<StayAvailability propertyId={ids.property} today={TODAY} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again in 30 seconds.');
  });

  it('rooms, amenities, policies and facts show only what the API lists', () => {
    render(
      <>
        <RoomTypes rooms={propertyDetail.rooms} />
        <AmenityList amenities={propertyDetail.amenities} />
        <PropertyPolicies policies={propertyDetail.policies} />
        <StayFacts property={propertyDetail} />
      </>,
    );
    const roomList = screen.getByRole('list', { name: 'Room types' });
    expect(within(roomList).getByRole('heading', { name: 'Standard room' })).toBeInTheDocument();
    expect(within(roomList).queryByText('Closed wing')).not.toBeInTheDocument();
    expect(within(roomList).getByText('Up to 2 adults and 1 child')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(expect.arrayContaining(['General', 'Accessibility', 'Connectivity']));
    expect(screen.queryByRole('heading', { name: 'Bathroom' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/before check-in|Up to check-in/).map((item) => item.textContent)).toEqual(['3 days or more before check-in: 100% refund', '1 day or more before check-in: 50% refund', 'Up to check-in: no refund']);
    expect(screen.queryByRole('heading', { name: 'House rules' })).not.toBeInTheDocument();
    expect(screen.getByText('From 14:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+91 98765 43210' })).toHaveAttribute('href', 'tel:+919876543210');
    expect(screen.getByRole('link', { name: 'Sample District' })).toHaveAttribute('href', '/districts/sample-district');
  });
});

describe('guides (5b.3)', () => {
  it('open dates: default 14-day window via the BFF, grouped by day, blocked windows labelled', async () => {
    const calls = bff(guideSlots);
    const { container } = withQuery(<GuideAvailability guideId={ids.guide} today={TODAY} />);
    const days = await screen.findByRole('list', { name: 'Available dates' });
    expect(calls[0]).toBe(`/api/v1/guides/${ids.guide}/availability?from=2026-10-18&to=2026-10-31`);
    expect(within(days).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['20 Oct 2026', '23 Oct 2026']);
    expect(within(days).getByText('14:00 – 17:00').parentElement).toHaveTextContent('Unavailable');
    expect(screen.getByRole('status')).toHaveTextContent('2 open time windows');
    await expectNoAxeViolations(container);
  });

  it('a window longer than 92 days is refused before any request; no slots is an honest empty state', async () => {
    const calls = bff({ ...guideSlots, slots: [] });
    withQuery(<GuideAvailability guideId={ids.guide} today={TODAY} />);
    expect(await screen.findByText('The guide has not published any time for these dates. Try later dates.')).toBeInTheDocument();
    const to = screen.getByLabelText('To');
    await userEvent.clear(to);
    await userEvent.type(to, '2027-03-01');
    await userEvent.click(screen.getByRole('button', { name: 'Show availability' }));
    expect(screen.getByText('Check up to 92 days at a time.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('services: active only, priced per group; facts and card from the profile', () => {
    render(
      <>
        <GuideServices services={guideDetail.services} />
        <GuideFacts guide={guideDetail} />
        <GuideCard guide={guide({ yearsExperience: 1 })} />
      </>,
    );
    const services = screen.getByRole('list', { name: 'Guide services' });
    expect(within(services).getAllByRole('listitem')).toHaveLength(1);
    expect(within(services).getByText('2 h 30 min · groups of up to 6 people')).toBeInTheDocument();
    expect(within(services).getByText('per group')).toBeInTheDocument();
    expect(screen.getByText('Hindi, English')).toBeInTheDocument();
    expect(screen.getByText('1 year guiding')).toBeInTheDocument();
    render(<GuideServices services={[]} />);
    expect(screen.getByText('This guide has no services open for booking at the moment.')).toBeInTheDocument();
  });
});

describe('experiences (5b.4)', () => {
  it('sessions: party size and Jharkhand-midnight window go to the BFF; seats come from the API', async () => {
    const calls = bff(sessionAvailability);
    const { container } = withQuery(<ExperienceSessions experienceId={ids.experience} today={TODAY} minParticipants={2} maxParticipants={8} />);
    const list = await screen.findByRole('list', { name: 'Upcoming sessions' });
    expect(calls[0]).toBe(`/api/v1/experiences/${ids.experience}/availability?participants=2&from=2026-10-17T18%3A30%3A00.000Z&to=2026-11-16T18%3A30%3A00.000Z`);
    expect(within(list).getAllByRole('listitem').map((item) => within(item).getByText(/left|Full/).textContent)).toEqual(['5 seats left', 'Only 1 seat left', 'Full']);
    expect(within(list).getAllByText('per person')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('2 people · 1 session with space');
    await expectNoAxeViolations(container);
  });

  it('a party outside the limits is refused locally; the backend’s group-limit flag is shown', async () => {
    const calls = bff({ ...sessionAvailability, withinGroupLimits: false });
    withQuery(<ExperienceSessions experienceId={ids.experience} today={TODAY} minParticipants={2} maxParticipants={8} />);
    expect(await screen.findByText('This experience takes groups of 2 to 8.')).toBeInTheDocument();
    const people = screen.getByRole('spinbutton', { name: 'People' });
    await userEvent.clear(people);
    await userEvent.type(people, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Check sessions' }));
    expect(screen.getByText('This experience takes at most 8.')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('facts', () => {
    render(<ExperienceFacts experience={experience()} />);
    expect(screen.getByText('2–8 people')).toBeInTheDocument();
    expect(screen.getByText('On request')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sample Falls' })).toHaveAttribute('href', '/destinations/sample-falls');
  });
});

describe('packages (5b.5)', () => {
  it('departures for a number of travellers via the BFF; closed departures are labelled', async () => {
    const calls = bff(departureAvailability, { ...departureAvailability, travelers: 4 });
    const { container } = withQuery(<PackageDepartures packageId={ids.pkg} minTravelers={2} maxTravelers={12} />);
    const list = await screen.findByRole('list', { name: 'Upcoming departures' });
    expect(calls[0]).toBe(`/api/v1/packages/${ids.pkg}/availability?travelers=2`);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('28 Oct 2026 – 29 Oct 2026');
    expect(within(list).getByText('12 seats left')).toBeInTheDocument();
    expect(within(list).getByText('Closed for booking')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    const travellers = screen.getByRole('spinbutton', { name: 'Travellers' });
    await userEvent.clear(travellers);
    await userEvent.type(travellers, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Check departures' }));
    await waitFor(() => expect(calls[1]).toBe(`/api/v1/packages/${ids.pkg}/availability?travelers=4`));
  });

  it('itinerary in day order with destination links; inclusions and facts as listed', () => {
    render(
      <>
        <PackageItinerary itinerary={packageDetail.itinerary} />
        <PackageInclusions inclusions={packageDetail.inclusions} exclusions={packageDetail.exclusions} />
        <PackageFacts pkg={packageDetail} />
      </>,
    );
    const days = screen.getByRole('list', { name: 'Itinerary by day' });
    expect(within(days).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Day 1 · Falls day', 'Day 2 · Return']);
    expect(within(days).getByRole('link', { name: 'Sample Falls' })).toHaveAttribute('href', '/destinations/sample-falls');
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText('Entry fees')).toBeInTheDocument();
    expect(screen.getByText('2 days · 1 night')).toBeInTheDocument();
    expect(screen.getByText('2–12 travellers')).toBeInTheDocument();
  });
});

describe('destination → catalogue links (5b.7)', () => {
  const destination = { slug: 'sample-falls', district: { slug: 'sample-district', name: 'Sample District' } };

  it('guides and experiences link to the same destination filter with its count; stays link to the district', () => {
    const { rerender } = render(<DestinationSupply kind="guides" sectionId="guides" items={[guide()]} total={5} destination={destination} />);
    expect(screen.getByRole('link', { name: 'See all 5 guides' })).toHaveAttribute('href', '/guides?destination=sample-falls');
    rerender(<DestinationSupply kind="properties" sectionId="stays" items={[property()]} total={9} destination={destination} />);
    expect(screen.getByRole('link', { name: 'Browse stays in Sample District' })).toHaveAttribute('href', '/stays?district=sample-district');
    rerender(<DestinationSupply kind="experiences" sectionId="experiences" items={[experience()]} total={1} destination={destination} />);
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument();
  });
});
