// GET /api/contribute/return?token=<PayPal order id>  PayPal returns the contributor here.
// Safe to refresh: capture is idempotent and an already-recorded order just redirects.
import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/app-url';
import { isValidPayPalId } from '@/lib/checkout';
import { completeContribution } from '@/lib/contribution';
import { getStudent } from '@/lib/student';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const token = new URL(req.url).searchParams.get('token');
  const student = await getStudent();
  if (!student) return NextResponse.redirect(new URL('/goals?checkout=no_user', origin), 303);

  const result = await completeContribution(student.id, token);
  if (result.kind === 'completed') {
    return NextResponse.redirect(new URL(`/goals/${result.goalId}?contribution=${result.orderRowId}`, origin), 303);
  }
  const params = new URLSearchParams({ checkout: result.code });
  if (isValidPayPalId(token)) params.set('order', token);
  const path = result.goalId ? `/goals/${result.goalId}` : '/goals';
  return NextResponse.redirect(new URL(`${path}?${params}`, origin), 303);
}
