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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dig(obj: any, ...keys: string[]): any {
  if (obj == null) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// Parse a price string like "$20" or "20.00" into a number
function parsePrice(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// Extract all JSON blobs from script tags in HTML
function extractScriptJsons(html: string): unknown[] {
  const results: unknown[] = [];
  // __NEXT_DATA__
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nd) { try { results.push(JSON.parse(nd[1])); } catch {} }
  // JSON-LD
  const jldRe = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jldM: RegExpExecArray | null;
  while ((jldM = jldRe.exec(html)) !== null) { try { results.push(JSON.parse(jldM[1])); } catch {} }
  // Any other application/json scripts
  const jsonRe = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonM: RegExpExecArray | null;
  while ((jsonM = jsonRe.exec(html)) !== null) { try { results.push(JSON.parse(jsonM[1])); } catch {} }
  return results;
}

// Deep-search an object for arrays that look like product listings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findListingsInObject(obj: any, depth = 0): any[] {
  if (depth > 10 || obj == null) return [];
  if (Array.isArray(obj)) {
    // Check if this looks like a listings array
    if (obj.length > 0 && typeof obj[0] === 'object') {
      const first = obj[0];
      const hasProductFields = ['title', 'name', 'price', 'image', 'photo', 'listingId', 'productId', 'sku'].some(k => k in first);
      if (hasProductFields) return obj;
    }
    for (const item of obj) {
      const found = findListingsInObject(item, depth + 1);
      if (found.length > 0) return found;
    }
  } else if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      // Keys that likely contain listings
      if (['listings', 'products', 'items', 'inventory', 'shop', 'shopItems'].includes(key)) {
        const found = findListingsInObject(val, depth + 1);
        if (found.length > 0) return found;
      }
    }
    // Generic deep search
    for (const val of Object.values(obj)) {
      const found = findListingsInObject(val, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListings(raw: any[]): Listing[] {
  return raw.map(item => {
    const title: string = safe(() =>
      dig(item, 'title', 'name', 'productTitle', 'listingTitle', 'itemName') ?? 'Untitled', 'Untitled');
    const price: number | null = safe(() =>
      parsePrice(dig(item, 'price', 'startingPrice', 'buyItNowPrice', 'currentPrice', 'amount')), null);
    const image: string = safe(() =>
      dig(item, 'image', 'imageUrl', 'photo', 'thumbnailUrl', 'coverPhoto') ??
      item.photos?.[0]?.url ?? item.images?.[0]?.url ?? '', '');
    const category: string = safe(() =>
      item.category?.name ?? item.categoryName ?? dig(item, 'category') ?? '', '');
    const condition: string = safe(() =>
      dig(item, 'condition', 'itemCondition', 'conditionType') ?? '', '');
    const qty: number | null = safe(() => numOrNull(dig(item, 'quantity', 'qty', 'stock', 'inventoryCount')), null);
    const id: string = safe(() =>
      String(dig(item, 'id', 'listingId', 'productId', 'sku') ?? ''), '');
    return {
      id,
      title,
      price,
      image: String(image),
      category: String(category),
      condition: String(condition),
      qty,
      url: id ? `https://www.whatnot.com/listing/${id}` : '',
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findUserInBlob(obj: any, targetUsername: string, depth: number): any {
  if (depth > 8 || obj == null) return null;
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const hasUserFields = ['displayName', 'username', 'followersCount', 'reviewScore', 'profilePhoto'].some(k => k in obj);
    if (hasUserFields && (obj.username === targetUsername || obj.displayName)) return obj;
    for (const val of Object.values(obj)) {
      const found = findUserInBlob(val, targetUsername, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const username = req.nextUrl.searchParams.get('username')?.trim().toLowerCase();
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

  try {
    // Fetch both profile page and shop page in parallel
    const [profileHtml, shopHtml] = await Promise.all([
      fetch(`https://www.whatnot.com/user/${encodeURIComponent(username)}`, { headers: HEADERS }).then(r => r.text()).catch(() => ''),
      fetch(`https://www.whatnot.com/user/${encodeURIComponent(username)}/shop`, { headers: HEADERS }).then(r => r.text()).catch(() => ''),
    ]);

    const htmls = [shopHtml, profileHtml].filter(Boolean);
    if (htmls.every(h => h.includes('404') || h.length < 500)) {
      return NextResponse.json({ error: `Seller "@${username}" not found on Whatnot.` }, { status: 404 });
    }

    // Parse all JSON blobs from both pages
    const allJsons = [...extractScriptJsons(shopHtml), ...extractScriptJsons(profileHtml)];
    if (allJsons.length === 0) {
      return NextResponse.json({ error: 'Could not extract data from Whatnot. The page may require JavaScript.' }, { status: 422 });
    }

    // Find user profile info from any blob
    let userObj: Record<string, unknown> = {};
    for (const blob of allJsons) {
      const u = findUserInBlob(blob, username, 0);
      if (u) { userObj = u; break; }
    }

    // Also try top-level pageProps patterns
    if (!userObj.displayName) {
      for (const blob of allJsons) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pp = (blob as any)?.props?.pageProps ?? {};
        const candidate = pp.user ?? pp.profile ?? pp.seller ?? pp.sellerProfile ?? {};
        if (candidate.displayName || candidate.username) { userObj = candidate; break; }
      }
    }

    // Find listings from all blobs
    let rawListings: unknown[] = [];
    for (const blob of allJsons) {
      const found = findListingsInObject(blob);
      if (found.length > rawListings.length) rawListings = found;
    }

    const listings = parseListings(rawListings as Record<string, unknown>[]);
    const catSet = new Set(listings.map(l => l.category).filter(Boolean));
    const categories = Array.from(catSet);

    // Build profile stats — try both userObj and regex fallbacks from HTML
    const combinedHtml = shopHtml + profileHtml;

    const displayName = safe(() =>
      String(dig(userObj, 'displayName', 'name', 'fullName') || username), username);
    const bio = safe(() => String(dig(userObj, 'bio', 'description') ?? ''), '');
    const followers = safe(() => numOrNull(dig(userObj, 'followersCount', 'followers', 'followerCount')), null)
      ?? safe(() => {
        const m = combinedHtml.match(/([\d.,]+[KkMm]?)\s*Followers?/);
        if (!m) return null;
        const raw = m[1].replace(/,/g, '');
        if (raw.match(/[Kk]$/)) return parseFloat(raw) * 1000;
        if (raw.match(/[Mm]$/)) return parseFloat(raw) * 1000000;
        return parseFloat(raw);
      }, null);
    const following = safe(() => numOrNull(dig(userObj, 'followingCount', 'following')), null);
    const reviewCount = safe(() => numOrNull(dig(userObj, 'reviewCount', 'numReviews', 'reviewsCount')), null);
    const reviewScore = safe(() => numOrNull(dig(userObj, 'reviewScore', 'rating', 'averageRating')), null);
    const totalSold = safe(() => numOrNull(dig(userObj, 'soldCount', 'totalSold', 'itemsSold')), null)
      ?? safe(() => {
        const m = combinedHtml.match(/([\d.,]+[KkMm]?)\s*Sold/);
        if (!m) return null;
        const raw = m[1].replace(/,/g, '');
        if (raw.match(/[Kk]$/)) return parseFloat(raw) * 1000;
        if (raw.match(/[Mm]$/)) return parseFloat(raw) * 1000000;
        return parseFloat(raw);
      }, null);
    const verified = safe(() => !!dig(userObj, 'verified', 'isVerified', 'verifiedSeller'), false);
    const avatar = safe(() => String(dig(userObj, 'profilePhoto', 'avatar', 'profileImage', 'photo') ?? ''), '');

    const note = listings.length === 0
      ? 'Whatnot loads shop listings via JavaScript after the page renders, so product data may not be available in server-side scraping. Profile data is captured from the SSR HTML.'
      : undefined;

    const result: ScraperResult = {
      username,
      displayName,
      bio,
      followers,
      following,
      reviewCount,
      reviewScore,
      totalSold,
      verified,
      avatar,
      listings,
      categories,
      note,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Scrape failed: ${String(e)}` }, { status: 500 });
  }
}
