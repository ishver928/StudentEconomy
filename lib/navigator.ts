// AI Opportunity Navigator: server-only. Builds a plan from real Sprout data.
// Live mode (ANTHROPIC_API_KEY set): Claude writes the plan but may only reference items by the ids
// we give it; unknown ids are dropped and item titles/prices are always rendered from the database.
// Demo mode (no key, or the AI call fails): a deterministic, clearly labeled rule-based plan.
import { query } from './db';
import type { Student } from './student';

export type RefKind = 'listing' | 'goal' | 'event' | 'skill';
export type PlanRef = { kind: RefKind; id: string; title: string; meta: string; href: string; isSample: boolean };
export type PlanStep = { title: string; detail: string; refs: PlanRef[] };
export type Plan = {
  mode: 'live' | 'demo';
  modeNote?: string;
  question: string;
  budgetCents: number | null;
  summary: string;
  steps: PlanStep[];
  noMatches: string[]; // platform categories with nothing relevant (demo mode)
  tips: string[];
  goal: { title: string; target: string; description: string; kind: string };
};

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const STOP = new Set(['college', 'university', 'school', 'money', 'cost', 'costs', 'afford', 'dollars', 'paying', 'next', 'year', 'want','need', 'help', 'make', 'happen', 'student', 'attend', 'with', 'that', 'this', 'have', 'from', 'about', 'some', 'what', 'would', 'like', 'into', 'your', 'their', 'there', 'expenses']);

// ---- Platform data ----------------------------------------------------------------

type Listing = { id: string; title: string; description: string | null; category: string; condition: string | null; price_cents: number; is_sample: boolean };
type Goal = { id: string; title: string; description: string | null; kind: string; target_cents: number; saved_cents: number; is_sample: boolean };
type Event = { id: string; title: string; club_name: string; description: string | null; location: string | null; starts_at: Date; is_sample: boolean };
type Skill = { id: string; title: string; description: string | null; category: string | null; rate_cents: number | null; is_sample: boolean };

async function loadData() {
  const [listings, goals, events, skills] = await Promise.all([
    query<Listing>(`SELECT id, title, description, category, condition, price_cents, is_sample FROM listings WHERE status = 'available' ORDER BY price_cents LIMIT 60`),
    query<Goal>(`SELECT id, title, description, kind, target_cents, saved_cents, is_sample FROM goals WHERE saved_cents < target_cents ORDER BY created_at DESC LIMIT 30`),
    query<Event>(`SELECT id, title, club_name, description, location, starts_at, is_sample FROM events WHERE starts_at >= now() ORDER BY starts_at LIMIT 20`),
    query<Skill>(`SELECT id, title, description, category, rate_cents, is_sample FROM skills ORDER BY created_at DESC LIMIT 30`),
  ]);
  const refs = new Map<string, PlanRef>();
  const date = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  for (const l of listings) refs.set(`listing:${l.id}`, { kind: 'listing', id: l.id, title: l.title, meta: `${usd(l.price_cents)} · ${l.category}${l.condition ? ` · ${l.condition}` : ''}`, href: `/marketplace/${l.id}`, isSample: l.is_sample });
  for (const g of goals) refs.set(`goal:${g.id}`, { kind: 'goal', id: g.id, title: g.title, meta: `${usd(g.saved_cents)} of ${usd(g.target_cents)} raised`, href: `/goals/${g.id}`, isSample: g.is_sample });
  for (const e of events) refs.set(`event:${e.id}`, { kind: 'event', id: e.id, title: e.title, meta: `${e.club_name} · ${date(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`, href: '/events', isSample: e.is_sample });
  for (const s of skills) refs.set(`skill:${s.id}`, { kind: 'skill', id: s.id, title: s.title, meta: `${s.category ?? 'Skill'}${s.rate_cents != null ? ` · ${usd(s.rate_cents)}/hr` : ''}`, href: '/skillswap', isSample: s.is_sample });
  return { listings, goals, events, skills, refs };
}
type Data = Awaited<ReturnType<typeof loadData>>;

// ---- Question parsing --------------------------------------------------------------

export function parseBudget(text: string): number | null {
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.(\d{1,2}))?/) ?? text.match(/\b(\d{1,6})\s*(?:dollars|usd|bucks)\b/i);
  if (!m) return null;
  const cents = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return cents > 0 && cents <= 1_000_000_000 ? cents : null; // up to $10M; goal targets are capped separately
}

const keywords = (text: string) =>
  [...new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? [])].filter((w) => !STOP.has(w));

function score(words: string[], ...fields: (string | null)[]) {
  const hay = fields.join(' ').toLowerCase();
  return words.reduce((n, w) => n + (hay.includes(w.replace(/s$/, '')) ? 1 : 0), 0);
}

