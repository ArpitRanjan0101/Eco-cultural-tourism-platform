import Section from '@/components/layout/Section';
import MapView from './MapView';

/**
 * Nearby places: the list (always) beside a map of the same places (when any have coordinates), stacked on
 * mobile. Used for "nearby" on detail pages and for location-based discovery.
 * @param {{ title: string, description?: string, list: React.ReactNode, places: Array<object>, highlightId?: string,
 *   sectionId: string }} props
 */
export default function NearbyMapPanel({ title, description, list, places, highlightId, sectionId }) {
  return (
    <Section id={sectionId} title={title} description={description} tone="muted">
      <div className={places.length ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}>
        <div>{list}</div>
        {places.length ? <MapView places={places} highlightId={highlightId} label={`Map: ${title}`} height="lg" /> : null}
      </div>
    </Section>
  );
}
