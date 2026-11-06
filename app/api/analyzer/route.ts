import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSalesData } from '@/lib/sheets';
import { getRunInventory } from '@/lib/runSheet';
import {
  buildShows, filterShows, rankShows, itemStats, buildRunList, buildResourceList,
  businessToday, cutoffDate,
  type ShowMetric, type RunRank,
} from '@/lib/showAnalyzer';

export const dynamic = 'force-dynamic';

// The people who decide what goes on air and what gets bought again.
const ALLOWED = ['admin', 'manager', 'host'];

const METRICS: ShowMetric[] = ['sales', 'profit', 'salesPerHour', 'profitPerHour', 'aov'];
const RANKS: RunRank[] = ['profitPerShow', 'revenuePerShow', 'unitsPerShow', 'marginPct'];

/**
 * The all-shows item table is only ever browsed, never totalled, so it ships
 * the strongest few hundred rows rather than every model we have ever run —
 * which on a year of sheets is tens of thousands.
 */
const ALL_ITEMS_CAP = 300;

function clamp(raw: string | null, fallback: number, min: number, max: number): number {
  // An absent parameter takes the default, not the floor: Number(null) is 0,
  // which would silently clamp `top` to one show and `days` to all time.
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = new URL(req.url).searchParams;
  const days = clamp(q.get('days'), 90, 0, 3650);
  const top = clamp(q.get('top'), 10, 1, 50);
  const runSize = clamp(q.get('runSize'), 20, 1, 100);
  const lowStock = clamp(q.get('lowStock'), 5, 0, 1000);
  const metric = METRICS.includes(q.get('metric') as ShowMetric)
    ? (q.get('metric') as ShowMetric) : 'sales';
  const runRank = RANKS.includes(q.get('runRank') as RunRank)
    ? (q.get('runRank') as RunRank) : 'profitPerShow';
  const host = (q.get('host') || '').trim();

  try {
    const [orders, inventory] = await Promise.all([getSalesData(), getRunInventory()]);

    const all = buildShows(orders);
    // The host filter is applied after the full build so the picker can offer
    // every host on record, not only the ones inside the current window.
    const hosts = Array.from(new Set(all.map(s => s.host))).sort();

    const inRange = filterShows(all, { days, host });
    const topShows = rankShows(inRange, metric, top);

    const topItems = itemStats(topShows, inventory.items);
    const allItems = itemStats(inRange, inventory.items);

    return NextResponse.json({
      range: {
        days,
        from: days > 0 ? cutoffDate(days) : (inRange.length ? inRange.reduce((m, s) => s.date < m ? s.date : m, inRange[0].date) : null),
        to: businessToday(),
        host,
        metric,
      },
      hosts,
      showCount: inRange.length,
      totalShowCount: all.length,
      shows: topShows,
      topItems: topItems.sort((a, b) => b.profit - a.profit),
      allItems: allItems.sort((a, b) => b.revenue - a.revenue).slice(0, ALL_ITEMS_CAP),
      allItemCount: allItems.length,
      // Suggestions come off the top shows: the point is to repeat what worked
      // on the best nights, not to re-run the average of everything.
      runList: buildRunList(topItems, { size: runSize, rank: runRank }),
      resource: buildResourceList(topItems, lowStock),
      inventory: {
        tab: inventory.tab,
        demo: inventory.demo,
        count: inventory.items.length,
        error: inventory.error,
        hint: inventory.hint,
        serviceAccount: inventory.serviceAccount,
      },
    });
  } catch (e) {
    console.error('analyzer error:', e);
    return NextResponse.json({ error: 'Failed to analyze shows' }, { status: 500 });
  }
}
