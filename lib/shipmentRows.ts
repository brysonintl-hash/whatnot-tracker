// ─── The shipment list, as every route sees it ─────────────────────────────
//
// Whatnot parcels from the last few days, each placed under the show it was
// opened in (or the marketplace), with who made its label here and any
// problems.

import * as wnStore from './whatnot/store';
import { getContents, tabOf, viewOf, WINDOW_DAYS, type ShipmentLine, type ShipmentView } from './whatnot/shipQueue';
import type { WnShow } from './whatnot/types';
import { eventsByShipment, getLedger, handlerOf, type ErrorReport, type Handler, type LedgerEvent } from './shipmentLedger';

export type QueueRow = {
  shipmentId: string;
  tab: string;
  wn: ShipmentView;
  /** Whoever made the label on this site; null if nobody has, or it was made in Whatnot. */
  handler: Handler | null;
  events: LedgerEvent[];
  problems: ErrorReport[];
  /**
   * The list it's filed under: 'show:<id>' or 'marketplace'. Null until its
   * contents are read and every order's show is known.
   */
  home: ScopeId | null;
};

/**
 * The show a parcel was opened in: its earliest order's. Whatnot bundles a
 * buyer's later wins into a parcel that has no label yet, so one opened in
 * Saturday's show can hold Sunday's wins too — Seller Hub still files it
 * under Saturday, and so does this, or the two lists disagree.
 */
function homeOf(lines: ShipmentLine[] | undefined): ScopeId | null {
  if (!lines?.length || lines.some(l => l.showId === undefined)) return null;
  // Order ids rise over time, so they settle a tie or a missing time.
  const num = (l: ShipmentLine) => Number(l.orderId ?? Infinity);
  const first = [...lines].sort((a, b) =>
    (a.orderAt ?? '~').localeCompare(b.orderAt ?? '~') || num(a) - num(b))[0];
  return first.showId ? `show:${first.showId}` : 'marketplace';
}

export function buildRows(now = Date.now()): QueueRow[] {
  const contents = getContents();
  const ledger = getLedger();
  const events = eventsByShipment(ledger.events);
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();

  return wnStore.getShipments()
    .filter(s => s.created_at && s.created_at >= since)
    .map(s => {
      const ev = events.get(s.id) ?? [];
      const lines = contents[s.id]?.lines;
      return {
        shipmentId: s.id,
        tab: tabOf(s.created_at!),
        wn: viewOf(s, contents[s.id], now),
        handler: handlerOf(ev),
        events: ev,
        problems: ledger.errors.filter(e => e.shipmentId === s.id),
        home: homeOf(lines),
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

// ─── Picking a show ────────────────────────────────────────────────────────

/** 'all', 'marketplace', or 'show:<id>'. */
export type ScopeId = string;

export type Scope = {
  id: ScopeId;
  kind: 'all' | 'marketplace' | 'show';
  title: string;
  /** When the show was set to start; for the marketplace, its first parcel. */
  startAt: string | null;
  total: number;
  /** Not shipped yet: needs a label, or has one and hasn't been scanned. Seller Hub's "Pending Shipments". */
  pending: number;
  needsLabel: number;
};

const PENDING = new Set(['created', 'label_generated']);

export const inScope = (r: QueueRow, id: ScopeId): boolean => id === 'all' || r.home === id;

/** Where a parcel lives when nothing else is asked for. */
export const homeScope = (r: QueueRow): ScopeId => r.home ?? 'all';

/**
 * Everything, the marketplace, then each show newest first — the same list
 * as Seller Hub's show picker, counted from the parcels on hand.
 */
export function scopesOf(rows: QueueRow[], shows: Map<string, WnShow>): Scope[] {
  const tally = new Map<ScopeId, Scope>();
  const add = (id: ScopeId, make: () => Scope, r: QueueRow) => {
    const sc = tally.get(id) ?? make();
    sc.total++;
    if (PENDING.has(r.wn.status)) sc.pending++;
    if (r.wn.status === 'created') sc.needsLabel++;
    // A show with no start time on file is dated by its earliest parcel.
    if (sc.kind !== 'show' || !shows.get(id.slice(5))?.scheduled_start_at) {
      if (r.wn.createdAt && (!sc.startAt || r.wn.createdAt < sc.startAt)) sc.startAt = r.wn.createdAt;
    }
    tally.set(id, sc);
  };
  const blank = { startAt: null, total: 0, pending: 0, needsLabel: 0 };
  for (const r of rows) {
    add('all', () => ({ ...blank, id: 'all', kind: 'all', title: 'All shows & marketplace' }), r);
    if (r.home === 'marketplace') add('marketplace', () => ({ ...blank, id: 'marketplace', kind: 'marketplace', title: 'Marketplace' }), r);
    else if (r.home) {
      const sh = shows.get(r.home.slice(5));
      add(r.home, () => ({
        ...blank, id: r.home!, kind: 'show', title: sh?.title || 'Live show',
        startAt: sh?.scheduled_start_at ?? null,
      }), r);
    }
  }
  const list = Array.from(tally.values());
  const showsNewest = list.filter(x => x.kind === 'show').sort((a, b) => (b.startAt ?? '').localeCompare(a.startAt ?? ''));
  return [
    ...list.filter(x => x.kind === 'all'),
    ...list.filter(x => x.kind === 'marketplace'),
    ...showsNewest,
  ];
}

/** The newest show, since that's what's being packed; everything if there are none. */
export function defaultScope(scopes: Scope[]): ScopeId {
  return scopes.find(x => x.kind === 'show')?.id ?? 'all';
}
