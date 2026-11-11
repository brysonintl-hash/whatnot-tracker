import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasToken } from '@/lib/whatnot/client';
import { queueSync, refreshQueue, tabTime } from '@/lib/whatnot/shipQueue';
import { buildRows, packingOrder } from '@/lib/shipmentRows';
import { canLabel } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * One day of Whatnot shipments (`?tab=11/9/26`, newest day by default), with
 * who made each label here and anything reported against it, plus a count
 * for every day so the page can step between them.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canLabel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Re-list in the background; this request answers from what's stored.
  if (hasToken()) refreshQueue({ force: req.nextUrl.searchParams.get('refresh') === '1' }).catch(() => {});

  const all = buildRows();
  const tabMap = new Map<string, { tab: string; total: number; needsLabel: number }>();
  for (const r of all) {
    const t = tabMap.get(r.tab) ?? { tab: r.tab, total: 0, needsLabel: 0 };
    t.total++;
    if (r.wn.status === 'created') t.needsLabel++;
    tabMap.set(r.tab, t);
  }
  const tabs = Array.from(tabMap.values()).sort((a, b) => tabTime(b.tab) - tabTime(a.tab));

  const asked = req.nextUrl.searchParams.get('tab');
  const tab = asked && tabMap.has(asked) ? asked : tabs[0]?.tab ?? '';
  const rows = all.filter(r => r.tab === tab).sort(packingOrder);

  return NextResponse.json({ rows, tabs, tab, sync: queueSync(), whatnot: hasToken() });
}
