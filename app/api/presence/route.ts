import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByUsername } from '@/lib/userStore';
import { updatePresence, getOnlineUsers } from '@/lib/presenceStore';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getOnlineUsers());
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = findByUsername(session.username);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  updatePresence(user.id, user.username, user.name, user.role);
  return NextResponse.json({ ok: true });
}
