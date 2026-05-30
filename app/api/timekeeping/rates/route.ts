import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getRates, setRate } from '@/lib/timekeepingStore';

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(getRates());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { userId, username, name, ratePerHour } = await req.json();
  if (!userId || ratePerHour == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  setRate(userId, username, name, Number(ratePerHour));
  return NextResponse.json({ success: true });
}
