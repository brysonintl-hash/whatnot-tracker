'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type ScheduleHost = { name: string; tierRate: number; profitPerHour: number | null };

// ── helpers ──────────────────────────────────────────────────────────────────

function parseShiftHours(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  const min = (outH * 60 + outM) - (inH * 60 + inM);
  return min > 0 ? min / 60 : 0;
}

function parseLsHours(raw: string): number {
  if (!raw.trim()) return 0;
  if (raw.includes(':')) { const [h, m] = raw.split(':').map(Number); return h + (m || 0) / 60; }
  return parseFloat(raw) || 0;
}

function fmtHrs(h: number): string {
  return `${parseFloat(h.toFixed(2))}h`;
}

function fmtTime12(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

// "YYYY-MM-DD" → "07/16"
function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

// "YYYY-MM-DD" → "Jul 16"
function fmtDateMed(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "YYYY-MM-DD" → "July 16, 2026"
function fmtDateLong(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type CalcResult = {
  shiftHours: number; lsHours: number; nonLsHours: number;
  nonStreamPay: number; streamPay: number; total: number;
};

function calcRow(row: Row): CalcResult {
  const shiftHours = parseShiftHours(row.timeIn, row.timeOut);
  const lsHours = Math.min(parseLsHours(row.lsInput), shiftHours);
  const nonLsHours = Math.max(shiftHours - lsHours, 0);
  const parsedBase = parseFloat(row.baseRate);
  const baseRateNum = !isNaN(parsedBase) && parsedBase > 0 ? parsedBase : 0;
  const nonStreamPay = nonLsHours * baseRateNum;
  const streamPay = lsHours * (row.tierRate || 0);
  const total = nonStreamPay + streamPay + (row.tip || 0);
  return { shiftHours, lsHours, nonLsHours, nonStreamPay, streamPay, total };
}

// ── custom date picker (MM / DD / YYYY) ────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEARS = [2025, 2026, 2027];

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const y = value ? +value.split('-')[0] : today.getFullYear();
  const m = value ? +value.split('-')[1] : today.getMonth() + 1;
  const d = value ? +value.split('-')[2] : today.getDate();
  const days = new Date(y, m, 0).getDate();

  function set(ny: number, nm: number, nd: number) {
    const maxD = new Date(ny, nm, 0).getDate();
    onChange(`${ny}-${String(nm).padStart(2,'0')}-${String(Math.min(nd, maxD)).padStart(2,'0')}`);
  }

  const sel = "appearance-none bg-transparent border-0 outline-none text-sm font-semibold text-slate-900 dark:text-white cursor-pointer focus:ring-0 p-0";

  return (
    <div className="flex items-center gap-0.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg">
      <select value={m} onChange={e => set(y, +e.target.value, d)} className={sel}>
        {MONTHS_SHORT.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
      </select>
      <span className="text-slate-300 text-sm mx-0.5">/</span>
      <select value={d} onChange={e => set(y, m, +e.target.value)} className={sel}>
        {Array.from({ length: days }, (_, i) => i + 1).map(day => (
          <option key={day} value={day}>{String(day).padStart(2,'0')}</option>
        ))}
      </select>
      <span className="text-slate-300 text-sm mx-0.5">/</span>
      <select value={y} onChange={e => set(+e.target.value, m, d)} className={sel}>
        {YEARS.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}

// ── custom 12h time picker ─────────────────────────────────────────────────

const HOURS = [1,2,3,4,5,6,7,8,9,10,11,12];
const MINUTES = [0,5,10,15,20,25,30,35,40,45,50,55];

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh, mm] = (value || '09:00').split(':').map(Number);
  const isPM = hh >= 12;
  const h12 = hh % 12 || 12;

  function set(newH12: number, newM: number, newIsPM: boolean) {
    let h24 = newH12 % 12;
    if (newIsPM) h24 += 12;
    onChange(`${String(h24).padStart(2,'0')}:${String(newM).padStart(2,'0')}`);
  }

  const sel = "appearance-none bg-transparent border-0 outline-none text-sm font-semibold text-slate-900 dark:text-white cursor-pointer focus:ring-0 p-0";

  return (
    <div className="flex items-center gap-0.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg">
      <select value={h12} onChange={e => set(+e.target.value, mm, isPM)} className={sel}>
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-slate-300 text-sm font-bold select-none">:</span>
      <select value={mm} onChange={e => set(h12, +e.target.value, isPM)} className={sel}>
        {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
      </select>
      <button type="button" onClick={() => set(h12, mm, !isPM)}
        className={`ml-1 text-[11px] font-black px-1.5 py-0.5 rounded transition-colors select-none ${
          isPM
            ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60'
            : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/60'
        }`}>
        {isPM ? 'PM' : 'AM'}
      </button>
    </div>
  );
}

// ── PDF payslip builder ────────────────────────────────────────────────────

function buildPayslipHtml(
  results: { row: Row; calc: CalcResult }[],
  preparedBy: string
): string {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Group by host
  const byHost: Record<string, { row: Row; calc: CalcResult }[]> = {};
  for (const item of results) {
    const name = item.row.hostName || 'Unknown';
    if (!byHost[name]) byHost[name] = [];
    byHost[name].push(item);
  }

  function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  const pages = Object.entries(byHost).map(([hostName, items], pageIdx) => {
    const totalPay     = items.reduce((s, i) => s + i.calc.total, 0);
    const totalTips    = items.reduce((s, i) => s + i.row.tip, 0);
    const totalHours   = items.reduce((s, i) => s + i.calc.shiftHours, 0);
    const totalStream  = items.reduce((s, i) => s + i.calc.lsHours, 0);
    const totalBase    = items.reduce((s, i) => s + i.calc.nonStreamPay, 0);
    const totalStream$ = items.reduce((s, i) => s + i.calc.streamPay, 0);
    const firstDate    = items[0]?.row.date ?? '';
    const lastDate     = items[items.length - 1]?.row.date ?? '';
    const period       = firstDate === lastDate ? fmtDateLong(firstDate) : `${fmtDateMed(firstDate)} – ${fmtDateLong(lastDate)}`;

    function fmtH(h: number) { return parseFloat(h.toFixed(2)) + 'h'; }
    const shiftRows = items.map(({ row, calc }) => `
      <tr>
        <td>${fmtDateMed(row.date)}</td>
        <td>${fmtTime12(row.timeIn)} – ${fmtTime12(row.timeOut)}</td>
        <td class="num">${fmtH(calc.shiftHours)}</td>
        <td class="num">${calc.nonLsHours > 0 && row.baseRate ? `${fmtH(calc.nonLsHours)} × $${parseFloat(row.baseRate)}` : calc.nonLsHours > 0 ? fmtH(calc.nonLsHours) : '—'}</td>
        <td class="num">${calc.lsHours > 0 ? `${fmtH(calc.lsHours)} × $${row.tierRate}` : '—'}</td>
        <td class="num">${row.tip > 0 ? '$' + fmt(row.tip) : '—'}</td>
        <td class="num bold">${'$' + fmt(calc.total)}</td>
      </tr>`).join('');

    return `
    <div class="payslip${pageIdx > 0 ? ' break' : ''}">
      <div class="ps-header">
        <div class="ps-brand">Stack Bargains</div>
        <div class="ps-title">Pay Statement</div>
      </div>

      <div class="ps-info">
        <div class="info-block">
          <div class="info-label">Host</div>
          <div class="info-val host-name">${hostName}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Pay Period</div>
          <div class="info-val">${period}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Date Issued</div>
          <div class="info-val">${now}</div>
        </div>
        <div class="info-block">
          <div class="info-label">Prepared By</div>
          <div class="info-val">${preparedBy}</div>
        </div>
      </div>

      <div class="section-title">Shift Details</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Shift</th>
            <th class="num">Total Hrs</th>
            <th class="num">Base Pay Hrs</th>
            <th class="num">Stream Pay Hrs</th>
            <th class="num">Tips</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${shiftRows}</tbody>
      </table>

      <div class="section-title">Earnings Summary</div>
      <div class="summary">
        <div class="sum-row">
          <span>Base Pay &nbsp;<small>(non-stream hours × base rate)</small></span>
          <span>$${fmt(totalBase)}</span>
        </div>
        <div class="sum-row">
          <span>Livestream Bonus &nbsp;<small>(stream hours × tier rate)</small></span>
          <span>$${fmt(totalStream$)}</span>
        </div>
        <div class="sum-row">
          <span>Tips</span>
          <span>$${fmt(totalTips)}</span>
        </div>
        <div class="sum-row divider"></div>
        <div class="sum-row total-row">
          <span>TOTAL PAY</span>
          <span>$${fmt(totalPay)}</span>
        </div>
      </div>

      <div class="ps-stats">
        <div class="stat"><span class="stat-label">Total Hours Worked</span><span class="stat-val">${fmtH(totalHours)}</span></div>
        <div class="stat"><span class="stat-label">Livestream Hours</span><span class="stat-val">${fmtH(totalStream)}</span></div>
        <div class="stat"><span class="stat-label">Non-Livestream Hours</span><span class="stat-val">${fmtH(totalHours - totalStream)}</span></div>
        <div class="stat"><span class="stat-label">Total Shifts</span><span class="stat-val">${items.length}</span></div>
      </div>

      <div class="ps-footer">
        This document is confidential &nbsp;·&nbsp; Stack Bargains &nbsp;·&nbsp; ${now}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Pay Statement — Stack Bargains</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #f8fafc; }
.payslip { max-width: 860px; margin: 40px auto; padding: 40px; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
.break { page-break-before: always; margin-top: 0; border-radius: 0; box-shadow: none; }
.ps-header { text-align: center; padding-bottom: 24px; border-bottom: 3px solid #DC2626; margin-bottom: 24px; }
.ps-brand { font-size: 30px; font-weight: 900; color: #DC2626; letter-spacing: -0.5px; }
.ps-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 6px; }
.ps-info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 32px; padding: 20px 24px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 28px; }
.info-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
.info-val { font-size: 15px; font-weight: 600; color: #1e293b; }
.host-name { font-size: 22px; font-weight: 900; color: #0f172a; }
.section-title { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; padding: 8px 12px; text-align: left; background: #f8fafc; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
th.num, td.num { text-align: right; }
td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
td.bold { font-weight: 900; color: #0f172a; }
.summary { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
.sum-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 18px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #475569; }
.sum-row small { font-size: 11px; color: #94a3b8; }
.sum-row:last-child { border-bottom: none; }
.sum-row.divider { padding: 0; border-bottom: 2px solid #e2e8f0; }
.sum-row.total-row { background: #FFF7ED; font-weight: 900; font-size: 20px; color: #DC2626; padding: 16px 18px; }
.ps-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
.stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; }
.stat-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 4px; }
.stat-val { font-size: 20px; font-weight: 900; color: #0f172a; }
.ps-footer { font-size: 11px; color: #94a3b8; text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0; }
@media print {
  body { background: #fff; }
  .payslip { margin: 0; padding: 24px; box-shadow: none; border-radius: 0; }
  @page { margin: 15mm; }
}
</style></head><body>
${pages}
<script>window.onload = function() { window.print(); }</script>
</body></html>`;
}

// ── types ─────────────────────────────────────────────────────────────────────

type Row = {
  id: string; date: string; hostName: string;
  timeIn: string; timeOut: string; lsInput: string;
  baseRate: string; tierRate: number; tip: number;
  scheduleHosts: ScheduleHost[]; loadingSchedule: boolean;
};

function newRow(defaults?: Partial<Row>): Row {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date().toISOString().split('T')[0],
    hostName: '', timeIn: '09:00', timeOut: '15:00',
    lsInput: '', baseRate: '', tierRate: 20, tip: 0,
    scheduleHosts: [], loadingSchedule: false,
    ...defaults,
  };
}

// ── main component ─────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [allHosts, setAllHosts] = useState<ScheduleHost[]>([]);
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
      setAllHosts(hosts.map(h => ({ name: h.name, tierRate: tierMap[h.name] ?? 20, profitPerHour: null })));
    });
  }, []);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  async function onDateChange(id: string, date: string, currentRows: Row[]) {
    const currentHostName = currentRows.find(r => r.id === id)?.hostName;
    updateRow(id, { date, loadingSchedule: true, scheduleHosts: [] });
    try {
      const res = await fetch(`/api/calculator/schedule?date=${date}`);
      const data: { hosts: ScheduleHost[] } = await res.json();
      const scheduleHosts = data.hosts ?? [];
      const updates: Partial<Row> = { loadingSchedule: false, scheduleHosts };
      // If current host is in the new schedule, auto-update their tier from performance data
      if (currentHostName) {
        const match = scheduleHosts.find(h => h.name === currentHostName);
        if (match) updates.tierRate = match.tierRate;
      }
      // Auto-select if only one host on that date
      if (scheduleHosts.length === 1) {
        updates.hostName = scheduleHosts[0].name;
        updates.tierRate = scheduleHosts[0].tierRate;
      }
      updateRow(id, updates);
    } catch {
      updateRow(id, { loadingSchedule: false });
    }
  }

  function onHostChange(id: string, hostName: string, row: Row) {
    const schedH = row.scheduleHosts.find(h => h.name === hostName);
    const tier = schedH?.tierRate ?? tiers[hostName] ?? allHosts.find(h => h.name === hostName)?.tierRate ?? 20;
    updateRow(id, { hostName, tierRate: tier });
  }

  async function onTierBlur(hostName: string, tierRate: number) {
    if (!hostName) return;
    await fetch('/api/calculator/tiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName, tierRate }),
    });
    setTiers(prev => ({ ...prev, [hostName]: tierRate }));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, newRow({ date: last.date, hostName: last.hostName, baseRate: last.baseRate, tierRate: last.tierRate, scheduleHosts: last.scheduleHosts })]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.length === 1 ? prev : prev.filter(r => r.id !== id));
  }

  function resetAll() { setRows([newRow()]); setResults(null); }

  function calculate() {
    const computed = rows.filter(r => r.timeIn && r.timeOut).map(r => ({ row: r, calc: calcRow(r) }));
    setResults(computed);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function copyText() {
    if (!results) return;
    const lines = results.map(({ row, calc }) => {
      const stream = calc.lsHours > 0 ? `streamed ${calc.lsHours}h` : 'no stream';
      const tip = row.tip > 0 ? ` (${fmtMoney(row.tip)} tip)` : '';
      return `${fmtDateShort(row.date)}: ${row.hostName}: ${fmtTime12(row.timeIn)}-${fmtTime12(row.timeOut)}: ${stream}${tip} → ${fmtMoney(calc.total)}`;
    });
    lines.push(`Total: ${fmtMoney(results.reduce((s, r) => s + r.calc.total, 0))}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  function downloadPdf() {
    if (!results || !session) return;
    const html = buildPayslipHtml(results, session.name);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  function hostOptions(row: Row) {
    const seen = new Set<string>();
    const opts: { name: string; tierRate: number; fromSchedule: boolean; pph: number | null }[] = [];
    for (const h of row.scheduleHosts) {
      if (!seen.has(h.name)) { seen.add(h.name); opts.push({ name: h.name, tierRate: h.tierRate, fromSchedule: true, pph: h.profitPerHour }); }
    }
    for (const h of allHosts) {
      if (!seen.has(h.name)) { seen.add(h.name); opts.push({ name: h.name, tierRate: tiers[h.name] ?? h.tierRate, fromSchedule: false, pph: null }); }
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
  results?.forEach(({ row, calc }) => { byHost[row.hostName] = (byHost[row.hostName] ?? 0) + calc.total; });

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 gap-4 flex-shrink-0">
          <h1 className="text-lg font-black text-white flex-1">Pay Calculator</h1>
          <button onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors border border-slate-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            New Calculation
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">

            {/* ── Input table ─────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-base font-black text-slate-900 dark:text-white">Enter Shifts</h2>
                <p className="text-xs text-slate-400 mt-0.5">Select a date — hosts who performed that day load automatically with their tier rate from performance data.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                      {['Date', 'Host', 'Time In', 'Time Out', 'Stream Hrs', 'Base $/hr', 'Tier $/hr', 'Tip', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {rows.map(row => {
                      const opts = hostOptions(row);
                      const schedNames = new Set(row.scheduleHosts.map(h => h.name));
                      const selectedSchedHost = row.scheduleHosts.find(h => h.name === row.hostName);
                      return (
                        <tr key={row.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-700/20">

                          {/* Date (custom MM/DD/YYYY picker) */}
                          <td className="px-3 py-2.5">
                            <DatePicker value={row.date} onChange={v => onDateChange(row.id, v, rows)} />
                          </td>

                          {/* Host */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <select value={row.hostName} onChange={e => onHostChange(row.id, e.target.value, row)}
                                className="appearance-none pl-3 pr-7 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[148px]">
                                <option value="">{row.loadingSchedule ? 'Loading…' : 'Select host'}</option>
                                {schedNames.size > 0 && (
                                  <optgroup label="Performed this day">
                                    {opts.filter(o => o.fromSchedule).map(o => (
                                      <option key={o.name} value={o.name}>{o.name} — ${o.tierRate}/hr</option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label={schedNames.size > 0 ? 'Other hosts' : 'All hosts'}>
                                  {opts.filter(o => !o.fromSchedule).map(o => (
                                    <option key={o.name} value={o.name}>{o.name}</option>
                                  ))}
                                </optgroup>
                              </select>
                              <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                            </div>
                            {selectedSchedHost?.profitPerHour && (
                              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 ml-1">
                                ${selectedSchedHost.profitPerHour}/hr profit
                              </div>
                            )}
                          </td>

                          {/* Time In */}
                          <td className="px-3 py-2.5">
                            <TimePicker value={row.timeIn} onChange={v => updateRow(row.id, { timeIn: v })} />
                          </td>

                          {/* Time Out */}
                          <td className="px-3 py-2.5">
                            <TimePicker value={row.timeOut} onChange={v => updateRow(row.id, { timeOut: v })} />
                          </td>

                          {/* Stream Hrs */}
                          <td className="px-3 py-2.5">
                            <input type="text" value={row.lsInput} onChange={e => updateRow(row.id, { lsInput: e.target.value })}
                              placeholder=""
                              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[80px]" />
                          </td>

                          {/* Base rate */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                              <input type="text" inputMode="decimal" placeholder="—"
                                value={row.baseRate}
                                onChange={e => updateRow(row.id, { baseRate: e.target.value })}
                                className="pl-5 pr-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-[80px] placeholder-slate-300 dark:placeholder-slate-600" />
                            </div>
                          </td>

                          {/* Tier rate */}
                          <td className="px-3 py-2.5">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                              <input type="number" min={0} step={1} value={row.tierRate}
                                onChange={e => updateRow(row.id, { tierRate: parseFloat(e.target.value) || 0 })}
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

                {/* Header with actions */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4 flex-wrap">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Pay Summary</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={copyText}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${copied ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {copied ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>}
                      </svg>
                      {copied ? 'Copied!' : 'Copy as text'}
                    </button>
                    <button onClick={downloadPdf}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      Download PDF
                    </button>
                  </div>
                </div>

                {/* Compact one-line-per-shift summary */}
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {results.map(({ row, calc }) => (
                    <div key={row.id} className="px-6 py-3.5 flex items-center flex-wrap gap-1">
                      <span className="text-sm font-black text-slate-900 dark:text-white w-12 flex-shrink-0 font-mono">{fmtDateShort(row.date)}</span>
                      <span className="text-slate-300 dark:text-slate-600 text-xs mx-1">·</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-[80px] flex-shrink-0">{row.hostName || '—'}</span>
                      <span className="text-slate-300 dark:text-slate-600 text-xs mx-1">·</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">{fmtTime12(row.timeIn)}–{fmtTime12(row.timeOut)}</span>
                      <span className="text-[11px] text-slate-400 ml-1">({fmtHrs(calc.shiftHours)})</span>
                      <span className="text-slate-300 dark:text-slate-600 text-xs mx-1">·</span>
                      {calc.lsHours > 0 ? (
                        <span className="text-sm whitespace-nowrap">
                          <span className="font-semibold text-amber-600 dark:text-amber-400">streamed {fmtHrs(calc.lsHours)}</span>
                          <span className="text-slate-400 text-xs ml-1">@ ${row.tierRate}/hr</span>
                        </span>
                      ) : <span className="text-sm text-slate-400">no stream</span>}
                      {row.tip > 0 && <><span className="text-slate-300 dark:text-slate-600 text-xs mx-1">·</span><span className="text-sm text-slate-500">{fmtMoney(row.tip)} tip</span></>}
                      <span className="ml-auto flex items-center gap-2 flex-shrink-0 pl-4">
                        <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                        <span className="text-lg font-black text-amber-600 dark:text-amber-400">{fmtMoney(calc.total)}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* ── Employee-friendly breakdown table ─────────────────── */}
                <div className="border-t border-slate-100 dark:border-slate-700">
                  <div className="px-6 pt-4 pb-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Earnings Breakdown</p>
                  </div>
                  <div className="overflow-x-auto px-6 pb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="pb-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Date</th>
                          <th className="pb-2 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4">Host</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Shift Hrs</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Base Hrs</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Base Pay</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Stream Hrs</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4 whitespace-nowrap">Stream Pay</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide pr-4">Tips</th>
                          <th className="pb-2 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map(({ row, calc }) => (
                          <tr key={row.id} className="border-t border-slate-50 dark:border-slate-700/50">
                            <td className="py-2 pr-4 font-mono text-slate-600 dark:text-slate-400 text-xs">{fmtDateShort(row.date)}</td>
                            <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">{row.hostName}</td>
                            <td className="py-2 pr-4 text-right text-slate-500">{fmtHrs(calc.shiftHours)}</td>
                            <td className="py-2 pr-4 text-right text-slate-500 whitespace-nowrap">
                              {calc.nonLsHours > 0 && row.baseRate ? `${fmtHrs(calc.nonLsHours)} × $${parseFloat(row.baseRate)}` : calc.nonLsHours > 0 ? fmtHrs(calc.nonLsHours) : '—'}
                            </td>
                            <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300 font-semibold">{fmtMoney(calc.nonStreamPay)}</td>
                            <td className="py-2 pr-4 text-right text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              {calc.lsHours > 0 ? `${fmtHrs(calc.lsHours)} × $${row.tierRate}` : '—'}
                            </td>
                            <td className="py-2 pr-4 text-right text-amber-700 dark:text-amber-300 font-semibold">{calc.lsHours > 0 ? fmtMoney(calc.streamPay) : '—'}</td>
                            <td className="py-2 pr-4 text-right text-slate-500">{row.tip > 0 ? fmtMoney(row.tip) : '—'}</td>
                            <td className="py-2 text-right font-black text-slate-900 dark:text-white">{fmtMoney(calc.total)}</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t-2 border-slate-200 dark:border-slate-600">
                          <td colSpan={2} className="pt-2 font-black text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">Totals</td>
                          <td className="pt-2 text-right font-bold text-slate-700 dark:text-slate-300">
                            {fmtHrs(results.reduce((s, r) => s + r.calc.shiftHours, 0))}
                          </td>
                          <td className="pt-2 text-right font-bold text-slate-700 dark:text-slate-300">
                            {fmtHrs(results.reduce((s, r) => s + r.calc.nonLsHours, 0))}
                          </td>
                          <td className="pt-2 text-right font-bold text-slate-700 dark:text-slate-300">
                            {fmtMoney(results.reduce((s, r) => s + r.calc.nonStreamPay, 0))}
                          </td>
                          <td className="pt-2 text-right font-bold text-amber-600 dark:text-amber-400">
                            {fmtHrs(results.reduce((s, r) => s + r.calc.lsHours, 0))}
                          </td>
                          <td className="pt-2 text-right font-bold text-amber-600 dark:text-amber-400">
                            {fmtMoney(results.reduce((s, r) => s + r.calc.streamPay, 0))}
                          </td>
                          <td className="pt-2 text-right font-bold text-slate-600 dark:text-slate-400">
                            {fmtMoney(results.reduce((s, r) => s + r.row.tip, 0))}
                          </td>
                          <td className="pt-2 text-right font-black text-amber-600 dark:text-amber-400 text-base">
                            {fmtMoney(grandTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Grand total banner */}
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
