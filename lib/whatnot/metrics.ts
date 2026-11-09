// ─── Show and host performance ─────────────────────────────────────────────
//
// Priority 1: actual item-level margin per show, and per host.
//
// Three sources meet here:
//   • Whatnot analytics — sales, payout after fees, real stream minutes,
//     giveaway spend. Authoritative; we never recompute what it already says.
//   • Order items + the inventory sheet — cost, and therefore margin. Ours.
//   • The host assignment store — who was on camera, which Whatnot cannot say.
//
// Kept pure: callers hand in the rows, this decides, nothing fetches.

import type { WnOrder, WnOrderItem, WnShow, WnShowAnalytics } from './types';
import { money } from './types';
import { resolveItems, matchReport, type CostRow, type MatchReport, type ResolvedItem } from './sku';
import type { HostAssignment } from './store';

export const UNASSIGNED = 'Unassigned';

export type ShowPerf = {
  showId: string;
  title: string;
  host: string;
  /** YYYY-MM-DD, from when the stream actually started. */
  date: string;
  startedAt: string | null;
  endedAt: string | null;

  /** Whatnot's own figures. */
  streamMinutes: number;
  hours: number;
  sales: number;
  estimatedEarnings: number;
  ordersCount: number;
  aov: number | null;
  giveawayOrders: number;
  /** Positive = what the giveaways cost us. The API reports it negative. */
  giveawaySpend: number;
  buyers: number;
  firstTimeBuyers: number;
  returningBuyers: number;
  maxConcurrentViewers: number;
  distinctViewers: number;

  /** Ours, from the cost join. */
  unitsSold: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  /** Share of this show's item revenue we could put a cost against. */
  costCoveragePct: number;

  /** Rates. Null when the show has no measured airtime. */
  salesPerHour: number | null;
  profitPerHour: number | null;
  ordersPerHour: number | null;
  earningsPerHour: number | null;

  /** True when analytics hasn't been fetched — figures are order-derived only. */
  analyticsMissing: boolean;
};

export type HostPerf = {
  host: string;
  shows: number;
  hours: number;
  sales: number;
  estimatedEarnings: number;
  cogs: number;
  grossProfit: number;
  marginPct: number | null;
  unitsSold: number;
  orders: number;
  aov: number | null;
  giveawayOrders: number;
  giveawaySpend: number;
  /** Giveaway cost as a share of what the host sold. */
  giveawayPctOfSales: number | null;

  salesPerHour: number | null;
  profitPerHour: number | null;
  ordersPerHour: number | null;
  earningsPerHour: number | null;

  buyers: number;
  firstTimeBuyers: number;

  /**
   * Units sold ÷ (units sold + units still on the shelf), across the SKUs this
   * host ran.
   *
   * NOT the textbook figure. True sell-through is sold ÷ offered, and Whatnot
   * exposes no way to read a show's lineup — merchandising is write-only — so
   * "offered" is unknowable. This answers a narrower question that is still
   * worth asking: of the stock we hold of what they ran, how much moved.
   */
  stockSellThroughPct: number | null;

  costCoveragePct: number;
};

export type PerfInput = {
  shows: WnShow[];
  orders: WnOrder[];
  items: WnOrderItem[];
  analytics: Record<string, WnShowAnalytics>;
  hosts: Record<string, HostAssignment>;
  costs: CostRow[];
  /** Current stock by model number, for the sell-through denominator. */
  stock?: Record<string, number>;
};

