import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  verifySignature, claimEvent, handleEvent, noteRejected,
  getStatus, getLog, getLineups, getTimelines, type Envelope,
} from '@/lib/whatnot/webhook';

export const dynamic = 'force-dynamic';

/**
 * Whatnot delivers here. middleware.ts lets this one path through without a
 * login — the signature is what proves the sender, not a session.
 */
export async function POST(req: Request) {
  const secret = process.env.WHATNOT_WEBHOOK_SECRET;

  // Without the secret nothing can be verified. Answer 503 rather than 200:
  // Whatnot retries for ~2.5 days, so every event waits to be redelivered once
  // the secret is in place instead of being accepted unchecked or thrown away.
  if (!secret) {
    noteRejected('WHATNOT_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 503 });
  }

  // The raw bytes, exactly as sent. Parsing and re-serialising first would
  // change whitespace or key order and break the signature.
  const body = await req.text();
  const headers = {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  };

  const v = verifySignature(secret, headers, body);
  if (!v.ok) {
    noteRejected(v.reason);
    // A 4xx tells Whatnot this delivery is bad, per its docs.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let env: Envelope;
  try {
    env = JSON.parse(body) as Envelope;
  } catch {
    noteRejected('body is not JSON');
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }

  // Retries reuse the id. A repeat is acknowledged and otherwise ignored.
  if (!claimEvent(headers.id!)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Reply first, work after: Whatnot counts anything slower than five seconds
  // as a failure, and refreshing a record from the API can take longer. The
  // server is a long-lived process on Railway, so the promise keeps running.
  void handleEvent(headers.id!, env).catch(e => console.error('webhook handler:', e));
  return NextResponse.json({ ok: true });
}

/** Status for the Setup tab: is anything arriving, and what does it look like. */
export async function GET() {
  const session = await getSession();
  if (!session || !['admin', 'manager'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const lineups = getLineups();
  const timelines = getTimelines();
  return NextResponse.json({
    configured: Boolean(process.env.WHATNOT_WEBHOOK_SECRET),
    status: getStatus(),
    recent: getLog().slice(0, 40),
    lineupShows: Object.keys(lineups).length,
    lineupEntries: Object.values(lineups).reduce((s, l) => s + l.length, 0),
    timelines: Object.keys(timelines).length,
  });
}
