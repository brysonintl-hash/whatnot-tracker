import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export type ScraperResult = {
  username: string;
  displayName: string;
  bio: string;
  followers: number | null;
  following: number | null;
  reviewCount: number | null;
  reviewScore: number | null;
  verified: boolean;
  avatar: string;
  listings: Listing[];
  categories: string[];
  error?: string;
};

export type Listing = {
  id: string;
  title: string;
  price: number | null;
  image: string;
  category: string;
  condition: string;
  url: string;
};

function extractNextData(html: string): Record<string, unknown> | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager'))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const username = req.nextUrl.searchParams.get('username')?.trim().toLowerCase();
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 });

  try {
    const html = await fetch(`https://www.whatnot.com/user/${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 300 },
    }).then(r => r.text());

    const nd = extractNextData(html);
    if (!nd) return NextResponse.json({ error: 'Could not load Whatnot profile. The seller may not exist or the page is restricted.' }, { status: 404 });

    // Navigate the Next.js page props structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (nd as any)?.props?.pageProps ?? {};
    const user = props.user ?? props.profile ?? props.seller ?? {};
    const listingsRaw: unknown[] = props.listings ?? props.products ?? props.items ?? [];

    const displayName: string = safe(() => user.displayName || user.name || user.username || username, username);
    const bio: string = safe(() => user.bio || user.description || '', '');
    const followers: number | null = safe(() => user.followersCount ?? user.followers ?? null, null);
    const following: number | null = safe(() => user.followingCount ?? user.following ?? null, null);
    const reviewCount: number | null = safe(() => user.reviewCount ?? user.reviews?.total ?? null, null);
    const reviewScore: number | null = safe(() => user.reviewScore ?? user.rating ?? null, null);
    const verified: boolean = safe(() => !!user.verified, false);
    const avatar: string = safe(() => user.profilePhoto ?? user.avatar ?? user.profileImage ?? '', '');

    const categories = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listings: Listing[] = listingsRaw.map((item: any) => {
      const category: string = safe(() => item.category?.name ?? item.categoryName ?? item.category ?? '', '');
      if (category) categories.add(category);
      return {
        id: safe(() => String(item.id ?? item.listingId ?? ''), ''),
        title: safe(() => item.title ?? item.name ?? item.productTitle ?? 'Untitled', 'Untitled'),
        price: safe(() => {
          const p = item.price ?? item.startingPrice ?? item.currentPrice;
          return p != null ? parseFloat(String(p)) : null;
        }, null),
        image: safe(() => item.image ?? item.imageUrl ?? item.thumbnailUrl ?? item.photos?.[0]?.url ?? '', ''),
        category,
        condition: safe(() => item.condition ?? item.itemCondition ?? '', ''),
        url: `https://www.whatnot.com/listing/${safe(() => String(item.id ?? item.listingId ?? ''), '')}`,
      };
    });

    const result: ScraperResult = {
      username,
      displayName,
      bio,
      followers,
      following,
      reviewCount,
      reviewScore,
      verified,
      avatar,
      listings,
      categories: Array.from(categories),
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `Failed to scrape: ${String(e)}` }, { status: 500 });
  }
}
