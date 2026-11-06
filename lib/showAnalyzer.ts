// ─── Show analyzer ─────────────────────────────────────────────────────────
//
// Four questions, answered off the two sheets the app already reads — the WN
// sales workbook and the live inventory workbook:
//
//   1. which shows performed best,
//   2. what ran in them, and in what order,
//   3. which of those winners are still in stock, so they can go back on air,
//   4. which ones we sold out of and should source again.
//
// Deliberately pure: the route fetches, this module decides, the page renders.
// Duration and voided-row handling are borrowed from hostDay/showRecords so a
// show's hours here never disagree with the leaderboard's.

import { isVoided, type SaleOrder } from './sampleData';
import { parseTimestamp, parseDurationStr, durationFromTimestamps, BUSINESS_TZ } from './hostDay';
import { tabToISO } from './showRecords';
import type { RunItem } from './runSheet';

// ─── Shows ──────────────────────────────────────────────────────────────────

export type ShowMetric = 'sales' | 'profit' | 'salesPerHour' | 'profitPerHour' | 'aov';

export const SHOW_METRICS: { key: ShowMetric; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'salesPerHour', label: 'Sales / hr' },
  { key: 'profitPerHour', label: 'Profit / hr' },
  { key: 'aov', label: 'AOV' },
];

/** Where in a show an item ran. */
export type SlotLabel = 'Opening' | 'Early' | 'Mid' | 'Late';

/** One item's run inside one show. */
export type ItemRun = {
  modelNum: string;
  productName: string;
  /** 1-based position in the sequence of *distinct items* the show ran. */
  runOrder: number;
  /** 0 at the first item, 1 at the last. null when the show ran a single item. */
  slotPct: number | null;
  units: number;
  revenue: number;
  profit: number;
  orders: number;
};

export type AnalyzedShow = {
  id: string;
  host: string;
  /** YYYY-MM-DD */
  date: string;
  livestream: number;
  sales: number;
  profit: number;
  orders: number;
  paidOrders: number;
  units: number;
  durationHours: number;
  salesPerHour: number | null;
  profitPerHour: number | null;
  aov: number | null;
  marginPct: number | null;
  /** Whether run order came from real clock times or from sheet row order. */
  orderSource: 'timestamp' | 'sheet';
  runs: ItemRun[];
};

const NO_MODEL = '(no model #)';

function modelKey(o: SaleOrder): string {
  return (o.modelNum || '').trim() || NO_MODEL;
}

export function slotLabel(pct: number | null): SlotLabel | null {
  if (pct === null) return null;
  if (pct < 0.15) return 'Opening';
  if (pct < 0.45) return 'Early';
  if (pct < 0.75) return 'Mid';
  return 'Late';
}

type ShowGroup = { host: string; date: string; livestream: number; rows: SaleOrder[] };

/** Group order rows into one record per host per livestream per date. */
export function buildShows(orders: SaleOrder[]): AnalyzedShow[] {
  const groups = new Map<string, ShowGroup>();

  for (const o of orders) {
    if (!o.host) continue;
    const date = tabToISO(o.tab);
    if (!date) continue;
    const livestream = o.livestream || 1;
    const id = `${o.host}|${date}|${livestream}`;
    const g = groups.get(id);
    if (g) g.rows.push(o);
    else groups.set(id, { host: o.host, date, livestream, rows: [o] });
  }

  return Array.from(groups.entries()).map(([id, g]) => analyzeShow(id, g));
}