export const MAX_GOAL_DOLLARS = 10_000; // matches the funding-goal form limit

function goalDraft(question: string, budgetCents: number | null) {
  const q = question.toLowerCase();
  const travel = /travel|trip|flight|hotel|attend|conference|hackathon/.test(q);
  const title = /hackathon/.test(q) ? 'Hackathon travel fund' : /conference/.test(q) ? 'Conference travel fund'
    : /study abroad/.test(q) ? 'Study abroad fund' : /tuition/.test(q) ? 'Tuition fund' : travel ? 'Travel fund' : 'My funding goal';
  const dollars = budgetCents ? Math.min(budgetCents / 100, MAX_GOAL_DOLLARS) : null;
  return { title, target: dollars ? String(dollars) : '', description: question.slice(0, 300), kind: travel ? 'travel' : 'personal' };
}

// ---- Demo mode (deterministic) ------------------------------------------------------

function demoPlan(question: string, student: Student, data: Data, note?: string): Plan {
  const words = keywords(question);
  const budgetCents = parseBudget(question);
  const travel = /travel|trip|attend|hackathon|conference/i.test(question);
  const tuition = /tuition|semester fees|school fees|financial aid/i.test(question);
  // Only items whose text actually matches the question: no filler recommendations.
  const pick = <T extends { id: string }>(items: T[], kind: RefKind, fields: (x: T) => (string | null)[], n: number) =>
    items
      .map((x) => ({ x, s: score(words, ...fields(x)) }))
      .filter((r) => r.s >= 1)
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map((r) => data.refs.get(`${kind}:${r.x.id}`))
      .filter((r): r is PlanRef => !!r);

  const events = pick(data.events, 'event', (e) => [e.title, e.description, e.club_name], 2);
  const goals = pick(data.goals, 'goal', (g) => [g.title, g.description], 2);
  const skills = pick(data.skills, 'skill', (k) => [k.title, k.description, k.category], 3);
  const listings = pick(data.listings, 'listing', (l) => [l.title, l.description, l.category], 3);
  const draft = goalDraft(question, budgetCents);
  const name = student.firstName || 'there';
  const cap = usd(MAX_GOAL_DOLLARS * 100);

  const first: PlanStep = !budgetCents
    ? { title: 'Work out your target, then set a funding goal', detail: `Add up what you need, then create a goal for that amount (between $1 and ${cap}). We pre-filled the title "${draft.title}".`, refs: [] }
    : budgetCents > MAX_GOAL_DOLLARS * 100
      ? { title: `Fund part of your ${usd(budgetCents)} with a goal`, detail: `Funding goals go up to ${cap}, so start with a goal for one piece of the cost (pre-filled at ${cap}) and cover the rest with the ideas below.`, refs: [] }
      : { title: `Set a ${usd(budgetCents)} funding goal`, detail: `Turn your plan into a goal classmates can chip in to. We pre-filled "${draft.title}" with your ${usd(budgetCents)} target; adjust it before saving.`, refs: [] };
  const steps: PlanStep[] = [first];
  if (events.length) steps.push({ title: 'Go to related events', detail: 'These upcoming Sprout events match your plan: a good place to find teammates or share your goal.', refs: events });
  if (goals.length) steps.push({ title: 'Team up with similar goals', detail: 'Other students are funding related plans. Compare targets or coordinate to share costs.', refs: goals });
  if (skills.length) steps.push({ title: 'Trade skills instead of cash', detail: 'Students offer these related skills on SkillSwap.', refs: skills });
  if (listings.length) steps.push({ title: 'Buy used, not new', detail: 'These available listings match what you described and cost less than new.', refs: listings });

  const noMatches = [
    !events.length && 'events', !goals.length && 'funding goals', !skills.length && 'SkillSwap skills', !listings.length && 'marketplace listings',
  ].filter((x): x is string => !!x);
  const nothing = noMatches.length === 4;

  return {
    mode: 'demo',
    modeNote: note,
    question,
    budgetCents,
    summary: nothing
      ? `Hi ${name}! Sprout doesn't have listings, events, goals, or skills that match this yet, so this plan focuses on your own funding goal and general ideas.`
      : `Hi ${name}! Here's a plan to reach ${budgetCents ? usd(budgetCents) : 'your goal'} using matching resources on Sprout, plus general ideas to close the gap.`,
    steps,
    noMatches: nothing ? [] : noMatches,
    tips: [
      ...(travel ? [
        'Check whether the event offers travel stipends, reimbursements, or free student tickets, and apply early.',
        'Compare bus, train, and carpool options before booking rideshares or flights.',
        'Split lodging with teammates, or ask organizers about free housing.',
        'Ask your department, student government, or club advisor whether they fund student travel.',
      ] : []),
      ...(tuition ? [
        "Talk to your school's financial aid office about grants, payment plans, and work-study.",
        "Make sure this year's financial aid application is complete and submitted on time.",
        "Search your school's scholarship listings and apply to several smaller awards.",
      ] : []),
      'Offer a skill you have on SkillSwap (tutoring, design, resume help) to earn toward your goal.',
      'Track every expense in My Finances so you know exactly how much is left.',
    ],
    goal: draft,
  };
}

