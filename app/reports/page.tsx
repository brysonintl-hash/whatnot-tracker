'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Session = { username: string; role: string; name: string };
type Order = {
  tab: string; sold: number; profit: number; margin: number; host: string;
  buyer: string; modelNum: string; productName: string; timestamp: string;
};
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function parseTabDate(tab: string) {
  const [m, d, y] = tab.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  });
  a.click();
}

const HOST_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899'];

// â"€â"€ Icons â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const IC = {
  revenue: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  wallet:  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  box:     <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  cash:    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  calIcon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  pdf:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  csv:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M3 3h18v18H3z" /></svg>,
  excel:   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>,
};

// â"€â"€ P&L helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type MonthOverhead = {
  rent: number; utilities: number; supplies: number;
  employee: number; other: number; otherLabel: string; notes: string;
};
const OH_DEFAULT: MonthOverhead = { rent: 0, utilities: 0, supplies: 0, employee: 0, other: 0, otherLabel: '', notes: '' };

function tabToMonth(tab: string): string {
  const [m, , y] = tab.split('/').map(Number);
  if (!m || !y) return '';
  return `${2000 + y}-${String(m).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// â"€â"€ Reports Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession]   = useState<Session | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);
  const [pageTab, setPageTab]   = useState<'reports' | 'pl'>('reports');

  // P&L state
  const [plMonth, setPlMonth]       = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; });
  const [overhead, setOverhead]     = useState<Record<string, MonthOverhead>>({});
  const [plForm, setPlForm]         = useState<MonthOverhead>(OH_DEFAULT);
  const [plSaving, setPlSaving]     = useState(false);
  const [plSaved, setPlSaved]       = useState(false);

  const [reportPeriod, setReportPeriod]   = useState<ReportPeriod>('daily');
  const [reportDate, setReportDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState('');

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
    fetch('/api/sales', { cache: 'no-store' }).then(r => r.json()).then(d => {
      setOrders(Array.isArray(d) ? d : []);
      setLoading(false);
    });
    fetch('/api/overhead').then(r => r.ok ? r.json() : {}).then(d => setOverhead(d || {}));
  }, []);

  // sync form when month changes
  useEffect(() => {
    setPlForm({ ...OH_DEFAULT, ...overhead[plMonth] });
  }, [plMonth, overhead]);

  const reportOrders = useMemo(() => {
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      const sel = new Date(reportDate + 'T00:00:00');
      if (reportPeriod === 'daily') return d.toDateString() === sel.toDateString();
      if (reportPeriod === 'weekly') {
        const ws = new Date(sel); ws.setDate(sel.getDate() - sel.getDay());
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        return d >= ws && d <= we;
      }
      if (reportPeriod === 'monthly') return d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth();
      if (reportPeriod === 'custom') {
        const e = reportEndDate ? new Date(reportEndDate + 'T23:59:59') : sel;
        return d >= sel && d <= e;
      }
      return false;
    });
  }, [orders, reportPeriod, reportDate, reportEndDate]);

  const rRev    = reportOrders.reduce((s, o) => s + o.sold, 0);
  const rProfit = reportOrders.reduce((s, o) => s + o.profit, 0);
  const rCOGS   = reportOrders.reduce((s, o) => s + (o.sold - o.profit), 0);
  const rMargin = rRev > 0 ? (rProfit / rRev) * 100 : 0;
  const rCount  = reportOrders.length;
  const rAvgSale = rCount > 0 ? rRev / rCount : 0;
  const rOpDays  = new Set(reportOrders.map(o => o.tab)).size;

  // P&L computed values
  const plMonths = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => { const m = tabToMonth(o.tab); if (m) s.add(m); });
    return Array.from(s).sort().reverse();
  }, [orders]);

  const plOrders = useMemo(() => orders.filter(o => tabToMonth(o.tab) === plMonth), [orders, plMonth]);

  const plRev    = plOrders.reduce((s, o) => s + o.sold, 0);
  const plCOGS   = plOrders.reduce((s, o) => s + (o.sold - o.profit), 0);
  const plGross  = plOrders.reduce((s, o) => s + o.profit, 0);
  const plTotalOH = plForm.rent + plForm.utilities + plForm.supplies + plForm.employee + plForm.other;
  const plNet    = plGross - plTotalOH;
  const plNetPct = plRev > 0 ? (plNet / plRev) * 100 : 0;

  async function savePL() {
    setPlSaving(true); setPlSaved(false);
    await fetch('/api/overhead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: plMonth, ...plForm }),
    });
    const fresh = await fetch('/api/overhead').then(r => r.json());
    setOverhead(fresh || {});
    setPlSaving(false); setPlSaved(true);
    setTimeout(() => setPlSaved(false), 2500);
  }

  function exportPLCSV() {
    const rows = [
      ['Stack Bargains — P&L Statement', monthLabel(plMonth)],
      [],
      ['REVENUE'],
      ['Total Revenue', `$${fmt(plRev)}`],
      ['Cost of Goods Sold (COGS)', `$${fmt(plCOGS)}`],
      ['Gross Profit', `$${fmt(plGross)}`],
      ['Gross Margin', `${plRev > 0 ? ((plGross/plRev)*100).toFixed(1) : '0.0'}%`],
      [],
      ['OVERHEAD COSTS'],
      ['Rent', `$${fmt(plForm.rent)}`],
      ['Utilities', `$${fmt(plForm.utilities)}`],
      ['Shipping Supplies', `$${fmt(plForm.supplies)}`],
      ['Employee Pay', `$${fmt(plForm.employee)}`],
      [plForm.otherLabel || 'Other', `$${fmt(plForm.other)}`],
      ['Total Overhead', `$${fmt(plTotalOH)}`],
      [],
      ['NET PROFIT', `$${fmt(plNet)}`],
      ['NET MARGIN', `${plNetPct.toFixed(1)}%`],
    ];
    downloadCSV(rows, `pl-${plMonth}.csv`);
  }

  function exportPLPDF() {
    const w = window.open('', '_blank');
    if (!w) return;
    const grossColor = plGross >= 0 ? '#10B981' : '#EF4444';
    const netColor = plNet >= 0 ? '#10B981' : '#EF4444';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>P&L — ${monthLabel(plMonth)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1e293b;padding:40px;font-size:13px;background:#fff}
h1{font-size:22px;font-weight:900;margin-bottom:4px}p.sub{font-size:11px;color:#64748b;margin-bottom:28px}
.section{margin-bottom:24px}.section-title{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:12px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px}
.row.total{font-weight:900;font-size:15px;border-top:2px solid #0f172a;border-bottom:none;margin-top:4px;padding-top:12px}
.row.net{font-weight:900;font-size:20px;color:${netColor};border-bottom:none;border-top:3px double #0f172a;margin-top:8px;padding-top:14px}
@media print{@page{margin:14mm}body{padding:0}}</style></head><body>
<h1>Stack Bargains — Profit &amp; Loss</h1>
<p class="sub">${monthLabel(plMonth)} &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-US')}</p>
<div class="section">
<div class="section-title">Revenue</div>
<div class="row"><span>Total Revenue (Sales)</span><span>$${fmt(plRev)}</span></div>
<div class="row"><span>Cost of Goods Sold (COGS)</span><span style="color:#EF4444">($${fmt(plCOGS)})</span></div>
<div class="row total"><span>Gross Profit</span><span style="color:${grossColor}">$${fmt(plGross)}</span></div>
</div>
<div class="section">
<div class="section-title">Overhead Costs</div>
<div class="row"><span>Rent</span><span>$${fmt(plForm.rent)}</span></div>
<div class="row"><span>Utilities</span><span>$${fmt(plForm.utilities)}</span></div>
<div class="row"><span>Shipping Supplies</span><span>$${fmt(plForm.supplies)}</span></div>
<div class="row"><span>Employee Pay</span><span>$${fmt(plForm.employee)}</span></div>
${plForm.other > 0 ? `<div class="row"><span>${plForm.otherLabel || 'Other'}</span><span>$${fmt(plForm.other)}</span></div>` : ''}
<div class="row total"><span>Total Overhead</span><span style="color:#EF4444">($${fmt(plTotalOH)})</span></div>
</div>
<div class="row net"><span>Net Profit</span><span>$${fmt(plNet)} &nbsp; (${plNetPct.toFixed(1)}%)</span></div>
<script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  }

  const reportByProduct = useMemo(() => {
    const m: Record<string, { name: string; count: number; rev: number; profit: number }> = {};
    reportOrders.forEach(o => {
      const k = o.modelNum || 'Unknown';
      if (!m[k]) m[k] = { name: o.productName || o.modelNum || 'Unknown', count: 0, rev: 0, profit: 0 };
      m[k].count += 1; m[k].rev += o.sold; m[k].profit += o.profit;
    });
    return Object.entries(m).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
  }, [reportOrders]);

  const reportByHost = useMemo(() => {
    const m: Record<string, { rev: number; profit: number; count: number }> = {};
    reportOrders.forEach(o => {
      if (!o.host) return;
      if (!m[o.host]) m[o.host] = { rev: 0, profit: 0, count: 0 };
      m[o.host].rev += o.sold; m[o.host].profit += o.profit; m[o.host].count++;
    });
    return Object.entries(m).sort((a, b) => b[1].rev - a[1].rev);
  }, [reportOrders]);

  function exportCSV() {
    const rows = [
      ['Product', 'Model', 'Buyer', 'Host', 'Show', 'Revenue', 'Profit', 'Margin%'],
      ...reportOrders.map(o => [o.productName, o.modelNum, o.buyer, o.host, o.tab, o.sold.toFixed(2), o.profit.toFixed(2), o.margin.toFixed(1)]),
    ];
    downloadCSV(rows, `report-${reportDate}.csv`);
  }

  function exportExcel() {
    const rows = [
      ['Product', 'Model', 'Buyer', 'Host', 'Show', 'Revenue', 'Profit', 'Margin%'],
      ...reportOrders.map(o => [o.productName, o.modelNum, o.buyer, o.host, o.tab, o.sold.toFixed(2), o.profit.toFixed(2), o.margin.toFixed(1)]),
    ];
    downloadCSV(rows, `report-${reportDate}.xls`);
  }

  function exportPDF() {
    const w = window.open('', '_blank');
    if (!w) return;
    const periodLabel = reportPeriod === 'daily' ? reportDate
      : reportPeriod === 'weekly' ? `Week of ${reportDate}`
      : reportPeriod === 'monthly' ? reportDate.slice(0, 7)
      : `${reportDate} – ${reportEndDate || reportDate}`;

    const rows = reportByProduct.map(([ model, d], i) => `
      <tr>
        <td>${i + 1}</td><td>${d.name}</td><td>${model}</td>
        <td>${d.count}</td><td>$${fmt(d.rev)}</td>
        <td style="color:${d.profit>=0?'#10B981':'#EF4444'}">$${fmt(d.profit)}</td>
      </tr>`).join('');

    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report — ${periodLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;color:#1e293b;padding:40px;font-size:13px;background:#fff}
h1{font-size:22px;font-weight:900;margin-bottom:4px}p.sub{font-size:11px;color:#64748b;margin-bottom:28px}
.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.kpi-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
.kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
.kpi-value{font-size:22px;font-weight:900;color:#0f172a}
h2{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 10px;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
table{width:100%;border-collapse:collapse}
th{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;padding:6px 10px;border-bottom:2px solid #e2e8f0;text-align:left}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
@media print{@page{margin:14mm}body{padding:0}}</style></head><body>
<h1>Stack Bargains — Report</h1>
<p class="sub">${periodLabel} &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-US')}</p>
<div class="kpi">
  <div class="kpi-card"><div class="kpi-label">Revenue</div><div class="kpi-value">$${fmt(rRev)}</div></div>
  <div class="kpi-card"><div class="kpi-label">Gross Profit</div><div class="kpi-value" style="color:${rProfit>=0?'#10B981':'#EF4444'}">$${fmt(rProfit)}</div></div>
  <div class="kpi-card"><div class="kpi-label">COGS</div><div class="kpi-value">$${fmt(rCOGS)}</div></div>
  <div class="kpi-card"><div class="kpi-label">Avg Margin</div><div class="kpi-value">${rMargin.toFixed(1)}%</div></div>
</div>
<h2>Top Products</h2>
<table><thead><tr><th>#</th><th>Product</th><th>Model</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload=()=>{window.print();}</script></body></html>`);
    w.document.close();
  }

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role as Role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">

        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Reports</h1>
            <p className="text-xs text-slate-400">Generate and export business reports</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        {/* Page-level tab bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 pb-0 flex gap-1">
          {[
            { key: 'reports', label: 'Sales Report' },
            { key: 'pl',      label: 'P&L Statement' },
          ].map(t => (
            <button key={t.key} onClick={() => setPageTab(t.key as 'reports' | 'pl')}
              className={`px-5 py-3 text-xs font-bold border-b-2 transition-colors ${pageTab === t.key ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading data...</div>
          ) : pageTab === 'pl' ? (
            /* ── P&L Statement ─────────────────────────────────────── */
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Month selector + export */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-wrap items-center gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Month</label>
                  <select value={plMonth} onChange={e => setPlMonth(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none">
                    {plMonths.length === 0 && <option value={plMonth}>{monthLabel(plMonth)}</option>}
                    {plMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </div>
                <div className="ml-auto flex gap-2">
                  <button onClick={exportPLPDF} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg">{IC.pdf} PDF</button>
                  <button onClick={exportPLCSV} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg">{IC.csv} CSV</button>
                </div>
              </div>

              {/* Revenue section */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Revenue</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {[
                    { label: 'Total Revenue (Sales)', value: plRev, bold: false },
                    { label: 'Cost of Goods Sold (COGS)', value: -plCOGS, bold: false },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{r.label}</span>
                      <span className={`text-sm font-semibold ${r.value < 0 ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}>
                        {r.value < 0 ? `($${fmt(-r.value)})` : `$${fmt(r.value)}`}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-700/30">
                    <span className="text-sm font-black text-slate-800 dark:text-slate-100">Gross Profit</span>
                    <span className={`text-lg font-black ${plGross >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>${fmt(plGross)}</span>
                  </div>
                </div>
              </div>

              {/* Overhead costs form */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Overhead Costs</p>
                  <p className="text-[10px] text-slate-400">Edit values and save</p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {([
                    { key: 'rent',      label: 'Rent / Space' },
                    { key: 'utilities', label: 'Utilities (electric, internet, etc.)' },
                    { key: 'supplies',  label: 'Shipping Supplies' },
                    { key: 'employee',  label: 'Employee Pay' },
                  ] as { key: keyof MonthOverhead; label: string }[]).map(f => (
                    <div key={f.key} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{f.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-sm">$</span>
                        <input type="number" min="0" step="0.01"
                          value={plForm[f.key] as number}
                          onChange={e => setPlForm(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))}
                          className="w-32 text-right bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-400" />
                      </div>
                    </div>
                  ))}
                  {/* Other with custom label */}
                  <div className="flex items-center justify-between px-5 py-3 gap-3">
                    <input type="text" placeholder="Other (describe...)"
                      value={plForm.otherLabel}
                      onChange={e => setPlForm(p => ({ ...p, otherLabel: e.target.value }))}
                      className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-amber-400" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-sm">$</span>
                      <input type="number" min="0" step="0.01"
                        value={plForm.other}
                        onChange={e => setPlForm(p => ({ ...p, other: parseFloat(e.target.value) || 0 }))}
                        className="w-32 text-right bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-700/30">
                    <span className="text-sm font-black text-slate-800 dark:text-slate-100">Total Overhead</span>
                    <span className="text-lg font-black text-red-500">($${fmt(plTotalOH)})</span>
                  </div>
                </div>
                {/* Notes + Save */}
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                  <textarea rows={2} placeholder="Notes (optional)..."
                    value={plForm.notes}
                    onChange={e => setPlForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                  <button onClick={savePL} disabled={plSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-sm rounded-lg transition-colors">
                    {plSaving ? 'Saving...' : plSaved ? '✓ Saved!' : 'Save Overhead Costs'}
                  </button>
                </div>
              </div>

              {/* Net Profit summary */}
              <div className={`rounded-xl border-2 shadow-sm p-6 ${plNet >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-400' : 'bg-red-50 dark:bg-red-900/10 border-red-400'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Net Profit — {monthLabel(plMonth)}</p>
                    <p className={`text-4xl font-black ${plNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(plNet)}</p>
                    <p className="text-sm text-slate-500 mt-1">Net Margin: <span className={`font-bold ${plNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{plNetPct.toFixed(1)}%</span></p>
                  </div>
                  <div className="text-right text-xs text-slate-400 space-y-1">
                    <div>Gross Profit: <span className="font-bold text-slate-600 dark:text-slate-300">${fmt(plGross)}</span></div>
                    <div>Overhead: <span className="font-bold text-red-400">–${fmt(plTotalOH)}</span></div>
                    <div>{plOrders.length} orders this month</div>
                  </div>
                </div>
              </div>

              {/* Monthly summary table */}
              {plMonths.length > 1 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">All Months Summary</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Month','Revenue','COGS','Gross Profit','Overhead','Net Profit','Net Margin'].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {plMonths.map(m => {
                          const mos = orders.filter(o => tabToMonth(o.tab) === m);
                          const rev = mos.reduce((s,o) => s+o.sold, 0);
                          const cogs = mos.reduce((s,o) => s+(o.sold-o.profit), 0);
                          const gross = mos.reduce((s,o) => s+o.profit, 0);
                          const oh = overhead[m] || OH_DEFAULT;
                          const ohTotal = oh.rent + oh.utilities + oh.supplies + oh.employee + oh.other;
                          const net = gross - ohTotal;
                          const netPct = rev > 0 ? (net/rev)*100 : 0;
                          return (
                            <tr key={m} onClick={() => setPlMonth(m)}
                              className={`border-b border-slate-50 dark:border-slate-700/50 cursor-pointer transition-colors ${m === plMonth ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/20'}`}>
                              <td className="py-3 px-4 text-xs font-bold text-slate-800 dark:text-slate-200">{monthLabel(m)}</td>
                              <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">${fmt(rev)}</td>
                              <td className="py-3 px-4 text-xs text-slate-500">${fmt(cogs)}</td>
                              <td className={`py-3 px-4 text-xs font-bold ${gross >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(gross)}</td>
                              <td className="py-3 px-4 text-xs text-red-400">{ohTotal > 0 ? `$${fmt(ohTotal)}` : <span className="text-slate-400">—</span>}</td>
                              <td className={`py-3 px-4 text-xs font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(net)}</td>
                              <td className={`py-3 px-4 text-xs font-bold ${netPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{netPct.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Report Configuration */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Report Configuration</h3>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl p-1 w-fit mb-5">
                  {(['daily','weekly','monthly','custom'] as ReportPeriod[]).map(p => (
                    <button key={p} onClick={() => setReportPeriod(p)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all flex items-center gap-1.5 ${reportPeriod === p ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
                      {IC.calIcon}{p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Select Date:</span>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2">
                      {IC.calIcon}
                      <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                        className="text-sm bg-transparent text-slate-700 dark:text-slate-300 outline-none font-medium" />
                    </div>
                    {reportPeriod === 'custom' && (
                      <>
                        <span className="text-sm text-slate-400">to</span>
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2">
                          {IC.calIcon}
                          <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)}
                            className="text-sm bg-transparent text-slate-700 dark:text-slate-300 outline-none font-medium" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Export:</span>
                  <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-colors shadow-sm">{IC.pdf} PDF</button>
                  <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors">{IC.csv} CSV</button>
                  <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-lg transition-colors">{IC.excel} Excel</button>
                  <span className="ml-auto text-xs text-slate-400">{reportOrders.length} orders in range</span>
                </div>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'REVENUE',      value: `$${fmt(rRev)}`,    icon: IC.revenue, iconBg: 'bg-amber-400', cardBg: 'bg-amber-50 dark:bg-amber-900/10',  vc: 'text-amber-500' },
                  { label: 'GROSS PROFIT', value: `$${fmt(rProfit)}`, icon: IC.wallet,  iconBg: 'bg-blue-500',  cardBg: 'bg-blue-50 dark:bg-blue-900/10',    vc: rProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500' },
                  { label: 'COGS',         value: `$${fmt(rCOGS)}`,   icon: IC.box,     iconBg: 'bg-amber-400', cardBg: 'bg-amber-50 dark:bg-amber-900/10',  vc: 'text-amber-500' },
                  { label: 'NET PROFIT',   value: `$${fmt(rProfit)}`, icon: IC.cash,    iconBg: 'bg-amber-400', cardBg: 'bg-amber-50 dark:bg-amber-900/10',  vc: rProfit >= 0 ? 'text-amber-500' : 'text-red-500' },
                ].map(c => (
                  <div key={c.label} className={`${c.cardBg} rounded-2xl p-5 flex items-start gap-4`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>{c.icon}</div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{c.label}</p>
                      <p className={`text-2xl font-black ${c.vc}`}>{c.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Sales',     value: String(rCount),           sub: 'orders' },
                  { label: 'Avg Sale',        value: `$${fmt(rAvgSale)}`,      sub: 'per order' },
                  { label: 'Gross Margin',    value: `${rMargin.toFixed(1)}%`, sub: 'profit / revenue' },
                  { label: 'Operating Days',  value: String(rOpDays),          sub: 'unique show dates' },
                ].map(s => (
                  <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{s.label}</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white">{s.value}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Top Products + Host Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Top Products</h3>
                  </div>
                  {reportByProduct.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">No data for this period</div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20">
                        <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">#</th>
                        <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Product</th>
                        <th className="py-2.5 px-4 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Qty</th>
                        <th className="py-2.5 px-4 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Revenue</th>
                        <th className="py-2.5 px-4 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Profit</th>
                      </tr></thead>
                      <tbody>
                        {reportByProduct.map(([model, d], i) => (
                          <tr key={model} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                            <td className="py-3 px-4 text-xs text-slate-400">{i + 1}</td>
                            <td className="py-3 px-4">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{d.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{model}</p>
                            </td>
                            <td className="py-3 px-4 text-center text-xs text-slate-600 dark:text-slate-400">{d.count}</td>
                            <td className="py-3 px-4 text-right text-xs font-bold text-slate-900 dark:text-white">${fmt(d.rev)}</td>
                            <td className={`py-3 px-4 text-right text-xs font-bold ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(d.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Revenue by Host</h3>
                  </div>
                  {reportByHost.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">No data</div>
                  ) : (
                    <div className="p-4 space-y-3">
                      {reportByHost.map(([host, d], i) => {
                        const share = rRev > 0 ? (d.rev / rRev) * 100 : 0;
                        return (
                          <div key={host}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ backgroundColor: HOST_COLORS[i % HOST_COLORS.length] }}>{host[0]}</div>
                                <span className="text-xs font-bold text-slate-900 dark:text-white">{host}</span>
                              </div>
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300">${fmt(d.rev)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: HOST_COLORS[i % HOST_COLORS.length] }} />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">{share.toFixed(1)}% of revenue · {d.count} orders</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {/* Orders Detail — individual rows with Host */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Order Details</h3>
                  <span className="text-xs text-slate-400">{reportOrders.length} orders</span>
                </div>
                {reportOrders.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">No orders for this period</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20">
                        {['Date', 'Host', 'Product', 'Buyer', 'Revenue', 'Profit', 'Margin'].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {reportOrders.slice(0, 100).map((o, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                            <td className="py-2.5 px-4 text-xs text-slate-400 whitespace-nowrap">{o.tab}</td>
                            <td className="py-2.5 px-4">
                              {o.host ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                                    style={{ backgroundColor: HOST_COLORS[reportByHost.findIndex(([h])=>h===o.host) % HOST_COLORS.length] || '#64748b' }}>
                                    {o.host[0]}
                                  </span>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{o.host}</span>
                                </span>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                            <td className="py-2.5 px-4">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{o.productName || o.modelNum}</p>
                              {o.modelNum && o.productName && <p className="text-[10px] text-slate-400 font-mono">{o.modelNum}</p>}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400">{o.buyer}</td>
                            <td className="py-2.5 px-4 text-xs font-bold text-slate-900 dark:text-white text-right">${fmt(o.sold)}</td>
                            <td className={`py-2.5 px-4 text-xs font-bold text-right ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(o.profit)}</td>
                            <td className={`py-2.5 px-4 text-xs font-bold text-right ${o.margin >= 30 ? 'text-emerald-600' : o.margin >= 15 ? 'text-amber-500' : 'text-red-500'}`}>{o.margin.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {reportOrders.length > 100 && (
                      <p className="text-center text-xs text-slate-400 py-3">Showing first 100 of {reportOrders.length} orders. Export CSV/Excel for the full list.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
