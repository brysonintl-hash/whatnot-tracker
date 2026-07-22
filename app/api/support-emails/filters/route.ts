import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailFilters, setGmailFilters } from '@/lib/gmailFilterStore';

export const dynamic = 'force-dynamic';

const VIEWERS = ['admin', 'manager', 'host', 'shipper'];
const EDITORS = ['admin', 'manager'];

export async function GET() {
  const session = await getSession();
  if (!session || !VIEWERS.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getGmailFilters());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !EDITORS.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const { email } = await req.json() as { email: string };
  if (!email?.includes('@')) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  const current = getGmailFilters();
  if (current.includes(email.toLowerCase())) return NextResponse.json(current);
  return NextResponse.json(setGmailFilters([...current, email]));
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || !EDITORS.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const { email } = await req.json() as { email: string };
  const current = getGmailFilters();
  return NextResponse.json(setGmailFilters(current.filter(e => e !== email.toLowerCase())));
}
