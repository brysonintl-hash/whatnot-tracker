import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTicket, upsertTicket, addNote, TicketStatus, TicketPriority } from '@/lib/ticketStore';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'host', 'shipper'];

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getTicket(params.id));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedTo?: string | null;
    note?: string;
  };

  if (body.note?.trim()) {
    const ticket = addNote(params.id, session.name, body.note.trim());
    return NextResponse.json(ticket);
  }

  const updates: any = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;

  const ticket = upsertTicket(params.id, updates);
  return NextResponse.json(ticket);
}
