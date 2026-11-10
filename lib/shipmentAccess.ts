import type { SessionPayload } from './auth';
import { getAssignments } from './shipmentStore';
import { getLedger } from './shipmentLedger';

export const isManager = (s: SessionPayload) => s.role === 'admin' || s.role === 'manager';

/** The people shipments are handed to can also take unclaimed ones themselves. */
export const canSelfAssign = (s: SessionPayload) => s.role === 'shipper' || s.role === 'host';

/**
 * Who may make or print a parcel's label: managers, whoever the parcel is
 * assigned to, and — for a parcel nobody has — any shipper or host, since
 * making the label assigns it to them. Printing is also open to whoever made
 * the label here.
 */
export function canHandle(s: SessionPayload, shipmentId: string, opts: { print?: boolean } = {}): boolean {
  if (isManager(s)) return true;
  const held = getAssignments().filter(a => a.shipmentId === shipmentId);
  if (held.some(a => a.assignedTo === s.username)) return true;
  // Nobody has it: a shipper may make its label, which makes it theirs.
  if (!opts.print && held.length === 0 && canSelfAssign(s)) return true;
  if (opts.print) {
    return getLedger().events.some(e =>
      e.shipmentId === shipmentId && e.kind === 'label-requested' && e.by === s.username);
  }
  return false;
}

/** Whatnot shipment ids are plain decimals; anything else never reaches the API. */
export const validShipmentId = (id: unknown): id is string =>
  typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id);
