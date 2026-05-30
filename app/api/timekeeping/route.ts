import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getEntries, clockIn, getActiveEntry } from '@/lib/timekeepingStore';
import { findByUsername } from '@/lib/userStore';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entries = getEntries();
  if (session.role === 'admin' || session.role === 'manager') return NextResponse.json(entries);
  return NextResponse.json(entries.filter(e => e.username === session.username));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = findByUsername(session.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const active = getActiveEntry(user.id);
  if (active) return NextResponse.json({ error: 'Already clocked in', entry: active }, { status: 409 });

  const entry = clockIn({ userId: user.id, username: user.username, name: user.name, role: user.role });
  return NextResponse.json({ success: true, entry });
}
