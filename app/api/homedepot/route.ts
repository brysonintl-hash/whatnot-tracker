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

// Parse HD internal API response (various schema versions)
function parseProducts(data: unknown): HDProduct[] {
  const raw = (data as Record<string, unknown>);
  const list: unknown[] =
    (raw.products as unknown[]) ??
    ((raw.response as Record<string, unknown>)?.products as unknown[]) ??
    [];

  return list.slice(0, 12).map((p: unknown) => {
    const item = p as Record<string, unknown>;
    const pricing = (item.pricing as Record<string, unknown>) ?? {};
    const images  = (item.images  as Record<string, unknown>) ?? {};
    const itemId  = String(item.itemId ?? item.productId ?? '');
    const label   = String(item.label ?? item.description ?? item.title ?? '');

    return {
      itemId,
      name:          label,
      model:         String(item.modelNumber ?? item.model ?? ''),
      brand:         String(item.brandName   ?? item.brand ?? ''),
      price:         typeof pricing.value    === 'number' ? pricing.value    : null,
      originalPrice: typeof pricing.original === 'number' ? pricing.original : null,
      image:         String(images.primaryImage ?? images.main ?? item.image ?? ''),
      url:           itemId
        ? `https://www.homedepot.com/p/${label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}/${itemId}`
        : `https://www.homedepot.com/s/${encodeURIComponent(label)}`,
    };
  }).filter(p => p.name);
}

async function doFetch(url: string, scraperKey?: string): Promise<Response> {
  if (scraperKey) {
    const params = new URLSearchParams({ api_key: scraperKey, url });
    return fetch(`https://api.scraperapi.com/?${params.toString()}`, {
      signal: AbortSignal.timeout(30_000),
    });
  }
  return fetch(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept':          'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer':         'https://www.homedepot.com/',
    },
    signal: AbortSignal.timeout(15_000),
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

  const scraperKey = process.env.SCRAPER_API_KEY;

  // Strategy 1 — HD internal search API (JSON, no render needed)
  const apiUrl = `https://www.homedepot.com/search/v1/products?keyword=${encodeURIComponent(q)}&store=0&pageSize=12&channel=desktop`;
  try {
    const res = await doFetch(apiUrl, scraperKey);
    if (res.ok) {
      const text = await res.text();
      // Make sure we actually got JSON and not an HTML error page
      if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
        const data  = JSON.parse(text);
        const products = parseProducts(data);
        if (products.length > 0) {
          return NextResponse.json({ products, source: 'api' });
        }
      }
    }
  } catch {
    // fall through to strategy 2
  }

  // Strategy 2 — scrape the search page and parse embedded JSON
  if (scraperKey) {
    const pageUrl = `https://www.homedepot.com/s/${encodeURIComponent(q)}`;
    try {
      const params = new URLSearchParams({ api_key: scraperKey, url: pageUrl, render: 'true' });
      const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const html = await res.text();
        // HD embeds Apollo/product JSON in a script tag
        const match =
          html.match(/"products"\s*:\s*(\[[\s\S]{1,60000}?\])\s*[,}]/) ??
          html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]{1,200000}\});/) ??
          html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]{1,400000})<\/script>/);

        if (match) {
          try {
            let parsed: unknown;
            if (match[0].startsWith('"products"')) {
              parsed = { products: JSON.parse(match[1]) };
            } else {
              parsed = JSON.parse(match[1]);
            }
            const products = parseProducts(parsed);
            if (products.length > 0) {
              return NextResponse.json({ products, source: 'html' });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    products: [],
    error: scraperKey
      ? 'Home Depot did not return product data for that search.'
      : 'Add SCRAPER_API_KEY in Railway to fetch Home Depot data.',
  });
}
