// ─── The poll cycle ────────────────────────────────────────────────────────
//
// Every few minutes: refresh what we know, work out what is worth saying,
// drop anything already said, and post one digest.
//
// Ordering matters here. The dedupe ledger is claimed BEFORE the send, not
// after. If Telegram fails halfway through a digest, the alternative is that
// the next poll re-sends everything that did get through; losing one alert to
// a transient failure is the better trade, and the run log records it.

import { whatnot, hasToken } from '../whatnot/client';
import * as wnStore from '../whatnot/store';
import {
  fulfillmentAlerts, milestoneAlerts, bigSaleAlerts, mailAlerts, renderDigest,
  applyQuietHours, type Alert, type MailThread,
} from './alerts';
import { configFromEnv, sendMessage, type TelegramConfig } from './client';
import { getSettings, claimUnsent, addRun, type TelegramSettings } from './store';
import { BUSINESS_TZ } from '../hostDay';
import { getGmailToken, getHeader } from '../gmail';
import { getGmailFilters, buildGmailQuery } from '../gmailFilterStore';

export type RunOutcome = {
  found: number;
  sent: number;
  held: number;
  suppressed: number;
  error?: string;
  note?: string;
  preview?: string;
};

export function resolveConfig(settings: TelegramSettings): TelegramConfig | null {
  const env = configFromEnv();
  if (!env) return null;
  // The stored chat id wins so the group can be changed without a redeploy.
  return { token: env.token, chatId: settings.chatId || env.chatId };
}

/**
 * Pull just enough from Whatnot to judge the current state.
 *
 * Shipments and orders only — the catalogue takes minutes and nothing here
 * depends on it. Orders come back newest-first and stop at the first known
 * one, so a quiet poll is a single request.
 */
