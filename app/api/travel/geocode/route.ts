import { GeoUnavailable, geocode } from '@/lib/geo';
import { getStudent } from '@/lib/student';

// Place search for the Travel map (OpenStreetMap Nominatim, cached and rate-limited in lib/geo.ts).
export async function GET(req: Request) {
  if (!(await getStudent())) return Response.json({ error: 'Please finish setting up your profile first.' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 3 || q.length > 120) return Response.json({ error: 'Type at least 3 characters.' }, { status: 400 });
  try {
    return Response.json({ results: await geocode(q) });
  } catch (err) {
    if (!(err instanceof GeoUnavailable)) console.error('[travel] geocode failed');
    return Response.json({ error: 'Place search is unavailable right now. Try again in a moment.' }, { status: 503 });
  }
}
