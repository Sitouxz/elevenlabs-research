// Location lookup via Nominatim (OpenStreetMap's free, keyless geocoder) and
// straight-line distance via the haversine formula. Map rendering (src/components/
// MapPopup.tsx) uses the Leaflet library with OSM raster tiles — no API key,
// same "no VITE_ env var needed" pattern as weather.ts.

export interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
}

async function geocode(query: string): Promise<GeoResult> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) {
    throw new Error(`Geocoding API returned ${res.status}`);
  }
  const results = await res.json();
  if (!results.length) {
    throw new Error(`I couldn't find a location matching "${query}".`);
  }
  const { lat, lon, display_name } = results[0];
  return { lat: parseFloat(lat), lon: parseFloat(lon), displayName: display_name };
}

function haversineKm(a: GeoResult, b: GeoResult): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface MapLocationResult {
  kind: "location";
  location: GeoResult;
}

export interface MapDistanceResult {
  kind: "distance";
  origin: GeoResult;
  destination: GeoResult;
  distanceKm: number;
}

export type MapResult = MapLocationResult | MapDistanceResult;

export async function findLocation(query: string): Promise<MapLocationResult> {
  const location = await geocode(query);
  return { kind: "location", location };
}

export async function findDistance(
  originQuery: string,
  destinationQuery: string,
): Promise<MapDistanceResult> {
  const [origin, destination] = await Promise.all([
    geocode(originQuery),
    geocode(destinationQuery),
  ]);
  return { kind: "distance", origin, destination, distanceKm: haversineKm(origin, destination) };
}
