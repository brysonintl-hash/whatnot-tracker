import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getPayments, setPayment } from '@/lib/timekeepingStore';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get('weekStart');
  const payments = getPayments();
  return NextResponse.json(weekStart ? payments.filter(p => p.weekStart === weekStart) : payments);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { userId, weekStart, paid } = await req.json();
  if (!userId || !weekStart) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const record = setPayment(userId, weekStart, Boolean(paid));
  return NextResponse.json({ success: true, record });
}
