import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { clockOut, editEntry, deleteEntry } from '@/lib/timekeepingStore';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Admin/manager: edit clock in/out times
  if (body.clockIn !== undefined) {
    if (session.role !== 'admin' && session.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const entry = editEntry(params.id, body.clockIn, body.clockOut ?? null);
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  }

  // Staff: clock out
  const entry = clockOut(params.id, body.note ?? '');
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  return NextResponse.json({ success: true, entry });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const deleted = deleteEntry(params.id);
  if (!deleted) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
