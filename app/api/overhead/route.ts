import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { readData, writeData } from '@/lib/storage';

type MonthOverhead = {
  rent: number; utilities: number; supplies: number;
  employee: number; other: number; otherLabel: string; notes: string;
};
type OverheadStore = Record<string, MonthOverhead>;

const FILE = 'overhead.json';
const DEFAULT: MonthOverhead = { rent: 0, utilities: 0, supplies: 0, employee: 0, other: 0, otherLabel: '', notes: '' };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = readData<OverheadStore>(FILE, {});
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { month, ...costs } = body as { month: string } & Partial<MonthOverhead>;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month required (YYYY-MM)' }, { status: 400 });
  }
  const data = readData<OverheadStore>(FILE, {});
  data[month] = { ...DEFAULT, ...data[month], ...costs };
  writeData(FILE, data);
  return NextResponse.json({ ok: true, month, data: data[month] });
}
