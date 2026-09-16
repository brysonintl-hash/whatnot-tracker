import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getRunInventory } from '@/lib/runSheet';
import { getEntries, setEntry, removeEntry, clearDay } from '@/lib/runSheetStore';

// Hosts run the stream; managers and admins oversee it.
const ALLOWED = ['host', 'admin', 'manager'];

function todayFallback(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const date = new URL(req.url).searchParams.get('date') || todayFallback();
  const inventory = await getRunInventory();

  return NextResponse.json({
    ...inventory,
    entries: getEntries(date, session.username),
    date,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const date: string = body.date || todayFallback();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  switch (body.action) {
    case 'set': {
      if (!body.modelNum || typeof body.modelNum !== 'string') {
        return NextResponse.json({ error: 'modelNum is required' }, { status: 400 });
      }
      const ran = Number(body.ran);
      if (!Number.isFinite(ran) || ran < 0) {
        return NextResponse.json({ error: 'Enter a valid quantity' }, { status: 400 });
      }
      return NextResponse.json({
        entries: setEntry(date, session.username, {
          modelNum: body.modelNum,
          ran: Math.floor(ran),
          description: String(body.description ?? ''),
          cost: Number(body.cost) || 0,
          retail: Number(body.retail) || 0,
        }),
      });
    }
    case 'remove':
      return NextResponse.json({ entries: removeEntry(date, session.username, String(body.modelNum ?? '')) });
    case 'clear':
      return NextResponse.json({ entries: clearDay(date, session.username) });
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