function analyzeShow(id: string, group: ShowGroup): AnalyzedShow {
  const { host, date, livestream, rows } = group;

  const stamped = rows.map((o, i) => ({ o, i, ts: parseTimestamp(o.timestamp) }));
  const times = stamped.map(s => s.ts).filter((t): t is number => t !== null);

  // Some tabs put a show *length* ("02h 14m") on every row instead of a clock
  // time. That says nothing about sequence, so when the stamps don't vary we
  // fall back to the order the rows sit in the sheet — the order they were
  // entered — and label the show so the page can say which one it used.
  const useTs = new Set(times).size > 1;

  // One odd cell shouldn't throw the whole sequence out: carry the last real
  // time forward over rows that have none. Rows before the first parsable time
  // sort to the front, which is where the sheet already had them.
  let carry = -Infinity;
  const keyed = stamped.map(s => {
    if (s.ts !== null) carry = s.ts;
    return { ...s, sortTs: carry };
  });
  const sequence = useTs
    ? [...keyed].sort((a, b) => a.sortTs - b.sortTs || a.i - b.i)
    : keyed;

  type Acc = { name: string; units: number; revenue: number; profit: number; orders: number };
  const runOrder = new Map<string, number>();
  const byModel = new Map<string, Acc>();

  let sales = 0, profit = 0, units = 0, orders = 0, paidOrders = 0;
  let durStr: number | null = null;

  for (const { o, ts } of sequence) {
    const model = modelKey(o);

    // A failed or cancelled row still marks where the item ran — the host was
    // on air selling it — so it takes its place in the sequence. It just
    // contributes no money.
    if (!runOrder.has(model)) runOrder.set(model, runOrder.size + 1);

    let acc = byModel.get(model);
    if (!acc) {
      acc = { name: o.productName || '', units: 0, revenue: 0, profit: 0, orders: 0 };
      byModel.set(model, acc);
    }
    acc.name ||= o.productName || '';

    if (!isVoided(o)) {
      sales += o.sold;
      profit += o.profit;
      units += o.qty;
      orders++;
      if (o.sold > 0) paidOrders++;

      acc.units += o.qty;
      acc.revenue += o.sold;
      acc.profit += o.profit;
      acc.orders++;
    }

    if (ts === null && o.timestamp) {
      const d = parseDurationStr(o.timestamp);
      if (d !== null && (durStr === null || d > durStr)) durStr = d;
    }
  }

  const fromTs = durationFromTimestamps(times);
  const durationHours = fromTs > 0 ? fromTs : (durStr ?? 0);
  const distinct = runOrder.size;

  const runs: ItemRun[] = Array.from(byModel.entries())
    .map(([modelNum, a]) => {
      const pos = runOrder.get(modelNum)!;
      return {
        modelNum,
        productName: a.name,
        runOrder: pos,
        slotPct: distinct > 1 ? (pos - 1) / (distinct - 1) : null,
        units: a.units,
        revenue: a.revenue,
        profit: a.profit,
        orders: a.orders,
      };
    })
    .sort((a, b) => a.runOrder - b.runOrder);

  return {
    id,
    host,
    date,
    livestream,
    sales,
    profit,
    orders,
    paidOrders,
    units,
    durationHours,
    salesPerHour: durationHours > 0 ? sales / durationHours : null,
    profitPerHour: durationHours > 0 ? profit / durationHours : null,
    aov: paidOrders > 0 ? sales / paidOrders : null,
    marginPct: sales > 0 ? (profit / sales) * 100 : null,
    orderSource: useTs ? 'timestamp' : 'sheet',
    runs,
  };
}

export function metricValue(s: AnalyzedShow, metric: ShowMetric): number | null {
  switch (metric) {
    case 'sales': return s.sales;
    case 'profit': return s.profit;
    case 'salesPerHour': return s.salesPerHour;
    case 'profitPerHour': return s.profitPerHour;
    case 'aov': return s.aov;
  }
}

/**
 * Best shows first.
 *
 * A show the metric can't be computed for — a rate with no measurable
 * duration — sorts to the bottom rather than being dropped, so the count the
 * page reports still matches the shows in range.
 */
export function rankShows(shows: AnalyzedShow[], metric: ShowMetric, topN: number): AnalyzedShow[] {
  return [...shows]
    .sort((a, b) =>
      (metricValue(b, metric) ?? -Infinity) - (metricValue(a, metric) ?? -Infinity) ||
      b.sales - a.sales ||
      a.id.localeCompare(b.id))
    .slice(0, Math.max(0, topN));
}

// ─── Date window ────────────────────────────────────────────────────────────

/** Today in the business's own timezone, as YYYY-MM-DD. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** The earliest date still inside an N-day lookback, inclusive of today. */
export function cutoffDate(days: number, now: Date = new Date()): string {
  const [y, m, d] = businessToday(now).split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) - (days - 1) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** `days <= 0` means every show on record. */
