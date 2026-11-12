import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, money } from '../../ui';
import { CheckoutMessage, FictionalBadge } from '../../marketplace/shared';
import { GoalProgress, KIND_LABELS } from '../progress';
import { ContributeForm } from './contribute-form';

export const metadata: Metadata = { title: 'Funding goal' };

type Goal = {
  id: string; user_id: string | null; title: string; description: string | null; kind: string;
  target_cents: number; saved_cents: number; deadline: Date | null; is_sample: boolean; contributions: number;
};
type Contribution = { amount_cents: number; paypal_order_id: string; paypal_capture_id: string; status: string; created_at: Date };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function GoalPage({ params, searchParams }: PageProps<'/goals/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isValidId(id)) notFound();
  const student = await getStudent();
  const contributionId = one(sp.contribution);

  let goal: Goal | undefined;
  let mine: Contribution | undefined;
  try {
    [goal] = await query<Goal>(
      `SELECT g.id, g.user_id, g.title, g.description, g.kind, g.target_cents, g.saved_cents, g.deadline, g.is_sample,
              (SELECT count(*)::int FROM orders o WHERE o.goal_id = g.id AND o.kind = 'contribution' AND o.status = 'COMPLETED') AS contributions
       FROM goals g WHERE g.id = $1`,
      [id],
    );
    // Contribution receipt: only shown to the student who made it.
    if (goal && student && contributionId && isValidId(contributionId)) {
      [mine] = await query<Contribution>(
        `SELECT amount_cents, paypal_order_id, paypal_capture_id, status, created_at FROM orders
         WHERE id = $1 AND buyer_id = $2 AND goal_id = $3 AND kind = 'contribution'`,
        [contributionId, student.id, id],
      );
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="🎯" title="Funding goal" /><DbError /></div>;
  }
  if (!goal) notFound();
  const funded = goal.saved_cents >= goal.target_cents;
  const isOwner = student?.id === goal.user_id;

  return (
    <div className="se-page max-w-3xl">
      <Link href="/goals" className="mb-4 inline-block font-bold underline">← All funding goals</Link>
      <CheckoutMessage code={one(sp.checkout)} order={one(sp.order)} retryPath="/api/contribute/return" />
      {sp.created === '1' && isOwner && (
        <p role="status" className="mb-6 rounded-2xl bg-se-sage/70 px-4 py-3 font-semibold">
          Your goal is live! Share this page with classmates so they can chip in.
        </p>
      )}
      {mine && (
        <div role="status" className="mb-6 rounded-2xl bg-se-sage/70 px-4 py-3">
          <p className="font-extrabold">🎉 Thank you! Your {money(mine.amount_cents)} contribution was captured by PayPal.</p>
          <p className="mt-1 text-sm">🧪 PayPal Sandbox — No Real Money · Order {mine.paypal_order_id} · Capture {mine.paypal_capture_id} · {mine.status}</p>
        </div>
      )}
      <article className="se-card grid gap-4 p-6">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{KIND_LABELS[goal.kind] ?? goal.kind}</span>
          {goal.is_sample && <FictionalBadge label="Fictional sample goal" />}
          {isOwner && <span className="rounded-full bg-se-peach px-2.5 py-0.5">Your goal</span>}
        </div>
        <h1 className="text-3xl font-extrabold">{goal.title}</h1>
        {goal.description && <p className="whitespace-pre-line text-se-charcoal/85">{goal.description}</p>}
        <GoalProgress saved={goal.saved_cents} target={goal.target_cents} />
        <p className="text-sm text-se-charcoal/70">
          {goal.contributions} sandbox contribution{goal.contributions === 1 ? '' : 's'} via PayPal
          {goal.deadline && ` · Deadline ${new Date(goal.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`}
        </p>
        <p className="rounded-2xl border-2 border-dashed border-se-lavender bg-white/60 px-4 py-2 text-sm font-semibold">
          🧪 PayPal Sandbox — No Real Money. Progress only updates after PayPal confirms the payment.
        </p>
        {funded ? (
          <p className="font-extrabold">This goal is fully funded. Thank you, everyone!</p>
        ) : (
          <ContributeForm goalId={goal.id} suggested={[5, 10, 25].filter((v) => v * 100 <= goal.target_cents - goal.saved_cents || v === 5)} />
        )}
      </article>
    </div>
  );
}
