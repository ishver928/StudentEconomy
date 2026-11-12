// Server-only map services, all free OpenStreetMap-based and all optional:
// - Geocoding: Nominatim (https://operations.osmfoundation.org/policies/nominatim/): max 1 request/second,
//   identifying User-Agent, results cached, search only on submit (no autocomplete).
// - Transit stations: Overpass API (OVERPASS_URL to override).
// - Routing: an OSRM server, used ONLY when OSRM_URL is configured; otherwise callers fall back to a
//   clearly labeled straight-line estimate.
// Search text is never logged.
import { approx, straightRoute, validLatLng, type LatLng, type Place, type Route } from './travel';

const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const UA = process.env.GEOCODER_USER_AGENT || 'student-travel-planner/1.0 (demo)';

type CacheEntry<T> = { at: number; value: T };
const caches = new Map<string, Map<string, CacheEntry<unknown>>>();
async function cached<T>(bucket: string, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  let c = caches.get(bucket);
  if (!c) caches.set(bucket, (c = new Map()));
  const hit = c.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (c.size > 500) c.delete(c.keys().next().value!);
  c.set(key, { at: Date.now(), value });
  return value;
}

// Nominatim allows one request per second per application: serialize calls.
let lastGeocode = Promise.resolve(0);
function throttle(): Promise<void> {
  const next = lastGeocode.then(async (t) => {
    const wait = Math.max(0, t + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return Date.now();
  });
  lastGeocode = next.catch(() => Date.now());
  return next.then(() => undefined);
}

type NominatimHit = { lat: string; lon: string; display_name: string; name?: string; address?: Record<string, string> };

function areaOf(a: Record<string, string> = {}) {
  const place = a.city || a.town || a.village || a.suburb || a.municipality || a.county || '';
  const region = a.state_code || a['ISO3166-2-lvl4']?.split('-')[1] || a.state || a.country || '';
  return [place, region].filter(Boolean).join(', ').slice(0, 60) || 'Approximate area';
}

export class GeoUnavailable extends Error {}

export async function geocode(q: string): Promise<Place[]> {
  const key = q.toLowerCase().replace(/\s+/g, ' ').trim();
  return cached('geocode', key, 24 * 3600_000, async () => {
    await throttle();
    const url = `${NOMINATIM}/search?${new URLSearchParams({ q: key, format: 'jsonv2', limit: '5', addressdetails: '1' })}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000), cache: 'no-store' }).catch(() => null);
    if (!res?.ok) throw new GeoUnavailable('geocoder unavailable');
    const hits = (await res.json()) as NominatimHit[];
    return hits
      .map((h) => ({ lat: Number(h.lat), lng: Number(h.lon), label: (h.display_name || '').split(',').slice(0, 3).join(',').trim().slice(0, 120), area: areaOf(h.address) }))
      .filter((p) => validLatLng(p.lat, p.lng));
  });
}

export type Station = LatLng & { name: string; kind: 'rail' | 'bus' | 'ferry' };

export async function nearbyStations(p: LatLng): Promise<Station[]> {
  const lat = approx(p.lat * 5) / 5; // ~400 m cache grid
  const lng = approx(p.lng * 5) / 5;
  return cached('stations', `${lat},${lng}`, 6 * 3600_000, async () => {
    const q = `[out:json][timeout:10];(
      node(around:1500,${p.lat},${p.lng})[railway~"^(station|halt|tram_stop)$"];
      node(around:1500,${p.lat},${p.lng})[amenity=ferry_terminal];
      node(around:500,${p.lat},${p.lng})[highway=bus_stop][name];
    );out 40;`;
    const res = await fetch(OVERPASS, {
      method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(12_000), cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) throw new GeoUnavailable('station data unavailable');
    const body = (await res.json()) as { elements?: { lat: number; lon: number; tags?: Record<string, string> }[] };
    const seen = new Set<string>();
    const out: Station[] = [];
    for (const e of body.elements ?? []) {
      const name = e.tags?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const kind = e.tags?.amenity === 'ferry_terminal' ? 'ferry' : e.tags?.highway === 'bus_stop' ? 'bus' : 'rail';
      out.push({ lat: e.lat, lng: e.lon, name: name.slice(0, 80), kind });
    }
    // Rail and ferry first, then a few bus stops.
    return [...out.filter((s) => s.kind !== 'bus'), ...out.filter((s) => s.kind === 'bus').slice(0, 8)].slice(0, 20);
  });
}

export const routingConfigured = () => !!process.env.OSRM_URL;

/** Driving route from OSRM when configured; otherwise a labeled straight-line estimate. */
export async function drivingRoute(a: LatLng, b: LatLng): Promise<Route> {
  const base = process.env.OSRM_URL;
  if (!base) return straightRoute(a, b);
  const key = [a.lat, a.lng, b.lat, b.lng].map((x) => x.toFixed(4)).join(',');
  try {
    return await cached('route', key, 6 * 3600_000, async () => {
      const url = `${base.replace(/\/$/, '')}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`;
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!res.ok) throw new Error('routing failed');
      const body = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const r = body.routes?.[0];
      if (!r) throw new Error('no route');
      return { km: r.distance / 1000, minutes: r.duration / 60, line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), source: 'osrm' as const };
    });
  } catch {
    return straightRoute(a, b);
  }
}
