import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { markConversationRead } from '@/lib/directMessageStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { with: withUser, lastReadAt } = await req.json();
  if (!withUser || typeof lastReadAt !== 'number') return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  markConversationRead(session.username, withUser, lastReadAt);
  return NextResponse.json({ ok: true });
}
