import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAssignments } from '@/lib/shipmentStore';
import { addError, getLedger, handlerOf, isErrorType, setDismissed } from '@/lib/shipmentLedger';
import { isManager, validShipmentId } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * Report a problem with a shipment. It counts against the shipment's handler
 * unless the manager names someone else — e.g. the packer when someone else
 * made the label.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isManager(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { shipmentId, type, note, orderId, against, againstName } = body as Record<string, unknown>;
  if (!validShipmentId(shipmentId)) return NextResponse.json({ error: 'Not a Whatnot shipment id' }, { status: 400 });
  if (!isErrorType(type)) return NextResponse.json({ error: 'Pick what went wrong' }, { status: 400 });

  let who = typeof against === 'string' ? against.trim() : '';
  let whoName = typeof againstName === 'string' ? againstName.trim() : '';
  if (!who) {
    const events = getLedger().events.filter(e => e.shipmentId === shipmentId);
    const h = handlerOf(events, getAssignments().find(a => a.shipmentId === shipmentId));
    if (!h) {
      return NextResponse.json({
        error: 'Nobody made this label here and it isn\'t assigned to anyone. Choose whose error it was.',
        code: 'no-handler',
      }, { status: 400 });
    }
    who = h.username;
    whoName = h.name;
  }

  const report = addError({
    shipmentId,
    orderId: typeof orderId === 'string' && orderId ? orderId : null,
    type,
    note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
    against: who,
    againstName: whoName || who,
    reportedBy: session.username,
    reportedAt: new Date().toISOString(),
    source: 'manual',
  });
  return NextResponse.json({ ok: true, report });
}

/** Rule a problem out — not their fault after all — or put it back. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !isManager(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, dismissed } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const ok = setDismissed(id, session.username, dismissed !== false);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
