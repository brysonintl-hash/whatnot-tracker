'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Host = { name: string; tierRate: number };

// ── helpers ─────────────────────────────────────────────────────────────────

function roundHours(totalMin: number) {
  return Math.round(totalMin / 60);
}

function parseShiftHours(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  const min = (outH * 60 + outM) - (inH * 60 + inM);
  return min > 0 ? roundHours(min) : 0;
}

function parseLsHours(raw: string): number {
  if (!raw.trim()) return 0;
  if (raw.includes(':')) {
    const [h, m] = raw.split(':').map(Number);
    return roundHours(h * 60 + (m || 0));
  }
  return roundHours((parseFloat(raw) || 0) * 60);
}

function fmtTime12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type CalcResult = {
  shiftHours: number;
  lsHours: number;
  nonLsHours: number;
  nonStreamPay: number;
  streamPay: number;
  total: number;
};

function calcRow(row: Row): CalcResult {
  const shiftHours = parseShiftHours(row.timeIn, row.timeOut);
  const lsHours = Math.min(parseLsHours(row.lsInput), shiftHours);
  const nonLsHours = Math.max(shiftHours - lsHours, 0);
  const nonStreamPay = nonLsHours * 20;
  const streamPay = lsHours * (row.tierRate || 20);
  const total = nonStreamPay + streamPay + (row.tip || 0);
  return { shiftHours, lsHours, nonLsHours, nonStreamPay, streamPay, total };
}

// ── types ────────────────────────────────────────────────────────────────────

type Row = {
  id: string;
  date: string;
  hostName: string;
  timeIn: string;
  timeOut: string;
  lsInput: string;
  tierRate: number;
  tip: number;
  scheduleHosts: Host[];
  loadingSchedule: boolean;
};

function newRow(defaults?: Partial<Row>): Row {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date().toISOString().split('T')[0],
    hostName: '',
    timeIn: '09:00',
    timeOut: '15:00',
    lsInput: '',
    tierRate: 20,
    tip: 0,
    scheduleHosts: [],
    loadingSchedule: false,
    ...defaults,
  };
}

