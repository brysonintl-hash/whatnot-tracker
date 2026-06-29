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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function regexStat(text: string, label: string): number | null {
  const re = new RegExp('([\\d.,]+[KkMm]?)\\s*' + label, 'i');
  const m = text.match(re);
  return m ? parseCompact(m[1]) : null;
}

function regexReviews(text: string): { score: number | null; count: number | null } {
  const m = text.match(/([\d.]+)\s*\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
  if (m) return { score: parseFloat(m[1]), count: parseCompact(m[2]) };
  const m2 = text.match(/\(\s*([\d.,]+[KkMm]?)\s*Reviews?\s*\)/i);
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

function detectTotalCount(html: string): number | null {
  const m = html.match(/Products?\s*\((\d+)\)/i);
  return m ? parseInt(m[1]) : null;
}

// ── Extract listings from rendered HTML ──────────────────────────────────────
function extractListingsFromHtml(html: string): Listing[] {
  const products: Listing[] = [];
  const seenIds = new Set<string>();
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

    // 1. data-testid="listing-title"
    let title = '';
    const testIdM = ctx.match(/data-testid="listing-title"[^>]*>([^<]{5,250})</i);
    if (testIdM) title = testIdM[1].trim();

    // 2. any testid containing "title"
    if (!title) {
      const anyTestId = ctx.match(/data-testid="[^"]*title[^"]*"[^>]*>([^<]{5,250})</i);
      if (anyTestId) title = anyTestId[1].trim();
    }

    // 3. alt attribute
    if (!title) {
      const altRe2 = /alt="([^"]{10,250})"/gi;
      let am: RegExpExecArray | null;
      let lastAlt = '';
      while ((am = altRe2.exec(ctx)) !== null) {
        const t = am[1].trim();
        if (!/^(product|image|thumbnail|photo|item|listing|shop|avatar|profile|logo)$/i.test(t)
            && !/^\d{1,3}w$/.test(t)) {
          lastAlt = t;
        }
      }
      if (lastAlt) title = lastAlt;
    }

    // 4. plain text fallback
    if (!title) {
      const plain = stripHtml(ctx);
      const titleM = plain.match(/\b((?:Retail\s+[\d$]+\s+)?[A-Z][A-Za-z0-9/'()\-&.,% ]{9,200})/);
      title = titleM ? titleM[1].replace(/\s+/g, ' ').trim() : `Listing ${id}`;
    }

    const priceMatches: RegExpExecArray[] = [];
    const priceRe = /\$(\d+(?:\.\d{1,2})?)/g;
    let pm: RegExpExecArray | null;
    while ((pm = priceRe.exec(ctx)) !== null) priceMatches.push(pm);
    const price = priceMatches.length > 0 ? parseFloat(priceMatches[priceMatches.length - 1][1]) : null;

    const imgRe = /src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi;
    let imgM: RegExpExecArray | null;
    let image = '';
    while ((imgM = imgRe.exec(ctx)) !== null) {
      const src = imgM[1];
      if (src.includes('whatnot') || src.includes('hwcdn') || src.includes('cloudfront') || src.includes('imgix')) {
        image = src; break;
      }
    }

    const qtyM = ctx.match(/(?:Qty\.?|Quantity)[:\s]+(\d+)|(\d+)\s+Available/i);
    const qty = qtyM ? parseInt(qtyM[1] ?? qtyM[2]) : null;

    products.push({ id, title, price, image, category: '', condition: '', qty, url: `https://www.whatnot.com/listing/${id}` });
  }

  return products;
}

// ── Shared headers (mimics mobile Whatnot app) ────────────────────────────────
const WN_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Origin': 'https://www.whatnot.com',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

// ── Try Whatnot's profile via direct API calls ────────────────────────────────
interface ProfileData {
  displayName: string;
  bio: string;
  followers: number | null;
  following: number | null;
  reviewCount: number | null;
  reviewScore: number | null;
  totalSold: number | null;
  verified: boolean;
  avatar: string;
}

async function fetchWhatnotProfile(username: string): Promise<ProfileData | null> {
  const blank: ProfileData = {
    displayName: username, bio: '', followers: null, following: null,
    reviewCount: null, reviewScore: null, totalSold: null, verified: false, avatar: '',
  };

  // REST endpoints — Whatnot's internal API
  const restUrls = [
    `https://www.whatnot.com/api/users/${username}`,
    `https://www.whatnot.com/api/v1/users/${username}`,
    `https://www.whatnot.com/api/sellers/${username}`,
    `https://www.whatnot.com/api/v1/sellers/${username}`,
    `https://api.whatnot.com/users/${username}`,
  ];

  for (const url of restUrls) {
    try {
      const res = await fetch(url, { headers: WN_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await res.json();
      // Try to find the user object at various paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = d.user ?? d.seller ?? d.profile ?? d.data?.user ?? d;
      if (!u || typeof u !== 'object' || !u.username) continue;
      return {
        displayName: u.displayName ?? u.display_name ?? u.name ?? username,
        bio: u.bio ?? u.description ?? '',
        followers: numOrNull(u.followersCount ?? u.followers_count ?? u.followers),
        following: numOrNull(u.followingCount ?? u.following_count ?? u.following),
        reviewCount: numOrNull(u.reviewCount ?? u.review_count ?? u.reviews),
        reviewScore: numOrNull(u.reviewScore ?? u.review_score ?? u.rating ?? u.sellerRating),
        totalSold: numOrNull(u.totalSold ?? u.total_sold ?? u.soldCount ?? u.sold_count),
        verified: !!(u.verified ?? u.isVerified ?? u.is_verified),
        avatar: u.profilePhoto ?? u.profile_photo ?? u.avatar ?? u.avatarUrl ?? '',
      };
    } catch { /* try next */ }
  }

  // GraphQL
  const gqlEndpoints = [
    'https://www.whatnot.com/api/graphql',
    'https://www.whatnot.com/graphql',
    'https://api.whatnot.com/graphql',
  ];
  const gqlQueries = [
    `query{user(username:"${username}"){displayName bio followersCount followingCount reviewCount reviewScore totalSold verified profilePhoto}}`,
    `query{seller(username:"${username}"){displayName bio followersCount followingCount sellerRating reviewCount totalItemsSold isVerified avatar}}`,
    `query{profile(username:"${username}"){displayName bio followers{totalCount} following{totalCount} reviews{count averageScore} soldCount verified avatar}}`,
  ];

  for (const endpoint of gqlEndpoints) {
    for (const query of gqlQueries) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: WN_HEADERS,
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d: any = await res.json();
        if (d.errors && !d.data) continue;
        const u = findGQLUser(d);
        if (!u) continue;
        return {
          displayName: u.displayName ?? username,
          bio: u.bio ?? '',
          followers: numOrNull(u.followersCount ?? u.followers?.totalCount),
          following: numOrNull(u.followingCount ?? u.following?.totalCount),
          reviewCount: numOrNull(u.reviewCount ?? u.reviews?.count),
          reviewScore: numOrNull(u.reviewScore ?? u.sellerRating ?? u.reviews?.averageScore),
          totalSold: numOrNull(u.totalSold ?? u.soldCount ?? u.totalItemsSold),
          verified: !!(u.verified ?? u.isVerified),
          avatar: u.profilePhoto ?? u.avatar ?? '',
        };
      } catch { /* try next */ }
    }
  }

  return blank;
}

// ── GraphQL helpers ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findGQLUser(o: any, depth = 0): any {
  if (depth > 6 || !o || typeof o !== 'object') return null;
  if (o.displayName || o.followersCount || o.followingCount) return o;
  for (const v of Object.values(o)) {
    const found = findGQLUser(v, depth + 1);
    if (found) return found;
  }
  return null;
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

async function fetchWhatnotAPIListings(username: string): Promise<Listing[]> {
  const gqlEndpoints = [
    'https://www.whatnot.com/api/graphql',
    'https://www.whatnot.com/graphql',
    'https://api.whatnot.com/graphql',
  ];
  const gqlQueries = [
    { query: `query GetShop($u:String!){user(username:$u){listings(first:200){edges{node{id title price quantity photos{url} category{name} condition}}}}}`, variables: { u: username } },
    { query: `query GetShop($u:String!){seller(username:$u){products(first:200){edges{node{id title price qty imageUrl category condition}}}}}`, variables: { u: username } },
    { query: `query GetShop($u:String!){profile(username:$u){listings(first:200){nodes{id title price quantity photos{url}}}}}`, variables: { u: username } },
  ];

  for (const endpoint of gqlEndpoints) {
    for (const body of gqlQueries) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: WN_HEADERS,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        if (data.errors && !data.data) continue;
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

  const restEndpoints = [
    `https://www.whatnot.com/api/users/${username}/listings?per_page=200`,
    `https://www.whatnot.com/api/sellers/${username}/listings?limit=200`,
    `https://www.whatnot.com/api/v1/users/${username}/products?per_page=200`,
  ];
  for (const url of restEndpoints) {
    try {
      const res = await fetch(url, { headers: WN_HEADERS, signal: AbortSignal.timeout(8000) });
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

// ── ScraperAPI — optional, used as last resort ────────────────────────────────
async function tryScraperAPI(targetUrl: string, key: string, extra: Record<string, string>): Promise<{ html: string; status: number; error?: string }> {
  const params = new URLSearchParams({ api_key: key, url: targetUrl, ...extra });
  try {
    const res = await fetch(`https://api.scraperapi.com/?${params.toString()}`, {
      signal: AbortSignal.timeout(90000),
    });
    const text = await res.text();
    const isHtml = text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<body');
    if (!isHtml) {
      let msg = `status ${res.status}`;
      try { const j = JSON.parse(text); msg = j.message ?? j.error ?? msg; } catch { /* not JSON */ }
      return { html: '', status: res.status, error: msg };
    }
    return { html: text, status: res.status };
  } catch (e) {
    return { html: '', status: 0, error: String(e) };
  }
}

async function fetchViaScraperAPI(targetUrl: string, key: string): Promise<{ html: string; status: number; scraperError?: string }> {
  const attempts: Record<string, string>[] = [
    { render: 'true', country_code: 'us' },
    { render: 'true', country_code: 'us', premium: 'true' },
    { country_code: 'us', premium: 'true' },
    { render: 'true', country_code: 'us', wait: '5000' },
  ];
  let lastError = '';
  for (const params of attempts) {
    const result = await tryScraperAPI(targetUrl, key, params);
    if (result.html && result.html.length > 500) return { html: result.html, status: result.status };
    lastError = result.error ?? `status ${result.status}`;
  }
  return { html: '', status: 0, scraperError: lastError };
}

// ── Main route ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const username = req.nextUrl.searchParams.get('username')?.trim().toLowerCase().replace(/^@/, '');
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

  const scraperKey = process.env.SCRAPER_API_KEY;

  try {
    // Step 1: Try direct Whatnot API for everything (no ScraperAPI credits used)
    const [directListings, directProfile] = await Promise.all([
      fetchWhatnotAPIListings(username),
      fetchWhatnotProfile(username),
    ]);

    // Step 2: If direct API gave us what we need, return it immediately
    if (directListings.length > 0 && directProfile && directProfile.displayName !== username) {
      const catSet = new Set(directListings.map(l => l.category).filter(Boolean));
      return NextResponse.json({
        username,
        displayName: directProfile.displayName,
        bio: directProfile.bio,
        followers: directProfile.followers,
        following: directProfile.following,
        reviewCount: directProfile.reviewCount,
        reviewScore: directProfile.reviewScore,
        totalSold: directProfile.totalSold,
        verified: directProfile.verified,
        avatar: directProfile.avatar,
        listings: directListings,
        categories: Array.from(catSet),
        totalDetected: directListings.length,
      } as ScraperResult);
    }

    // Step 3: Fall back to ScraperAPI for the HTML (renders the page)
    if (!scraperKey) {
      // Return whatever direct API gave us, even if incomplete
      if (directListings.length > 0 || (directProfile && directProfile.followers != null)) {
        const catSet = new Set(directListings.map(l => l.category).filter(Boolean));
        return NextResponse.json({
          username,
          displayName: directProfile?.displayName ?? username,
          bio: directProfile?.bio ?? '',
          followers: directProfile?.followers ?? null,
          following: directProfile?.following ?? null,
          reviewCount: directProfile?.reviewCount ?? null,
          reviewScore: directProfile?.reviewScore ?? null,
          totalSold: directProfile?.totalSold ?? null,
          verified: directProfile?.verified ?? false,
          avatar: directProfile?.avatar ?? '',
          listings: directListings,
          categories: Array.from(catSet),
          totalDetected: directListings.length,
          note: directListings.length === 0 ? 'Add SCRAPER_API_KEY in Railway to scrape listings from the rendered page.' : undefined,
        } as ScraperResult);
      }
      return NextResponse.json({
        error: 'SETUP_REQUIRED',
        message: 'Whatnot blocks direct server requests. Add a ScraperAPI key to bypass Cloudflare:\n\n1. Sign up at https://www.scraperapi.com (free — 5,000 credits/month on trial)\n2. Copy your API key\n3. In Railway → Variables add: SCRAPER_API_KEY = your_key\n4. Redeploy and try again',
      }, { status: 503 });
    }

    // Step 4: Use ScraperAPI for HTML
    const { html, scraperError } = await fetchViaScraperAPI(
      `https://www.whatnot.com/user/${encodeURIComponent(username)}/shop`, scraperKey
    );

    if (!html || html.length < 500) {
      // ScraperAPI failed — but return whatever direct API gave us
      if (directListings.length > 0) {
        const catSet = new Set(directListings.map(l => l.category).filter(Boolean));
        return NextResponse.json({
          username,
          displayName: directProfile?.displayName ?? username,
          bio: directProfile?.bio ?? '',
          followers: directProfile?.followers ?? null,
          following: directProfile?.following ?? null,
          reviewCount: directProfile?.reviewCount ?? null,
          reviewScore: directProfile?.reviewScore ?? null,
          totalSold: directProfile?.totalSold ?? null,
          verified: directProfile?.verified ?? false,
          avatar: directProfile?.avatar ?? '',
          listings: directListings,
          categories: Array.from(catSet),
          totalDetected: directListings.length,
          note: `ScraperAPI couldn't render the page (${scraperError ?? 'unknown error'}) but direct API returned ${directListings.length} listings.`,
        } as ScraperResult);
      }
      return NextResponse.json({
        error: `Could not reach Whatnot. ScraperAPI error: ${scraperError ?? 'empty response'}. Please try again.`,
      }, { status: 503 });
    }

    // Step 5: Got HTML — extract profile + listings from it
    if (html.includes('Page not found') && html.length < 5000) {
      return NextResponse.json({ error: `Seller "@${username}" was not found on Whatnot.` }, { status: 404 });
    }

    const reviews      = regexReviews(html);
    const displayName  = directProfile?.displayName !== username ? directProfile!.displayName : extractDisplayName(html, username);
    const avatar       = directProfile?.avatar || extractAvatar(html);
    const followers    = directProfile?.followers ?? regexStat(html, 'Followers?');
    const following    = directProfile?.following ?? regexStat(html, 'Following') ?? 0;
    const reviewCount  = directProfile?.reviewCount ?? reviews.count;
    const reviewScore  = directProfile?.reviewScore ?? reviews.score;
    const totalSold    = directProfile?.totalSold ?? regexStat(html, 'Sold');
    const totalDetected = detectTotalCount(html);

    const htmlListings = extractListingsFromHtml(html);
    const listings = directListings.length > 0 ? directListings : htmlListings;

    let note: string | undefined;
    if (totalDetected && listings.length < totalDetected) {
      note = `${listings.length} of ${totalDetected} products captured. Whatnot loads the rest via infinite scroll.`;
    }

    const catSet = new Set(listings.map(l => l.category).filter(Boolean));

    return NextResponse.json({
      username,
      displayName,
      bio: directProfile?.bio ?? '',
      followers,
      following,
      reviewCount,
      reviewScore,
      totalSold,
      verified: directProfile?.verified ?? false,
      avatar,
      listings,
      categories: Array.from(catSet),
      totalDetected,
      note,
    } as ScraperResult);

  } catch (e) {
    return NextResponse.json({ error: `Scrape failed: ${String(e)}` }, { status: 500 });
  }
}
