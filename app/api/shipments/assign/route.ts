import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { upsertAssignment, removeAssignment, updateStatus } from '@/lib/shipmentStore';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { shipmentId, tab, assignedTo, assignedToName, assignedToRole, notes, remove } = body;

  if (!shipmentId || !tab) return NextResponse.json({ error: 'Missing shipmentId or tab' }, { status: 400 });

  if (remove) {
    removeAssignment(shipmentId, tab);
    return NextResponse.json({ success: true });
  }

  if (session.role !== 'admin' && session.role !== 'manager') {
    return NextResponse.json({ error: 'Only admin/manager can assign shipments' }, { status: 403 });
  }

  if (!assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });

  upsertAssignment({
    shipmentId,
    tab,
    assignedTo,
    assignedToName,
    assignedToRole,
    assignedBy: session.username,
    assignedAt: new Date().toISOString(),
    status: 'pending',
    notes: notes || '',
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
