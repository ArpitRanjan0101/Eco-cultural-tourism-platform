// Marker + popup for one place, built with DOM APIs only (textContent, never HTML strings) so names coming from
// the API can never inject markup. Uses a CSS divIcon, so no image assets are needed.

/** Popup content element: place name as a link, optional subtitle. */
export function createPopupContent(place, doc = document) {
  const wrapper = doc.createElement('div');
  wrapper.className = 'jt-map-popup';
  const link = doc.createElement('a');
  link.href = place.href;
  link.textContent = place.name;
  wrapper.append(link);
  if (place.subtitle) {
    const subtitle = doc.createElement('p');
    subtitle.textContent = place.subtitle;
    wrapper.append(subtitle);
  }
  return wrapper;
}

/**
 * Leaflet marker for a place. Keyboard-focusable (Leaflet default) with the place name as its accessible title.
 * @param {typeof import('leaflet')} L
 * @param {{ id: string, name: string, latitude: number, longitude: number, href: string, subtitle?: string|null }} place
 * @param {{ highlighted?: boolean }} options
 */
export function createPlaceMarker(L, place, { highlighted = false } = {}) {
  const icon = L.divIcon({
    className: highlighted ? 'jt-map-marker jt-map-marker--highlight' : 'jt-map-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  });
  return L.marker([place.latitude, place.longitude], { icon, title: place.name, alt: place.name, keyboard: true, riseOnHover: true }).bindPopup(createPopupContent(place));
}
