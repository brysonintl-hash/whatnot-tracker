import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type ShipmentAssignment = {
  shipmentId: string;
  tab: string;
  assignedTo: string;
  assignedToName: string;
  assignedToRole: string;
  assignedBy: string;
  assignedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
  notes: string;
  pinged: boolean;
  pingMessage: string;
  pingAt: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'shipmentAssignments.json');

function read(): ShipmentAssignment[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return [];
}

function write(data: ShipmentAssignment[]): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('shipmentStore write error:', e);
  }
}

export function getAssignments(): ShipmentAssignment[] {
  return read();
}

export function getAssignment(shipmentId: string, tab: string): ShipmentAssignment | null {
  return read().find(a => a.shipmentId === shipmentId && a.tab === tab) ?? null;
}

export function upsertAssignment(data: ShipmentAssignment): void {
  const all = read();
  const idx = all.findIndex(a => a.shipmentId === data.shipmentId && a.tab === data.tab);
  if (idx === -1) {
    write([...all, data]);
  } else {
    const updated = [...all];
    updated[idx] = data;
    write(updated);
  }
}

export function bulkAssign(
  items: { shipmentId: string; tab: string }[],
  assignedTo: string,
  assignedToName: string,
  assignedToRole: string,
  assignedBy: string,
  notes: string,
): void {
  const all = read();
  const now = new Date().toISOString();
  const base: Omit<ShipmentAssignment, 'shipmentId' | 'tab'> = {
    assignedTo, assignedToName, assignedToRole, assignedBy,
    assignedAt: now, status: 'pending', notes,
    pinged: false, pingMessage: '', pingAt: '',
  };
  for (const item of items) {
    const idx = all.findIndex(a => a.shipmentId === item.shipmentId && a.tab === item.tab);
    const entry: ShipmentAssignment = { ...base, shipmentId: item.shipmentId, tab: item.tab };
    if (idx === -1) all.push(entry);
    else all[idx] = entry;
  }
  write(all);
}

export function removeAssignment(shipmentId: string, tab: string): void {
  write(read().filter(a => !(a.shipmentId === shipmentId && a.tab === tab)));
}

export function updateStatus(shipmentId: string, tab: string, status: ShipmentAssignment['status']): boolean {
  const all = read();
  const idx = all.findIndex(a => a.shipmentId === shipmentId && a.tab === tab);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], status };
  write(all);
  return true;
}

export function pingShipment(shipmentId: string, tab: string, message: string): boolean {
  const all = read();
  const idx = all.findIndex(a => a.shipmentId === shipmentId && a.tab === tab);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], pinged: true, pingMessage: message, pingAt: new Date().toISOString() };
  write(all);
  return true;
}

export function acknowledgePing(shipmentId: string, tab: string): boolean {
  const all = read();
  const idx = all.findIndex(a => a.shipmentId === shipmentId && a.tab === tab);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], pinged: false, pingMessage: '', pingAt: '' };
  write(all);
  return true;
}
