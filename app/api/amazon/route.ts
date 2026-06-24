import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Calibrated from two real SellerAmp data points:
// BSR 21,000 → ~500/mo, BSR 116,000 → ~50/mo
function estimateMonthlySales(bsr: number): number {
  return Math.max(1, Math.round(334500000 * Math.pow(bsr, -1.348)));
}

// 2025 Amazon FBA fulfillment fees based on weight
// Tier is estimated from weight only — actual tier depends on dimensions too
function calcFBAFee(weightLbs: number): { fee: number; tier: string } {
  const oz = weightLbs * 16;
  // Small standard (≤1 lb — assuming compact dimensions)
  if (oz <= 4)  return { fee: 3.22, tier: 'Small Std' };
  if (oz <= 8)  return { fee: 3.40, tier: 'Small Std' };
  if (oz <= 12) return { fee: 3.58, tier: 'Small Std' };
  if (oz <= 16) return { fee: 3.77, tier: 'Small Std' };
  // Large standard (1–20 lb)
  if (weightLbs <= 1.5) return { fee: 5.40, tier: 'Large Std' };
  if (weightLbs <= 2)   return { fee: 5.69, tier: 'Large Std' };
  if (weightLbs <= 2.5) return { fee: 6.10, tier: 'Large Std' };
  if (weightLbs <= 3)   return { fee: 6.39, tier: 'Large Std' };
  if (weightLbs <= 20) {
    const extra = Math.ceil((weightLbs - 3) * 2); // half-lb increments
    return { fee: Math.round((6.39 + extra * 0.16) * 100) / 100, tier: 'Large Std' };
  }
  // Large bulky / oversize (>20 lb)
  return { fee: Math.round((9.73 + Math.max(0, weightLbs - 2) * 0.42) * 100) / 100, tier: 'Large Bulky' };
}

function scoreOpportunity(bsr: number | null, price: number | null, reviews: number | null) {
  if (!bsr) return { label: 'No BSR', color: 'slate', score: 0 };

  let score = 0;

  // BSR (lower = more demand)
  if (bsr < 1000) score += 50;
  else if (bsr < 5000) score += 40;
  else if (bsr < 20000) score += 30;
  else if (bsr < 50000) score += 20;
  else if (bsr < 100000) score += 10;

  // Price (higher = more margin room)
  if (price != null) {
    if (price > 50) score += 30;
    else if (price > 30) score += 22;
    else if (price > 15) score += 14;
    else if (price > 8) score += 6;
  }

  // Reviews (sweet spot: proven demand but not overcrowded)
  if (reviews != null) {
    if (reviews >= 50 && reviews < 500) score += 20;
    else if (reviews >= 500 && reviews < 2000) score += 14;
    else if (reviews >= 2000 && reviews < 10000) score += 8;
    else if (reviews >= 10000) score += 3;
    else if (reviews > 0) score += 10;
  }

  if (score >= 80) return { label: 'Hot', color: 'emerald', score };
  if (score >= 58) return { label: 'Good', color: 'blue', score };
  if (score >= 36) return { label: 'Okay', color: 'amber', score };
  return { label: 'Risky', color: 'red', score };
}

function keepaMinsToMs(keepaMins: number): number {
  return (keepaMins + 21564000) * 60000;
}

function parseKeepaCSV(
  csv: number[] | null | undefined,
  asDollars: boolean,
  cutoffMs: number,
): { t: string; v: number }[] {
  if (!csv || csv.length < 2) return [];
  const result: { t: string; v: number }[] = [];
  for (let i = 0; i + 1 < csv.length; i += 2) {
    const ms = keepaMinsToMs(csv[i]);
    if (ms < cutoffMs) continue;
    if (csv[i + 1] < 0) continue;
    result.push({
      t: new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      v: asDollars ? csv[i + 1] / 100 : csv[i + 1],
    });
  }
  return result;
}

