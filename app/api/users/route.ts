import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers } from '@/lib/userStore';
import { getAllPresence } from '@/lib/presenceStore';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const presence = getAllPresence();
  const users = (await getAllUsers()).map(({ password: _pw, ...u }) => ({
    ...u,
    lastSeen: presence[u.id]?.lastSeen ?? null,
  }));
  return NextResponse.json(users);
}
