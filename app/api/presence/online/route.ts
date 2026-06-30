import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllPresence } from '@/lib/presenceStore';
import { getAllUsers } from '@/lib/userStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const presence = getAllPresence();
  const users = await getAllUsers();
  const now = Date.now();
  const online = users
    .filter(u => {
      const p = presence[u.id];
      return p && now - new Date(p.lastSeen).getTime() < 30_000;
    })
    .map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role }));
  return NextResponse.json({ users: online });
}
