// ─── Who handled each shipment, and what went wrong ───────────────────────
//
// Accountability for the shipping desk. Two kinds of record:
//
//   • events — a label requested or printed from this site, stamped with
//     whoever was signed in. The person who made the label is the parcel's
//     handler.
//   • problems — a wrong item, a missing item, a bad label… pinned on the
//     handler at the moment it's reported, so reassigning the parcel later
//     doesn't move the blame.
//
// A label made straight in Whatnot leaves no name behind, so for those the
// handler falls back to whoever the parcel was assigned to here. Problems the
// team already logs on the Incomplete Orders and Replacements tabs are linked
// in by order number, so nobody has to report the same thing twice.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ERROR_TYPES, isErrorType, type ErrorType } from './shipmentProblems';

export { ERROR_TYPES, isErrorType, type ErrorType };

// ─── Records ───────────────────────────────────────────────────────────────

export type LedgerEventKind = 'label-requested' | 'label-failed' | 'printed';

export type LedgerEvent = {
  shipmentId: string;
  kind: LedgerEventKind;
  by: string;
  byName: string;
  at: string;
  note?: string;
};

export type ErrorSource = 'manual' | 'incomplete' | 'replacement';

export type ErrorReport = {
  id: string;
  shipmentId: string;
  orderId: string | null;
  type: ErrorType;
  note: string;
  /** Username the problem counts against; '' when nobody could be named. */
  against: string;
  againstName: string;
  reportedBy: string;
  reportedAt: string;
  source: ErrorSource;
  dismissed: { by: string; at: string } | null;
};

type Ledger = {
  events: LedgerEvent[];
  errors: ErrorReport[];
  /** Linked problems from the claim tabs that a manager ruled out, by key. */
  dismissedClaims: Record<string, { by: string; at: string }>;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'shipmentLedger.json');
/** Events are small but ~150 parcels a day add up; a year is plenty for trends. */
const KEEP_DAYS = 365;

export function getLedger(): Ledger {
  try {
    if (existsSync(FILE)) {
      const l = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<Ledger>;
      return { events: l.events ?? [], errors: l.errors ?? [], dismissedClaims: l.dismissedClaims ?? {} };
    }
  } catch (e) {
    console.error('shipment ledger: could not read:', e);
  }
  return { events: [], errors: [], dismissedClaims: {} };
}

function save(l: Ledger): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    l.events = l.events.filter(e => e.at >= cutoff);
    writeFileSync(`${FILE}.tmp`, JSON.stringify(l));
    renameSync(`${FILE}.tmp`, FILE);
  } catch (e) {
    console.error('shipment ledger: could not write:', e);
  }
}

export function recordEvent(e: LedgerEvent): void {
  const l = getLedger();
  l.events.push(e);
  save(l);
}

export function addError(r: Omit<ErrorReport, 'id' | 'dismissed'>): ErrorReport {
  const l = getLedger();
  const report: ErrorReport = { ...r, id: randomUUID(), dismissed: null };
  l.errors.push(report);
  save(l);
  return report;
}

/** Rule a problem out (or back in). Claim-linked ones are keyed, not stored. */
export function setDismissed(id: string, by: string, dismissed: boolean): boolean {
  const l = getLedger();
  const stamp = { by, at: new Date().toISOString() };
  if (id.startsWith('claim:')) {
    if (dismissed) l.dismissedClaims[id] = stamp;
    else delete l.dismissedClaims[id];
    save(l);
    return true;
  }
  const r = l.errors.find(x => x.id === id);
  if (!r) return false;
  r.dismissed = dismissed ? stamp : null;
  save(l);
  return true;
}

// ─── Handler ───────────────────────────────────────────────────────────────

export type Handler = {
  username: string;
  name: string;
  /** label: made the label here. assigned: label made elsewhere, so the assignee. */
  how: 'label' | 'assigned';
  at: string;
};

export type AssignmentRef = { assignedTo: string; assignedToName: string; assignedAt: string } | null | undefined;

