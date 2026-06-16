import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const asin = req.nextUrl.searchParams.get('asin')?.trim().toUpperCase();
  if (!asin) return NextResponse.json({ error: 'Missing ASIN' }, { status: 400 });

  const apiKey = process.env.RAINFOREST_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'RAINFOREST_API_KEY not configured' }, { status: 503 });

  try {
    const url = `https://api.rainforestapi.com/request?api_key=${apiKey}&type=product&asin=${encodeURIComponent(asin)}&amazon_domain=amazon.com`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
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

    // Extract weight from product specifications or direct field
    let weight: string | null = null;
    if (p.weight) {
      weight = String(p.weight);
    } else if (Array.isArray(p.specifications)) {
      const weightSpec = p.specifications.find((s: { name: string; value: string }) =>
        /item weight|package weight|shipping weight|weight/i.test(s.name)
      );
      if (weightSpec) weight = weightSpec.value;
    } else if (Array.isArray(p.attributes)) {
      const weightAttr = p.attributes.find((a: { name: string; value: string }) =>
        /item weight|package weight|shipping weight|weight/i.test(a.name)
      );
      if (weightAttr) weight = weightAttr.value;
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
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
