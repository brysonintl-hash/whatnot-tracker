import type { SessionPayload } from './auth';

export const isManager = (s: SessionPayload) => s.role === 'admin' || s.role === 'manager';

/**
 * Who works the shipping desk: managers, shippers and hosts. Any of them can
 * make or print any shipment's label; whoever makes it is recorded on it.
 */
export const canLabel = (s: SessionPayload) => isManager(s) || s.role === 'shipper' || s.role === 'host';

/** Whatnot shipment ids are plain decimals; anything else never reaches the API. */
export const validShipmentId = (id: unknown): id is string =>
  typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id);
