import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { addDirectMessage, getConversation } from '@/lib/directMessageStore';
import { findByUsername } from '@/lib/userStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const withUser = req.nextUrl.searchParams.get('with');
  if (!withUser) return NextResponse.json({ error: 'Missing "with" param' }, { status: 400 });

  const since = parseInt(req.nextUrl.searchParams.get('since') ?? '0');
  const messages = getConversation(session.username, withUser, since);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { to, text } = await req.json();
  if (!to || !text?.trim()) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (to === session.username) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 });

  const recipient = await findByUsername(to);
  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

  const msg = addDirectMessage(session.username, to, String(text).trim().slice(0, 1000));
  return NextResponse.json({ message: msg });
}
