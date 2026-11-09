import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSalesData } from '@/lib/sheets';
import {
  getShows, getHostAssignments, setHostAssignment, setHostAssignments, clearHostAssignment,
  type HostAssignment,
} from '@/lib/whatnot/store';
import { getAnalytics } from '@/lib/whatnot/store';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager'];

export async function GET() {
  const session = await getSession();
  if (!session || !['admin', 'manager', 'host'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assignments = getHostAssignments();
  const analytics = getAnalytics();

  const shows = getShows()
    .filter(s => s.status === 'ended')
    .map(s => ({
      id: s.id,
      title: s.title,
      startedAt: analytics[s.id]?.start_time ?? s.scheduled_start_at,
      endedAt: s.ended_at,
      sales: analytics[s.id]?.sales?.amount ?? null,
      host: assignments[s.id]?.host ?? null,
      source: assignments[s.id]?.source ?? null,
    }))
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  return NextResponse.json({
    shows,
    hostNames: Array.from(new Set(Object.values(assignments).map(a => a.host))).sort(),
    assigned: shows.filter(s => s.host).length,
    total: shows.length,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // ── Seed from the sales sheet ────────────────────────────────────────────
  //
  // The sheet already records a host per date, typed up after every show. For
  // the 327 shows already on the books that is the only record of who was on
  // camera, so we match on date rather than ask anyone to redo it by hand.
  //
  // A date with two shows and two different hosts in the sheet is ambiguous
  // and is deliberately left alone for a human, rather than guessed at.
  if (body.action === 'seed-from-sheet') {
    try {
      const orders = await getSalesData();
      const analytics = getAnalytics();

      const hostsByDate = new Map<string, Set<string>>();
      for (const o of orders) {
        if (!o.host || !o.tab) continue;
        const m = o.tab.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (!m) continue;
        let year = Number(m[3]);
        if (year < 100) year += 2000;
        const iso = `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
        const set = hostsByDate.get(iso) ?? new Set<string>();
        set.add(o.host);
        hostsByDate.set(iso, set);
      }

      const rows: HostAssignment[] = [];
      const ambiguous: string[] = [];
      const now = new Date().toISOString();

      for (const s of getShows()) {
        if (s.status !== 'ended') continue;
        const startedAt = analytics[s.id]?.start_time ?? s.scheduled_start_at ?? s.created_at;
        const date = startedAt.slice(0, 10);
        const candidates = hostsByDate.get(date);
        if (!candidates || candidates.size === 0) continue;
        if (candidates.size > 1) { ambiguous.push(s.id); continue; }
        rows.push({
          showId: s.id,
          host: Array.from(candidates)[0],
          source: 'sheet',
          setBy: session.username,
          setAt: now,
        });
      }

      const applied = setHostAssignments(rows);
      return NextResponse.json({
        seeded: applied,
        matchedDates: hostsByDate.size,
        ambiguous: ambiguous.length,
        note: ambiguous.length
          ? `${ambiguous.length} shows fell on a date with more than one host in the sheet and were left for you to set.`
          : undefined,
      });
    } catch (e) {
      console.error('whatnot host seed error:', e);
      return NextResponse.json({ error: 'Could not read the sales sheet' }, { status: 500 });
    }
  }

  // ── Set or clear one show ────────────────────────────────────────────────
  const showId = String(body.showId ?? '');
  if (!showId) return NextResponse.json({ error: 'showId is required' }, { status: 400 });

  const host = String(body.host ?? '').trim();
  if (!host) {
    clearHostAssignment(showId);
    return NextResponse.json({ cleared: showId });
  }

  setHostAssignment({
    showId, host, source: 'manual',
    setBy: session.username, setAt: new Date().toISOString(),
  });
  return NextResponse.json({ showId, host });
}
