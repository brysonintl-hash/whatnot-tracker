import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getRunInventory } from '@/lib/runSheet';
import {
  getOrders, getOrderItems, getShows, getAnalytics, getHostAssignments,
  getSyncState, storeStats,
} from '@/lib/whatnot/store';
import { buildPerformance, buildItemPerformance, UNASSIGNED } from '@/lib/whatnot/metrics';
import { resolveItems, type CostRow } from '@/lib/whatnot/sku';
import { hasToken } from '@/lib/whatnot/client';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'host'];

/** Cap on the item table; the page browses it, it never totals it. */
const ITEM_CAP = 400;

function clamp(raw: string | null, fallback: number, min: number, max: number): number {
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
  const host = (q.get('host') || '').trim();

  try {
    // The inventory sheet is the only place a purchase cost exists.
    const inventory = await getRunInventory();
    const costs: CostRow[] = inventory.items
      .filter(i => i.cost > 0)
      .map(i => ({
        modelNum: i.modelNum, cost: i.cost,
        description: i.description, remaining: i.remaining,
      }));
    const stock: Record<string, number> = {};
    for (const i of inventory.items) stock[i.modelNum] = i.remaining;

    const allShows = getShows();
    const orders = getOrders();
    const items = getOrderItems();
    const analytics = getAnalytics();
    const hosts = getHostAssignments();

    const from = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;
    const windowShows = from
      ? allShows.filter(s => (s.ended_at ?? s.scheduled_start_at ?? s.created_at) >= from)
      : allShows;
    const showIds = new Set(windowShows.map(s => s.id));

    // Narrow orders and items to the window before costing, so a 13-month
    // store still answers a 30-day question quickly.
    const windowOrders = orders.filter(o => o.show_id && showIds.has(o.show_id));
    const orderIds = new Set(windowOrders.map(o => o.id));
    const windowItems = items.filter(i => orderIds.has(i.order_id));

    const perf = buildPerformance({
      shows: windowShows, orders: windowOrders, items: windowItems,
      analytics, hosts, costs, stock,
    });

    const shows = host ? perf.shows.filter(s => s.host === host) : perf.shows;

    // The item table follows the host filter too, so "what did Evon sell"
    // answers with Evon's items rather than everyone's.
    const itemScope = host
      ? (() => {
          const ids = new Set(shows.map(s => s.showId));
          const oids = new Set(windowOrders.filter(o => o.show_id && ids.has(o.show_id)).map(o => o.id));
          return windowItems.filter(i => oids.has(i.order_id));
        })()
      : windowItems;

    const itemRows = buildItemPerformance(resolveItems(itemScope, costs));

    return NextResponse.json({
      configured: hasToken(),
      range: { days, host, from, to: new Date().toISOString() },
      hostNames: Array.from(new Set(Object.values(hosts).map(h => h.host))).sort(),
      shows,
      hosts: host ? perf.hosts.filter(h => h.host === host) : perf.hosts,
      items: itemRows.slice(0, ITEM_CAP),
      itemCount: itemRows.length,
      match: perf.match,
      unassignedShows: perf.shows.filter(s => s.host === UNASSIGNED).length,
      inventory: {
        tab: inventory.tab, demo: inventory.demo,
        costRows: costs.length, error: inventory.error,
      },
      sync: { ...getSyncState(), stats: storeStats() },
    });
  } catch (e) {
    console.error('whatnot performance error:', e);
    return NextResponse.json({ error: 'Failed to build performance' }, { status: 500 });
  }
}
