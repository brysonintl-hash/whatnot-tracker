import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type TimeEntry = {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: string;
  clockIn: string;
  clockOut: string | null;
  note: string;
  date: string;
};

export type UserRate = {
  userId: string;
  username: string;
  name: string;
  ratePerHour: number;
};

export type PaymentRecord = {
  userId: string;
  weekStart: string;
  paid: boolean;
  paidAt: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const ENTRIES_FILE = join(DATA_DIR, 'timekeeping.json');
const RATES_FILE = join(DATA_DIR, 'rates.json');
const PAYMENTS_FILE = join(DATA_DIR, 'payments.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function getEntries(): TimeEntry[] {
  try {
    if (existsSync(ENTRIES_FILE)) return JSON.parse(readFileSync(ENTRIES_FILE, 'utf8'));
  } catch {}
  return [];
}

export function getRates(): UserRate[] {
  try {
    if (existsSync(RATES_FILE)) return JSON.parse(readFileSync(RATES_FILE, 'utf8'));
  } catch {}
  return [];
}

export function clockIn(data: { userId: string; username: string; name: string; role: string }): TimeEntry | null {
  const entries = getEntries();
  if (entries.find(e => e.userId === data.userId && !e.clockOut)) return null;
  const now = new Date();
  const entry: TimeEntry = {
    id: Date.now().toString(),
    ...data,
    clockIn: now.toISOString(),
    clockOut: null,
    note: '',
    date: now.toLocaleDateString('en-US'),
  };
  ensureDir();
  writeFileSync(ENTRIES_FILE, JSON.stringify([...entries, entry], null, 2));
  return entry;
}

export function clockOut(entryId: string, note: string): TimeEntry | null {
  const entries = getEntries();
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx === -1) return null;
  entries[idx] = { ...entries[idx], clockOut: new Date().toISOString(), note };
  ensureDir();
  writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
  return entries[idx];
}

export function getActiveEntry(userId: string): TimeEntry | null {
  return getEntries().find(e => e.userId === userId && !e.clockOut) ?? null;
}

export function clearAllEntries(): void {
  ensureDir();
  writeFileSync(ENTRIES_FILE, JSON.stringify([], null, 2));
}

export function clearWeekEntries(sunISO: string, satISO: string): void {
  const sun = new Date(sunISO);
  const sat = new Date(satISO);
  const entries = getEntries();
  const kept = entries.filter(e => {
    const d = new Date(e.clockIn);
    return d < sun || d > sat;
  });
  ensureDir();
  writeFileSync(ENTRIES_FILE, JSON.stringify(kept, null, 2));
}

export function deleteEntry(entryId: string): boolean {
  const entries = getEntries();
  const filtered = entries.filter(e => e.id !== entryId);
  if (filtered.length === entries.length) return false;
  ensureDir();
  writeFileSync(ENTRIES_FILE, JSON.stringify(filtered, null, 2));
  return true;
}

export function getPayments(): PaymentRecord[] {
  try {
    if (existsSync(PAYMENTS_FILE)) return JSON.parse(readFileSync(PAYMENTS_FILE, 'utf8'));
  } catch {}
  return [];
}

export function setPayment(userId: string, weekStart: string, paid: boolean): PaymentRecord {
  const payments = getPayments();
  const idx = payments.findIndex(p => p.userId === userId && p.weekStart === weekStart);
  const record: PaymentRecord = { userId, weekStart, paid, paidAt: new Date().toISOString() };
  const updated = idx === -1 ? [...payments, record] : payments.map((p, i) => i === idx ? record : p);
  ensureDir();
  writeFileSync(PAYMENTS_FILE, JSON.stringify(updated, null, 2));
  return record;
}

export function setRate(userId: string, username: string, name: string, ratePerHour: number) {
  const rates = getRates();
  const idx = rates.findIndex(r => r.userId === userId);
  const updated = idx === -1
    ? [...rates, { userId, username, name, ratePerHour }]
    : rates.map((r, i) => i === idx ? { ...r, ratePerHour } : r);
  ensureDir();
  writeFileSync(RATES_FILE, JSON.stringify(updated, null, 2));
}
