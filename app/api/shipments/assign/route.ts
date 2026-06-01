import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  upsertAssignment, removeAssignment, updateStatus,
  bulkAssign, pingShipment, acknowledgePing, getAssignments,
} from '@/lib/shipmentStore';

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
    acknowledgePing(shipmentId, tab);
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
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { shipmentId, tab, status } = await req.json();
  if (!shipmentId || !tab || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const ok = updateStatus(shipmentId, tab, status);
  if (!ok) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
