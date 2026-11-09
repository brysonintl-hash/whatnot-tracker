import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasToken } from '@/lib/whatnot/client';
import { runSync, SYNC_STEPS, type SyncWhat } from '@/lib/whatnot/sync';
import { getSyncState, storeStats } from '@/lib/whatnot/store';

export const dynamic = 'force-dynamic';
// A backfill walks tens of thousands of records; never let the platform cut it
// off mid-run, which would leave the lock set and the shards half-written.
export const maxDuration = 300;

const ALLOWED = ['admin', 'manager'];

export async function GET() {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const state = getSyncState();
  return NextResponse.json({
    configured: hasToken(),
    ...state,
    stats: storeStats(),
    steps: SYNC_STEPS,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!hasToken()) {
    return NextResponse.json({ error: 'WHATNOT_API_KEY is not set on this server' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const steps: SyncWhat[] | undefined = Array.isArray(body.steps)
    ? body.steps.filter((s: string) => (SYNC_STEPS as string[]).includes(s))
    : undefined;

  const opts = {
    steps,
    days: Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Number(body.days) : undefined,
    full: body.full === true,
    itemBudget: Number.isFinite(Number(body.itemBudget)) ? Number(body.itemBudget) : undefined,
  };

  // A full sync runs for minutes. Returning once it's under way — rather than
  // holding the request open — lets the page poll GET for progress instead of
  // staring at a spinner that may outlive its own timeout.
  if (body.wait !== true) {
    void runSync(opts).catch(e => console.error('whatnot sync (background):', e));
    return NextResponse.json({ started: true, steps: steps ?? SYNC_STEPS });
  }

  const result = await runSync(opts);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
