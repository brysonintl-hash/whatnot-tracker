// ─── Shipping queue: Whatnot parcels for the Assign Shipments tab ──────────
//
// A shipment says who it goes to and whether it has a label, but not what is
// in the box. That takes three hops — shipment items → order → order items —
// plus one more for the picture. So each parcel's contents are read once and
// kept, and read again only while the parcel can still change: Whatnot keeps
// bundling a buyer's later wins into an open parcel until its label is made.
//
// The parcels themselves are re-listed every couple of minutes while someone
// has the page open. /shipments takes no filters, newest first, so the listing
// pages back until it reaches parcels older than the window and stops there.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { whatnot, hasToken, mapLimit } from './client';
import * as store from './store';
import { money, type WnShipment } from './types';
import { BUSINESS_TZ } from '../hostDay';

/** How far back the queue lists parcels. A label is due within a couple of days. */
export const WINDOW_DAYS = 10;
/** A page load more often than this reuses the last listing. */
const MIN_GAP_MS = 2 * 60_000;
/** Contents read per refresh; the rest wait for the next one. */
const CONTENTS_PER_RUN = 400;

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DIR = join(DATA_DIR, 'whatnot');

function read<T>(file: string, fallback: T): T {
  try {
    const p = join(DIR, file);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    console.error(`ship queue: could not read ${file}:`, e);
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
    console.error(`ship queue: could not write ${file}:`, e);
  }
}

// ─── What's in the box ─────────────────────────────────────────────────────

export type ShipmentLine = {
  orderId: string | null;
  orderItemId: string | null;
  /** Seller Hub page for the order. */
  orderUrl: string | null;
  title: string;
  quantity: number;
  /** What the buyer paid for one, before shipping and tax. */
  price: number;
  image: string | null;
  /** auction, buy_it_now, giveaway… as Whatnot names it. */
  saleType: string | null;
};

export type ShipmentContents = {
  shipmentId: string;
  lines: ShipmentLine[];
  fetchedAt: string;
  /** The parcel's updated_at when read. A newer one may mean items were added. */
  shipmentUpdatedAt: string | null;
  createdAt: string | null;
};

const CONTENTS_FILE = 'shipmentContents.json';
/** Contents older than this are dropped; the parcel is long delivered. */
const CONTENTS_KEEP_DAYS = 90;

export const getContents = (): Record<string, ShipmentContents> =>
  read<Record<string, ShipmentContents>>(CONTENTS_FILE, {});

export function putContents(rows: ShipmentContents[]): void {
  if (!rows.length) return;
  const all = getContents();
  for (const c of rows) all[c.shipmentId] = c;
  const cutoff = new Date(Date.now() - CONTENTS_KEEP_DAYS * 86_400_000).toISOString();
  for (const [id, c] of Object.entries(all)) {
    if (c.createdAt && c.createdAt < cutoff) delete all[id];
  }
  write(CONTENTS_FILE, all);
}

/** Read again while the parcel is open and has changed since we looked. */
export function needsContents(s: WnShipment, c: ShipmentContents | undefined): boolean {
  if (!c) return true;
  return s.status === 'created' && Boolean(s.updated_at) && c.shipmentUpdatedAt !== s.updated_at;
}

// Product pictures. The catalogue copy has most of them; live-show listings
// are often made on the spot and only exist on Whatnot, so those are asked
// for once and remembered, including "this one has no picture".
const IMAGES_FILE = 'productImages.json';

function imageFinder(): { find: (productId: string) => Promise<string | null>; save: () => void } {
  let catalog: ReturnType<typeof store.getCatalog> | null = null;
  const known = read<Record<string, string | null>>(IMAGES_FILE, {});
  let dirty = false;
  return {
    async find(productId) {
      if (productId in known) return known[productId];
      catalog ??= store.getCatalog();
      const entry = catalog[productId];
      let url = entry?.product.media?.[0]?.url ?? null;
      if (!entry) {
        try {
          url = (await whatnot.getProduct(productId)).media?.[0]?.url ?? null;
        } catch {
          return null; // try again next time rather than remember a failure
        }
      }
      known[productId] = url;
      dirty = true;
      return url;
    },
    save() {
      if (dirty) write(IMAGES_FILE, known);
    },
  };
}

