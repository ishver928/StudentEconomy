// Travel planning helpers shared by server and client. Pure functions, no I/O.
// Every cost here is an ESTIMATE from the stated assumptions, never a live fare or quote.

export type LatLng = { lat: number; lng: number };
export type Place = LatLng & { label: string; area: string };
export type Route = { km: number; minutes: number; line: [number, number][]; source: 'osrm' | 'straight' };

export type OptionKind = 'walk' | 'bike' | 'transit' | 'carpool' | 'drive' | 'rideshare' | 'intercity';
export type TravelOption = {
  kind: OptionKind;
  label: string;
  emoji: string;
  minutes: number;
  costCents: number | null; // null = we don't know (no fare data); never guessed
  costNote: string;
  details: string[];
  transfers: string | null;
  link?: { href: string; label: string };
  demo?: boolean; // values come from the labeled demo scenario
  savingsCents?: number; // vs. the most expensive costed option
};

// Stated assumptions, shown in the UI next to the numbers they produce.
export const ASSUMPTIONS = {
  fuelPerMileCents: 20, // ~$5/gal at ~25 mpg
  rideshareBaseCents: 300,
  ridesharePerMileCents: 175,
  ridesharePerMinuteCents: 35,
  roadFactor: 1.3, // straight-line -> rough road distance when no routing service is configured
  carpoolRiders: 4,
};

export const DEPART_WINDOWS = ['morning', 'afternoon', 'evening', 'flexible'] as const;
export const TRAVEL_MODES = ['carpool', 'transit', 'either'] as const;

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: LatLng, b: LatLng) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rounds to a ~2 km grid so a stored starting point can't pinpoint a home address. */
export const approx = (x: number) => Math.round(x * 50) / 50;

export const validLatLng = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export function straightRoute(a: LatLng, b: LatLng): Route {
  const km = haversineKm(a, b) * ASSUMPTIONS.roadFactor;
  return { km, minutes: (km / 45) * 60 + 5, line: [[a.lat, a.lng], [b.lat, b.lng]], source: 'straight' };
}

