// ─── Kit breakouts ─────────────────────────────────────────────────────────
//
// We buy combo kits at one price and sell the pieces separately, so every
// piece needs a cost — and a kit's invoice only gives one number for the lot.
// Splitting that number across the pieces is the job this file does, and it
// is the thing currently done by hand after the fact.
//
// Three ways to split, because no single one is right for every kit:
//
//   by-retail  Each piece takes the share of cost its own retail price
//              represents. This is relative-value allocation, the standard
//              treatment for a basket bought at one price, and the default.
//              A $300 kit holding a $400 drill and a $100 battery charges
//              the drill $240 and the battery $60.
//
//   equal      Split evenly across units. Honest only when the pieces really
//              are comparable; included because sometimes they are.
//
//   manual     Explicit weights, for when someone knows better than both.
//
// A piece with no retail on file cannot take part in a by-retail split, so
// that case falls back rather than silently valuing it at zero — see
// allocateKitCost.

export type AllocationMethod = 'by-retail' | 'equal' | 'manual';

export type BundleComponent = {
  /** The SKU we actually sell, as it appears on the inventory sheet. */
  modelNum: string;
  /** How many of this piece come out of one kit. */
  qty: number;
  /** Only read when the method is 'manual'. Relative, not a currency. */
  weight?: number;
};

