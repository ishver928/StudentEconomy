'use client';
import { useState } from 'react';

const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Create-carpool fields with a live cost-split preview. */
export function SplitFields({ defaultCost }: { defaultCost: string }) {
  const [cost, setCost] = useState(defaultCost);
  const [seats, setSeats] = useState(3);
  const cents = /^\d{1,4}(\.\d{1,2})?$/.test(cost) ? Math.round(Number(cost) * 100) : null;
  const people = seats + 1; // you plus the seats you're offering
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm font-bold">
          Shared cost ($)
          <input name="sharedCost" required inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" value={cost} onChange={(e) => setCost(e.target.value)} className="se-input" placeholder="40" />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Seats for others
          <input name="seats" type="number" min={1} max={7} value={seats} onChange={(e) => setSeats(Math.min(7, Math.max(1, Number(e.target.value) || 1)))} className="se-input" />
        </label>
      </div>
      {cents !== null && (
        <p className="rounded-2xl bg-se-sky/30 px-3 py-2 text-sm">
          🧮 Total {usd(cents)} · {people} students · <strong>{usd(Math.ceil(cents / people))} each</strong> when full
          <span className="block text-xs text-se-charcoal/70">Each rider saves about {usd(cents - Math.ceil(cents / people))} compared with covering it alone (estimate).</span>
        </p>
      )}
    </>
  );
}
