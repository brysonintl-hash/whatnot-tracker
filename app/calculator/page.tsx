'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type LogEntry = {
  id: string;
  date: string;
  hostName: string;
  timeIn: string;
  timeOut: string;
  shiftHours: number;        // rounded
  livestreamHours: number;   // rounded
  tierRate: number;
  tip: number;
  nonStreamPay: number;
  streamPay: number;
  totalPay: number;
};

function roundHours(h: number): number {
  // round to nearest hour (>=30min rounds up)
  return Math.round(h);
}

function calcShiftHours(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  const totalMin = (outH * 60 + outM) - (inH * 60 + inM);
  if (totalMin <= 0) return 0;
  return roundHours(totalMin / 60);
}

function fmtTime12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TIER_PRESETS = [20, 25, 30, 35, 40];

export default function CalculatorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  // Form state
  const [date, setDate]             = useState(() => new Date().toISOString().split('T')[0]);
  const [hostName, setHostName]     = useState('');
  const [timeIn, setTimeIn]         = useState('09:00');
  const [timeOut, setTimeOut]       = useState('15:00');
  const [lsInput, setLsInput]       = useState(''); // livestream hours raw input
  const [tierRate, setTierRate]     = useState(20);
  const [tip, setTip]               = useState(0);
  const [log, setLog]               = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
      if (s.role === 'host') setHostName(s.name);
    });
  }, []);

  // Parse livestream hours: accepts "1.5", "1:30", "2"
  function parseLsHours(raw: string): number {
    if (!raw.trim()) return 0;
    if (raw.includes(':')) {
      const [h, m] = raw.split(':').map(Number);
      return roundHours((h * 60 + (m || 0)) / 60);
    }
    return roundHours(parseFloat(raw) || 0);
  }

  const shiftHours    = calcShiftHours(timeIn, timeOut);
  const lsHours       = Math.min(parseLsHours(lsInput), shiftHours);
  const nonLsHours    = Math.max(shiftHours - lsHours, 0);
  const nonStreamPay  = nonLsHours * 20;
  const streamPay     = lsHours * tierRate;
  const totalPay      = nonStreamPay + streamPay + tip;

  const isValid = hostName.trim() && shiftHours > 0;

  function addToLog() {
    if (!isValid) return;
    const entry: LogEntry = {
      id: Date.now().toString(36),
      date, hostName: hostName.trim(), timeIn, timeOut,
      shiftHours, livestreamHours: lsHours,
      tierRate, tip, nonStreamPay, streamPay, totalPay,
    };
    setLog(prev => [entry, ...prev]);
  }

  function removeFromLog(id: string) {
    setLog(prev => prev.filter(e => e.id !== id));
  }

  const logTotalPay  = log.reduce((s, e) => s + e.totalPay, 0);
  const logTotalTips = log.reduce((s, e) => s + e.tip, 0);
  const logTotalHours = log.reduce((s, e) => s + e.shiftHours, 0);
  const logTotalLs   = log.reduce((s, e) => s + e.livestreamHours, 0);

  // Group log by host for summary
  const byHost = log.reduce<Record<string, { pay: number; hours: number; ls: number; tips: number }>>((acc, e) => {
    if (!acc[e.hostName]) acc[e.hostName] = { pay: 0, hours: 0, ls: 0, tips: 0 };
    acc[e.hostName].pay   += e.totalPay;
    acc[e.hostName].hours += e.shiftHours;
    acc[e.hostName].ls    += e.livestreamHours;
    acc[e.hostName].tips  += e.tip;
    return acc;
  }, {});

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 flex-shrink-0">
          <h1 className="text-lg font-black text-white">Pay Calculator</h1>
          <span className="ml-3 text-slate-500 text-sm">Host salary breakdown</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* Input card */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h2 className="text-base font-black text-slate-900 dark:text-white mb-5">Enter Show Details</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                {/* Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>

                {/* Host name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Host Name</label>
                  <input type="text" value={hostName} onChange={e => setHostName(e.target.value)} placeholder="e.g. Khloe"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>

                {/* Tip */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tip ($)</label>
                  <input type="number" min="0" step="0.01" value={tip || ''} onChange={e => setTip(parseFloat(e.target.value) || 0)} placeholder="0.00"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>

                {/* Time In */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Time In</label>
                  <input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                </div>

                {/* Time Out */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Time Out</label>
                  <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                  {shiftHours > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">{shiftHours} hr{shiftHours !== 1 ? 's' : ''} total shift (rounded)</p>
                  )}
                </div>

                {/* Livestream hours */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Livestream Hours</label>
                  <input type="text" value={lsInput} onChange={e => setLsInput(e.target.value)} placeholder='e.g. 3 or 1:30'
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent" />
                  {lsHours > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">{lsHours} hr{lsHours !== 1 ? 's' : ''} livestream (rounded)</p>
                  )}
                </div>

              </div>

              {/* Tier rate */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Livestream Tier Rate (per hour)</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {TIER_PRESETS.map(p => (
                    <button key={p} onClick={() => setTierRate(p)}
                      className={`px-4 py-2 rounded-xl text-sm font-black transition-colors border ${tierRate === p ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-amber-400'}`}>
                      ${p}/hr
                    </button>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">or</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <input type="number" min="0" step="1" value={TIER_PRESETS.includes(tierRate) ? '' : tierRate}
                        onChange={e => setTierRate(parseFloat(e.target.value) || 20)}
                        placeholder="custom"
                        className="pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-28" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Results card — live */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    {hostName || 'Host'} — {fmtDate(date)}
                  </h2>
                  {shiftHours > 0 && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtTime12(timeIn)} → {fmtTime12(timeOut)} · {shiftHours}h shift · {lsHours}h livestream
                    </p>
                  )}
                </div>
                <button onClick={addToLog} disabled={!isValid}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-black text-sm rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Add to Log
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {/* Non-livestream hours */}
                <div className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Non-Livestream Hours</p>
                    <p className="text-xs text-slate-400">{nonLsHours} hr{nonLsHours !== 1 ? 's' : ''} × $20.00/hr (base rate)</p>
                  </div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">${fmtMoney(nonStreamPay)}</p>
                </div>

                {/* Livestream hours */}
                <div className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Livestream Hours</p>
                    <p className="text-xs text-slate-400">{lsHours} hr{lsHours !== 1 ? 's' : ''} × ${tierRate}.00/hr (tier rate)</p>
                  </div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">${fmtMoney(streamPay)}</p>
                </div>

                {/* Tips */}
                <div className="flex items-center justify-between px-6 py-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tips</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">${fmtMoney(tip)}</p>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between px-6 py-4 bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-base font-black text-slate-900 dark:text-white">Total Pay</p>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-400">${fmtMoney(totalPay)}</p>
                </div>
              </div>
            </div>

            {/* Log */}
            {log.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Pay Log ({log.length} {log.length === 1 ? 'entry' : 'entries'})</h2>
                  <button onClick={() => setLog([])} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear all</button>
                </div>

                {/* Log table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-left">
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Date</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Host</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Shift</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Stream</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Rate</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Tips</th>
                        <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide">Total</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {log.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{e.hostName}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {fmtTime12(e.timeIn)}–{fmtTime12(e.timeOut)}
                            <span className="text-slate-400 ml-1">({e.shiftHours}h)</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{e.livestreamHours}h</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">${e.tierRate}/hr</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">${fmtMoney(e.tip)}</td>
                          <td className="px-4 py-3 font-black text-amber-600 dark:text-amber-400">${fmtMoney(e.totalPay)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => removeFromLog(e.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals row */}
                <div className="px-6 py-4 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Total Hours</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{logTotalHours}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Livestream Hours</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{logTotalLs}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Total Tips</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white">${fmtMoney(logTotalTips)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Total Pay</p>
                      <p className="text-2xl font-black text-amber-600 dark:text-amber-400">${fmtMoney(logTotalPay)}</p>
                    </div>
                  </div>
                </div>

                {/* Per-host summary */}
                {Object.keys(byHost).length > 1 && (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3">By Host</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(byHost).map(([name, data]) => (
                        <div key={name} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                          <p className="font-black text-slate-900 dark:text-white text-sm">{name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{data.hours}h shift · {data.ls}h stream · ${fmtMoney(data.tips)} tips</p>
                          <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">${fmtMoney(data.pay)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