// ---- Live mode (Claude via the Messages API; no SDK dependency) -----------------------

async function livePlan(question: string, student: Student, data: Data): Promise<Plan> {
  const catalog = [...data.refs.entries()].map(([key, r]) => `${key} | ${r.title} | ${r.meta}`).join('\n');
  const system = `You are the Sprout Opportunity Navigator, a friendly financial coach for college students.
Write a practical, encouraging action plan for the student's goal.
STRICT RULES:
- Only reference platform items by their exact key from the CATALOG (e.g. "listing:abc"). Never invent listings, goals, events, skills, or prices.
- Reference an item ONLY if it directly helps with this specific goal. Referencing nothing is fine. Never pad the plan with unrelated items (e.g. no hackathon events or bike locks for a tuition question).
- If no catalog item is relevant, say plainly in the summary that Sprout doesn't currently have matching resources, and focus on a funding goal and general advice.
- Funding goals support targets from $1 to $${MAX_GOAL_DOLLARS}; if the need is larger, suggest a goal for part of it.
- Put general advice that is not a catalog item in "tips". Do not state specific outside prices, scholarships, or programs as facts.
- Never tell the student a payment was made; payments always require their explicit approval in PayPal.
Respond with ONLY a JSON object:
{"summary": string, "steps": [{"title": string, "detail": string, "refs": [catalog keys]}] (3-5 steps; each detail 1-2 short sentences), "tips": [string] (3-6, one sentence each), "goal": {"title": string, "target_dollars": number|null}}
Keep the summary to 2-3 sentences. Output valid JSON only, with no markdown fences.`;
  const user = `Student: ${student.firstName || 'Student'} (${student.level.replace('_', ' ')})\nGoal: ${question}\n\nCATALOG (key | title | details):\n${catalog || '(empty)'}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 3000,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    // Error bodies carry a type and message (never the key), e.g. "authentication_error: invalid x-api-key".
    const e = (await res.json().catch(() => ({}))) as { error?: { type?: string; message?: string } };
    throw new Error(`Anthropic API ${res.status} ${e.error?.type ?? ''}: ${(e.error?.message ?? '').slice(0, 120)}`);
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  if (body.stop_reason === 'max_tokens') throw new Error('Anthropic response was truncated (max_tokens)');
  const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
    summary?: unknown; steps?: { title?: unknown; detail?: unknown; refs?: unknown }[]; tips?: unknown[]; goal?: { title?: unknown; target_dollars?: unknown };
  };

  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const steps: PlanStep[] = (Array.isArray(json.steps) ? json.steps : []).slice(0, 6).map((st) => ({
    title: s(st.title, 120),
    detail: s(st.detail, 600),
    // Verified data only: keep refs that exist in our catalog, rendered from our own records.
    refs: (Array.isArray(st.refs) ? st.refs : []).map((k) => data.refs.get(String(k))).filter((r): r is PlanRef => !!r).slice(0, 4),
  })).filter((st) => st.title);
  if (!steps.length) throw new Error('AI response had no usable steps');

  const budgetCents = parseBudget(question);
  const draft = goalDraft(question, budgetCents);
  const aiTitle = s(json.goal?.title, 80);
  const aiTarget = typeof json.goal?.target_dollars === 'number' && json.goal.target_dollars > 0 && json.goal.target_dollars <= MAX_GOAL_DOLLARS ?String(Math.round(json.goal.target_dollars)) : '';
  return {
    mode: 'live',
    question,
    budgetCents,
    summary: s(json.summary, 600),
    steps,
    noMatches: [],
    tips: (Array.isArray(json.tips) ? json.tips : []).map((t) => s(t, 300)).filter(Boolean).slice(0, 6),
    goal: { ...draft, title: aiTitle.length >= 3 ? aiTitle : draft.title, target: aiTarget || draft.target },
  };
}

export const liveAiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export async function buildPlan(question: string, student: Student): Promise<Plan> {
  const data = await loadData();
  if (!liveAiConfigured()) return demoPlan(question, student, data);
  try {
    return await livePlan(question, student, data);
  } catch (err) {
    console.error('[navigator] live AI failed, using demo mode:', err instanceof Error ? err.message : 'unknown');
    return demoPlan(question, student, data, 'The live AI service was unavailable, so this plan was generated in demo mode.');
  }
}
