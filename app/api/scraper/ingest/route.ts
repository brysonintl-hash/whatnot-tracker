import { NextRequest, NextResponse } from 'next/server';
import { setIngest } from '@/lib/ingestCache';
import type { Listing } from '@/app/api/scraper/route';

export const dynamic = 'force-dynamic';

// text/plain requests don't trigger CORS preflight — only need Allow-Origin on the response
const CORS = {
  'Access-Control-Allow-Origin': 'https://www.whatnot.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    // Accept both application/json and text/plain (text/plain skips CORS preflight)
    const text = await req.text();
    const body = JSON.parse(text) as { username: string; listings: Listing[] };
    const { username, listings } = body;
    if (!username || !Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: CORS });
    }
    setIngest(username.toLowerCase(), listings);
    return NextResponse.json({ ok: true, count: listings.length }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: CORS });
  }
}
