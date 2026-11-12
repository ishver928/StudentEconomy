// AI Opportunity Navigator: server-only. Builds a plan from real StudentEconomy data.
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
  tips: string[];
  goal: { title: string; target: string; description: string; kind: string };
};

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const STOP = new Set(['want', 'need', 'help', 'make', 'happen', 'student', 'attend', 'with', 'that', 'this', 'have', 'from', 'about', 'some', 'what', 'would', 'like', 'into', 'your', 'their', 'there', 'expenses']);

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
  return cents > 0 && cents <= 10_000_00 ? cents : null;
}

const keywords = (text: string) =>
  [...new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? [])].filter((w) => !STOP.has(w));

function score(words: string[], ...fields: (string | null)[]) {
  const hay = fields.join(' ').toLowerCase();
  return words.reduce((n, w) => n + (hay.includes(w.replace(/s$/, '')) ? 1 : 0), 0);
}

function goalDraft(question: string, budgetCents: number | null) {
  const q = question.toLowerCase();
  const topic = /hackathon/.test(q) ? 'Hackathon' : /conference/.test(q) ? 'Conference' : /study abroad/.test(q) ? 'Study abroad' : null;
  const travel = /travel|trip|flight|bus|hotel|attend|conference|hackathon/.test(q);
  return {
    title: topic ? `${topic} travel fund` : travel ? 'Travel fund' : 'My funding goal',
    target: budgetCents ? String(budgetCents / 100) : '',
    description: question.slice(0, 300),
    kind: travel ? 'travel' : 'personal',
  };
}

// ---- Demo mode (deterministic) ------------------------------------------------------

function demoPlan(question: string, student: Student, data: Data, note?: string): Plan {
  const words = keywords(question);
  const budgetCents = parseBudget(question);
  const travel = /travel|trip|attend|hackathon|conference/i.test(question);
  // Top-n by score; when something matches well (score >= 1), weak matches are dropped.
  const pick = <T extends { id: string }>(items: T[], kind: RefKind, rank: (x: T) => number, n: number) => {
    const ranked = items.map((x) => ({ x, s: rank(x) })).sort((a, b) => b.s - a.s).slice(0, n);
    const strong = (ranked[0]?.s ?? 0) >= 1;
    return ranked
      .filter((r) => !strong || r.s >= 1)
      .map((r) => data.refs.get(`${kind}:${r.x.id}`))
      .filter((r): r is PlanRef => !!r);
  };

  const events = pick(data.events, 'event', (e) => score(words, e.title, e.description, e.club_name) * 2 + 0.1, 2);
  const goals = pick(data.goals, 'goal', (g) => score(words, g.title, g.description) * 2 + (travel && g.kind === 'travel' ? 1 : 0) + 0.1, 2);
  const skills = pick(data.skills, 'skill', (s) => (s.rate_cents ?? 0) / 1000 + score(words, s.title, s.description), 3);
  const gearCats = travel ? ['transport', 'electronics'] : [];
  const listings = pick(
    data.listings,
    'listing',
    (l) => score(words, l.title, l.description, l.category) * 2 + (gearCats.includes(l.category.toLowerCase()) ? 1 : 0) + 0.01,
    3,
  );
  const draft = goalDraft(question, budgetCents);
  const target = budgetCents ? usd(budgetCents) : 'your target';
  const name = student.firstName || 'there';

  const steps: PlanStep[] = [
    {
      title: `Set a ${target} funding goal`,
      detail: `Turn your plan into a goal classmates can chip in to. We pre-filled "${draft.title}"${budgetCents ? ` with your ${target} target` : ''}; adjust it before saving.`,
      refs: [],
    },
  ];
  if (events.length) steps.push({ title: 'Show up where your people are', detail: 'These upcoming events on StudentEconomy match your plan: a good place to find teammates or share your goal.', refs: events });
  if (goals.length) steps.push({ title: 'Team up with similar goals', detail: 'Other students are funding related plans. Compare targets, or coordinate to share rides and rooms.', refs: goals });
  if (skills.length) steps.push({ title: 'Earn or trade with your skills', detail: 'Students offer these skills on SkillSwap. Post your own skill to earn toward your goal, or trade instead of paying cash.', refs: skills });
  if (listings.length) steps.push({ title: 'Buy used, not new', detail: 'If you need gear, these available listings are cheaper than buying new. Only buy what the trip actually requires.', refs: listings });

  return {
    mode: 'demo',
    modeNote: note,
    question,
    budgetCents,
    summary: `Hi ${name}! Here's a step-by-step plan to reach ${budgetCents ? `${target}` : 'your goal'} using what's on StudentEconomy right now, plus a few general ideas to cut costs.`,
    steps,
    tips: [
      ...(travel
        ? [
            'Check whether the event offers travel stipends, reimbursements, or free student tickets, and apply early.',
            'Compare bus, train, and carpool options before booking rideshares or flights.',
            'Split lodging with teammates, or ask about free housing hosted by the organizers.',
          ]
        : []),
      'Ask your department, student government, or a club advisor whether they fund student travel or projects.',
      'Pack snacks and reusable bottles to keep food costs down.',
      'Track every expense in My Finances so you know exactly how much is left.',
    ],
    goal: draft,
  };
}

// ---- Live mode (Claude via the Messages API; no SDK dependency) -----------------------

async function livePlan(question: string, student: Student, data: Data): Promise<Plan> {
  const catalog = [...data.refs.entries()].map(([key, r]) => `${key} | ${r.title} | ${r.meta}`).join('\n');
  const system = `You are the StudentEconomy Opportunity Navigator, a friendly financial coach for college students.
Write a practical, encouraging action plan for the student's goal.
STRICT RULES:
- Only reference platform items by their exact key from the CATALOG (e.g. "listing:abc"). Never invent listings, goals, events, skills, or prices.
- Put general advice that is not a catalog item in "tips". Do not state specific outside prices, scholarships, or programs as facts.
- Never tell the student a payment was made; payments always require their explicit approval in PayPal.
Respond with ONLY a JSON object:
{"summary": string, "steps": [{"title": string, "detail": string, "refs": [catalog keys]}] (3-5 steps), "tips": [string] (3-6), "goal": {"title": string, "target_dollars": number|null}}`;
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
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
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
  const aiTarget = typeof json.goal?.target_dollars === 'number' && json.goal.target_dollars > 0 && json.goal.target_dollars <= 10_000 ? String(Math.round(json.goal.target_dollars)) : '';
  return {
    mode: 'live',
    question,
    budgetCents,
    summary: s(json.summary, 600),
    steps,
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
