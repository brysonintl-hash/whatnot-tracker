// ─── Whatnot Seller API client ─────────────────────────────────────────────
//
// One place that knows about the token, the rate limit and the cursor, so the
// rest of the app asks for orders and gets orders.
//
// Three things learned from the live API that shape this file:
//
//   1. The limit is advertised as 10 req/s but the server actually sends
//      `ratelimit-limit: 45, 45;w=1`. We read the headers rather than trust
//      either number, and fall back to a conservative rate if they're absent.
//   2. /orders silently ignores every query parameter except limit and cursor.
//      A filter that looks like it worked did not, so callers page and filter
//      in memory — see listOrders.
//   3. Orders come back strictly newest-first, which is what makes an
//      incremental sync cheap: page until a known id turns up, then stop.

import type {
  WnPage, WnOrder, WnOrderItem, WnShow, WnShowStatus, WnShowAnalytics,
  WnProduct, WnVariant, WnShipment, WnShipmentItem, WnMe,
} from './types';

const BASE = process.env.WHATNOT_API_BASE || 'https://api.whatnot.com/seller-api/rest/v2';

/** The biggest page the API will serve; anything over 50 is a 422. */
export const MAX_PAGE = 50;

export class WhatnotError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'WhatnotError';
  }
}

export function hasToken(): boolean {
  return Boolean(process.env.WHATNOT_API_KEY);
}

function token(): string {
  const t = process.env.WHATNOT_API_KEY;
  if (!t) throw new WhatnotError('WHATNOT_API_KEY is not set', 0, 'no-token');
  return t;
}

// ─── Rate limiting ──────────────────────────────────────────────────────────
//
// A single shared gate. Every call waits its turn, so a sync and a page load
// racing each other still add up to one budget rather than two.

let budget = Number(process.env.WHATNOT_RATE_LIMIT) || 10; // until the server says otherwise
let windowStart = 0;
let usedInWindow = 0;
let chain: Promise<void> = Promise.resolve();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Serialises callers and keeps them under `budget` requests per second. */
function gate<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      usedInWindow = 0;
    }
    // Leave one request of headroom: the budget is shared with any other app
    // on this seller account, and the remaining count is only an estimate.
    if (usedInWindow >= Math.max(1, budget - 1)) {
      await sleep(1000 - (now - windowStart));
      windowStart = Date.now();
      usedInWindow = 0;
    }
    usedInWindow++;
  });
  chain = run.catch(() => {});
  return run.then(fn);
}

function readLimitHeaders(res: Response): void {
  // "45, 45;w=1" — the first number is the ceiling for the current policy.
  const limit = res.headers.get('ratelimit-limit');
  if (!limit) return;
  const n = parseInt(limit.split(',')[0].trim(), 10);
  if (Number.isFinite(n) && n > 0) budget = n;
}

// ─── Core request ───────────────────────────────────────────────────────────

const MAX_RETRIES = 4;

/**
 * `retryServerErrors: false` is for calls that change something on Whatnot.
 * A 5xx after the server has acted would otherwise send the change twice;
 * a 429 is still retried, because a refused request was never acted on.
 */
async function request<T>(path: string, init?: RequestInit, opts: { retryServerErrors?: boolean } = {}): Promise<T> {
  const retryServerErrors = opts.retryServerErrors ?? true;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await gate(() =>
      fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token()}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
        cache: 'no-store',
      }));

    readLimitHeaders(res);
    const requestId = res.headers.get('x-request-id') ?? undefined;

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    // 429 tells us exactly how long to wait; 5xx gets exponential backoff.
    if (res.status === 429 || (retryServerErrors && res.status >= 500)) {
      if (attempt === MAX_RETRIES) {
        throw new WhatnotError(`${res.status} after ${MAX_RETRIES} retries`, res.status, undefined, requestId);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(8000, 2 ** attempt * 400) + Math.random() * 250; // jitter
      await sleep(wait);
      continue;
    }

    let detail = res.statusText;
    let type: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail || body.title || detail;
      type = body.type;
    } catch { /* non-JSON error body */ }
    throw new WhatnotError(detail, res.status, type, requestId);
  }

  throw lastErr instanceof Error ? lastErr : new WhatnotError('request failed', 0);
}

// ─── Pagination ─────────────────────────────────────────────────────────────

export type PageOpts = {
  /** Stop once this many records have been collected. */
  max?: number;
  /**
   * Called with each page. Return false to stop paging — this is how an
   * incremental sync bails out as soon as it reaches familiar ground.
   */
  onPage?: (rows: unknown[], total: number) => boolean | void;
};

