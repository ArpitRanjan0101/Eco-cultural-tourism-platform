'use client';

import dynamic from 'next/dynamic';
import Skeleton from '@/components/ui/Skeleton';
import { cx } from '@/lib/cx';

// Leaflet (and its CSS) is loaded only when a map is actually rendered in the browser.
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <Skeleton shape="rect" className="h-full rounded-lg" />,
});

/**
 * Map of places (output of toMapPlaces). Progressive enhancement: every map sits next to an equivalent list,
 * so the page works without it. Renders nothing when no place has coordinates.
 * @param {{ places: Array<{ id: string, name: string, latitude: number, longitude: number, href: string,
 *   subtitle?: string|null }>, label: string, highlightId?: string, height?: 'sm'|'md'|'lg', className?: string }} props
 */
export default function MapView({ places, label, highlightId, height = 'md', className }) {
  if (!places?.length) return null;
  const heights = { sm: 'h-56', md: 'h-80 md:h-96', lg: 'h-[28rem] md:h-[34rem]' };
  return (
    <div className={cx('relative isolate overflow-hidden rounded-lg border border-border', heights[height] ?? heights.md, className)}>
      <LeafletMap places={places} highlightId={highlightId} label={label} className="h-full w-full" />
    </div>
  );
}
