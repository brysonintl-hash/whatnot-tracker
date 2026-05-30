'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import OnlineUsers from '@/components/OnlineUsers';
import type { Role } from '@/lib/types';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

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

function KPI({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '15' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900 dark:text-white mb-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 font-medium">{sub}</p>}
    </div>
  );
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

  function SortHeader({ col, label, align = 'left' }: { col: SortCol; label: string; align?: 'left' | 'right' }) {
    const isActive = sortCol === col;
    const colKey = col ?? '';
    return (
      <th className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === colKey ? null : colKey); }}
          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide py-3 px-4 hover:text-slate-700 dark:hover:text-slate-200 transition-colors w-full ${align === 'right' ? 'justify-end' : 'justify-start'} ${isActive ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}
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
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Admin Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <OnlineUsers />
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold">Admin</span>
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

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KPI label="Total Revenue" value={`$${fmt(revenue)}`} sub={`${filteredOrders.length.toLocaleString()} orders`} color="#F59E0B"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <KPI label="Gross Profit" value={`$${fmt(profit)}`} sub="after COGS" color="#10B981"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                />
                <KPI label="Avg Margin" value={`${margin.toFixed(1)}%`} sub="profit / revenue" color="#3B82F6"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
                <KPI label="Inventory Value" value={`$${fmt(invValue)}`} sub={`${items.length} SKUs`} color="#8B5CF6"
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                />
              </div>

              {/* Inventory alerts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">In Stock</span>
                  </div>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">{(items.length - outOfStock - lowStock).toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-900 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Low Stock (≤5)</span>
                  </div>
                  <p className="text-3xl font-black text-amber-500">{lowStock.toLocaleString()}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-900 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Out of Stock</span>
                  </div>
                  <p className="text-3xl font-black text-red-500">{outOfStock.toLocaleString()}</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Sales by Show (Last 12)</h2>
                  <Bar
                    data={{
                      labels: byTab.map(([t]) => t),
                      datasets: [{ label: 'Sales ($)', data: byTab.map(([, v]) => v), backgroundColor: '#FBBF24', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 4 }],
                    }}
                    options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 }, color: '#94a3b8' } }, y: { ticks: { font: { size: 10 }, color: '#94a3b8' } }, } }}
                  />
                </div>
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Revenue by Host</h2>
                  <div className="flex-1 flex items-center justify-center min-h-[260px]">
                    <Doughnut
                      data={{
                        labels: Object.keys(byHost),
                        datasets: [{ data: Object.values(byHost), backgroundColor: HOST_COLORS, borderWidth: 2, borderColor: '#fff' }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, color: '#94a3b8' } } },
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
                        <SortHeader col="buyer" label="Buyer" />
                        <SortHeader col="host" label="Host" />
                        <SortHeader col="tab" label="Show" />
                        <SortHeader col="sold" label="Revenue" align="right" />
                        <SortHeader col="profit" label="Profit" align="right" />
                        <SortHeader col="timestamp" label="Time" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedOrders.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-sm">No orders found</td></tr>
                      ) : (
                        pagedOrders.map((o, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs font-medium max-w-[180px] truncate">{o.productName || o.modelNum}</td>
                            <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs">{o.buyer}</td>
                            <td className="py-3 px-4"><span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                            <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs">{o.tab}</td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white text-xs">${o.sold.toFixed(2)}</td>
                            <td className={`py-3 px-4 text-right font-bold text-xs ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
                            <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs whitespace-nowrap">{fmtTimestamp(o.timestamp)}</td>
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
