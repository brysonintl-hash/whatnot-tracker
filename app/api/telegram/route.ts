import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { configFromEnv, getMe, discoverChats, sendMessage, TelegramError } from '@/lib/telegram/client';
import { getSettings, setSettings, getRuns, type TelegramSettings } from '@/lib/telegram/store';
import { runOnce, resolveConfig, schedulerRunning, startScheduler, stopScheduler } from '@/lib/telegram/runner';
import type { AlertStream } from '@/lib/telegram/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED = ['admin', 'manager'];

const STREAMS: AlertStream[] = ['fulfillment', 'support', 'messages', 'milestones'];

function clampHour(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

export async function GET() {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = getSettings();
  const env = configFromEnv();

  // Confirm the token actually works rather than just reporting it as present.
  let bot: { username: string } | null = null;
  let botError: string | undefined;
  if (env) {
    try { bot = await getMe(env); }
    catch (e) { botError = e instanceof Error ? e.message : String(e); }
  }

  return NextResponse.json({
    tokenConfigured: Boolean(env),
    bot,
    botError,
    settings,
    schedulerRunning: schedulerRunning(),
    runs: getRuns().slice(0, 12),
    gmailConfigured: Boolean(process.env.GMAIL_CLIENT_ID),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? 'save');

  // ── Find the group the bot has been added to ─────────────────────────────
  if (action === 'discover') {
    const env = configFromEnv();
    if (!env) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 400 });
    try {
      return NextResponse.json({ chats: await discoverChats(env) });
    } catch (e) {
      const msg = e instanceof TelegramError ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // ── Post a hello into the configured chat ────────────────────────────────
  if (action === 'test') {
    const cfg = resolveConfig(getSettings());
    if (!cfg) return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, { status: 400 });
    if (!cfg.chatId) return NextResponse.json({ error: 'Pick a chat first' }, { status: 400 });
    try {
      await sendMessage(cfg, [
        '<b>Stack Bargains alerts are connected.</b>',
        '',
        'This channel will carry fulfillment problems, show results and support mail.',
        `Set up by ${session.name || session.username}.`,
      ].join('\n'));
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  // ── Work out what would be sent, without sending ─────────────────────────
  if (action === 'preview') {
    const r = await runOnce({ dryRun: true });
    return NextResponse.json(r);
  }

  // ── Run the real cycle now ───────────────────────────────────────────────
  if (action === 'run') {
    const r = await runOnce();
    return NextResponse.json(r, { status: r.error ? 400 : 200 });
  }

  // ── Save settings ────────────────────────────────────────────────────────
  const current = getSettings();
  const streams = { ...current.streams };
  if (body.streams && typeof body.streams === 'object') {
    for (const s of STREAMS) {
      if (s in body.streams) streams[s] = Boolean(body.streams[s]);
    }
  }

  const quiet = body.quietHours === null
    ? null
    : body.quietHours
      ? { from: clampHour(body.quietHours.from, 21), to: clampHour(body.quietHours.to, 7) }
      : current.quietHours;

  const next: Partial<TelegramSettings> = {
    enabled: body.enabled === undefined ? current.enabled : Boolean(body.enabled),
    chatId: body.chatId === undefined ? current.chatId : String(body.chatId).trim(),
    streams,
    thresholds: {
      labelOverdueHours: Math.max(1, Number(body.thresholds?.labelOverdueHours) || current.thresholds.labelOverdueHours),
      dueSoonHours: Math.max(1, Number(body.thresholds?.dueSoonHours) || current.thresholds.dueSoonHours),
    },
    bigSaleMinimum: body.bigSaleMinimum === undefined
      ? current.bigSaleMinimum
      : Math.max(0, Number(body.bigSaleMinimum) || 0),
    quietHours: quiet,
    pollMinutes: Math.min(120, Math.max(1, Number(body.pollMinutes) || current.pollMinutes)),
    messageSenders: Array.isArray(body.messageSenders)
      ? body.messageSenders.map((s: unknown) => String(s).trim().toLowerCase()).filter(Boolean)
      : current.messageSenders,
  };

  const saved = setSettings(next);

  // Reflect the on/off switch immediately rather than at the next boot.
  if (saved.enabled) { stopScheduler(); startScheduler(); }
  else stopScheduler();

  return NextResponse.json({ settings: saved, schedulerRunning: schedulerRunning() });
}
