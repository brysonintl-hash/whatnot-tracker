import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getShipmentData, type ShipmentRecord } from '@/lib/sheets';
import { getAssignments } from '@/lib/shipmentStore';
import { hasToken } from '@/lib/whatnot/client';
import * as wnStore from '@/lib/whatnot/store';
import {
  getContents, queueSync, refreshQueue, tabOf, tabTime, viewOf, WINDOW_DAYS,
} from '@/lib/whatnot/shipQueue';
import { eventsByShipment, getLedger, handlerOf } from '@/lib/shipmentLedger';

export const dynamic = 'force-dynamic';

// The sheet is read across every tab, which is slow and counts against the
// Google quota; the page now polls, so one read serves everyone for a minute.
let sheetCache: { at: number; rows: ShipmentRecord[] } | null = null;
async function sheetRows(): Promise<ShipmentRecord[]> {
  if (sheetCache && Date.now() - sheetCache.at < 60_000) return sheetCache.rows;
  const rows = await getShipmentData();
  sheetCache = { at: Date.now(), rows };
  return rows;
}

/**
 * Shipments for the Assign Shipments tab: parcels from Whatnot plus any rows
 * still kept on the shipment sheet, with who they're assigned to, who made
 * the label, and anything reported against them.
 *
 * Managers get one day at a time (`?tab=11/9/26`, newest by default) with a
 * count for every day; everyone else gets what's assigned to them.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Re-list in the background; this request answers from what's stored.
  if (hasToken()) refreshQueue({ force: req.nextUrl.searchParams.get('refresh') === '1' }).catch(() => {});

  const [sheet, assignments] = await Promise.all([sheetRows(), Promise.resolve(getAssignments())]);
  const shipments = wnStore.getShipments();
  const contents = getContents();
  const ledger = getLedger();
  const events = eventsByShipment(ledger.events);
  const now = Date.now();
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();

  // An assignment pins a parcel to the day it was assigned under, so a
  // parcel already handed out keeps its place even if the dates disagree.
  const assignedTab = new Map<string, string>();
  for (const a of assignments) if (!assignedTab.has(a.shipmentId)) assignedTab.set(a.shipmentId, a.tab);
  const openAssigned = new Set(assignments.filter(a => a.status !== 'resolved').map(a => a.shipmentId));

  const byId = new Map(shipments.map(s => [s.id, s]));
  const rows = new Map<string, { shipmentId: string; tab: string }>();
  for (const r of sheet) rows.set(`${r.shipmentId}|${r.tab}`, r);
  const onSheet = new Set(sheet.map(r => r.shipmentId));
  for (const s of shipments) {
    if (onSheet.has(s.id)) continue;
    const recent = (s.created_at ?? '') >= since;
    if (!recent && !openAssigned.has(s.id)) continue;
    const tab = assignedTab.get(s.id) ?? (s.created_at ? tabOf(s.created_at) : '');
    if (!tab) continue;
    rows.set(`${s.id}|${tab}`, { shipmentId: s.id, tab });
  }

  const assignMap = new Map(assignments.map(a => [`${a.shipmentId}|${a.tab}`, a]));
  const all = Array.from(rows.values()).map(r => {
    const assignment = assignMap.get(`${r.shipmentId}|${r.tab}`) ?? null;
    const s = byId.get(r.shipmentId);
    const ev = events.get(r.shipmentId) ?? [];
    return {
      ...r,
      assignment,
      wn: s ? viewOf(s, contents[s.id], now) : null,
      handler: handlerOf(ev, assignment),
      events: ev,
      problems: ledger.errors.filter(e => e.shipmentId === r.shipmentId),
    };
  });

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
    : all.filter(r => r.assignment?.assignedTo === session.username);

  // Packing order: what still needs a label first, oldest first within it,
  // so the parcel closest to its deadline is at the top.
  const rank = (st?: string) => (st === 'created' ? 0 : st === 'label_generated' ? 1 : st ? 2 : 3);
  mine.sort((a, b) =>
    rank(a.wn?.status) - rank(b.wn?.status) ||
    (a.wn?.createdAt ?? '').localeCompare(b.wn?.createdAt ?? '') ||
    a.shipmentId.localeCompare(b.shipmentId));

  return NextResponse.json({
    rows: mine,
    tabs,
    tab,
    sync: queueSync(),
    whatnot: hasToken(),
  });
}
