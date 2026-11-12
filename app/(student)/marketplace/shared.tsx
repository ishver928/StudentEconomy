// Marketplace helpers shared by the listing, detail and confirmation pages.
export const PICKUP_LABELS: Record<string, string> = {
  campus_pickup: 'Campus pickup',
  meetup: 'Meet up in public',
  dorm_dropoff: 'Dorm drop-off',
};
export const pickupLabel = (p: string | null) => (p ? PICKUP_LABELS[p] ?? p : 'Ask the seller');

export function FictionalBadge({ label = 'Fictional sample listing' }: { label?: string }) {
  return <span className="inline-block rounded-full bg-se-lavender px-2.5 py-0.5 text-xs font-bold">{label}</span>;
}

export function AvailabilityBadge({ status }: { status: string }) {
  const available = status === 'available';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${available ? 'bg-se-sage' : 'bg-se-charcoal/15'}`}>
      {available ? 'Available' : status === 'sold' ? 'Sold' : 'Unavailable'}
    </span>
  );
}

const MESSAGES: Record<string, { tone: 'ok' | 'warn' | 'bad'; text: string; retry?: boolean }> = {
  cancelled: { tone: 'ok', text: 'No worries, you cancelled the checkout and were not charged.' },
  declined: { tone: 'bad', text: 'PayPal declined the payment, so no purchase was recorded. You can try again with another payment method.' },
  payment_pending: { tone: 'warn', text: 'PayPal is still processing this payment. It is not recorded as a purchase yet. Check again later.', retry: true },
  uncertain: { tone: 'warn', text: "We couldn't confirm the payment status with PayPal yet. Check again; you won't be charged twice.", retry: true },
  record_failed: { tone: 'warn', text: "PayPal confirmed your sandbox payment, but we couldn't save it yet. Check again to finish; you won't be charged twice.", retry: true },
  not_approved: { tone: 'warn', text: 'This payment has not been approved in PayPal yet, so nothing was charged.' },
  sold_before_capture: { tone: 'bad', text: 'Sorry, this item sold before your payment was taken. You were not charged.' },
  unavailable: { tone: 'bad', text: 'This item is no longer available.' },
  invalid_listing: { tone: 'bad', text: "We couldn't find that listing." },
  invalid_order: { tone: 'bad', text: 'That PayPal order link is not valid.' },
  not_found: { tone: 'bad', text: "We couldn't find a checkout for that PayPal order under your profile." },
  not_capturable: { tone: 'bad', text: 'This checkout is closed. Start a new checkout to buy the item.' },
  voided: { tone: 'bad', text: 'This PayPal order was voided. You were not charged.' },
  verification_failed: { tone: 'bad', text: "The PayPal order didn't match this checkout, so we didn't take payment." },
  needs_review: { tone: 'warn', text: 'This payment needs a manual review. It has been flagged.' },
  in_progress: { tone: 'warn', text: 'A checkout for this item is already starting. Give it a moment, then try again.' },
  no_user: { tone: 'bad', text: 'Please finish setting up your profile (Change preferences) before paying.' },
  paypal_unavailable: { tone: 'bad', text: "We couldn't reach PayPal sandbox. Nothing was charged. Please try again." },
  invalid_goal: { tone: 'bad', text: "We couldn't find that funding goal." },
  invalid_amount: { tone: 'bad', text: 'Please enter an amount between $1 and $1,000 (up to 2 decimal places).' },
  goal_funded: { tone: 'ok', text: 'This goal is already fully funded. Thank you!' },
  error: { tone: 'bad', text: 'Something went wrong starting checkout. Nothing was charged. Please try again.' },
};

export function CheckoutMessage({ code, order, retryPath = '/api/checkout/return' }: { code?: string; order?: string; retryPath?: string }) {
  const m = code ? MESSAGES[code] : undefined;
  if (!m) return null;
  const color = m.tone === 'ok' ? 'bg-se-sage/70' : m.tone === 'warn' ? 'bg-se-peach/70' : 'bg-[#ffb3a7]/70';
  const validOrder = order && /^[A-Z0-9]{10,30}$/.test(order);
  return (
    <div role="status" className={`mb-6 rounded-2xl px-4 py-3 font-semibold ${color}`}>
      {m.text}
      {m.retry && validOrder && (
        <a className="ml-2 underline" href={`${retryPath}?token=${encodeURIComponent(order)}`}>Check again</a>
      )}
    </div>
  );
}
