import { readData, writeData } from './storage';

export type TicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type InternalNote = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type TicketMeta = {
  threadId: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  notes: InternalNote[];
  createdAt: string;
  updatedAt: string;
};

const FILE = 'tickets.json';

function load(): Record<string, TicketMeta> {
  return readData<Record<string, TicketMeta>>(FILE, {});
}

function save(data: Record<string, TicketMeta>) {
  writeData(FILE, data);
}

export function getTicket(threadId: string): TicketMeta | null {
  return load()[threadId] ?? null;
}

export function upsertTicket(threadId: string, updates: Partial<Omit<TicketMeta, 'threadId' | 'createdAt'>>): TicketMeta {
  const all = load();
  const now = new Date().toISOString();
  const existing = all[threadId];
  const merged: TicketMeta = Object.assign(
    {
      threadId,
      status: 'new' as TicketStatus,
      priority: 'normal' as TicketPriority,
      assignedTo: null,
      notes: [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
    existing ?? {},
    updates,
    { threadId, updatedAt: now }
  );
  all[threadId] = merged;
  save(all);
  return merged;
}

export function addNote(threadId: string, author: string, text: string): TicketMeta {
  const all = load();
  const now = new Date().toISOString();
  const existing = all[threadId] ?? {
    threadId, status: 'open' as TicketStatus, priority: 'normal' as TicketPriority,
    assignedTo: null, notes: [], createdAt: now, updatedAt: now,
  };
  existing.notes = [...existing.notes, { id: Date.now().toString(36), author, text, createdAt: now }];
  existing.updatedAt = now;
  all[threadId] = existing;
  save(all);
  return all[threadId];
}

export function getAllTicketMeta(): Record<string, TicketMeta> {
  return load();
}
