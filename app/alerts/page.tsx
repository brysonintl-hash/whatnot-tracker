'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import type { TelegramSettings, RunRecord } from '@/lib/telegram/store';
import type { AlertStream } from '@/lib/telegram/alerts';

type Session = { username: string; role: Role; name: string };
type ChatCandidate = { id: string; title: string; type: string };

type Status = {
  tokenConfigured: boolean;
  bot: { username: string } | null;
  botError?: string;
  settings: TelegramSettings;
  schedulerRunning: boolean;
  runs: RunRecord[];
  gmailConfigured: boolean;
};

const STREAM_COPY: Record<AlertStream, { label: string; help: string }> = {
  fulfillment: {
    label: 'Fulfillment problems',
    help: 'Parcels past their drop-off deadline, orders with no label after a few hours, and anything Whatnot itself has flagged as needing action.',
  },
  milestones: {
    label: 'Shows & big sales',
    help: 'A summary when a show ends — sales, sales per hour, orders, AOV, payout and giveaway cost — plus single orders over your threshold.',
  },
  support: {
    label: 'Support mail',
    help: 'New threads from the Whatnot support addresses already configured on the Gmail Support page.',
  },
  messages: {
    label: 'Buyer messages',
    help: 'Whatnot has no messages API, so this relays Whatnot’s own notification emails. Add the sender address below once you know what it is.',
  },
};

const card = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm';
const INPUT = 'text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400';
const BTN = 'px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50';
const BTN_PRIMARY = `${BTN} bg-red-500 border-red-500 text-white hover:bg-red-600`;
const BTN_PLAIN = `${BTN} bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400`;

