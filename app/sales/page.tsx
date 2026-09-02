'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

type Session = { username: string; role: Role; name: string };
type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  timestamp: string; host: string;
};

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtInt(n: number) { return n.toLocaleString('en-US'); }

const DATE_PRESETS = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastmonth' },
  { label: 'Custom', value: 'custom' },
];

const HOST_COLORS = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];
const SHOW_PAGE_SIZE = 20;

export default function SalesPage() {
  const router = useRouter();
  const isDark = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedHost, setSelectedHost] = useState('All');
  const [showPage, setShowPage] = useState(1);
  const lineChartRef = useRef<any>(null);
  const barChartRef  = useRef<any>(null);

  // Load zoom plugin client-side only (references `window`)
  useEffect(() => {
    import('chartjs-plugin-zoom').then(m => ChartJS.register(m.default));
  }, []);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    fetch('/api/sales', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.error) setError(data.error);
        else setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { setShowPage(1); }, [preset, customStart, customEnd, selectedHost]);

  const chartText = isDark ? '#e2e8f0' : '#374151';
  const chartGrid = isDark ? '#334155' : '#F3F4F6';
  const chartTick = isDark ? '#94a3b8' : '#6B7280';

  const chartOpts = useMemo(() => ({
    responsive: true,
    plugins: {
      legend: { labels: { color: chartText } },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x' as const,
        },
        pan: {
          enabled: true,
          mode: 'x' as const,
        },
        limits: { x: { min: 'original' as const, max: 'original' as const } },
      },
    },
    scales: {
      x: { ticks: { color: chartTick }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTick }, grid: { color: chartGrid } },
    },
  }), [isDark]);

  const dateFiltered = useMemo(() => {
    const now = new Date(); const today = startOfDay(now);
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (preset === 'today') return d >= today;
      if (preset === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return d >= y && d < today; }
      if (preset === '7days') { const w = new Date(today); w.setDate(today.getDate() - 7); return d >= w; }
      if (preset === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (preset === 'lastmonth') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lme = new Date(now.getFullYear(), now.getMonth(), 0); return d >= lm && d <= lme; }
      if (preset === 'custom' && customStart) {
        const [sy, sm, sd] = customStart.split('-').map(Number);
        const start = new Date(sy, sm - 1, sd);
        const [ey, em, ed] = (customEnd || customStart).split('-').map(Number);
        const end = new Date(ey, em - 1, ed);
        const [rangeStart, rangeEnd] = start <= end ? [start, end] : [end, start];
        return d >= rangeStart && d <= rangeEnd;
      }
      return true;
    });
  }, [orders, preset, customStart, customEnd]);

  const hosts = useMemo(() => {
    const named = Array.from(new Set(dateFiltered.map(o => o.host).filter(h => h && !/^\d+$/.test(h))));
    return ['All', ...named.sort()];
  }, [dateFiltered]);

  const filtered = selectedHost === 'All' ? dateFiltered : dateFiltered.filter(o => o.host === selectedHost);

  const byTab = useMemo(() => {
    const m: Record<string, { sales: number; profit: number }> = {};
    filtered.forEach(o => {
      if (!m[o.tab]) m[o.tab] = { sales: 0, profit: 0 };
      m[o.tab].sales += o.sold; m[o.tab].profit += o.profit;
    });
    return Object.entries(m).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime());
  }, [filtered]);

  const topBuyers = useMemo(() => {
    const m: Record<string, { spent: number; orders: number }> = {};
    filtered.forEach(o => { if (!m[o.buyer]) m[o.buyer] = { spent: 0, orders: 0 }; m[o.buyer].spent += o.sold; m[o.buyer].orders++; });
    return Object.entries(m).sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
  }, [filtered]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const btnActive = 'bg-amber-400 border-amber-400 text-slate-900';
  const btnInactive = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400';

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Sales Analytics</h1>
            <p className="text-xs text-slate-400">{today} · {filtered.length} orders</p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {DATE_PRESETS.map(p => (
              <button key={p.value} onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${preset === p.value ? btnActive : btnInactive}`}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)}
                  aria-label="Start date"
                  className="text-xs py-1.5 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)}
                  aria-label="End date"
                  className="text-xs py-1.5 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>
          ) : error ? (
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 border-l-4 border-l-red-500 rounded-xl p-6">
              <p className="font-bold text-red-600 mb-1">Error loading data</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{error}</p>
            </div>
          ) : (
            <>
              {/* Host filter */}
              <div className="flex gap-2 mb-6 flex-wrap">
                {hosts.map((h, i) => (
                  <button key={h} onClick={() => setSelectedHost(h)}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${selectedHost === h ? 'text-white border-transparent' : btnInactive}`}
                    style={selectedHost === h ? { backgroundColor: h === 'All' ? '#1E293B' : HOST_COLORS[(i - 1) % HOST_COLORS.length] } : {}}>
                    {h}
                  </button>
                ))}
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {(() => {
                  const rev = filtered.reduce((s, o) => s + o.sold, 0);
                  const profit = filtered.reduce((s, o) => s + o.profit, 0);
                  const margin = rev > 0 ? (profit / rev) * 100 : 0;
                  return [
                    { label: 'Revenue', value: `$${fmt(rev)}`, color: 'text-slate-900 dark:text-white', border: 'border-l-slate-400' },
                    { label: 'Profit', value: `$${fmt(profit)}`, color: profit >= 0 ? 'text-emerald-600' : 'text-red-500', border: profit >= 0 ? 'border-l-emerald-400' : 'border-l-red-400' },
                    { label: 'Avg Margin', value: `${margin.toFixed(1)}%`, color: 'text-amber-500', border: 'border-l-amber-400' },
                    { label: 'Orders', value: fmtInt(filtered.length), color: 'text-slate-900 dark:text-white', border: 'border-l-blue-400' },
                    { label: 'Shows', value: fmtInt(byTab.length), color: 'text-slate-900 dark:text-white', border: 'border-l-violet-400' },
                  ];
                })().map(kpi => (
                  <div key={kpi.label} className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 ${kpi.border} rounded-xl shadow-sm p-4`}>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">{kpi.label}</p>
                    <p className={`text-xl font-black ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Sales trend */}
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white text-sm">Sales & Profit by Show</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">Scroll to zoom · Drag to pan</p>
                  </div>
                  <button
                    onClick={() => lineChartRef.current?.resetZoom()}
                    className="px-2.5 py-1 text-[10px] font-bold border border-slate-200 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Reset Zoom
                  </button>
                </div>
                <Line ref={lineChartRef} data={{
                  labels: byTab.map(([tab]) => tab),
                  datasets: [
                    { label: 'Sales ($)', data: byTab.map(([, v]) => v.sales), borderColor: '#F59E0B', backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#FEF3C7', tension: 0.3, fill: true },
                    { label: 'Profit ($)', data: byTab.map(([, v]) => v.profit), borderColor: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEE2E2', tension: 0.3, fill: true },
                  ],
                }} options={chartOpts} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                {/* Show breakdown */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 dark:text-white mb-4 text-sm">Show Breakdown</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                      {['Show', 'Orders', 'Sales', 'Profit'].map(h => (
                        <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-2 ${h !== 'Show' ? 'text-right' : 'text-left'} px-2`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {byTab.slice((showPage - 1) * SHOW_PAGE_SIZE, showPage * SHOW_PAGE_SIZE).map(([tab, d]) => (
                        <tr key={tab} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 text-xs">{tab}</td>
                          <td className="py-2 px-2 text-right text-slate-400 text-xs">{filtered.filter(o => o.tab === tab).length}</td>
                          <td className="py-2 px-2 text-right font-semibold text-slate-900 dark:text-white text-xs">${fmt(d.sales)}</td>
                          <td className={`py-2 px-2 text-right font-bold text-xs ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmt(d.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {Math.ceil(byTab.length / SHOW_PAGE_SIZE) > 1 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-400">{(showPage - 1) * SHOW_PAGE_SIZE + 1}–{Math.min(showPage * SHOW_PAGE_SIZE, byTab.length)} of {byTab.length}</p>
                      <div className="flex gap-1">
                        <button onClick={() => setShowPage(p => Math.max(1, p - 1))} disabled={showPage === 1}
                          className="px-2.5 py-1 rounded text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">←</button>
                        {Array.from({ length: Math.ceil(byTab.length / SHOW_PAGE_SIZE) }, (_, i) => i + 1)
                          .filter(n => n === 1 || n === Math.ceil(byTab.length / SHOW_PAGE_SIZE) || Math.abs(n - showPage) <= 1)
                          .reduce<(number | string)[]>((acc, n, i, arr) => { if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push('...'); acc.push(n); return acc; }, [])
                          .map((n, i) => n === '...' ? (
                            <span key={`e${i}`} className="px-1.5 py-1 text-slate-400 text-xs">…</span>
                          ) : (
                            <button key={n} onClick={() => setShowPage(n as number)}
                              className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors ${showPage === n ? 'bg-amber-400 border-amber-400 text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                              {n}
                            </button>
                          ))}
                        <button onClick={() => setShowPage(p => Math.min(Math.ceil(byTab.length / SHOW_PAGE_SIZE), p + 1))} disabled={showPage === Math.ceil(byTab.length / SHOW_PAGE_SIZE)}
                          className="px-2.5 py-1 rounded text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">→</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Top buyers */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 dark:text-white mb-4 text-sm">Top Buyers</h2>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                      {['#', 'Buyer', 'Orders', 'Spent'].map(h => (
                        <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-2 ${h === 'Orders' || h === 'Spent' ? 'text-right' : 'text-left'} px-2`}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {topBuyers.map(([buyer, d], i) => (
                        <tr key={buyer} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="py-2 px-2 text-slate-400 text-xs font-bold">{i + 1}</td>
                          <td className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-300 text-xs">{buyer}</td>
                          <td className="py-2 px-2 text-right text-slate-400 text-xs">{d.orders}</td>
                          <td className="py-2 px-2 text-right font-black text-amber-500 text-xs">${fmt(d.spent)}</td>
                        </tr>
                      ))}
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
