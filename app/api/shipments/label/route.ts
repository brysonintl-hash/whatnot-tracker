import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { whatnot, hasToken, WhatnotError } from '@/lib/whatnot/client';
import * as wnStore from '@/lib/whatnot/store';
import { statusLabel, tabOf } from '@/lib/whatnot/shipQueue';
import { claimIfFree, getAssignments, removeAssignment, upsertAssignment, updateStatus } from '@/lib/shipmentStore';
import { getLedger, recordEvent } from '@/lib/shipmentLedger';
import { canHandle, isManager, validShipmentId } from '@/lib/shipmentAccess';
import type { WnShipment } from '@/lib/whatnot/types';

export const dynamic = 'force-dynamic';

/** A label asked for this recently, and still not on the parcel, is probably on its way. */
const PENDING_MS = 10 * 60_000;

// Two clicks in quick succession — or two people on the same parcel — must
// not become two labels. This only guards one server process, which is all
// this app runs as; Whatnot's own "already has a label" check is behind it.
const inFlight = new Set<string>();

const ACTION_TEXT: Record<string, string> = {
  order_pending_cancellation: 'The buyer asked to cancel. Answer the cancellation request in Whatnot before making a label.',
  country_of_origin_required: 'Whatnot needs the country of origin for an item first. Open it in Whatnot to add it.',
  itn_required: 'Whatnot needs an ITN (export filing number) first. Open it in Whatnot to add it.',
  package_review_required: 'Whatnot wants the package details reviewed first. Open it in Whatnot to check them.',
};

function refusal(e: unknown): { status: number; error: string } {
  if (!(e instanceof WhatnotError)) {
    return { status: 502, error: `Could not reach Whatnot: ${e instanceof Error ? e.message : String(e)}` };
  }
  const detail = e.message ? ` (Whatnot said: ${e.message})` : '';
  switch (e.status) {
    case 403:
      return { status: 403, error: `Whatnot refused. The website's Whatnot key isn't allowed to make labels — it needs the "write:shipments" permission — or the seller account needs verification.${detail}` };
    case 404:
      return { status: 404, error: `Whatnot can't find this shipment any more. It may have been combined into another one — refresh the list.${detail}` };
    case 409:
      return { status: 409, error: `Whatnot won't make this label right now${detail}. Open it in Whatnot to see what it needs.` };
    case 422:
      return { status: 422, error: `Whatnot rejected the request${detail}.` };
    default:
      return { status: 502, error: `Whatnot's label service isn't answering right now. Try again in a minute, or make it in Whatnot.${detail}` };
  }
}

function shape(s: WnShipment) {
  return {
    status: s.status,
    statusLabel: statusLabel(s.status),
    hasLabel: Boolean(s.documents?.label_url || s.documents?.bundled_url),
    tracking: s.tracking?.tracking_code ?? null,
  };
}

/** Make the label: same as Generate Label in Seller Hub, with a name on it. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasToken()) return NextResponse.json({ error: 'WHATNOT_API_KEY is not set on the server.' }, { status: 503 });

  const { shipmentId } = await req.json().catch(() => ({}));
  if (!validShipmentId(shipmentId)) return NextResponse.json({ error: 'Not a Whatnot shipment id' }, { status: 400 });
  if (!canHandle(session, shipmentId)) {
    return NextResponse.json({ error: 'This shipment is assigned to someone else. Ask a manager to move it to you.' }, { status: 403 });
  }
  if (inFlight.has(shipmentId)) {
    return NextResponse.json({ error: 'This label is already being requested.', code: 'busy' }, { status: 409 });
  }

  inFlight.add(shipmentId);
  try {
    // Judge the parcel as it is now, not as it was at the last listing.
    let fresh: WnShipment;
    try {
      fresh = await whatnot.getShipment(shipmentId);
    } catch (e) {
      const r = refusal(e);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    wnStore.putShipments([fresh]);

    if (fresh.status !== 'created') {
      return NextResponse.json({
        error: `This shipment already has a label (${statusLabel(fresh.status)}).`,
        code: 'has-label', shipment: shape(fresh),
      }, { status: 409 });
    }
    if (fresh.fulfillment_method === 'pickup') {
      return NextResponse.json({ error: 'This is a local pickup — it doesn\'t need a shipping label.' }, { status: 409 });
    }
    if (fresh.required_actions?.length) {
      const why = fresh.required_actions.map(a => ACTION_TEXT[a] ?? `Whatnot needs "${a.replace(/_/g, ' ')}" sorted first.`);
      return NextResponse.json({ error: why.join(' '), code: 'needs-action' }, { status: 409 });
    }

    const recent = getLedger().events
      .filter(e => e.shipmentId === shipmentId && e.kind === 'label-requested')
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (recent && Date.now() - Date.parse(recent.at) < PENDING_MS) {
      const when = new Date(recent.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
      return NextResponse.json({
        error: `${recent.byName} asked Whatnot for this label at ${when}. It usually shows up within a minute — wait for it before asking again.`,
        code: 'pending',
      }, { status: 409 });
    }

    const at = new Date().toISOString();

    // A shipper making the label on a parcel nobody has takes it first, so
    // two people can't both label the same box. If the label then fails,
    // the parcel goes back to the pool.
    let tookIt: { shipmentId: string; tab: string } | null = null;
    if (!isManager(session) && !getAssignments().some(a => a.shipmentId === shipmentId)) {
      const tab = fresh.created_at ? tabOf(fresh.created_at) : tabOf(at);
      const holder = claimIfFree({
        shipmentId, tab, assignedTo: session.username, assignedToName: session.name, assignedToRole: session.role,
        assignedBy: session.username, assignedAt: at, status: 'pending', notes: '',
        pinged: false, pingMessage: '', pingAt: '',
      });
      if (holder.assignedTo !== session.username) {
        return NextResponse.json({ error: `${holder.assignedToName} just took this shipment.`, code: 'taken' }, { status: 409 });
      }
      tookIt = { shipmentId, tab };
    }

    try {
      await whatnot.generateLabel(shipmentId);
    } catch (e) {
      const r = refusal(e);
      recordEvent({ shipmentId, kind: 'label-failed', by: session.username, byName: session.name, at, note: r.error });
      if (tookIt) removeAssignment(tookIt.shipmentId, tookIt.tab);
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    recordEvent({ shipmentId, kind: 'label-requested', by: session.username, byName: session.name, at });

    // Whoever makes the label owns the parcel: hand it to them if nobody has
    // it, and mark it started if it was waiting.
    const existing = getAssignments().find(a => a.shipmentId === shipmentId);
    if (!existing) {
      upsertAssignment({
        shipmentId, tab: fresh.created_at ? tabOf(fresh.created_at) : tabOf(at),
        assignedTo: session.username, assignedToName: session.name, assignedToRole: session.role,
        assignedBy: session.username, assignedAt: at,
        status: 'in-progress', notes: '',
        pinged: false, pingMessage: '', pingAt: '',
      });
    } else if (existing.status === 'pending') {
      updateStatus(existing.shipmentId, existing.tab, 'in-progress');
    }

    return NextResponse.json({ ok: true, queued: true });
  } finally {
    inFlight.delete(shipmentId);
  }
}

/** Where the label is now. The page asks this every few seconds after requesting one. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!validShipmentId(id)) return NextResponse.json({ error: 'Not a Whatnot shipment id' }, { status: 400 });
  if (!canHandle(session, id, { print: true })) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const fresh = await whatnot.getShipment(id);
    wnStore.putShipments([fresh]);
    return NextResponse.json(shape(fresh));
  } catch (e) {
    const r = refusal(e);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
}
