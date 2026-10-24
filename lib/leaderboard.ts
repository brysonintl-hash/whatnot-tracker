// ─── Host leaderboard ──────────────────────────────────────────────────────
//
// Ranks hosts on how they perform per hour on air, so a four-hour show and a
// forty-minute one compare fairly. Everything here is pure: feed it show
// records and it returns the board, which is what makes it testable and what
// lets the sample data be swapped for real shows without touching the page.

export type ShowRecord = {
  host: string;
  /** "YYYY-MM-DD" — the show date. */
  date: string;
  durationHours: number;
  sales: number;
  orders: number;
  grossProfit: number;
  /**
   * Orders that cost the buyer something. Giveaways go out at $0 and would
   * drag AOV toward zero, so AOV divides by these rather than by `orders`.
   * Defaults to `orders` when a source doesn't distinguish them.
   */
  paidOrders?: number;
};

export type MetricKey = 'salesPerHour' | 'ordersPerHour' | 'aov' | 'margin' | 'profitPerHour';

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  format: (v: number) => string;
};

export const METRICS: MetricDef[] = [
  { key: 'salesPerHour', label: 'Sales per hour', short: 'Sales/hr', format: v => `$${Math.round(v).toLocaleString('en-US')}` },
  { key: 'ordersPerHour', label: 'Orders per hour', short: 'Orders/hr', format: v => v.toFixed(1) },
  { key: 'aov', label: 'Average order value', short: 'AOV', format: v => `$${Math.round(v).toLocaleString('en-US')}` },
  { key: 'margin', label: 'Profit margin', short: 'Margin', format: v => `${v.toFixed(1)}%` },
  { key: 'profitPerHour', label: 'Profit per hour', short: 'Profit/hr', format: v => `$${v.toFixed(2)}` },
];

export type Weights = Record<MetricKey, number>;

export const DEFAULT_WEIGHTS: Weights = {
  salesPerHour: 1, ordersPerHour: 1, aov: 1, margin: 1, profitPerHour: 1,
};

// ── Eligibility ────────────────────────────────────────────────────────────
// A couple of lucky shows shouldn't win a leaderboard, so a host needs a real
// body of work in the period before they're ranked.
export const MIN_SHOWS = 3;
export const MIN_HOURS = 5;

export type HostTotals = {
  host: string;
  shows: number;
  hours: number;
  sales: number;
  orders: number;
  paidOrders: number;
  profit: number;
};

export type HostMetrics = Record<MetricKey, number>;

export type LeaderboardRow = {
  host: string;
  initial: string;
  totals: HostTotals;
  metrics: HostMetrics;
  /** Each metric as a percentage of the best host's value, 0-100. */
  percentages: Record<MetricKey, number>;
  /** Weighted mean of `percentages`, 0-100. */
  overall: number;
  /** 1-based, by the currently selected sort. */
  rank: number;
  /** Spots gained vs the previous period; null when there's nothing to compare. */
  rankChange: number | null;
  /**
   * The sorted metric show by show, oldest first — the sparkline's shape.
   * Per show rather than pooled, so it reads as a history rather than a single
   * number repeated.
   */
  trend: number[];
  /**
   * Percent change in the sorted metric against the previous period, or null
   * when the host didn't stream then and there's nothing to compare to.
   */
  changePct: number | null;
  eligible: boolean;
  /** Why they aren't ranked, for the "Not enough data yet" list. */
  ineligibleReason?: string;
};

/**
 * Pool a host's shows into per-hour and per-order figures.
 *
 * Pooled (everything summed, then divided) rather than averaging each show's
 * rate: averaging rates would let a lucky twenty-minute burst count as much as
 * a full afternoon. Dividing by hours is what keeps long and short shows
 * comparable — raw totals never appear on the board.
 */
export function totalsFor(shows: ShowRecord[]): HostTotals[] {
  const map = new Map<string, HostTotals>();

  for (const s of shows) {
    if (!s.host) continue;
    let t = map.get(s.host);
    if (!t) {
      t = { host: s.host, shows: 0, hours: 0, sales: 0, orders: 0, paidOrders: 0, profit: 0 };
      map.set(s.host, t);
    }
    t.shows++;
    t.hours += s.durationHours;
    t.sales += s.sales;
    t.orders += s.orders;
    t.paidOrders += s.paidOrders ?? s.orders;
    t.profit += s.grossProfit;
  }

  return Array.from(map.values());
}

