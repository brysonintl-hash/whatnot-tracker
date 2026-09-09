import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers } from '@/lib/userStore';
import { getAllPresence } from '@/lib/presenceStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const presence = getAllPresence();
  const now = Date.now();
  // Direct Messages is for the internal team — customers are a separate
  // audience entirely and would otherwise flood this list once they start
  // signing up.
  const users = (await getAllUsers())
    .filter(u => u.status === 'active' && u.role !== 'customer' && u.username !== session.username)
    .map(u => {
      const lastSeen = presence[u.id]?.lastSeen;
      const online = !!lastSeen && now - new Date(lastSeen).getTime() < 30_000;
      return { username: u.username, name: u.name, role: u.role, online };
    });
  return NextResponse.json({ users });
}
