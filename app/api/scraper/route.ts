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

// Parse "25.8K", "1.2M", "18400" → raw number
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

// Find NUMBER before a label — handles "25.8K Followers", "18.4K Sold", etc.
function regexStat(html: string, label: string): number | null {
  // Try with compact suffix first (e.g. 25.8K Followers)
  const re = new RegExp('([\\d.,]+[KkMm]?)\\s*' + label, 'i');
  const m = html.match(re);
  return m ? parseCompact(m[1]) : null;
}

// Handle Whatnot's format: "4.9 (2.4K Reviews)" — rating before parens, count inside
function regexReviews(html: string): { score: number | null; count: number | null } {
  // Format: 4.9 (2.4K Reviews)
  const m = html.match(/([\d.]+)\s*\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
  if (m) return { score: parseFloat(m[1]), count: parseCompact(m[2]) };
  // Format: (2.4K Reviews) without leading score
  const m2 = html.match(/\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
  if (m2) return { score: null, count: parseCompact(m2[1]) };
  // Format: 2.4K Reviews
  const m3 = html.match(/([\d.,]+[KkMm]?)\s*Reviews?/i);
  if (m3) return { score: null, count: parseCompact(m3[1]) };
  return { score: null, count: null };
}

// Strip all HTML tags, decode basic entities, collapse whitespace
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract all JSON-like blobs from script tags
function extractJsonBlobs(html: string): unknown[] {
  const results: unknown[] = [];
  // __NEXT_DATA__
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (nd) { try { results.push(JSON.parse(nd[1])); } catch {} }
  // Any <script> that starts with { or [
  const re = /<script[^>]*>\s*(\{[\s\S]{50,}?\}|\[[\s\S]{50,}?\])\s*<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1])); } catch {}
  }
  // window.__X__ = {...} assignments
  const assignRe = /(?:window\.[A-Z_]+|self\.__next\w*)\s*=\s*(\{[\s\S]*?\})\s*;/g;
  let am: RegExpExecArray | null;
  while ((am = assignRe.exec(html)) !== null) {
    try { results.push(JSON.parse(am[1])); } catch {}
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findUserInBlob(obj: any, depth: number): any {
  if (depth > 10 || obj == null) return null;
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    const score = ['displayName', 'followersCount', 'reviewScore', 'profilePhoto', 'soldCount', 'sellerRating'].filter(k => keys.includes(k)).length;
    if (score >= 2) return obj;
    for (const val of Object.values(obj)) {
      const found = findUserInBlob(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findListingsInBlob(obj: any, depth = 0): any[] {
  if (depth > 10 || obj == null) return [];
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') {
    const first = obj[0];
    const score = ['title', 'name', 'price', 'image', 'listingId', 'productId'].filter(k => k in first).length;
    if (score >= 2) return obj;
  }
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj)) {
      if (['listings', 'products', 'items', 'inventory', 'shopItems', 'forSale', 'sellerListings'].includes(key)) {
        const found = findListingsInBlob(val, depth + 1);
        if (found.length > 0) return found;
      }
    }
    for (const val of Object.values(obj)) {
      const found = findListingsInBlob(val, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListingsFromBlobs(raw: any[]): Listing[] {
  return raw.map(item => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dig = (...keys: string[]): any => { for (const k of keys) if (item[k] != null) return item[k]; return undefined; };
    const id       = safe(() => String(dig('id', 'listingId', 'productId', 'sku') ?? ''), '');
    const title    = safe(() => String(dig('title', 'name', 'productTitle', 'itemName') ?? 'Untitled'), 'Untitled');
    const price    = safe(() => parsePrice(dig('price', 'startingPrice', 'buyItNowPrice', 'amount')), null);
    const image    = safe(() => String(dig('image', 'imageUrl', 'photo', 'thumbnailUrl', 'coverPhoto') ?? item.photos?.[0]?.url ?? ''), '');
    const category = safe(() => String(item.category?.name ?? item.categoryName ?? dig('category') ?? ''), '');
    const condition = safe(() => String(dig('condition', 'itemCondition') ?? ''), '');
    const qty      = safe(() => numOrNull(dig('quantity', 'qty', 'stock', 'inventoryCount')), null);
    return { id, title, price, image, category, condition, qty, url: id ? `https://www.whatnot.com/listing/${id}` : '' };
  });
}

// Extract product listings directly from rendered DOM HTML by finding listing URLs
function extractListingsFromHtml(html: string): Listing[] {
  const products: Listing[] = [];
  const seenIds = new Set<string>();

  // Match Whatnot listing URLs in any attribute (href, data-href, etc.)
  // Handles: /listing/abc123  or  https://www.whatnot.com/listing/abc123
  const linkRe = /(?:href|data-href)=["']?((?:https:\/\/(?:www\.)?whatnot\.com)?\/listing\/([a-zA-Z0-9_-]{6,}))["']?/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const id = m[2];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    // Context: 3000 chars before (for title/image) + 300 after (for price/qty)
    const ctxStart = Math.max(0, m.index - 3000);
    const ctxEnd   = Math.min(html.length, m.index + 300);
    const ctx = html.slice(ctxStart, ctxEnd);

    // Price: last $XX or $XX.XX in context (closest to the link)
    const priceMatches: RegExpExecArray[] = [];
    const priceRe2 = /\$(\d+(?:\.\d{1,2})?)/g;
    let pm: RegExpExecArray | null;
    while ((pm = priceRe2.exec(ctx)) !== null) priceMatches.push(pm);
    const price = priceMatches.length > 0 ? parseFloat(priceMatches[priceMatches.length - 1][1]) : null;

    // Image: any CDN image in context — prefer whatnot/hwcdn/cloudfront domains
    const imgRe2 = /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi;
    let imgM: RegExpExecArray | null;
    let image = '';
    while ((imgM = imgRe2.exec(ctx)) !== null) {
      const src = imgM[1];
      if (src.includes('whatnot') || src.includes('hwcdn') || src.includes('cloudfront') || src.includes('imgix')) {
        image = src; break;
      }
    }
    // Fallback: any image
    if (!image) {
      const anyImg = ctx.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/i);
      if (anyImg) image = anyImg[1];
    }

    // Title: strip tags from context, find longest plausible product name
    const plain = stripHtml(ctx);
    // Product names on Whatnot are typically 10–200 chars, start with a capital or digit
    const titleM = plain.match(/([A-Z0-9][A-Za-z0-9/'()\-&.,% ]{9,200})/);
    const title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : `Listing ${id}`;

    // Qty: "Qty. 6", "Qty 6", "6 left", "Quantity: 6"
    const qtyM = ctx.match(/(?:Qty\.?|Quantity)[:\s]+(\d+)|(\d+)\s*(?:left|remaining|available)/i);
    const qty  = qtyM ? parseInt(qtyM[1] ?? qtyM[2]) : null;

    products.push({ id, title, price, image, category: '', condition: '', qty, url: `https://www.whatnot.com/listing/${id}` });
  }

  return products;
}

// Extract display name from rendered HTML — look for heading or meta tags
function extractDisplayName(html: string, username: string): string {
  // og:title meta
  const ogM = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
           ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  if (ogM) {
    const name = ogM[1].replace(/\s*[|\-–—].*$/, '').trim();
    if (name && name.toLowerCase() !== 'whatnot') return name;
  }
  // <title> tag
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleM) {
    const name = titleM[1].replace(/\s*[|\-–—].*$/, '').replace(/\s*on\s*Whatnot.*$/i, '').trim();
    if (name && name.toLowerCase() !== 'whatnot' && name.length > 0) return name;
  }
  return username;
}

// Extract avatar from og:image or first matching profile image
function extractAvatar(html: string): string {
  const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
         ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  return m ? m[1] : '';
}

async function fetchViaScraperAPI(targetUrl: string, key: string): Promise<{ html: string; status: number }> {
  // render=true  → executes JavaScript
  // wait=15000   → wait 15s after page load for async product API calls to finish
  // country_code=us → use US residential IP (Whatnot serves US content)
  const params = new URLSearchParams({
    api_key: key,
    url: targetUrl,
    render: 'true',
    wait: '15000',
    country_code: 'us',
    premium: 'true',      // residential proxy — better success rate on Whatnot
  });
  const url = `https://api.scraperapi.com/?${params.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
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
      message: 'Whatnot is protected by Cloudflare and blocks direct server requests. To enable scraping, add a free ScraperAPI key:\n\n1. Go to https://www.scraperapi.com and sign up (free — no credit card, 1,000 requests/month)\n2. Copy your API key from the dashboard\n3. In Railway → your service → Variables add: SCRAPER_API_KEY = your_key\n4. Redeploy and try again',
    }, { status: 503 });
  }

  try {
    // Fetch the shop page (has products) — one request to save API credits
    const { html, status } = await fetchViaScraperAPI(
      `https://www.whatnot.com/user/${encodeURIComponent(username)}/shop`,
      scraperKey,
    );

    if (status === 404 || html.includes('Page not found') || html.includes('404') && html.length < 3000) {
      return NextResponse.json({ error: `Seller "@${username}" was not found on Whatnot.` }, { status: 404 });
    }

    if (!html || html.length < 500) {
      return NextResponse.json({ error: 'ScraperAPI returned an empty response. Please try again in a moment.' }, { status: 503 });
    }

    // ── 1. Try JSON blobs (React hydration / __NEXT_DATA__) ──────────────────
    const blobs = extractJsonBlobs(html);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userObj: Record<string, any> = {};
    for (const blob of blobs) {
      const u = findUserInBlob(blob, 0);
      if (u) { userObj = u; break; }
    }
    let rawListings: unknown[] = [];
    for (const blob of blobs) {
      const found = findListingsInBlob(blob);
      if (found.length > rawListings.length) rawListings = found;
    }
    let listings = parseListingsFromBlobs(rawListings as Record<string, unknown>[]);

    // ── 2. Fall back to DOM extraction if JSON gave us nothing ────────────────
    if (listings.length === 0) {
      listings = extractListingsFromHtml(html);
    }

    // ── 3. Profile stats: JSON → meta tags → regex on plain text ─────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dig = (...keys: string[]): any => { for (const k of keys) if ((userObj as any)[k] != null) return (userObj as any)[k]; return undefined; };
    const reviews  = regexReviews(html);
    const plainHtml = stripHtml(html);

    const displayName = String(dig('displayName', 'name', 'fullName', 'sellerName') ?? '')
      || extractDisplayName(html, username);

    const bio = String(dig('bio', 'description', 'about') ?? '');

    const followers = numOrNull(dig('followersCount', 'followers', 'followerCount'))
      ?? regexStat(html, 'Followers?')
      ?? regexStat(plainHtml, 'Followers?');

    const following = numOrNull(dig('followingCount', 'following'))
      ?? regexStat(html, 'Following')
      ?? regexStat(plainHtml, 'Following');

    const reviewCount = numOrNull(dig('reviewCount', 'numReviews', 'reviewsCount', 'totalReviews'))
      ?? reviews.count;

    const reviewScore = numOrNull(dig('reviewScore', 'rating', 'averageRating', 'avgRating'))
      ?? reviews.score;

    const totalSold = numOrNull(dig('soldCount', 'totalSold', 'itemsSold', 'totalItemsSold'))
      ?? regexStat(html, 'Sold')
      ?? regexStat(plainHtml, 'Sold');

    const verified = !!dig('verified', 'isVerified', 'verifiedSeller');

    const avatar = String(dig('profilePhoto', 'avatar', 'profileImage', 'photo', 'photoUrl') ?? '')
      || extractAvatar(html);

    const catSet = new Set(listings.map(l => l.category).filter(Boolean));
    const categories = Array.from(catSet);

    let note: string | undefined;
    if (listings.length === 0) {
      note = 'Profile info was captured but shop listings could not be found in the rendered page. Whatnot may load products via a separate API call after page render. All captured profile data is included in the CSV.';
    }

    const result: ScraperResult = {
      username, displayName, bio,
      followers, following, reviewCount, reviewScore, totalSold,
      verified, avatar, listings, categories, note,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Scrape failed: ${String(e)}` }, { status: 500 });
  }
}
