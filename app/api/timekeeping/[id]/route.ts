import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { clockOut } from '@/lib/timekeepingStore';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { note } = await req.json();
  const entry = clockOut(params.id, note ?? '');
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

  return NextResponse.json({ success: true, entry });
}
