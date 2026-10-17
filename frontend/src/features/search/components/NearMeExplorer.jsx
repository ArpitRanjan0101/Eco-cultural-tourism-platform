'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import CardGrid from '@/components/data-display/CardGrid';
import Alert from '@/components/feedback/Alert';
import EmptyState from '@/components/feedback/EmptyState';
import MapView from '@/components/maps/MapView';
import { toMapPlaces } from '@/components/maps/places';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import { DestinationCard } from '@/features/destinations';
import { PropertyCard } from '@/features/properties';
import { searchService } from '../services/searchService';

const GEO_ERRORS = {
  1: 'Location permission was denied. Allow it in your browser to see places near you.',
  2: 'Your location could not be determined right now.',
  3: 'Finding your location took too long. Please try again.',
};
const TYPE_TEXT = { destination: 'Destinations', property: 'Stays' };
const RADII = [10, 25, 50, 100, 300];

/**
 * Location-based discovery (GET /search/nearby). Uses the device position only after the visitor asks, and only
 * real coordinates: if location is unavailable or refused, nothing is guessed.
 * @param {{ nearbyTypes: string[], radius: { defaultKm: number, maxKm: number } }} props
 */
export default function NearMeExplorer({ nearbyTypes, radius }) {
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(null);
  const [type, setType] = useState(nearbyTypes[0] ?? 'destination');
  const [radiusKm, setRadiusKm] = useState(radius.defaultKm);
  const radii = [...new Set([...RADII.filter((value) => value <= radius.maxKm), radius.defaultKm])].sort((a, b) => a - b);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('This browser cannot share a location.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setPosition({ lat: Number(coords.latitude.toFixed(5)), lng: Number(coords.longitude.toFixed(5)) });
      },
      (error) => {
        setLocating(false);
        setGeoError(GEO_ERRORS[error.code] ?? GEO_ERRORS[2]);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const results = useQuery({
    queryKey: ['search', 'nearby', position, type, radiusKm],
    queryFn: ({ signal }) => searchService.nearby({ ...position, radiusKm, type }, { signal }),
    enabled: Boolean(position),
  });

  const items = results.data?.data ?? [];
  const href = (item) => (item.type === 'property' ? `/stays/${item.slug}` : `/destinations/${item.slug}`);
  const places = toMapPlaces(items, { href, subtitle: (item) => (Number.isFinite(item.distanceKm) ? `${item.distanceKm.toFixed(1)} km away` : null) });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select label="Show" value={type} onChange={(event) => setType(event.target.value)} options={nearbyTypes.map((value) => ({ value, label: TYPE_TEXT[value] ?? value }))} />
        <Select label="Within" value={String(radiusKm)} onChange={(event) => setRadiusKm(Number(event.target.value))} options={radii.map((value) => ({ value: String(value), label: `${value} km` }))} />
        <Button onClick={locate} loading={locating}>
          {position ? 'Update my location' : 'Use my location'}
        </Button>
      </div>
      {geoError ? <Alert tone="warning">{geoError}</Alert> : null}
      {results.isError ? <Alert tone="danger">{`Nearby places could not be loaded. ${results.error?.requestId ? `Reference: ${results.error.requestId}` : ''}`}</Alert> : null}
      {position && results.isPending ? <Spinner label="Finding places near you" /> : null}
      {position && results.isSuccess && !items.length ? <EmptyState headingLevel={3} title="Nothing published nearby" description="Try a larger distance." /> : null}
      {items.length ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <CardGrid
            items={items}
            columns={2}
            getKey={(item) => `${item.type}-${item.id}`}
            label="Places near you"
            renderItem={(item) => (item.type === 'property' ? <PropertyCard property={item} /> : <DestinationCard destination={item} showDistance />)}
          />
          <MapView places={places} label="Map of places near you" height="lg" />
        </div>
      ) : null}
    </div>
  );
}
