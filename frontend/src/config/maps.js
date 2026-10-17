// Map tiles (WO4 resolved: Leaflet + OpenStreetMap). The OSM tile servers are a shared resource with a usage
// policy (https://operations.osmfoundation.org/policies/tiles/): attribution is mandatory and heavy production
// traffic needs a dedicated tile provider — change TILE_URL here (one place) when deploying at scale.
export const mapConfig = Object.freeze({
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
  // Fallback view when there is nothing to fit: the whole of Jharkhand.
  jharkhand: Object.freeze({ center: [23.6, 85.3], zoom: 7 }),
});
