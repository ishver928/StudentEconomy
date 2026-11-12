import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, money } from '../../../ui';

export const metadata: Metadata = { title: 'Purchase confirmed' };

type Purchase = {
  id: string; title: string | null; amount_cents: number; currency: string; created_at: Date;
  paypal_order_id: string; paypal_capture_id: string; status: string; needs_review: boolean;
};

export default async function ConfirmationPage({ params }: PageProps<'/marketplace/confirmation/[orderId]'>) {
  const { orderId } = await params;
  const student = await getStudent();
  if (!student || !isValidId(orderId)) notFound();

  let purchase: Purchase | undefined;
  try {
    // Ownership check: only the buyer's own purchase is returned (demo cookie identity, not real auth).
    [purchase] = await query<Purchase>(
      `SELECT o.id, l.title, o.amount_cents, o.currency, o.created_at, o.paypal_order_id, o.paypal_capture_id,
              o.status, o.needs_review
       FROM orders o LEFT JOIN listings l ON l.id = o.listing_id
       WHERE o.id = $1 AND o.buyer_id = $2 AND o.kind = 'purchase'`,
      [orderId, student.id],
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🎉" title="Purchase" /><DbError /></div>;
  }
  if (!purchase) notFound();

  const rows: [string, string][] = [
    ['Item', purchase.title ?? 'Listing'],
    ['Amount', `${money(purchase.amount_cents)} ${purchase.currency}`],
    ['Purchase date', new Date(purchase.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })],
    ['PayPal sandbox order ID', purchase.paypal_order_id],
    ['PayPal capture ID', purchase.paypal_capture_id],
    ['Payment status', purchase.status],
  ];

  return (
    <div className="se-page max-w-2xl">
      <PageHeader emoji="🎉" title="Purchase confirmed">Thanks! Your payment was captured by PayPal.</PageHeader>
      <p className="mb-4 rounded-2xl bg-se-peach/70 px-4 py-2 font-extrabold">🧪 PayPal Sandbox — No Real Money</p>
      {purchase.needs_review && (
        <p className="mb-4 rounded-2xl bg-se-lavender px-4 py-2 text-sm font-semibold">
          Your payment is recorded, but this order was flagged for review (for example, the item sold at the same time).
        </p>
      )}
      <dl className="se-card divide-y-2 divide-se-cream p-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3">
            <dt className="font-bold text-se-charcoal/70">{k}</dt>
            <dd className="break-all font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex gap-4 font-bold">
        <Link href="/finances" className="underline">View My Finances</Link>
        <Link href="/marketplace" className="underline">Back to marketplace</Link>
      </div>
    </div>
  );
}
