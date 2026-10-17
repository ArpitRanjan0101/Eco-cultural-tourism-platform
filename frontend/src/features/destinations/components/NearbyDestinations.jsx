import NearbyMapPanel from '@/components/maps/NearbyMapPanel';
import { toMapPlaces } from '@/components/maps/places';
import DestinationGrid from './DestinationGrid';

/**
 * Published destinations near this one (PostGIS distance from the API), list + map. The current destination is
 * highlighted on the map when it has coordinates. Nothing when there are no neighbours.
 * @param {{ destination: object, nearby: Array<object>, radiusKm: number }} props
 */
export default function NearbyDestinations({ destination, nearby, radiusKm }) {
  if (!nearby.length) return null;
  const href = (item) => `/destinations/${item.slug}`;
  const subtitle = (item) => (Number.isFinite(item.distanceKm) ? `${item.distanceKm.toFixed(1)} km away` : null);
  const places = toMapPlaces([destination, ...nearby], { href, subtitle: (item) => (item.id === destination.id ? 'You are viewing this place' : subtitle(item)) });
  return (
    <NearbyMapPanel
      sectionId="nearby"
      title="Nearby places"
      description={`Published destinations within ${radiusKm} km, nearest first.`}
      places={places}
      highlightId={destination.id}
      list={<DestinationGrid destinations={nearby} columns={2} label="Nearby destinations" showDistance />}
    />
  );
}
