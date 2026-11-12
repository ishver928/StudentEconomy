'use server';
// Travel planning, matching, and carpool actions. Planning and coordination only: no bookings,
// no driver vetting, and no payments (shared costs are estimates students settle themselves).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isValidId } from '@/lib/checkout';
import { parseDollars } from '@/lib/contribution';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import { approx, DEPART_WINDOWS, TRAVEL_MODES, validLatLng } from '@/lib/travel';

export type ActionState = { error?: string; ok?: string };

const str = (form: FormData, key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max);
const num = (form: FormData, key: string) => Number(form.get(key));
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);
const inTwoYears = () => new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10);
// Keep labels to plain text so they can't carry markup into other students' screens.
const plain = (s: string) => s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

async function me() {
  const student = await getStudent();
  if (!student) throw new Error('no student');
  return student;
}

export async function savePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await getStudent();
  if (!student) return { error: 'Please finish setting up your profile first.' };
  const oLat = num(form, 'originLat'), oLng = num(form, 'originLng'), dLat = num(form, 'destLat'), dLng = num(form, 'destLng');
  if (!validLatLng(oLat, oLng) || !validLatLng(dLat, dLng)) return { error: 'Search for a starting point and a destination first.' };
  const originArea = plain(str(form, 'originArea', 60)) || 'Approximate area';
  const destLabel = plain(str(form, 'destLabel', 120));
  if (destLabel.length < 2) return { error: 'Your destination needs a name.' };
  const depart = str(form, 'departDate', 10);
  const ret = str(form, 'returnDate', 10);
  if (!isDate(depart) || depart < today() || depart > inTwoYears()) return { error: 'Pick a departure date between today and two years from now.' };
  if (ret && (!isDate(ret) || ret < depart || ret > inTwoYears())) return { error: 'The return date must be on or after the departure date.' };
  const window = str(form, 'departWindow', 12);
  const mode = str(form, 'mode', 10);
  if (!(DEPART_WINDOWS as readonly string[]).includes(window) || !(TRAVEL_MODES as readonly string[]).includes(mode)) return { error: 'Choose a departure time and travel style.' };
  const budgetRaw = str(form, 'budget', 10);
  const budget = budgetRaw ? parseDollars(budgetRaw) : null;
  if (budgetRaw && (budget === null || budget > 1_000_000)) return { error: 'Budget must be a dollar amount up to $10,000.' };
  const est = Math.round(num(form, 'estCostCents'));
  const estCost = Number.isFinite(est) && est >= 0 && est <= 500_000 ? est : null;
  const eventId = str(form, 'eventId', 64);
  const optIn = form.get('optIn') === 'on';

  let id: string;
  try {
    [{ id }] = await query<{ id: string }>(
      `INSERT INTO travel_plans (user_id, origin_area, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, depart_date, depart_window,
         return_date, budget_cents, est_cost_cents, travel_mode, match_opt_in, event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         (SELECT id FROM events WHERE id = $15 AND deleted_at IS NULL)) RETURNING id`,
      // The starting point is rounded (~2 km) before it is stored; the exact address is never saved.
      [student.id, originArea, approx(oLat), approx(oLng), destLabel, dLat, dLng, depart, window, ret || null, budget, estCost, mode, optIn, isValidId(eventId) ? eventId : null],
    );
  } catch {
    return { error: "We couldn't save your trip right now. Please try again." };
  }
  redirect(`/travel?plan=${id}&saved=1#plan`);
}

export async function deletePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const id = str(form, 'planId', 64);
  if (!isValidId(id)) return { error: 'Trip not found.' };
  await query(`UPDATE travel_plans SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, student.id]);
  revalidatePath('/travel');
  return { ok: 'Trip removed.' };
}

export async function setMatching(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const id = str(form, 'planId', 64);
  if (!isValidId(id)) return { error: 'Trip not found.' };
  const on = form.get('on') === '1';
  await query(`UPDATE travel_plans SET match_opt_in = $3 WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, student.id, on]);
  revalidatePath('/travel');
  return { ok: on ? 'Travel matching is on for this trip.' : 'Travel matching is off. Other students no longer see this trip.' };
}

export async function requestConnection(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const fromPlan = str(form, 'fromPlanId', 64);
  const toPlan = str(form, 'toPlanId', 64);
  const note = plain(str(form, 'note', 280));
  if (!isValidId(fromPlan) || !isValidId(toPlan)) return { error: 'Trip not found.' };
  // Both trips must exist, the first must be mine, and the other student must have opted in.
  const [row] = await query<{ to_user: string; is_sample: boolean }>(
    `SELECT t.user_id AS to_user, t.is_sample FROM travel_plans t
     WHERE t.id = $2 AND t.match_opt_in AND t.deleted_at IS NULL AND t.user_id <> $1
       AND EXISTS (SELECT 1 FROM travel_plans m WHERE m.id = $3 AND m.user_id = $1 AND m.deleted_at IS NULL)`,
    [student.id, toPlan, fromPlan],
  );
  if (!row) return { error: "This student isn't available for matching anymore." };
  // Fictional sample students can't reply, so their side is auto-accepted (clearly labeled in the UI).
  const inserted = await query(
    `INSERT INTO connections (from_user, to_user, from_plan_id, to_plan_id, note, status)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id`,
    [student.id, row.to_user, fromPlan, toPlan, note || null, row.is_sample ? 'accepted' : 'pending'],
  );
  revalidatePath('/travel');
  revalidatePath('/community/messages');
  if (!inserted.length) return { error: "You've already connected with this student." };
  return { ok: row.is_sample ? 'Connected! (Demo: fictional students accept automatically.)' : 'Request sent. Chat opens once they accept.' };
}

