// ─── The dashboard's headline numbers ──────────────────────────────────────
//
// Totals, a comparison with the period before, the series behind the charts,
// and a few plain-English takeaways — all from ShowPerf rows the metrics layer
// already produced. Pure, so the numbers can be tested against fixed shows.
//
// One rule governs everything here: profit is only ever compared with the
// revenue it was measured over. Sales come from Whatnot's analytics and cover
// every show; profit needs a purchase cost per item, which we only have for
// part of it. Dividing the second by the first produced "0.6% margin" on a
// business that really runs near 30% — so margin here is always profit over
// costed revenue, and how much of sales that covers is reported beside it.

import type { ShowPerf, HostPerf } from './metrics';
import { UNASSIGNED } from './metrics';
import { BUSINESS_TZ } from '../hostDay';

export type Totals = {
  shows: number;
  sales: number;
  earnings: number;
  hours: number;
  orders: number;
  giveaway: number;
  itemRevenue: number;
  costedRevenue: number;
  profit: number;
  salesPerHour: number | null;
  /** Profit over the revenue it was measured on. Null with nothing costed. */
  marginPct: number | null;
  /** How much of Whatnot's sales figure we hold item-level detail for. */
  itemCoveragePct: number;
  /** Of that item revenue, how much has a purchase cost. */
  costCoveragePct: number;
  /** The two above multiplied: the share of all sales the margin speaks for. */
  marginCoversPct: number;
  giveawayPct: number | null;
};

export function totalsOf(shows: ShowPerf[]): Totals {
  let sales = 0, earnings = 0, hours = 0, orders = 0, giveaway = 0;
  let itemRevenue = 0, costedRevenue = 0, profit = 0;
  for (const s of shows) {
    sales += s.sales;
    earnings += s.estimatedEarnings;
    hours += s.hours;
    orders += s.ordersCount;
    giveaway += s.giveawaySpend;
    itemRevenue += s.itemRevenue;
    costedRevenue += s.costedRevenue;
    profit += s.grossProfit;
  }
  const itemCoveragePct = sales > 0 ? Math.min(100, (itemRevenue / sales) * 100) : 0;
  const costCoveragePct = itemRevenue > 0 ? (costedRevenue / itemRevenue) * 100 : 0;
  return {
    shows: shows.length,
    sales, earnings, hours, orders, giveaway, itemRevenue, costedRevenue, profit,
    salesPerHour: hours > 0 ? sales / hours : null,
    marginPct: costedRevenue > 0 ? (profit / costedRevenue) * 100 : null,
    itemCoveragePct,
    costCoveragePct,
    marginCoversPct: sales > 0 ? Math.min(100, (costedRevenue / sales) * 100) : 0,
    giveawayPct: sales > 0 ? (giveaway / sales) * 100 : null,
  };
}

// ─── Change against the previous period ────────────────────────────────────

export type Delta = {
  /** Percent change, or for a rate like margin, the change in points. */
  value: number;
  unit: 'pct' | 'pts';
  /** Whether this direction is good news for this metric. */
  good: boolean;
};

const pctChange = (now: number, before: number): number | null =>
  before > 0 ? ((now - before) / before) * 100 : null;

export type Deltas = {
  sales: Delta | null;
  margin: Delta | null;
  hours: Delta | null;
  giveaway: Delta | null;
};

/**
 * Change against the same-length window before this one.
 *
 * Profit dollars are deliberately not compared: how much of each period has
 * been costed differs, so a jump in profit can be nothing more than the
 * backfill catching up. Margin is a rate over costed revenue, which does
 * compare fairly — so that is what the profit tile's arrow tracks.
 */
export function deltasOf(now: Totals, before: Totals | null): Deltas {
  if (!before || before.shows === 0) return { sales: null, margin: null, hours: null, giveaway: null };

  const sales = pctChange(now.sales, before.sales);
  const hours = pctChange(now.hours, before.hours);
  // Giveaway cost is judged as a share of sales: spending more on a busier
  // week is not by itself bad news.
  const give = now.giveawayPct != null && before.giveawayPct != null
    ? now.giveawayPct - before.giveawayPct : null;
  const margin = now.marginPct != null && before.marginPct != null
    ? now.marginPct - before.marginPct : null;

  return {
    sales: sales == null ? null : { value: sales, unit: 'pct', good: sales >= 0 },
    hours: hours == null ? null : { value: hours, unit: 'pct', good: hours >= 0 },
    margin: margin == null ? null : { value: margin, unit: 'pts', good: margin >= 0 },
    giveaway: give == null ? null : { value: give, unit: 'pts', good: give <= 0 },
  };
}

// ─── Series for the charts ──────────────────────────────────────────────────

export type SeriesPoint = {
  /** YYYY-MM-DD: the day, or the Monday of the week when bucketed weekly. */
  date: string;
  sales: number;
  profit: number;
  costedRevenue: number;
  hours: number;
  giveaway: number;
  shows: number;
};

