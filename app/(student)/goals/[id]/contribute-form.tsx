'use client';
// Posts goalId + amount to /api/contribute; the server validates the amount and talks to PayPal.
import { useEffect, useState } from 'react';

export function ContributeForm({ goalId, suggested }: { goalId: string; suggested: number[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState(String(suggested[0] ?? 10));

  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setSubmitting(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <form
      method="post"
      action="/api/contribute"
      className="grid gap-3"
      onSubmit={(e) => {
        if (submitting) e.preventDefault();
        else setSubmitting(true);
      }}
    >
      <input type="hidden" name="goalId" value={goalId} />
      <div className="flex flex-wrap gap-2">
        {suggested.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAmount(String(v))}
            className={`se-pill ${amount === String(v) ? 'bg-se-charcoal text-se-cream' : 'bg-se-cream'}`}
          >
            ${v}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 font-bold">
        Amount ($)
        <input
          name="amount"
          required
          inputMode="decimal"
          pattern="\d{1,6}(\.\d{1,2})?"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="se-input w-32"
        />
      </label>
      <button type="submit" className="se-button justify-self-start" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Opening PayPal…' : 'Contribute with PayPal'}
      </button>
    </form>
  );
}
