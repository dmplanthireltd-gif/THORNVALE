/**
 * Payments through Paddle (merchant of record: Paddle takes the money, handles VAT and
 * sends receipts). Players pay on the website's store page with Paddle's checkout; Paddle
 * then calls POST /api/pay/webhook and this file turns that call into a grant or refund.
 *
 * Settings (Render dashboard → Environment):
 *   PADDLE_ENV             'sandbox' (test payments) or 'production'
 *   PADDLE_CLIENT_TOKEN    public client-side token for the checkout (safe to show)
 *   PADDLE_WEBHOOK_SECRET  secret of the notification destination (pdl_ntfset_…) — SECRET,
 *                          only ever in the dashboard, never in code, logs or chat
 *   PADDLE_PRICES          which Paddle price is which product, e.g.
 *                          "premium_30=pri_01…,founder_legend=pri_01…" (price ids are public)
 *
 * Every payment goes into the purchases ledger before anything is handed out, in one
 * database step, and each Paddle transaction is granted at most once.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isProductId, PRODUCTS, premiumStart, type ProductId } from '../src/game/premium/premium';
import type { Storage } from './storage';

export interface PaddleConfig {
  env: 'sandbox' | 'production';
  clientToken: string;
  webhookSecret: string;
  /** Product → Paddle price id. */
  prices: Partial<Record<ProductId, string>>;
}

export function paddleConfigFromEnv(env: NodeJS.ProcessEnv): PaddleConfig {
  const prices: Partial<Record<ProductId, string>> = {};
  for (const pair of (env.PADDLE_PRICES ?? '').split(/[,\s]+/)) {
    const [k, v] = pair.split('=').map((x) => x?.trim());
    if (isProductId(k) && v && /^pri_[A-Za-z0-9]+$/.test(v)) prices[k] = v;
  }
  return {
    env: env.PADDLE_ENV === 'production' ? 'production' : 'sandbox',
    clientToken: (env.PADDLE_CLIENT_TOKEN ?? '').trim(),
    webhookSecret: (env.PADDLE_WEBHOOK_SECRET ?? '').trim(),
    prices,
  };
}

/** Payments can be taken: a client token, a webhook secret and at least one price. */
export function paddleReady(c: PaddleConfig): boolean {
  return !!c.clientToken && !!c.webhookSecret && Object.keys(c.prices).length > 0;
}

/** Seconds a signed webhook may be old (Paddle retries arrive freshly signed). */
const SIGNATURE_TOLERANCE_S = 300;

/**
 * Checks the Paddle-Signature header ("ts=…;h1=…"): HMAC-SHA256 of "ts:rawBody" with the
 * webhook secret, hex. More than one h1 can be present while a secret is being rotated.
 */
export function verifyPaddleSignature(rawBody: string, header: string | undefined, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  let ts = '';
  const sigs: string[] = [];
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 'ts') ts = v;
    else if (k === 'h1') sigs.push(v);
  }
  const t = Number(ts);
  if (!ts || !Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex'), 'hex');
  return sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false;
    const got = Buffer.from(s, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

/** What a webhook did, for the log and the tests. */
export type WebhookResult =
  | { kind: 'granted'; owner: string; product: ProductId; txn: string }
  | { kind: 'duplicate'; txn: string }
  | { kind: 'revoked'; txn: string; how: 'refund' | 'chargeback' }
  | { kind: 'ignored'; why: string };

interface PaddleEvent {
  event_id?: string;
  event_type?: string;
  data?: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Handles one verified Paddle event. Throws when storage fails, so the webhook answers 500
 * and Paddle retries later (a retry of something already granted is a harmless duplicate).
 */
export async function handlePaddleEvent(ev: PaddleEvent, cfg: PaddleConfig, storage: Storage, now = Date.now()): Promise<WebhookResult> {
  const d = ev.data ?? {};
  if (ev.event_type === 'transaction.completed') {
    const txn = typeof d.id === 'string' ? d.id : '';
    if (!txn) return { kind: 'ignored', why: 'no transaction id' };
    const custom = (d.custom_data ?? {}) as Record<string, unknown>;
    const owner = typeof custom.account === 'string' ? custom.account : '';
    if (!UUID.test(owner)) return { kind: 'ignored', why: `transaction ${txn} has no account id` };
    // the price decides what was bought, never what the browser claimed
    const items = Array.isArray(d.items) ? (d.items as Array<Record<string, unknown>>) : [];
    const priceIds = items.map((it) => String((it.price as Record<string, unknown> | undefined)?.id ?? it.price_id ?? ''));
    const byPrice = new Map(Object.entries(cfg.prices).map(([k, v]) => [v, k as ProductId]));
    const product = priceIds.map((p) => byPrice.get(p)).find((x): x is ProductId => !!x);
    if (!product) return { kind: 'ignored', why: `transaction ${txn}: no known price (${priceIds.join(', ') || 'none'})` };
    const totals = ((d.details as Record<string, unknown> | undefined)?.totals ?? {}) as Record<string, unknown>;
    const amount = Number(totals.grand_total ?? totals.total);
    const r = await storage.grantPurchase({
      provider: 'paddle', txn, owner, product, start: premiumStart(PRODUCTS[product], now),
      amountMinor: Number.isFinite(amount) ? Math.round(amount) : null,
      currency: typeof d.currency_code === 'string' ? d.currency_code : null,
      raw: { event_id: ev.event_id, event_type: ev.event_type, id: txn, items: priceIds, custom_data: custom, totals, currency_code: d.currency_code, customer_id: d.customer_id },
    });
    return r === 'duplicate' ? { kind: 'duplicate', txn } : { kind: 'granted', owner, product, txn };
  }
  if (ev.event_type === 'adjustment.created' || ev.event_type === 'adjustment.updated') {
    const txn = typeof d.transaction_id === 'string' ? d.transaction_id : '';
    if (!txn) return { kind: 'ignored', why: 'adjustment without transaction id' };
    if (d.status !== 'approved') return { kind: 'ignored', why: `adjustment for ${txn} is ${String(d.status)}` };
    const action = String(d.action ?? '');
    if (action === 'chargeback' || action === 'chargeback_warning') {
      const r = await storage.revokePurchase('paddle', txn, 'chargeback');
      return r === 'revoked' ? { kind: 'revoked', txn, how: 'chargeback' } : { kind: 'ignored', why: `chargeback for ${txn}: ${r}` };
    }
    if (action === 'refund') {
      // a partial refund (some money back) keeps the purchase: the owner decides by hand
      if (d.type === 'partial') return { kind: 'ignored', why: `partial refund for ${txn}: check it by hand` };
      const r = await storage.revokePurchase('paddle', txn, 'refund');
      return r === 'revoked' ? { kind: 'revoked', txn, how: 'refund' } : { kind: 'ignored', why: `refund for ${txn}: ${r}` };
    }
    return { kind: 'ignored', why: `adjustment ${action} for ${txn}` };
  }
  return { kind: 'ignored', why: `event ${String(ev.event_type)}` };
}