async function refresh(): Promise<string | undefined> {
  if (!hasToken()) return 'WHATNOT_API_KEY is not set, so nothing could be refreshed';
  try {
    const known = wnStore.getOrderIds();
    const orders = await whatnot.listOrders({ knownIds: known, max: 500 });
    if (orders.length) wnStore.putOrders(orders);

    // Open parcels are the newest ones, so a bounded page covers them.
    const shipments = await whatnot.listShipments({ max: 400 });
    if (shipments.length) wnStore.putShipments(shipments);

    // Shows end a few times a day at most; cheap enough to re-read.
    const ended = await whatnot.listShows('ended', { max: 50 });
    if (ended.length) wnStore.putShows(ended);

    // Analytics only for shows we have not scored yet.
    const have = wnStore.getAnalytics();
    const todo = ended.filter(s => have[s.id]?.calculation_status !== 'GENERATED').slice(0, 10);
    const rows = [];
    for (const s of todo) {
      try { rows.push(await whatnot.getShowAnalytics(s.id)); } catch { /* not ready yet */ }
    }
    if (rows.length) wnStore.putAnalytics(rows);
    return undefined;
  } catch (e) {
    return `Whatnot refresh failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Recent Gmail threads from the given senders. */
async function recentMail(senders: string[], max = 15): Promise<MailThread[]> {
  if (!senders.length || !process.env.GMAIL_CLIENT_ID) return [];
  try {
    const token = await getGmailToken();
    const q = `${buildGmailQuery(senders)} newer_than:2d`;
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const data = await res.json();
    if (!data.messages?.length) return [];

    const out: MailThread[] = [];
    for (const msg of data.messages) {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata` +
        `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const d = await r.json();
      const headers = d.payload?.headers ?? [];
      out.push({
        id: msg.id,
        from: getHeader(headers, 'From'),
        subject: getHeader(headers, 'Subject'),
        snippet: d.snippet ?? '',
        date: getHeader(headers, 'Date'),
      });
    }
    return out;
  } catch (e) {
    console.error('telegram: gmail read failed', e);
    return [];
  }
}

export type RunOptions = {
  /** Work everything out and render the digest, but send nothing. */
  dryRun?: boolean;
  /** Ignore the dedupe ledger — used by the test button. */
  ignoreLedger?: boolean;
  /** Skip the Whatnot/Gmail refresh and judge what is already stored. */
  skipRefresh?: boolean;
};

export async function runOnce(opts: RunOptions = {}): Promise<RunOutcome> {
  const settings = getSettings();
  const cfg = resolveConfig(settings);
  const now = new Date();
  const nowIso = now.toISOString();

  if (!cfg) {
    return { found: 0, sent: 0, held: 0, suppressed: 0, error: 'TELEGRAM_BOT_TOKEN is not set' };
  }
  if (!cfg.chatId) {
    return { found: 0, sent: 0, held: 0, suppressed: 0, error: 'No Telegram chat id configured' };
  }

  const notes: string[] = [];
  if (!opts.skipRefresh) {
    const err = await refresh();
    if (err) notes.push(err);
  }

  // ── Gather ───────────────────────────────────────────────────────────────
  const alerts: Alert[] = [];

  if (settings.streams.fulfillment) {
    alerts.push(...fulfillmentAlerts(wnStore.getShipments(), nowIso, settings.thresholds));
  }

  if (settings.streams.milestones) {
    const hosts = wnStore.getHostAssignments();
    alerts.push(...milestoneAlerts(
      wnStore.getShows(), wnStore.getAnalytics(),
      id => hosts[id]?.host ?? null, nowIso));
    if (settings.bigSaleMinimum > 0) {
      // Only recent orders: an old large order is history, not news.
      const cutoff = new Date(now.getTime() - 2 * 86400000).toISOString();
      const recent = wnStore.getOrders().filter(o => o.created_at >= cutoff);
      alerts.push(...bigSaleAlerts(recent, settings.bigSaleMinimum, nowIso));
    }
  }

  if (settings.streams.support) {
    alerts.push(...mailAlerts(await recentMail(getGmailFilters()), 'support', nowIso));
  }
  if (settings.streams.messages && settings.messageSenders.length) {
    alerts.push(...mailAlerts(await recentMail(settings.messageSenders), 'messages', nowIso));
  }

  const found = alerts.length;

  // ── Drop what has already been said ──────────────────────────────────────
  let fresh: Alert[];
  if (opts.ignoreLedger || opts.dryRun) {
    fresh = alerts;
  } else {
    const claimed = new Set(claimUnsent(alerts.map(a => a.key), now));
    fresh = alerts.filter(a => claimed.has(a.key));
  }
  const suppressed = found - fresh.length;

  // ── Quiet hours ──────────────────────────────────────────────────────────
  const { send, held } = applyQuietHours(fresh, now, settings.quietHours, BUSINESS_TZ);

  if (held.length) {
    // Held alerts were already claimed, so without this they would never be
    // said at all. Putting the keys back makes the next waking poll repeat them.
    if (!opts.dryRun && !opts.ignoreLedger) {
      const { forget } = await import('./store');
      forget(held.map(a => a.key));
    }
    notes.push(`${held.length} held until quiet hours end`);
  }

  if (!send.length) {
    const outcome: RunOutcome = {
      found, sent: 0, held: held.length, suppressed,
      note: notes.join('; ') || 'nothing new',
    };
    if (!opts.dryRun) addRun({ at: nowIso, ...outcome });
    return outcome;
  }

  const heading = send.length === 1 ? undefined : `${send.length} updates`;
  const text = renderDigest(send, { heading });

  if (opts.dryRun) {
    return { found, sent: 0, held: held.length, suppressed, preview: text, note: notes.join('; ') };
  }

  try {
    await sendMessage(cfg, text, { silent: send.every(a => a.severity === 'info') });
    const outcome: RunOutcome = {
      found, sent: send.length, held: held.length, suppressed,
      note: notes.join('; ') || undefined,
    };
    addRun({ at: nowIso, ...outcome });
    return outcome;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    addRun({ at: nowIso, found, sent: 0, held: held.length, suppressed, error });
    return { found, sent: 0, held: held.length, suppressed, error };
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────
//
// Railway runs one long-lived Node process, so a timer is enough; there is no
// serverless cold start to work around. Guarded against double-start because
// Next can evaluate a module more than once in development.

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startScheduler(): void {
  if (timer) return;

  const tick = async () => {
    const settings = getSettings();
    if (!settings.enabled) return;
    // A slow poll must not overlap the next one.
    if (running) return;
    running = true;
    try {
      const r = await runOnce();
      if (r.error) console.error('telegram poll:', r.error);
    } catch (e) {
      console.error('telegram poll threw:', e);
    } finally {
      running = false;
    }
  };

  const minutes = Math.max(1, getSettings().pollMinutes || 10);
  timer = setInterval(tick, minutes * 60_000);
  // Don't hold the process open on shutdown.
  if (typeof timer === 'object' && 'unref' in timer) (timer as unknown as { unref(): void }).unref();
  console.log(`telegram scheduler started — every ${minutes} min`);
}

export function stopScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function schedulerRunning(): boolean {
  return timer !== null;
}
