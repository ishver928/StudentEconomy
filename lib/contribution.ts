// Funding-goal contributions via PayPal sandbox: server-only. Mirrors lib/checkout.ts.
// The contributor chooses the amount, but it is validated here and stored with the checkout;
// PayPal's order and capture are verified against that stored amount, never the browser's.
// Goal progress (goals.saved_cents) only increases when a contribution order row is inserted
// after PayPal reports the capture as COMPLETED, so it can't be double-counted.
import type { PoolClient } from 'pg';
import { query, withTransaction } from './db';
import { CURRENCY, isValidId, isValidPayPalId, logError, sameMoney, toValue } from './checkout';
import { approvalUrl, captureOrder, createOrder, getOrder, paypalIssue, type Capture, type Order } from './paypal';

export const MIN_CONTRIBUTION_CENTS = 100; // $1
export const MAX_CONTRIBUTION_CENTS = 100_000; // $1,000 (sandbox demo cap)
const REUSE_PENDING_MS = 3 * 60 * 60 * 1000;
const CREATING_GRACE_MS = 60 * 1000;

// "25" or "25.50" -> 2550; anything else (negatives, exponents, 3+ decimals) -> null.
export function parseDollars(input: unknown): number | null {
  if (typeof input !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, frac = ''] = input.trim().split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export type StartResult = { ok: true; approveUrl: string } | { ok: false; code: string };

type GoalRow = { id: string; title: string; target_cents: number; saved_cents: number };

export async function startContribution(buyerId: string, goalId: unknown, amountInput: unknown, baseUrl: string): Promise<StartResult> {
  if (!isValidId(goalId)) return { ok: false, code: 'invalid_goal' };
  const cents = parseDollars(amountInput);
  if (cents === null || cents < MIN_CONTRIBUTION_CENTS || cents > MAX_CONTRIBUTION_CENTS) return { ok: false, code: 'invalid_amount' };
  const [goal] = await query<GoalRow>('SELECT id, title, target_cents, saved_cents FROM goals WHERE id = $1', [goalId]);
  if (!goal) return { ok: false, code: 'invalid_goal' };
  if (goal.saved_cents >= goal.target_cents) return { ok: false, code: 'goal_funded' };

  for (let attempt = 0; attempt < 2; attempt++) {
    let inserted: { id: string }[];
    try {
      inserted = await query<{ id: string }>(
        `INSERT INTO goal_checkouts (buyer_id, goal_id, amount_cents, currency, status)
         VALUES ($1, $2, $3, $4, 'creating') ON CONFLICT DO NOTHING RETURNING id`,
        [buyerId, goal.id, cents, CURRENCY],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23503') return { ok: false, code: 'no_user' };
      throw err;
    }
    if (inserted[0]) return createPayPalOrder(inserted[0].id, goal, cents, baseUrl);

    // An open attempt exists (double-click): reuse it if it's for the same amount.
    const [open] = await query<{ id: string; status: string; approve_url: string | null; amount_cents: number; created_at: Date }>(
      `SELECT id, status, approve_url, amount_cents, created_at FROM goal_checkouts
       WHERE buyer_id = $1 AND goal_id = $2 AND status IN ('creating', 'pending')`,
      [buyerId, goal.id],
    );
    if (!open) continue;
    const age = Date.now() - new Date(open.created_at).getTime();
    if (open.status === 'pending' && open.approve_url && open.amount_cents === cents && age < REUSE_PENDING_MS) {
      return { ok: true, approveUrl: open.approve_url };
    }
    if (open.status === 'creating' && age < CREATING_GRACE_MS) return { ok: false, code: 'in_progress' };
    await query(`UPDATE goal_checkouts SET status = 'abandoned', updated_at = now() WHERE id = $1 AND status = $2`, [open.id, open.status]);
  }
  return { ok: false, code: 'in_progress' };
}

async function createPayPalOrder(checkoutId: string, goal: GoalRow, cents: number, baseUrl: string): Promise<StartResult> {
  try {
    const order = await createOrder(
      {
        referenceId: goal.id,
        customId: checkoutId,
        description: `Contribution: ${goal.title}`,
        amount: { currency_code: CURRENCY, value: toValue(cents) },
        returnUrl: `${baseUrl}/api/contribute/return`,
        cancelUrl: `${baseUrl}/api/contribute/cancel`,
      },
      `goal-create-${checkoutId}`,
    );
    const url = approvalUrl(order);
    if (!isValidPayPalId(order.id) || !url) throw new Error('PayPal order response missing id or approval link');
    await query(
      `UPDATE goal_checkouts SET paypal_order_id = $2, approve_url = $3, status = 'pending', updated_at = now() WHERE id = $1`,
      [checkoutId, order.id, url],
    );
    return { ok: true, approveUrl: url };
  } catch (err) {
    logError('create contribution order failed', { checkoutId }, err);
    await query(`UPDATE goal_checkouts SET status = 'failed', note = 'create_order_failed', updated_at = now() WHERE id = $1`, [checkoutId]).catch(() => {});
    return { ok: false, code: 'paypal_unavailable' };
  }
}

export async function cancelContribution(buyerId: string, orderId: unknown): Promise<string | null> {
  if (!isValidPayPalId(orderId)) return null;
  const rows = await query<{ goal_id: string }>(
    `UPDATE goal_checkouts SET status = 'cancelled', updated_at = now()
     WHERE paypal_order_id = $1 AND buyer_id = $2 AND status = 'pending' RETURNING goal_id`,
    [orderId, buyerId],
  );
  return rows[0]?.goal_id ?? null;
}

export type CompleteResult =
  | { kind: 'completed'; orderRowId: string; goalId: string }
  | { kind: 'error'; code: string; goalId?: string };

type Checkout = { id: string; buyer_id: string; goal_id: string; amount_cents: number; currency: string; paypal_order_id: string; status: string };

const CAPTURABLE = new Set(['pending', 'abandoned', 'capture_unrecorded', 'capture_pending']);

export async function completeContribution(buyerId: string, orderId: unknown): Promise<CompleteResult> {
  if (!isValidPayPalId(orderId)) return { kind: 'error', code: 'invalid_order' };
  let captured: Capture | undefined;
  let checkoutId: string | undefined;
  try {
    return await withTransaction(async (c) => {
      // Row lock serializes concurrent refreshes of the return URL.
      const ck = (await c.query<Checkout>(
        `SELECT id, buyer_id, goal_id, amount_cents, currency, paypal_order_id, status
         FROM goal_checkouts WHERE paypal_order_id = $1 FOR UPDATE`,
        [orderId],
      )).rows[0];
      if (!ck || ck.buyer_id !== buyerId) return { kind: 'error', code: 'not_found' };
      checkoutId = ck.id;
      const fail = (code: string): CompleteResult => ({ kind: 'error', code, goalId: ck.goal_id });

      const recorded = (await c.query<{ id: string }>('SELECT id FROM orders WHERE paypal_order_id = $1', [orderId])).rows[0];
      if (recorded) return { kind: 'completed', orderRowId: recorded.id, goalId: ck.goal_id };

      let order = await getOrder(orderId);
      if (!orderMatches(order, ck)) {
        logError('contribution order does not match checkout', { checkoutId: ck.id, orderId });
        await setStatus(c, ck.id, 'needs_review', 'order_mismatch');
        return fail('verification_failed');
      }

      if (order.status === 'APPROVED') {
        if (!CAPTURABLE.has(ck.status)) return fail(ck.status === 'cancelled' ? 'cancelled' : 'not_capturable');
        try {
          order = await captureOrder(orderId, `goal-capture-${ck.id}`);
        } catch (err) {
          const issue = paypalIssue(err);
          if (issue === 'INSTRUMENT_DECLINED') return fail('declined');
          if (issue !== 'ORDER_ALREADY_CAPTURED') logError('contribution capture failed; re-checking', { checkoutId: ck.id, orderId }, err);
          order = await getOrder(orderId);
        }
      } else if (order.status === 'VOIDED') {
        await setStatus(c, ck.id, 'failed', 'voided');
        return fail('voided');
      } else if (order.status !== 'COMPLETED') {
        return fail('not_approved');
      }

      const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) return fail('uncertain');
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
        await setStatus(c, ck.id, 'needs_review', `capture_${capture.status}`, capture.id);
        return fail('needs_review');
      }

      const reason = sameMoney(capture.amount, ck.amount_cents, ck.currency) ? null : 'capture_amount_mismatch';
      const inserted = await c.query<{ id: string }>(
        `INSERT INTO orders (kind, buyer_id, goal_id, amount_cents, currency, paypal_order_id, paypal_capture_id,
                             status, checkout_id, needs_review, review_reason)
         VALUES ('contribution', $1, $2, $3, $4, $5, $6, 'COMPLETED', $7, $8, $9)
         ON CONFLICT (paypal_order_id) DO NOTHING RETURNING id`,
        [ck.buyer_id, ck.goal_id, ck.amount_cents, ck.currency, orderId, capture.id, ck.id, !!reason, reason],
      );
      let id = inserted.rows[0]?.id;
      if (id) {
        // Only the insert that created the order row moves progress: no double counting.
        await c.query('UPDATE goals SET saved_cents = saved_cents + $2 WHERE id = $1', [ck.goal_id, ck.amount_cents]);
      } else {
        id = (await c.query<{ id: string }>('SELECT id FROM orders WHERE paypal_order_id = $1', [orderId])).rows[0].id;
      }
      await setStatus(c, ck.id, reason ? 'needs_review' : 'completed', reason, capture.id);
      return { kind: 'completed', orderRowId: id, goalId: ck.goal_id };
    });
  } catch (err) {
    if (captured) {
      logError('CONTRIBUTION CAPTURED BUT NOT RECORDED: reconcile', { checkoutId, orderId, captureId: captured.id }, err);
      await query(
        `UPDATE goal_checkouts SET status = 'capture_unrecorded', paypal_capture_id = $2, updated_at = now()
         WHERE id = $1 AND status <> 'completed'`,
        [checkoutId, captured.id],
      ).catch((e) => logError('could not mark capture_unrecorded', { checkoutId, orderId }, e));
      return { kind: 'error', code: 'record_failed' };
    }
    logError('complete contribution failed', { checkoutId, orderId }, err);
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
    pu.reference_id === ck.goal_id &&
    sameMoney(pu.amount, ck.amount_cents, ck.currency)
  );
}

async function setStatus(c: PoolClient, id: string, status: string, note: string | null = null, captureId: string | null = null) {
  await c.query(
    `UPDATE goal_checkouts SET status = $2, note = COALESCE($3, note),
       paypal_capture_id = COALESCE($4, paypal_capture_id), updated_at = now() WHERE id = $1`,
    [id, status, note, captureId],
  );
}