export type PerfOutput = {
  shows: ShowPerf[];
  hosts: HostPerf[];
  match: MatchReport;
};

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Shows ordered newest first, each costed, then rolled up per host. */
export function buildPerformance(input: PerfInput): PerfOutput {
  const resolved = resolveItems(input.items, input.costs);
  const match = matchReport(resolved);

  // order id -> show id, so an item can find its show through its order.
  const orderToShow = new Map<string, string>();
  const orderCancelled = new Set<string>();
  for (const o of input.orders) {
    if (o.show_id) orderToShow.set(o.id, o.show_id);
    if (o.cancelled_at) orderCancelled.add(o.id);
  }

  type Agg = {
    units: number; cogs: number; revenue: number;
    covered: number; total: number;
    models: Map<string, number>;
  };
  const byShow = new Map<string, Agg>();
  const blank = (): Agg => ({ units: 0, cogs: 0, revenue: 0, covered: 0, total: 0, models: new Map() });

  for (const r of resolved) {
    const showId = orderToShow.get(r.item.order_id);
    if (!showId) continue;
    // A cancelled order never paid out, so it contributes no money.
    if (orderCancelled.has(r.item.order_id)) continue;

    let a = byShow.get(showId);
    if (!a) { a = blank(); byShow.set(showId, a); }

    a.units += r.units;
    a.revenue += r.revenue;
    a.total += r.revenue;
    if (r.cogs !== null) { a.cogs += r.cogs; a.covered += r.revenue; }
    if (r.modelNum) a.models.set(r.modelNum, (a.models.get(r.modelNum) ?? 0) + r.units);
  }

  const shows: ShowPerf[] = input.shows
    .filter(s => s.status === 'ended')
    .map(s => {
      const an = input.analytics[s.id];
      const agg = byShow.get(s.id) ?? blank();
      const host = input.hosts[s.id]?.host || UNASSIGNED;

      const streamMinutes = an?.stream_minutes ?? 0;
      const hours = streamMinutes / 60;
      // Whatnot's sales figure is the whole show; ours only covers the orders
      // we have items for. Prefer theirs and fall back to ours.
      const sales = an ? money(an.sales) : agg.revenue;
      const grossProfit = agg.covered > 0 ? agg.covered - agg.cogs : 0;
      const startedAt = an?.start_time ?? s.scheduled_start_at;

      return {
        showId: s.id,
        title: s.title,
        host,
        date: (startedAt ?? s.created_at).slice(0, 10),
        startedAt: startedAt ?? null,
        endedAt: s.ended_at,

        streamMinutes,
        hours,
        sales,
        estimatedEarnings: an ? money(an.estimated_earnings) : 0,
        ordersCount: an?.orders_count ?? 0,
        aov: an ? money(an.average_order_value) : null,
        giveawayOrders: an?.giveaway_orders_count ?? 0,
        giveawaySpend: an ? Math.abs(money(an.giveaway_spend)) : 0,
        buyers: an?.buyers_count ?? 0,
        firstTimeBuyers: an?.first_time_buyers_count ?? 0,
        returningBuyers: an?.returning_buyers_count ?? 0,
        maxConcurrentViewers: an?.max_concurrent_viewers ?? 0,
        distinctViewers: an?.distinct_viewers_count ?? 0,

        unitsSold: agg.units,
        cogs: agg.cogs,
        grossProfit,
        // Margin is measured only over the revenue we could cost, so a thin
        // cost file understates coverage rather than inventing a margin.
        marginPct: agg.covered > 0 ? (grossProfit / agg.covered) * 100 : null,
        costCoveragePct: agg.total > 0 ? (agg.covered / agg.total) * 100 : 0,

        salesPerHour: div(sales, hours),
        profitPerHour: div(grossProfit, hours),
        ordersPerHour: div(an?.orders_count ?? 0, hours),
        earningsPerHour: div(an ? money(an.estimated_earnings) : 0, hours),

        analyticsMissing: !an,
      };
    })
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  return { shows, hosts: rollUpHosts(shows, byShow, input.stock ?? {}), match };
}

