interface ReadEntry {
  username: string;
  name: string;
  role: string;
  lastReadAt: number; // timestamp of the last message they've seen
}

const store = new Map<string, ReadEntry>();

export function markRead(username: string, name: string, role: string, lastReadAt: number) {
  const existing = store.get(username);
  if (!existing || lastReadAt > existing.lastReadAt) {
    store.set(username, { username, name, role, lastReadAt });
  }
}

export function getReaders(): ReadEntry[] {
  return Array.from(store.values());
}
