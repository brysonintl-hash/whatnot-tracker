import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { markRead } from '@/lib/readStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { lastReadAt } = await req.json();
  if (typeof lastReadAt !== 'number') return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  markRead(session.username, session.name, session.role, lastReadAt);
  return NextResponse.json({ ok: true });
}
