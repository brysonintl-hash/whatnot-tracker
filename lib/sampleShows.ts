// ─── Sample leaderboard data ───────────────────────────────────────────────
//
// Placeholder shows until the board is wired to the WN sheet. Deliberately
// written as ShowRecord[] — one row per show, the same shape real data takes —
// so connecting it later is a swap of this module, not a rewrite.
//
// The per-show figures are synthesised from a target profile per host, chosen
// so the pooled averages come out at the numbers the board was specced
// against. Splitting a total across shows doesn't change a pooled average, so
// the shows can vary in length and takings while the host's averages stay put.

import type { ShowRecord } from './leaderboard';

type HostProfile = {
  host: string;
  /** Total hours on air in the period, split across `shows`. */
  hours: number;
  shows: number;
  salesPerHour: number;
  ordersPerHour: number;
  aov: number;
  profitPerHour: number;
};

/** The current period — these are the headline numbers on the board. */
const CURRENT: HostProfile[] = [
  { host: 'Jason',   hours: 10, shows: 4, salesPerHour: 1420, ordersPerHour: 31, aov: 46, profitPerHour: 133.48 },
  { host: 'Khloe',   hours: 9,  shows: 4, salesPerHour: 1191, ordersPerHour: 24, aov: 74, profitPerHour: 103.61 },
  { host: 'Maya',    hours: 8,  shows: 3, salesPerHour: 1050, ordersPerHour: 19, aov: 55, profitPerHour: 117.60 },
  { host: 'William', hours: 7,  shows: 3, salesPerHour: 796,  ordersPerHour: 26, aov: 37, profitPerHour: 67.46 },
  { host: 'Derek',   hours: 6,  shows: 3, salesPerHour: 640,  ordersPerHour: 22, aov: 29, profitPerHour: 39.04 },
  // Under both thresholds, so the "Not enough data yet" list has someone in
  // it — an empty section reads like a broken one.
  { host: 'Trina',   hours: 3.2, shows: 2, salesPerHour: 980, ordersPerHour: 21, aov: 48, profitPerHour: 88.0 },
];

/**
 * The period before — only used for the rank-change arrows.
 * Ordered differently on purpose so the arrows have something to show:
 * Khloe led, Maya sat last, and both move when the current period is scored.
 */
const PREVIOUS: HostProfile[] = [
  { host: 'Khloe',   hours: 9,  shows: 4, salesPerHour: 1500, ordersPerHour: 28, aov: 80, profitPerHour: 150 },
  { host: 'Jason',   hours: 10, shows: 4, salesPerHour: 1300, ordersPerHour: 30, aov: 44, profitPerHour: 110 },
  { host: 'William', hours: 8,  shows: 3, salesPerHour: 1100, ordersPerHour: 27, aov: 42, profitPerHour: 95 },
  { host: 'Derek',   hours: 7,  shows: 3, salesPerHour: 900,  ordersPerHour: 25, aov: 36, profitPerHour: 70 },
  { host: 'Maya',    hours: 7,  shows: 3, salesPerHour: 700,  ordersPerHour: 15, aov: 48, profitPerHour: 60 },
];

/** Fixed multipliers so a show's length varies but the run is reproducible. */
const SHAPE = [1.15, 0.8, 1.1, 0.95, 1.05, 0.9];

function toISO(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Turn one profile into individual shows whose totals sum exactly to it.
 *
 * Each show takes a share of the hours and a proportional share of the money;
 * the last show absorbs whatever rounding left behind, so the host's pooled
 * averages land exactly on the profile.
 */
function showsFor(p: HostProfile, dates: number[]): ShowRecord[] {
  const totalSales = p.salesPerHour * p.hours;
  const totalOrders = Math.round(p.ordersPerHour * p.hours);
  const totalProfit = p.profitPerHour * p.hours;
  const totalPaid = Math.max(1, Math.round(totalSales / p.aov));

  const weights = Array.from({ length: p.shows }, (_, i) => SHAPE[i % SHAPE.length]);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const out: ShowRecord[] = [];
  let usedHours = 0, usedSales = 0, usedOrders = 0, usedProfit = 0, usedPaid = 0;

  for (let i = 0; i < p.shows; i++) {
    const isLast = i === p.shows - 1;
    const share = weights[i] / weightSum;

    const hours = isLast ? p.hours - usedHours : Math.round(p.hours * share * 100) / 100;
    const sales = isLast ? totalSales - usedSales : Math.round(totalSales * share * 100) / 100;
    const orders = isLast ? totalOrders - usedOrders : Math.round(totalOrders * share);
    const profit = isLast ? totalProfit - usedProfit : Math.round(totalProfit * share * 100) / 100;
    const paid = isLast ? totalPaid - usedPaid : Math.round(totalPaid * share);

    usedHours += hours; usedSales += sales; usedOrders += orders;
    usedProfit += profit; usedPaid += paid;

    out.push({
      host: p.host,
      date: toISO(dates[i % dates.length]),
      durationHours: Math.round(hours * 100) / 100,
      sales: Math.round(sales * 100) / 100,
      orders,
      grossProfit: Math.round(profit * 100) / 100,
      paidOrders: paid,
    });
  }

  return out;
}

const DAY = 86400000;

/**
 * Sample shows for the last 56 days: the most recent 28 carry the headline
 * numbers, the 28 before them give the arrows something to measure against.
 *
 * Dates are relative to `now` so the demo is never empty, and `now` is passed
 * in rather than read here so the output stays pure and testable.
 */
export function buildSampleShows(now: Date = new Date()): ShowRecord[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  // Spread shows through the window, most recent first, skipping today so
  // "this week" has a couple of shows rather than all of them.
  const currentDates = [1, 4, 8, 13, 19, 25].map(d => today - d * DAY);
  const previousDates = [31, 36, 42, 48, 53].map(d => today - d * DAY);

  return [
    ...CURRENT.flatMap(p => showsFor(p, currentDates)),
    ...PREVIOUS.flatMap(p => showsFor(p, previousDates)),
  ];
}
