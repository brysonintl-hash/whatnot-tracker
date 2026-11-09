// ─── Telegram Bot API ──────────────────────────────────────────────────────
//
// One bot posting into one group chat. No library — the Bot API is plain
// HTTPS and a dependency here would be more code than this file.
//
// Two limits shape everything below:
//
//   • 20 messages per minute to the same group. Exceed it and Telegram
//     answers 429 with a retry_after. A busy shipping afternoon can easily
//     produce more than 20 alerts, so alerts are batched into digests rather
//     than sent one per event — see `sendDigest`.
//   • 4096 characters per message, so a digest is split rather than truncated.

const API = 'https://api.telegram.org';

export type TelegramConfig = { token: string; chatId: string };

export class TelegramError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) {
    super(message);
    this.name = 'TelegramError';
  }
}

export function configFromEnv(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) return null;
  return { token, chatId: chatId ?? '' };
}

/** Telegram's HTML mode only allows a handful of tags; everything else must be escaped. */
export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const MAX_MESSAGE = 4096;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Shared across callers: the limit is per chat, not per request path.
let sentTimestamps: number[] = [];
const PER_MINUTE = 18; // two under Telegram's 20, so a retry has room

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    sentTimestamps = sentTimestamps.filter(t => now - t < 60_000);
    if (sentTimestamps.length < PER_MINUTE) {
      sentTimestamps.push(now);
      return;
    }
    // Wait until the oldest send falls out of the window.
    await sleep(60_000 - (now - sentTimestamps[0]) + 250);
  }
}

async function call<T>(cfg: TelegramConfig, method: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}/bot${cfg.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) return data.result as T;

    const retryAfter = data?.parameters?.retry_after;
    if (res.status === 429 && retryAfter) {
      await sleep((retryAfter + 1) * 1000);
      continue;
    }
    if (res.status >= 500) {
      await sleep(2 ** attempt * 500);
      continue;
    }
    throw new TelegramError(data.description || `HTTP ${res.status}`, res.status, retryAfter);
  }
  throw new TelegramError('gave up after retries', 0);
}

/** Split on line boundaries so a digest never breaks mid-entry. */
export function splitMessage(text: string, limit = MAX_MESSAGE): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    // A single line longer than the limit is hard-split; nothing else to do.
    if (line.length > limit) {
      if (buf) { out.push(buf); buf = ''; }
      for (let i = 0; i < line.length; i += limit) out.push(line.slice(i, i + limit));
      continue;
    }
    if (buf.length + line.length + 1 > limit) { out.push(buf); buf = line; }
    else buf = buf ? `${buf}\n${line}` : line;
  }
  if (buf) out.push(buf);
  return out;
}

export async function sendMessage(
  cfg: TelegramConfig,
  text: string,
  opts: { silent?: boolean; preview?: boolean } = {},
): Promise<number[]> {
  if (!cfg.chatId) throw new TelegramError('No chat id configured', 0);
  const ids: number[] = [];
  for (const chunk of splitMessage(text)) {
    await throttle();
    const msg = await call<{ message_id: number }>(cfg, 'sendMessage', {
      chat_id: cfg.chatId,
      text: chunk,
      parse_mode: 'HTML',
      disable_web_page_preview: !opts.preview,
      disable_notification: Boolean(opts.silent),
    });
    ids.push(msg.message_id);
  }
  return ids;
}

export type BotInfo = { id: number; username: string; first_name: string };

export function getMe(cfg: TelegramConfig): Promise<BotInfo> {
  return call<BotInfo>(cfg, 'getMe', {});
}

export type ChatCandidate = { id: string; title: string; type: string };

/**
 * Chats the bot has recently seen a message in.
 *
 * This is how the chat id gets discovered without anyone reading Telegram's
 * docs: add the bot to the group, say anything, press the button. getUpdates
 * only returns messages from the last 24h and only while no webhook is set,
 * which is fine for a one-time setup step.
 */
export async function discoverChats(cfg: TelegramConfig): Promise<ChatCandidate[]> {
  const updates = await call<Array<Record<string, any>>>(cfg, 'getUpdates', { limit: 100 });
  const seen = new Map<string, ChatCandidate>();
  for (const u of updates) {
    const chat = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat;
    if (!chat?.id) continue;
    seen.set(String(chat.id), {
      id: String(chat.id),
      title: chat.title || chat.username || chat.first_name || 'Direct message',
      type: chat.type,
    });
  }
  return Array.from(seen.values());
}
