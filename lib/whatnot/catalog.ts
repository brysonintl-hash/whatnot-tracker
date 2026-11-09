// ─── The master SKU record ─────────────────────────────────────────────────
//
// One row per model number, assembled from four places that currently never
// meet:
//
//   inventory sheet   what we paid, what we think we hold, retail
//   Whatnot catalogue the listing, its price, its starting bid, its stock
//   order items       what has actually sold, and for how much
//   kit breakouts     an allocated cost for pieces we never bought directly
//
// Two things fall out of putting them side by side that nobody can see today:
// where the two stock counts disagree, and which listings carry no identifier
// tying them back to us.

import type { WnOrderItem, WnProduct, WnVariant } from './types';
import { money } from './types';
import { resolveItems, normalizeModel, extractModelNumber, type CostRow } from './sku';
import { componentCosts, type Bundle, type RetailLookup } from './bundles';

/** The inventory sheet row, reduced to what this needs. */
export type SheetRow = {
  modelNum: string;
  description: string;
  cost: number;
  retail: number;
  startPrice: number;
  remaining: number;
};

export type CatalogEntry = { product: WnProduct; variants: WnVariant[] };

export type WhatnotLink = {
  productId: string;
  variantId: string;
  title: string;
  url: string;
  price: number;
  startPrice: number | null;
  buyItNow: number | null;
  availableQuantity: number;
  /** Whether anything ties this listing back to our model number. */
  externalIdSet: boolean;
  skuSet: boolean;
  weightLb: number | null;
};

export type CostOrigin = 'sheet' | 'kit' | 'none';

export type MasterSku = {
  modelNum: string;
  description: string;

  /** Cost per unit, and where it came from. */
  unitCost: number | null;
  costOrigin: CostOrigin;
  /** Kits this piece is broken out of, when the cost is allocated. */
  fromKits: string[];

  retail: number | null;
  sheetQty: number | null;
  whatnot: WhatnotLink | null;

  /** Whatnot stock minus sheet stock. Null when either side is missing. */
  stockDelta: number | null;

  unitsSold: number;
  revenue: number;
  grossProfit: number | null;
  marginPct: number | null;
  lastSoldAt: string | null;

  /** True when this model number is itself a kit we break out. */
  isKit: boolean;
};

export type CatalogIssue =
  | 'unlinked-listing'    // a Whatnot listing with no identifier pointing at us
  | 'missing-listing'     // on the sheet, sold nothing, no Whatnot product
  | 'no-cost'             // sold, but we cannot say what it cost
  | 'stock-mismatch'      // the two systems disagree on how many we hold
  | 'sold-not-on-sheet';  // sold on Whatnot, absent from the sheet entirely

export type CatalogReport = {
  skus: MasterSku[];
  counts: {
    total: number;
    linked: number;
    withCost: number;
    costFromKit: number;
    listingsWithoutIdentifier: number;
    stockMismatches: number;
  };
  issues: Record<CatalogIssue, string[]>;
};

export type CatalogInput = {
  sheet: SheetRow[];
  catalog: Record<string, CatalogEntry>;
  items: WnOrderItem[];
  /** Order id -> created_at, for "last sold". */
  orderDates: Record<string, string>;
  bundles: Bundle[];
  /** How far apart the two stock counts may be before it's worth flagging. */
  stockTolerance?: number;
};

/** Model numbers differ in punctuation between systems; compare on the digits. */
function key(model: string): string {
  return normalizeModel(model);
}

