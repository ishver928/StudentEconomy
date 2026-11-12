// Club events: shared types, categories and server-side validation for create/edit.
// Event funding reuses the Funding Goals backend (events.goal_id -> goals.id); contributions go
// through the existing PayPal Sandbox flow on /goals/[id]. Nothing here touches payments.
import { parseDollars } from './contribution';

export const EVENT_CATEGORIES = ['Hackathon', 'Workshop', 'Social', 'Fundraiser', 'Competition', 'Conference', 'Other'] as const;
export const CATEGORY_EMOJI: Record<string, string> = {
  Hackathon: '💻', Workshop: '🛠️', Social: '🎉', Fundraiser: '🧁', Competition: '🏆', Conference: '🎤', Other: '✨',
};

export const MAX_EVENT_BUDGET_CENTS = 10_000_000; // $100,000
export const MAX_EVENT_GOAL_CENTS = 1_000_000; // $10,000, same as the funding-goal form

export type EventInput = {
  title: string;
  clubName: string;
  description: string;
  school: string;
  location: string;
  startsAt: Date;
  category: string;
  budgetCents: number | null;
  lat: number | null;
  lng: number | null;
  goal: { targetCents: number; purpose: string } | null;
};

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
};

function coord(raw: string, limit: number): number | null | undefined {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

/** Validates the event form. Returns the parsed input or a friendly error message. */
export function parseEventForm(form: FormData): { ok: true; value: EventInput } | { ok: false; error: string } {
  const title = str(form, 'title');
  const clubName = str(form, 'clubName');
  const description = str(form, 'description');
  const school = str(form, 'school');
  const location = str(form, 'location');
  const category = str(form, 'category');
  const startsRaw = str(form, 'startsAt');
  const budgetRaw = str(form, 'budget');
  const wantsGoal = form.get('withGoal') === 'on';

  if (title.length < 3 || title.length > 80) return { ok: false, error: 'Event name must be 3 to 80 characters.' };
  if (clubName.length < 2 || clubName.length > 60) return { ok: false, error: 'Club or organization name must be 2 to 60 characters.' };
  if (description.length > 1000) return { ok: false, error: 'Keep the description under 1,000 characters.' };
  if (school.length > 120) return { ok: false, error: 'College name is too long (120 characters max).' };
  if (location.length > 140) return { ok: false, error: 'Location is too long (140 characters max).' };
  if (!(EVENT_CATEGORIES as readonly string[]).includes(category)) return { ok: false, error: 'Choose an event category.' };

  const startsAt = new Date(startsRaw);
  const now = Date.now();
  if (!startsRaw || Number.isNaN(startsAt.getTime())) return { ok: false, error: 'Choose a date and time for the event.' };
  if (startsAt.getTime() < now - 86_400_000 || startsAt.getTime() > now + 2 * 365 * 86_400_000) {
    return { ok: false, error: 'The event date must be between today and two years from now.' };
  }

  let budgetCents: number | null = null;
  if (budgetRaw) {
    budgetCents = parseDollars(budgetRaw);
    if (budgetCents === null || budgetCents > MAX_EVENT_BUDGET_CENTS) return { ok: false, error: 'Budget must be a dollar amount between $0 and $100,000.' };
  }

  const lat = coord(str(form, 'lat'), 90);
  const lng = coord(str(form, 'lng'), 180);
  if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) return { ok: false, error: 'The map location is invalid. Search for it again.' };

  let goal: EventInput['goal'] = null;
  if (wantsGoal) {
    const targetCents = parseDollars(str(form, 'goalTarget'));
    const purpose = str(form, 'goalPurpose');
    if (targetCents === null || targetCents < 100 || targetCents > MAX_EVENT_GOAL_CENTS) return { ok: false, error: 'Funding goal must be between $1 and $10,000.' };
    if (purpose.length < 10 || purpose.length > 500) return { ok: false, error: 'Explain what the money is for (10 to 500 characters).' };
    goal = { targetCents, purpose };
  }

  return { ok: true, value: { title, clubName, description, school, location, startsAt, category, budgetCents, lat, lng, goal } };
}

export const formatEventDate = (d: Date) =>
  new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' });
