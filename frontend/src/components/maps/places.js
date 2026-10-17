// Map place adapter shared by every map (one abstraction, W40). Only API coordinates are used: items whose
// `location` is null are left off the map, never placed at an invented or default point.

const valid = (location) =>
  location &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude) &&
  Math.abs(location.latitude) <= 90 &&
  Math.abs(location.longitude) <= 180;

/**
 * @param {Array<object>} items API cards with `location: GeoPoint|null`
 * @param {{ href: (item) => string, name?: (item) => string, subtitle?: (item) => string|null }} accessors
 * @returns {Array<{ id: string, name: string, latitude: number, longitude: number, href: string, subtitle: string|null }>}
 */
export function toMapPlaces(items, { href, name = (item) => item.name, subtitle = () => null }) {
  return (items ?? [])
    .filter((item) => valid(item.location))
    .map((item) => ({ id: item.id, name: name(item), latitude: item.location.latitude, longitude: item.location.longitude, href: href(item), subtitle: subtitle(item) }));
}

/** OpenStreetMap link for a point (users can open directions in their own map app). */
export function osmLink({ latitude, longitude }, zoom = 14) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;
}
