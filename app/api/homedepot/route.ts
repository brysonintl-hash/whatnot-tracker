import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export type HDProduct = {
  itemId: string;
  name: string;
  model: string;
  brand: string;
  price: number | null;
  originalPrice: number | null;
  image: string;
  url: string;
};

// ── Strategy 1: RapidAPI (most reliable — set RAPIDAPI_HD_KEY in Railway) ────
async function tryRapidAPI(q: string, key: string): Promise<HDProduct[]> {
  // "Real-Time Home Depot Data" on RapidAPI
  const url = `https://real-time-home-depot-data.p.rapidapi.com/api/v1/product_search?q=${encodeURIComponent(q)}&page=1`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key':  key,
      'x-rapidapi-host': 'real-time-home-depot-data.p.rapidapi.com',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`RapidAPI ${res.status}`);
  const data = await res.json() as Record<string, unknown>;

  // RapidAPI HD returns { data: { products: [...] } } or { products: [...] }
  const list: unknown[] =
    (data.data as Record<string, unknown>)?.products as unknown[] ??
    data.products as unknown[] ??
    [];

  return list.slice(0, 12).map((p: unknown) => {
    const item = p as Record<string, unknown>;
    const pricing = (item.pricing ?? item.price_information ?? {}) as Record<string, unknown>;
    const media   = (item.media ?? {}) as Record<string, unknown>;
    const images  = (Array.isArray(media.images) ? media.images : []) as Record<string, unknown>[];
    const idents  = (item.identifiers ?? {}) as Record<string, unknown>;
    const itemId  = String(item.item_id ?? item.itemId ?? idents.itemId ?? '');
    const label   = String(item.description ?? item.product_label ?? idents.productLabel ?? item.title ?? '');
    const img     = String(images[0]?.url ?? images[0]?.src ?? item.thumbnail ?? item.image ?? '');

    return {
      itemId,
      name:          label,
      model:         String(idents.modelNumber ?? item.model_number ?? item.model ?? ''),
      brand:         String(idents.brandName   ?? item.brand ?? ''),
      price:         typeof pricing.value    === 'number' ? pricing.value    : typeof pricing.special_price === 'number' ? pricing.special_price : null,
      originalPrice: typeof pricing.original === 'number' ? pricing.original : typeof pricing.original_price === 'number' ? pricing.original_price : null,
      image:         img.startsWith('//') ? `https:${img}` : img,
      url:           itemId
        ? `https://www.homedepot.com/p/${label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}/${itemId}`
        : `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
    };
  }).filter(p => p.name.length > 2);
}

// ── Strategy 2: Scrape rendered HD search page via ScraperAPI ─────────────────
async function tryScraperAPI(q: string, scraperKey: string): Promise<HDProduct[]> {
  const targetUrl = `https://www.homedepot.com/s/${encodeURIComponent(q)}`;
  const params = new URLSearchParams({
    api_key:      scraperKey,
    url:          targetUrl,
    render:       'true',
    country_code: 'us',
    wait:         '3000',
  });

  const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`ScraperAPI ${res.status}`);

  const html = await res.text();
  if (html.length < 500) throw new Error('Empty response from ScraperAPI');

  // Extract __NEXT_DATA__ JSON embedded in the page
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch) throw new Error('__NEXT_DATA__ not found in page');

  const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;

  // Navigate: props.pageProps.initialData.searchModel.products
  const pageProps  = (nextData.props as Record<string, unknown>)?.pageProps as Record<string, unknown>;
  const initial    = pageProps?.initialData as Record<string, unknown>;
  const search     = initial?.searchModel as Record<string, unknown>;
  const products   = search?.products as unknown[];

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('No products in __NEXT_DATA__');
  }

  return products.slice(0, 12).map((p: unknown) => {
    const item    = p as Record<string, unknown>;
    const idents  = (item.identifiers ?? {}) as Record<string, unknown>;
    const media   = (item.media ?? {}) as Record<string, unknown>;
    const images  = (Array.isArray(media.images) ? media.images : []) as Record<string, unknown>[];
    const pricing = (item.pricing ?? {}) as Record<string, unknown>;
    const itemId  = String(idents.itemId ?? item.itemId ?? '');
    const label   = String(idents.productLabel ?? idents.modelNumber ?? item.description ?? '');
    const img     = String(images[0]?.url ?? '');

    return {
      itemId,
      name:          label,
      model:         String(idents.modelNumber ?? ''),
      brand:         String(idents.brandName ?? ''),
      price:         typeof pricing.value    === 'number' ? pricing.value    : null,
      originalPrice: typeof pricing.original === 'number' ? pricing.original : null,
      image:         img.startsWith('//') ? `https:${img}` : img,
      url:           itemId
        ? `https://www.homedepot.com/p/${label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}/${itemId}`
        : `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
    };
  }).filter(p => p.name.length > 2);
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const rapidKey  = process.env.RAPIDAPI_HD_KEY;
  const scraperKey = process.env.SCRAPER_API_KEY;

  // Strategy 1: RapidAPI (fastest + most reliable when key is set)
  if (rapidKey) {
    try {
      const products = await tryRapidAPI(q, rapidKey);
      if (products.length > 0) return NextResponse.json({ products, source: 'rapidapi' });
    } catch (e) {
      console.error('[HD] RapidAPI failed:', e);
    }
  }

  // Strategy 2: ScraperAPI rendered page
  if (scraperKey) {
    try {
      const products = await tryScraperAPI(q, scraperKey);
      if (products.length > 0) return NextResponse.json({ products, source: 'scraper' });
    } catch (e) {
      console.error('[HD] ScraperAPI failed:', e);
    }
  }

  // No method worked
  const needsSetup = !rapidKey && !scraperKey;
  return NextResponse.json({
    products: [],
    error: needsSetup
      ? 'Setup required: Add RAPIDAPI_HD_KEY in Railway for Home Depot search.'
      : `No results found for "${q}". Home Depot may have changed their page structure. Try a different search term, or add RAPIDAPI_HD_KEY in Railway for guaranteed results.`,
    setupRequired: needsSetup,
  });
}
