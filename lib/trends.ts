// ─── Show trends ───────────────────────────────────────────────────────────
//
// Pace series for the trend strip on each host card. Kept pure and free of
// formatting so it can be tested directly: callers turn the timestamps into
// labels themselves.

import { MAX_GAP_MS } from './hostDay';

export type TrendPoint = {
  /** Epoch ms of the order this point was measured at. */
  ts: number;
  value: number;
};

/** One order, reduced to what a trend needs. */
export type TrendOrder = { ts: number; sold: number };

/** The metrics charted on the strip — one per headline tile. */
export type TrendMetric = 'sales' | 'orders' | 'aov';

/** The three pace windows Whatnot offers on its Trends tab. */
export const TREND_WINDOWS: { key: string; label: string; minutes: number | null }[] = [
  { key: 'show', label: 'Entire Show', minutes: null },
  { key: 'w30', label: 'Past 30 mins', minutes: 30 },
  { key: 'w5', label: 'Past 5 mins', minutes: 5 },
];

/**
 * A metric's value over the course of a show, one point per order.
 *
 * With `windowMinutes === null` this is the running figure — everything so far
 * divided by hours on air so far. That is why it swings wildly in the opening
 * minutes and then settles, the shape Whatnot's own chart shows, and it uses
 * the same gap-capped duration as the rest of the page, so the last point is
 * exactly the number on the host's tile.
 *
 * With a window it reports the trailing N minutes at each point, which is what
 * reveals where a show actually sped up or stalled.
 *
 * AOV is an average rather than a rate, so it is never divided by hours:
 * paid sales ÷ paid orders, over the same span.
 *
 * The first point is always 0 — at the opening order no time has elapsed, so
 * there is no rate to report yet.
 */
export function buildTrendSeries(
  orders: TrendOrder[],
  metric: TrendMetric,
  windowMinutes: number | null,
): TrendPoint[] {
  const rows = [...orders].sort((a, b) => a.ts - b.ts);
  if (rows.length < 2) return [];

  // Giveaways go out at $0 and would drag AOV toward zero.
  const paid = (o: TrendOrder) => o.sold > 0;

  const points: TrendPoint[] = [{ ts: rows[0].ts, value: 0 }];
  let onAirMs = 0;
  let runSold = rows[0].sold;
  let runPaidSold = paid(rows[0]) ? rows[0].sold : 0;
  let runPaidCount = paid(rows[0]) ? 1 : 0;

  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].ts - rows[i - 1].ts;
    // A long gap is the host being off air between shows, not slow selling.
    if (gap <= MAX_GAP_MS) onAirMs += gap;

    runSold += rows[i].sold;
    if (paid(rows[i])) {
      runPaidSold += rows[i].sold;
      runPaidCount++;
    }

    let value = 0;
    if (windowMinutes === null) {
      const hours = onAirMs / 3600000;
      if (metric === 'aov') {
        value = runPaidCount > 0 ? runPaidSold / runPaidCount : 0;
      } else if (hours > 0) {
        value = metric === 'sales' ? runSold / hours : (i + 1) / hours;
      }
    } else {
      const from = rows[i].ts - windowMinutes * 60000;
      let count = 0, sold = 0, paidSold = 0, paidCount = 0;
      for (let j = i; j >= 0 && rows[j].ts > from; j--) {
        count++;
        sold += rows[j].sold;
        if (paid(rows[j])) { paidSold += rows[j].sold; paidCount++; }
      }
      if (metric === 'aov') {
        value = paidCount > 0 ? paidSold / paidCount : 0;
      } else {
        const hours = windowMinutes / 60;
        value = metric === 'sales' ? sold / hours : count / hours;
      }
    }

    points.push({ ts: rows[i].ts, value });
  }

  return points;
}
