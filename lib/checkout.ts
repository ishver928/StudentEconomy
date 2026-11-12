// Marketplace checkout: server-only. Amounts always come from the database, never the browser.
// Flow: startCheckout -> buyer approves at PayPal -> completeCheckout (capture + record).
import type { PoolClient } from 'pg';
import { query, withTransaction } from './db';
import {
  approvalUrl, captureOrder, createOrder, getOrder, paypalIssue,
  type Capture, type Money, type Order,
} from './paypal';

export const CURRENCY = 'USD';
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const PAYPAL_ID_RE = /^[A-Z0-9]{10,30}$/;
const REUSE_PENDING_MS = 3 * 60 * 60 * 1000; // PayPal approval links stay valid for ~3 hours
const CREATING_GRACE_MS = 60 * 1000;

export const isValidId = (id: unknown): id is string => typeof id === 'string' && ID_RE.test(id);
export const isValidPayPalId = (id: unknown): id is string => typeof id === 'string' && PAYPAL_ID_RE.test(id);

// "1234" cents -> "12.34", exactly as PayPal formats USD amounts.
export const toValue = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const sameMoney = (m: Money | undefined, cents: number, currency: string) =>
  m?.currency_code === currency && m?.value === toValue(cents);

// Logs ids and error names only: never request bodies, tokens or credentials.
function logError(event: string, ids: Record<string, string | undefined>, err?: unknown) {
  const detail = err instanceof Error ? `${err.name}${paypalIssue(err) ? `:${paypalIssue(err)}` : ''}` : undefined;
  console.error(`[checkout] ${event}`, { ...ids, error: detail });
}

// ---- Start ------------------------------------------------------------------------

export type StartResult = { ok: true; approveUrl: string } | { ok: false; code: string };

type ListingRow = { id: string; title: string; price_cents: number; status: string };
type OpenCheckout = { id: string; status: string; approve_url: string | null; amount_cents: number; created_at: Date };

