import type { Metadata } from 'next';
import Link from 'next/link';
import { query } from '@/lib/db';
import { CATEGORY_EMOJI, EVENT_CATEGORIES, formatEventDate } from '@/lib/events';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, SampleBadge, SampleNotice, money } from '../ui';

export const metadata: Metadata = { title: 'Club Events' };

type Event = {
  id: string; title: string; club_name: string; school: string | null; description: string | null;
  location: string | null; starts_at: Date; is_sample: boolean; category: string | null; is_mine: boolean;
  goal_title: string | null; target_cents: number | null; saved_cents: number | null; going: number;
};

const WHEN = { upcoming: 'Upcoming', week: 'Next 7 days', month: 'Next 30 days', all: 'All dates' } as const;
type When = keyof typeof WHEN;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function EventsPage({ searchParams }: PageProps<'/events'>) {
  const sp = await searchParams;
  const student = await getStudent();
  const college = one(sp.college).slice(0, 120);
  const category = (EVENT_CATEGORIES as readonly string[]).includes(one(sp.category)) ? one(sp.category) : '';
  const when: When = one(sp.when) in WHEN ? (one(sp.when) as When) : 'upcoming';

  let events: Event[];
  let colleges: string[];
  try {
    const where = ['e.deleted_at IS NULL'];
    const args: unknown[] = [student?.id ?? ''];
    if (college) { args.push(college); where.push(`e.school = $${args.length}`); }
    if (category) { args.push(category); where.push(`COALESCE(e.category, 'Other') = $${args.length}`); }
    if (when === 'upcoming') where.push(`e.starts_at >= now() - interval '1 day'`);
    if (when === 'week') where.push(`e.starts_at BETWEEN now() - interval '1 day' AND now() + interval '7 days'`);
    if (when === 'month') where.push(`e.starts_at BETWEEN now() - interval '1 day' AND now() + interval '30 days'`);
    [events, colleges] = await Promise.all([
      query<Event>(
        `SELECT e.id, e.title, e.club_name, e.school, e.description, e.location, e.starts_at, e.is_sample, e.category,
                (e.creator_id IS NOT NULL AND e.creator_id = $1) AS is_mine,
                g.title AS goal_title, g.target_cents, g.saved_cents,
                (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going
         FROM events e LEFT JOIN goals g ON g.id = e.goal_id
         WHERE ${where.join(' AND ')}
         ORDER BY e.starts_at LIMIT 60`,
        args,
      ),
      // Colleges come from the data, never a hardcoded list.
      query<{ school: string }>(`SELECT DISTINCT school FROM events WHERE deleted_at IS NULL AND school IS NOT NULL ORDER BY school LIMIT 100`)
        .then((rows) => rows.map((r) => r.school)),
    ]);
  } catch {
    return <div className="se-page"><PageHeader emoji="🎪" title="Club Events" /><DbError /></div>;
  }
  const filtered = !!college || !!category || when !== 'upcoming';

  return (
    <div className="se-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader emoji="🎪" title="Club Events">Discover what clubs are planning, RSVP, and help them reach their funding goals.</PageHeader>
        <Link href="/events/new" className="se-button text-base">＋ Create event</Link>
      </div>
      {sp.deleted === '1' && <p role="status" className="mb-6 rounded-2xl bg-se-sage/70 px-4 py-3 font-semibold">Your event was deleted. Its funding goal and contributions are still on the Funding Goals page.</p>}

      <form method="get" className="se-card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="grid gap-1 text-sm font-bold">
          College
          <select name="college" defaultValue={college} className="se-input py-2">
            <option value="">All colleges</option>
            {colleges.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Category
          <select name="category" defaultValue={category} className="se-input py-2">
            <option value="">All categories</option>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          When
          <select name="when" defaultValue={when} className="se-input py-2">
            {Object.entries(WHEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="se-pill bg-se-charcoal text-se-cream">Filter</button>
        {filtered && <Link href="/events" className="se-pill bg-se-cream ring-1 ring-se-charcoal/15">Clear</Link>}
      </form>

      {events.some((e) => e.is_sample) && <SampleNotice />}
      {events.length === 0 ? (
        <div className="se-card grid justify-items-center gap-3 p-8 text-center">
          <p className="text-4xl" aria-hidden>🎈</p>
          <h2 className="text-xl font-extrabold">{filtered ? 'No events match these filters' : 'No upcoming events yet'}</h2>
          <p className="text-se-charcoal/75">Be the first: create an event for your club and invite classmates.</p>
          <Link href="/events/new" className="se-button text-base">＋ Create event</Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {events.map((e) => {
            const pct = e.target_cents ? Math.min(100, Math.round(((e.saved_cents ?? 0) / e.target_cents) * 100)) : 0;
            return (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="se-card flex h-full flex-col gap-3 p-6 transition-transform hover:-translate-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span className="text-sm text-se-sage-dark">{e.club_name}</span>
                    <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{CATEGORY_EMOJI[e.category ?? 'Other'] ?? '✨'} {e.category ?? 'Other'}</span>
                    {e.is_sample ? <SampleBadge /> : <span className="rounded-full bg-se-peach px-2.5 py-0.5">Student-created</span>}
                    {e.is_mine && <span className="rounded-full bg-se-sage px-2.5 py-0.5">Your event</span>}
                  </div>
                  <h2 className="text-2xl font-extrabold">{e.title}</h2>
                  {e.description && <p className="line-clamp-3">{e.description}</p>}
                  <p className="text-sm text-se-charcoal/70">
                    🗓️ {formatEventDate(e.starts_at)}
                    {e.location && <> · 📍 {e.location}</>}
                    {e.school && <> · {e.school}</>}
                  </p>
                  <p className="text-sm font-semibold">🙋 {e.going} going</p>
                  {e.target_cents != null && (
                    <div className="mt-auto">
                      <div className="mb-1 flex justify-between text-sm font-semibold">
                        <span>{e.goal_title}</span>
                        <span>{money(e.saved_cents ?? 0)} of {money(e.target_cents)}</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-se-cream ring-2 ring-se-charcoal/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Funding progress">
                        <div className="h-full rounded-full bg-se-sage" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
