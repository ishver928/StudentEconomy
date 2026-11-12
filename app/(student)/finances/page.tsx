import type { Metadata } from 'next';
import Link from 'next/link';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, SampleBadge, SampleNotice, money } from '../ui';

export const metadata: Metadata = { title: 'My Finances' };

type Expense = { id: string; category: string; description: string | null; amount_cents: number; spent_on: Date; is_sample: boolean };

type Purchase = {
  id: string; title: string | null; amount_cents: number; currency: string; created_at: Date;
  paypal_order_id: string; status: string; needs_review: boolean; kind: string; goal_id: string | null;
};

export default async function FinancesPage() {
  const student = await getStudent();
  let expenses: Expense[];
  let purchases: Purchase[];
  try {
    // Only completed purchases (orders) for the current student; pending checkouts never appear here.
    purchases = student
      ? await query<Purchase>(
          `SELECT o.id, COALESCE(l.title, g.title) AS title, o.amount_cents, o.currency, o.created_at, o.paypal_order_id,
                  o.status, o.needs_review, o.kind, o.goal_id
           FROM orders o LEFT JOIN listings l ON l.id = o.listing_id LEFT JOIN goals g ON g.id = o.goal_id
           WHERE o.buyer_id = $1 AND o.kind IN ('purchase', 'contribution') AND o.status = 'COMPLETED'
           ORDER BY o.created_at DESC LIMIT 200`,
          [student.id],
        )
      : [];
    const sql = `SELECT id, category, description, amount_cents, spent_on, is_sample
                 FROM expenses WHERE user_id = $1 ORDER BY spent_on DESC, id LIMIT 200`;
    expenses = student ? await query<Expense>(sql, [student.id]) : [];
    if (expenses.length === 0) {
      // No expenses of their own yet: show a sample student's budget, clearly labelled.
      expenses = await query<Expense>(
        `SELECT id, category, description, amount_cents, spent_on, is_sample
         FROM expenses WHERE is_sample ORDER BY spent_on DESC, id LIMIT 200`,
      );
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="🐷" title="My Finances" /><DbError /></div>;
  }

  const isSample = expenses.some((e) => e.is_sample);
  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + e.amount_cents }), {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="se-page">
      <PageHeader emoji="🐷" title="My Finances">A friendly look at where your money goes.</PageHeader>

      <section className="se-card mb-6 p-6" aria-labelledby="sandbox-tx">
        <h2 id="sandbox-tx" className="text-lg font-extrabold">Sandbox Transactions</h2>
        <p className="text-sm text-se-charcoal/70">🧪 PayPal Sandbox — No Real Money. Only completed purchases and goal contributions appear here.</p>
        <div className="mt-3 flex flex-wrap gap-6">
          <p><span className="block text-sm font-bold text-se-charcoal/60">Total purchases</span><span className="text-2xl font-extrabold">{purchases.filter((p) => p.kind === 'purchase').length}</span></p>
          <p><span className="block text-sm font-bold text-se-charcoal/60">Goal contributions</span><span className="text-2xl font-extrabold">{purchases.filter((p) => p.kind === 'contribution').length}</span></p>
          <p><span className="block text-sm font-bold text-se-charcoal/60">Total sandbox spending</span><span className="text-2xl font-extrabold">{money(purchases.reduce((s, p) => s + p.amount_cents, 0))}</span></p>
        </div>
        {purchases.length === 0 ? (
          <p className="mt-3 text-se-charcoal/70">No sandbox transactions yet. Try the Marketplace or chip in to a Funding Goal.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-se-charcoal/60">
                <tr><th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Item / goal</th><th className="pr-3">Amount</th><th className="pr-3">PayPal order ID</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y-2 divide-se-cream">
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">{new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="pr-3">{p.kind === 'contribution' ? '🎯 Contribution' : '🛍️ Purchase'}</td>
                    <td className="pr-3 font-semibold">
                      <Link href={p.kind === 'contribution' ? `/goals/${p.goal_id}?contribution=${p.id}` : `/marketplace/confirmation/${p.id}`} className="underline">{p.title ?? 'Item'}</Link>
                    </td>
                    <td className="pr-3 font-extrabold">{money(p.amount_cents)}</td>
                    <td className="pr-3 font-mono text-xs">{p.paypal_order_id}</td>
                    <td>{p.status}{p.needs_review && ' (review)'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isSample && <SampleNotice />}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="se-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">Spending by category {isSample && <SampleBadge />}</h2>
          <p className="mt-1 text-3xl font-extrabold">{money(total)}</p>
          <ul className="mt-4 grid gap-3">
            {byCategory.map(([category, cents]) => (
              <li key={category}>
                <div className="flex justify-between text-sm font-semibold"><span>{category}</span><span>{money(cents)}</span></div>
                <div className="mt-1 h-3 rounded-full bg-se-cream ring-1 ring-se-charcoal/10">
                  <div className="h-full rounded-full bg-se-peach" style={{ width: `${total ? (cents / total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="se-card p-6">
          <h2 className="text-lg font-extrabold">Recent expenses</h2>
          {expenses.length === 0 ? (
            <p className="mt-2 text-se-charcoal/70">No expenses yet.</p>
          ) : (
            <ul className="mt-3 divide-y-2 divide-se-cream">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-semibold">{e.description ?? e.category}</p>
                    <p className="text-xs text-se-charcoal/60">
                      {e.category} · {new Date(e.spent_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </p>
                  </div>
                  <span className="font-extrabold">{money(e.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
