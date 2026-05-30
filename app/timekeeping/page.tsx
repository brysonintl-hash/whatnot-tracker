'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Entry = { id: string; userId: string; username: string; name: string; role: string; clockIn: string; clockOut: string | null; note: string; date: string };
type Rate = { userId: string; username: string; name: string; ratePerHour: number };

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

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
  return { mon, sun };
}

// ─── Admin / Manager View ───────────────────────────────────────────────────

function ManagementView({ session }: { session: Session }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    Promise.all([
      fetch('/api/timekeeping').then(r => r.json()),
      fetch('/api/timekeeping/rates').then(r => r.json()),
    ]).then(([e, r]) => {
      setEntries(Array.isArray(e) ? e : []);
      const ratesArr = Array.isArray(r) ? r : [];
      setRates(ratesArr);
      const inputs: Record<string, string> = {};
      ratesArr.forEach((rt: Rate) => { inputs[rt.userId] = rt.ratePerHour.toString(); });
      setRateInputs(inputs);
      setLoading(false);
    });
  }, []);

  const { mon, sun } = getWeekRange();

  const weekEntries = useMemo(() =>
    entries.filter(e => {
      const d = new Date(e.clockIn);
      return d >= mon && d <= sun;
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
                  { label: 'Staff Tracked', value: staffSummary.length.toString(), color: 'border-l-violet-400' },
                  { label: 'Total Entries', value: weekEntries.length.toString(), color: 'border-l-amber-400' },
                ].map(k => (
                  <div key={k.label} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${k.color} shadow-sm p-5`}>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                    <p className="text-2xl font-black text-slate-900">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Staff Summary */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">Weekly Staff Summary</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{mon.toLocaleDateString()} – {sun.toLocaleDateString()}</p>
                </div>
                {staffSummary.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">No time entries this week</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-slate-100">
                        {['Name', 'Role', 'Total Hours', 'Rate / hr', 'Total Pay'].map(h => (
                          <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {staffSummary.map(m => {
                          const rate = rates.find(r => r.userId === m.userId)?.ratePerHour ?? 0;
                          const pay = m.totalHours * rate;
                          return (
                            <tr key={m.userId} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600">{m.name[0]}</div>
                                  <span className="text-xs font-semibold text-slate-700">{m.name}</span>
                                </div>
                              </td>
                              <td className="py-3 px-5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{m.role}</span></td>
                              <td className="py-3 px-5 text-xs font-bold text-slate-900">{fmtHours(m.totalHours)}</td>
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
                                    className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                  />
                                  <span className="text-xs text-slate-400">/hr</span>
                                </div>
                              </td>
                              <td className="py-3 px-5 text-xs font-black text-emerald-600">${pay.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Detailed time log */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">Time Log — This Week</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100">
                      {['Date', 'Name', 'Role', 'Clock In', 'Clock Out', 'Hours', 'Note'].map(h => (
                        <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {weekEntries.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-sm">No entries this week</td></tr>
                      ) : (
                        [...weekEntries].reverse().map(e => (
                          <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-3 px-4 text-xs text-slate-400">{e.date}</td>
                            <td className="py-3 px-4 text-xs font-semibold text-slate-700">{e.name}</td>
                            <td className="py-3 px-4"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">{e.role}</span></td>
                            <td className="py-3 px-4 text-xs text-slate-700">{fmtTime(e.clockIn)}</td>
                            <td className="py-3 px-4 text-xs text-slate-700">{e.clockOut ? fmtTime(e.clockOut) : <span className="text-emerald-500 font-bold">● Active</span>}</td>
                            <td className="py-3 px-4 text-xs font-bold text-slate-900">{e.clockOut ? fmtHours(hoursFromEntry(e)) : '—'}</td>
                            <td className="py-3 px-4 text-xs text-slate-500 max-w-[160px] truncate">{e.note || '—'}</td>
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

  const { mon, sun } = getWeekRange();
  const weekEntries = entries.filter(e => {
    const d = new Date(e.clockIn);
    return d >= mon && d <= sun;
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
                <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
                  <div className="text-4xl font-black font-mono text-slate-900 mb-1">
                    {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <p className="text-slate-400 text-xs mb-6">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${active ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <svg className={`w-9 h-9 ${active ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  <p className="font-bold text-slate-700 text-sm mb-1">{active ? 'Currently Clocked In' : 'Not Clocked In'}</p>
                  {active && <p className="text-xs text-slate-400 mb-4">Since {fmtTime(active.clockIn)}</p>}

                  {active && (
                    <div className="w-full mb-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 text-left">Note (optional)</label>
                      <input
                        type="text"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="e.g. Overtime, Early leave..."
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                    { label: 'Today\'s Entries', value: entries.filter(e => e.date === new Date().toLocaleDateString('en-US')).length.toString(), color: 'text-amber-600', border: 'border-l-amber-400' },
                  ].map(k => (
                    <div key={k.label} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${k.border} shadow-sm p-5`}>
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                      <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* My time log */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">My Time Log — This Week</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100">
                      {['Date', 'Clock In', 'Clock Out', 'Hours', 'Note'].map(h => (
                        <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {weekEntries.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-sm">No entries this week</td></tr>
                      ) : (
                        [...weekEntries].reverse().map(e => (
                          <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-3 px-5 text-xs text-slate-400">{e.date}</td>
                            <td className="py-3 px-5 text-xs font-semibold text-slate-700">{fmtTime(e.clockIn)}</td>
                            <td className="py-3 px-5 text-xs text-slate-700">{e.clockOut ? fmtTime(e.clockOut) : <span className="text-emerald-500 font-bold">● Active</span>}</td>
                            <td className="py-3 px-5 text-xs font-bold text-slate-900">{e.clockOut ? fmtHours(hoursFromEntry(e)) : '—'}</td>
                            <td className="py-3 px-5 text-xs text-slate-500">{e.note || '—'}</td>
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
