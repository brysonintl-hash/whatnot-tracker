import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}>([^<]*)<\/${name}>`));
  return m ? m[1].trim() : '';
}

function parseEvent(block: string) {
  return {
    event: tag(block, 'Event'),
    date: tag(block, 'EventDate'),
    time: tag(block, 'EventTime'),
    city: tag(block, 'EventCity'),
    state: tag(block, 'EventState'),
  };
}

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { trackingNumber: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = process.env.USPS_USER_ID;
  if (!userId) {
    return NextResponse.json({ configured: false, error: 'USPS_USER_ID not set' }, { status: 503 });
  }

  const tn = params.trackingNumber.replace(/\s/g, '').toUpperCase();
  const xml = `<TrackRequest USERID="${userId}"><TrackID ID="${tn}"/></TrackRequest>`;
  const url = `https://secure.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    // Error check
    const errDesc = tag(text, 'Description');
    if (errDesc && text.includes('<Error>')) {
      return NextResponse.json({ configured: true, error: errDesc }, { status: 400 });
    }

    const summaryMatch = text.match(/<TrackSummary>([\s\S]*?)<\/TrackSummary>/);
    const latest = summaryMatch ? parseEvent(summaryMatch[1]) : null;

    const detailMatches = Array.from(text.matchAll(/<TrackDetail>([\s\S]*?)<\/TrackDetail>/g));
    const events = detailMatches.map(m => parseEvent(m[1]));

    return NextResponse.json({ configured: true, trackingNumber: tn, latest, events });
  } catch {
    return NextResponse.json({ configured: true, error: 'Failed to reach USPS' }, { status: 502 });
  }
}
