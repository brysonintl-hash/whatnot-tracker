// ─── Local mirror of the Whatnot account ───────────────────────────────────
//
// The API can't be queried live for a dashboard: there are ~79k orders, no
// server-side filtering, and order items cost one request each. So we keep a
// copy on disk and read from that.
//
// Orders and items are sharded by month. A sync almost always touches only
// the current month, and a 36k-order file rewritten on every poll is the kind
// of thing that quietly becomes a two-second request.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { join } from 'path';
import type {
  WnOrder, WnOrderItem, WnShow, WnShowAnalytics, WnShipment, WnProduct, WnVariant,
} from './types';
import type { Bundle } from './bundles';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DIR = join(DATA_DIR, 'whatnot');

function ensure(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function read<T>(file: string, fallback: T): T {
  try {
    const p = join(DIR, file);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    console.error(`whatnot store: could not read ${file}:`, e);
  }
  return fallback;
}

function write<T>(file: string, data: T): void {
  try {
    ensure();
    // Write beside the target and rename, so a crash mid-write leaves the
    // previous copy intact rather than a half-written file that won't parse.
    const p = join(DIR, file);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  } catch (e) {
    console.error(`whatnot store: could not write ${file}:`, e);
  }
}

/** "2026-11-08T20:29:43.353Z" → "2026-11" */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function shardsFor(prefix: string): string[] {
  try {
    ensure();
    return readdirSync(DIR)
      .filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

// ─── Sharded collections ────────────────────────────────────────────────────

function readSharded<T>(prefix: string): T[] {
  const out: T[] = [];
  for (const f of shardsFor(prefix)) out.push(...read<T[]>(f, []));
  return out;
}

/**
 * Merge rows into their month shards, newest write winning per id.
 * Returns how many rows were new rather than updates.
 */
function upsertSharded<T extends { id: string }>(
  prefix: string,
  rows: T[],
  dateOf: (row: T) => string,
): number {
  const byMonth = new Map<string, T[]>();
  for (const r of rows) {
    const m = monthOf(dateOf(r));
    const list = byMonth.get(m);
    if (list) list.push(r);
    else byMonth.set(m, [r]);
  }

  let added = 0;
  for (const [month, incoming] of Array.from(byMonth.entries())) {
    const file = `${prefix}-${month}.json`;
    const existing = read<T[]>(file, []);
    const index = new Map(existing.map(r => [r.id, r]));
    for (const r of incoming) {
      if (!index.has(r.id)) added++;
      index.set(r.id, r);
    }
    write(file, Array.from(index.values()));
  }
  return added;
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export const getOrders = (): WnOrder[] => readSharded<WnOrder>('orders');

export const putOrders = (rows: WnOrder[]): number =>
  upsertSharded('orders', rows, o => o.created_at);

/** Ids only — what an incremental sync needs to know where to stop. */
export function getOrderIds(): Set<string> {
  return new Set(getOrders().map(o => o.id));
}

// ─── Order items ────────────────────────────────────────────────────────────
//
// Items carry no date of their own, so they are sharded by their order's month
// and the mapping is kept so a re-sync lands in the same shard.

export const getOrderItems = (): WnOrderItem[] => readSharded<WnOrderItem>('items');

export function putOrderItems(rows: (WnOrderItem & { _month: string })[]): number {
  return upsertSharded('items', rows, r => `${r._month}-01`);
}

/** Orders whose items we have never fetched — the backfill queue. */
export function ordersMissingItems(): WnOrder[] {
  const have = new Set(getOrderItems().map(i => i.order_id));
  return getOrders().filter(o => !have.has(o.id));
}

// ─── Shows, analytics, shipments, catalogue ────────────────────────────────

export const getShows = (): WnShow[] => read<WnShow[]>('shows.json', []);

export function putShows(rows: WnShow[]): number {
  const index = new Map(getShows().map(s => [s.id, s]));
  let added = 0;
  for (const s of rows) {
    if (!index.has(s.id)) added++;
    index.set(s.id, s);
  }
  write('shows.json', Array.from(index.values()));
  return added;
}

export const getAnalytics = (): Record<string, WnShowAnalytics> =>
  read<Record<string, WnShowAnalytics>>('analytics.json', {});

export function putAnalytics(rows: WnShowAnalytics[]): number {
  const all = getAnalytics();
  let added = 0;
  for (const a of rows) {
    if (!(a.show_id in all)) added++;
    all[a.show_id] = a;
  }
  write('analytics.json', all);
  return added;
}

export const getShipments = (): WnShipment[] => read<WnShipment[]>('shipments.json', []);

export function putShipments(rows: WnShipment[]): number {
  const index = new Map(getShipments().map(s => [s.id, s]));
  let added = 0;
  for (const s of rows) {
    if (!index.has(s.id)) added++;
    index.set(s.id, s);
  }
  write('shipments.json', Array.from(index.values()));
  return added;
}

/** A product and the variants hanging off it, flattened for lookup. */
export type CatalogEntry = { product: WnProduct; variants: WnVariant[] };

export const getCatalog = (): Record<string, CatalogEntry> =>
  read<Record<string, CatalogEntry>>('catalog.json', {});

export function putCatalog(entries: CatalogEntry[]): number {
  const all = getCatalog();
  let added = 0;
  for (const e of entries) {
    if (!(e.product.id in all)) added++;
    all[e.product.id] = e;
  }
  write('catalog.json', all);
  return added;
}

// ─── Host assignment ────────────────────────────────────────────────────────
//
// The one thing the API cannot tell us. A show object has no person on it —
// the whole business streams from a single Whatnot account — so who was on
// camera has to be recorded here.

export type HostAssignment = {
  showId: string;
  host: string;
  /** 'manual' when a human picked it, 'sheet' when matched from the sales sheet. */
  source: 'manual' | 'sheet';
  setBy: string;
  setAt: string;
};

export const getHostAssignments = (): Record<string, HostAssignment> =>
  read<Record<string, HostAssignment>>('hostAssignments.json', {});

export function setHostAssignment(a: HostAssignment): void {
  const all = getHostAssignments();
  all[a.showId] = a;
  write('hostAssignments.json', all);
}

export function setHostAssignments(rows: HostAssignment[]): number {
  const all = getHostAssignments();
  let n = 0;
  for (const a of rows) {
    // A human's choice is never overwritten by a later sheet guess.
    if (all[a.showId]?.source === 'manual' && a.source === 'sheet') continue;
    all[a.showId] = a;
    n++;
  }
  write('hostAssignments.json', all);
  return n;
}

export function clearHostAssignment(showId: string): void {
  const all = getHostAssignments();
  delete all[showId];
  write('hostAssignments.json', all);
}

// ─── Kit breakouts ──────────────────────────────────────────────────────────
//
// Which combo kits we buy and what comes out of them. Entirely ours — Whatnot
// has no concept of a kit being broken into parts, and the inventory sheet
// records the kit's cost but not how to divide it.

export const getBundles = (): Bundle[] => read<Bundle[]>('bundles.json', []);

export function putBundle(b: Bundle): Bundle[] {
  const all = getBundles();
  const i = all.findIndex(x => x.id === b.id);
  if (i === -1) all.push(b);
  else all[i] = b;
  write('bundles.json', all);
  return all;
}

export function deleteBundle(id: string): Bundle[] {
  const all = getBundles().filter(b => b.id !== id);
  write('bundles.json', all);
  return all;
}

// ─── Sync bookkeeping ───────────────────────────────────────────────────────

export type SyncState = {
  /** ISO of the last successful run of each collection. */
  lastRun: Record<string, string>;
  /** Set while a sync is in flight, so two don't overlap. */
  running: null | { what: string; startedAt: string; done: number; total: number; note: string };
  lastError: null | { what: string; at: string; message: string };
  counts: Record<string, number>;
};

const EMPTY_STATE: SyncState = { lastRun: {}, running: null, lastError: null, counts: {} };

export const getSyncState = (): SyncState => read<SyncState>('syncState.json', EMPTY_STATE);

export function patchSyncState(patch: Partial<SyncState>): SyncState {
  const next = { ...getSyncState(), ...patch };
  write('syncState.json', next);
  return next;
}

export function setSyncProgress(what: string, done: number, total: number, note = ''): void {
  const s = getSyncState();
  if (!s.running) return;
  s.running = { ...s.running, what, done, total, note };
  write('syncState.json', s);
}

/** Rough on-disk footprint, for the admin screen. */
export function storeStats(): Record<string, number> {
  return {
    orders: getOrders().length,
    orderItems: getOrderItems().length,
    shows: getShows().length,
    analytics: Object.keys(getAnalytics()).length,
    shipments: getShipments().length,
    catalogProducts: Object.keys(getCatalog()).length,
    hostsAssigned: Object.keys(getHostAssignments()).length,
    bundles: getBundles().length,
  };
}
