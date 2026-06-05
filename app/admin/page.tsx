'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import OnlineUsers from '@/components/OnlineUsers';
import type { Role } from '@/lib/types';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler);

type Session = { username: string; role: string; name: string };
type Order = {
  tab: string; sold: number; profit: number; margin: number; host: string;
  buyer: string; modelNum: string; productName: string; timestamp: string;
};
type Item = { qty: number; modelNum: string; description: string; retail: number; total: number };
type DateRange = '7d' | '30d' | '90d' | 'all' | 'custom';

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function parseTabDate(tab: string) {
  const [m, d, y] = tab.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function fmtTimestamp(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const HOST_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899'];

function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 2 - ((v - min) / range) * (h - 4);
    return `${x},${y}`;
  });
  const linePath = `M ${pts.join(' L ')}`;
  const fillPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  const id = `sp-${color.replace('#', '')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${id})`} />
      <path d={linePath} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

type SortCol = 'product' | 'buyer' | 'host' | 'tab' | 'sold' | 'profit' | 'timestamp' | null;
type SortDir = 'asc' | 'desc';

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customDate, setCustomDate] = useState('');

  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(0);

  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
    Promise.all([
      fetch('/api/sales', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
    ]).then(([sales, inv]) => {
      setOrders(Array.isArray(sales) ? sales : []);
      setItems(Array.isArray(inv) ? inv : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { setPage(0); }, [search, perPage, dateRange, customDate, sortCol, sortDir]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        setFilterOpen(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (dateRange === '7d') {
        const c = new Date(now); c.setDate(now.getDate() - 7); if (d < c) return false;
      } else if (dateRange === '30d') {
        const c = new Date(now); c.setDate(now.getDate() - 30); if (d < c) return false;
      } else if (dateRange === '90d') {
        const c = new Date(now); c.setDate(now.getDate() - 90); if (d < c) return false;
      } else if (dateRange === 'custom' && customDate) {
        const picked = new Date(customDate);
        const ds = d.toDateString();
        const ps = picked.toDateString();
        if (ds !== ps) return false;
      }
      return true;
    });
  }, [orders, dateRange, customDate]);

  const revenue = filteredOrders.reduce((s, o) => s + o.sold, 0);
  const profit = filteredOrders.reduce((s, o) => s + o.profit, 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const outOfStock = items.filter(i => i.qty <= 0).length;
  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5).length;
  const invValue = items.reduce((s, i) => s + i.total, 0);

  const byTab = useMemo(() => {
    const m: Record<string, number> = {};
    filteredOrders.forEach(o => { m[o.tab] = (m[o.tab] || 0) + o.sold; });
    return Object.entries(m).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime()).slice(-12);
  }, [filteredOrders]);

  // Previous period for "vs prev" comparison
  const prevOrders = useMemo(() => {
    if (dateRange === 'all' || dateRange === 'custom') return [];
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const now = new Date();
    const end = new Date(now); end.setDate(now.getDate() - days);
    const start = new Date(now); start.setDate(now.getDate() - days * 2);
    return orders.filter(o => { const d = parseTabDate(o.tab); return d >= start && d < end; });
  }, [orders, dateRange]);

  const prevRevenue = prevOrders.reduce((s, o) => s + o.sold, 0);
  const prevProfit = prevOrders.reduce((s, o) => s + o.profit, 0);
  const prevMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

  // Sparkline data (revenue per show, last 12)
  const sparkData = byTab.map(([, v]) => v);

  const byHost = useMemo(() => {
    const m: Record<string, number> = {};
    filteredOrders.forEach(o => { if (o.host) m[o.host] = (m[o.host] || 0) + o.sold; });
    return m;
  }, [filteredOrders]);

  const searchedOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? filteredOrders.filter(o =>
          o.productName?.toLowerCase().includes(q) ||
          o.modelNum?.toLowerCase().includes(q) ||
          o.buyer?.toLowerCase().includes(q) ||
          o.host?.toLowerCase().includes(q) ||
          o.tab?.toLowerCase().includes(q)
        )
      : filteredOrders;
    if (!sortCol) return base;
    return [...base].sort((a, b) => {
      let av: string | number, bv: string | number;
      if (sortCol === 'product') { av = a.productName || a.modelNum; bv = b.productName || b.modelNum; }
      else if (sortCol === 'buyer') { av = a.buyer; bv = b.buyer; }
      else if (sortCol === 'host') { av = a.host; bv = b.host; }
      else if (sortCol === 'tab') { av = parseTabDate(a.tab).getTime(); bv = parseTabDate(b.tab).getTime(); }
      else if (sortCol === 'sold') { av = a.sold; bv = b.sold; }
      else if (sortCol === 'profit') { av = a.profit; bv = b.profit; }
      else { av = a.timestamp || ''; bv = b.timestamp || ''; }
      if (typeof av === 'number') return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filteredOrders, search, sortCol, sortDir]);

  const totalPages = Math.ceil(searchedOrders.length / perPage);
  const pagedOrders = searchedOrders.slice(page * perPage, (page + 1) * perPage);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const DATE_BTNS: { label: string; value: DateRange }[] = [
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
    { label: 'All Time', value: 'all' },
    { label: 'Custom', value: 'custom' },
  ];

  function applySort(col: SortCol, dir: SortDir) {
    setSortCol(col);
    setSortDir(dir);
    setFilterOpen(null);
  }

  function SortHeader({ col, label, align = 'left' }: { col: SortCol; label: string; align?: 'left' | 'right' | 'center' }) {
    const isActive = sortCol === col;
    const colKey = col ?? '';
    return (
      <th className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === colKey ? null : colKey); }}
          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide py-3 px-4 hover:text-slate-700 dark:hover:text-slate-200 transition-colors w-full ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'} ${isActive ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}
        >
          {label}
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isActive && sortDir === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              : isActive && sortDir === 'desc'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            }
          </svg>
        </button>
        {filterOpen === colKey && (
          <div
            className="absolute top-full left-0 z-30 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => applySort(col, 'asc')} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${isActive && sortDir === 'asc' ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              Sort A → Z
            </button>
            <button onClick={() => applySort(col, 'desc')} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${isActive && sortDir === 'desc' ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              Sort Z → A
            </button>
            {isActive && (
              <>
                <div className="border-t border-slate-100 dark:border-slate-700" />
                <button onClick={() => applySort(null, 'asc')} className="w-full text-left px-3 py-2 text-xs text-red-500 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  Clear Sort
                </button>
              </>
            )}
          </div>
        )}
      </th>
    );
  }

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden" onClick={() => setFilterOpen(null)}>
      <Sidebar role={session.role as Role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Dashboard</h1>
            <p className="text-xs text-slate-400">Welcome back, {session.name} — here&apos;s how Stack Bargains is performing.</p>
          </div>
          <div className="flex items-center gap-3">
            <OnlineUsers />
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading data...</div>
          ) : (
            <>
              {/* Date filter */}
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1">Period:</span>
                {DATE_BTNS.map(btn => (
                  <button
                    key={btn.value}
                    onClick={() => setDateRange(btn.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      dateRange === btn.value
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
                {dateRange === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 ml-1"
                  />
                )}
                <span className="ml-auto text-xs text-slate-400">{filteredOrders.length.toLocaleString()} orders in range</span>
              </div>

              {/* KPIs — Stripe-inspired */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Hero card — dark */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 shadow-lg sm:col-span-2 lg:col-span-1">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Gross Volume</p>
                    {(() => { const c = pct(revenue, prevRevenue); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}% vs prev.</span> : null; })()}
                  </div>
                  <p className="text-3xl font-black text-white mb-3">${fmt(revenue)}</p>
                  <Sparkline data={sparkData} color="#F59E0B" height={40} />
                  <p className="text-slate-500 text-[11px] mt-2">{filteredOrders.length.toLocaleString()} orders</p>
                </div>

                {/* Gross Profit */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">Gross Profit</p>
                    {(() => { const c = pct(profit, prevProfit); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}%</span> : null; })()}
                  </div>
                  <p className={`text-2xl font-black mb-2 ${profit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(profit)}</p>
                  <Sparkline data={sparkData.map((v, i) => v * (filteredOrders.length > 0 ? profit / revenue : 0))} color="#10B981" height={32} />
                  <p className="text-slate-400 text-[11px] mt-1">after COGS</p>
                </div>

                {/* Avg Margin */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">Avg Margin</p>
                    {(() => { const c = pct(margin, prevMargin); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}%</span> : null; })()}
                  </div>
                  <p className={`text-2xl font-black mb-2 ${margin >= 15 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{margin.toFixed(1)}%</p>
                  <Sparkline data={Array(sparkData.length).fill(margin)} color="#3B82F6" height={32} />
                  <p className="text-slate-400 text-[11px] mt-1">profit / revenue</p>
                </div>

                {/* Inventory Value */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">Inventory Value</p>
                  </div>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mb-2">${fmt(invValue)}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">{outOfStock} out</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{lowStock} low</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{items.length - outOfStock - lowStock} ok</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-2">{items.length} total SKUs</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                {/* Revenue trend — area line chart */}
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="font-bold text-slate-900 dark:text-white text-sm">Gross Volume</h2>
                      <p className="text-xl font-black text-slate-900 dark:text-white">${fmt(revenue)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-amber-400 inline-block" /> This period</span>
                    </div>
                  </div>
                  <Line
                    data={{
                      labels: byTab.map(([t]) => t),
                      datasets: [{
                        label: 'Sales ($)', data: byTab.map(([, v]) => v),
                        borderColor: '#F59E0B', backgroundColor: 'rgba(251,191,36,0.08)',
                        borderWidth: 2, fill: true, tension: 0.4,
                        pointRadius: 3, pointBackgroundColor: '#F59E0B', pointBorderColor: '#fff', pointBorderWidth: 1.5,
                      }],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` $${fmt(c.raw as number)}` } } },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
                        y: { grid: { color: 'rgba(148,163,184,0.08)' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: (v) => `$${(Number(v)/1000).toFixed(0)}k` } },
                      },
                    }}
                  />
                </div>

                {/* Revenue by Host donut */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
                  <div className="mb-3">
                    <h2 className="font-bold text-slate-900 dark:text-white text-sm">Revenue by Host</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{Object.keys(byHost).length} hosts</p>
                  </div>
                  <div className="flex-1 flex items-center justify-center min-h-[240px]">
                    <Doughnut
                      data={{
                        labels: Object.keys(byHost),
                        datasets: [{ data: Object.values(byHost), backgroundColor: HOST_COLORS, borderWidth: 3, borderColor: 'transparent', hoverBorderColor: '#fff' }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false, cutout: '68%',
                        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, color: '#94a3b8', usePointStyle: true, pointStyleWidth: 8 } } },
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Recent orders */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">Recent Orders</h2>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
                    <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search product, buyer, host..."
                      className="bg-transparent text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none flex-1"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-slate-400">Show</span>
                    <select
                      value={perPage}
                      onChange={e => setPerPage(Number(e.target.value))}
                      className="text-xs border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                    >
                      {[20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-xs text-slate-400">per page</span>
                  </div>
                  <span className="text-xs text-slate-400">{searchedOrders.length.toLocaleString()} results</span>
                </div>

                <div className="overflow-x-auto" ref={tableRef}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        <SortHeader col="product" label="Product" />
                        <SortHeader col="buyer" label="Buyer" align="center" />
                        <SortHeader col="host" label="Host" align="center" />
                        <SortHeader col="tab" label="Show" align="center" />
                        <SortHeader col="sold" label="Revenue" align="center" />
                        <SortHeader col="profit" label="Profit" align="center" />
                        <SortHeader col="timestamp" label="Time" align="center" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedOrders.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-sm">No orders found</td></tr>
                      ) : (
                        pagedOrders.map((o, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs font-medium max-w-[180px] truncate">{o.productName || o.modelNum}</td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs text-center">{o.buyer}</td>
                            <td className="py-3 px-4 text-center"><span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                            <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs text-center">{o.tab}</td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-900 dark:text-white text-xs">${o.sold.toFixed(2)}</td>
                            <td className={`py-3 px-4 text-center font-bold text-xs ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
                            <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs whitespace-nowrap text-center">{fmtTimestamp(o.timestamp)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700">
                    <span className="text-xs text-slate-400">
                      Page {page + 1} of {totalPages} · {searchedOrders.length.toLocaleString()} orders
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">«</button>
                      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">Prev</button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                        const pn = Math.max(0, Math.min(totalPages - 5, page - 2)) + idx;
                        return (
                          <button key={pn} onClick={() => setPage(pn)} className={`w-7 h-7 rounded text-xs font-bold transition-colors ${pn === page ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                            {pn + 1}
                          </button>
                        );
                      })}
                      <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">Next</button>
                      <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">»</button>
                    </div>
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