/** The calendar day a show happened on, in the business's own timezone. */
export function businessDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7));
}

/**
 * One point per day, or per week once the range is long enough that daily
 * points would turn the line into noise.
 *
 * Days with no show are included as zeros. Leaving them out would draw a
 * straight line across a week off air, implying sales that never happened.
 */
export function seriesOf(
  shows: ShowPerf[],
  range: { from: string; to: string },
): { bucket: 'day' | 'week'; points: SeriesPoint[] } {
  const spanDays = Math.round(
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
  const bucket: 'day' | 'week' = spanDays > 92 ? 'week' : 'day';
  const keyOf = (ymd: string) => (bucket === 'week' ? mondayOf(ymd) : ymd);

  const map = new Map<string, SeriesPoint>();
  const blank = (date: string): SeriesPoint =>
    ({ date, sales: 0, profit: 0, costedRevenue: 0, hours: 0, giveaway: 0, shows: 0 });

  // Every bucket in range first, so empty stretches stay visible.
  for (let d = keyOf(range.from); d <= range.to; d = addDays(d, bucket === 'week' ? 7 : 1)) {
    map.set(d, blank(d));
  }

  for (const s of shows) {
    if (!s.startedAt) continue;
    const k = keyOf(businessDate(s.startedAt));
    const p = map.get(k) ?? blank(k);
    p.sales += s.sales;
    p.profit += s.grossProfit;
    p.costedRevenue += s.costedRevenue;
    p.hours += s.hours;
    p.giveaway += s.giveawaySpend;
    p.shows++;
    map.set(k, p);
  }

  return {
    bucket,
    points: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ─── Takeaways ──────────────────────────────────────────────────────────────

export type Takeaway = { tone: 'good' | 'warn' | 'info'; text: string; action?: 'setup' };

/** Fewer shows than this and a per-hour rate says more about luck than the host. */
export const MIN_SHOWS_TO_RANK = 3;

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * A handful of sentences that say something the tiles don't.
 *
 * Restating the tiles in prose adds nothing, so these lead with comparisons
 * between hosts and with what is holding the numbers back. Every sentence is
 * guarded: no ranking from fewer than three shows, no margin claim from a
 * sliver of costed revenue.
 */
export function takeawaysOf(t: Totals, hosts: HostPerf[], unassignedShows: number): Takeaway[] {
  const out: Takeaway[] = [];
  const real = hosts.filter(h => h.host !== UNASSIGNED && h.shows >= MIN_SHOWS_TO_RANK && h.salesPerHour != null);

  if (real.length >= 2) {
    const ranked = [...real].sort((a, b) => (b.salesPerHour ?? 0) - (a.salesPerHour ?? 0));
    const top = ranked[0], last = ranked[ranked.length - 1];
    const gap = top.salesPerHour! / last.salesPerHour!;
    out.push({
      tone: 'good',
      text: `${top.host} leads on sales per hour at ${money(top.salesPerHour!)}/hr over ${top.shows} shows`
        + (gap >= 1.15 ? ` — ${Math.round((gap - 1) * 100)}% ahead of ${last.host}.` : '.'),
    });
  }

  if (t.giveawayPct != null && real.length >= 2) {
    const withGive = real.filter(h => h.giveawayPctOfSales != null);
    const high = [...withGive].sort((a, b) => (b.giveawayPctOfSales ?? 0) - (a.giveawayPctOfSales ?? 0))[0];
    if (high && high.giveawayPctOfSales! > t.giveawayPct * 1.25) {
      out.push({
        tone: 'info',
        text: `Giveaways cost ${t.giveawayPct.toFixed(2)}% of sales overall; ${high.host}'s run highest at ${high.giveawayPctOfSales!.toFixed(2)}%.`,
      });
    }
  }

  // A margin is only worth stating once it speaks for a real share of sales.
  if (t.marginPct != null && t.marginCoversPct >= 25) {
    out.push({
      tone: t.marginPct >= 20 ? 'good' : 'warn',
      text: `Items we can cost are selling at a ${t.marginPct.toFixed(1)}% margin, across ${money(t.costedRevenue)} of sales.`,
    });
  }

  if (t.sales > 0 && t.itemCoveragePct < 80) {
    out.push({
      tone: 'warn',
      text: `Item detail covers only ${Math.round(t.itemCoveragePct)}% of sales, so profit is partial. Run "Continue item backfill" on the Setup tab a few times.`,
      action: 'setup',
    });
  }

  if (unassignedShows > 0) {
    out.push({
      tone: 'warn',
      text: `${unassignedShows} show${unassignedShows === 1 ? ' has' : 's have'} no host and sit${unassignedShows === 1 ? 's' : ''} under Unassigned instead of counting for anyone. "Seed hosts from the sales sheet" on Setup fills most of them.`,
      action: 'setup',
    });
  }

  return out;
}