export function metricsFor(t: HostTotals): HostMetrics {
  return {
    salesPerHour: t.hours > 0 ? t.sales / t.hours : 0,
    ordersPerHour: t.hours > 0 ? t.orders / t.hours : 0,
    aov: t.paidOrders > 0 ? t.sales / t.paidOrders : 0,
    margin: t.sales > 0 ? (t.profit / t.sales) * 100 : 0,
    profitPerHour: t.hours > 0 ? t.profit / t.hours : 0,
  };
}

export function isEligible(t: HostTotals): boolean {
  return t.shows >= MIN_SHOWS || t.hours >= MIN_HOURS;
}

function ineligibleReason(t: HostTotals): string {
  const showWord = t.shows === 1 ? 'show' : 'shows';
  return `${t.shows} ${showWord} · ${t.hours.toFixed(1)}h live — needs ${MIN_SHOWS} shows or ${MIN_HOURS}h`;
}

/**
 * Score each host out of 100.
 *
 * Per metric, a host's value as a percentage of the best value anyone posted,
 * so the leader sits at 100% on that metric and everyone else reads as a share
 * of them. The five percentages are then averaged using the configured weights.
 *
 * Only eligible hosts set the 100% mark — otherwise one unranked host with a
 * single hot show would flatten everybody else's score.
 *
 * Margin can be negative. A negative value scores 0 rather than a negative
 * percentage, and if the best value for a metric is zero or below, that metric
 * can't discriminate and contributes 0 to everyone.
 */
function scoreRows(
  rows: { host: string; totals: HostTotals; metrics: HostMetrics; eligible: boolean }[],
  weights: Weights,
): { percentages: Record<MetricKey, number>; overall: number }[] {
  const ranked = rows.filter(r => r.eligible);
  const bests = {} as Record<MetricKey, number>;
  for (const m of METRICS) {
    bests[m.key] = ranked.length > 0 ? Math.max(...ranked.map(r => r.metrics[m.key])) : 0;
  }

  const totalWeight = METRICS.reduce((sum, m) => sum + Math.max(0, weights[m.key] ?? 0), 0);

  return rows.map(r => {
    const percentages = {} as Record<MetricKey, number>;
    let weighted = 0;

    for (const m of METRICS) {
      const best = bests[m.key];
      const pct = best > 0 ? Math.max(0, Math.min(100, (r.metrics[m.key] / best) * 100)) : 0;
      percentages[m.key] = pct;
      weighted += pct * Math.max(0, weights[m.key] ?? 0);
    }

    return { percentages, overall: totalWeight > 0 ? weighted / totalWeight : 0 };
  });
}

export type SortKey = 'overall' | MetricKey;

function sortValue(row: { overall: number; metrics: HostMetrics }, sort: SortKey): number {
  return sort === 'overall' ? row.overall : row.metrics[sort];
}

/**
 * Build the board for one period.
 *
 * `previous` is the same-length window immediately before, used only for the
 * rank-change arrows. Pass none (all-time has no "before") and the arrows are
 * simply absent rather than invented.
 */
