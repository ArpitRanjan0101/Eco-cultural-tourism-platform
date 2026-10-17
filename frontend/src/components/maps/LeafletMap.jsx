'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { mapConfig } from '@/config/maps';
import { createPlaceMarker } from './PlaceMarker';

/**
 * The only Leaflet instance wrapper (W40). Loaded lazily by MapView in the browser; never server-rendered.
 * Fits all places, or shows Jharkhand when there are none. Scroll-wheel zoom stays off until the map is focused
 * so page scrolling is never captured.
 */
export default function LeafletMap({ places, highlightId, label, className }) {
  const container = useRef(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const map = L.map(element, { scrollWheelZoom: false, keyboard: true });
    L.tileLayer(mapConfig.tileUrl, { attribution: mapConfig.attribution, maxZoom: mapConfig.maxZoom }).addTo(map);
    const markers = places.map((place) => createPlaceMarker(L, place, { highlighted: place.id === highlightId }).addTo(map));
    if (markers.length === 1) map.setView(markers[0].getLatLng(), 12);
    else if (markers.length > 1) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
    else map.setView(mapConfig.jharkhand.center, mapConfig.jharkhand.zoom);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    return () => map.remove();
  }, [places, highlightId]);

  return <div ref={container} role="region" aria-label={label} className={className} />;
}
