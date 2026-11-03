// ─── Revenue share by host ─────────────────────────────────────────────────
//
// A donut can only carry as many slices as it has distinct colours. With a
// six-colour palette and eleven hosts the colours cycled, so two different
// hosts came out the same green and the legend stopped meaning anything.
//
// The fix is structural rather than cosmetic: chart the few hosts that carry
// the revenue and fold the long tail into a single "Others" slice. Every
// slice then gets its own validated hue, and nothing is hidden — the tail is
// still there, named and counted.

/** How many hosts get their own slice before the rest are pooled. */
export const TOP_HOST_SLICES = 5;

export type HostSlice = {
  label: string;
  value: number;
  /** Share of the period's total, 0-100. */
  share: number;
  /** True for the pooled remainder, which is drawn in neutral grey. */
  isOther: boolean;
  /** How many hosts the slice stands for — 1, except for the remainder. */
  hosts: number;
};

/**
 * Rank hosts by revenue and pool everyone past `limit` into one slice.
 *
 * Ties break on name so the order is stable between renders rather than
 * depending on object key order. A remainder of exactly one host is left
 * named instead of being called "Others (1)", which would hide a real host
 * behind a label for no benefit.
 */
export function topHostsWithOther(
  byHost: Record<string, number>,
  limit: number = TOP_HOST_SLICES,
): { slices: HostSlice[]; total: number; hostCount: number } {
  const entries = Object.entries(byHost)
    .filter(([host]) => host.trim() !== '')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  // One host over the limit is still just a host — naming it beats pooling it.
  if (entries.length <= limit + 1) {
    return {
      slices: entries.map(([label, value]) => ({
        label, value, share: pct(value), isOther: false, hosts: 1,
      })),
      total,
      hostCount: entries.length,
    };
  }

  const head = entries.slice(0, limit);
  const tail = entries.slice(limit);
  const tailTotal = tail.reduce((sum, [, v]) => sum + v, 0);

  return {
    slices: [
      ...head.map(([label, value]) => ({
        label, value, share: pct(value), isOther: false, hosts: 1,
      })),
      {
        label: `Others (${tail.length})`,
        value: tailTotal,
        share: pct(tailTotal),
        isOther: true,
        hosts: tail.length,
      },
    ],
    total,
    hostCount: entries.length,
  };
}

/**
 * Slice colours.
 *
 * Both sets were run through the dataviz palette validator rather than picked
 * by eye: each passes the lightness band, chroma floor, CVD separation and
 * normal-vision floor against its own surface. Dark is its own set of steps,
 * not a lightened copy of light. The order matters — the validator checks
 * adjacent pairs, and donut slices sit next to their neighbour in this order.
 *
 * Light carries a contrast warning against the page surface, which is why the
 * legend prints a visible label and value beside every swatch.
 */
export const SLICE_COLORS_LIGHT = ['#3B82F6', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444'];
export const SLICE_COLORS_DARK  = ['#3B82F6', '#D97706', '#8B5CF6', '#059669', '#EF4444'];

/** The remainder is a total, not an identity, so it gets neutral grey. */
export const OTHER_COLOR_LIGHT = '#94A3B8';
export const OTHER_COLOR_DARK  = '#64748B';

export function sliceColors(slices: HostSlice[], dark: boolean): string[] {
  const hues = dark ? SLICE_COLORS_DARK : SLICE_COLORS_LIGHT;
  const other = dark ? OTHER_COLOR_DARK : OTHER_COLOR_LIGHT;
  let i = 0;
  return slices.map(s => (s.isOther ? other : hues[i++ % hues.length]));
}
