// POST /api/contribute  (form fields: goalId, amount in dollars). Validated server-side, then
// a PayPal sandbox order is created and the contributor is redirected to PayPal to approve it.
import { NextResponse } from 'next/server';
import { appOrigin, isSameOrigin } from '@/lib/app-url';
import { isValidId } from '@/lib/checkout';
import { startContribution } from '@/lib/contribution';
import { getStudent } from '@/lib/student';

export async function POST(req: Request) {
  const origin = appOrigin(req);
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const goalId = form?.get('goalId');
  const back = (code: string) =>
    NextResponse.redirect(new URL(isValidId(goalId) ? `/goals/${goalId}?checkout=${code}` : `/goals?checkout=${code}`, origin), 303);

  const student = await getStudent();
  if (!student) return back('no_user');
  try {
    const result = await startContribution(student.id, goalId, form?.get('amount'), origin);
    return result.ok ? NextResponse.redirect(result.approveUrl, 303) : back(result.code);
  } catch {
    console.error('[contribute] start failed');
    return back('error');
  }
}