export async function respondConnection(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const id = str(form, 'connectionId', 64);
  const decision = str(form, 'decision', 10);
  if (!isValidId(id) || !['accepted', 'declined'].includes(decision)) return { error: 'Request not found.' };
  const rows = await query(
    `UPDATE connections SET status = $3, updated_at = now() WHERE id = $1 AND to_user = $2 AND status = 'pending' RETURNING id`,
    [id, student.id, decision],
  );
  revalidatePath('/travel');
  revalidatePath('/community/messages');
  if (!rows.length) return { error: 'This request was already answered.' };
  return { ok: decision === 'accepted' ? 'Connected! You can now chat in Community → Messages.' : 'Request declined.' };
}

export async function createCarpool(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const title = plain(str(form, 'title', 80));
  const seats = Math.trunc(num(form, 'seats'));
  const cost = parseDollars(str(form, 'sharedCost', 10));
  const planId = str(form, 'planId', 64);
  if (title.length < 3) return { error: 'Give your carpool a name (at least 3 characters).' };
  if (!(seats >= 1 && seats <= 7)) return { error: 'Seats for other students must be between 1 and 7.' };
  if (cost === null || cost > 500_000) return { error: 'Shared cost must be a dollar amount up to $5,000.' };
  const [count] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM carpool_groups WHERE owner_id = $1 AND deleted_at IS NULL`, [student.id]);
  if (count.n >= 10) return { error: 'You can organize up to 10 carpools at a time.' };
  await query(
    `INSERT INTO carpool_groups (owner_id, plan_id, title, seats, shared_cost_cents)
     VALUES ($1, (SELECT id FROM travel_plans WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL), $3, $4, $5)`,
    [student.id, isValidId(planId) ? planId : null, title, seats, cost],
  );
  revalidatePath('/travel');
  return { ok: 'Carpool created. Invite students you are connected with.' };
}

export async function inviteToCarpool(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const groupId = str(form, 'groupId', 64);
  const connectionId = str(form, 'connectionId', 64);
  if (!isValidId(groupId) || !isValidId(connectionId)) return { error: 'Choose someone to invite.' };
  // Only the organizer can invite, and only students they're connected with (accepted).
  const [target] = await query<{ user_id: string; is_sample: boolean; seats: number; used: number }>(
    `SELECT u.id AS user_id, u.is_sample, cg.seats,
            (SELECT count(*)::int FROM carpool_members cm WHERE cm.group_id = cg.id AND cm.status <> 'declined') AS used
     FROM carpool_groups cg
     JOIN connections c ON c.id = $3 AND c.status = 'accepted' AND (c.from_user = $1 OR c.to_user = $1)
     JOIN users u ON u.id = CASE WHEN c.from_user = $1 THEN c.to_user ELSE c.from_user END
     WHERE cg.id = $2 AND cg.owner_id = $1 AND cg.deleted_at IS NULL`,
    [student.id, groupId, connectionId],
  );
  if (!target) return { error: 'You can only invite students you are connected with.' };
  if (target.used >= target.seats) return { error: 'This carpool is full.' };
  const rows = await query(
    `INSERT INTO carpool_members (group_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING group_id`,
    [groupId, target.user_id, target.is_sample ? 'joined' : 'invited'],
  );
  revalidatePath('/travel');
  if (!rows.length) return { error: 'That student is already in this carpool.' };
  return { ok: target.is_sample ? 'Added! (Demo: fictional students join automatically.)' : 'Invite sent.' };
}

export async function respondCarpool(_prev: ActionState, form: FormData): Promise<ActionState> {
  const student = await me();
  const groupId = str(form, 'groupId', 64);
  const decision = str(form, 'decision', 10);
  if (!isValidId(groupId)) return { error: 'Carpool not found.' };
  if (decision === 'delete') {
    await query(`UPDATE carpool_groups SET deleted_at = now() WHERE id = $1 AND owner_id = $2 AND NOT is_sample`, [groupId, student.id]);
  } else if (decision === 'joined' || decision === 'declined') {
    const rows = await query(
      `UPDATE carpool_members SET status = $3 WHERE group_id = $1 AND user_id = $2 AND status <> $3 RETURNING group_id`,
      [groupId, student.id, decision],
    );
    if (!rows.length) return { error: 'Nothing to update.' };
  } else {
    return { error: 'Unknown choice.' };
  }
  revalidatePath('/travel');
  return { ok: decision === 'joined' ? "You're in!" : decision === 'delete' ? 'Carpool removed.' : 'Done.' };
}
