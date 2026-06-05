'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Entry = { id: string; userId: string; username: string; name: string; role: string; clockIn: string; clockOut: string | null; note: string; date: string };
type Rate = { userId: string; username: string; name: string; ratePerHour: number };
type Payment = { userId: string; weekStart: string; paid: boolean; paidAt: string };

function hoursFromEntry(e: Entry): number {
  if (!e.clockOut) return 0;
  return (new Date(e.clockOut).getTime() - new Date(e.clockIn).getTime()) / 3600000;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, '0')}m`;
}

// Week = Sunday 00:00 → Saturday 23:59
function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const sun = new Date(now);
  sun.setDate(now.getDate() - day);
  sun.setHours(0, 0, 0, 0);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  sat.setHours(23, 59, 59, 999);
  return { sun, sat };
}

function weekStartKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Admin / Manager View ───────────────────────────────────────────────────

function ManagementView({ session }: { session: Session }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [savingPay, setSavingPay] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const { sun, sat } = getWeekRange();
  const weekStart = weekStartKey(sun);

  useEffect(() => {
    Promise.all([
      fetch('/api/timekeeping').then(r => r.json()),
      fetch('/api/timekeeping/rates').then(r => r.json()),
      fetch(`/api/timekeeping/payments?weekStart=${weekStart}`).then(r => r.json()),
    ]).then(([e, r, p]) => {
      setEntries(Array.isArray(e) ? e : []);
      const ratesArr = Array.isArray(r) ? r : [];
      setRates(ratesArr);
      const inputs: Record<string, string> = {};
      ratesArr.forEach((rt: Rate) => { inputs[rt.userId] = rt.ratePerHour.toString(); });
      setRateInputs(inputs);
      setPayments(Array.isArray(p) ? p : []);
      setLoading(false);
    });
  }, [weekStart]);

  const weekEntries = useMemo(() =>
    entries.filter(e => {
      const d = new Date(e.clockIn);
      return d >= sun && d <= sat;
    }), [entries]);

  const staffSummary = useMemo(() => {
    const map: Record<string, { userId: string; name: string; role: string; username: string; totalHours: number; entries: Entry[] }> = {};
    weekEntries.forEach(e => {
      if (!map[e.userId]) map[e.userId] = { userId: e.userId, name: e.name, role: e.role, username: e.username, totalHours: 0, entries: [] };
      map[e.userId].totalHours += hoursFromEntry(e);
      map[e.userId].entries.push(e);
    });
    return Object.values(map);
  }, [weekEntries]);

  const totalHours = staffSummary.reduce((s, m) => s + m.totalHours, 0);
  const totalPay = staffSummary.reduce((s, m) => {
    const rate = rates.find(r => r.userId === m.userId)?.ratePerHour ?? 0;
    return s + m.totalHours * rate;
  }, 0);
  const paidTotal = staffSummary.reduce((s, m) => {
    const isPaid = payments.find(p => p.userId === m.userId)?.paid;
    if (!isPaid) return s;
    const rate = rates.find(r => r.userId === m.userId)?.ratePerHour ?? 0;
    return s + m.totalHours * rate;
  }, 0);

  async function saveRate(userId: string, username: string, name: string) {
    const rate = parseFloat(rateInputs[userId] || '0');
    if (isNaN(rate)) return;
    await fetch('/api/timekeeping/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, name, ratePerHour: rate }),
    });
    setRates(prev => {
      const idx = prev.findIndex(r => r.userId === userId);
      if (idx === -1) return [...prev, { userId, username, name, ratePerHour: rate }];
      return prev.map((r, i) => i === idx ? { ...r, ratePerHour: rate } : r);
    });
  }

  async function clearHistory(scope: 'week' | 'all') {
    const msg = scope === 'week'
      ? 'Clear all time entries for this week? This cannot be undone.'
      : 'Clear ALL time history? This will delete every entry permanently.';
    if (!confirm(msg)) return;
    setClearing(true);
    const params = scope === 'week'
      ? `scope=week&sun=${sun.toISOString()}&sat=${sat.toISOString()}`
      : 'scope=all';
    await fetch(`/api/timekeeping?${params}`, { method: 'DELETE' });
    setEntries(prev => scope === 'week'
      ? prev.filter(e => { const d = new Date(e.clockIn); return d < sun || d > sat; })
      : []);
    setClearing(false);
  }

  async function deleteTimeEntry(id: string) {
    setDeletingId(id);
    await fetch(`/api/timekeeping/${id}`, { method: 'DELETE' });
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeletingId(null);
  }

  async function togglePaid(userId: string) {
    setSavingPay(userId);
    const current = payments.find(p => p.userId === userId);
    const newPaid = !current?.paid;
    const res = await fetch('/api/timekeeping/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, weekStart, paid: newPaid }),
    });
    const data = await res.json();
    if (data.record) {
      setPayments(prev => {
        const idx = prev.findIndex(p => p.userId === userId);
        if (idx === -1) return [...prev, data.record];
        return prev.map((p, i) => i === idx ? data.record : p);
      });
    }
    setSavingPay(null);
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Timekeeping</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div> : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Hours This Week', value: fmtHours(totalHours), color: 'border-l-blue-400' },
                  { label: 'Total Payroll This Week', value: `$${totalPay.toFixed(2)}`, color: 'border-l-emerald-400' },
                  { label: 'Paid Out', value: `$${paidTotal.toFixed(2)}`, color: 'border-l-violet-400' },
                  { label: 'Remaining', value: `$${(totalPay - paidTotal).toFixed(2)}`, color: 'border-l-amber-400' },
                ].map(k => (
                  <div key={k.label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${k.color} shadow-sm p-5`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Staff Timekeeping Dashboard ── */}
              {staffSummary.length > 0 && (
                <div className="mb-6">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    Staff Dashboard
                    <span className="text-xs font-normal text-slate-400">{staffSummary.length} active this week</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {staffSummary.map(member => {
                      const rate = rates.find(r => r.userId === member.userId)?.ratePerHour ?? 0;
                      const weekEarnings = member.totalHours * rate;
                      const isPaid = payments.find(p => p.userId === member.userId)?.paid;
                      const isActive = member.entries.some(e => !e.clockOut);
                      const allEntries = entries.filter(e => e.userId === member.userId);
                      const totalAllTime = allEntries.reduce((s, e) => s + hoursFromEntry(e), 0);
                      const todayStr = new Date().toISOString().slice(0, 10);
                      const todayHours = member.entries
                        .filter(e => e.date === todayStr)
                        .reduce((s, e) => s + hoursFromEntry(e), 0);
                      const lastEntry = member.entries[member.entries.length - 1];
                      return (
                        <div key={member.userId} className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-4 ${isActive ? 'border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700'}`}>
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${member.role === 'host' ? 'bg-amber-500' : member.role === 'shipper' ? 'bg-violet-500' : 'bg-blue-500'}`}>
                              {member.name[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{member.name}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] capitalize text-slate-400">{member.role}</span>
                                {isActive && <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" /> Active</span>}
                                {!isActive && <span className="text-[10px] text-slate-400">Clocked out</span>}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs mb-3">
                            <div>
                              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Today</p>
                              <p className="font-bold text-slate-900 dark:text-white">{fmtHours(todayHours)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">This Week</p>
                              <p className="font-bold text-slate-900 dark:text-white">{fmtHours(member.totalHours)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">All Time</p>
                              <p className="font-semibold text-slate-700 dark:text-slate-300">{fmtHours(totalAllTime)}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Earnings</p>
                              <p className={`font-bold ${weekEarnings > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{rate > 0 ? `$${weekEarnings.toFixed(2)}` : '—'}</p>
                            </div>
                          </div>

                          {lastEntry && (
                            <p className="text-[10px] text-slate-400">
                              Last: {lastEntry.clockOut ? `Out ${fmtTime(lastEntry.clockOut)}` : `In since ${fmtTime(lastEntry.clockIn)}`}
                            </p>
                          )}

                          {isPaid && (
                            <span className="mt-2 inline-block text-[10px] font-bold px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full">Paid ✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Staff Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">Weekly Staff Summary</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {sun.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} –{' '}
                    {sat.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {staffSummary.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">No time entries this week</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Name', 'Role', 'Total Hours', 'Rate / hr', 'Total Pay', 'Payment'].map(h => (
                          <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {staffSummary.map(m => {
                          const rate = rates.find(r => r.userId === m.userId)?.ratePerHour ?? 0;
                          const pay = m.totalHours * rate;
                          const isPaid = payments.find(p => p.userId === m.userId)?.paid ?? false;
                          const paidAt = payments.find(p => p.userId === m.userId)?.paidAt;
                          return (
                            <tr key={m.userId} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-300">{m.name[0]}</div>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{m.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 capitalize">{m.role}</span></td>
                              <td className="py-3 px-5 text-xs font-bold text-slate-900 dark:text-white">{fmtHours(m.totalHours)}</td>
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-slate-400">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={rateInputs[m.userId] ?? rate.toString()}
                                    onChange={e => setRateInputs(prev => ({ ...prev, [m.userId]: e.target.value }))}
                                    onBlur={() => saveRate(m.userId, m.username, m.name)}
                                    className="w-20 text-xs border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                  />
                                  <span className="text-xs text-slate-400">/hr</span>
                                </div>
                              </td>
                              <td className="py-3 px-5 text-xs font-black text-emerald-600 dark:text-emerald-400">${pay.toFixed(2)}</td>
                              <td className="py-3 px-5">
                                {isPaid ? (
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      onClick={() => togglePaid(m.userId)}
                                      disabled={savingPay === m.userId}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                      Paid
                                    </button>
                                    {paidAt && <span className="text-[9px] text-slate-400 pl-1">{new Date(paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => togglePaid(m.userId)}
                                    disabled={savingPay === m.userId}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-[11px] font-bold hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors disabled:opacity-50"
                                  >
                                    {savingPay === m.userId ? 'Saving...' : 'Mark Paid'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Detailed time log */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-3">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">Time Log — This Week</h2>
                  <span className="text-xs text-slate-400">{weekEntries.length} entries</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => clearHistory('week')}
                      disabled={clearing || weekEntries.length === 0}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                    >
                      {clearing ? 'Clearing...' : 'Clear This Week'}
                    </button>
                    {session.role === 'admin' && (
                      <button
                        onClick={() => clearHistory('all')}
                        disabled={clearing}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        Clear All History
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                      {['Date', 'Name', 'Role', 'Clock In', 'Clock Out', 'Hours', 'Note', ''].map((h, i) => (
                        <th key={i} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {weekEntries.length === 0 ? (
                        <tr><td colSpan={8} className="py-8 text-center text-slate-400 text-sm">No entries this week</td></tr>
                      ) : (
                        [...weekEntries].reverse().map(e => (
                          <tr key={e.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 group">
                            <td className="py-3 px-4 text-xs text-slate-400">{e.date}</td>
                            <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">{e.name}</td>
                            <td className="py-3 px-4"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 capitalize">{e.role}</span></td>
                            <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{fmtTime(e.clockIn)}</td>
                            <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{e.clockOut ? fmtTime(e.clockOut) : <span className="text-emerald-500 font-bold">● Active</span>}</td>
                            <td className="py-3 px-4 text-xs font-bold text-slate-900 dark:text-white">{e.clockOut ? fmtHours(hoursFromEntry(e)) : '—'}</td>
                            <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">{e.note || '—'}</td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => deleteTimeEntry(e.id)}
                                disabled={deletingId === e.id}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30"
                                title="Delete entry"
                              >
                                {deletingId === e.id ? (
                                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                )}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Staff Clock-In / Out View ───────────────────────────────────────────────

function StaffView({ session }: { session: Session }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<Entry | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/timekeeping').then(r => r.json()).then(data => {
      const arr: Entry[] = Array.isArray(data) ? data : [];
      setEntries(arr);
      setActive(arr.find(e => !e.clockOut) ?? null);
      setLoading(false);
    });
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleClock() {
    setSaving(true);
    if (!active) {
      const res = await fetch('/api/timekeeping', { method: 'POST' });
      const data = await res.json();
      if (data.entry) { setActive(data.entry); setEntries(prev => [...prev, data.entry]); }
    } else {
      const res = await fetch(`/api/timekeeping/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (data.entry) {
        setActive(null);
        setNote('');
        setEntries(prev => prev.map(e => e.id === data.entry.id ? data.entry : e));
      }
    }
    setSaving(false);
  }

  const { sun, sat } = getWeekRange();
  const weekEntries = entries.filter(e => {
    const d = new Date(e.clockIn);
    return d >= sun && d <= sat;
  });
  const totalHours = weekEntries.reduce((s, e) => s + hoursFromEntry(e), 0);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Time Clock</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div> : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Clock card */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8 flex flex-col items-center text-center">
                  <div className="text-4xl font-black font-mono text-slate-900 dark:text-white mb-1">
                    {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <p className="text-slate-400 text-xs mb-6">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${active ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-700'}`}>
                    <svg className={`w-9 h-9 ${active ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  <p className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-1">{active ? 'Currently Clocked In' : 'Not Clocked In'}</p>
                  {active && <p className="text-xs text-slate-400 mb-4">Since {fmtTime(active.clockIn)}</p>}

                  {active && (
                    <div className="w-full mb-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 text-left">Note (optional)</label>
                      <input
                        type="text"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="e.g. Overtime, Early leave..."
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  )}

                  <button
                    onClick={handleClock}
                    disabled={saving}
                    className={`w-full py-4 rounded-xl font-black text-sm transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                    }`}
                  >
                    {saving ? 'Processing...' : active ? '⏹ Clock Out' : '▶ Clock In'}
                  </button>
                </div>

                {/* Stats */}
                <div className="lg:col-span-2 grid grid-cols-2 gap-4 content-start">
                  {[
                    { label: 'Hours This Week', value: fmtHours(totalHours), color: 'text-blue-600', border: 'border-l-blue-400' },
                    { label: 'Entries This Week', value: weekEntries.length.toString(), color: 'text-slate-900', border: 'border-l-slate-400' },
                    { label: 'Status', value: active ? 'Clocked In' : 'Clocked Out', color: active ? 'text-emerald-600' : 'text-slate-400', border: active ? 'border-l-emerald-400' : 'border-l-slate-300' },
                    { label: "Today's Entries", value: entries.filter(e => e.date === new Date().toLocaleDateString('en-US')).length.toString(), color: 'text-amber-600', border: 'border-l-amber-400' },
                  ].map(k => (
                    <div key={k.label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${k.border} shadow-sm p-5`}>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                      <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* My time log */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">My Time Log — This Week</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {sun.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} –{' '}
                    {sat.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                      {['Date', 'Clock In', 'Clock Out', 'Hours', 'Note'].map(h => (
                        <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {weekEntries.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-sm">No entries this week</td></tr>
                      ) : (
                        [...weekEntries].reverse().map(e => (
                          <tr key={e.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="py-3 px-5 text-xs text-slate-400">{e.date}</td>
                            <td className="py-3 px-5 text-xs font-semibold text-slate-700 dark:text-slate-300">{fmtTime(e.clockIn)}</td>
                            <td className="py-3 px-5 text-xs text-slate-700 dark:text-slate-300">{e.clockOut ? fmtTime(e.clockOut) : <span className="text-emerald-500 font-bold">● Active</span>}</td>
                            <td className="py-3 px-5 text-xs font-bold text-slate-900 dark:text-white">{e.clockOut ? fmtHours(hoursFromEntry(e)) : '—'}</td>
                            <td className="py-3 px-5 text-xs text-slate-500 dark:text-slate-400">{e.note || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TimekeepingPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  if (!session) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  if (session.role === 'admin' || session.role === 'manager') return <ManagementView session={session} />;
  return <StaffView session={session} />;
}
