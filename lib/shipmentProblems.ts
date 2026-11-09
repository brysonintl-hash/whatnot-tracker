// What can go wrong with a shipment, shared by the ledger (server) and the
// Shipments page (browser) — the ledger file itself can't be imported into
// the browser because it reads the disk.

export const ERROR_TYPES = {
  'wrong-item': 'Wrong item',
  'missing-item': 'Missing item',
  damaged: 'Damaged / poorly packed',
  'wrong-label': 'Wrong label or address',
  late: 'Shipped late',
  other: 'Other',
} as const;

export type ErrorType = keyof typeof ERROR_TYPES;

export const isErrorType = (t: unknown): t is ErrorType => typeof t === 'string' && t in ERROR_TYPES;
