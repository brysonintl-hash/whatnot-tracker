// ─── The shipment list, as every route sees it ─────────────────────────────
//
// Whatnot parcels from the last few days, each placed under the day it was
// created ("11/9/26"), with who made its label here and any problems.

import * as wnStore from './whatnot/store';
import { getContents, tabOf, viewOf, WINDOW_DAYS, type ShipmentView } from './whatnot/shipQueue';
import { eventsByShipment, getLedger, handlerOf, type ErrorReport, type Handler, type LedgerEvent } from './shipmentLedger';

export type QueueRow = {
  shipmentId: string;
  tab: string;
  wn: ShipmentView;
  /** Whoever made the label on this site; null if nobody has, or it was made in Whatnot. */
  handler: Handler | null;
  events: LedgerEvent[];
  problems: ErrorReport[];
};

export function buildRows(now = Date.now()): QueueRow[] {
  const contents = getContents();
  const ledger = getLedger();
  const events = eventsByShipment(ledger.events);
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();

  return wnStore.getShipments()
    .filter(s => s.created_at && s.created_at >= since)
    .map(s => {
      const ev = events.get(s.id) ?? [];
      return {
        shipmentId: s.id,
        tab: tabOf(s.created_at!),
        wn: viewOf(s, contents[s.id], now),
        handler: handlerOf(ev),
        events: ev,
        problems: ledger.errors.filter(e => e.shipmentId === s.id),
      };
    });
}

/** Closest to its deadline first: still needing a label, then oldest. */
export function packingOrder(a: QueueRow, b: QueueRow): number {
  const rank = (st: string) => (st === 'created' ? 0 : st === 'label_generated' ? 1 : 2);
  return rank(a.wn.status) - rank(b.wn.status) ||
    (a.wn.createdAt ?? '').localeCompare(b.wn.createdAt ?? '') ||
    a.shipmentId.localeCompare(b.shipmentId);
}
