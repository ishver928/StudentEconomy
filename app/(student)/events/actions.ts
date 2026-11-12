'use server';
// Club event actions. Identity is the demo browser cookie (getStudent); every write checks
// ownership in its SQL WHERE clause. Funding reuses the goals table; no payment code lives here.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { query, withTransaction } from '@/lib/db';
import { parseEventForm } from '@/lib/events';
import { getStudent } from '@/lib/student';

export type EventFormState = { error?: string };

const NO_PROFILE = 'Please finish setting up your profile first.';
const SAVE_FAILED = "We couldn't save your event right now. Please try again.";

export async function createEvent(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const student = await getStudent();
  if (!student) return { error: NO_PROFILE };
  const parsed = parseEventForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const e = parsed.value;

  let id: string;
  try {
    id = await withTransaction(async (db) => {
      let goalId: string | null = null;
      if (e.goal) {
        const { rows } = await db.query<{ id: string }>(
          `INSERT INTO goals (user_id, title, description, kind, target_cents, saved_cents, is_sample)
           VALUES ($1, $2, $3, 'club', $4, 0, false) RETURNING id`,
          [student.id, e.title, e.goal.purpose, e.goal.targetCents],
        );
        goalId = rows[0].id;
      }
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO events (title, club_name, school, description, location, starts_at, category, budget_cents,
                             funding_purpose, lat, lng, goal_id, creator_id, is_sample)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false) RETURNING id`,
        [e.title, e.clubName, e.school || null, e.description || null, e.location || null, e.startsAt, e.category,
          e.budgetCents, e.goal?.purpose ?? null, e.lat, e.lng, goalId, student.id],
      );
      return rows[0].id;
    });
  } catch (err) {
    console.error('[events] create failed:', err instanceof Error ? err.name : 'unknown');
    return { error: SAVE_FAILED };
  }
  revalidatePath('/events');
  redirect(`/events/${id}?created=1`);
}

export async function updateEvent(_prev: EventFormState, form: FormData): Promise<EventFormState> {
  const student = await getStudent();
  if (!student) return { error: NO_PROFILE };
  const id = form.get('id');
  if (!isValidId(id)) return { error: "We couldn't find that event." };
  const parsed = parseEventForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const e = parsed.value;

  type Outcome = 'ok' | 'not_found' | 'below_saved';
  let outcome: Outcome;
  try {
    outcome = await withTransaction<Outcome>(async (db) => {
      // Lock the caller's own, non-sample, non-deleted event.
      const { rows: [ev] } = await db.query<{ goal_id: string | null }>(
        `SELECT goal_id FROM events WHERE id = $1 AND creator_id = $2 AND NOT is_sample AND deleted_at IS NULL FOR UPDATE`,
        [id, student.id],
      );
      if (!ev) return 'not_found';

      let goalId = ev.goal_id;
      if (goalId && e.goal) {
        // Never lower a target below what verified contributions have already raised.
        const { rowCount } = await db.query(
          `UPDATE goals SET target_cents = $1, description = $2 WHERE id = $3 AND user_id = $4 AND saved_cents <= $1`,
          [e.goal.targetCents, e.goal.purpose, goalId, student.id],
        );
        if (!rowCount) return 'below_saved';
      } else if (!goalId && e.goal) {
        const { rows } = await db.query<{ id: string }>(
          `INSERT INTO goals (user_id, title, description, kind, target_cents, saved_cents, is_sample)
           VALUES ($1, $2, $3, 'club', $4, 0, false) RETURNING id`,
          [student.id, e.title, e.goal.purpose, e.goal.targetCents],
        );
        goalId = rows[0].id;
      }
      // An existing goal link is always kept: its contributions are real sandbox records.
      await db.query(
        `UPDATE events SET title = $1, club_name = $2, school = $3, description = $4, location = $5, starts_at = $6,
                category = $7, budget_cents = $8, funding_purpose = COALESCE($9, funding_purpose), lat = $10, lng = $11,
                goal_id = $12, updated_at = now()
         WHERE id = $13 AND creator_id = $14 AND NOT is_sample AND deleted_at IS NULL`,
        [e.title, e.clubName, e.school || null, e.description || null, e.location || null, e.startsAt, e.category,
          e.budgetCents, e.goal?.purpose ?? null, e.lat, e.lng, goalId, id, student.id],
      );
      return 'ok';
    });
  } catch (err) {
    console.error('[events] update failed:', err instanceof Error ? err.name : 'unknown');
    return { error: SAVE_FAILED };
  }
  if (outcome === 'not_found') return { error: 'Only the organizer can edit this event.' };
  if (outcome === 'below_saved') return { error: "The funding goal can't be lower than what has already been raised." };
  revalidatePath('/events');
  revalidatePath(`/events/${id}`);
  redirect(`/events/${id}?updated=1`);
}

export async function deleteEvent(form: FormData): Promise<void> {
  const student = await getStudent();
  const id = form.get('id');
  if (!student || !isValidId(id)) redirect('/events');
  // Soft delete: the linked funding goal and its verified contributions stay intact.
  const rows = await query<{ id: string }>(
    `UPDATE events SET deleted_at = now() WHERE id = $1 AND creator_id = $2 AND NOT is_sample AND deleted_at IS NULL RETURNING id`,
    [id, student.id],
  );
  revalidatePath('/events');
  redirect(rows.length ? '/events?deleted=1' : `/events/${id}`);
}

export async function setRsvp(form: FormData): Promise<void> {
  const student = await getStudent();
  const id = form.get('id');
  const status = form.get('status');
  if (!student || !isValidId(id)) redirect('/events');
  try {
    if (status === 'going' || status === 'interested') {
      await query(
        `INSERT INTO event_rsvps (event_id, user_id, status)
         SELECT id, $2, $3 FROM events WHERE id = $1 AND deleted_at IS NULL
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
        [id, student.id, status],
      );
    } else {
      // Targeted: only the caller's own RSVP for this one event.
      await query('DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [id, student.id]);
    }
  } catch (err) {
    console.error('[events] rsvp failed:', err instanceof Error ? err.name : 'unknown');
  }
  revalidatePath(`/events/${id}`);
  revalidatePath('/events');
}