export function filterShows(
  shows: AnalyzedShow[],
  opts: { days?: number; host?: string; now?: Date },
): AnalyzedShow[] {
  const from = opts.days && opts.days > 0 ? cutoffDate(opts.days, opts.now) : null;
  const host = (opts.host || '').trim();
  return shows.filter(s =>
    (!from || s.date >= from) &&
    (!host || s.host === host));
}

// ─── Items ──────────────────────────────────────────────────────────────────

export type ItemStock = {
  remaining: number;
  cost: number;
  retail: number;
  startPrice: number;
  description: string;
};

export type ItemStat = {
  modelNum: string;
  productName: string;
  units: number;
  revenue: number;
  profit: number;
  orders: number;
  marginPct: number | null;
  avgPrice: number | null;
  showsRun: number;
  unitsPerShow: number;
  revenuePerShow: number;
  profitPerShow: number;
  /** Mean position across the shows that recorded one. */
  avgSlotPct: number | null;
  slot: SlotLabel | null;
  firstRun: string;
  lastRun: string;
  hosts: string[];
  /** Live inventory, or null when the model number isn't on the inventory sheet. */
  stock: ItemStock | null;
};

function normModel(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Model numbers are typed by hand in two different workbooks, so an exact
 * match is tried first and a punctuation-insensitive one second — "48-20-8946"
 * and "4820 8946" are the same bit set.
 */
function buildInventoryIndex(inventory: RunItem[]) {
  const exact = new Map<string, RunItem>();
  const loose = new Map<string, RunItem>();
  for (const it of inventory) {
    const e = it.modelNum.trim().toUpperCase();
    if (e && !exact.has(e)) exact.set(e, it);
    const l = normModel(it.modelNum);
    if (l && !loose.has(l)) loose.set(l, it);
  }
  return (model: string): RunItem | null =>
    exact.get(model.trim().toUpperCase()) ?? loose.get(normModel(model)) ?? null;
}

/** Roll every run of every show up into one row per model number. */
export function itemStats(shows: AnalyzedShow[], inventory: RunItem[]): ItemStat[] {
  const lookup = buildInventoryIndex(inventory);

  type Acc = {
    name: string;
    units: number; revenue: number; profit: number; orders: number;
    shows: number; slots: number[]; hosts: Set<string>;
    firstRun: string; lastRun: string;
  };
  const map = new Map<string, Acc>();

  for (const show of shows) {
    for (const run of show.runs) {
      let a = map.get(run.modelNum);
      if (!a) {
        a = {
          name: run.productName, units: 0, revenue: 0, profit: 0, orders: 0,
          shows: 0, slots: [], hosts: new Set(),
          firstRun: show.date, lastRun: show.date,
        };
        map.set(run.modelNum, a);
      }
      a.name ||= run.productName;
      a.units += run.units;
      a.revenue += run.revenue;
      a.profit += run.profit;
      a.orders += run.orders;
      a.shows++;
      if (run.slotPct !== null) a.slots.push(run.slotPct);
      a.hosts.add(show.host);
      if (show.date < a.firstRun) a.firstRun = show.date;
      if (show.date > a.lastRun) a.lastRun = show.date;
    }
  }

  return Array.from(map.entries()).map(([modelNum, a]) => {
    const avgSlotPct = a.slots.length
      ? a.slots.reduce((s, v) => s + v, 0) / a.slots.length
      : null;
    const inv = modelNum === NO_MODEL ? null : lookup(modelNum);
    return {
      modelNum,
      productName: a.name || inv?.description || '',
      units: a.units,
      revenue: a.revenue,
      profit: a.profit,
      orders: a.orders,
      marginPct: a.revenue > 0 ? (a.profit / a.revenue) * 100 : null,
      avgPrice: a.units > 0 ? a.revenue / a.units : null,
      showsRun: a.shows,
      unitsPerShow: a.units / a.shows,
      revenuePerShow: a.revenue / a.shows,
      profitPerShow: a.profit / a.shows,
      avgSlotPct,
      slot: slotLabel(avgSlotPct),
      firstRun: a.firstRun,
      lastRun: a.lastRun,
      hosts: Array.from(a.hosts).sort(),
      stock: inv
        ? {
            remaining: inv.remaining,
            cost: inv.cost,
            retail: inv.retail,
            startPrice: inv.startPrice,
            description: inv.description,
          }
        : null,
    };
  });
}

// ─── Run list ───────────────────────────────────────────────────────────────

export type RunRank = 'profitPerShow' | 'revenuePerShow' | 'unitsPerShow' | 'marginPct';

export const RUN_RANKS: { key: RunRank; label: string }[] = [
  { key: 'profitPerShow', label: 'Profit per show' },
  { key: 'revenuePerShow', label: 'Sales per show' },
  { key: 'unitsPerShow', label: 'Units per show' },
  { key: 'marginPct', label: 'Margin %' },
];

export type RunListEntry = ItemStat & {
  /** 1-based position in the suggested running order. */
  position: number;
  suggestedQty: number;
  remaining: number;
};

function rankValue(i: ItemStat, rank: RunRank): number {
  switch (rank) {
    case 'profitPerShow': return i.profitPerShow;
    case 'revenuePerShow': return i.revenuePerShow;
    case 'unitsPerShow': return i.unitsPerShow;
    case 'marginPct': return i.marginPct ?? -Infinity;
  }
}

/**
 * The winners we can actually put on air, laid out as a running order.
 *
 * Two different sorts, on purpose: the *picking* is by how well the item did,
 * the *ordering* is by where in a show it did it. An item that consistently
 * landed in the opening ten minutes goes near the top, because that is the
 * slot it has a track record in. Items with no recorded slot keep their
 * ranking position and sit at the end rather than being guessed into one.
 */
export function buildRunList(
  items: ItemStat[],
  opts: { size: number; rank: RunRank },
): RunListEntry[] {
  const picked = items
    .filter(i => i.stock !== null && i.stock.remaining > 0 && i.revenue > 0)
    .sort((a, b) => rankValue(b, opts.rank) - rankValue(a, opts.rank) || b.revenue - a.revenue)
    .slice(0, Math.max(0, opts.size));

  return picked
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) =>
      (a.item.avgSlotPct ?? Infinity) - (b.item.avgSlotPct ?? Infinity) ||
      a.idx - b.idx)
    .map(({ item }, i) => {
      const remaining = item.stock!.remaining;
      return {
        ...item,
        position: i + 1,
        remaining,
        // What it typically shifts in one show, never more than we hold.
        suggestedQty: Math.max(1, Math.min(remaining, Math.round(item.unitsPerShow))),
      };
    });
}