export default function AlertsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<TelegramSettings | null>(null);
  const [chats, setChats] = useState<ChatCandidate[] | null>(null);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then((s: Session | null) => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(() => {
    if (!session) return;
    fetch('/api/telegram', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: Status & { error?: string }) => {
        if (d.error) { setMsg(d.error); return; }
        setStatus(d);
        setDraft(d.settings);
      })
      .catch(e => setMsg(e.message));
  }, [session]);

  useEffect(load, [load]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setMsg(''); setPreview('');
    try {
      const r = await fetch('/api/telegram', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      setBusy('');
      if (d.error) { setMsg(d.error); return null; }
      return d;
    } catch (e) {
      setBusy(''); setMsg((e as Error).message); return null;
    }
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const s = draft;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white">Telegram Alerts</h1>
            <p className="text-xs text-slate-400 hidden sm:block truncate">
              Fulfillment problems, show results and support mail, pushed to your team group
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${status.settings.enabled && status.schedulerRunning
                ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {status.settings.enabled ? (status.schedulerRunning ? 'Running' : 'On, idle') : 'Off'}
              </span>
            )}
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {msg && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">{msg}</p>
            </div>
          )}

          {!status || !s ? (
            <div className="text-center py-16 text-sm text-slate-400">Loading…</div>
          ) : (
            <>
              {/* ── 1. Bot ────────────────────────────────────────────── */}
              <div className={`${card} p-4 space-y-3`}>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">1 · The bot</h2>
                  {!status.tokenConfigured ? (
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed space-y-1">
                      <p className="font-bold text-amber-700 dark:text-amber-400">TELEGRAM_BOT_TOKEN is not set on this server.</p>
                      <p>In Telegram, message <span className="font-mono">@BotFather</span>, send <span className="font-mono">/newbot</span>, and follow the two prompts. It replies with a token.</p>
                      <p>Add that token in Railway under the service&apos;s Variables tab as <span className="font-mono">TELEGRAM_BOT_TOKEN</span>, then redeploy and come back here.</p>
                    </div>
                  ) : status.botError ? (
                    <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                      The token is set but Telegram rejected it: {status.botError}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                      Connected as <span className="font-mono">@{status.bot?.username}</span>.
                    </p>
                  )}
                </div>
              </div>

              {/* ── 2. Chat ───────────────────────────────────────────── */}
              <div className={`${card} p-4 space-y-3`}>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">2 · The group</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Add the bot to your team group, send any message in there, then press Find my groups.
                    Telegram only reports chats from the last 24 hours, so send the message first.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button disabled={!status.tokenConfigured || !!busy} className={BTN_PLAIN}
                    onClick={async () => {
                      const d = await post({ action: 'discover' }, 'discover');
                      if (d) { setChats(d.chats); if (!d.chats.length) setMsg('No chats seen yet — send a message in the group, then try again.'); }
                    }}>
                    {busy === 'discover' ? 'Looking…' : 'Find my groups'}
                  </button>
                  <input value={s.chatId} onChange={e => setDraft({ ...s, chatId: e.target.value })}
                    placeholder="Chat ID" className={`${INPUT} w-56 font-mono`} />
                  <button disabled={!s.chatId || !!busy} className={BTN_PLAIN}
                    onClick={async () => {
                      await post({ chatId: s.chatId }, 'savechat');
                      const d = await post({ action: 'test' }, 'test');
                      if (d) setMsg('Sent — check the group.');
                      load();
                    }}>
                    {busy === 'test' ? 'Sending…' : 'Send a test message'}
                  </button>
                </div>
                {chats && chats.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {chats.map(c => (
                      <button key={c.id} onClick={() => setDraft({ ...s, chatId: c.id })}
                        className={`${BTN} ${s.chatId === c.id
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}>
                        {c.title} <span className="font-mono opacity-60">{c.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── 3. Streams ────────────────────────────────────────── */}
              <div className={`${card} p-4 space-y-3`}>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">3 · What gets sent</h2>
                <div className="space-y-2">
                  {(Object.keys(STREAM_COPY) as AlertStream[]).map(k => (
                    <label key={k} className="flex gap-3 items-start cursor-pointer">
                      <input type="checkbox" checked={s.streams[k]}
                        onChange={e => setDraft({ ...s, streams: { ...s.streams, [k]: e.target.checked } })}
                        className="mt-0.5 accent-red-500 w-4 h-4 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{STREAM_COPY[k].label}</span>
                        <span className="block text-[11px] text-slate-400 leading-relaxed">{STREAM_COPY[k].help}</span>
                        {k === 'support' && !status.gmailConfigured && (
                          <span className="block text-[11px] text-amber-600 dark:text-amber-400">Gmail is not configured on this server, so nothing will come through.</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>

                {s.streams.messages && (
                  <div className="pl-7">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Notification senders to relay
                    </label>
                    <input
                      value={s.messageSenders.join(', ')}
                      onChange={e => setDraft({ ...s, messageSenders: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })}
                      placeholder="e.g. noreply@whatnot.com, notifications@whatnot.com"
                      className={`${INPUT} w-full mt-1`} />
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Find a Whatnot message notification in Gmail and copy the exact From address. Leave blank
                      and nothing is relayed.
                    </p>
                  </div>
                )}
              </div>

              {/* ── 4. Tuning ─────────────────────────────────────────── */}
              <div className={`${card} p-4 space-y-3`}>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">4 · Tuning</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    An alert that fires every day stops being read. Each problem is announced once, not once per check.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    No label after (hrs)
                    <input type="number" min={1} value={s.thresholds.labelOverdueHours}
                      onChange={e => setDraft({ ...s, thresholds: { ...s.thresholds, labelOverdueHours: Number(e.target.value) } })}
                      className={`${INPUT} w-full mt-1`} />
                  </label>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Warn before due (hrs)
                    <input type="number" min={1} value={s.thresholds.dueSoonHours}
                      onChange={e => setDraft({ ...s, thresholds: { ...s.thresholds, dueSoonHours: Number(e.target.value) } })}
                      className={`${INPUT} w-full mt-1`} />
                  </label>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Big sale over ($)
                    <input type="number" min={0} value={s.bigSaleMinimum}
                      onChange={e => setDraft({ ...s, bigSaleMinimum: Number(e.target.value) })}
                      className={`${INPUT} w-full mt-1`} />
                  </label>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Check every (min)
                    <input type="number" min={1} max={120} value={s.pollMinutes}
                      onChange={e => setDraft({ ...s, pollMinutes: Number(e.target.value) })}
                      className={`${INPUT} w-full mt-1`} />
                  </label>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Quiet hours
                    <div className="flex gap-1 items-center mt-1">
                      <input type="number" min={0} max={23} disabled={!s.quietHours}
                        value={s.quietHours?.from ?? 21}
                        onChange={e => setDraft({ ...s, quietHours: { from: Number(e.target.value), to: s.quietHours?.to ?? 7 } })}
                        className={`${INPUT} w-14`} />
                      <span className="text-slate-400 text-xs">to</span>
                      <input type="number" min={0} max={23} disabled={!s.quietHours}
                        value={s.quietHours?.to ?? 7}
                        onChange={e => setDraft({ ...s, quietHours: { from: s.quietHours?.from ?? 21, to: Number(e.target.value) } })}
                        className={`${INPUT} w-14`} />
                    </div>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={s.quietHours === null}
                    onChange={e => setDraft({ ...s, quietHours: e.target.checked ? null : { from: 21, to: 7 } })}
                    className="accent-red-500" />
                  Send at any hour (no quiet period). Held alerts are never dropped — they go out when quiet hours end.
                </label>
              </div>

              {/* ── 5. Switch on ──────────────────────────────────────── */}
              <div className={`${card} p-4 space-y-3`}>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">5 · Switch it on</h2>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={s.enabled}
                    onChange={e => setDraft({ ...s, enabled: e.target.checked })}
                    className="accent-red-500 w-4 h-4" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Check automatically every {s.pollMinutes} minutes
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <button disabled={!!busy} className={BTN_PRIMARY}
                    onClick={async () => {
                      const d = await post({ ...s }, 'save');
                      if (d) { setMsg('Saved.'); load(); }
                    }}>
                    {busy === 'save' ? 'Saving…' : 'Save settings'}
                  </button>
                  <button disabled={!!busy} className={BTN_PLAIN}
                    onClick={async () => {
                      const d = await post({ action: 'preview' }, 'preview');
                      if (d) {
                        setPreview(d.preview || '');
                        setMsg(d.preview
                          ? `${d.found} alerts found (${d.suppressed} already sent before).`
                          : `Nothing to send right now — ${d.found} found, ${d.suppressed} already sent.`);
                      }
                    }}>
                    {busy === 'preview' ? 'Checking…' : 'Preview without sending'}
                  </button>
                  <button disabled={!!busy || !s.enabled} className={BTN_PLAIN}
                    onClick={async () => {
                      const d = await post({ action: 'run' }, 'run');
                      if (d) { setMsg(`Sent ${d.sent}, held ${d.held}, already-seen ${d.suppressed}.`); load(); }
                    }}>
                    {busy === 'run' ? 'Running…' : 'Check and send now'}
                  </button>
                </div>

                {preview && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                      What would be posted
                    </p>
                    <pre className="text-[11px] whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-700 dark:text-slate-300 max-h-80 overflow-y-auto">
                      {preview.replace(/<[^>]+>/g, '')}
                    </pre>
                  </div>
                )}
              </div>

              {/* ── Recent runs ───────────────────────────────────────── */}
              {status.runs.length > 0 && (
                <div className={`${card} overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent checks</h2>
                  </div>
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-900/40">
                      <tr>
                        <th className="py-2 px-3 text-left text-[10px] font-bold uppercase text-slate-400">When</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase text-slate-400">Found</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase text-slate-400">Sent</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase text-slate-400">Held</th>
                        <th className="py-2 px-3 text-right text-[10px] font-bold uppercase text-slate-400">Seen before</th>
                        <th className="py-2 px-3 text-left text-[10px] font-bold uppercase text-slate-400">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {status.runs.map((r, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(r.at).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-xs text-right tabular-nums">{r.found}</td>
                          <td className="py-2 px-3 text-xs text-right tabular-nums font-bold">{r.sent}</td>
                          <td className="py-2 px-3 text-xs text-right tabular-nums">{r.held}</td>
                          <td className="py-2 px-3 text-xs text-right tabular-nums text-slate-400">{r.suppressed}</td>
                          <td className={`py-2 px-3 text-xs ${r.error ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                            {r.error ?? r.note ?? ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
