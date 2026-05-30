import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type PresenceRecord = {
  userId: string;
  username: string;
  name: string;
  role: string;
  lastSeen: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'presence.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function updatePresence(userId: string, username: string, name: string, role: string): void {
  let data: Record<string, PresenceRecord> = {};
  try {
    if (existsSync(FILE)) data = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  data[userId] = { userId, username, name, role, lastSeen: new Date().toISOString() };
  ensureDir();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getOnlineUsers(withinMs = 30 * 1000): PresenceRecord[] {
  try {
    if (!existsSync(FILE)) return [];
    const data: Record<string, PresenceRecord> = JSON.parse(readFileSync(FILE, 'utf8'));
    const cutoff = Date.now() - withinMs;
    return Object.values(data).filter(r => new Date(r.lastSeen).getTime() > cutoff);
  } catch {}
  return [];
}
