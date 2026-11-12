// POST /api/checkout  (form field: listingId only). Creates a PayPal order and redirects to PayPal.
import { NextResponse } from 'next/server';
import { appOrigin, isSameOrigin } from '@/lib/app-url';
import { isValidId, startCheckout } from '@/lib/checkout';
import { getStudent } from '@/lib/student';

export async function POST(req: Request) {
  const origin = appOrigin(req);
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const listingId = form?.get('listingId'); // any price/amount fields are deliberately ignored
  const back = (code: string) =>
    NextResponse.redirect(
      new URL(isValidId(listingId) ? `/marketplace/${listingId}?checkout=${code}` : `/marketplace?checkout=${code}`, origin),
      303,
    );

  const student = await getStudent();
  if (!student) return back('no_user');
  try {
    const result = await startCheckout(student.id, listingId, origin);
    return result.ok ? NextResponse.redirect(result.approveUrl, 303) : back(result.code);
  } catch {
    console.error('[checkout] start failed');
    return back('error');
  }
}
