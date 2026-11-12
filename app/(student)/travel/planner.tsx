'use client';
import { useActionState, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dealsFor } from '@/lib/travel-deals';
import { estimateOptions, fmtMinutes, ASSUMPTIONS, type DemoTransit, type Place, type Route, type TravelOption } from '@/lib/travel';
import { savePlan, type ActionState } from './actions';
import { TravelMap, type MapData } from './travel-map';

type MapEvent = { id: string; title: string; location: string | null; lat: number; lng: number; startsAt: string; isSample: boolean };
type Station = { lat: number; lng: number; name: string; kind: string };
export type PlannerInitial = {
  origin: Place | null; originExact: boolean; dest: Place | null; date: string; returnDate: string; window: string; mode: string;
  budget: string; eventId: string | null; eventTitle: string | null; demo: boolean;
};

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: c % 100 ? 2 : 0 });
const WINDOWS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['flexible', 'Flexible']];
const MODES = [['either', 'Either'], ['carpool', 'Carpool'], ['transit', 'Public transit']];

// The demo scenario: a fictional student near a Bay Area campus. Real coordinates, sample costs.
const DEMO_ORIGIN: Place = { label: 'Berkeley, CA (fictional student near campus)', area: 'Berkeley, CA', lat: 37.8716, lng: -122.2727 };
const DEMO_TRANSIT: DemoTransit = {
  costCents: 520,
  transfers: '1 transfer (sample)',
  driveExtrasCents: 2800,
  driveExtrasNote: 'Includes a sample bridge toll ($8) and event parking ($20): demo data, not real prices',
  details: ['Sample route: BART from Downtown Berkeley toward San Francisco, then a Muni bus toward the venue', 'Sample fare for illustration only. Check BART and Muni for real fares and times.'],
};

async function search(q: string): Promise<Place[]> {
  const res = await fetch(`/api/travel/geocode?q=${encodeURIComponent(q)}`);
  const body = (await res.json().catch(() => ({}))) as { results?: Place[]; error?: string };
  if (!res.ok) throw new Error(body.error || 'Place search is unavailable right now.');
  return body.results ?? [];
}