export async function startCheckout(buyerId: string, listingId: unknown, baseUrl: string): Promise<StartResult> {
  if (!isValidId(listingId)) return { ok: false, code: 'invalid_listing' };
  const [listing] = await query<ListingRow>('SELECT id, title, price_cents, status FROM listings WHERE id = $1', [listingId]);
  if (!listing) return { ok: false, code: 'invalid_listing' };
  if (listing.status !== 'available' || listing.price_cents <= 0) return { ok: false, code: 'unavailable' };

  for (let attempt = 0; attempt < 2; attempt++) {
    let inserted: { id: string }[];
    try {
      inserted = await query<{ id: string }>(
        `INSERT INTO pending_checkouts (buyer_id, listing_id, amount_cents, currency, status)
         VALUES ($1, $2, $3, $4, 'creating') ON CONFLICT DO NOTHING RETURNING id`,
        [buyerId, listing.id, listing.price_cents, CURRENCY],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23503') return { ok: false, code: 'no_user' }; // buyer row missing
      throw err;
    }
    if (inserted[0]) return createPayPalOrder(inserted[0].id, listing, baseUrl);

    // An open checkout already exists for this buyer + listing (e.g. a double-click).
    const [open] = await query<OpenCheckout>(
      `SELECT id, status, approve_url, amount_cents, created_at FROM pending_checkouts
       WHERE buyer_id = $1 AND listing_id = $2 AND status IN ('creating', 'pending')`,
      [buyerId, listing.id],
    );
    if (!open) continue;
    const age = Date.now() - new Date(open.created_at).getTime();
    if (open.status === 'pending' && open.approve_url && open.amount_cents === listing.price_cents && age < REUSE_PENDING_MS) {
      return { ok: true, approveUrl: open.approve_url };
    }
    if (open.status === 'creating' && age < CREATING_GRACE_MS) return { ok: false, code: 'in_progress' };
    // Stale or re-priced: retire it (the return handler still verifies it with PayPal if it comes back).
    await query(`UPDATE pending_checkouts SET status = 'abandoned', updated_at = now() WHERE id = $1 AND status = $2`, [open.id, open.status]);
  }
  return { ok: false, code: 'in_progress' };
}

async function createPayPalOrder(checkoutId: string, listing: ListingRow, baseUrl: string): Promise<StartResult> {
  try {
    const order = await createOrder(
      {
        referenceId: listing.id,
        customId: checkoutId,
        description: listing.title,
        amount: { currency_code: CURRENCY, value: toValue(listing.price_cents) },
        returnUrl: `${baseUrl}/api/checkout/return`,
        cancelUrl: `${baseUrl}/api/checkout/cancel`,
      },
      `create-${checkoutId}`,
    );
    const url = approvalUrl(order);
    if (!isValidPayPalId(order.id) || !url) throw new Error('PayPal order response missing id or approval link');
    await query(
      `UPDATE pending_checkouts SET paypal_order_id = $2, approve_url = $3, status = 'pending', updated_at = now() WHERE id = $1`,
      [checkoutId, order.id, url],
    );
    return { ok: true, approveUrl: url };
  } catch (err) {
    logError('create order failed', { checkoutId }, err);
    await query(`UPDATE pending_checkouts SET status = 'failed', note = 'create_order_failed', updated_at = now() WHERE id = $1`, [checkoutId]).catch(() => {});
    return { ok: false, code: 'paypal_unavailable' };
  }
}

// ---- Cancel -----------------------------------------------------------------------

export async function cancelCheckout(buyerId: string, orderId: unknown): Promise<string | null> {
  if (!isValidPayPalId(orderId)) return null;
  const rows = await query<{ listing_id: string }>(
    `UPDATE pending_checkouts SET status = 'cancelled', updated_at = now()
     WHERE paypal_order_id = $1 AND buyer_id = $2 AND status = 'pending' RETURNING listing_id`,
    [orderId, buyerId],
  );
  return rows[0]?.listing_id ?? null;
}

// ---- Complete (capture + record) ----------------------------------------------------

export type CompleteResult =
  | { kind: 'completed'; orderRowId: string }
  | { kind: 'error'; code: string; listingId?: string };

type Checkout = {
  id: string; buyer_id: string; listing_id: string; amount_cents: number; currency: string;
  paypal_order_id: string; status: string;
};

// Statuses for which an APPROVED PayPal order may still be captured.
const CAPTURABLE = new Set(['pending', 'abandoned', 'capture_unrecorded', 'capture_pending']);

export async function completeCheckout(buyerId: string, orderId: unknown): Promise<CompleteResult> {
  if (!isValidPayPalId(orderId)) return { kind: 'error', code: 'invalid_order' };
  // Set once PayPal reports a capture, so a later DB failure can be recorded for reconciliation.
  let captured: Capture | undefined;
  let checkoutId: string | undefined;
  try {
    // The checkout row stays locked (FOR UPDATE) for the whole capture, so concurrent
    // refreshes of the return URL wait and then see the recorded order instead of capturing twice.
    return await withTransaction(async (c) => {
      const ck = (await c.query<Checkout>(
        `SELECT id, buyer_id, listing_id, amount_cents, currency, paypal_order_id, status
         FROM pending_checkouts WHERE paypal_order_id = $1 FOR UPDATE`,
        [orderId],
      )).rows[0];
      if (!ck || ck.buyer_id !== buyerId) return { kind: 'error', code: 'not_found' };
      checkoutId = ck.id;
      const fail = (code: string): CompleteResult => ({ kind: 'error', code, listingId: ck.listing_id });

      const recorded = (await c.query<{ id: string }>('SELECT id FROM orders WHERE paypal_order_id = $1', [orderId])).rows[0];
      if (recorded) return { kind: 'completed', orderRowId: recorded.id };

      // Always ask PayPal for the truth rather than trusting our own status.
      let order = await getOrder(orderId);
      if (!orderMatches(order, ck)) {
        logError('order does not match checkout', { checkoutId: ck.id, orderId });
        await setStatus(c, ck.id, 'needs_review', 'order_mismatch');
        return fail('verification_failed');
      }

      if (order.status === 'APPROVED') {
        if (!CAPTURABLE.has(ck.status)) return fail(ck.status === 'cancelled' ? 'cancelled' : 'not_capturable');
        // Lock the listing so two buyers can't both pay for the same item.
        const listing = (await c.query<{ status: string }>('SELECT status FROM listings WHERE id = $1 FOR UPDATE', [ck.listing_id])).rows[0];
        if (listing?.status !== 'available') {
          await setStatus(c, ck.id, 'unavailable');
          return fail('sold_before_capture'); // never captured, so the buyer was not charged
        }
        try {
          order = await captureOrder(orderId, `capture-${ck.id}`); // stable id: retries are idempotent
        } catch (err) {
          const issue = paypalIssue(err);
          if (issue === 'INSTRUMENT_DECLINED') return fail('declined');
          if (issue !== 'ORDER_ALREADY_CAPTURED') logError('capture call failed; re-checking order', { checkoutId: ck.id, orderId }, err);
          order = await getOrder(orderId); // outcome uncertain: ask PayPal what actually happened
        }
      } else if (order.status === 'VOIDED') {
        await setStatus(c, ck.id, 'failed', 'voided');
        return fail('voided');
      } else if (order.status !== 'COMPLETED') {
        return fail('not_approved'); // CREATED / PAYER_ACTION_REQUIRED / SAVED: buyer hasn't approved
      }

      const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) return fail('uncertain'); // capture not visible yet; the return link can be retried safely
      captured = capture;

      if (capture.status === 'PENDING') {
        await setStatus(c, ck.id, 'capture_pending', capture.status_details?.reason ?? null, capture.id);
        return fail('payment_pending');
      }
      if (capture.status === 'DECLINED' || capture.status === 'FAILED') {
        await setStatus(c, ck.id, 'declined', capture.status, capture.id);
        return fail('declined');
      }
      if (capture.status !== 'COMPLETED') {
        // REFUNDED / PARTIALLY_REFUNDED: money moved at some point; leave it for a human.
        await setStatus(c, ck.id, 'needs_review', `capture_${capture.status}`, capture.id);
        return fail('needs_review');
      }

      // Capture is COMPLETED: record it. Inventory problems never lose the payment record.
      const reasons: string[] = [];
      if (!sameMoney(capture.amount, ck.amount_cents, ck.currency)) reasons.push('capture_amount_mismatch');
      const sold = await c.query(`UPDATE listings SET status = 'sold' WHERE id = $1 AND status = 'available'`, [ck.listing_id]);
      if (sold.rowCount === 0) reasons.push('listing_unavailable_at_record');
      const reason = reasons.join(',') || null;

      const inserted = await c.query<{ id: string }>(
        `INSERT INTO orders (kind, buyer_id, listing_id, amount_cents, currency, paypal_order_id, paypal_capture_id,
                             status, checkout_id, needs_review, review_reason)
         VALUES ('purchase', $1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9)
         ON CONFLICT (paypal_order_id) DO NOTHING RETURNING id`,
        [ck.buyer_id, ck.listing_id, ck.amount_cents, ck.currency, orderId, capture.id, ck.id, !!reason, reason],
      );
      const id = inserted.rows[0]?.id
        ?? (await c.query<{ id: string }>('SELECT id FROM orders WHERE paypal_order_id = $1', [orderId])).rows[0].id;
      await setStatus(c, ck.id, reason ? 'needs_review' : 'completed', reason, capture.id);
      if (reason) logError('purchase recorded but flagged for review', { checkoutId: ck.id, orderId, reason });
      return { kind: 'completed', orderRowId: id };
    });
  } catch (err) {
    if (captured) {
      // PayPal has the money but our records failed. Keep a recoverable trail; retrying the
      // return URL re-reads the COMPLETED order from PayPal and records it without capturing again.
      logError('CAPTURED BUT NOT RECORDED: reconcile', { checkoutId, orderId, captureId: captured.id }, err);
      await query(
        `UPDATE pending_checkouts SET status = 'capture_unrecorded', paypal_capture_id = $2, updated_at = now()
         WHERE id = $1 AND status <> 'completed'`,
        [checkoutId, captured.id],
      ).catch((e) => logError('could not mark capture_unrecorded', { checkoutId, orderId }, e));
      return { kind: 'error', code: 'record_failed' };
    }
    logError('complete checkout failed', { checkoutId, orderId }, err);
    return { kind: 'error', code: 'uncertain' };
  }
}

function orderMatches(order: Order, ck: Checkout): boolean {
  const units = order.purchase_units ?? [];
  const pu = units[0];
  return (
    order.id === ck.paypal_order_id &&
    units.length === 1 &&
    pu.custom_id === ck.id &&
    pu.reference_id === ck.listing_id &&
    sameMoney(pu.amount, ck.amount_cents, ck.currency)
  );
}

async function setStatus(c: PoolClient, id: string, status: string, note: string | null = null, captureId: string | null = null) {
  await c.query(
    `UPDATE pending_checkouts SET status = $2, note = COALESCE($3, note),
       paypal_capture_id = COALESCE($4, paypal_capture_id), updated_at = now() WHERE id = $1`,
    [id, status, note, captureId],
  );
}
