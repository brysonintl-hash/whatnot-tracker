import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { addMessage, getMessages } from '@/lib/chatStore';
import { getReaders } from '@/lib/readStore';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const since = parseInt(req.nextUrl.searchParams.get('since') ?? '0');
  return NextResponse.json({ messages: getMessages(since), readers: getReaders() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Empty' }, { status: 400 });
  const msg = addMessage({
    username: session.username,
    name: session.name,
    role: session.role,
    text: String(text).trim().slice(0, 500),
  });
  return NextResponse.json({ message: msg });
}
