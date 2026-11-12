import type { Metadata } from 'next';
import Link from 'next/link';
import { isValidId } from '@/lib/checkout';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/student';
import {
  getCarpools, getConnections, getMapEvents, getMatches, getMyPlans, getTripMarkers,
  type Carpool, type Connection, type MapEvent, type Match, type MyPlan,
} from '@/lib/travel-data';
import { GoalProgress } from '../goals/progress';
import { DbError, PageHeader, SampleBadge, money } from '../ui';
import { ActionForm } from './action-form';
import { createCarpool, deletePlan, inviteToCarpool, requestConnection, respondCarpool, respondConnection, setMatching } from './actions';
import { TravelPlanner, type PlannerInitial } from './planner';
import { SplitFields } from './split-preview';

export const metadata: Metadata = { title: 'Travel' };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const tomorrowIso = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const MODE_LABEL: Record<string, string> = { carpool: '🚗 Carpool', transit: '🚇 Public transit', either: '🔀 Either' };

export default async function TravelPage({ searchParams }: PageProps<'/travel'>) {
  const student = await getStudent();
  if (!student) return null; // the layout shows onboarding instead
  const sp = await searchParams;

  let plans: MyPlan[], connections: Connection[], carpools: Carpool[], markers: Awaited<ReturnType<typeof getTripMarkers>>, events: MapEvent[];
  let prefill: { id: string; title: string; location: string | null; lat: number | null; lng: number | null; starts_at: Date } | undefined;
  try {
    [plans, connections, carpools, markers, events] = await Promise.all([
      getMyPlans(student.id), getConnections(student.id), getCarpools(student.id), getTripMarkers(student.id), getMapEvents(),
    ]);
    const eventId = one(sp.event);
    if (isValidId(eventId)) {
      [prefill] = await query<{ id: string; title: string; location: string | null; lat: number | null; lng: number | null; starts_at: Date }>(`SELECT id, title, location, lat, lng, starts_at FROM events WHERE id = $1 AND deleted_at IS NULL`, [eventId]);
    }
  } catch {
    return <div className="se-page"><PageHeader emoji="🎒" title="Travel" /><DbError /></div>;
  }

  const viewing = plans.find((p) => p.id === one(sp.plan)) ?? null;
  const focus = viewing ?? plans[0] ?? null; // the trip used for "students going your way"
  let matches: Match[] = [];
  if (focus?.optIn) matches = await getMatches(student.id, student.school, focus).catch(() => []);
  const demoEvent = events.find((e) => e.id === 'sample-event-3') ?? events.find((e) => e.isSample) ?? null;
  const tomorrow = tomorrowIso();

  const initial: PlannerInitial = viewing
    ? {
      origin: { lat: viewing.originLat, lng: viewing.originLng, label: viewing.originArea, area: viewing.originArea }, originExact: false,
      dest: { lat: viewing.destLat, lng: viewing.destLng, label: viewing.destLabel, area: viewing.destLabel },
      date: viewing.departDate, returnDate: viewing.returnDate ?? '', window: viewing.departWindow, mode: viewing.mode,
      budget: viewing.budgetCents ? String(viewing.budgetCents / 100) : '', eventId: viewing.eventId, eventTitle: viewing.eventTitle, demo: false,
    }
    : {
      origin: null, originExact: true,
      dest: prefill?.lat != null && prefill.lng != null ? { lat: prefill.lat, lng: prefill.lng, label: prefill.location ?? prefill.title, area: prefill.location ?? prefill.title } : null,
      date: prefill ? new Date(prefill.starts_at).toISOString().slice(0, 10) : tomorrow, returnDate: '', window: 'morning', mode: 'either', budget: '',
      eventId: prefill?.id ?? null, eventTitle: prefill?.title ?? null, demo: false,
    };

  const accepted = connections.filter((c) => c.status === 'accepted');
  const incoming = connections.filter((c) => c.status === 'pending' && !c.fromMe);
  const sameDest = matches.filter((m) => m.reasons.some((r) => r.startsWith('Attending the same event') || r === 'Same destination')).length;

  const sidebar = (
    <section className="se-card grid gap-3 p-4">
      <h2 className="text-lg font-extrabold">👋 Students going your way</h2>
      {!focus ? (
        <p className="text-sm text-se-charcoal/70">Save a trip with travel matching on to see students heading the same way. Try the demo above to see how it works.</p>
      ) : (
        <>
          <p className="text-xs font-semibold text-se-charcoal/70">For your trip to <strong>{focus.destLabel}</strong> on {day(focus.departDate)}</p>
          {plans.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {plans.map((p) => (
                <Link key={p.id} href={`/travel?plan=${p.id}`} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.id === focus.id ? 'bg-se-charcoal text-se-cream' : 'bg-se-cream'}`}>{p.destLabel.split(',')[0]}</Link>
              ))}
            </div>
          )}
          {!focus.optIn ? (
            <ActionForm action={setMatching} className="grid gap-2 rounded-2xl bg-se-cream p-3 text-sm">
              <p>Travel matching is off for this trip, so nobody can see it.</p>
              <input type="hidden" name="planId" value={focus.id} /><input type="hidden" name="on" value="1" />
              <button className="se-pill justify-self-start bg-se-sage">Turn on matching</button>
            </ActionForm>
          ) : matches.length === 0 ? (
            <p className="rounded-2xl bg-se-cream p-3 text-sm">No one with a similar trip yet. We match students going to the same event or within 15 km, within 3 days of your date. Check back later!</p>
          ) : (
            <>
              {sameDest > 0 && <p className="rounded-2xl bg-se-sage/50 px-3 py-2 text-sm font-bold">🎉 {sameDest} student{sameDest === 1 ? ' is' : 's are'} also heading to {focus.eventTitle ?? focus.destLabel.split(',')[0]}</p>}
              <ul className="grid gap-3">
                {matches.map((m) => <MatchCard key={m.planId} m={m} fromPlanId={focus.id} />)}
              </ul>
            </>
          )}
        </>
      )}
      <p className="text-[11px] leading-snug text-se-charcoal/60">
        🔒 Only approximate areas are shown, never addresses. Demo identity: your browser cookie identifies you; there are no verified accounts yet, so don&apos;t share anything sensitive.
      </p>
    </section>
  );

  return (
    <div className="se-page max-w-[1400px]">
      <PageHeader emoji="🎒" title="Travel">Plan affordable trips, compare ways to get there, find students going your way, and fund it together.</PageHeader>
      {sp.saved === '1' && viewing && <p role="status" className="mb-4 rounded-2xl bg-se-sage/70 px-4 py-3 font-semibold">✅ Trip saved! {viewing.optIn ? 'Students with similar trips appear on the right.' : ''}</p>}
      {viewing && (
        <p className="mb-3 text-sm"><Link href="/travel?new=1" className="font-bold underline">＋ Plan a new trip</Link></p>
      )}
      <TravelPlanner
        key={viewing?.id ?? prefill?.id ?? 'new'}
        initial={initial}
        events={events}
        trips={markers}
        buddies={matches.map((m) => ({ lat: m.approxLat, lng: m.approxLng, label: `${m.name} · near ${m.originArea}` }))}
        demoEvent={demoEvent}
        rightSidebar={sidebar}
        viewingSaved={!!viewing}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section id="plan" className="grid content-start gap-3 lg:col-span-2" aria-labelledby="trips-h">
          <h2 id="trips-h" className="text-2xl font-extrabold">🧳 Your upcoming trips</h2>
          {plans.length === 0 ? (
            <p className="se-card p-5 text-se-charcoal/75">No trips yet. Search above, then save your trip to track costs, fund it, and find travel buddies.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">{plans.map((p) => <TripCard key={p.id} p={p} />)}</ul>
          )}
        </section>

        <section className="grid content-start gap-3" aria-labelledby="req-h">
          <h2 id="req-h" className="text-2xl font-extrabold">📨 Connections</h2>
          <div className="se-card grid gap-3 p-4">
            {incoming.length === 0 && accepted.length === 0 && <p className="text-sm text-se-charcoal/70">Connection requests and travel buddies show up here.</p>}
            {incoming.map((c) => (
              <div key={c.id} className="rounded-2xl bg-se-peach/40 p-3 text-sm">
                <p><strong>{c.name}</strong> wants to coordinate travel{c.tripLabel ? ` to ${c.tripLabel}` : ''}.</p>
                {c.note && <p className="mt-1 italic">“{c.note}”</p>}
                <div className="mt-2 flex gap-2">
                  {(['accepted', 'declined'] as const).map((d) => (
                    <ActionForm key={d} action={respondConnection} className="flex flex-wrap gap-2">
                      <input type="hidden" name="connectionId" value={c.id} /><input type="hidden" name="decision" value={d} />
                      <button className={`se-pill ${d === 'accepted' ? 'bg-se-sage' : 'bg-white'}`}>{d === 'accepted' ? 'Accept' : 'Decline'}</button>
                    </ActionForm>
                  ))}
                </div>
              </div>
            ))}
            {accepted.length > 0 && (
              <ul className="grid gap-1.5 text-sm">
                {accepted.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-2xl bg-se-cream px-3 py-2">
                    <span><strong>{c.name}</strong> {c.isSample && <SampleBadge />}</span>
                    <Link href={`/community/messages/${c.id}`} className="font-bold underline">💬 Chat</Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/community/messages" className="text-sm font-bold underline">Open Community messages →</Link>
          </div>
        </section>

        <section className="grid content-start gap-3 lg:col-span-3" aria-labelledby="carpool-h">
          <h2 id="carpool-h" className="text-2xl font-extrabold">🚗 Carpool groups</h2>
          <p className="-mt-2 text-sm text-se-charcoal/70">Planning and cost-splitting only. Sprout doesn&apos;t book rides, vet drivers, or charge anyone: settle shared costs among yourselves.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {carpools.map((g) => <CarpoolCard key={g.id} g={g} connections={accepted} />)}
            <ActionForm action={createCarpool} className="se-card grid content-start gap-3 border-dashed p-5">
              <h3 className="text-lg font-extrabold">＋ Start a carpool</h3>
              <label className="grid gap-1 text-sm font-bold">Name<input name="title" required minLength={3} maxLength={80} className="se-input" placeholder="East Bay to the hackathon" /></label>
              {plans.length > 0 && (
                <label className="grid gap-1 text-sm font-bold">For trip
                  <select name="planId" className="se-input" defaultValue={focus?.id}>
                    <option value="">No trip linked</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.destLabel.split(',')[0]} · {day(p.departDate)}</option>)}
                  </select>
                </label>
              )}
              <SplitFields defaultCost="" />
              <button className="se-button justify-self-start text-base">Create carpool</button>
            </ActionForm>
          </div>
        </section>
      </div>
    </div>
  );
}

function MatchCard({ m, fromPlanId }: { m: Match; fromPlanId: string }) {
  return (
    <li className="grid gap-2 rounded-2xl bg-se-cream p-3 ring-1 ring-se-charcoal/10">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-se-lavender text-lg font-extrabold">{m.name.charAt(0)}</span>
        <div className="min-w-0">
          <p className="truncate font-extrabold">{m.name} {m.isSample && <SampleBadge />}</p>
          <p className="truncate text-xs text-se-charcoal/70">{[m.school, `near ${m.originArea}`].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <p className="text-xs font-semibold">{day(m.departDate)} · {m.departWindow} · {MODE_LABEL[m.mode] ?? m.mode}</p>
      <ul className="text-xs text-se-charcoal/80">
        {m.reasons.map((r) => <li key={r}>✓ {r}</li>)}
      </ul>
      {m.connection.status === 'none' && (
        <ActionForm action={requestConnection} className="grid gap-1.5">
          <input type="hidden" name="fromPlanId" value={fromPlanId} /><input type="hidden" name="toPlanId" value={m.planId} />
          <input name="note" maxLength={280} className="se-input py-1.5 text-sm" placeholder="Say hi (optional)" />
          <button className="se-pill justify-self-start bg-se-sky hover:bg-se-sky/70">🤝 Connect</button>
        </ActionForm>
      )}
      {m.connection.status === 'sent' && <p className="text-xs font-bold">⏳ Request sent</p>}
      {m.connection.status === 'received' && <p className="text-xs font-bold">📨 They asked to connect: answer under Connections below</p>}
      {m.connection.status === 'accepted' && m.connection.id && <Link href={`/community/messages/${m.connection.id}`} className="se-pill justify-self-start bg-se-sage">💬 Connected · Chat</Link>}
    </li>
  );
}

function TripCard({ p }: { p: MyPlan }) {
  const est = p.estCostCents;
  const goalHref = `/goals/new?${new URLSearchParams({
    title: `Trip to ${p.eventTitle ?? p.destLabel.split(',')[0]}`.slice(0, 80),
    target: est ? String(Math.min(10_000, Math.max(1, Math.ceil(est / 100)))) : '',
    description: `Travel costs for my trip to ${p.destLabel} on ${p.departDate}.`.slice(0, 500),
    kind: 'travel',
    plan: p.id,
  })}`;
  return (
    <li className="se-card grid content-start gap-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold">📍 {p.destLabel}</h3>
          <p className="text-xs text-se-charcoal/70">From ~{p.originArea} · {day(p.departDate)}{p.returnDate ? ` → ${day(p.returnDate)}` : ''} · {MODE_LABEL[p.mode]}</p>
          {p.eventTitle && <p className="text-xs font-bold">🎪 {p.eventTitle}</p>}
        </div>
        <Link href={`/travel?plan=${p.id}`} className="se-pill shrink-0 bg-se-sky/50 text-xs">🗺️ Map</Link>
      </div>
      <p className="text-sm">
        Estimated cost <strong>{est != null ? money(est) : '—'}</strong>
        {p.budgetCents != null && <> · Budget <strong>{money(p.budgetCents)}</strong></>}
        {est != null && p.budgetCents != null && (
          <span className={`ml-1 font-bold ${est <= p.budgetCents ? 'text-se-sage-dark' : 'text-[#b5452f]'}`}>{est <= p.budgetCents ? '✅ within budget' : `⚠️ ${money(est - p.budgetCents)} over`}</span>
        )}
      </p>
      {p.goal ? (
        <div className="rounded-2xl bg-se-cream p-3">
          <Link href={`/goals/${p.goal.id}`} className="text-sm font-bold underline">🎯 {p.goal.title}</Link>
          <GoalProgress saved={p.goal.savedCents} target={p.goal.targetCents} />
          {est != null && (
            <p className="mt-1 text-xs text-se-charcoal/70">
              {p.goal.savedCents >= est ? '🎉 Verified contributions cover the estimated trip cost.' : `${money(est - p.goal.savedCents)} to go to cover the estimated trip cost.`} Only PayPal-verified contributions count.
            </p>
          )}
        </div>
      ) : (
        <Link href={goalHref} className="se-pill justify-self-start bg-se-sage">🎯 Create a travel funding goal</Link>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ActionForm action={setMatching} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="planId" value={p.id} /><input type="hidden" name="on" value={p.optIn ? '0' : '1'} />
          <button className="font-bold underline">{p.optIn ? '🙈 Turn off matching' : '👋 Turn on matching'}</button>
        </ActionForm>
        <ActionForm action={deletePlan} confirm="Remove this trip? Your funding goal (if any) stays." className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="planId" value={p.id} />
          <button className="font-bold text-[#b5452f] underline">Remove trip</button>
        </ActionForm>
      </div>
    </li>
  );
}

function CarpoolCard({ g, connections }: { g: Carpool; connections: Connection[] }) {
  const joined = g.members.filter((m) => m.status === 'joined');
  const people = 1 + joined.length;
  const each = Math.ceil(g.sharedCostCents / people);
  const full = Math.ceil(g.sharedCostCents / (g.seats + 1));
  const invited = g.myStatus === 'invited';
  return (
    <article className="se-card grid content-start gap-2 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold">🚗 {g.title}</h3>
        {g.isSample && <SampleBadge />}
        {g.isOwner && <span className="rounded-full bg-se-peach px-2 py-0.5 text-xs font-bold">Organizer</span>}
      </div>
      <p className="text-xs text-se-charcoal/70">Organized by {g.isOwner ? 'you' : g.owner}{g.destLabel ? ` · to ${g.destLabel.split(',')[0]}` : ''}{g.departDate ? ` · ${day(g.departDate)}` : ''}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 rounded-2xl bg-se-sky/25 p-3 text-sm">
        <dt>Shared cost (estimate)</dt><dd className="text-right font-bold">{money(g.sharedCostCents)}</dd>
        <dt>Students so far</dt><dd className="text-right font-bold">{people} of {g.seats + 1}</dd>
        <dt className="font-extrabold">Each pays now</dt><dd className="text-right font-extrabold">{money(each)}</dd>
        <dt>If every seat fills</dt><dd className="text-right font-bold">{money(full)} each</dd>
        <dt>Savings per rider vs. alone</dt><dd className="text-right font-bold text-se-sage-dark">{money(g.sharedCostCents - each)}</dd>
      </dl>
      <p className="text-sm">👥 {[g.isOwner ? 'You' : g.owner, ...g.members.map((m) => `${m.name}${m.status === 'invited' ? ' (invited)' : ''}`)].join(', ')}</p>
      {invited && (
        <div className="flex gap-2">
          {(['joined', 'declined'] as const).map((d) => (
            <ActionForm key={d} action={respondCarpool} className="flex flex-wrap gap-2">
              <input type="hidden" name="groupId" value={g.id} /><input type="hidden" name="decision" value={d} />
              <button className={`se-pill ${d === 'joined' ? 'bg-se-sage' : 'bg-white'}`}>{d === 'joined' ? 'Join carpool' : 'Decline'}</button>
            </ActionForm>
          ))}
        </div>
      )}
      {g.myStatus === 'joined' && !g.isOwner && (
        <ActionForm action={respondCarpool} className="flex flex-wrap gap-2">
          <input type="hidden" name="groupId" value={g.id} /><input type="hidden" name="decision" value="declined" />
          <button className="text-xs font-bold underline">Leave carpool</button>
        </ActionForm>
      )}
      {g.isOwner && (
        connections.length === 0 ? (
          <p className="text-xs text-se-charcoal/70">Connect with matched students to invite them.</p>
        ) : (
          <ActionForm action={inviteToCarpool} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="groupId" value={g.id} />
            <label className="grid flex-1 gap-1 text-xs font-bold">Invite a connection
              <select name="connectionId" className="se-input py-1.5 text-sm">
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="se-pill bg-se-sky">Invite</button>
          </ActionForm>
        )
      )}
      {g.isOwner && !g.isSample && (
        <ActionForm action={respondCarpool} confirm="Remove this carpool group?" className="flex flex-wrap gap-2">
          <input type="hidden" name="groupId" value={g.id} /><input type="hidden" name="decision" value="delete" />
          <button className="text-xs font-bold text-[#b5452f] underline">Remove carpool</button>
        </ActionForm>
      )}
    </article>
  );
}
