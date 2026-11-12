import { GeoUnavailable, nearbyStations } from '@/lib/geo';
import { getStudent } from '@/lib/student';
import { validLatLng } from '@/lib/travel';

// Transit stations near a destination (OpenStreetMap Overpass). Empty or 503 when unavailable.
export async function GET(req: Request) {
  if (!(await getStudent())) return Response.json({ error: 'Please finish setting up your profile first.' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!validLatLng(lat, lng)) return Response.json({ error: 'Invalid location.' }, { status: 400 });
  try {
    return Response.json({ stations: await nearbyStations({ lat, lng }) });
  } catch (err) {
    if (!(err instanceof GeoUnavailable)) console.error('[travel] station lookup failed');
    return Response.json({ error: 'Station data is unavailable right now.' }, { status: 503 });
  }
}
