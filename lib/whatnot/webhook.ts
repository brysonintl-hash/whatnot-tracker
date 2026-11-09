// ─── Whatnot webhooks: verify, remember, act ───────────────────────────────
//
// Whatnot signs deliveries with the Standard Webhooks scheme:
//
//   signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
//   key            = base64-decode(secret with its `wn_wh_` prefix removed)
//   signature      = base64(HMAC-SHA256(key, signed content)), sent as
//                    space-separated `v1,<sig>` entries in webhook-signature
//
// Delivery is at-least-once and unordered, a reply is due within five seconds,
// and per-topic payload schemas aren't published in a readable form. So this
// module trusts each event for exactly one thing — which record changed, and
// when — and re-reads the record itself from the REST API, whose shapes have
// been checked against live responses. Unknown shapes are kept in a short raw
// log so the real ones can be read off production and the parsing tightened.

import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { whatnot } from './client';
import * as store from './store';

// ─── Signature ──────────────────────────────────────────────────────────────

/** Deliveries stamped further than this from our clock are refused as replays. */
export const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function secretKey(secret: string): Buffer {
  // The dashboard hands out `wn_wh_<base64>`. Decoding the prefix along with
  // the rest yields a different, wrong key without any error, which is why
  // Whatnot's own docs single it out.
  const raw = secret.trim().replace(/^wn_wh_/, '').replace(/^whsec_/, '');
  return Buffer.from(raw, 'base64');
}

export function sign(key: Buffer, id: string, timestamp: string, body: string): string {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifySignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing webhook headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'unreadable timestamp' };
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp outside tolerance' };

  const expected = Buffer.from(sign(secretKey(secret), id, timestamp, body));
  // Several signatures may be sent during a secret rotation; any one may match.
  for (const part of signature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const got = Buffer.from(sig);
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DIR = join(DATA_DIR, 'whatnot');

function read<T>(file: string, fallback: T): T {
  try {
    const p = join(DIR, file);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    console.error(`webhook store: could not read ${file}:`, e);
  }
  return fallback;
}

function write<T>(file: string, data: T): void {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const p = join(DIR, file);
    writeFileSync(`${p}.tmp`, JSON.stringify(data));
    renameSync(`${p}.tmp`, p);
  } catch (e) {
    console.error(`webhook store: could not write ${file}:`, e);
  }
}

/** Ids already accepted, with when. Retries reuse the id, so this is the dedupe. */
type Seen = Record<string, string>;
const SEEN_DAYS = 7; // comfortably past Whatnot's ~2.5-day retry window

/** Returns true the first time an id is seen and records it; false for a repeat. */
export function claimEvent(id: string, now = new Date()): boolean {
  const seen = read<Seen>('webhookSeen.json', {});
  if (id in seen) return false;
  seen[id] = now.toISOString();
  const cutoff = new Date(now.getTime() - SEEN_DAYS * 86400000).toISOString();
  for (const [k, at] of Object.entries(seen)) if (at < cutoff) delete seen[k];
  write('webhookSeen.json', seen);
  return true;
}

export type EventLog = {
  id: string;
  type: string;
  /** When it happened, per Whatnot — not when it reached us. */
  at: string;
  receivedAt: string;
  /** The record the event points at, once worked out. */
  ref?: string;
  outcome: 'processed' | 'ignored' | 'failed';
  note?: string;
  /** Field names of `data`, so the real payload shapes can be read off production. */
  dataKeys: string[];
  /** A trimmed copy of `data` for the same reason. */
  sample?: string;
};

export type WebhookStatus = {
  received: number;
  byType: Record<string, number>;
  lastReceivedAt: string | null;
  rejected: number;
  lastRejected: { at: string; reason: string } | null;
};

const EMPTY_STATUS: WebhookStatus = { received: 0, byType: {}, lastReceivedAt: null, rejected: 0, lastRejected: null };
const LOG_KEEP = 300;

export const getStatus = (): WebhookStatus => read<WebhookStatus>('webhookStatus.json', EMPTY_STATUS);
export const getLog = (): EventLog[] => read<EventLog[]>('webhookLog.json', []);

export function noteRejected(reason: string): void {
  const s = getStatus();
  s.rejected++;
  s.lastRejected = { at: new Date().toISOString(), reason };
  write('webhookStatus.json', s);
}

function noteReceived(type: string): void {
  const s = getStatus();
  s.received++;
  s.byType[type] = (s.byType[type] ?? 0) + 1;
  s.lastReceivedAt = new Date().toISOString();
  write('webhookStatus.json', s);
}

function log(entry: EventLog): void {
  write('webhookLog.json', [entry, ...getLog()].slice(0, LOG_KEEP));
}

// ─── Shipment timelines ────────────────────────────────────────────────────
//
// The first time each step happened to each parcel. This is the part polling
// can never recover: a poll sees a parcel's state now, not when it changed,
// so "how long from order to label" was unmeasurable before.

export type ShipmentTimeline = Record<string, Partial<Record<string, string>>>;

export const getTimelines = (): ShipmentTimeline => read<ShipmentTimeline>('shipmentTimeline.json', {});

function stamp(shipmentId: string, step: string, at: string): void {
  const all = getTimelines();
  const t = all[shipmentId] ?? {};
  // Earliest wins: a retried or replayed event must not move a step later.
  if (!t[step] || at < t[step]!) t[step] = at;
  all[shipmentId] = t;
  write('shipmentTimeline.json', all);
}