// ── component ────────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [allHosts, setAllHosts] = useState<Host[]>([]);
  const [tiers, setTiers] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [results, setResults] = useState<{ row: Row; calc: CalcResult }[] | null>(null);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    Promise.all([
      fetch('/api/hosts').then(r => r.json()),
      fetch('/api/calculator/tiers').then(r => r.json()),
    ]).then(([hosts, tierMap]: [{ name: string }[], Record<string, number>]) => {
      setTiers(tierMap);
      setAllHosts(hosts.map(h => ({ name: h.name, tierRate: tierMap[h.name] ?? 20 })));
    });
  }, []);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  async function onDateChange(id: string, date: string) {
    updateRow(id, { date, loadingSchedule: true, scheduleHosts: [] });
    try {
      const res = await fetch(`/api/calculator/schedule?date=${date}`);
      const data: { hosts: Host[] } = await res.json();
      const scheduleHosts = data.hosts ?? [];
      updateRow(id, { loadingSchedule: false, scheduleHosts });
      if (scheduleHosts.length === 1) {
        const h = scheduleHosts[0];
        updateRow(id, { hostName: h.name, tierRate: tiers[h.name] ?? h.tierRate });
      }
    } catch {
      updateRow(id, { loadingSchedule: false });
    }
  }

  function onHostChange(id: string, hostName: string) {
    const tier = tiers[hostName] ?? allHosts.find(h => h.name === hostName)?.tierRate ?? 20;
    updateRow(id, { hostName, tierRate: tier });
  }

  async function onTierBlur(hostName: string, tierRate: number) {
    if (!hostName) return;
    await fetch('/api/calculator/tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName, tierRate }),
    });
    setTiers(prev => ({ ...prev, [hostName]: tierRate }));
    setAllHosts(prev => prev.map(h => h.name === hostName ? { ...h, tierRate } : h));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, newRow({
      date: last.date,
      hostName: last.hostName,
      tierRate: last.tierRate,
      scheduleHosts: last.scheduleHosts,
    })]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.length === 1 ? prev : prev.filter(r => r.id !== id));
  }

  function calculate() {
    const computed = rows
      .filter(r => r.timeIn && r.timeOut)
      .map(r => ({ row: r, calc: calcRow(r) }));
    setResults(computed);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function copyText() {
    if (!results) return;
    const lines = results.map(({ row, calc }) => {
      const date = fmtDateShort(row.date);
      const shift = `${fmtTime12(row.timeIn)}-${fmtTime12(row.timeOut)}`;
      const stream = calc.lsHours > 0 ? `streamed ${calc.lsHours}h` : 'no stream';
      const tip = row.tip > 0 ? ` (${fmtMoney(row.tip)} tip)` : '';
      return `${date}: ${row.hostName}: ${shift}: ${stream}${tip} → ${fmtMoney(calc.total)}`;
    });
    const grandTotal = results.reduce((s, r) => s + r.calc.total, 0);
    lines.push(`Total: ${fmtMoney(grandTotal)}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function hostOptions(row: Row): { name: string; inSchedule: boolean }[] {
    const seen = new Set<string>();
    const opts: { name: string; inSchedule: boolean }[] = [];
    for (const h of row.scheduleHosts) {
      if (!seen.has(h.name)) { seen.add(h.name); opts.push({ name: h.name, inSchedule: true }); }
    }
    for (const h of allHosts) {
      if (!seen.has(h.name)) { seen.add(h.name); opts.push({ name: h.name, inSchedule: false }); }
    }
    return opts;
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const grandTotal = results?.reduce((s, r) => s + r.calc.total, 0) ?? 0;
  const byHost: Record<string, number> = {};
  results?.forEach(({ row, calc }) => {
    byHost[row.hostName] = (byHost[row.hostName] ?? 0) + calc.total;
  });

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 flex-shrink-0">
          <h1 className="text-lg font-black text-white">Pay Calculator</h1>
          <span className="ml-3 text-slate-500 text-sm">Host salary breakdown</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ── Input table ─────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-base font-black text-slate-900 dark:text-white">Enter Shifts</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pick a date — hosts who clocked in that day appear first. Tier rate saves automatically per host.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                      {['Date', 'Host', 'Time In', 'Time Out', 'Stream Hrs', 'Tier $/hr', 'Tip', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rows.map(row => {
                      const shiftH = parseShiftHours(row.timeIn, row.timeOut);
                      const opts = hostOptions(row);
                      const scheduleNames = new Set(row.scheduleHosts.map(h => h.name));
                      return (
                        <tr key={row.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                          {/* Date */}
                          <td className="px-3 py-2.5">
                            <input type="date" value={row.date}
                              onChange={e => onDateChange(row.id, e.target.value)}
                              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent w-[148px]" />
                          </td>

                          {/* Host */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <select value={row.hostName}
                                onChange={e => onHostChange(row.id, e.target.value)}
                                className="appearance-none pl-3 pr-7 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[130px]">
                                <option value="">{row.loadingSchedule ? 'Loading…' : 'Select host'}</option>
                                {scheduleNames.size > 0 && (
                                  <optgroup label="Worked this day">
                                    {opts.filter(o => o.inSchedule).map(o => (
                                      <option key={o.name} value={o.name}>{o.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label={scheduleNames.size > 0 ? 'All hosts' : 'All hosts'}>
                                  {opts.filter(o => !o.inSchedule).map(o => (
                                    <option key={o.name} value={o.name}>{o.name}</option>
                                  ))}
                                </optgroup>
                              </select>
                              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                            </div>
                            {row.hostName && scheduleNames.has(row.hostName) && (
                              <div className="text-[10px] text-amber-500 font-semibold mt-0.5 ml-1">✓ clocked in</div>
                            )}
                          </td>

                          {/* Time In */}
                          <td className="px-3 py-2.5">
                            <input type="time" value={row.timeIn}
                              onChange={e => updateRow(row.id, { timeIn: e.target.value })}
                              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[108px]" />
                          </td>

                          {/* Time Out */}
                          <td className="px-3 py-2.5">
                            <input type="time" value={row.timeOut}
                              onChange={e => updateRow(row.id, { timeOut: e.target.value })}
                              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[108px]" />
                            {shiftH > 0 && (
                              <div className="text-[10px] text-slate-400 mt-0.5 text-center">{shiftH}h shift</div>
                            )}
                          </td>

                          {/* Stream hours */}
                          <td className="px-3 py-2.5">
                            <input type="text" value={row.lsInput}
                              onChange={e => updateRow(row.id, { lsInput: e.target.value })}
                              placeholder="e.g. 3 or 1:30"
                              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[100px]" />
                          </td>

                          {/* Tier rate */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                              <input type="number" min={0} step={1} value={row.tierRate}
                                onChange={e => updateRow(row.id, { tierRate: parseFloat(e.target.value) || 20 })}
                                onBlur={() => onTierBlur(row.hostName, row.tierRate)}
                                className="pl-5 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[80px]" />
                            </div>
                          </td>

                          {/* Tip */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                              <input type="number" min={0} step={0.01} value={row.tip || ''}
                                onChange={e => updateRow(row.id, { tip: parseFloat(e.target.value) || 0 })}
                                placeholder="0"
                                className="pl-5 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[80px]" />
                            </div>
                          </td>

                          {/* Remove */}
                          <td className="px-2 py-2.5">
                            <button onClick={() => removeRow(row.id)}
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4 flex-wrap">
                <button onClick={addRow}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors border border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Add Row
                </button>
                <button onClick={calculate}
                  className="flex items-center gap-2 px-7 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm rounded-xl transition-colors shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01"/></svg>
                  Calculate Pay
                </button>
              </div>
            </div>

            {/* ── Results ──────────────────────────────────────────────── */}
            {results && (
              <div ref={resultsRef} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Pay Summary</h2>
                  <button onClick={copyText}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${copied ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {copied
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>}
                    </svg>
                    {copied ? 'Copied!' : 'Copy as text'}
                  </button>
                </div>

                {/* Compact line-per-shift output (image 1 style but cleaner) */}
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {results.map(({ row, calc }) => (
                    <div key={row.id} className="px-6 py-3.5 flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-black text-slate-900 dark:text-white w-12 flex-shrink-0 font-mono">
                        {fmtDateShort(row.date)}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600 mx-1 text-xs">·</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-[88px] flex-shrink-0">
                        {row.hostName || '(no host)'}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600 mx-1 text-xs">·</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                        {fmtTime12(row.timeIn)}–{fmtTime12(row.timeOut)}
                      </span>
                      <span className="text-[11px] text-slate-400 ml-1">({calc.shiftHours}h)</span>
                      <span className="text-slate-300 dark:text-slate-600 mx-1 text-xs">·</span>
                      {calc.lsHours > 0 ? (
                        <span className="text-sm whitespace-nowrap">
                          <span className="font-semibold text-amber-600 dark:text-amber-400">streamed {calc.lsHours}h</span>
                          <span className="text-slate-400 text-xs ml-1">@ ${row.tierRate}/hr</span>
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">no stream</span>
                      )}
                      {row.tip > 0 && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600 mx-1 text-xs">·</span>
                          <span className="text-sm text-slate-500">{fmtMoney(row.tip)} tip</span>
                        </>
                      )}
                      <span className="ml-auto flex items-center gap-2 flex-shrink-0 pl-4">
                        <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                        <span className="text-lg font-black text-amber-600 dark:text-amber-400">{fmtMoney(calc.total)}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* Breakdown (compact, below the lines) */}
                <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 space-y-1">
                  {results.map(({ row, calc }) => (
                    <div key={row.id} className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-slate-500 dark:text-slate-400 w-[88px] flex-shrink-0">
                        {fmtDateShort(row.date)} {row.hostName}
                      </span>
                      {calc.nonLsHours > 0 && <span>{calc.nonLsHours}h × $20 = {fmtMoney(calc.nonStreamPay)}</span>}
                      {calc.lsHours > 0 && <span>{calc.lsHours}h × ${row.tierRate} = {fmtMoney(calc.streamPay)}</span>}
                      {row.tip > 0 && <span>+ {fmtMoney(row.tip)} tip</span>}
                    </div>
                  ))}
                </div>

                {/* Grand total + per-host */}
                <div className="px-6 py-5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-6 flex-wrap">
                    {Object.entries(byHost).map(([name, pay]) => (
                      <div key={name}>
                        <p className="text-xs text-slate-500 font-semibold">{name}</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white">{fmtMoney(pay)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Total Pay</p>
                    <p className="text-3xl font-black text-amber-600 dark:text-amber-400">{fmtMoney(grandTotal)}</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
