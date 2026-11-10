import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasToken } from '@/lib/whatnot/client';
import { queueSync, refreshQueue, tabTime } from '@/lib/whatnot/shipQueue';
import { buildRows, isAvailable, packingOrder } from '@/lib/shipmentRows';
import { canSelfAssign } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * Shipments for the Assign Shipments tab: parcels from Whatnot plus any rows
 * still kept on the shipment sheet, with who they're assigned to, who made
 * the label, and anything reported against them.
 *
 * Managers get one day at a time (`?tab=11/9/26`, newest by default) with a
 * count for every day. Shippers and hosts get what's assigned to them plus
 * the work nobody has taken yet, so they can take some themselves.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Re-list in the background; this request answers from what's stored.
  if (hasToken()) refreshQueue({ force: req.nextUrl.searchParams.get('refresh') === '1' }).catch(() => {});

  const all = await buildRows();

  // Days, newest first, with what each still needs.
  const tabMap = new Map<string, { tab: string; total: number; unassigned: number; needsLabel: number }>();
  for (const r of all) {
    const t = tabMap.get(r.tab) ?? { tab: r.tab, total: 0, unassigned: 0, needsLabel: 0 };
    t.total++;
    if (!r.assignment) t.unassigned++;
    if (r.wn?.status === 'created') t.needsLabel++;
    tabMap.set(r.tab, t);
  }
  const tabs = Array.from(tabMap.values()).sort((a, b) => tabTime(b.tab) - tabTime(a.tab));

  const isManager = session.role === 'admin' || session.role === 'manager';
  const asked = req.nextUrl.searchParams.get('tab');
  const tab = isManager ? (asked && tabMap.has(asked) ? asked : tabs[0]?.tab ?? '') : '';
  const mine = isManager
    ? all.filter(r => r.tab === tab)
    : all.filter(r => r.assignment?.assignedTo === session.username || (canSelfAssign(session) && isAvailable(r)));
  mine.sort(packingOrder);

  return NextResponse.json({
    rows: mine,
    tabs,
    tab,
    sync: queueSync(),
    whatnot: hasToken(),
    selfAssign: canSelfAssign(session),
  });
}
