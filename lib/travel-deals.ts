// Student travel deals. `verified` is true ONLY when the official page was checked and states the
// discount; `checkedOn` records when. Terms change, so the UI always says to confirm with the provider.

export type TravelDeal = {
  id: string;
  provider: string;
  title: string;
  detail: string;
  eligibility: string;
  region: 'bay-area' | 'us' | 'any';
  url: string;
  verified: boolean;
  checkedOn?: string;
};

export const TRAVEL_DEALS: TravelDeal[] = [
  {
    id: 'amtrak-student',
    provider: 'Amtrak',
    title: '15% off rail fares for students',
    detail: 'Off the regular adult rail fare in Coach and Acela Business. Book at least one day ahead. Limited availability at busy times; some routes are excluded (including Capitol Corridor).',
    eligibility: 'Students ages 17–24 with a valid student ID',
    region: 'us',
    url: 'https://www.amtrak.com/deals-discounts/everyday-discounts/student-discounts',
    verified: true,
    checkedOn: '2026-11-12',
  },
  {
    id: 'clipper-start',
    provider: 'Clipper START (Bay Area)',
    title: '50% off single-ride transit fares',
    detail: 'Half-price single rides on participating Bay Area buses, BART, rail and ferries.',
    eligibility: 'Bay Area residents ages 19–64 who meet the income requirement (apply online or by mail)',
    region: 'bay-area',
    url: 'https://www.clippercard.com/ClipperWeb/discounts',
    verified: true,
    checkedOn: '2026-11-12',
  },
  {
    id: 'bart-youth',
    provider: 'BART',
    title: '50% off with a Youth Clipper card',
    detail: 'BART lists no general discount for college students; this applies to riders 18 and under.',
    eligibility: 'Riders ages 5–18 with a Youth Clipper card',
    region: 'bay-area',
    url: 'https://www.bart.gov/tickets/discounts',
    verified: true,
    checkedOn: '2026-11-12',
  },
  {
    id: 'campus-pass',
    provider: 'Your college',
    title: 'Ask about a campus transit pass',
    detail: 'Many colleges include a transit pass in student fees or sell discounted passes. Check with your transportation or parking office.',
    eligibility: 'Depends on your school',
    region: 'any',
    url: '',
    verified: false,
  },
  {
    id: 'bus-deals',
    provider: 'Intercity buses',
    title: 'Check bus companies for current promotions',
    detail: "We couldn't confirm a standing student discount on Greyhound's site. Compare current promotions before booking.",
    eligibility: 'Varies',
    region: 'us',
    url: 'https://www.greyhound.com/en-us/deals-and-promos',
    verified: false,
  },
];

/** Bay Area deals only for trips that start or end in the Bay Area (rough bounding box). */
export function dealsFor(points: { lat: number; lng: number }[]) {
  const bay = points.some((p) => p.lat > 36.9 && p.lat < 38.6 && p.lng > -123.2 && p.lng < -121.5);
  return TRAVEL_DEALS.filter((d) => d.region !== 'bay-area' || bay);
}
