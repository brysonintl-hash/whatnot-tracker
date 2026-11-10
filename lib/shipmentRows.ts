// ─── The shipment list, as every route sees it ─────────────────────────────
//
// Parcels from Whatnot plus any rows still on the shipment sheet, each placed
// under a day ("11/9/26") with its assignment, who made its label, and any
// problems. The list page reads this, and so does claiming: a shipper taking
// "the next five" has to take them under the same days the page shows them.

import { getShipmentData, type ShipmentRecord } from './sheets';
import { getAssignments, type ShipmentAssignment } from './shipmentStore';
import * as wnStore from './whatnot/store';
import { getContents, tabOf, viewOf, WINDOW_DAYS, type ShipmentView } from './whatnot/shipQueue';
import { eventsByShipment, getLedger, handlerOf, type ErrorReport, type Handler, type LedgerEvent } from './shipmentLedger';

export type QueueRow = {
  shipmentId: string;
  tab: string;
  assignment: ShipmentAssignment | null;
  wn: ShipmentView | null;
  handler: Handler | null;
  events: LedgerEvent[];
  problems: ErrorReport[];
};

// The sheet is read across every tab, which is slow and counts against the
// Google quota; the page polls, so one read serves everyone for a minute.
let sheetCache: { at: number; rows: ShipmentRecord[] } | null = null;
async function sheetRows(): Promise<ShipmentRecord[]> {
  if (sheetCache && Date.now() - sheetCache.at < 60_000) return sheetCache.rows;
  const rows = await getShipmentData();
  sheetCache = { at: Date.now(), rows };
  return rows;
}

export async function buildRows(now = Date.now()): Promise<QueueRow[]> {
  const sheet = await sheetRows();
  const assignments = getAssignments();
  const shipments = wnStore.getShipments();
  const contents = getContents();
  const ledger = getLedger();
  const events = eventsByShipment(ledger.events);
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
  return Array.from(rows.values()).map(r => {
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
}

/**
 * Work nobody has yet: unassigned, and still to be packed — no label yet, or
 * a label made in Whatnot but not dropped off. A sheet row with no Whatnot
 * record counts too; that's how the old sheet workflow listed work.
 */
export function isAvailable(r: QueueRow): boolean {
  if (r.assignment) return false;
  if (!r.wn) return true;
  return r.wn.status === 'created' || r.wn.status === 'label_generated';
}

/** Closest to its deadline first: still needing a label, then oldest. */
export function packingOrder(a: QueueRow, b: QueueRow): number {
  const rank = (st?: string) => (st === 'created' ? 0 : st === 'label_generated' ? 1 : st ? 2 : 3);
  return rank(a.wn?.status) - rank(b.wn?.status) ||
    (a.wn?.createdAt ?? '').localeCompare(b.wn?.createdAt ?? '') ||
    a.shipmentId.localeCompare(b.shipmentId);
}
