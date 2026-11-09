// ─── Telegram settings and what has already been said ─────────────────────
//
// The dedupe ledger is the important half. The runner polls on a timer and
// re-evaluates every open shipment each time, so without a record of what has
// already been sent, one stalled parcel would alert every few minutes until
// somebody dealt with it — which is the fastest way to teach a team to mute a
// channel.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import type { AlertStream, FulfillmentThresholds } from './alerts';
import { DEFAULT_THRESHOLDS } from './alerts';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DIR = join(DATA_DIR, 'telegram');

function ensure() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }

function read<T>(file: string, fallback: T): T {
  try {
    const p = join(DIR, file);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch (e) {
    console.error(`telegram store: could not read ${file}:`, e);
  }
  return fallback;
}

function write<T>(file: string, data: T): void {
  try {
    ensure();
    const p = join(DIR, file);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, p);
  } catch (e) {
    console.error(`telegram store: could not write ${file}:`, e);
  }
}

export type TelegramSettings = {
  enabled: boolean;
  /** Overrides TELEGRAM_CHAT_ID when set, so the group can change without a redeploy. */
  chatId: string;
  streams: Record<AlertStream, boolean>;
  thresholds: FulfillmentThresholds;
  /** An order at or above this total is announced on its own. 0 turns it off. */
  bigSaleMinimum: number;
  /** Local hours during which nothing is sent; null means always on. */
  quietHours: { from: number; to: number } | null;
  /** Minutes between polls. */
  pollMinutes: number;
  /** Gmail senders whose mail becomes a 'messages' alert. */
  messageSenders: string[];
};

export const DEFAULT_SETTINGS: TelegramSettings = {
  enabled: false,
  chatId: '',
  streams: { fulfillment: true, support: true, messages: true, milestones: true },
  thresholds: DEFAULT_THRESHOLDS,
  bigSaleMinimum: 250,
  quietHours: { from: 21, to: 7 },
  pollMinutes: 10,
  messageSenders: [],
};

export function getSettings(): TelegramSettings {
  const s = read<Partial<TelegramSettings>>('settings.json', {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    streams: { ...DEFAULT_SETTINGS.streams, ...(s.streams ?? {}) },
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(s.thresholds ?? {}) },
  };
}

export function setSettings(patch: Partial<TelegramSettings>): TelegramSettings {
  const next = { ...getSettings(), ...patch };
  write('settings.json', next);
  return next;
}

// ─── Dedupe ledger ──────────────────────────────────────────────────────────

type Ledger = Record<string, string>; // alert key -> ISO sent-at

/** Keys are forgotten after this long, so the file cannot grow without bound. */
const RETAIN_DAYS = 30;

export function getSent(): Ledger {
  return read<Ledger>('sent.json', {});
}

/** Returns only the keys not already sent, and records them as sent. */
export function claimUnsent(keys: string[], now = new Date()): string[] {
  const ledger = getSent();
  const fresh = keys.filter(k => !(k in ledger));
  if (!fresh.length) return [];

  const iso = now.toISOString();
  for (const k of fresh) ledger[k] = iso;

  const cutoff = new Date(now.getTime() - RETAIN_DAYS * 86400000).toISOString();
  for (const [k, at] of Object.entries(ledger)) {
    if (at < cutoff) delete ledger[k];
  }

  write('sent.json', ledger);
  return fresh;
}

/** Lets a key fire again — used when a test send should not be suppressed. */
export function forget(keys: string[]): void {
  const ledger = getSent();
  for (const k of keys) delete ledger[k];
  write('sent.json', ledger);
}

// ─── Run log ────────────────────────────────────────────────────────────────

export type RunRecord = {
  at: string;
  found: number;
  sent: number;
  held: number;
  suppressed: number;
  error?: string;
  note?: string;
};

export function getRuns(): RunRecord[] {
  return read<RunRecord[]>('runs.json', []);
}

export function addRun(r: RunRecord): void {
  const all = [r, ...getRuns()].slice(0, 50);
  write('runs.json', all);
}
