import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { DbError, PageHeader, SampleBadge, SampleNotice, money } from '../ui';

export const metadata: Metadata = { title: 'Marketplace' };

type Listing = {
  id: string; title: string; description: string | null; category: string; condition: string | null;
  price_cents: number; school: string | null; is_sample: boolean;
};

export default async function MarketplacePage() {
  let listings: Listing[];
  try {
    listings = await query<Listing>(
      `SELECT id, title, description, category, condition, price_cents, school, is_sample
       FROM listings WHERE status = 'available' ORDER BY created_at DESC, id LIMIT 100`,
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🛍️" title="Marketplace" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🛍️" title="Marketplace">Buy and sell gear with students near you. Checkout arrives in a later phase.</PageHeader>
      {listings.some((l) => l.is_sample) && <SampleNotice />}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <li key={l.id} className="se-card flex flex-col gap-2 p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold">{l.title}</h2>
              <span className="shrink-0 rounded-full bg-se-sage px-3 py-1 font-extrabold">{money(l.price_cents)}</span>
            </div>
            <p className="text-sm text-se-charcoal/75">{l.description}</p>
            <div className="mt-auto flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{l.category}</span>
              {l.condition && <span className="rounded-full bg-se-peach/70 px-2.5 py-0.5">{l.condition}</span>}
              {l.is_sample && <SampleBadge />}
            </div>
            {l.school && <p className="text-xs text-se-charcoal/60">📍 {l.school}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
