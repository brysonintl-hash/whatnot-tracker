// ─── Pulling the Whatnot account into the local store ──────────────────────
//
// Shaped around three facts about the API:
//
//   • Orders are newest-first and take no filters, so an incremental run pages
//     from the top and stops at the first order it already holds. A first run
//     has to walk back as far as you want history to go.
//   • Order items are one request per order. That is the expensive half of a
//     backfill and the reason `items` is its own step with a budget.
//   • Only shows accept a real filter (`status`), and only ended shows have
//     analytics worth reading.

import { whatnot, mapLimit, hasToken } from './client';
import * as store from './store';
import type { WnOrder, WnShowAnalytics } from './types';

export type SyncWhat = 'orders' | 'items' | 'shows' | 'analytics' | 'shipments' | 'catalog';

export const SYNC_STEPS: SyncWhat[] = ['shows', 'orders', 'items', 'analytics', 'shipments', 'catalog'];

export type SyncResult = {
  what: SyncWhat;
  fetched: number;
  added: number;
  skipped?: number;
  ms: number;
  note?: string;
};

/** How far back a first run reaches when the caller doesn't say. */
const DEFAULT_BACKFILL_DAYS = 180;

/** Ceiling on item requests in one run, so a backfill resumes rather than hangs. */
const DEFAULT_ITEM_BUDGET = 4000;

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// ─── Individual steps ───────────────────────────────────────────────────────

async function syncShows(): Promise<SyncResult> {
  const t0 = Date.now();
  // Without an explicit status the API returns only upcoming shows, which is
  // never what a dashboard wants.
  const ended = await whatnot.listShows('ended');
  const scheduled = await whatnot.listShows('scheduled');
  const live = await whatnot.listShows('live');
  const all = [...ended, ...scheduled, ...live];
  const added = store.putShows(all);
  return { what: 'shows', fetched: all.length, added, ms: Date.now() - t0 };
}

async function syncOrders(opts: { days?: number; full?: boolean }): Promise<SyncResult> {
  const t0 = Date.now();
  const since = opts.days ? daysAgoISO(opts.days) : undefined;
  // A backfill reaches back by date and must page straight past orders we
  // already hold: they are the newest ones, so stopping at the first known id
  // meant a backfill after any earlier fetch stopped on page one. Only a plain
  // update — no date given — stops at familiar ground. Re-fetched orders
  // simply overwrite their stored copy.
  const known = opts.full || since ? undefined : store.getOrderIds();

  const orders = await whatnot.listOrders({
    since,
    knownIds: known,
    onPage: (_rows, total) => { store.setSyncProgress('orders', total, 0, 'paging'); },
  });

  const added = store.putOrders(orders);
  return {
    what: 'orders', fetched: orders.length, added, ms: Date.now() - t0,
    note: known?.size ? `stopped at first of ${known.size} known orders` : undefined,
  };
}

async function syncItems(budget: number): Promise<SyncResult> {
  const t0 = Date.now();
  const queue = store.ordersMissingItems();
  const batch = queue.slice(0, budget);
  if (!batch.length) {
    return { what: 'items', fetched: 0, added: 0, ms: Date.now() - t0, note: 'nothing outstanding' };
  }

  const collected: Parameters<typeof store.putOrderItems>[0] = [];
  // 8 in flight keeps the pipe full; the client's shared gate still holds the
  // real ceiling, so this never exceeds the account's per-second budget.
  await mapLimit(batch, 8, async (o: WnOrder) => {
    try {
      const items = await whatnot.listOrderItems(o.id);
      for (const it of items) collected.push({ ...it, _month: o.created_at.slice(0, 7) });
    } catch (e) {
      console.error(`whatnot sync: items for order ${o.id}:`, e);
    }
  }, (done, total) => {
    if (done % 50 === 0 || done === total) store.setSyncProgress('items', done, total, 'order items');
  });

  const added = store.putOrderItems(collected);
  const left = queue.length - batch.length;
  return {
    what: 'items', fetched: collected.length, added, ms: Date.now() - t0,
    note: left > 0 ? `${left.toLocaleString()} orders still queued — run again to continue` : 'complete',
  };
}

