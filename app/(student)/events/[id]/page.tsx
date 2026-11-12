import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { CATEGORY_EMOJI, formatEventDate } from '@/lib/events';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, SampleBadge, money } from '../../ui';
import { GoalProgress } from '../../goals/progress';
import { setRsvp } from '../actions';
import { ShareBox } from './share-box';

export const metadata: Metadata = { title: 'Club event' };

type Event = {
  id: string; title: string; club_name: string; school: string | null; description: string | null; location: string | null;
  starts_at: Date; category: string | null; budget_cents: number | null; funding_purpose: string | null; is_sample: boolean;
  is_mine: boolean; goal_id: string | null; target_cents: number | null; saved_cents: number | null; contributions: number;
  going: number; interested: number; my_rsvp: string | null; upcoming: boolean;
};
type Attendee = { display_name: string; status: string; is_sample: boolean };

export default async function EventPage({ params, searchParams }: PageProps<'/events/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isValidId(id)) notFound();
  const student = await getStudent();

  let ev: Event | undefined;
  let attendees: Attendee[] = [];
  try {
    // is_mine is computed in SQL so the organizer's user id never reaches the page.
    [ev] = await query<Event>(
      `SELECT e.id, e.title, e.club_name, e.school, e.description, e.location, e.starts_at, e.category, e.budget_cents,
              e.funding_purpose, e.is_sample, (e.creator_id IS NOT NULL AND e.creator_id = $2) AS is_mine,
              (e.starts_at >= now() - interval '1 day') AS upcoming,
              e.goal_id, g.target_cents, g.saved_cents,
              (SELECT count(*)::int FROM orders o WHERE o.goal_id = e.goal_id AND o.kind = 'contribution' AND o.status = 'COMPLETED') AS contributions,
              (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
              (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.status = 'interested') AS interested,
              (SELECT r.status FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $2) AS my_rsvp
       FROM events e LEFT JOIN goals g ON g.id = e.goal_id
       WHERE e.id = $1 AND e.deleted_at IS NULL`,
      [id, student?.id ?? ''],
    );
    if (ev) {
      // Only students who opted in to a public Community profile are named.
      attendees = await query<Attendee>(
        `SELECT p.display_name, r.status, p.is_sample FROM event_rsvps r JOIN profiles p ON p.user_id = r.user_id AND p.opt_in
         WHERE r.event_id = $1 ORDER BY r.status, p.display_name LIMIT 30`,
        [id],
      );
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="🎪" title="Club event" /><DbError /></div>;
  }
  if (!ev) notFound();
  const unnamed = ev.going + ev.interested - attendees.length;
  const funded = (ev.saved_cents ?? 0) >= (ev.target_cents ?? 0);

  return (
    <div className="se-page max-w-5xl">
      <Link href="/events" className="mb-4 inline-block font-bold underline">← All events</Link>
      {sp.created === '1' && ev.is_mine && (
        <p role="status" className="mb-6 rounded-2xl bg-se-sage/70 px-4 py-3 font-semibold">
          🎉 Your event is live! Share the link below so classmates can RSVP{ev.goal_id ? ' and chip in' : ''}.
        </p>
      )}
      {sp.updated === '1' && ev.is_mine && <p role="status" className="mb-6 rounded-2xl bg-se-sage/70 px-4 py-3 font-semibold">Changes saved.</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="se-card grid content-start gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-se-sky/60 px-2.5 py-0.5">{CATEGORY_EMOJI[ev.category ?? 'Other'] ?? '✨'} {ev.category ?? 'Other'}</span>
            {ev.is_sample ? <SampleBadge /> : <span className="rounded-full bg-se-peach px-2.5 py-0.5">Student-created</span>}
            {ev.is_mine && <span className="rounded-full bg-se-sage px-2.5 py-0.5">Your event</span>}
          </div>
          <p className="text-sm font-bold text-se-sage-dark">{ev.club_name}</p>
          <h1 className="text-3xl font-extrabold">{ev.title}</h1>
          {ev.description && <p className="whitespace-pre-line text-se-charcoal/85">{ev.description}</p>}
          <ul className="grid gap-1 text-sm">
            <li>🗓️ {formatEventDate(ev.starts_at)} (Pacific time)</li>
            {ev.location && <li>📍 {ev.location}</li>}
            {ev.school && <li>🏫 {ev.school}</li>}
            {ev.budget_cents != null && <li>💰 Estimated budget: {money(ev.budget_cents)}</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link href={`/travel?event=${ev.id}`} className="se-pill bg-se-lavender hover:bg-se-lavender/70">🎒 Plan travel to this event</Link>
            {ev.is_mine && !ev.is_sample && (
              <Link href={`/events/${ev.id}/edit`} className="se-pill bg-se-cream ring-1 ring-se-charcoal/15">✏️ Edit or delete</Link>
            )}
          </div>
          <div className="grid gap-1">
            <p className="text-sm font-extrabold">Share this event</p>
            <ShareBox path={`/events/${ev.id}`} />
          </div>
        </article>

        <aside className="grid content-start gap-6">
          {ev.goal_id && ev.target_cents != null ? (
            <section className="se-card grid gap-3 p-5">
              <h2 className="text-lg font-extrabold">🎯 Event fundraising</h2>
              {ev.funding_purpose && <p className="text-sm text-se-charcoal/80">{ev.funding_purpose}</p>}
              <GoalProgress saved={ev.saved_cents ?? 0} target={ev.target_cents} />
              <p className="text-xs text-se-charcoal/65">
                {ev.contributions} verified sandbox contribution{ev.contributions === 1 ? '' : 's'} via PayPal
              </p>
              {!funded && <Link href={`/goals/${ev.goal_id}`} className="se-button text-center text-base">Contribute via PayPal Sandbox</Link>}
              <p className="text-xs text-se-charcoal/60">🧪 PayPal Sandbox, no real money. Progress only updates after PayPal confirms the payment.</p>
            </section>
          ) : (
            <section className="se-card p-5 text-sm text-se-charcoal/75">This event isn&apos;t fundraising.</section>
          )}

          <section className="se-card grid gap-3 p-5">
            <h2 className="text-lg font-extrabold">🙋 Who&apos;s going</h2>
            <p className="text-sm">{ev.going} going · {ev.interested} interested</p>
            {student && ev.upcoming && (
              <div className="flex flex-wrap gap-2">
                {(['going', 'interested'] as const).map((s) => (
                  <form key={s} action={setRsvp}>
                    <input type="hidden" name="id" value={ev.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      className={`se-pill ${ev.my_rsvp === s ? 'bg-se-charcoal text-se-cream' : 'bg-se-sage/50 hover:bg-se-sage'}`}
                      aria-pressed={ev.my_rsvp === s}
                    >
                      {s === 'going' ? '✅ Going' : '⭐ Interested'}
                    </button>
                  </form>
                ))}
                {ev.my_rsvp && (
                  <form action={setRsvp}>
                    <input type="hidden" name="id" value={ev.id} />
                    <input type="hidden" name="status" value="cancel" />
                    <button className="se-pill bg-se-cream ring-1 ring-se-charcoal/15">Cancel RSVP</button>
                  </form>
                )}
              </div>
            )}
            {attendees.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {attendees.map((a, i) => (
                  <li key={i} className="rounded-full bg-se-sky/40 px-2.5 py-0.5">
                    {a.display_name}{a.status === 'interested' ? ' ⭐' : ''}{a.is_sample ? ' (fictional)' : ''}
                  </li>
                ))}
              </ul>
            )}
            {unnamed > 0 && <p className="text-xs text-se-charcoal/60">{unnamed} more without a public Community profile.</p>}
            <Link href={`/travel?event=${ev.id}`} className="text-sm font-bold underline">Find students traveling to this event →</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
