'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Session = { username: string; role: string; name: string };
type Order = {
  tab: string; sold: number; profit: number; margin: number; host: string;
  buyer: string; modelNum: string; productName: string; timestamp: string;
};
type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Reports Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession]   = useState<Session | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [loading, setLoading]   = useState(true);

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
  }, []);

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
      : `${reportDate} â€“ ${reportEndDate || reportDate}`;

    const rows = reportByProduct.map(([ model, d], i) => `
      <tr>
        <td>${i + 1}</td><td>${d.name}</td><td>${model}</td>
        <td>${d.count}</td><td>$${fmt(d.rev)}</td>
        <td style="color:${d.profit>=0?'#10B981':'#EF4444'}">$${fmt(d.profit)}</td>
      </tr>`).join('');

    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report â€” ${periodLabel}</title>
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
<h1>Stack Bargains â€” Report</h1>
<p class="sub">${periodLabel} &nbsp;Â·&nbsp; Generated ${new Date().toLocaleString('en-US')}</p>
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

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading data...</div>
          ) : (
            <>
              {/* Report Configuration */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
                <h3 className="font-bold text-white text-sm mb-4">Report Configuration</h3>

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl p-1 w-fit mb-5">
                  {(['daily','weekly','monthly','custom'] as ReportPeriod[]).map(p => (
                    <button key={p} onClick={() => setReportPeriod(p)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all flex items-center gap-1.5 ${reportPeriod === p ? 'bg-white dark:bg-slate-700 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
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
                    <p className="text-2xl font-black text-white">{s.value}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Top Products + Host Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-white text-sm">Top Products</h3>
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
                              <p className="text-xs font-bold text-white truncate max-w-[200px]">{d.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{model}</p>
                            </td>
                            <td className="py-3 px-4 text-center text-xs text-slate-600 dark:text-slate-400">{d.count}</td>
                            <td className="py-3 px-4 text-right text-xs font-bold text-white">${fmt(d.rev)}</td>
                            <td className={`py-3 px-4 text-right text-xs font-bold ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(d.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-bold text-white text-sm">Revenue by Host</h3>
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
                                <span className="text-xs font-bold text-white">{host}</span>
                              </div>
                              <span className="text-xs font-black text-slate-700 dark:text-slate-300">${fmt(d.rev)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: HOST_COLORS[i % HOST_COLORS.length] }} />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">{share.toFixed(1)}% of revenue Â· {d.count} orders</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {/* Orders Detail â€” individual rows with Host */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm">Order Details</h3>
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
                              ) : <span className="text-xs text-slate-400">â€”</span>}
                            </td>
                            <td className="py-2.5 px-4">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{o.productName || o.modelNum}</p>
                              {o.modelNum && o.productName && <p className="text-[10px] text-slate-400 font-mono">{o.modelNum}</p>}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400">{o.buyer}</td>
                            <td className="py-2.5 px-4 text-xs font-bold text-white text-right">${fmt(o.sold)}</td>
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
