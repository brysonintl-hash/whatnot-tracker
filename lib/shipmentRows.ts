// ─── The shipment list, as every route sees it ─────────────────────────────
//
// Whatnot parcels from the last few days, each placed under the show its
// orders were won in (or the marketplace), with who made its label here and
// any problems.

import * as wnStore from './whatnot/store';
import { getContents, tabOf, viewOf, WINDOW_DAYS, type ShipmentView } from './whatnot/shipQueue';
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
  /** Shows its orders were won in. Usually one; a bundle can span two. */
  shows: string[];
  /** Holds an order placed outside a show. */
  marketplace: boolean;
  /** False until every order's show is known, which needs the contents read. */
  matched: boolean;
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
      const lines = contents[s.id]?.lines;
      return {
        shipmentId: s.id,
        tab: tabOf(s.created_at!),
        wn: viewOf(s, contents[s.id], now),
        handler: handlerOf(ev),
        events: ev,
        problems: ledger.errors.filter(e => e.shipmentId === s.id),
        shows: Array.from(new Set((lines ?? []).map(l => l.showId).filter((x): x is string => Boolean(x)))),
        marketplace: (lines ?? []).some(l => l.showId === null),
        matched: Boolean(lines?.length) && lines!.every(l => l.showId !== undefined),
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
  needsLabel: number;
};

export const inScope = (r: QueueRow, id: ScopeId): boolean =>
  id === 'all' || (id === 'marketplace' ? r.marketplace : r.shows.includes(id.slice(5)));

/** Where a parcel lives when nothing else is asked for: its first show. */
export const homeScope = (r: QueueRow): ScopeId =>
  r.shows[0] ? `show:${r.shows[0]}` : r.marketplace ? 'marketplace' : 'all';

/**
 * Everything, the marketplace, then each show newest first — the same list
 * as Seller Hub's show picker, counted from the parcels on hand.
 */
export function scopesOf(rows: QueueRow[], shows: Map<string, WnShow>): Scope[] {
  const tally = new Map<ScopeId, Scope>();
  const add = (id: ScopeId, make: () => Scope, r: QueueRow) => {
    const sc = tally.get(id) ?? make();
    sc.total++;
    if (r.wn.status === 'created') sc.needsLabel++;
    // A show with no start time on file is dated by its earliest parcel.
    if (sc.kind !== 'show' || !shows.get(id.slice(5))?.scheduled_start_at) {
      if (r.wn.createdAt && (!sc.startAt || r.wn.createdAt < sc.startAt)) sc.startAt = r.wn.createdAt;
    }
    tally.set(id, sc);
  };
  for (const r of rows) {
    add('all', () => ({ id: 'all', kind: 'all', title: 'All shows & marketplace', startAt: null, total: 0, needsLabel: 0 }), r);
    if (r.marketplace) add('marketplace', () => ({ id: 'marketplace', kind: 'marketplace', title: 'Marketplace', startAt: null, total: 0, needsLabel: 0 }), r);
    for (const sid of r.shows) {
      const sh = shows.get(sid);
      add(`show:${sid}`, () => ({
        id: `show:${sid}`, kind: 'show', title: sh?.title || 'Live show',
        startAt: sh?.scheduled_start_at ?? null, total: 0, needsLabel: 0,
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