async function readContents(
  s: WnShipment,
  image: (productId: string) => Promise<string | null>,
): Promise<ShipmentContents> {
  const parts = await whatnot.listShipmentItems(s.id);
  const orderIds = Array.from(new Set(parts.map(p => p.order_id).filter((id): id is string => Boolean(id))));
  const orders = await Promise.all(orderIds.map(async id => {
    const [order, items] = await Promise.all([whatnot.getOrder(id), whatnot.listOrderItems(id)]);
    return { order, items };
  }));
  const byItem = new Map(orders.flatMap(({ order, items }) => items.map(i => [i.id, { order, item: i }] as const)));

  const lines: ShipmentLine[] = [];
  for (const p of parts) {
    const hit = p.order_item_id ? byItem.get(p.order_item_id) : undefined;
    if (!hit) {
      // A line we couldn't match still counts as something in the box.
      lines.push({
        orderId: p.order_id, orderItemId: p.order_item_id, orderUrl: null,
        title: 'Item details unavailable', quantity: 1, price: 0, image: null, saleType: null,
      });
      continue;
    }
    const { order, item } = hit;
    lines.push({
      orderId: order.id,
      orderItemId: item.id,
      orderUrl: order.url ?? null,
      title: item.purchased_item?.title || 'Untitled item',
      quantity: item.quantity || 1,
      price: money(item.unit_price),
      image: item.product_id ? await image(item.product_id) : null,
      saleType: order.transaction_type ?? null,
    });
  }
  return {
    shipmentId: s.id, lines,
    fetchedAt: new Date().toISOString(),
    shipmentUpdatedAt: s.updated_at ?? null,
    createdAt: s.created_at ?? null,
  };
}

/** Contents for one parcel, reading Whatnot only if what we have is missing or stale. */
export async function contentsFor(shipmentId: string): Promise<ShipmentContents | null> {
  const s = store.getShipments().find(x => x.id === shipmentId);
  const have = getContents()[shipmentId];
  if (!s) return have ?? null;
  if (!needsContents(s, have)) return have;
  const images = imageFinder();
  try {
    const c = await readContents(s, images.find);
    putContents([c]);
    return c;
  } finally {
    images.save();
  }
}

// ─── Refresh ───────────────────────────────────────────────────────────────

export type QueueSync = {
  /** When the parcel list was last read from Whatnot. */
  refreshedAt: string | null;
  running: boolean;
  error: string | null;
  /** Parcels whose contents are still to be read. */
  pendingContents: number;
};

const sync: QueueSync = { refreshedAt: null, running: false, error: null, pendingContents: 0 };
let inflight: Promise<void> | null = null;

export const queueSync = (): QueueSync => ({ ...sync });

/** Parcels most worth reading first: the ones someone is about to pack. */
function priority(s: WnShipment): number {
  if (s.status === 'created') return 0;
  if (s.status === 'label_generated') return 1;
  return 2;
}

async function fillContents(shipments: WnShipment[]): Promise<void> {
  const have = getContents();
  const todo = shipments
    .filter(s => needsContents(s, have[s.id]))
    .sort((a, b) => priority(a) - priority(b) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  sync.pendingContents = todo.length;
  if (!todo.length) return;

  const images = imageFinder();
  let batch: ShipmentContents[] = [];
  try {
    await mapLimit(todo.slice(0, CONTENTS_PER_RUN), 4, async s => {
      try {
        batch.push(await readContents(s, images.find));
      } catch (e) {
        console.error(`ship queue: contents of ${s.id} failed:`, e);
      }
      sync.pendingContents--;
      // Save as we go, so a page polling mid-refresh sees boxes fill in.
      if (batch.length >= 20) { putContents(batch); batch = []; }
    });
  } finally {
    putContents(batch);
    images.save();
  }
}

/**
 * Re-list recent parcels and read the contents of new or changed ones.
 * One at a time: a second caller shares the run already going.
 */
export function refreshQueue(opts: { force?: boolean } = {}): Promise<void> {
  if (!hasToken()) return Promise.resolve();
  if (inflight) return inflight;
  if (!opts.force && sync.refreshedAt && Date.now() - Date.parse(sync.refreshedAt) < MIN_GAP_MS) {
    return Promise.resolve();
  }
  inflight = (async () => {
    sync.running = true;
    sync.error = null;
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const rows = await whatnot.listShipmentsSince(since);
      if (rows.length) store.putShipments(rows);
      sync.refreshedAt = new Date().toISOString();
      await fillContents(rows);
    } catch (e) {
      sync.error = e instanceof Error ? e.message : String(e);
    } finally {
      sync.running = false;
      inflight = null;
    }
  })();
  return inflight;
}

