import type { Metadata } from 'next';
import Link from 'next/link';
import { query } from '@/lib/db';
import { DbError, PageHeader, money } from '../ui';
import { AvailabilityBadge, CheckoutMessage, FictionalBadge, PICKUP_LABELS, pickupLabel } from './shared';

export const metadata: Metadata = { title: 'Marketplace' };

type Listing = {
  id: string; title: string; description: string | null; category: string; condition: string | null;
  price_cents: number; school: string | null; status: string; pickup_method: string | null; is_sample: boolean;
};

const SORTS: Record<string, string> = {
  newest: 'created_at DESC, id',
  price_asc: 'price_cents ASC, id',
  price_desc: 'price_cents DESC, id',
};

const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');

export default async function MarketplacePage({ searchParams }: PageProps<'/marketplace'>) {
  const sp = await searchParams;
  const f = { q: str(sp.q), category: str(sp.category), condition: str(sp.condition), pickup: str(sp.pickup), max: str(sp.max), sort: str(sp.sort) };
  const sort = SORTS[f.sort] ? f.sort : 'newest';

  // Every user value goes in as a bind parameter; only whitelisted SQL fragments are concatenated.
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: (p: string) => string, value: unknown) => {
    params.push(value);
    where.push(sql(`$${params.length}`));
  };
  if (f.q) add((p) => `(title ILIKE ${p} OR description ILIKE ${p})`, `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (f.category) add((p) => `category = ${p}`, f.category);
  if (f.condition) add((p) => `condition = ${p}`, f.condition);
  if (f.pickup) add((p) => `pickup_method = ${p}`, f.pickup);
  const maxDollars = Number(f.max);
  if (f.max && Number.isFinite(maxDollars) && maxDollars >= 0) add((p) => `price_cents <= ${p}`, Math.round(maxDollars * 100));

  let listings: Listing[];
  let facets: { category: string[] | null; condition: string[] | null };
  try {
    [listings, [facets]] = await Promise.all([
      query<Listing>(
        `SELECT id, title, description, category, condition, price_cents, school, status, pickup_method, is_sample
         FROM listings ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY (status = 'available') DESC, ${SORTS[sort]} LIMIT 100`,
        params,
      ),
      query<{ category: string[] | null; condition: string[] | null }>(
        `SELECT array_agg(DISTINCT category ORDER BY category) AS category,
                array_remove(array_agg(DISTINCT condition ORDER BY condition), NULL) AS condition FROM listings`,
      ),
    ]);
  } catch {
    return <div className="se-page"><PageHeader emoji="🛍️" title="Marketplace" /><DbError /></div>;
  }

  const select = (name: keyof typeof f, label: string, options: [string, string][]) => (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {label}
      <select name={name} defaultValue={f[name]} className="se-input py-2">
        {name !== 'sort' && <option value="">Any</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="se-page">
      <PageHeader emoji="🛍️" title="Marketplace">Buy and sell gear with students near you. Checkout uses PayPal sandbox (no real money).</PageHeader>
      <CheckoutMessage code={str(sp.checkout)} order={str(sp.order)} />

      <form method="get" className="se-card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7" role="search">
        <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">
          Search
          <input name="q" defaultValue={f.q} placeholder="e.g. calculator" className="se-input py-2" />
        </label>
        {select('category', 'Category', (facets.category ?? []).map((c) => [c, c]))}
        {select('condition', 'Condition', (facets.condition ?? []).map((c) => [c, c]))}
        {select('pickup', 'Pickup', Object.entries(PICKUP_LABELS))}
        <label className="flex flex-col gap-1 text-sm font-bold">
          Max price ($)
          <input name="max" type="number" min="0" step="1" defaultValue={f.max} className="se-input py-2" />
        </label>
        {select('sort', 'Sort', [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low']])}
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-7">
          <button className="se-button px-5 py-2 text-base">Apply</button>
          <Link href="/marketplace" className="font-bold underline">Clear</Link>
          <span className="ml-auto text-sm text-se-charcoal/70">{listings.length} result{listings.length === 1 ? '' : 's'}</span>
        </div>
      </form>

      {listings.length === 0 && <p className="se-card p-6 font-semibold">No listings match those filters.</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings.map((l) => (
          <li key={l.id}>
            <Link href={`/marketplace/${l.id}`} className="se-card flex h-full flex-col gap-2 p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-extrabold">{l.title}</h2>
                <span className="shrink-0 rounded-full bg-se-sage px-3 py-1 font-extrabold">{money(l.price_cents)}</span>
              </div>
              <p className="line-clamp-2 text-sm text-se-charcoal/75">{l.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 text-xs font-semibold">
                <AvailabilityBadge status={l.status} />
                <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{l.category}</span>
                {l.condition && <span className="rounded-full bg-se-peach/70 px-2.5 py-0.5">{l.condition}</span>}
                <span className="rounded-full bg-se-cream px-2.5 py-0.5 ring-1 ring-se-charcoal/10">{pickupLabel(l.pickup_method)}</span>
                {l.is_sample && <FictionalBadge />}
              </div>
              {l.school && <p className="text-xs text-se-charcoal/60">📍 {l.school}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