async function fetchKeepa(asin: string) {
  const key = process.env.KEEPA_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.keepa.com/product?key=${key}&domain=1&asin=${asin}&history=1&stats=180`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const json = await res.json();
    if (!json.products?.[0]) {
      return { note: json.error === 'ACCESS_DENIED' ? 'Keepa tokens exhausted — upgrade plan for history.' : 'Keepa: no data.', priceHistory: [], bsrHistory: [], avg30: null, avg90: null, salesRankDrops30: null, monthlySold: null };
    }
    const kp = json.products[0];
    const cutoff = Date.now() - 90 * 24 * 3600000;
    const priceHistory = parseKeepaCSV(kp.csv?.[0], true, cutoff);
    // BSR history from salesRanks object (keyed by category name)
    let bsrHistory: { t: string; v: number }[] = [];
    if (kp.salesRanks && typeof kp.salesRanks === 'object') {
      const rankArrays = Object.values(kp.salesRanks) as number[][];
      if (rankArrays[0]) bsrHistory = parseKeepaCSV(rankArrays[0], false, cutoff);
    }
    const stats = kp.stats ?? {};
    const avg30Raw = Array.isArray(stats.avg30) ? stats.avg30[0] : stats.avg30;
    const avg90Raw = Array.isArray(stats.avg90) ? stats.avg90[0] : stats.avg90;
    return {
      avg30: avg30Raw > 0 ? avg30Raw / 100 : null,
      avg90: avg90Raw > 0 ? avg90Raw / 100 : null,
      salesRankDrops30: kp.salesRankDrops30 ?? null,
      monthlySold: kp.monthlySold > 0 ? kp.monthlySold : null,
      priceHistory,
      bsrHistory,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const asin = req.nextUrl.searchParams.get('asin')?.trim().toUpperCase();
  if (!asin) return NextResponse.json({ error: 'Missing ASIN' }, { status: 400 });

  const apiKey = process.env.RAINFOREST_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RAINFOREST_API_KEY not configured' }, { status: 503 });

  try {
    const url = `https://api.rainforestapi.com/request?api_key=${apiKey}&type=product&asin=${encodeURIComponent(asin)}&amazon_domain=amazon.com`;
    const [res, keepa] = await Promise.all([
      fetch(url, { next: { revalidate: 3600 } }),
      fetchKeepa(asin),
    ]);
    const data = await res.json();

    if (!res.ok || data.request_info?.success === false) {
      return NextResponse.json({ error: data.request_info?.message || 'Product not found' }, { status: 404 });
    }

    const p = data.product;
    if (!p) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const bsrEntry = p.bestsellers_rank?.[0];
    const bsr = bsrEntry?.rank ?? null;
    const bsrCategory = bsrEntry?.category ?? null;
    const price = p.buybox_winner?.price?.value ?? p.price?.value ?? null;
    const reviews = p.ratings_total ?? null;
    const rating = p.rating ?? null;
    const opportunity = scoreOpportunity(bsr, price, reviews);

    // Extract weight from product data (Amazon stores it in several places)
    let weight: string | null = null;
    const weightRe = /item weight|package weight|shipping weight|weight/i;
    if (p.weight) {
      weight = String(p.weight);
    } else if (p.product_details && typeof p.product_details === 'object') {
      const key = Object.keys(p.product_details).find(k => weightRe.test(k));
      if (key) weight = String(p.product_details[key]);
    } else if (Array.isArray(p.specifications)) {
      const s = p.specifications.find((s: { name: string; value: string }) => weightRe.test(s.name));
      if (s) weight = s.value;
    } else if (Array.isArray(p.attributes)) {
      const a = p.attributes.find((a: { name: string; value: string }) => weightRe.test(a.name));
      if (a) weight = a.value;
    }

    // Parse weight string into pounds for shipping rate logic
    let weightLbs: number | null = null;
    if (weight) {
      const m = weight.match(/([\d.]+)\s*(pound|lb|ounce|oz|kilogram|kg|gram|g)\b/i);
      if (m) {
        const val = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        if (unit.startsWith('pound') || unit.startsWith('lb')) weightLbs = val;
        else if (unit.startsWith('ounce') || unit === 'oz') weightLbs = val / 16;
        else if (unit.startsWith('kilogram') || unit === 'kg') weightLbs = val * 2.20462;
        else if (unit.startsWith('gram') || unit === 'g') weightLbs = val / 453.592;
      }
    }

    return NextResponse.json({
      asin,
      title: p.title ?? '',
      brand: p.brand ?? '',
      image: p.main_image?.link ?? '',
      price,
      currency: p.buybox_winner?.price?.currency ?? 'USD',
      rating,
      reviews,
      bsr,
      bsrCategory,
      category: p.categories?.[0]?.name ?? '',
      bullets: (p.feature_bullets ?? []).slice(0, 4),
      url: `https://www.amazon.com/dp/${asin}`,
      opportunity,
      weight,
      weightLbs,
      fba: weightLbs != null ? calcFBAFee(weightLbs) : null,
      estimatedMonthlySales: bsr != null ? estimateMonthlySales(bsr) : null,
      keepa,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