// ─── Presenting a parcel ───────────────────────────────────────────────────

export type ShipmentView = {
  status: string;
  /** Seller Hub's own wording, so the team sees the same words in both places. */
  statusLabel: string;
  url: string;
  buyer: string | null;
  buyerName: string | null;
  createdAt: string | null;
  dropoffDue: string | null;
  overdue: boolean;
  requiredActions: string[];
  pickup: boolean;
  weight: string | null;
  dims: string | null;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  hasLabel: boolean;
  hazmat: string | null;
  /** Null until read. */
  lines: ShipmentLine[] | null;
  itemCount: number | null;
  orderCount: number | null;
  value: number | null;
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Needs Label',
  label_generated: 'Ready to Ship',
  dropped_off: 'Dropped Off',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  failed: 'Failed',
};

export function statusLabel(status: string): string {
  if (status.startsWith('cancelled')) return 'Cancelled';
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const UNIT: Record<string, string> = { ounce: 'oz', pound: 'lb', gram: 'g', kilogram: 'kg', inch: 'in', centimeter: 'cm' };
const unit = (u: string) => UNIT[u] ?? u;

/**
 * Whatnot sends the due *date* as seller-local midnight and says plainly it
 * isn't the overdue cutoff, so a parcel counts as late only once that whole
 * day has gone by without it leaving.
 */
export function isOverdue(s: Pick<WnShipment, 'status' | 'dropoff_due'>, now = Date.now()): boolean {
  if (!s.dropoff_due) return false;
  if (s.status !== 'created' && s.status !== 'label_generated') return false;
  return now > Date.parse(s.dropoff_due) + 86_400_000;
}

export function viewOf(s: WnShipment, c: ShipmentContents | undefined, now = Date.now()): ShipmentView {
  const lines = c?.lines ?? null;
  return {
    status: s.status,
    statusLabel: statusLabel(s.status),
    url: s.url,
    buyer: s.recipient?.username ?? null,
    buyerName: s.recipient?.display_name ?? null,
    createdAt: s.created_at ?? null,
    dropoffDue: s.dropoff_due ?? null,
    overdue: isOverdue(s, now),
    requiredActions: s.required_actions ?? [],
    pickup: s.fulfillment_method === 'pickup',
    weight: s.weight ? `${s.weight.value} ${unit(s.weight.unit)}` : null,
    dims: s.dimensions
      ? `${s.dimensions.length} × ${s.dimensions.width} × ${s.dimensions.height} ${unit(s.dimensions.unit)}`
      : null,
    carrier: s.tracking?.carrier ?? null,
    service: s.tracking?.service ?? null,
    tracking: s.tracking?.tracking_code ?? null,
    // The links themselves are short-lived and signed; they stay server-side
    // and are handed out fresh by the print route.
    hasLabel: Boolean(s.documents?.label_url || s.documents?.bundled_url),
    hazmat: s.hazardous_material && s.hazardous_material !== 'not_hazardous' ? s.hazardous_material.replace(/_/g, ' ') : null,
    lines,
    itemCount: lines ? lines.reduce((n, l) => n + l.quantity, 0) : null,
    orderCount: lines ? new Set(lines.map(l => l.orderId).filter(Boolean)).size : null,
    value: lines ? Math.round(lines.reduce((n, l) => n + l.price * l.quantity, 0) * 100) / 100 : null,
  };
}

// ─── Dates the way the page groups them ────────────────────────────────────

/**
 * "11/9/26" — the same shape as the shipment sheet's tab names, so parcels
 * from Whatnot and rows from the sheet fall under the same day.
 */
export function tabOf(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, year: '2-digit', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('month')}/${get('day')}/${get('year')}`;
}

/** Sort key for a "M/D/YY" tab; anything else sorts last. */
export function tabTime(tab: string): number {
  const m = tab.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return -Infinity;
  return Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}