// ─── Show lineups ──────────────────────────────────────────────────────────
//
// What was put up in each show. The API has no way to read this back —
// merchandising is write-only — so these events are the only record of
// what was offered, which is what true sell-through divides by.

export type LineupEntry = {
  productId: string | null;
  variantId: string | null;
  addedAt: string | null;
  removedAt: string | null;
};
export type Lineups = Record<string, LineupEntry[]>;

export const getLineups = (): Lineups => read<Lineups>('showLineups.json', {});

function lineup(showId: string, productId: string | null, variantId: string | null, change: 'added' | 'removed', at: string): void {
  const all = getLineups();
  const list = all[showId] ?? [];
  const match = list.find(e =>
    (productId && e.productId === productId && (!variantId || !e.variantId || e.variantId === variantId)) ||
    (!productId && variantId && e.variantId === variantId));
  if (change === 'added') {
    if (match) { if (!match.addedAt || at < match.addedAt) match.addedAt = at; }
    else list.push({ productId, variantId, addedAt: at, removedAt: null });
  } else if (match) {
    if (!match.removedAt || at > match.removedAt) match.removedAt = at;
  } else {
    list.push({ productId, variantId, addedAt: null, removedAt: at });
  }
  all[showId] = list;
  write('showLineups.json', all);
}

// ─── Reading ids out of an unpublished shape ───────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First string id found at any of these paths, e.g. 'id', 'show.id', 'show_id'. */
export function pick(data: unknown, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = data;
    for (const k of path.split('.')) cur = isObj(cur) ? cur[k] : undefined;
    if (typeof cur === 'string' && cur) return cur;
    if (typeof cur === 'number') return String(cur);
  }
  return null;
}

// ─── Acting on an event ────────────────────────────────────────────────────

export type Envelope = { type: string; timestamp: string; data: unknown; seller_id?: string; version?: string };

/**
 * Work out what changed and refresh it from the API.
 *
 * Runs after the 200 has gone back, so it may take its time; a failure here
 * is logged rather than retried by Whatnot, and the regular poll is the net
 * underneath it.
 */
export async function handleEvent(id: string, env: Envelope): Promise<void> {
  const at = env.timestamp || new Date().toISOString();
  const data = env.data;
  const base: Omit<EventLog, 'outcome'> = {
    id, type: env.type, at, receivedAt: new Date().toISOString(),
    dataKeys: isObj(data) ? Object.keys(data).sort() : [],
    sample: JSON.stringify(data)?.slice(0, 1500),
  };
  noteReceived(env.type);

  try {
    const [group] = env.type.split('.');

    if (group === 'orders') {
      const orderId = pick(data, ['id', 'order_id', 'order.id']);
      if (!orderId) return log({ ...base, outcome: 'failed', note: 'no order id in payload' });
      const order = await whatnot.getOrder(orderId);
      store.putOrders([order]);
      // Fetch what was sold once; a later update only changes the order's state.
      const have = store.getOrderItems().some(i => i.order_id === orderId);
      if (!have) {
        const items = await whatnot.listOrderItems(orderId);
        store.putOrderItems(items.map(i => ({ ...i, _month: order.created_at.slice(0, 7) })));
      }
      return log({ ...base, ref: orderId, outcome: 'processed' });
    }

    if (group === 'shipments') {
      const shipmentId = pick(data, ['id', 'shipment_id', 'shipment.id']);
      if (!shipmentId) return log({ ...base, outcome: 'failed', note: 'no shipment id in payload' });
      // "shipments.items.added" -> "items.added"
      stamp(shipmentId, env.type.slice('shipments.'.length), at);
      try {
        store.putShipments([await whatnot.getShipment(shipmentId)]);
      } catch {
        // A cancelled or replaced parcel can 404; the timeline stamp still counts.
      }
      return log({ ...base, ref: shipmentId, outcome: 'processed' });
    }

    if (group === 'shows') {
      const showId = pick(data, ['id', 'show_id', 'show.id']);
      if (!showId) return log({ ...base, outcome: 'failed', note: 'no show id in payload' });
      store.putShows([await whatnot.getShow(showId)]);
      if (env.type === 'shows.ended') {
        // Often not totted up yet; the regular sync keeps asking until it is.
        try { store.putAnalytics([await whatnot.getShowAnalytics(showId)]); } catch { /* not ready */ }
      }
      return log({ ...base, ref: showId, outcome: 'processed' });
    }

    if (group === 'merchandising') {
      const showId = pick(data, ['show_id', 'show.id', 'livestream_id', 'livestream.id']);
      const productId = pick(data, ['product_id', 'product.id', 'id']);
      const variantId = pick(data, ['variant_id', 'variant.id', 'product.variant_id']);
      if (!showId) return log({ ...base, outcome: 'failed', note: 'no show id in payload — check dataKeys' });
      lineup(showId, productId, variantId, env.type.endsWith('removed_from_show') ? 'removed' : 'added', at);
      return log({ ...base, ref: `${showId}:${productId ?? variantId ?? '?'}`, outcome: 'processed' });
    }

    return log({ ...base, outcome: 'ignored', note: 'topic not used yet' });
  } catch (e) {
    return log({ ...base, outcome: 'failed', note: e instanceof Error ? e.message : String(e) });
  }
}