async function syncAnalytics(limit: number): Promise<SyncResult> {
  const t0 = Date.now();
  const have = store.getAnalytics();
  const shows = store.getShows().filter(s => s.status === 'ended');

  // A show that just ended may not be totted up yet, so anything not marked
  // GENERATED is retried on the next run rather than cached as final.
  const todo = shows.filter(s => have[s.id]?.calculation_status !== 'GENERATED').slice(0, limit);
  if (!todo.length) {
    return { what: 'analytics', fetched: 0, added: 0, ms: Date.now() - t0, note: 'all shows up to date' };
  }

  const rows: WnShowAnalytics[] = [];
  let skipped = 0;
  await mapLimit(todo, 8, async s => {
    try {
      rows.push(await whatnot.getShowAnalytics(s.id));
    } catch {
      // Older or cancelled shows can 404 on analytics; that is not a failure.
      skipped++;
    }
  }, (done, total) => {
    if (done % 25 === 0 || done === total) store.setSyncProgress('analytics', done, total, 'show analytics');
  });

  const added = store.putAnalytics(rows);
  return { what: 'analytics', fetched: rows.length, added, skipped, ms: Date.now() - t0 };
}

async function syncShipments(max: number): Promise<SyncResult> {
  const t0 = Date.now();
  // Shipments take no filters either, and the open ones are the newest, so a
  // bounded page from the top covers everything fulfilment cares about.
  const rows = await whatnot.listShipments({
    max,
    onPage: (_r, total) => { store.setSyncProgress('shipments', total, max, 'paging'); },
  });
  const added = store.putShipments(rows);
  return { what: 'shipments', fetched: rows.length, added, ms: Date.now() - t0 };
}

async function syncCatalog(): Promise<SyncResult> {
  const t0 = Date.now();
  const products = await whatnot.listProducts({
    onPage: (_r, total) => { store.setSyncProgress('catalog', total, 0, 'products'); },
  });

  const entries: { product: (typeof products)[number]; variants: Awaited<ReturnType<typeof whatnot.listVariants>> }[] = [];
  await mapLimit(products, 8, async p => {
    try {
      entries.push({ product: p, variants: await whatnot.listVariants(p.id) });
    } catch {
      entries.push({ product: p, variants: [] });
    }
  }, (done, total) => {
    if (done % 50 === 0 || done === total) store.setSyncProgress('catalog', done, total, 'variants');
  });

  const added = store.putCatalog(entries);
  return { what: 'catalog', fetched: entries.length, added, ms: Date.now() - t0 };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export type SyncOptions = {
  steps?: SyncWhat[];
  /** First run only: how far back to reach. Ignored once orders are stored. */
  days?: number;
  /** Re-page every order rather than stopping at the first known one. */
  full?: boolean;
  itemBudget?: number;
  analyticsLimit?: number;
  shipmentMax?: number;
};

export async function runSync(opts: SyncOptions = {}): Promise<{
  results: SyncResult[];
  stats: Record<string, number>;
  error?: string;
}> {
  if (!hasToken()) {
    return { results: [], stats: store.storeStats(), error: 'WHATNOT_API_KEY is not set' };
  }

  const state = store.getSyncState();
  if (state.running) {
    const since = Date.now() - new Date(state.running.startedAt).getTime();
    // A process restart mid-sync would otherwise leave the lock set forever.
    if (since < 30 * 60_000) {
      return { results: [], stats: store.storeStats(), error: 'A sync is already running' };
    }
  }

  const steps = opts.steps?.length ? opts.steps : SYNC_STEPS;
  const firstRun = store.getOrders().length === 0;

  store.patchSyncState({
    running: { what: steps[0], startedAt: new Date().toISOString(), done: 0, total: 0, note: 'starting' },
    lastError: null,
  });

  const results: SyncResult[] = [];
  try {
    for (const step of steps) {
      store.setSyncProgress(step, 0, 0, 'starting');
      switch (step) {
        case 'shows': results.push(await syncShows()); break;
        case 'orders': results.push(await syncOrders({
          days: opts.days ?? (firstRun ? DEFAULT_BACKFILL_DAYS : undefined),
          full: opts.full,
        })); break;
        case 'items': results.push(await syncItems(opts.itemBudget ?? DEFAULT_ITEM_BUDGET)); break;
        case 'analytics': results.push(await syncAnalytics(opts.analyticsLimit ?? 400)); break;
        case 'shipments': results.push(await syncShipments(opts.shipmentMax ?? 2000)); break;
        case 'catalog': results.push(await syncCatalog()); break;
      }
      const s = store.getSyncState();
      s.lastRun[step] = new Date().toISOString();
      store.patchSyncState({ lastRun: s.lastRun });
    }

    store.patchSyncState({ running: null, counts: store.storeStats() });
    return { results, stats: store.storeStats() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    store.patchSyncState({
      running: null,
      lastError: { what: results.at(-1)?.what ?? steps[0], at: new Date().toISOString(), message },
    });
    return { results, stats: store.storeStats(), error: message };
  }
}
