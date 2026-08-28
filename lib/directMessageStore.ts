import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type DirectMessage = {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const MESSAGES_FILE = join(DATA_DIR, 'direct-messages.json');
const READS_FILE = join(DATA_DIR, 'direct-message-reads.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function conversationKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

function readAllMessages(): DirectMessage[] {
  try {
    if (existsSync(MESSAGES_FILE)) return JSON.parse(readFileSync(MESSAGES_FILE, 'utf8'));
  } catch {}
  return [];
}

function writeAllMessages(messages: DirectMessage[]): void {
  ensureDir();
  writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function readAllReads(): Record<string, number> {
  try {
    if (existsSync(READS_FILE)) return JSON.parse(readFileSync(READS_FILE, 'utf8'));
  } catch {}
  return {};
}

function writeAllReads(reads: Record<string, number>): void {
  ensureDir();
  writeFileSync(READS_FILE, JSON.stringify(reads, null, 2));
}

export function addDirectMessage(from: string, to: string, text: string): DirectMessage {
  const messages = readAllMessages();
  const msg: DirectMessage = { id: Math.random().toString(36).slice(2), from, to, text, at: Date.now() };
  messages.push(msg);
  writeAllMessages(messages);
  return msg;
}

export function getConversation(a: string, b: string, since = 0): DirectMessage[] {
  const key = conversationKey(a, b);
  return readAllMessages()
    .filter(m => conversationKey(m.from, m.to) === key && m.at > since)
    .sort((x, y) => x.at - y.at);
}

export function markConversationRead(username: string, otherUsername: string, lastReadAt: number): void {
  const key = `${conversationKey(username, otherUsername)}|${username}`;
  const reads = readAllReads();
  if (!reads[key] || lastReadAt > reads[key]) {
    reads[key] = lastReadAt;
    writeAllReads(reads);
  }
}

// Unread count per conversation partner, for the given user
export function getUnreadCounts(username: string): Record<string, number> {
  const messages = readAllMessages();
  const reads = readAllReads();
  const counts: Record<string, number> = {};
  for (const m of messages) {
    if (m.to !== username) continue;
    const key = `${conversationKey(m.from, m.to)}|${username}`;
    const lastReadAt = reads[key] ?? 0;
    if (m.at > lastReadAt) counts[m.from] = (counts[m.from] ?? 0) + 1;
  }
  return counts;
}
