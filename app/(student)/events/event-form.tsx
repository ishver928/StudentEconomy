'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import type { EventFormState } from './actions';

export type EventDefaults = {
  id?: string;
  title: string;
  clubName: string;
  description: string;
  school: string;
  location: string;
  startsAtIso: string; // '' for new events
  category: string;
  budget: string;
  lat: string;
  lng: string;
  goal: { target: string; purpose: string; savedCents: number } | null;
};

type GeoResult = { label: string; lat: number; lng: number };

// 'YYYY-MM-DDTHH:mm' in the browser's own time zone, for <input type="datetime-local">.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({
  action, defaults, categories, submitLabel,
}: {
  action: (prev: EventFormState, form: FormData) => Promise<EventFormState>;
  defaults: EventDefaults;
  categories: readonly string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(action, {});
  const hasGoal = !!defaults.goal;
  const [withGoal, setWithGoal] = useState(hasGoal);
  const [location, setLocation] = useState(defaults.location);
  const [coords, setCoords] = useState({ lat: defaults.lat, lng: defaults.lng });
  const [geo, setGeo] = useState<{ busy: boolean; results: GeoResult[]; error: string }>({ busy: false, results: [], error: '' });
  const when = useRef<HTMLInputElement>(null);

  // Set the date after mount so it uses the browser's time zone (avoids a hydration mismatch).
  useEffect(() => {
    if (when.current && defaults.startsAtIso) when.current.value = toLocalInput(defaults.startsAtIso);
  }, [defaults.startsAtIso]);

  // The browser knows its own time zone, so it sends the event time as an unambiguous instant.
  function submit(form: FormData) {
    const local = String(form.get('startsLocal') ?? '');
    const d = new Date(local);
    form.set('startsAt', local && !Number.isNaN(d.getTime()) ? d.toISOString() : '');
    formAction(form);
  }

  async function findOnMap() {
    if (location.trim().length < 3) return setGeo({ busy: false, results: [], error: 'Type a location first.' });
    setGeo({ busy: true, results: [], error: '' });
    try {
      const res = await fetch(`/api/travel/geocode?q=${encodeURIComponent(location.trim())}`);
      const body = (await res.json()) as { results?: GeoResult[]; error?: string };
      setGeo({ busy: false, results: body.results ?? [], error: body.error ?? (body.results?.length ? '' : 'No places found. Try adding the city.') });
    } catch {
      setGeo({ busy: false, results: [], error: 'Map search is unavailable right now. You can still save the event.' });
    }
  }

  return (
    <form action={submit} className="se-card grid gap-4 p-6">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="lat" value={coords.lat} />
      <input type="hidden" name="lng" value={coords.lng} />
      <label className="grid gap-1 font-bold">
        Event name
        <input name="title" required minLength={3} maxLength={80} defaultValue={defaults.title} className="se-input" placeholder="e.g. Spring Hack Night" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 font-bold">
          Club or organization
          <input name="clubName" required minLength={2} maxLength={60} defaultValue={defaults.clubName} className="se-input" placeholder="e.g. Coding Club" />
        </label>
        <label className="grid gap-1 font-bold">
          College <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span>
          <input name="school" maxLength={120} defaultValue={defaults.school} className="se-input" />
        </label>
      </div>
      <label className="grid gap-1 font-bold">
        Description <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span>
        <textarea name="description" maxLength={1000} rows={3} defaultValue={defaults.description} className="se-input" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 font-bold">
          Date and time
          <input ref={when} name="startsLocal" type="datetime-local" required className="se-input" />
        </label>
        <label className="grid gap-1 font-bold">
          Category
          <select name="category" required defaultValue={defaults.category || ''} className="se-input">
            <option value="" disabled>Choose one</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-1">
        <label htmlFor="location" className="font-bold">Location <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span></label>
        <div className="flex flex-wrap gap-2">
          <input
            id="location" name="location" maxLength={140} value={location} className="se-input min-w-0 flex-1"
            placeholder="e.g. Student Union, Room 204"
            onChange={(e) => { setLocation(e.target.value); setCoords({ lat: '', lng: '' }); }}
          />
          <button type="button" onClick={findOnMap} disabled={geo.busy} className="se-pill bg-se-sky/40 hover:bg-se-sky/70">
            {geo.busy ? 'Searching…' : '📍 Find on map'}
          </button>
        </div>
        <p className="text-xs text-se-charcoal/60">
          {coords.lat ? '✅ Pinned on the map, so students can plan travel to it.' : 'Pin it on the map (optional) so students can plan travel to your event.'}
        </p>
        {geo.error && <p className="text-sm font-semibold text-[#b5452f]">{geo.error}</p>}
        {geo.results.length > 0 && (
          <ul className="grid gap-1 rounded-2xl bg-se-cream p-2 text-sm">
            {geo.results.map((r) => (
              <li key={`${r.lat},${r.lng}`}>
                <button
                  type="button" className="w-full rounded-xl px-2 py-1 text-left hover:bg-se-sky/40"
                  onClick={() => { setCoords({ lat: String(r.lat), lng: String(r.lng) }); setGeo({ busy: false, results: [], error: '' }); }}
                >
                  📍 {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="grid gap-1 font-bold sm:max-w-xs">
        Estimated event budget ($) <span className="text-sm font-semibold text-se-charcoal/60">(optional)</span>
        <input name="budget" inputMode="decimal" pattern="\d{1,6}(\.\d{1,2})?" defaultValue={defaults.budget} className="se-input" placeholder="500" />
      </label>

      <fieldset className="grid gap-3 rounded-2xl border-2 border-dashed border-se-sage bg-se-sage/15 p-4">
        <label className="flex items-center gap-2 font-extrabold">
          <input type="checkbox" name="withGoal" checked={withGoal} disabled={hasGoal} onChange={(e) => setWithGoal(e.target.checked)} className="size-5" />
          🎯 {hasGoal ? 'Funding goal for this event' : 'Create a funding goal for this event'}
        </label>
        {/* A disabled checkbox isn't submitted, so keep an existing goal switched on explicitly. */}
        {hasGoal && <input type="hidden" name="withGoal" value="on" />}
        {withGoal && (
          <>
            <label className="grid gap-1 font-bold sm:max-w-xs">
              Funding target ($)
              <input
                name="goalTarget" required inputMode="decimal" pattern="\d{1,6}(\.\d{1,2})?" defaultValue={defaults.goal?.target ?? ''}
                className="se-input" placeholder="300"
              />
            </label>
            <label className="grid gap-1 font-bold">
              What will the money be used for?
              <textarea name="goalPurpose" required minLength={10} maxLength={500} rows={2} defaultValue={defaults.goal?.purpose ?? ''} className="se-input" placeholder="e.g. Pizza for 60 attendees and printing posters" />
            </label>
            <p className="text-xs text-se-charcoal/70">
              Classmates contribute through the existing Funding Goals page with PayPal Sandbox (no real money). Progress only updates after PayPal confirms each payment.
              {hasGoal && ' The target can’t go below what has already been raised.'}
            </p>
          </>
        )}
      </fieldset>

      {state.error && <p role="alert" className="rounded-2xl bg-[#ffb3a7]/70 px-4 py-2 font-semibold">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="se-button" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        <p className="text-xs text-se-charcoal/60">Demo identity: your browser cookie identifies you; there are no real accounts yet.</p>
      </div>
    </form>
  );
}