const mapsLink = (a: LatLng, b: LatLng, mode: 'transit' | 'driving' | 'walking' | 'bicycling') =>
  `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;

export type DemoTransit = { costCents: number; transfers: string; details: string[]; driveExtrasCents?: number; driveExtrasNote?: string };

export function estimateOptions(from: LatLng, to: LatLng, route: Route, riders = ASSUMPTIONS.carpoolRiders, demoTransit?: DemoTransit): TravelOption[] {
  const straight = haversineKm(from, to);
  const km = route.km;
  const miles = km * 0.621371;
  const driveMin = route.minutes;
  const roadNote = route.source === 'osrm' ? 'Road distance from routing service' : 'Road distance estimated from straight-line distance';
  const extras = demoTransit?.driveExtrasCents ?? 0; // demo only: sample tolls/parking, labeled
  const fuel = Math.round(miles * ASSUMPTIONS.fuelPerMileCents) + extras;
  const extrasNote = extras ? demoTransit?.driveExtrasNote ?? 'Includes sample tolls and parking (demo data)' : 'Parking and tolls not included';
  const out: TravelOption[] = [];

  if (straight <= 5) {
    out.push({ kind: 'walk', label: 'Walk', emoji: '🚶', minutes: (km / 4.8) * 60, costCents: 0, costNote: 'Free', details: [`About ${km.toFixed(1)} km`], transfers: null, link: { href: mapsLink(from, to, 'walking'), label: 'Walking directions' } });
  }
  if (straight <= 20) {
    out.push({ kind: 'bike', label: 'Bike or scooter', emoji: '🚲', minutes: (km / 15) * 60, costCents: 0, costNote: 'Free on your own bike', details: [`About ${km.toFixed(1)} km`, 'Check for bike lanes and secure parking'], transfers: null, link: { href: mapsLink(from, to, 'bicycling'), label: 'Bike directions' } });
  }
  if (straight >= 1.5 && straight <= 150) {
    out.push({
      kind: 'transit', label: 'Public transit', emoji: '🚇', minutes: (km / 22) * 60 + 15,
      costCents: demoTransit ? demoTransit.costCents : null,
      costNote: demoTransit ? 'Sample fare (demo data, not a live fare)' : 'Fare depends on the agency. Check the trip planner.',
      details: demoTransit ? demoTransit.details : ['Rough time estimate including walking and waiting', 'Open the trip planner for real routes and schedules'],
      transfers: demoTransit ? demoTransit.transfers : 'See trip planner',
      link: { href: mapsLink(from, to, 'transit'), label: 'Open transit trip planner' },
      demo: !!demoTransit,
    });
  }
  if (straight > 80) {
    out.push({ kind: 'intercity', label: 'Intercity train or bus', emoji: '🚆', minutes: (km / 80) * 60 + 30, costCents: null, costNote: 'Varies by date. Compare Amtrak, Greyhound, and FlixBus.', details: ['Book early: fares usually rise closer to departure', 'Student discounts may apply (see Student Travel Deals)'], transfers: 'Varies', link: { href: 'https://www.amtrak.com', label: 'Amtrak' } });
  }
  out.push({
    kind: 'carpool', label: `Carpool (${riders} students)`, emoji: '🚗', minutes: driveMin + 10,
    costCents: Math.round(fuel / riders), costNote: extras ? `Fuel, sample toll and parking split ${riders} ways (demo data)` : `Fuel split ${riders} ways (estimate)`,
    details: [`${miles.toFixed(1)} mi · ${roadNote}`, extrasNote, 'Coordinate with matched students below'], transfers: null,
  });
  out.push({ kind: 'drive', label: 'Drive alone', emoji: '🚙', minutes: driveMin, costCents: fuel, costNote: extras ? 'Fuel plus sample toll and parking (demo data)' : 'Fuel only (estimate)', details: [`${miles.toFixed(1)} mi · ${roadNote}`, extrasNote], transfers: null, link: { href: mapsLink(from, to, 'driving'), label: 'Driving directions' } });
  if (straight <= 120) {
    out.push({
      kind: 'rideshare', label: 'Rideshare', emoji: '🚕', minutes: driveMin + 5,
      costCents: Math.round(ASSUMPTIONS.rideshareBaseCents + miles * ASSUMPTIONS.ridesharePerMileCents + driveMin * ASSUMPTIONS.ridesharePerMinuteCents),
      costNote: 'Rough estimate, not a quote. Surge pricing can be much higher.', details: [`${miles.toFixed(1)} mi`], transfers: null,
    });
  }
  const max = Math.max(0, ...out.map((o) => o.costCents ?? 0));
  return out.map((o) => ({ ...o, minutes: Math.max(1, Math.round(o.minutes)), savingsCents: o.costCents === null ? undefined : max - o.costCents }));
}

export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim());

// ---- Matching ---------------------------------------------------------------------------

export type MatchInput = {
  origin: LatLng; dest: LatLng; date: string; window: string; mode: string; eventId: string | null; school: string;
};

/** Score how well two trips line up, with human-readable reasons. 0 = not a match. */
export function scoreMatch(mine: MatchInput, theirs: MatchInput & { eventTitle?: string | null }) {
  const reasons: string[] = [];
  let score = 0;
  const destKm = haversineKm(mine.dest, theirs.dest);
  const sameEvent = !!mine.eventId && mine.eventId === theirs.eventId;
  if (sameEvent) { score += 4; reasons.push(`Attending the same event${theirs.eventTitle ? `: ${theirs.eventTitle}` : ''}`); }
  else if (destKm <= 2) { score += 3; reasons.push('Same destination'); }
  else if (destKm <= 15) { score += 1; reasons.push(`Similar destination (${destKm.toFixed(0)} km apart)`); }
  else return { score: 0, reasons };

  const days = Math.abs(Date.parse(mine.date) - Date.parse(theirs.date)) / 86_400_000;
  if (days > 3) return { score: 0, reasons };
  if (days === 0) { score += 2; reasons.push(mine.window === theirs.window && mine.window !== 'flexible' ? `Same day, same ${mine.window} departure` : 'Same travel day'); }
  else { score += 1; reasons.push(`Travel dates ${days} day${days === 1 ? '' : 's'} apart`); }

  const originKm = haversineKm(mine.origin, theirs.origin);
  if (originKm <= 10) { score += 2; reasons.push('Starting from a nearby area'); }
  else if (originKm <= 30) { score += 1; reasons.push('Starting from the same region'); }

  if (mine.mode === 'either' || theirs.mode === 'either' || mine.mode === theirs.mode) {
    const m = mine.mode === 'either' ? theirs.mode : mine.mode;
    if (m !== 'either') { score += 1; reasons.push(m === 'carpool' ? 'Both interested in carpooling' : 'Both prefer public transit'); }
  }
  if (mine.school && theirs.school && mine.school.toLowerCase() === theirs.school.toLowerCase()) { score += 1; reasons.push('Same college'); }
  return { score, reasons };
}
