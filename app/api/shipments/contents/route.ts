import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasToken } from '@/lib/whatnot/client';
import { contentsFor } from '@/lib/whatnot/shipQueue';
import { validShipmentId } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/** What's in one parcel, for a row opened before the background read reached it. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!validShipmentId(id)) return NextResponse.json({ error: 'Not a Whatnot shipment id' }, { status: 400 });
  if (!hasToken()) return NextResponse.json({ error: 'WHATNOT_API_KEY is not set on the server.' }, { status: 503 });
  try {
    const c = await contentsFor(id);
    if (!c) return NextResponse.json({ error: 'This shipment isn\'t in the Whatnot list yet — refresh first.' }, { status: 404 });
    return NextResponse.json({ lines: c.lines });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read the items from Whatnot: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
