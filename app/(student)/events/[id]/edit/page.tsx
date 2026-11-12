import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { EVENT_CATEGORIES } from '@/lib/events';
import { getStudent } from '@/lib/student';
import { DbError, PageHeader, money } from '../../../ui';
import { deleteEvent, updateEvent } from '../../actions';
import { EventForm } from '../../event-form';
import { DeleteEventButton } from './delete-button';

export const metadata: Metadata = { title: 'Edit event' };

type Row = {
  id: string; title: string; club_name: string; description: string | null; school: string | null; location: string | null;
  starts_at: Date; category: string | null; budget_cents: number | null; funding_purpose: string | null;
  lat: number | null; lng: number | null; goal_id: string | null; target_cents: number | null; saved_cents: number | null; goal_description: string | null;
};

const dollars = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace(/\.00$/, ''));

export default async function EditEventPage({ params }: PageProps<'/events/[id]/edit'>) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const student = await getStudent();
  if (!student) return null; // the layout shows onboarding instead

  let ev: Row | undefined;
  try {
    // Only the organizer's own, non-sample, non-deleted event.
    [ev] = await query<Row>(
      `SELECT e.id, e.title, e.club_name, e.description, e.school, e.location, e.starts_at, e.category, e.budget_cents, e.funding_purpose,
              e.lat, e.lng, e.goal_id, g.target_cents, g.saved_cents, g.description AS goal_description
       FROM events e LEFT JOIN goals g ON g.id = e.goal_id
       WHERE e.id = $1 AND e.creator_id = $2 AND NOT e.is_sample AND e.deleted_at IS NULL`,
      [id, student.id],
    );
  } catch {
    return <div className="se-page"><PageHeader emoji="✏️" title="Edit event" /><DbError /></div>;
  }
  if (!ev) notFound();

  return (
    <div className="se-page max-w-2xl">
      <Link href={`/events/${ev.id}`} className="mb-4 inline-block font-bold underline">← Back to the event</Link>
      <PageHeader emoji="✏️" title="Edit event">Only you, the organizer, can change or delete this event.</PageHeader>
      <EventForm
        action={updateEvent}
        categories={EVENT_CATEGORIES}
        submitLabel="Save changes"
        defaults={{
          id: ev.id,
          title: ev.title,
          clubName: ev.club_name,
          description: ev.description ?? '',
          school: ev.school ?? '',
          location: ev.location ?? '',
          startsAtIso: new Date(ev.starts_at).toISOString(),
          category: ev.category ?? '',
          budget: dollars(ev.budget_cents),
          lat: ev.lat == null ? '' : String(ev.lat),
          lng: ev.lng == null ? '' : String(ev.lng),
          goal: ev.goal_id && ev.target_cents != null
            ? { target: dollars(ev.target_cents), purpose: ev.funding_purpose ?? ev.goal_description ?? '', savedCents: ev.saved_cents ?? 0 }
            : null,
        }}
      />
      <section className="se-card mt-6 grid gap-2 border-[#ffb3a7] p-6">
        <h2 className="text-lg font-extrabold">Delete this event</h2>
        <p className="text-sm text-se-charcoal/75">
          The event disappears from Club Events.
          {ev.goal_id && ` Its funding goal (${money(ev.saved_cents ?? 0)} raised) and every verified PayPal Sandbox contribution stay intact on the Funding Goals page.`}
        </p>
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={ev.id} />
          <DeleteEventButton />
        </form>
      </section>
    </div>
  );
}
