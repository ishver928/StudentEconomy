// GET /api/contribute/cancel?token=<PayPal order id>  PayPal sends the contributor here if they cancel.
import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/app-url';
import { cancelContribution } from '@/lib/contribution';
import { getStudent } from '@/lib/student';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const student = await getStudent();
  let goalId: string | null = null;
  if (student) {
    goalId = await cancelContribution(student.id, new URL(req.url).searchParams.get('token')).catch(() => null);
  }
  return NextResponse.redirect(new URL(goalId ? `/goals/${goalId}?checkout=cancelled` : '/goals?checkout=cancelled', origin), 303);
}
