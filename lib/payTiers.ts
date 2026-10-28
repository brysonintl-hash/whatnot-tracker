// ─── Host pay tiers ────────────────────────────────────────────────────────
//
// A host's streaming rate is set by the show's profit per hour. Tiers from
// $500/hr profit upward also require a 20%+ margin — clear the profit bar on
// thin margins and the host drops exactly one tier.
//
// Non-streaming hours are paid at the separate base rate ($18/hr), entered on
// the Pay Calculator; these tiers only cover time on air.

export const MARGIN_GATE_FROM_PROFIT = 500;
export const MARGIN_GATE_PCT = 20;

export type PayTier = {
  /** 1 is the top tier. */
  num: number;
  /** Inclusive floor on hourly show profit. */
  min: number;
  /** Dollars per hour while streaming. */
  pay: number;
  payLabel: string;
  /** Human-readable profit band, for legends and the explainer. */
  range: string;
  /** Hex, for canvas/PDF output where Tailwind classes don't apply. */
  color: string;
  bg: string;
  border: string;
  text: string;
  badge: string;
  crown: string;
  gradFrom: string;
  gradTo: string;
  avatarBg: string;
  avatarRing: string;
};

/** Highest tier first — lookups take the first tier the profit clears. */
export const PAY_TIERS: PayTier[] = [
  {
    num: 1, min: 1250, pay: 50, payLabel: '$50/hr', range: '$1,250+/hr profit',
    color: '#059669',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
    crown: 'text-yellow-300',
    gradFrom: '#064E3B', gradTo: '#059669', avatarBg: '#10B981', avatarRing: '#A7F3D0',
  },
  {
    num: 2, min: 1000, pay: 45, payLabel: '$45/hr', range: '$1,000–$1,249/hr profit',
    color: '#0D9488',
    bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-700', text: 'text-teal-700 dark:text-teal-400',
    badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300',
    crown: 'text-emerald-300',
    gradFrom: '#134E4A', gradTo: '#0D9488', avatarBg: '#14B8A6', avatarRing: '#99F6E4',
  },
  {
    num: 3, min: 750, pay: 40, payLabel: '$40/hr', range: '$750–$999/hr profit',
    color: '#0891B2',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20', border: 'border-cyan-200 dark:border-cyan-700', text: 'text-cyan-700 dark:text-cyan-400',
    badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300',
    crown: 'text-teal-300',
    gradFrom: '#155E75', gradTo: '#0891B2', avatarBg: '#06B6D4', avatarRing: '#A5F3FC',
  },
  {
    num: 4, min: 600, pay: 35, payLabel: '$35/hr', range: '$600–$749/hr profit',
    color: '#D97706',
    bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700', text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    crown: 'text-amber-300',
    gradFrom: '#78350F', gradTo: '#B45309', avatarBg: '#D97706', avatarRing: '#FDE68A',
  },
  {
    num: 5, min: 500, pay: 30, payLabel: '$30/hr', range: '$500–$599/hr profit',
    color: '#EA580C',
    bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-400',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300',
    crown: 'text-orange-300',
    gradFrom: '#7C2D12', gradTo: '#C2410C', avatarBg: '#EA580C', avatarRing: '#FED7AA',
  },
  {
    num: 6, min: 400, pay: 25, payLabel: '$25/hr', range: '$400–$499/hr profit',
    color: '#2563EB',
    bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
    crown: 'text-sky-300',
    gradFrom: '#1E3A5F', gradTo: '#2563EB', avatarBg: '#3B82F6', avatarRing: '#BFDBFE',
  },
  {
    // Floor: any show on air earns at least this, even at a loss.
    num: 7, min: -Infinity, pay: 20, payLabel: '$20/hr', range: 'Under $400/hr profit',
    color: '#64748B',
    bg: 'bg-slate-50 dark:bg-slate-700/30', border: 'border-slate-200 dark:border-slate-600', text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    crown: 'text-slate-300',
    gradFrom: '#1E293B', gradTo: '#64748B', avatarBg: '#94A3B8', avatarRing: '#E2E8F0',
  },
];

export type TierResult = {
  /** The tier actually paid, after any margin penalty. */
  tier: PayTier | null;
  /** The tier the profit alone would have earned. */
  earned: PayTier | null;
  /** True when the margin requirement knocked them down a tier. */
  tieredDown: boolean;
};

/**
 * Resolve a show's pay tier.
 *
 * `profitPerHour` of null means the show has no measurable duration, so no
 * streaming rate applies and the base rate is used instead.
 */
export function resolvePayTier(profitPerHour: number | null, marginPct: number | null): TierResult {
  if (profitPerHour === null || !Number.isFinite(profitPerHour)) {
    return { tier: null, earned: null, tieredDown: false };
  }

  const earned = PAY_TIERS.find(t => profitPerHour >= t.min) ?? PAY_TIERS[PAY_TIERS.length - 1];

  const gated = earned.min >= MARGIN_GATE_FROM_PROFIT && (marginPct ?? 0) < MARGIN_GATE_PCT;
  if (gated) {
    const down = PAY_TIERS.find(t => t.num === earned.num + 1) ?? earned;
    return { tier: down, earned, tieredDown: down.num !== earned.num };
  }

  return { tier: earned, earned, tieredDown: false };
}

export function getPayTier(profitPerHour: number | null, marginPct: number | null): PayTier | null {
  return resolvePayTier(profitPerHour, marginPct).tier;
}

export function getPayRate(profitPerHour: number | null, marginPct: number | null): number {
  return resolvePayTier(profitPerHour, marginPct).tier?.pay ?? PAY_TIERS[PAY_TIERS.length - 1].pay;
}