export function buildLeaderboard(
  shows: ShowRecord[],
  opts: { weights?: Weights; sort?: SortKey; previous?: ShowRecord[] } = {},
): { ranked: LeaderboardRow[]; unranked: LeaderboardRow[]; mostImproved: string | null } {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const sort = opts.sort ?? 'overall';

  const base = totalsFor(shows).map(totals => ({
    host: totals.host,
    totals,
    metrics: metricsFor(totals),
    eligible: isEligible(totals),
  }));

  const scored = scoreRows(base, weights);

  /**
   * The sorted metric, show by show, oldest first.
   *
   * "overall" is a score relative to everyone else, so it has no meaning for a
   * single show — the sparkline falls back to profit per hour there, the
   * bottom-line number, and the UI says so.
   */
  const trendMetric: MetricKey = sort === 'overall' ? 'profitPerHour' : sort;
  const trendByHost = new Map<string, number[]>();
  for (const s of [...shows].sort((a, b) => parseShowDate(a.date) - parseShowDate(b.date))) {
    if (!s.host) continue;
    const m = metricsFor({
      host: s.host, shows: 1, hours: s.durationHours, sales: s.sales,
      orders: s.orders, paidOrders: s.paidOrders ?? s.orders, profit: s.grossProfit,
    });
    const list = trendByHost.get(s.host) ?? [];
    list.push(m[trendMetric]);
    trendByHost.set(s.host, list);
  }

  let rows: LeaderboardRow[] = base.map((b, i) => ({
    host: b.host,
    initial: (b.host.trim()[0] ?? '?').toUpperCase(),
    totals: b.totals,
    metrics: b.metrics,
    percentages: scored[i].percentages,
    overall: scored[i].overall,
    rank: 0,
    rankChange: null,
    trend: trendByHost.get(b.host) ?? [],
    changePct: null,
    eligible: b.eligible,
    ineligibleReason: b.eligible ? undefined : ineligibleReason(b.totals),
  }));

  // Ties break on name so the order is stable rather than input-dependent.
  const byStat = (a: LeaderboardRow, b: LeaderboardRow) =>
    sortValue(b, sort) - sortValue(a, sort) || a.host.localeCompare(b.host);

  const ranked = rows.filter(r => r.eligible).sort(byStat);
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const unranked = rows.filter(r => !r.eligible).sort((a, b) => a.host.localeCompare(b.host));

  // Rank movement, measured on the same sort so the arrow matches the column.
  if (opts.previous && opts.previous.length > 0) {
    const prevBase = totalsFor(opts.previous).map(totals => ({
      host: totals.host, totals, metrics: metricsFor(totals), eligible: isEligible(totals),
    }));
    const prevScored = scoreRows(prevBase, weights);
    const prevRanked = prevBase
      .map((b, i) => ({ host: b.host, overall: prevScored[i].overall, metrics: b.metrics, eligible: b.eligible }))
      .filter(r => r.eligible)
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || a.host.localeCompare(b.host));

    const prevRank = new Map(prevRanked.map((r, i) => [r.host, i + 1]));
    // Measured on the same metric the sparkline plots, so the line and the
    // percentage beside it always describe the same thing. (Sorting by
    // "overall" plots profit/hr, because a relative score has no per-show
    // meaning — and comparing overall scores would read 0% whenever everyone
    // improved by the same amount, which is true but useless.)
    const prevValue = new Map(prevRanked.map(r => [r.host, r.metrics[trendMetric]]));

    for (const r of ranked) {
      const before = prevRank.get(r.host);
      // A host who wasn't ranked last period has no movement to show — we
      // can't say they "gained" spots from a rank they never held.
      r.rankChange = before === undefined ? null : before - r.rank;

      // Same reasoning for the percentage: no previous figure, no change.
      // A previous value of zero has no meaningful percentage either.
      const was = prevValue.get(r.host);
      r.changePct = was === undefined || was === 0
        ? null
        : ((r.metrics[trendMetric] - was) / Math.abs(was)) * 100;
    }
  }

  const gains = ranked.filter(r => (r.rankChange ?? 0) > 0);
  const mostImproved = gains.length > 0
    ? gains.reduce((best, r) => ((r.rankChange ?? 0) > (best.rankChange ?? 0) ? r : best)).host
    : null;

  return { ranked, unranked, mostImproved };
}

// ── Periods ────────────────────────────────────────────────────────────────

export type PeriodKey = 'week' | 'month' | 'last28' | 'all';

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last28', label: 'Last 28 days' },
  { key: 'all', label: 'All time' },
];

/** Parsed as local midnight, so a date never slips a day by timezone. */
export function parseShowDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export type Window = { from: number; to: number } | null;

/**
 * The window a period covers, and the equally long one before it.
 *
 * "This week" starts Monday; "this month" starts on the 1st. Both are
 * to-date rather than rolling, which is what someone means by "this week".
 * All time has no bounds and therefore no previous window to compare against.
 */
export function periodWindows(period: PeriodKey, now: Date = new Date()): { current: Window; previous: Window } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;
  const to = dayStart + DAY - 1; // through the end of today

  if (period === 'all') return { current: null, previous: null };

  let from: number;
  if (period === 'week') {
    const dow = (new Date(dayStart).getDay() + 6) % 7; // Monday = 0
    from = dayStart - dow * DAY;
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else {
    from = dayStart - 27 * DAY;
  }

  const span = to - from + 1;
  return { current: { from, to }, previous: { from: from - span, to: from - 1 } };
}

export function showsInWindow(shows: ShowRecord[], window: Window): ShowRecord[] {
  if (!window) return shows;
  return shows.filter(s => {
    const t = parseShowDate(s.date);
    return t >= window.from && t <= window.to;
  });
}
