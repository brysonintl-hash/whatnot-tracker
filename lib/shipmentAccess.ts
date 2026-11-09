import type { SessionPayload } from './auth';
import { getAssignments } from './shipmentStore';
import { getLedger } from './shipmentLedger';

export const isManager = (s: SessionPayload) => s.role === 'admin' || s.role === 'manager';

/**
 * Who may make or print a parcel's label: managers, and whoever the parcel
 * is assigned to. Printing is also open to whoever made the label here.
 */
export function canHandle(s: SessionPayload, shipmentId: string, opts: { print?: boolean } = {}): boolean {
  if (isManager(s)) return true;
  if (getAssignments().some(a => a.shipmentId === shipmentId && a.assignedTo === s.username)) return true;
  if (opts.print) {
    return getLedger().events.some(e =>
      e.shipmentId === shipmentId && e.kind === 'label-requested' && e.by === s.username);
  }
  return false;
}

/** Whatnot shipment ids are plain decimals; anything else never reaches the API. */
export const validShipmentId = (id: unknown): id is string =>
  typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id);
