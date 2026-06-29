import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export type Listing = {
  id: string;
  title: string;
  price: number | null;
  image: string;
  category: string;
  condition: string;
  qty: number | null;
  url: string;
};

export type ScraperResult = {
  username: string;
  displayName: string;
  bio: string;
  followers: number | null;
  following: number | null;
  reviewCount: number | null;
  reviewScore: number | null;
  totalSold: number | null;
  verified: boolean;
  avatar: string;
  listings: Listing[];
  categories: string[];
  totalDetected: number | null;
  note?: string;
};

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseCompact(s: string): number | null {
  const clean = s.replace(/,/g, '').trim();
  const m = clean.match(/^([\d.]+)([KkMm]?)$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (isNaN(val)) return null;
  if (m[2].toLowerCase() === 'k') return Math.round(val * 1000);
  if (m[2].toLowerCase() === 'm') return Math.round(val * 1_000_000);
  return Math.round(val);
}

function regexStat(html: string, label: string): number | null {
  const re = new RegExp('([\\d.,]+[KkMm]?)\\s*' + label, 'i');
  const m = html.match(re);
  return m ? parseCompact(m[1]) : null;
}

function regexReviews(html: string): { score: number | null; count: number | null } {
  const m = html.match(/([\d.]+)\s*\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
  if (m) return { score: parseFloat(m[1]), count: parseCompact(m[2]) };
  const m2 = html.match(/\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
  if (m2) return { score: null, count: parseCompact(m2[1]) };
  return { score: null, count: null };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

// Remove attributes that pollute title extraction (srcset has image filenames like "0-abc.jpeg 96w")
function cleanHtmlAttrs(html: string): string {
  return html
    .replace(/\ssrcset="[^"]*"/gi, '')
    .replace(/\ssizes="[^"]*"/gi, '')
    .replace(/\sdata-src="[^"]*"/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '');
}

function extractDisplayName(html: string, username: string): string {
  const ogM = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
           ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (ogM) {
    const name = ogM[1].replace(/\s*[|\-–—].*$/, '').replace(/\s*on\s*Whatnot.*/i, '').trim();
    if (name && name.toLowerCase() !== 'whatnot') return name;
  }
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleM) {
    const name = titleM[1].replace(/\s*[|\-–—].*$/, '').replace(/\s*on\s*Whatnot.*/i, '').trim();
    if (name && name.toLowerCase() !== 'whatnot') return name;
  }
  return username;
}

function extractAvatar(html: string): string {
  const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
         ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  return m ? m[1] : '';
}

// Detect total product count from "Products (76)" in the page
function detectTotalCount(html: string): number | null {
  const m = html.match(/Products?\s*\((\d+)\)/i);
  return m ? parseInt(m[1]) : null;
}

// ── Extract listings from rendered HTML ──────────────────────────────────────
// Primary title source: alt attribute of the product image (most reliable)
// Secondary: text near the listing link (after removing noisy attributes)
function extractListingsFromHtml(html: string): Listing[] {
  const products: Listing[] = [];
  const seenIds = new Set<string>();

  // Pre-clean: strip srcset and other attributes that pollute text
  const cleanHtml = cleanHtmlAttrs(html);

  const linkRe = /href=["']?((?:https:\/\/(?:www\.)?whatnot\.com)?\/listing\/([a-zA-Z0-9_=-]{6,}))["']?/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(cleanHtml)) !== null) {
    const id = m[2];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const ctxStart = Math.max(0, m.index - 3000);
    const ctxEnd   = Math.min(cleanHtml.length, m.index + 400);
    const ctx = cleanHtml.slice(ctxStart, ctxEnd);

    // ── Title: use alt attribute first (it IS the product name on Whatnot) ──
    // Look for alt text closest to the listing link (search backwards from link position)
    const altMatches: string[] = [];
    const altRe = /alt="([^"]{10,250})"/gi;
    let am: RegExpExecArray | null;
    while ((am = altRe.exec(ctx)) !== null) {
      const t = am[1].trim();
      // Skip generic alts like "product image", "thumbnail", seller name
      if (t.length >= 10 && !/^(product|image|thumbnail|photo|item|listing|shop)$/i.test(t)) {
        altMatches.push(t);
      }
    }
    // Use last alt match (closest to the link)
    let title = altMatches.length > 0 ? altMatches[altMatches.length - 1] : '';

    // ── Fallback: strip tags and find product-like text ──────────────────────
    if (!title) {
      const plain = stripHtml(ctx);
      // Product titles on Whatnot often start with "Retail", brand name, or description
      const titleM = plain.match(/\b((?:Retail\s+[\d$]+\s+)?[A-Z][A-Za-z0-9/'()\-&.,% ]{9,200})/);
      title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : `Listing ${id}`;
    }

    // ── Price ──────────────────────────────────────────────────────────────
    const priceMatches: RegExpExecArray[] = [];
    const priceRe = /\$(\d+(?:\.\d{1,2})?)/g;
    let pm: RegExpExecArray | null;
    while ((pm = priceRe.exec(ctx)) !== null) priceMatches.push(pm);
    const price = priceMatches.length > 0
      ? parseFloat(priceMatches[priceMatches.length - 1][1])
      : null;

    // ── Image ────────────────────────────────────────────────────────────────
    const imgRe = /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi;
    let imgM: RegExpExecArray | null;
    let image = '';
    while ((imgM = imgRe.exec(ctx)) !== null) {
      const src = imgM[1];
      if (src.includes('whatnot') || src.includes('hwcdn') || src.includes('cloudfront') || src.includes('imgix')) {
        image = src; break;
      }
    }

    // ── Qty ──────────────────────────────────────────────────────────────────
    const qtyM = ctx.match(/(?:Qty\.?|Quantity)[:\s]+(\d+)|(\d+)\s+Available/i);
    const qty  = qtyM ? parseInt(qtyM[1] ?? qtyM[2]) : null;

    products.push({ id, title, price, image, category: '', condition: '', qty, url: `https://www.whatnot.com/listing/${id}` });
  }

  return products;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findGQLEdges(obj: any, depth = 0): any[] {
  if (depth > 8 || !obj) return [];
  if (Array.isArray(obj) && obj.length > 0 && obj[0]?.node) return obj.map((e: any) => e.node);
  if (Array.isArray(obj) && obj.length > 0 && obj[0]?.id) return obj;
  if (typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      const found = findGQLEdges(val, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// ── Try Whatnot's internal API directly (no Cloudflare on API endpoints) ────
// Whatnot uses Relay GraphQL. The base64 listing IDs decode to "ListingNode:XXXX"
async function fetchWhatnotAPIListings(username: string): Promise<Listing[]> {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Origin': 'https://www.whatnot.com',
    'Referer': `https://www.whatnot.com/user/${username}/shop`,
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  };

  // GraphQL queries to try (Whatnot uses Relay, so field names may vary)
  const queries = [
    // Pattern 1: user → listings
    { query: `query GetShop($u:String!){user(username:$u){listings(first:200){edges{node{id title price quantity photos{url} category{name} condition}}}}}`, variables: { u: username } },
    // Pattern 2: seller → products
    { query: `query GetShop($u:String!){seller(username:$u){products(first:200){edges{node{id title price qty imageUrl category condition}}}}}`, variables: { u: username } },
    // Pattern 3: profile → listings
    { query: `query GetShop($u:String!){profile(username:$u){listings(first:200){nodes{id title price quantity photos{url}}}}}`, variables: { u: username } },
  ];

  // GraphQL endpoint candidates
  const endpoints = [
    'https://www.whatnot.com/api/graphql',
    'https://www.whatnot.com/graphql',
    'https://api.whatnot.com/graphql',
  ];

  for (const endpoint of endpoints) {
    for (const body of queries) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        if (data.errors && !data.data) continue;

        // Try to find listings array anywhere in the response
        const nodes = findGQLEdges(data);
        if (nodes.length > 0) {
          return nodes.map((node: any) => ({
            id: String(node.id ?? ''),
            title: String(node.title ?? node.name ?? 'Untitled'),
            price: parsePrice(node.price ?? node.amount ?? node.startingPrice),
            image: String(node.photos?.[0]?.url ?? node.imageUrl ?? node.image ?? ''),
            category: String(node.category?.name ?? node.categoryName ?? node.category ?? ''),
            condition: String(node.condition ?? ''),
            qty: numOrNull(node.quantity ?? node.qty ?? node.stock),
            url: node.id ? `https://www.whatnot.com/listing/${node.id}` : '',
          }));
        }
      } catch { /* try next */ }
    }
  }

  // REST fallback patterns
  const restEndpoints = [
    `https://www.whatnot.com/api/users/${username}/listings?per_page=200`,
    `https://www.whatnot.com/api/sellers/${username}/listings?limit=200`,
    `https://www.whatnot.com/api/v1/users/${username}/products?per_page=200`,
  ];
  for (const url of restEndpoints) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const arr = Array.isArray(data) ? data : (data.listings ?? data.results ?? data.products ?? data.items ?? []);
      if (arr.length > 0) {
        return arr.map((item: any) => ({
          id: String(item.id ?? item.listingId ?? ''),
          title: String(item.title ?? item.name ?? 'Untitled'),
          price: parsePrice(item.price ?? item.startingPrice),
          image: String(item.image ?? item.imageUrl ?? item.photo ?? ''),
          category: String(item.category?.name ?? item.categoryName ?? item.category ?? ''),
          condition: String(item.condition ?? ''),
          qty: numOrNull(item.quantity ?? item.qty),
          url: `https://www.whatnot.com/listing/${item.id ?? ''}`,
        }));
      }
    } catch { /* try next */ }
  }

  return [];
}

async function fetchViaScraperAPI(targetUrl: string, key: string): Promise<{ html: string; status: number }> {
  const params = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    render: 'true',
    wait: '15000',
    country_code: 'us',
    premium: 'true',
  });
  try {
    const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
      signal: AbortSignal.timeout(90000),
    });
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: '', status: 0 };
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const username = req.nextUrl.searchParams.get('username')?.trim().toLowerCase().replace(/^@/, '');
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

  const scraperKey = process.env.SCRAPER_API_KEY;
  if (!scraperKey) {
    return NextResponse.json({
      error: 'SETUP_REQUIRED',
      message: 'Whatnot is protected by Cloudflare and blocks direct server requests. Add a free ScraperAPI key:\n\n1. Sign up at https://www.scraperapi.com (free, no credit card, 1,000 requests/month)\n2. Copy your API key\n3. In Railway → Variables add: SCRAPER_API_KEY = your_key\n4. Redeploy and try again',
    }, { status: 503 });
  }

  try {
    // Run ScraperAPI (for profile/HTML) and direct API (for all listings) in parallel
    const [{ html, status }, apiListings] = await Promise.all([
      fetchViaScraperAPI(`https://www.whatnot.com/user/${encodeURIComponent(username)}/shop`, scraperKey),
      fetchWhatnotAPIListings(username),
    ]);

    if (status === 404 || (html.includes('Page not found') && html.length < 5000)) {
      return NextResponse.json({ error: `Seller "@${username}" was not found on Whatnot.` }, { status: 404 });
    }
    if (!html || html.length < 500) {
      return NextResponse.json({ error: 'ScraperAPI returned an empty response. Please try again.' }, { status: 503 });
    }

    // ── Profile stats from HTML ──────────────────────────────────────────────
    const reviews    = regexReviews(html);
    const displayName = extractDisplayName(html, username);
    const avatar      = extractAvatar(html);
    const followers   = regexStat(html, 'Followers?');
    const following   = regexStat(html, 'Following') ?? 0;
    const reviewCount = reviews.count;
    const reviewScore = reviews.score;
    const totalSold   = regexStat(html, 'Sold');
    const totalDetected = detectTotalCount(html);

    // ── Listings: prefer direct API (all items), fall back to HTML DOM ───────
    let listings: Listing[];
    let note: string | undefined;

    if (apiListings.length > 0) {
      listings = apiListings;
      if (totalDetected && listings.length < totalDetected) {
        note = `Direct API returned ${listings.length} listings (page may show ${totalDetected} total — some may be paginated).`;
      }
    } else {
      listings = extractListingsFromHtml(html);
      if (totalDetected && listings.length < totalDetected) {
        note = `Only ${listings.length} of ${totalDetected} products captured from the first page. Whatnot loads the rest via infinite scroll which server-side scraping cannot trigger.`;
      } else if (listings.length === 0) {
        note = 'No listings found. Profile data is included in the CSV.';
      }
    }

    const catSet = new Set(listings.map(l => l.category).filter(Boolean));
    const categories = Array.from(catSet);

    const result: ScraperResult = {
      username,
      displayName: safe(() => displayName, username),
      bio: '',
      followers: safe(() => followers, null),
      following: safe(() => following, null),
      reviewCount: safe(() => reviewCount, null),
      reviewScore: safe(() => reviewScore, null),
      totalSold: safe(() => totalSold, null),
      verified: false,
      avatar: safe(() => avatar, ''),
      listings,
      categories,
      totalDetected,
      note,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Scrape failed: ${String(e)}` }, { status: 500 });
  }
}
