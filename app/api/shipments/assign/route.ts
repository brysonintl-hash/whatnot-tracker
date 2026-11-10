import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  upsertAssignment, removeAssignment, updateStatus,
  bulkAssign, pingShipment, acknowledgePing, getAssignments, updateNotes, claimIfFree,
  type ShipmentAssignment,
} from '@/lib/shipmentStore';
import { buildRows, isAvailable, packingOrder } from '@/lib/shipmentRows';
import { canSelfAssign } from '@/lib/shipmentAccess';
import { updateShipmentInSheet } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // === AUTO-ASSIGN ===
  if (action === 'auto-assign') {
    if (session.role !== 'admin' && session.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { items, assignedTo, assignedToName, assignedToRole, notes } = body;
    if (!items?.length || !assignedTo) {
      return NextResponse.json({ error: 'Missing items or assignedTo' }, { status: 400 });
    }
    bulkAssign(items, assignedTo, assignedToName, assignedToRole, session.username, notes || '');
    return NextResponse.json({ success: true, count: items.length });
  }

  // === BULK RESOLVE ===
  if (action === 'bulk-resolve') {
    const { items } = body;
    if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 });
    const assignments = getAssignments();
    const isAdmin = session.role === 'admin' || session.role === 'manager';
    for (const item of items) {
      const a = assignments.find(x => x.shipmentId === item.shipmentId && x.tab === item.tab);
      if (!a) continue;
      if (!isAdmin && a.assignedTo !== session.username) continue; // host/shipper can only resolve their own
      updateStatus(item.shipmentId, item.tab, 'resolved');
    }
    return NextResponse.json({ success: true });
  }

  // === BULK UNASSIGN ===
  if (action === 'bulk-unassign') {
    if (session.role !== 'admin' && session.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { items } = body;
    if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 });
    for (const item of items) removeAssignment(item.shipmentId, item.tab);
    return NextResponse.json({ success: true });
  }

  // === PING ===
  if (action === 'ping') {
    if (session.role !== 'admin' && session.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { shipmentId, tab, pingMessage } = body;
    if (!shipmentId || !tab) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    pingShipment(shipmentId, tab, pingMessage || '');
    return NextResponse.json({ success: true });
  }

  // === ACKNOWLEDGE PING ===
  if (action === 'acknowledge') {
    const { shipmentId, tab } = body;
    if (!shipmentId || !tab) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const a = getAssignments().find(x => x.shipmentId === shipmentId && x.tab === tab);
    const isAdmin = session.role === 'admin' || session.role === 'manager';
    if (a && !isAdmin && a.assignedTo !== session.username) return NextResponse.json({ error: 'That shipment isn\'t yours.' }, { status: 403 });
    acknowledgePing(shipmentId, tab);
    return NextResponse.json({ success: true });
  }

  // === TAKE IT MYSELF ===
  // Shippers and hosts take work nobody has. One parcel by id, or the next N
  // in packing order — still needing a label, oldest first — skipping any
  // Whatnot is holding up (a cancel request, missing customs info).
  if (action === 'claim' || action === 'claim-next') {
    if (!canSelfAssign(session)) return NextResponse.json({ error: 'Only shippers and hosts can take shipments themselves.' }, { status: 403 });
    const rows = await buildRows();
    const mine = (shipmentId: string, tab: string): ShipmentAssignment => ({
      shipmentId, tab, assignedTo: session.username, assignedToName: session.name, assignedToRole: session.role,
      assignedBy: session.username, assignedAt: new Date().toISOString(), status: 'pending', notes: '',
      pinged: false, pingMessage: '', pingAt: '',
    });

    if (action === 'claim') {
      const { shipmentId, tab } = body;
      const row = rows.find(r => r.shipmentId === shipmentId && r.tab === tab);
      if (!row) return NextResponse.json({ error: 'That shipment isn\'t on the list any more — refresh.' }, { status: 404 });
      if (!row.assignment && !isAvailable(row)) return NextResponse.json({ error: 'That shipment has already shipped or was cancelled.' }, { status: 409 });
      const holder = claimIfFree(mine(shipmentId, tab));
      if (holder.assignedTo !== session.username) {
        return NextResponse.json({ error: `${holder.assignedToName} already has this one.`, code: 'taken' }, { status: 409 });
      }
      return NextResponse.json({ success: true, claimed: [shipmentId] });
    }

    const count = Math.min(50, Math.max(1, parseInt(body.count, 10) || 0));
    const pool = rows
      .filter(r => isAvailable(r) && r.wn?.status === 'created' && !r.wn.requiredActions.length)
      .sort(packingOrder);
    const claimed: string[] = [];
    for (const r of pool) {
      if (claimed.length >= count) break;
      if (claimIfFree(mine(r.shipmentId, r.tab)).assignedTo === session.username) claimed.push(r.shipmentId);
    }
    return NextResponse.json({ success: true, claimed });
  }

  // === GIVE IT BACK ===
  // Only before starting: once someone has begun (or made the label), a
  // manager moves it, so the record of who handled it stays straight.
  if (action === 'release') {
    const { shipmentId, tab } = body;
    const a = getAssignments().find(x => x.shipmentId === shipmentId && x.tab === tab);
    if (!a || a.assignedTo !== session.username) return NextResponse.json({ error: 'That shipment isn\'t yours.' }, { status: 403 });
    if (a.status !== 'pending') {
      return NextResponse.json({ error: 'You\'ve already started this one. Ask a manager to move it.' }, { status: 409 });
    }
    removeAssignment(shipmentId, tab);
    return NextResponse.json({ success: true });
  }

  // === NOTES ===
  // Managers on any shipment; the assignee on their own. Only the note
  // changes — re-posting the assignment would reset its status to pending.
  if (action === 'notes') {
    const { shipmentId, tab, notes } = body;
    if (!shipmentId || !tab || typeof notes !== 'string') return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const a = getAssignments().find(x => x.shipmentId === shipmentId && x.tab === tab);
    if (!a) return NextResponse.json({ error: 'Assign the shipment first' }, { status: 404 });
    const isAdmin = session.role === 'admin' || session.role === 'manager';
    if (!isAdmin && a.assignedTo !== session.username) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    updateNotes(shipmentId, tab, notes.slice(0, 500));
    return NextResponse.json({ success: true });
  }

  // === REMOVE ASSIGNMENT ===
  const { shipmentId, tab, remove, assignedTo, assignedToName, assignedToRole, notes } = body;

  if (!shipmentId || !tab) return NextResponse.json({ error: 'Missing shipmentId or tab' }, { status: 400 });

  if (remove) {
    if (session.role !== 'admin' && session.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    removeAssignment(shipmentId, tab);
    return NextResponse.json({ success: true });
  }

  // === SINGLE ASSIGN ===
  if (session.role !== 'admin' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Only admin/manager can assign shipments' }, { status: 403 });
  }
  if (!assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });

  upsertAssignment({
    shipmentId, tab, assignedTo, assignedToName, assignedToRole,
    assignedBy: session.username,
    assignedAt: new Date().toISOString(),
    status: 'pending',
    notes: notes || '',
    pinged: false, pingMessage: '', pingAt: '',
  });
  updateShipmentInSheet(tab, shipmentId, assignedToName, 'pending').catch(() => {});
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { shipmentId, tab, status } = await req.json();
  if (!shipmentId || !tab || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (!['pending', 'in-progress', 'resolved'].includes(status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });

  // Managers move anything; everyone else only their own.
  const held = getAssignments().find(x => x.shipmentId === shipmentId && x.tab === tab);
  const isAdmin = session.role === 'admin' || session.role === 'manager';
  if (held && !isAdmin && held.assignedTo !== session.username) {
    return NextResponse.json({ error: 'That shipment isn\'t yours.' }, { status: 403 });
  }

  const ok = updateStatus(shipmentId, tab, status);
  if (!ok) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const a = getAssignments().find(x => x.shipmentId === shipmentId && x.tab === tab);
  if (a) updateShipmentInSheet(tab, shipmentId, a.assignedToName, status).catch(() => {});

  return NextResponse.json({ success: true });
}