function rollUpHosts(
  shows: ShowPerf[],
  byShow: Map<string, { units: number; cogs: number; covered: number; total: number; models: Map<string, number> }>,
  stock: Record<string, number>,
): HostPerf[] {
  type Acc = {
    shows: number; hours: number; sales: number; earnings: number;
    cogs: number; covered: number; total: number; units: number; orders: number;
    giveawayOrders: number; giveawaySpend: number;
    buyers: number; firstTimeBuyers: number;
    models: Map<string, number>;
  };
  const map = new Map<string, Acc>();

  for (const s of shows) {
    let a = map.get(s.host);
    if (!a) {
      a = {
        shows: 0, hours: 0, sales: 0, earnings: 0, cogs: 0, covered: 0, total: 0,
        units: 0, orders: 0, giveawayOrders: 0, giveawaySpend: 0,
        buyers: 0, firstTimeBuyers: 0, models: new Map(),
      };
      map.set(s.host, a);
    }
    const agg = byShow.get(s.showId);

    a.shows++;
    a.hours += s.hours;
    a.sales += s.sales;
    a.earnings += s.estimatedEarnings;
    a.cogs += s.cogs;
    a.covered += agg?.covered ?? 0;
    a.total += agg?.total ?? 0;
    a.units += s.unitsSold;
    a.orders += s.ordersCount;
    a.giveawayOrders += s.giveawayOrders;
    a.giveawaySpend += s.giveawaySpend;
    a.buyers += s.buyers;
    a.firstTimeBuyers += s.firstTimeBuyers;
    if (agg) {
      for (const [m, u] of Array.from(agg.models.entries())) {
        a.models.set(m, (a.models.get(m) ?? 0) + u);
      }
    }
  }

  return Array.from(map.entries())
    .map(([host, a]) => {
      const grossProfit = a.covered - a.cogs;

      // Sell-through denominator: everything of these SKUs we have ever had,
      // approximated as what moved plus what is still on the shelf.
      let sold = 0, onHand = 0;
      for (const [model, units] of Array.from(a.models.entries())) {
        sold += units;
        onHand += stock[model] ?? 0;
      }
      const denom = sold + onHand;

      return {
        host,
        shows: a.shows,
        hours: a.hours,
        sales: a.sales,
        estimatedEarnings: a.earnings,
        cogs: a.cogs,
        grossProfit,
        marginPct: a.covered > 0 ? (grossProfit / a.covered) * 100 : null,
        unitsSold: a.units,
        orders: a.orders,
        aov: div(a.sales, a.orders),
        giveawayOrders: a.giveawayOrders,
        giveawaySpend: a.giveawaySpend,
        giveawayPctOfSales: a.sales > 0 ? (a.giveawaySpend / a.sales) * 100 : null,

        salesPerHour: div(a.sales, a.hours),
        profitPerHour: div(grossProfit, a.hours),
        ordersPerHour: div(a.orders, a.hours),
        earningsPerHour: div(a.earnings, a.hours),

        buyers: a.buyers,
        firstTimeBuyers: a.firstTimeBuyers,

        stockSellThroughPct: denom > 0 ? (sold / denom) * 100 : null,
        costCoveragePct: a.total > 0 ? (a.covered / a.total) * 100 : 0,
      };
    })
    // Unassigned shows are a data-entry job, not a host — always last.
    .sort((a, b) =>
      (a.host === UNASSIGNED ? 1 : 0) - (b.host === UNASSIGNED ? 1 : 0) ||
      (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity) ||
      b.sales - a.sales);
}

/** Item-level margin across the window — the "which SKU actually made money" table. */
export type ItemPerf = {
  modelNum: string | null;
  title: string;
  units: number;
  revenue: number;
  cogs: number | null;
  grossProfit: number | null;
  marginPct: number | null;
  avgPrice: number | null;
  unitCost: number | null;
  orders: number;
  costed: boolean;
};

export function buildItemPerformance(resolved: ResolvedItem[]): ItemPerf[] {
  type Acc = {
    title: string; units: number; revenue: number; cogs: number;
    costed: boolean; orders: Set<string>; unitCost: number | null;
  };
  const map = new Map<string, Acc>();

  for (const r of resolved) {
    // Items we could not identify at all are pooled by title, so they still
    // show up rather than silently vanishing from the table.
    const key = r.modelNum ?? `title:${r.item.purchased_item?.title ?? 'unknown'}`;
    let a = map.get(key);
    if (!a) {
      a = {
        title: r.item.purchased_item?.title ?? '', units: 0, revenue: 0,
        cogs: 0, costed: false, orders: new Set(), unitCost: r.unitCost,
      };
      map.set(key, a);
    }
    a.units += r.units;
    a.revenue += r.revenue;
    a.orders.add(r.item.order_id);
    if (r.cogs !== null) { a.cogs += r.cogs; a.costed = true; a.unitCost = r.unitCost; }
  }

  return Array.from(map.entries())
    .map(([key, a]) => ({
      modelNum: key.startsWith('title:') ? null : key,
      title: a.title,
      units: a.units,
      revenue: a.revenue,
      cogs: a.costed ? a.cogs : null,
      grossProfit: a.costed ? a.revenue - a.cogs : null,
      marginPct: a.costed && a.revenue > 0 ? ((a.revenue - a.cogs) / a.revenue) * 100 : null,
      avgPrice: a.units > 0 ? a.revenue / a.units : null,
      unitCost: a.unitCost,
      orders: a.orders.size,
      costed: a.costed,
    }))
    .sort((a, b) => (b.grossProfit ?? -Infinity) - (a.grossProfit ?? -Infinity) || b.revenue - a.revenue);
}
