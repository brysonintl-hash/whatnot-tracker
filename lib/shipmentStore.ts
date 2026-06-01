import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type ShipmentAssignment = {
  shipmentId: string;
  tab: string;
  assignedTo: string;       // username
  assignedToName: string;
  assignedToRole: string;   // 'host' | 'shipper'
  assignedBy: string;       // admin/manager username
  assignedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
  notes: string;
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

export function getAssignmentsForUser(username: string): ShipmentAssignment[] {
  return read().filter(a => a.assignedTo === username);
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