export function TravelPlanner({ initial, events, trips, buddies, demoEvent, rightSidebar, viewingSaved }: {
  initial: PlannerInitial;
  events: MapEvent[];
  trips: MapData['trips'];
  buddies: MapData['buddies'];
  demoEvent: MapEvent | null;
  rightSidebar: ReactNode;
  viewingSaved: boolean;
}) {
  const [originQ, setOriginQ] = useState(initial.origin?.area ?? '');
  const [destQ, setDestQ] = useState(initial.dest?.label ?? '');
  const [origin, setOrigin] = useState<Place | null>(initial.origin);
  const [originExact, setOriginExact] = useState(initial.originExact);
  const [dest, setDest] = useState<Place | null>(initial.dest);
  const [originChoices, setOriginChoices] = useState<Place[]>([]);
  const [destChoices, setDestChoices] = useState<Place[]>([]);
  const [date, setDate] = useState(initial.date);
  const [returnDate, setReturnDate] = useState(initial.returnDate);
  const [window_, setWindow] = useState(initial.window);
  const [mode, setMode] = useState(initial.mode);
  const [budget, setBudget] = useState(initial.budget);
  const [eventId, setEventId] = useState(initial.eventId);
  const [eventTitle, setEventTitle] = useState(initial.eventTitle);
  const [demo, setDemo] = useState(initial.demo);
  const [route, setRoute] = useState<Route | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationNote, setStationNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [riders, setRiders] = useState(ASSUMPTIONS.carpoolRiders);
  const [chosen, setChosen] = useState<TravelOption['kind']>('carpool');
  const [sortBy, setSortBy] = useState<'cost' | 'time'>('cost');
  const [saveState, save, saving] = useActionState<ActionState, FormData>(savePlan, {});

  // Route + nearby stations whenever both ends are known.
  useEffect(() => {
    if (!origin || !dest) return;
    let stale = false;
    const ctrl = new AbortController();
    fetch(`/api/travel/route?from=${origin.lat},${origin.lng}&to=${dest.lat},${dest.lng}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((b: { route?: Route }) => { if (!stale && b.route) setRoute(b.route); })
      .catch(() => {});
    fetch(`/api/travel/stations?lat=${dest.lat}&lng=${dest.lng}`, { signal: ctrl.signal })
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as { stations?: Station[] } }))
      .then(({ ok, body }) => {
        if (stale) return;
        setStations(body.stations ?? []);
        setStationNote(!ok ? 'Transit station data is unavailable right now.' : body.stations?.length ? '' : 'No transit stations found within 1.5 km of the destination in OpenStreetMap.');
      })
      .catch(() => { if (!stale) setStationNote('Transit station data is unavailable right now.'); });
    return () => { stale = true; ctrl.abort(); };
  }, [origin, dest]);

  const options = useMemo(() => {
    if (!origin || !dest || !route) return [];
    const list = estimateOptions(origin, dest, route, riders, demo ? DEMO_TRANSIT : undefined);
    return [...list].sort((a, b) => (sortBy === 'time' ? a.minutes - b.minutes : (a.costCents ?? Infinity) - (b.costCents ?? Infinity)));
  }, [origin, dest, route, riders, demo, sortBy]);
  const pickedOption = options.find((o) => o.kind === chosen) ?? options.find((o) => o.costCents !== null);
  const trips_ = returnDate ? 2 : 1;
  const estCost = pickedOption?.costCents != null ? pickedOption.costCents * trips_ : null;
  const budgetCents = /^\d{1,5}(\.\d{1,2})?$/.test(budget) ? Math.round(Number(budget) * 100) : null;
  const deals = useMemo(() => dealsFor([origin, dest].filter((p): p is Place => !!p)), [origin, dest]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (originQ.trim().length < 3 || destQ.trim().length < 3) return setError('Enter a starting point and a destination (at least 3 characters each).');
    setBusy(true);
    try {
      // Sequential on purpose: the free geocoder allows one request per second.
      const o = originQ.trim() === origin?.area || originQ.trim() === origin?.label ? [origin!] : await search(originQ);
      const d = destQ.trim() === dest?.label ? [dest!] : await search(destQ);
      if (!o.length) throw new Error(`We couldn't find "${originQ}". Try a city or neighborhood.`);
      if (!d.length) throw new Error(`We couldn't find "${destQ}". Try a venue name plus city.`);
      if (o[0] !== origin) { setOrigin(o[0]); setOriginExact(true); }
      if (d[0] !== dest) { setDest(d[0]); setEventId(null); setEventTitle(null); }
      setOriginChoices(o.length > 1 ? o : []);
      setDestChoices(d.length > 1 ? d : []);
      setRoute(null);
      setDemo(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function pickEvent(id: string) {
    const ev = events.find((x) => x.id === id) ?? (demoEvent?.id === id ? demoEvent : null);
    if (!ev) return;
    setDest({ label: ev.location ? `${ev.location}` : ev.title, area: ev.location ?? ev.title, lat: ev.lat, lng: ev.lng });
    setDestQ(ev.location ?? ev.title);
    setEventId(ev.id);
    setEventTitle(ev.title);
    setDate(ev.startsAt.slice(0, 10));
    setDestChoices([]);
    setRoute(null);
  }

  function runDemo() {
    if (!demoEvent) return;
    setOrigin(DEMO_ORIGIN);
    setOriginQ(DEMO_ORIGIN.area);
    setOriginExact(true);
    setOriginChoices([]);
    pickEvent(demoEvent.id);
    setMode('carpool');
    setBudget('60');
    setDemo(true);
    setError('');
  }

  const mapData: MapData = useMemo(() => ({
    origin: origin ? { lat: origin.lat, lng: origin.lng, label: originExact ? origin.label : origin.area } : null,
    originExact,
    dest: dest ? { lat: dest.lat, lng: dest.lng, label: dest.label } : null,
    line: route?.line ?? null,
    lineIsEstimate: route?.source !== 'osrm',
    stations,
    events: [...events, ...(demoEvent && !events.some((e) => e.id === demoEvent.id) ? [demoEvent] : [])].map((e) => ({
      id: e.id, lat: e.lat, lng: e.lng, title: e.title, isSample: e.isSample,
      sub: `${new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}${e.location ? ` · ${e.location}` : ''}`,
    })),
    trips,
    buddies,
  }), [origin, originExact, dest, route, stations, events, demoEvent, trips, buddies]);

  return (
    <div className="grid gap-4">
      {/* Top: where are we going? */}
      <form onSubmit={onSearch} className="se-card grid gap-3 bg-gradient-to-br from-white to-se-sky/25 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">🧭 Where are we going?</h2>
          {demoEvent && (
            <button type="button" onClick={runDemo} className="se-pill bg-se-lavender hover:bg-se-lavender/70">✨ Try the demo: Bay Area → SF hackathon</button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-sm font-bold">
            Starting from
            <input className="se-input" value={originQ} onChange={(e) => setOriginQ(e.target.value)} placeholder="City or neighborhood, e.g. Oakland, CA" maxLength={120} autoComplete="off" />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Going to
            <input className="se-input" value={destQ} onChange={(e) => setDestQ(e.target.value)} placeholder="Venue or city, e.g. Fort Mason Center, San Francisco" maxLength={120} autoComplete="off" />
          </label>
          <button className="se-button self-end text-base" disabled={busy}>{busy ? 'Searching…' : '🔍 Find routes'}</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className="grid gap-1 text-sm font-bold">Leave on<input type="date" className="se-input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-bold">Return <span className="sr-only">(optional)</span><input type="date" className="se-input" value={returnDate} min={date} onChange={(e) => setReturnDate(e.target.value)} /></label>
          <label className="grid gap-1 text-sm font-bold">Time<select className="se-input" value={window_} onChange={(e) => setWindow(e.target.value)}>{WINDOWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Travel style<select className="se-input" value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-bold">Budget ($)<input inputMode="decimal" className="se-input" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="50" maxLength={8} /></label>
        </div>
        {(originChoices.length > 0 || destChoices.length > 0) && (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {originChoices.length > 0 && (
              <label className="grid gap-1 font-semibold">Did you mean (start)?
                <select className="se-input" value={originChoices.indexOf(origin!)} onChange={(e) => { setOrigin(originChoices[Number(e.target.value)]); setRoute(null); }}>
                  {originChoices.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                </select>
              </label>
            )}
            {destChoices.length > 0 && (
              <label className="grid gap-1 font-semibold">Did you mean (destination)?
                <select className="se-input" value={destChoices.indexOf(dest!)} onChange={(e) => { setDest(destChoices[Number(e.target.value)]); setRoute(null); }}>
                  {destChoices.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        {error && <p role="alert" className="rounded-2xl bg-[#ffb3a7]/70 px-4 py-2 text-sm font-semibold">{error}</p>}
        {demo && (
          <p className="rounded-2xl border-2 border-dashed border-se-lavender bg-white/70 px-4 py-2 text-sm font-semibold">
            🧪 Demo scenario: a fictional student near a Bay Area campus heading to a fictional hackathon at a real San Francisco venue. Map locations are real; students, the event, and transit fares are sample data.
          </p>
        )}
        {viewingSaved && !demo && (
          <p className="text-xs text-se-charcoal/60">Showing your saved trip. Your starting point is shown as an approximate area, the same way other students see it.</p>
        )}
      </form>

      {/* Three columns: options | map | students */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)_minmax(260px,1fr)]">
        <aside className="order-2 grid content-start gap-4 lg:order-1" aria-label="Transportation options">
          <section className="se-card grid gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold">🚦 Ways to get there</h2>
              {options.length > 0 && (
                <div className="flex rounded-full bg-se-cream p-0.5 text-xs font-bold" role="group" aria-label="Sort options">
                  {(['cost', 'time'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setSortBy(s)} aria-pressed={sortBy === s} className={`rounded-full px-2.5 py-1 ${sortBy === s ? 'bg-se-charcoal text-se-cream' : ''}`}>{s === 'cost' ? 'Cheapest' : 'Fastest'}</button>
                  ))}
                </div>
              )}
            </div>
            {!origin || !dest ? (
              <p className="text-sm text-se-charcoal/70">Search a start and destination, or tap an event 🎪 on the map, to compare options.</p>
            ) : !route ? (
              <p className="animate-pulse text-sm font-semibold">Comparing routes…</p>
            ) : (
              <>
                <ul className="grid gap-2">
                  {options.map((o) => (
                    <li key={o.kind}>
                      <label className={`block cursor-pointer rounded-2xl border-2 p-3 transition-colors ${chosen === o.kind ? 'border-se-sky-dark bg-se-sky/25' : 'border-se-charcoal/10 bg-se-cream hover:bg-se-sky/15'}`}>
                        <input type="radio" name="option" className="sr-only" checked={chosen === o.kind} onChange={() => setChosen(o.kind)} />
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-extrabold">{o.emoji} {o.label}</span>
                          <span className="text-right font-extrabold tabular-nums">{o.costCents === null ? 'Fare varies' : o.costCents === 0 ? 'Free' : usd(o.costCents)}</span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-semibold text-se-charcoal/70">
                          <span>⏱️ ~{fmtMinutes(o.minutes)}</span>
                          {o.transfers && <span>🔁 {o.transfers}</span>}
                          {!!o.savingsCents && o.savingsCents > 0 && <span className="rounded-full bg-se-sage/70 px-2">Save {usd(o.savingsCents)}</span>}
                          {o.demo && <span className="rounded-full bg-se-lavender px-2">Demo data</span>}
                        </span>
                        <span className="mt-1 block text-xs text-se-charcoal/70">{o.costNote}</span>
                        {chosen === o.kind && (
                          <span className="mt-1 block text-xs">
                            {o.details.map((d, i) => <span key={i} className="block">• {d}</span>)}
                            {o.kind === 'carpool' && (
                              <span className="mt-1 flex items-center gap-2 font-semibold">
                                Riders
                                <input type="range" min={2} max={7} value={riders} onChange={(e) => setRiders(Number(e.target.value))} aria-label="Number of riders" />
                                {riders}
                              </span>
                            )}
                            {o.link && <a href={o.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-bold underline">{o.link.label} ↗</a>}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] leading-snug text-se-charcoal/60">
                  Estimates, not quotes. {route.source === 'osrm' ? 'Drive time from a routing service.' : 'No routing service configured, so distances and times are estimated from a straight line (dashed on the map).'} Fuel at ${(ASSUMPTIONS.fuelPerMileCents / 100).toFixed(2)}/mi. No live schedules are shown: use the trip planner links for real times.
                </p>
              </>
            )}
          </section>

          {deals.length > 0 && (
            <section className="se-card grid gap-2 p-4" aria-labelledby="deals-h">
              <h2 id="deals-h" className="text-lg font-extrabold">🎟️ Student Travel Deals</h2>
              <ul className="grid gap-2">
                {deals.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-se-cream p-3 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5 font-extrabold">
                      {d.title}
                      {d.verified
                        ? <span className="rounded-full bg-se-sage px-2 py-0.5 text-[10px] font-bold uppercase">✓ Verified on official site</span>
                        : <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase">Tip · not verified</span>}
                    </p>
                    <p className="text-xs font-bold text-se-charcoal/70">{d.provider} · {d.eligibility}</p>
                    <p className="mt-1 text-xs">{d.detail}</p>
                    <p className="mt-1 text-[11px] text-se-charcoal/60">
                      {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">Official page ↗</a>}
                      {d.checkedOn && ` · Checked ${d.checkedOn}. Confirm terms before buying.`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <section className="order-1 grid content-start gap-3 lg:order-2" aria-label="Map">
          <div className="h-[460px] lg:h-[620px]">
            <TravelMap data={mapData} onPickEvent={pickEvent} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white px-2.5 py-1">📍 Destination</span>
            <span className="rounded-full bg-white px-2.5 py-1">🏠 Your start</span>
            <span className="rounded-full bg-white px-2.5 py-1">🎪 Events</span>
            <span className="rounded-full bg-white px-2.5 py-1">🎒 Students heading there</span>
            <span className="rounded-full bg-white px-2.5 py-1">🟢 Approximate areas</span>
            <span className="rounded-full bg-white px-2.5 py-1">🔵 Transit stations</span>
          </div>
          {stationNote && dest && <p className="text-xs text-se-charcoal/60">{stationNote}</p>}

          {origin && dest && !viewingSaved && (
            <form action={save} id="save" className="se-card grid gap-3 p-4">
              <h2 className="text-lg font-extrabold">💾 Save this trip</h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>🧾 Estimated trip cost: <strong>{estCost === null ? '—' : usd(estCost)}</strong> <span className="text-xs text-se-charcoal/60">({pickedOption?.label ?? 'choose an option'}{trips_ === 2 ? ', round trip' : ''}, estimate)</span></span>
                {budgetCents !== null && estCost !== null && (
                  <span className={`font-bold ${estCost <= budgetCents ? 'text-se-sage-dark' : 'text-[#b5452f]'}`}>
                    {estCost <= budgetCents ? `✅ ${usd(budgetCents - estCost)} under your budget` : `⚠️ ${usd(estCost - budgetCents)} over your budget`}
                  </span>
                )}
              </div>
              {[
                ['originLat', origin.lat], ['originLng', origin.lng], ['originArea', origin.area], ['destLabel', dest.label], ['destLat', dest.lat], ['destLng', dest.lng],
                ['departDate', date], ['returnDate', returnDate], ['departWindow', window_], ['mode', mode], ['budget', budget], ['estCostCents', estCost ?? ''], ['eventId', eventId ?? ''],
              ].map(([n, v]) => <input key={n as string} type="hidden" name={n as string} value={String(v)} />)}
              {eventTitle && <p className="text-sm">🎪 Linked event: <strong>{eventTitle}</strong></p>}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="optIn" defaultChecked className="mt-1 size-4" />
                <span>
                  <strong>Find students going my way.</strong> Other students can see my first name, college, approximate starting area ({origin.area}), destination, date and travel style. My exact address is never saved or shown.
                </span>
              </label>
              <button className="se-button justify-self-start text-base" disabled={saving}>{saving ? 'Saving…' : 'Save trip & find travel buddies'}</button>
              {saveState.error && <p role="alert" className="text-sm font-semibold text-[#b5452f]">{saveState.error}</p>}
            </form>
          )}
        </section>

        <aside className="order-3 grid content-start gap-4" aria-label="Students going your way">{rightSidebar}</aside>
      </div>
    </div>
  );
}