export function buildCatalog(input: CatalogInput): CatalogReport {
  const tolerance = input.stockTolerance ?? 0;

  // ── Sheet, indexed ───────────────────────────────────────────────────────
  const sheetByKey = new Map<string, SheetRow>();
  for (const r of input.sheet) {
    const k = key(r.modelNum);
    if (k && !sheetByKey.has(k)) sheetByKey.set(k, r);
  }

  const retailOf: RetailLookup = model => {
    const r = sheetByKey.get(key(model));
    return r && r.retail > 0 ? r.retail : null;
  };

  // ── Kit breakouts ────────────────────────────────────────────────────────
  const allocated = componentCosts(input.bundles, retailOf);
  const allocatedByKey = new Map<string, { unitCost: number; fromKits: string[] }>();
  for (const [model, v] of Object.entries(allocated)) {
    allocatedByKey.set(key(model), { unitCost: v.unitCost, fromKits: v.fromKits });
  }
  const kitModels = new Set(input.bundles.map(b => key(b.modelNum)));

  // ── Whatnot catalogue, flattened to one link per variant ─────────────────
  //
  // A listing is tied to us by external_id or sku. With none of those set the
  // only way back is the model number in the title, which is exactly the
  // weakness this page exists to show.
  const linkByKey = new Map<string, WhatnotLink>();
  const unlinkedListings: string[] = [];

  for (const entry of Object.values(input.catalog)) {
    const p = entry.product;
    for (const v of entry.variants) {
      const identifier = v.external_id || v.sku || p.external_id || null;
      const fromTitle = identifier ? null : modelFromTitle(p.title);
      const model = identifier ?? fromTitle;

      const link: WhatnotLink = {
        productId: p.id,
        variantId: v.id,
        title: p.title,
        url: p.url,
        price: money(v.price),
        startPrice: v.pricing?.auction?.start_price ? money(v.pricing.auction.start_price) : null,
        buyItNow: v.pricing?.buy_it_now?.price ? money(v.pricing.buy_it_now.price) : null,
        availableQuantity: v.inventory?.available_quantity ?? 0,
        externalIdSet: Boolean(v.external_id || p.external_id),
        skuSet: Boolean(v.sku),
        weightLb: weightInPounds(p),
      };

      if (!identifier) unlinkedListings.push(p.title);
      if (!model) continue;

      const k = key(model);
      // One model can have several listings; keep the one with stock, so the
      // page points at the listing you could actually run.
      const existing = linkByKey.get(k);
      if (!existing || (link.availableQuantity > existing.availableQuantity)) {
        linkByKey.set(k, link);
      }
    }
  }

  // ── Sales ────────────────────────────────────────────────────────────────
  //
  // Costs come from the sheet first and a kit allocation second, so a piece we
  // only ever bought inside a combo still gets a margin.
  const costRows: CostRow[] = [
    ...input.sheet.filter(r => r.cost > 0).map(r => ({ modelNum: r.modelNum, cost: r.cost })),
    ...Object.entries(allocated)
      .filter(([m]) => !sheetByKey.get(key(m))?.cost)
      .map(([modelNum, v]) => ({ modelNum, cost: v.unitCost })),
  ];

  const resolved = resolveItems(input.items, costRows);
  type Sold = { units: number; revenue: number; cogs: number; costed: boolean; last: string | null; title: string };
  const soldByKey = new Map<string, Sold>();

  for (const r of resolved) {
    if (!r.modelNum) continue;
    const k = key(r.modelNum);
    const cur = soldByKey.get(k) ?? { units: 0, revenue: 0, cogs: 0, costed: false, last: null, title: '' };
    cur.units += r.units;
    cur.revenue += r.revenue;
    cur.title ||= r.item.purchased_item?.title ?? '';
    if (r.cogs !== null) { cur.cogs += r.cogs; cur.costed = true; }
    const d = input.orderDates[r.item.order_id];
    if (d && (!cur.last || d > cur.last)) cur.last = d;
    soldByKey.set(k, cur);
  }

  // ── Union of every model number any system knows about ───────────────────
  const allKeys = new Set<string>([
    ...Array.from(sheetByKey.keys()),
    ...Array.from(linkByKey.keys()),
    ...Array.from(soldByKey.keys()),
    ...Array.from(allocatedByKey.keys()),
  ]);

  const issues: Record<CatalogIssue, string[]> = {
    'unlinked-listing': unlinkedListings,
    'missing-listing': [],
    'no-cost': [],
    'stock-mismatch': [],
    'sold-not-on-sheet': [],
  };

  const skus: MasterSku[] = [];

  for (const k of Array.from(allKeys)) {
    const sheet = sheetByKey.get(k);
    const link = linkByKey.get(k) ?? null;
    const sold = soldByKey.get(k);
    const kit = allocatedByKey.get(k);

    const modelNum = sheet?.modelNum ?? displayModel(k, link, sold);
    const description = sheet?.description || link?.title || sold?.title || '';

    // The sheet is the authority on cost; an allocated kit cost fills the gap
    // for pieces we never bought on their own.
    let unitCost: number | null = null;
    let costOrigin: CostOrigin = 'none';
    if (sheet && sheet.cost > 0) { unitCost = sheet.cost; costOrigin = 'sheet'; }
    else if (kit) { unitCost = kit.unitCost; costOrigin = 'kit'; }

    const sheetQty = sheet ? sheet.remaining : null;
    const stockDelta = link && sheetQty !== null ? link.availableQuantity - sheetQty : null;

    const grossProfit = sold?.costed ? sold.revenue - sold.cogs : null;

    const row: MasterSku = {
      modelNum,
      description,
      unitCost,
      costOrigin,
      fromKits: kit?.fromKits ?? [],
      retail: sheet?.retail ?? null,
      sheetQty,
      whatnot: link,
      stockDelta,
      unitsSold: sold?.units ?? 0,
      revenue: sold?.revenue ?? 0,
      grossProfit,
      marginPct: grossProfit !== null && sold && sold.revenue > 0
        ? (grossProfit / sold.revenue) * 100 : null,
      lastSoldAt: sold?.last ?? null,
      isKit: kitModels.has(k),
    };
    skus.push(row);

    if (!link && sheet) issues['missing-listing'].push(modelNum);
    if (!sheet && (sold?.units ?? 0) > 0) issues['sold-not-on-sheet'].push(modelNum);
    if (unitCost === null && (sold?.units ?? 0) > 0) issues['no-cost'].push(modelNum);
    if (stockDelta !== null && Math.abs(stockDelta) > tolerance) issues['stock-mismatch'].push(modelNum);
  }

  skus.sort((a, b) => b.revenue - a.revenue || b.unitsSold - a.unitsSold);

  return {
    skus,
    counts: {
      total: skus.length,
      linked: skus.filter(s => s.whatnot).length,
      withCost: skus.filter(s => s.unitCost !== null).length,
      costFromKit: skus.filter(s => s.costOrigin === 'kit').length,
      listingsWithoutIdentifier: unlinkedListings.length,
      stockMismatches: issues['stock-mismatch'].length,
    },
    issues,
  };
}

/** Whichever source still has the original spelling of the model number. */
function displayModel(k: string, link: WhatnotLink | null, sold?: { title: string }): string {
  if (link) {
    const m = modelFromTitle(link.title);
    if (m && key(m) === k) return m;
  }
  if (sold?.title) {
    const m = modelFromTitle(sold.title);
    if (m && key(m) === k) return m;
  }
  return k;
}

/**
 * Deliberately the same reader the sales join uses, so the two can never
 * disagree about what a title's model number is.
 */
const modelFromTitle = extractModelNumber;

function weightInPounds(p: WnProduct): number | null {
  const w = p.dimension_profile?.weight;
  if (!w || !Number.isFinite(w.value)) return null;
  const unit = (w.unit || '').toLowerCase();
  if (unit.startsWith('pound') || unit === 'lb') return w.value;
  if (unit.startsWith('ounce') || unit === 'oz') return w.value / 16;
  if (unit.startsWith('kilogram') || unit === 'kg') return w.value * 2.20462;
  if (unit.startsWith('gram') || unit === 'g') return w.value / 453.592;
  return null;
}
