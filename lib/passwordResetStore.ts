import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';

type ResetEntry = { userId: string; expiresAt: number };

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'password-resets.json');
const TTL_MS = 60 * 60 * 1000; // 1 hour

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): Record<string, ResetEntry> {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return {};
}

function writeAll(data: Record<string, ResetEntry>): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function createResetToken(userId: string): string {
  const token = randomBytes(32).toString('hex');
  const all = readAll();
  all[token] = { userId, expiresAt: Date.now() + TTL_MS };
  writeAll(all);
  return token;
}

/** One-time use — consuming a token deletes it, valid or not. */
export function consumeResetToken(token: string): string | null {
  const all = readAll();
  const entry = all[token];
  if (!entry) return null;
  delete all[token];
  writeAll(all);
  return entry.expiresAt >= Date.now() ? entry.userId : null;
}
