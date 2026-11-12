import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { DbError, PageHeader, SampleBadge, SampleNotice, money } from '../ui';

export const metadata: Metadata = { title: 'Club Events' };

type Event = {
  id: string; title: string; club_name: string; school: string | null; description: string | null;
  location: string | null; starts_at: Date; is_sample: boolean;
  goal_title: string | null; target_cents: number | null; saved_cents: number | null;
};

export default async function EventsPage() {
  let events: Event[];
  try {
    events = await query<Event>(
      `SELECT e.id, e.title, e.club_name, e.school, e.description, e.location, e.starts_at, e.is_sample,
              g.title AS goal_title, g.target_cents, g.saved_cents
       FROM events e LEFT JOIN goals g ON g.id = e.goal_id
       ORDER BY e.starts_at LIMIT 50`,
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="🎪" title="Club Events" /><DbError /></div>;
  }

  return (
    <div className="se-page">
      <PageHeader emoji="🎪" title="Club Events">See what clubs are planning and help them reach their funding goals.</PageHeader>
      {events.some((e) => e.is_sample) && <SampleNotice />}
      <ul className="grid gap-4 md:grid-cols-2">
        {events.map((e) => {
          const pct = e.target_cents ? Math.min(100, Math.round(((e.saved_cents ?? 0) / e.target_cents) * 100)) : 0;
          return (
            <li key={e.id} className="se-card flex flex-col gap-3 p-6">
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-se-sage-dark">
                {e.club_name} {e.is_sample && <SampleBadge />}
              </div>
              <h2 className="text-2xl font-extrabold">{e.title}</h2>
              <p>{e.description}</p>
              <p className="text-sm text-se-charcoal/70">
                🗓️ {new Date(e.starts_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' })}
                {e.location && <> · 📍 {e.location}</>}
                {e.school && <> · {e.school}</>}
              </p>
              {e.target_cents && (
                <div>
                  <div className="mb-1 flex justify-between text-sm font-semibold">
                    <span>{e.goal_title}</span>
                    <span>{money(e.saved_cents ?? 0)} of {money(e.target_cents)}</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-se-cream ring-2 ring-se-charcoal/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Funding progress">
                    <div className="h-full rounded-full bg-se-sage" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
