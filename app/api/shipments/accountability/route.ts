import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getClaims } from '@/lib/sheets';
import { getAssignments } from '@/lib/shipmentStore';
import * as wnStore from '@/lib/whatnot/store';
import { getContents } from '@/lib/whatnot/shipQueue';
import {
  claimErrors, eventsByShipment, getLedger, handlerOf, scoreboard,
  type ClaimRef, type Handler,
} from '@/lib/shipmentLedger';
import { isManager } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * Who handled how many shipments in the window, and how many of those came
 * back with a problem — reported here, or logged on the Incomplete Orders
 * and Replacements tabs against an order we can trace to a shipment.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !isManager(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const ledger = getLedger();
  const events = eventsByShipment(ledger.events);
  const firstAssignment = new Map<string, ReturnType<typeof getAssignments>[number]>();
  for (const a of getAssignments()) if (!firstAssignment.has(a.shipmentId)) firstAssignment.set(a.shipmentId, a);

  const ids = new Set<string>([...Array.from(events.keys()), ...Array.from(firstAssignment.keys())]);
  const handlers = new Map<string, Handler>();
  for (const id of Array.from(ids)) {
    const h = handlerOf(events.get(id) ?? [], firstAssignment.get(id));
    if (h) handlers.set(id, h);
  }

  // Order → shipment, from parcels we've opened and from synced order items.
  const orderToShipment = new Map<string, string>();
  for (const c of Object.values(getContents())) {
    for (const l of c.lines) if (l.orderId) orderToShipment.set(l.orderId, c.shipmentId);
  }
  for (const i of wnStore.getOrderItems()) {
    if (i.shipment_id && !orderToShipment.has(i.order_id)) orderToShipment.set(i.order_id, i.shipment_id);
  }

  const claims: ClaimRef[] = [];
  for (const type of ['incomplete', 'replacement'] as const) {
    try {
      for (const c of await getClaims(type)) claims.push({ type, orderNumber: c.orderNumber, itemName: c.itemName, note: c.note });
    } catch {
      // The sheet being unreachable shouldn't hide what was reported here.
    }
  }
  const linked = claimErrors(
    claims,
    order => orderToShipment.get(order) ?? null,
    id => handlers.get(id) ?? null,
    ledger.dismissedClaims,
  );

  const all = [...ledger.errors, ...linked];
  const people = scoreboard(
    Array.from(handlers.entries()).map(([shipmentId, handler]) => ({ shipmentId, handler })),
    all,
    since,
  );

  const buyers = new Map(wnStore.getShipments().map(s => [s.id, s.recipient?.username ?? null]));
  const problems = all
    .filter(e => e.reportedAt && e.reportedAt >= since)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
    .map(e => ({ ...e, buyer: buyers.get(e.shipmentId) ?? null }));

  return NextResponse.json({
    days, since, people, problems,
    unattributed: linked.filter(e => !e.against && !e.dismissed).length,
  });
}
