import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { DbError, PageHeader, money } from '../../ui';
import { AvailabilityBadge, CheckoutMessage, FictionalBadge, pickupLabel } from '../shared';
import { BuyButton } from './buy-button';

export const metadata: Metadata = { title: 'Listing' };

type Listing = {
  id: string; title: string; description: string | null; category: string; condition: string | null;
  price_cents: number; school: string | null; status: string; pickup_method: string | null; is_sample: boolean;
};

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function ListingPage({ params, searchParams }: PageProps<'/marketplace/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isValidId(id)) notFound();

  let listing: Listing | undefined;
  try {
    [listing] = await query<Listing>(
      `SELECT id, title, description, category, condition, price_cents, school, status, pickup_method, is_sample
       FROM listings WHERE id = $1`,
      [id],
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🛍️" title="Listing" /><DbError /></div>;
  }
  if (!listing) notFound();

  const facts: [string, string][] = [
    ['Category', listing.category],
    ['Condition', listing.condition ?? '—'],
    ['Pickup', pickupLabel(listing.pickup_method)],
    ['Campus', listing.school ?? '—'],
  ];

  return (
    <div className="se-page max-w-3xl">
      <Link href="/marketplace" className="mb-4 inline-block font-bold underline">← Back to marketplace</Link>
      <CheckoutMessage code={one(sp.checkout)} order={one(sp.order)} />
      <article className="se-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-extrabold">{listing.title}</h1>
          <span className="rounded-full bg-se-sage px-4 py-1.5 text-xl font-extrabold">{money(listing.price_cents)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <AvailabilityBadge status={listing.status} />
          {listing.is_sample && <FictionalBadge />}
        </div>
        <p className="mt-4 whitespace-pre-line text-se-charcoal/85">{listing.description}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-se-cream p-3">
              <dt className="font-bold text-se-charcoal/60">{k}</dt>
              <dd className="font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 rounded-2xl border-2 border-dashed border-se-lavender bg-white/60 px-4 py-2 text-sm font-semibold">
          🧪 PayPal Sandbox — No Real Money. Pay with a PayPal sandbox test account; no real item changes hands.
        </p>
        <div className="mt-5">
          {listing.status === 'available' ? (
            <BuyButton listingId={listing.id} />
          ) : (
            <p className="font-extrabold">This item has been sold and can no longer be purchased.</p>
          )}
        </div>
      </article>
    </div>
  );
}
