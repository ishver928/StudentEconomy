import { drivingRoute } from '@/lib/geo';
import { getStudent } from '@/lib/student';
import { validLatLng } from '@/lib/travel';

// Driving route between two points: OSRM when OSRM_URL is set, else a labeled straight-line estimate.
export async function GET(req: Request) {
  if (!(await getStudent())) return Response.json({ error: 'Please finish setting up your profile first.' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const [a, b] = ['from', 'to'].map((k) => (sp.get(k) ?? '').split(',').map(Number));
  if (a.length !== 2 || b.length !== 2 || !validLatLng(a[0], a[1]) || !validLatLng(b[0], b[1])) {
    return Response.json({ error: 'Invalid route.' }, { status: 400 });
  }
  return Response.json({ route: await drivingRoute({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) });
}
