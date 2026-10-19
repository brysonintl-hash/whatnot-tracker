// ─── Show trends ───────────────────────────────────────────────────────────
//
// Order-pace series for the Performance page's Trends tab. Kept pure and free
// of formatting so it can be tested directly: callers turn the timestamps into
// labels themselves.

import { MAX_GAP_MS } from './hostDay';

export type TrendPoint = {
  /** Epoch ms of the order this point was measured at. */
  ts: number;
  /** Estimated orders per hour at that moment. */
  value: number;
};

/** The three pace windows Whatnot offers on its Trends tab. */
export const TREND_WINDOWS: { key: string; label: string; minutes: number | null }[] = [
  { key: 'show', label: 'Entire Show', minutes: null },
  { key: 'w30', label: 'Past 30 mins', minutes: 30 },
  { key: 'w5', label: 'Past 5 mins', minutes: 5 },
];

/**
 * Est. Orders/hr across a show, one point per order.
 *
 * `windowMinutes === null` gives the running average — orders so far ÷ hours on
 * air so far. That is why it swings wildly in the first minutes and then
 * settles, which is the shape Whatnot's own chart shows. It uses the same
 * gap-capped duration as the rest of the page, so its final point is exactly
 * the Est. Orders/hr shown on the host's card.
 *
 * A window instead reports the rate over the trailing N minutes at each point,
 * which is what reveals where a show actually sped up or stalled.
 *
 * The first point is always 0: at the opening order no time has elapsed, so
 * there is no rate to report yet.
 */
export function buildOrdersPerHourSeries(timestamps: number[], windowMinutes: number | null): TrendPoint[] {
  const ts = [...timestamps].sort((a, b) => a - b);
  if (ts.length < 2) return [];

  const points: TrendPoint[] = [{ ts: ts[0], value: 0 }];
  let onAirMs = 0;

  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    // A long gap is the host being off air between shows, not slow selling.
    if (gap <= MAX_GAP_MS) onAirMs += gap;

    let value: number;
    if (windowMinutes === null) {
      value = onAirMs > 0 ? (i + 1) / (onAirMs / 3600000) : 0;
    } else {
      const from = ts[i] - windowMinutes * 60000;
      let count = 0;
      for (let j = i; j >= 0 && ts[j] > from; j--) count++;
      value = count / (windowMinutes / 60);
    }
    points.push({ ts: ts[i], value });
  }

  return points;
}
