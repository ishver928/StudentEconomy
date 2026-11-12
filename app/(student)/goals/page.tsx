import type { Metadata } from 'next';
import Link from 'next/link';
import { query } from '@/lib/db';
import { DbError, PageHeader } from '../ui';
import { CheckoutMessage, FictionalBadge } from '../marketplace/shared';
import { GoalProgress, KIND_LABELS } from './progress';

export const metadata: Metadata = { title: 'Funding Goals' };

type Goal = {
  id: string; title: string; description: string | null; kind: string; target_cents: number; saved_cents: number;
  deadline: Date | null; is_sample: boolean;
};

export default async function GoalsPage({ searchParams }: PageProps<'/goals'>) {
  const sp = await searchParams;
  let goals: Goal[];
  try {
    goals = await query<Goal>(
      `SELECT id, title, description, kind, target_cents, saved_cents, deadline, is_sample
       FROM goals ORDER BY (saved_cents < target_cents) DESC, created_at DESC, id LIMIT 100`,
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🎯" title="Funding Goals" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🎯" title="Funding Goals">Chip in to help students reach trips, projects, and club goals. Contributions use PayPal sandbox (no real money).</PageHeader>
      <CheckoutMessage code={typeof sp.checkout === 'string' ? sp.checkout : undefined} />
      <Link href="/goals/new" className="se-button mb-6 inline-block text-base">+ Start a funding goal</Link>
      {goals.length === 0 && <p className="se-card p-6 font-semibold">No goals yet. Be the first!</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((g) => (
          <li key={g.id}>
            <Link href={`/goals/${g.id}`} className="se-card flex h-full flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{KIND_LABELS[g.kind] ?? g.kind}</span>
                {g.is_sample && <FictionalBadge label="Fictional sample goal" />}
              </div>
              <h2 className="text-lg font-extrabold">{g.title}</h2>
              {g.description && <p className="line-clamp-2 text-sm text-se-charcoal/75">{g.description}</p>}
              <div className="mt-auto"><GoalProgress saved={g.saved_cents} target={g.target_cents} /></div>
              {g.deadline && (
                <p className="text-xs text-se-charcoal/60">
                  ⏳ by {new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