// ─── Re-source ──────────────────────────────────────────────────────────────

export type ResourceReason = 'sold-out' | 'low-stock' | 'not-listed';

export const RESOURCE_LABEL: Record<ResourceReason, string> = {
  'sold-out': 'Sold out',
  'low-stock': 'Running low',
  'not-listed': 'Not on the inventory sheet',
};

export type ResourceEntry = ItemStat & {
  reason: ResourceReason;
  /** null when the model number isn't on the inventory sheet at all. */
  remaining: number | null;
};

/**
 * How definite a sourcing job each reason is. A model number the inventory
 * sheet has never heard of is usually a model number typed two different ways,
 * not something we ran out of — so however well it sold, it sits below the
 * items we know we are out of.
 */
const REASON_ORDER: Record<ResourceReason, number> = {
  'sold-out': 0,
  'low-stock': 1,
  'not-listed': 2,
};

/**
 * Items that earned their keep and that we can no longer run.
 *
 * Within a reason, ranked by total profit over the window rather than by
 * margin: a 60% margin on one $4 marker is not the thing to go buy a pallet of.
 */
export function buildResourceList(items: ItemStat[], lowStockAt: number): ResourceEntry[] {
  const out: ResourceEntry[] = [];

  for (const i of items) {
    if (i.revenue <= 0) continue;

    if (!i.stock) {
      out.push({ ...i, reason: 'not-listed', remaining: null });
    } else if (i.stock.remaining <= 0) {
      out.push({ ...i, reason: 'sold-out', remaining: i.stock.remaining });
    } else if (i.stock.remaining <= lowStockAt) {
      out.push({ ...i, reason: 'low-stock', remaining: i.stock.remaining });
    }
  }

  return out.sort((a, b) =>
    REASON_ORDER[a.reason] - REASON_ORDER[b.reason] ||
    b.profit - a.profit ||
    b.revenue - a.revenue);
}
