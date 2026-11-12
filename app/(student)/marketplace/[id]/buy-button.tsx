'use client';
// Posts only the listing id to /api/checkout; the server computes the price.
import { useEffect, useState } from 'react';

export function BuyButton({ listingId }: { listingId: string }) {
  const [submitting, setSubmitting] = useState(false);

  // Coming back from PayPal via the browser's Back button may restore a disabled button.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setSubmitting(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  return (
    <form
      method="post"
      action="/api/checkout"
      onSubmit={(e) => {
        if (submitting) e.preventDefault();
        else setSubmitting(true);
      }}
    >
      <input type="hidden" name="listingId" value={listingId} />
      <button type="submit" className="se-button w-full sm:w-auto" disabled={submitting} aria-busy={submitting}>
        {submitting ? 'Opening PayPal…' : 'Buy with PayPal'}
      </button>
    </form>
  );
}