async function pageAll<T>(path: string, opts: PageOpts = {}): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;

  do {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${path}${sep}limit=${MAX_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page: WnPage<T> = await request<WnPage<T>>(url);
    out.push(...page.data);

    if (opts.onPage?.(page.data, out.length) === false) break;
    if (opts.max && out.length >= opts.max) return out.slice(0, opts.max);

    cursor = page.next_cursor;
  } while (cursor);

  return out;
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

export const whatnot = {
  me: () => request<WnMe>('/users/me'),

  /**
   * Newest first. The API takes no filters, so `since` and `knownIds` are
   * applied here: we page from the top and stop as soon as the data stops
   * being new, rather than pulling all ~79k orders every time.
   */
  async listOrders(opts: PageOpts & { since?: string; knownIds?: Set<string> } = {}): Promise<WnOrder[]> {
    const out: WnOrder[] = [];
    let stop = false;

    await pageAll<WnOrder>('/orders', {
      onPage: rows => {
        for (const o of rows as WnOrder[]) {
          // Newest-first, so the first order older than `since` — or the
          // first one we already hold — means every order after it is too.
          if (opts.since && o.created_at < opts.since) { stop = true; break; }
          if (opts.knownIds?.has(o.id)) { stop = true; break; }
          out.push(o);
          if (opts.max && out.length >= opts.max) { stop = true; break; }
        }
        if (opts.onPage?.(out, out.length) === false) stop = true;
        return !stop;
      },
    });

    return out;
  },

  getOrder: (id: string) => request<WnOrder>(`/orders/${encodeURIComponent(id)}`),

  /** One call per order — the only way to get what was actually sold. */
  listOrderItems: (orderId: string) =>
    pageAll<WnOrderItem>(`/orders/${encodeURIComponent(orderId)}/items`),

  /**
   * `status` is one of the few filters the API really honours — without
   * status=ended you only get upcoming shows.
   */
  listShows: (status?: WnShowStatus, opts: PageOpts = {}) =>
    pageAll<WnShow>(`/shows${status ? `?status=${status}` : ''}`, opts),

  getShow: (id: string) => request<WnShow>(`/shows/${encodeURIComponent(id)}`),

  getShowAnalytics: (showId: string) =>
    request<WnShowAnalytics>(`/analytics/shows/${encodeURIComponent(showId)}`),

  listProducts: (opts: PageOpts = {}) => pageAll<WnProduct>('/products', opts),
  getProduct: (id: string) => request<WnProduct>(`/products/${encodeURIComponent(id)}`),

  /** Stock and starting prices live here, not on the product. */
  listVariants: (productId: string) =>
    pageAll<WnVariant>(`/products/${encodeURIComponent(productId)}/variants`),

  listShipments: (opts: PageOpts = {}) => pageAll<WnShipment>('/shipments', opts),
  getShipment: (id: string) => request<WnShipment>(`/shipments/${encodeURIComponent(id)}`),
  listShipmentItems: (shipmentId: string) =>
    pageAll<WnShipmentItem>(`/shipments/${encodeURIComponent(shipmentId)}/items`),

  /**
   * Newest first, stopping at the first parcel created before `since`.
   * Like /orders, /shipments takes no date filter.
   */
  async listShipmentsSince(since: string, max = 3000): Promise<WnShipment[]> {
    const out: WnShipment[] = [];
    let stop = false;
    await pageAll<WnShipment>('/shipments', {
      onPage: rows => {
        for (const s of rows as WnShipment[]) {
          if (s.created_at && s.created_at < since) { stop = true; break; }
          out.push(s);
          if (out.length >= max) { stop = true; break; }
        }
        return !stop;
      },
    });
    return out;
  },

  /**
   * Ask Whatnot to buy the label with the shipment's saved settings — the same
   * thing as the Generate Label button in Seller Hub. Needs write:shipments.
   *
   * A 200 only means queued: the label turns up on the shipment a few seconds
   * later, and a failure in Whatnot's worker after that is not reported back.
   */
  generateLabel: (shipmentId: string) =>
    request<{ shipment_id: string }>(
      `/shipments/${encodeURIComponent(shipmentId)}/generate_label`,
      { method: 'POST' },
      { retryServerErrors: false },
    ),

  /** Current per-second ceiling, as last reported by the server. */
  rateBudget: () => budget,
};

/**
 * Run `fn` over `items` with a few in flight at once.
 *
 * Order items are one call per order, so a 90-day backfill is tens of
 * thousands of requests. The shared gate above already caps the real rate;
 * this just stops the whole set being awaited one at a time.
 */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      onProgress?.(++done, items.length);
    }
  });

  await Promise.all(workers);
  return results;
}
