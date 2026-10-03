import { readData, writeData } from './storage';

// What each host has run on a given day's livestream.
//
// This lives only here — the Google inventory sheet is read-only to this app
// on purpose, so running an item never touches the real stock numbers.
const FILE = 'runsheet.json';

export type RunEntry = {
  modelNum: string;
  ran: number;
  /** Snapshot so a finished sheet still reads correctly if the row later changes. */
  description: string;
  cost: number;
  retail: number;
  updatedAt: string;
};

// date (YYYY-MM-DD, from the host's own browser) -> username -> entries
type Store = Record<string, Record<string, RunEntry[]>>;

function readAll(): Store {
  return readData<Store>(FILE, {});
}

export function getEntries(date: string, username: string): RunEntry[] {
  return readAll()[date]?.[username] ?? [];
}

function save(date: string, username: string, entries: RunEntry[]): RunEntry[] {
  const all = readAll();
  all[date] = { ...(all[date] ?? {}), [username]: entries };
  writeData<Store>(FILE, all);
  return entries;
}

export function setEntry(
  date: string,
  username: string,
  entry: Omit<RunEntry, 'updatedAt'>,
): RunEntry[] {
  const entries = getEntries(date, username);
  const idx = entries.findIndex(e => e.modelNum === entry.modelNum);
  const next = { ...entry, updatedAt: new Date().toISOString() };

  // Dropping to zero removes the line rather than leaving an empty row behind.
  if (entry.ran <= 0) {
    return save(date, username, entries.filter(e => e.modelNum !== entry.modelNum));
  }
  if (idx === -1) return save(date, username, [...entries, next]);

  const updated = [...entries];
  updated[idx] = next;
  return save(date, username, updated);
}

export function removeEntry(date: string, username: string, modelNum: string): RunEntry[] {
  return save(date, username, getEntries(date, username).filter(e => e.modelNum !== modelNum));
}

export function clearDay(date: string, username: string): RunEntry[] {
  return save(date, username, []);
}
