// Server-only: the rows behind the student's AG Studio finance dashboard.
// Only completed, PayPal-verified orders are included (orders rows are written only after a
// COMPLETED capture), and only for the current demo student.
import { query } from './db';

export type TxRow = {
  id: string; date: string; type: string; item: string; category: string; amount: number;
  purchaseAmount: number; contributionAmount: number; paypalOrderId: string; status: string; environment: string;
};
export type GoalRow = { id: string; title: string; kind: string; raised: number; target: number; remaining: number; label: string; status: string; linkedTo: string };
export type ReceivedRow = { id: string; date: string; goal: string; linkedTo: string; amount: number; environment: string };
export type FinanceData = { transactions: TxRow[]; goals: GoalRow[]; received: ReceivedRow[]; asOf: string };

const dollars = (cents: number) => Math.round(cents) / 100;
const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

// Tags only: a scalar subquery returns at most one event per goal, so no row is ever duplicated.
const EVENT_OF_GOAL = (goalCol: string) =>
  `(SELECT e.title FROM events e WHERE e.goal_id = ${goalCol} AND e.deleted_at IS NULL ORDER BY e.created_at LIMIT 1)`;
const linkLabel = (event: string | null, kind: string | null) => (event ? `Event: ${event}` : kind === 'travel' ? 'Travel' : '');
const contributionCategory = (event: string | null, kind: string | null) => (event ? 'Club events' : kind === 'travel' ? 'Travel' : 'Funding goals');

export async function getFinanceData(studentId: string): Promise<FinanceData> {
  const [tx, goals, received] = await Promise.all([
    query<{ id: string; created_at: Date; kind: string; item: string | null; category: string | null; amount_cents: number; paypal_order_id: string; status: string; goal_kind: string | null; event: string | null }>(
      `SELECT o.id, o.created_at, o.kind, COALESCE(l.title, g.title) AS item, l.category, o.amount_cents, o.paypal_order_id, o.status,
              g.kind AS goal_kind, ${EVENT_OF_GOAL('o.goal_id')} AS event
       FROM orders o LEFT JOIN listings l ON l.id = o.listing_id LEFT JOIN goals g ON g.id = o.goal_id
       WHERE o.buyer_id = $1 AND o.status = 'COMPLETED' AND o.kind IN ('purchase', 'contribution')
       ORDER BY o.created_at DESC LIMIT 500`,
      [studentId],
    ),
    query<{ id: string; title: string; kind: string; saved_cents: number; target_cents: number; is_sample: boolean; event: string | null }>(
      `SELECT id, title, kind, saved_cents, target_cents, is_sample, ${EVENT_OF_GOAL('goals.id')} AS event FROM goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [studentId],
    ),
    // Completed contributions toward this student's goals, from anyone (contributor identity is not exposed).
    query<{ id: string; created_at: Date; goal: string; amount_cents: number; goal_kind: string; event: string | null }>(
      `SELECT o.id, o.created_at, g.title AS goal, o.amount_cents, g.kind AS goal_kind, ${EVENT_OF_GOAL('g.id')} AS event
       FROM orders o JOIN goals g ON g.id = o.goal_id
       WHERE g.user_id = $1 AND o.kind = 'contribution' AND o.status = 'COMPLETED'
       ORDER BY o.created_at DESC LIMIT 500`,
      [studentId],
    ),
  ]);

  return {
    asOf: new Date().toISOString(),
    transactions: tx.map((t) => {
      const amount = dollars(t.amount_cents);
      const purchase = t.kind === 'purchase';
      return {
        id: t.id,
        date: day(t.created_at),
        type: purchase ? 'Marketplace purchase' : 'Goal contribution',
        item: t.item ?? (purchase ? 'Listing' : 'Funding goal'),
        category: purchase ? t.category ?? 'Other' : contributionCategory(t.event, t.goal_kind),
        amount,
        purchaseAmount: purchase ? amount : 0,
        contributionAmount: purchase ? 0 : amount,
        paypalOrderId: t.paypal_order_id,
        status: t.status,
        environment: 'PayPal Sandbox',
      };
    }),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      raised: dollars(g.saved_cents),
      target: dollars(g.target_cents),
      remaining: dollars(Math.max(0, g.target_cents - g.saved_cents)),
      label: g.is_sample ? 'Fictional sample' : 'Your goal',
      status: g.saved_cents >= g.target_cents ? 'Funded' : 'In progress',
      linkedTo: linkLabel(g.event, g.kind),
    })),
    received: received.map((r) => ({ id: r.id, date: day(r.created_at), goal: r.goal, linkedTo: linkLabel(r.event, r.goal_kind), amount: dollars(r.amount_cents), environment: 'PayPal Sandbox' })),
  };
}