export type Bundle = {
  id: string;
  /** The kit as purchased — its own model number on the invoice. */
  modelNum: string;
  description: string;
  /** What one whole kit cost us. */
  purchaseCost: number;
  components: BundleComponent[];
  method: AllocationMethod;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AllocatedComponent = {
  modelNum: string;
  qty: number;
  /** Cost of ONE unit of this component. */
  unitCost: number;
  /** Cost of all `qty` of them, i.e. this piece's share of the kit. */
  lineCost: number;
  /** Fraction of the kit's cost this line took, 0..1. */
  share: number;
  /** Retail used for the split; null when none was on file. */
  retail: number | null;
};

export type Allocation = {
  bundleId: string;
  modelNum: string;
  purchaseCost: number;
  method: AllocationMethod;
  /** The method actually used, which differs when the chosen one couldn't run. */
  effectiveMethod: AllocationMethod;
  components: AllocatedComponent[];
  /** Set when we had to fall back, so the UI can say why. */
  warning?: string;
};

/** Retail price per model number, for the by-retail split. */
export type RetailLookup = (modelNum: string) => number | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Split one kit's purchase cost across the pieces it breaks into.
 *
 * Rounding is handled by giving the last line the remainder, so the pieces
 * always add back up to exactly what the kit cost. Without that a 3-way split
 * of $100 loses a cent and the books never quite tie out.
 */
export function allocateKitCost(bundle: Bundle, retailOf: RetailLookup): Allocation {
  const comps = bundle.components.filter(c => c.modelNum && c.qty > 0);

  if (!comps.length) {
    return {
      bundleId: bundle.id, modelNum: bundle.modelNum,
      purchaseCost: bundle.purchaseCost, method: bundle.method,
      effectiveMethod: bundle.method, components: [],
      warning: 'This kit has no components listed, so nothing can be costed.',
    };
  }

  const retails = comps.map(c => retailOf(c.modelNum));
  let method = bundle.method;
  let warning: string | undefined;

  // A by-retail split needs a retail on every piece. One missing price would
  // hand that piece a zero cost and quietly inflate everything else's margin,
  // so we drop to an equal split and say so rather than publish that.
  if (method === 'by-retail') {
    const missing = comps.filter((_, i) => !retails[i] || retails[i]! <= 0);
    if (missing.length) {
      method = 'equal';
      warning = `No retail price on file for ${missing.map(m => m.modelNum).join(', ')}, so the cost was split evenly instead of by value.`;
    }
  }

  if (method === 'manual') {
    const anyWeight = comps.some(c => (c.weight ?? 0) > 0);
    if (!anyWeight) {
      method = 'equal';
      warning = 'No weights were set, so the cost was split evenly.';
    }
  }

  const weightOf = (c: BundleComponent, i: number): number => {
    switch (method) {
      case 'by-retail': return (retails[i] ?? 0) * c.qty;
      case 'manual': return (c.weight ?? 0) * c.qty;
      case 'equal': return c.qty;
    }
  };

  const weights = comps.map(weightOf);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (totalWeight <= 0) {
    return {
      bundleId: bundle.id, modelNum: bundle.modelNum,
      purchaseCost: bundle.purchaseCost, method: bundle.method,
      effectiveMethod: method, components: [],
      warning: warning ?? 'Every component weighed zero, so the cost could not be split.',
    };
  }

  let spent = 0;
  const components: AllocatedComponent[] = comps.map((c, i) => {
    const last = i === comps.length - 1;
    // The final line absorbs the rounding so the parts sum to the whole.
    const lineCost = last
      ? round2(bundle.purchaseCost - spent)
      : round2((weights[i] / totalWeight) * bundle.purchaseCost);
    spent = round2(spent + lineCost);

    return {
      modelNum: c.modelNum,
      qty: c.qty,
      unitCost: round2(lineCost / c.qty),
      lineCost,
      share: bundle.purchaseCost > 0 ? lineCost / bundle.purchaseCost : 0,
      retail: retails[i] ?? null,
    };
  });

  return {
    bundleId: bundle.id, modelNum: bundle.modelNum,
    purchaseCost: bundle.purchaseCost, method: bundle.method,
    effectiveMethod: method, components, warning,
  };
}

/**
 * Per-unit costs for every component across every kit, keyed by model number.
 *
 * A piece that comes out of more than one kit — a battery shipped in three
 * different combos — gets the average of its allocated costs, weighted by how
 * many units each kit contributes. That is the blended cost of the stock on
 * the shelf, which is what a margin should be measured against.
 */
export function componentCosts(
  bundles: Bundle[],
  retailOf: RetailLookup,
): Record<string, { unitCost: number; fromKits: string[]; units: number }> {
  const acc = new Map<string, { cost: number; units: number; kits: Set<string> }>();

  for (const b of bundles) {
    const alloc = allocateKitCost(b, retailOf);
    for (const c of alloc.components) {
      const key = c.modelNum;
      const cur = acc.get(key) ?? { cost: 0, units: 0, kits: new Set<string>() };
      cur.cost += c.lineCost;
      cur.units += c.qty;
      cur.kits.add(b.modelNum);
      acc.set(key, cur);
    }
  }

  const out: Record<string, { unitCost: number; fromKits: string[]; units: number }> = {};
  for (const [model, v] of Array.from(acc.entries())) {
    if (v.units <= 0) continue;
    out[model] = {
      unitCost: round2(v.cost / v.units),
      fromKits: Array.from(v.kits).sort(),
      units: v.units,
    };
  }
  return out;
}

/** Cheap sanity checks for the editor, so a bad kit is caught before it skews a margin. */
export function validateBundle(b: Partial<Bundle>): string[] {
  const errors: string[] = [];
  if (!b.modelNum?.trim()) errors.push('The kit needs a model number.');
  if (!Number.isFinite(b.purchaseCost) || (b.purchaseCost ?? 0) <= 0) {
    errors.push('The kit needs a purchase cost above zero.');
  }
  const comps = b.components ?? [];
  if (!comps.length) errors.push('Add at least one component.');
  if (comps.some(c => !c.modelNum?.trim())) errors.push('Every component needs a model number.');
  if (comps.some(c => !Number.isFinite(c.qty) || c.qty <= 0)) {
    errors.push('Every component needs a quantity above zero.');
  }
  const seen = new Set<string>();
  for (const c of comps) {
    const k = (c.modelNum ?? '').trim().toUpperCase();
    if (!k) continue;
    if (seen.has(k)) errors.push(`${c.modelNum} is listed twice — combine it into one line with a higher quantity.`);
    seen.add(k);
  }
  if (b.modelNum && seen.has(b.modelNum.trim().toUpperCase())) {
    errors.push('A kit cannot contain itself.');
  }
  return errors;
}
