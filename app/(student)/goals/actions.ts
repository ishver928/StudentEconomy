'use server';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { parseDollars } from '@/lib/contribution';
import { getStudent } from '@/lib/student';

export type GoalFormState = { error?: string };

const KINDS = ['personal', 'club', 'travel'];
const MAX_TARGET_CENTS = 1_000_000; // $10,000

export async function createGoal(_prev: GoalFormState, form: FormData): Promise<GoalFormState> {
  const student = await getStudent();
  if (!student) return { error: 'Please finish setting up your profile first.' };

  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const kind = String(form.get('kind') ?? 'personal');
  const target = parseDollars(String(form.get('target') ?? ''));
  const deadline = String(form.get('deadline') ?? '').trim();

  if (title.length < 3 || title.length > 80) return { error: 'Give your goal a title between 3 and 80 characters.' };
  if (description.length > 500) return { error: 'Keep the description under 500 characters.' };
  if (!KINDS.includes(kind)) return { error: 'Choose a goal type.' };
  if (target === null || target < 100 || target > MAX_TARGET_CENTS) return { error: 'Target must be between $1 and $10,000.' };
  if (deadline) {
    const d = new Date(`${deadline}T00:00:00Z`);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const limit = new Date(today.getTime() + 2 * 365 * 86_400_000);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(d.getTime()) || d < today || d > limit) {
      return { error: 'Deadline must be a date between today and two years from now.' };
    }
  }

  let id: string;
  try {
    [{ id }] = await query<{ id: string }>(
      `INSERT INTO goals (user_id, title, description, kind, target_cents, saved_cents, deadline, is_sample)
       VALUES ($1, $2, $3, $4, $5, 0, $6, false) RETURNING id`,
      [student.id, title, description || null, kind, target, deadline || null],
    );
  } catch {
    return { error: "We couldn't save your goal right now. Please try again." };
  }
  redirect(`/goals/${id}?created=1`);
}