/** The first person to make the label here; failing that, whoever it was assigned to. */
export function handlerOf(events: LedgerEvent[], assignment: AssignmentRef): Handler | null {
  const first = events
    .filter(e => e.kind === 'label-requested')
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  if (first) return { username: first.by, name: first.byName, how: 'label', at: first.at };
  if (assignment?.assignedTo) {
    return { username: assignment.assignedTo, name: assignment.assignedToName || assignment.assignedTo, how: 'assigned', at: assignment.assignedAt };
  }
  return null;
}

export function eventsByShipment(events: LedgerEvent[]): Map<string, LedgerEvent[]> {
  const m = new Map<string, LedgerEvent[]>();
  for (const e of events) {
    const list = m.get(e.shipmentId);
    if (list) list.push(e); else m.set(e.shipmentId, [e]);
  }
  return m;
}

// ─── Problems already logged on the claim tabs ─────────────────────────────

export type ClaimRef = {
  type: 'incomplete' | 'replacement';
  orderNumber?: string;
  itemName?: string;
  note?: string;
};

/** "#1527419118 " → "1527419118". Anything that isn't an order number → ''. */
export function orderKey(raw: string | undefined | null): string {
  const digits = String(raw ?? '').replace(/[#\s]/g, '');
  return /^\d{6,19}$/.test(digits) ? digits : '';
}

/**
 * Claim rows whose order went out in a parcel we know, as problems against
 * that parcel's handler. Rows that match no parcel are left out — they were
 * shipped before this ledger existed or outside the window we can see.
 */
export function claimErrors(
  claims: ClaimRef[],
  shipmentOfOrder: (orderId: string) => string | null,
  handler: (shipmentId: string) => Handler | null,
  dismissed: Ledger['dismissedClaims'],
): ErrorReport[] {
  const out: ErrorReport[] = [];
  const seen = new Set<string>();
  for (const c of claims) {
    const order = orderKey(c.orderNumber);
    if (!order) continue;
    const id = `claim:${c.type}:${order}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const shipmentId = shipmentOfOrder(order);
    if (!shipmentId) continue;
    const h = handler(shipmentId);
    out.push({
      id, shipmentId, orderId: order,
      type: c.type === 'incomplete' ? 'missing-item' : 'wrong-item',
      note: [c.itemName, c.note].filter(Boolean).join(' — '),
      against: h?.username ?? '',
      againstName: h?.name ?? '',
      reportedBy: '',
      // Claim rows carry no reliable date; they count from when the parcel was handled.
      reportedAt: h?.at ?? '',
      source: c.type,
      dismissed: dismissed[id] ?? null,
    });
  }
  return out;
}

// ─── Scoreboard ────────────────────────────────────────────────────────────

export type PersonScore = {
  username: string;
  name: string;
  /** Parcels this person is the handler of, in the window. */
  handled: number;
  /** Of those, labels they made here. */
  labels: number;
  errors: number;
  /** errors / handled, or null when they handled nothing. */
  rate: number | null;
  byType: Partial<Record<ErrorType, number>>;
  lastErrorAt: string | null;
};

export function scoreboard(
  handled: { shipmentId: string; handler: Handler }[],
  errors: ErrorReport[],
  since: string,
): PersonScore[] {
  const people = new Map<string, PersonScore>();
  const person = (username: string, name: string) => {
    let p = people.get(username);
    if (!p) {
      p = { username, name, handled: 0, labels: 0, errors: 0, rate: null, byType: {}, lastErrorAt: null };
      people.set(username, p);
    }
    if (name && p.name === p.username) p.name = name;
    return p;
  };

  for (const { handler } of handled) {
    if (handler.at < since) continue;
    const p = person(handler.username, handler.name);
    p.handled++;
    if (handler.how === 'label') p.labels++;
  }
  for (const e of errors) {
    if (e.dismissed || !e.against || !e.reportedAt || e.reportedAt < since) continue;
    const p = person(e.against, e.againstName);
    p.errors++;
    p.byType[e.type] = (p.byType[e.type] ?? 0) + 1;
    if (!p.lastErrorAt || e.reportedAt > p.lastErrorAt) p.lastErrorAt = e.reportedAt;
  }
  for (const p of Array.from(people.values())) p.rate = p.handled ? p.errors / p.handled : null;

  return Array.from(people.values()).sort((a, b) =>
    b.errors - a.errors || (b.rate ?? 0) - (a.rate ?? 0) || b.handled - a.handled || a.name.localeCompare(b.name));
}
