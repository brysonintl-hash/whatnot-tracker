// ─── Matching a Whatnot sale to what we paid for it ────────────────────────
//
// Whatnot knows the sale price. It has never known the cost, so every margin
// in this app depends on joining a sold item back to the inventory sheet.
//
// There are two ways to do that, and they are not equally good:
//
//   EXACT   — `variant.sku`, `variant.external_id` or `product.external_id`
//             carry our own model number, echoed back onto each order item.
//             These are writable and, as of the first sync, null on every
//             product in the catalogue.
//
//   FUZZY   — pull a model-number-shaped token out of the product title.
//             Works because the team already types the model into the title,
//             but it is a guess: it misses titles that omit the model and can
//             latch onto a size or a lot number.
//
// The exact path is tried first and the fuzzy path is a fallback, so the day
// the SKU fields get populated this silently becomes reliable. `matchReport`
// exists to show how much is still riding on the guess.

import type { WnOrderItem } from './types';

/** Just the cost side of the inventory sheet — keeps this module testable. */
export type CostRow = {
  modelNum: string;
  cost: number;
  description?: string;
  remaining?: number;
};

export type MatchedBy = 'variant_external_id' | 'product_external_id' | 'sku' | 'title';

export type ResolvedItem = {
  item: WnOrderItem;
  /** The inventory-sheet model number this sale was tied to, if any. */
  modelNum: string | null;
  matchedBy: MatchedBy | null;
  /** Per-unit cost from the sheet. Null when nothing matched. */
  unitCost: number | null;
  revenue: number;
  cogs: number | null;
  units: number;
};

/** Case and punctuation differ between the two systems; the digits don't. */
export function normalizeModel(s: string): string {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Model numbers the team actually uses, in the order we trust them.
 *
 * Observed in live titles:
 *   48-11-2450     Milwaukee tools and batteries
 *   2767-20        Milwaukee bare tools
 *   F300B-20XL     Milwaukee apparel, with a size suffix
 *   DCF887B        DEWALT
 *   DWHT36916S     DEWALT hand tools
 *
 * Titles also carry a "[$129.00]" price prefix, a "#8" lot number and sizes
 * like "4PK" or "10-Pack". None of those can match the patterns below — a
 * price has no dash in the right place, a lot number is too short, and a pack
 * size has no letter-digit run — so there is no pre-cleaning step here. An
 * earlier version stripped them first; measured over 500 live titles it
 * changed the answer for none of them, while its "#<digits>" rule would have
 * mangled a model written as "#48-11-2450". The patterns are the whole filter.
 */
const MODEL_PATTERNS: RegExp[] = [
  /\b\d{2}-\d{2}-\d{3,4}[A-Z]{0,2}\b/,          // 48-11-2450
  /\b[A-Z]{1,4}\d{3,5}[A-Z]{0,3}-\d{2}[A-Z]{0,3}\b/, // F300B-20XL
  /\b\d{4}-\d{2}\b/,                             // 2767-20
  /\b[A-Z]{2,4}\d{3,6}[A-Z]{0,3}\b/,             // DCF887B, DWHT36916S
];

export function extractModelNumber(title: string): string | null {
  for (const re of MODEL_PATTERNS) {
    const m = re.exec(title || '');
    if (m) return m[0];
  }
  return null;
}

type Index = {
  byModel: Map<string, CostRow>;
};

function buildIndex(rows: CostRow[]): Index {
  const byModel = new Map<string, CostRow>();
  for (const r of rows) {
    const k = normalizeModel(r.modelNum);
    if (k && !byModel.has(k)) byModel.set(k, r);
  }
  return { byModel };
}

function lookup(idx: Index, candidate: string | null | undefined): CostRow | null {
  if (!candidate) return null;
  return idx.byModel.get(normalizeModel(candidate)) ?? null;
}

/** Ties each sold item to a cost, recording which route found it. */
export function resolveItems(items: WnOrderItem[], costs: CostRow[]): ResolvedItem[] {
  const idx = buildIndex(costs);

  return items.map(item => {
    const units = item.quantity || 0;
    const revenue = (parseFloat(item.unit_price?.amount ?? '0') || 0) * units;

    // Most specific identifier first.
    const attempts: [MatchedBy, string | null][] = [
      ['variant_external_id', item.variant_external_id],
      ['product_external_id', item.product_external_id],
      ['sku', item.purchased_item?.sku ?? null],
      ['title', extractModelNumber(item.purchased_item?.title ?? '')],
    ];

    for (const [matchedBy, candidate] of attempts) {
      const row = lookup(idx, candidate);
      if (row) {
        return {
          item, modelNum: row.modelNum, matchedBy,
          unitCost: row.cost, revenue, cogs: row.cost * units, units,
        };
      }
    }

    // A model was readable but isn't on the sheet — worth telling apart from
    // a title we couldn't read at all, so the model number is still reported.
    const guessed = extractModelNumber(item.purchased_item?.title ?? '');
    return {
      item, modelNum: guessed, matchedBy: null,
      unitCost: null, revenue, cogs: null, units,
    };
  });
}

export type MatchReport = {
  items: number;
  matched: number;
  /** Share of revenue we can actually cost, which is what margin accuracy rides on. */
  revenueCovered: number;
  revenueTotal: number;
  coveragePct: number;
  byRoute: Record<MatchedBy, number>;
  /** Matched only because the model was read out of a title — the shaky ones. */
  fuzzyOnly: number;
  unmatchedExamples: { title: string; guessed: string | null; revenue: number }[];
};

/**
 * How much of the margin figure is real.
 *
 * `coveragePct` is deliberately revenue-weighted: missing the cost of one $4
 * marker barely matters, missing a $350 planer does.
 */
export function matchReport(resolved: ResolvedItem[]): MatchReport {
  const byRoute: Record<MatchedBy, number> = {
    variant_external_id: 0, product_external_id: 0, sku: 0, title: 0,
  };
  let matched = 0, revenueCovered = 0, revenueTotal = 0;
  const unmatched: ResolvedItem[] = [];

  for (const r of resolved) {
    revenueTotal += r.revenue;
    if (r.matchedBy) {
      matched++;
      byRoute[r.matchedBy]++;
      revenueCovered += r.revenue;
    } else {
      unmatched.push(r);
    }
  }

  return {
    items: resolved.length,
    matched,
    revenueCovered,
    revenueTotal,
    coveragePct: revenueTotal > 0 ? (revenueCovered / revenueTotal) * 100 : 0,
    byRoute,
    fuzzyOnly: byRoute.title,
    unmatchedExamples: unmatched
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 25)
      .map(r => ({
        title: r.item.purchased_item?.title ?? '',
        guessed: r.modelNum,
        revenue: r.revenue,
      })),
  };
}
