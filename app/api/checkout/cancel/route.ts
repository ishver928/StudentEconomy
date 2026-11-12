// GET /api/checkout/cancel?token=<PayPal order id>  PayPal sends the buyer here if they cancel.
import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/app-url';
import { cancelCheckout } from '@/lib/checkout';
import { getStudent } from '@/lib/student';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const student = await getStudent();
  let listingId: string | null = null;
  if (student) {
    listingId = await cancelCheckout(student.id, new URL(req.url).searchParams.get('token')).catch(() => null);
  }
  return NextResponse.redirect(new URL(listingId ? `/marketplace/${listingId}?checkout=cancelled` : '/marketplace?checkout=cancelled', origin), 303);
}
