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
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// Parse compact numbers like "25.8K", "1.2M" into raw numbers
function parseCompact(s: string): number | null {
  const clean = s.replace(/,/g, '').trim();
  const m = clean.match(/^([\d.]+)([KkMm]?)$/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (m[2].toLowerCase() === 'k') return Math.round(val * 1000);
  if (m[2].toLowerCase() === 'm') return Math.round(val * 1_000_000);
  return Math.round(val);
}

// Extract a number that appears before a label in the HTML (e.g. "25.8K Followers")
function regexStat(html: string, label: string): number | null {
  const re = new RegExp('([\\d.,]+[KkMm]?)\\s*' + label, 'i');
  const m = html.match(re);
  return m ? parseCompact(m[1]) : null;
}

// Pull all JSON-like blobs from script tags
function extractJsonBlobs(html: string): unknown[] {
  const results: unknown[] = [];
  const re = /<script[^>]*>([\s\S]{20,}?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].trim();
    if (!text.startsWith('{') && !text.startsWith('[')) continue;
    try { results.push(JSON.parse(text)); } catch {}
  }
  // Also look for JSON assigned to window variables: window.__X__ = {...}
  const assignRe = /window\.[A-Z_]+\s*=\s*(\{[\s\S]*?\});/g;
  let am: RegExpExecArray | null;
  while ((am = assignRe.exec(html)) !== null) {
    try { results.push(JSON.parse(am[1])); } catch {}
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findUserInBlob(obj: any, targetUsername: string, depth: number): any {
  if (depth > 10 || obj == null) return null;
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const hasFields = ['displayName', 'followersCount', 'reviewScore', 'profilePhoto', 'soldCount'].some(k => k in obj);
    if (hasFields) return obj;
    if (String(obj.username).toLowerCase() === targetUsername && obj.name) return obj;
    for (const val of Object.values(obj)) {
      const found = findUserInBlob(val, targetUsername, depth + 1);
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
    const isListing = ['title', 'name', 'price', 'image', 'listingId', 'productId'].some(k => k in first);
    if (isListing) return obj;
  }
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, val] of Object.entries(obj)) {
      if (['listings', 'products', 'items', 'inventory', 'shopItems', 'forSale'].includes(key)) {
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
function parseListings(raw: any[]): Listing[] {
  return raw.map(item => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dig = (...keys: string[]): any => { for (const k of keys) if (item[k] != null) return item[k]; return undefined; };
    const id = safe(() => String(dig('id', 'listingId', 'productId', 'sku') ?? ''), '');
    const title = safe(() => String(dig('title', 'name', 'productTitle', 'itemName') ?? 'Untitled'), 'Untitled');
    const price = safe(() => parsePrice(dig('price', 'startingPrice', 'buyItNowPrice', 'amount')), null);
    const image = safe(() => String(dig('image', 'imageUrl', 'photo', 'thumbnailUrl', 'coverPhoto') ?? item.photos?.[0]?.url ?? item.images?.[0]?.url ?? ''), '');
    const category = safe(() => String(item.category?.name ?? item.categoryName ?? dig('category') ?? ''), '');
    const condition = safe(() => String(dig('condition', 'itemCondition') ?? ''), '');
    const qty = safe(() => numOrNull(dig('quantity', 'qty', 'stock', 'inventoryCount')), null);
    return { id, title, price, image, category, condition, qty, url: id ? `https://www.whatnot.com/listing/${id}` : '' };
  });
}

// Try Whatnot's internal API endpoints (undocumented but publicly accessible)
async function tryWhatnotAPI(username: string): Promise<{ user: unknown; listings: unknown[] }> {
  const apiHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.whatnot.com/',
    'Origin': 'https://www.whatnot.com',
  };

  // Try multiple known/guessed API endpoint patterns
  const endpoints = [
    `https://www.whatnot.com/api/users/${username}`,
    `https://www.whatnot.com/api/v1/users/${username}`,
    `https://www.whatnot.com/api/v2/users/${username}`,
    `https://www.whatnot.com/api/sellers/${username}`,
    `https://www.whatnot.com/api/profiles/${username}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: apiHeaders });
      if (res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('json')) {
          const data = await res.json();
          if (data && (data.username || data.displayName || data.user)) {
            const userObj = data.user ?? data.profile ?? data;
            const listingsRaw = data.listings ?? data.products ?? data.items ?? [];
            return { user: userObj, listings: listingsRaw };
          }
        }
      }
    } catch {}
  }

  // Try listings-specific endpoints
  const listingEndpoints = [
    `https://www.whatnot.com/api/users/${username}/listings`,
    `https://www.whatnot.com/api/v1/users/${username}/products`,
    `https://www.whatnot.com/api/sellers/${username}/listings`,
  ];
  for (const url of listingEndpoints) {
    try {
      const res = await fetch(url, { headers: apiHeaders });
      if (res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('json')) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : (data.results ?? data.listings ?? data.items ?? []);
          if (arr.length > 0) return { user: {}, listings: arr };
        }
      }
    } catch {}
  }

  return { user: {}, listings: [] };
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0',
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const username = req.nextUrl.searchParams.get('username')?.trim().toLowerCase().replace(/^@/, '');
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

  try {
    // Run all requests in parallel: HTML pages + API probes
    const [shopRes, profileRes, apiData] = await Promise.all([
      fetch(`https://www.whatnot.com/user/${encodeURIComponent(username)}/shop`, { headers: BROWSER_HEADERS })
        .then(r => ({ ok: r.ok, status: r.status, text: r.text() })).catch(() => null),
      fetch(`https://www.whatnot.com/user/${encodeURIComponent(username)}`, { headers: BROWSER_HEADERS })
        .then(r => ({ ok: r.ok, status: r.status, text: r.text() })).catch(() => null),
      tryWhatnotAPI(username),
    ]);

    const shopHtml  = shopRes  ? await shopRes.text  : '';
    const profileHtml = profileRes ? await profileRes.text : '';
    const combinedHtml = shopHtml + profileHtml;

    // Check for blocking / not found
    if (shopRes?.status === 404 && profileRes?.status === 404) {
      return NextResponse.json({ error: `Seller "@${username}" was not found on Whatnot.` }, { status: 404 });
    }
    const isBlocked = combinedHtml.includes('cf-browser-verification') || combinedHtml.includes('Just a moment') || combinedHtml.includes('Enable JavaScript and cookies');
    if (isBlocked) {
      return NextResponse.json({ error: 'Whatnot is blocking automated access with a Cloudflare challenge. Profile data cannot be scraped server-side.' }, { status: 422 });
    }

    // Extract JSON blobs from HTML
    const htmlBlobs = [...extractJsonBlobs(shopHtml), ...extractJsonBlobs(profileHtml)];

    // Try to find user profile object from HTML blobs, then fall back to API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userObj: Record<string, any> = {};
    for (const blob of htmlBlobs) {
      const u = findUserInBlob(blob, username, 0);
      if (u) { userObj = u; break; }
    }
    // Fall back to API user data
    if (!userObj.displayName && !userObj.followersCount) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userObj = (apiData.user as Record<string, any>) ?? {};
    }

    // Find listings: HTML blobs first, then API
    let rawListings: unknown[] = [];
    for (const blob of htmlBlobs) {
      const found = findListingsInBlob(blob);
      if (found.length > rawListings.length) rawListings = found;
    }
    if (rawListings.length === 0 && apiData.listings.length > 0) {
      rawListings = apiData.listings;
    }

    const listings = parseListings(rawListings as Record<string, unknown>[]);
    const catSet = new Set(listings.map(l => l.category).filter(Boolean));
    const categories = Array.from(catSet);

    // Build stats — JSON first, then regex HTML fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (...keys: string[]): any => { for (const k of keys) if ((userObj as any)[k] != null) return (userObj as any)[k]; return undefined; };

    const displayName = String(d('displayName', 'name', 'fullName', 'sellerName') ?? username);
    const bio         = String(d('bio', 'description', 'about') ?? '');
    const followers   = numOrNull(d('followersCount', 'followers', 'followerCount'))
                        ?? regexStat(combinedHtml, 'Followers?');
    const following   = numOrNull(d('followingCount', 'following'));
    const reviewCount = numOrNull(d('reviewCount', 'numReviews', 'reviewsCount', 'totalReviews'))
                        ?? regexStat(combinedHtml, 'Reviews?');
    const reviewScore = numOrNull(d('reviewScore', 'rating', 'averageRating', 'avgRating'))
                        ?? safe(() => {
                          const m = combinedHtml.match(/([\d.]+)\s*(?:\/5)?\s*\([\d.]+[KkMm]?\s*Reviews?\)/);
                          return m ? parseFloat(m[1]) : null;
                        }, null);
    const totalSold   = numOrNull(d('soldCount', 'totalSold', 'itemsSold', 'totalItemsSold'))
                        ?? regexStat(combinedHtml, 'Sold');
    const verified    = !!d('verified', 'isVerified', 'verifiedSeller');
    const avatar      = String(d('profilePhoto', 'avatar', 'profileImage', 'photo', 'photoUrl') ?? '');

    const hasAnyData = displayName !== username || followers != null || reviewCount != null || listings.length > 0;
    if (!hasAnyData) {
      return NextResponse.json({
        error: `Could not retrieve data for "@${username}". Whatnot loads their pages entirely via JavaScript, which server-side scraping cannot execute. The seller may exist but their data isn't accessible without a browser.`,
      }, { status: 422 });
    }

    let note: string | undefined;
    if (listings.length === 0) {
      note = 'Profile data captured. Shop listings could not be retrieved because Whatnot loads products via JavaScript after the page renders — this requires a real browser. The CSV includes all profile stats.';
    }

    const result: ScraperResult = {
      username, displayName, bio, followers, following,
      reviewCount, reviewScore, totalSold, verified, avatar,
      listings, categories, note,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Scrape failed: ${String(e)}` }, { status: 500 });
  }
}
