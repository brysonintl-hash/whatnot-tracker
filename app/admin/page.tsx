'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import OnlineUsers from '@/components/OnlineUsers';
import type { Role } from '@/lib/types';

const USChoroplethMap = dynamic(() => import('@/components/USChoroplethMap'), { ssr: false });
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, ArcElement, Filler);

// ── Types ─────────────────────────────────────────────────────────────────────

type Session = { username: string; role: string; name: string };
type Order = {
  tab: string; sold: number; profit: number; margin: number; host: string;
  buyer: string; modelNum: string; productName: string; timestamp: string;
  shippingAddress?: string;
};
type Item = { qty: number; modelNum: string; description: string; retail: number; total: number };
type DateRange = '7d' | '30d' | '90d' | 'all' | 'custom';
type DashTab   = 'historical' | 'calendar' | 'shipping';
type SortCol   = 'product' | 'buyer' | 'host' | 'tab' | 'sold' | 'profit' | 'timestamp' | null;
type SortDir   = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function parseTabDate(tab: string) {
  const [m, d, y] = tab.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

function tabToKey(tab: string): string {
  const p = tab.split('/');
  if (p.length !== 3) return '';
  const [m, d, y] = p.map(Number);
  return `${2000 + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtTimestamp(ts: string): string {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function pct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

const HOST_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Icons ─────────────────────────────────────────────────────────────────────

const IC = {
  calIcon: <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  barIcon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  mapIcon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>,
};

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const w = 100, h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / range) * (h - 4)}`);
  const line = `M ${pts.join(' L ')}`;
  const fill = `${line} L ${w},${h} L 0,${h} Z`;
  const id = `sp-${color.replace('#', '')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({ orders }: { orders: Order[] }) {
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const todayKey = dKey(now.getFullYear(), now.getMonth(), now.getDate());

  const ordersByDay = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; count: number }> = {};
    orders.forEach(o => {
      const k = tabToKey(o.tab); if (!k) return;
      if (!map[k]) map[k] = { revenue: 0, profit: 0, count: 0 };
      map[k].revenue += o.sold; map[k].profit += o.profit; map[k].count++;
    });
    return map;
  }, [orders]);

  const monthOrders = useMemo(() =>
    orders.filter(o => { const d = parseTabDate(o.tab); return d.getFullYear() === calYear && d.getMonth() === calMonth; }),
  [orders, calYear, calMonth]);

  const mRev    = monthOrders.reduce((s, o) => s + o.sold, 0);
  const mProfit = monthOrders.reduce((s, o) => s + o.profit, 0);
  const mMargin = mRev > 0 ? (mProfit / mRev) * 100 : 0;
  const mCount  = monthOrders.length;
  const opDays  = Object.keys(ordersByDay).filter(k => { const [y, m] = k.split('-').map(Number); return y === calYear && m === calMonth + 1 && ordersByDay[k].revenue > 0; }).length;

  const maxDay = useMemo(() => {
    let max = 0;
    for (let d = 1; d <= new Date(calYear, calMonth + 1, 0).getDate(); d++) {
      const r = ordersByDay[dKey(calYear, calMonth, d)]?.revenue ?? 0;
      if (r > max) max = r;
    }
    return max;
  }, [ordersByDay, calYear, calMonth]);

  const cells = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const last = new Date(calYear, calMonth + 1, 0).getDate();
    const arr: Array<{ day: number | null; key: string | null }> = [];
    for (let i = 0; i < firstDow; i++) arr.push({ day: null, key: null });
    for (let d = 1; d <= last; d++) arr.push({ day: d, key: dKey(calYear, calMonth, d) });
    return arr;
  }, [calYear, calMonth]);

  const dayBg  = (r: number) => { if (!r || !maxDay) return ''; const x = r/maxDay; return x>=.6 ? 'bg-green-100 dark:bg-green-900/30' : x>=.25 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-50 dark:bg-red-900/20'; };
  const dayDot = (r: number) => { if (!r || !maxDay) return ''; const x = r/maxDay; return x>=.6 ? 'bg-green-500' : x>=.25 ? 'bg-amber-500' : 'bg-red-400'; };

  const prevM = () => { if (calMonth === 0) { setCalYear(y=>y-1); setCalMonth(11); } else setCalMonth(m=>m-1); };
  const nextM = () => { if (calMonth === 11) { setCalYear(y=>y+1); setCalMonth(0); } else setCalMonth(m=>m+1); };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 shadow-lg">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Revenue</p>
          <p className="text-3xl font-black text-white mb-3">${fmt(mRev)}</p>
          <p className="text-slate-500 text-[11px]">{opDays} operating day{opDays !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Gross Profit</p>
          <p className={`text-2xl font-black mb-1 ${mProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(mProfit)}</p>
          <p className="text-slate-400 text-[11px]">{mMargin.toFixed(1)}% margin</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Net Profit</p>
          <p className={`text-2xl font-black mb-1 ${mProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(mProfit)}</p>
          <p className="text-slate-400 text-[11px]">{mProfit >= 0 ? 'Profitable' : 'Not profitable'}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Sales</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mb-1">{mCount}</p>
          <p className="text-slate-400 text-[11px]">{opDays > 0 ? (mCount / opDays).toFixed(1) : '0'} avg/day</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center">{IC.calIcon}</div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">{MONTH_NAMES[calMonth]} {calYear}</h2>
              <p className="text-[10px] text-slate-400">Daily financial overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Today</button>
            <button onClick={prevM} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <button onClick={nextM} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell.day || !cell.key) return <div key={i} className="border-r border-b border-slate-50 dark:border-slate-700/40 h-24" />;
            const data = ordersByDay[cell.key]; const rev = data?.revenue ?? 0; const isToday = cell.key === todayKey;
            return (
              <div key={cell.key} className={`border-r border-b border-slate-100 dark:border-slate-700/40 h-24 p-2.5 ${rev > 0 ? dayBg(rev) : 'hover:bg-slate-50 dark:hover:bg-slate-700/20'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  {isToday
                    ? <span className="text-[9px] font-black text-white bg-blue-500 rounded px-1.5 py-0.5">{cell.day} TODAY</span>
                    : <span className={`text-xs font-bold ${rev > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>{cell.day}</span>}
                  {rev > 0 && <div className={`w-2 h-2 rounded-full ${dayDot(rev)}`} />}
                </div>
                {rev > 0
                  ? <div><p className="text-[11px] font-black text-slate-800 dark:text-slate-200">${fmt(rev)}</p><p className="text-[9px] text-slate-400 mt-0.5">{data.count} order{data.count !== 1 ? 's' : ''}</p></div>
                  : <p className="text-[10px] text-slate-300 dark:text-slate-600">No sales</p>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-5 px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60">
          {[{l:'High',d:'bg-green-500'},{l:'Medium',d:'bg-amber-500'},{l:'Low',d:'bg-red-400'},{l:'No sales',d:'bg-slate-200 dark:bg-slate-600'}].map(({l,d}) => (
            <div key={l} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${d}`}/><span className="text-[11px] text-slate-500 dark:text-slate-400">{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ShipmentDistribution ──────────────────────────────────────────────────────

function ShipmentDistribution({ orders }: { orders: Order[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const stateData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      const addr = o.shippingAddress?.trim();
      if (!addr) return;
      let st = '';
      if (/^[A-Z]{2}$/.test(addr)) {
        st = addr; // new format: just "TX"
      } else {
        // old format: "City, ST, ZIP, US"
        const parts = addr.split(',').map((p: string) => p.trim());
        const candidate = parts[1] ?? '';
        if (/^[A-Z]{2}$/.test(candidate) && candidate !== 'US') st = candidate;
      }
      if (st) counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const total = Object.values(stateData).reduce((s, v) => s + v, 0);
  const maxCount = total > 0 ? Math.max(...Object.values(stateData)) : 0;
  const topStates = Object.entries(stateData).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const hovData = hovered ? { count: stateData[hovered] || 0, pct: total > 0 ? ((stateData[hovered] || 0) / total) * 100 : 0 } : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Map card */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Shipment Distribution</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {total > 0
                ? `${total.toLocaleString()} orders across ${Object.keys(stateData).length} states`
                : 'No shipping data — add addresses to column O in your spreadsheet'}
            </p>
          </div>
          {hovered && hovData && (
            <div className="text-right">
              <p className="text-sm font-black text-slate-900 dark:text-white">{hovered}</p>
              <p className="text-xs text-slate-400">{hovData.count.toLocaleString()} order{hovData.count !== 1 ? 's' : ''} · {hovData.pct.toFixed(1)}%</p>
            </div>
          )}
        </div>

        <USChoroplethMap
          stateData={stateData}
          maxCount={maxCount}
          hovered={hovered}
          onHover={setHovered}
        />

        {/* Color legend */}
        <div className="flex items-center gap-2 mt-1 justify-center">
          <span className="text-[10px] text-slate-500">0</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }, (_, i) => {
              const t = i / 11;
              const stops = [[209,250,229],[110,231,183],[16,185,129],[4,120,87],[6,78,59]] as const;
              const raw = t * 4;
              const si = Math.min(Math.floor(raw), 3);
              const f = raw - si;
              const r = Math.round(stops[si][0] * (1 - f) + stops[si + 1][0] * f);
              const g = Math.round(stops[si][1] * (1 - f) + stops[si + 1][1] * f);
              const b = Math.round(stops[si][2] * (1 - f) + stops[si + 1][2] * f);
              return <div key={i} className="w-5 h-2.5 rounded-sm" style={{ background: `rgb(${r},${g},${b})` }} />;
            })}
          </div>
          <span className="text-[10px] text-slate-500">{maxCount > 0 ? maxCount.toLocaleString() : 'Max'}</span>
        </div>
      </div>

      {/* Top states table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
        <h2 className="text-base font-black text-slate-900 dark:text-white mb-4">Top States</h2>
        {total === 0 ? (
          <p className="text-slate-400 text-sm leading-relaxed">
            Add shipping addresses to column O in your spreadsheet.<br /><br />
            Format: <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">City, ST, ZIP, US</span>
          </p>
        ) : (
          <div className="space-y-2.5">
            {topStates.map(([st, count], i) => (
              <div
                key={st}
                className={`rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${hovered === st ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                onMouseEnter={() => setHovered(st)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4 text-right">{i + 1}</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">{st}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{count.toLocaleString()}</span>
                    <span className="text-[11px] text-slate-400">{((count / total) * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                  <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${(count / topStates[0][1]) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [items, setItems]     = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [dashTab, setDashTab]     = useState<DashTab>('historical');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [customDate, setCustomDate] = useState('');

  const [search, setSearch]   = useState('');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage]       = useState(0);
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
      setItems(Array.isArray(inv)   ? inv   : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { setPage(0); }, [search, perPage, dateRange, customDate, sortCol, sortDir]);

  useEffect(() => {
    function h(e: MouseEvent) { if (tableRef.current && !tableRef.current.contains(e.target as Node)) setFilterOpen(null); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const now = new Date();

  const filteredOrders = useMemo(() => orders.filter(o => {
    const d = parseTabDate(o.tab);
    if (dateRange === '7d')  { const c = new Date(now); c.setDate(now.getDate() - 7);  if (d < c) return false; }
    if (dateRange === '30d') { const c = new Date(now); c.setDate(now.getDate() - 30); if (d < c) return false; }
    if (dateRange === '90d') { const c = new Date(now); c.setDate(now.getDate() - 90); if (d < c) return false; }
    if (dateRange === 'custom' && customDate) { const p = new Date(customDate); if (d.toDateString() !== p.toDateString()) return false; }
    return true;
  }), [orders, dateRange, customDate]);

  const revenue = filteredOrders.reduce((s, o) => s + o.sold, 0);
  const profit  = filteredOrders.reduce((s, o) => s + o.profit, 0);
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
  const outOfStock = items.filter(i => i.qty <= 0).length;
  const lowStock   = items.filter(i => i.qty > 0 && i.qty <= 5).length;
  const invValue   = items.reduce((s, i) => s + i.total, 0);

  const byTab = useMemo(() => {
    const m: Record<string, number> = {};
    filteredOrders.forEach(o => { m[o.tab] = (m[o.tab] || 0) + o.sold; });
    return Object.entries(m).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime()).slice(-12);
  }, [filteredOrders]);

  const prevOrders = useMemo(() => {
    if (dateRange === 'all' || dateRange === 'custom') return [];
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const end = new Date(now); end.setDate(now.getDate() - days);
    const start = new Date(now); start.setDate(now.getDate() - days * 2);
    return orders.filter(o => { const d = parseTabDate(o.tab); return d >= start && d < end; });
  }, [orders, dateRange]);

  const prevRevenue = prevOrders.reduce((s, o) => s + o.sold, 0);
  const prevProfit  = prevOrders.reduce((s, o) => s + o.profit, 0);
  const prevMargin  = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;
  const sparkData   = byTab.map(([, v]) => v);

  const byHost = useMemo(() => {
    const m: Record<string, number> = {};
    filteredOrders.forEach(o => { if (o.host) m[o.host] = (m[o.host] || 0) + o.sold; });
    return m;
  }, [filteredOrders]);

  const searchedOrders = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q ? filteredOrders.filter(o =>
      o.productName?.toLowerCase().includes(q) || o.modelNum?.toLowerCase().includes(q) ||
      o.buyer?.toLowerCase().includes(q) || o.host?.toLowerCase().includes(q) || o.tab?.toLowerCase().includes(q)
    ) : filteredOrders;
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

  const totalPages  = Math.ceil(searchedOrders.length / perPage);
  const pagedOrders = searchedOrders.slice(page * perPage, (page + 1) * perPage);

  function applySort(col: SortCol, dir: SortDir) { setSortCol(col); setSortDir(dir); setFilterOpen(null); }

  function SortHeader({ col, label, align = 'left' }: { col: SortCol; label: string; align?: 'left' | 'right' | 'center' }) {
    const isActive = sortCol === col, colKey = col ?? '';
    return (
      <th className="relative">
        <button onClick={e => { e.stopPropagation(); setFilterOpen(filterOpen === colKey ? null : colKey); }}
          className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide py-3 px-4 hover:text-slate-700 dark:hover:text-slate-200 transition-colors w-full ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'} ${isActive ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>
          {label}
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isActive && sortDir === 'asc' ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
              : isActive && sortDir === 'desc' ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />}
          </svg>
        </button>
        {filterOpen === colKey && (
          <div className="absolute top-full left-0 z-30 w-36 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <button onClick={() => applySort(col, 'asc')} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${isActive && sortDir === 'asc' ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> Sort A → Z</button>
            <button onClick={() => applySort(col, 'desc')} className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${isActive && sortDir === 'desc' ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300'}`}><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> Sort Z → A</button>
            {isActive && (<><div className="border-t border-slate-100 dark:border-slate-700" /><button onClick={() => applySort(null, 'asc')} className="w-full text-left px-3 py-2 text-xs text-red-500 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg> Clear Sort</button></>)}
          </div>
        )}
      </th>
    );
  }

  const DATE_BTNS: { label: string; value: DateRange }[] = [
    { label: '7 Days', value: '7d' }, { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' }, { label: 'All Time', value: 'all' }, { label: 'Custom', value: 'custom' },
  ];

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden" onClick={() => setFilterOpen(null)}>
      <Sidebar role={session.role as Role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">

        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Dashboard</h1>
            <p className="text-xs text-slate-400">Welcome back, {session.name}</p>
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
              {/* Tab bar */}
              <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 rounded-2xl p-1.5 w-fit mb-6">
                {([
                  { key: 'historical' as const, label: 'Historical Analytics', icon: IC.barIcon },
                  { key: 'calendar'   as const, label: 'Calendar View',        icon: IC.calIcon },
                  { key: 'shipping'   as const, label: 'Shipping Map',         icon: IC.mapIcon },
                ]).map(t => (
                  <button key={t.key} onClick={() => setDashTab(t.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${dashTab === t.key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* ── HISTORICAL ANALYTICS ─────────────────────────────────── */}
              {dashTab === 'historical' && (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1">Period:</span>
                    {DATE_BTNS.map(btn => (
                      <button key={btn.value} onClick={() => setDateRange(btn.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${dateRange === btn.value ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'}`}>
                        {btn.label}
                      </button>
                    ))}
                    {dateRange === 'custom' && <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} className="text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 ml-1" />}
                    <span className="ml-auto text-xs text-slate-400">{filteredOrders.length.toLocaleString()} orders in range</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 shadow-lg sm:col-span-2 lg:col-span-1">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Gross Volume</p>
                        {(() => { const c = pct(revenue, prevRevenue); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}% vs prev.</span> : null; })()}
                      </div>
                      <p className="text-3xl font-black text-white mb-3">${fmt(revenue)}</p>
                      <Sparkline data={sparkData} color="#F59E0B" height={40} />
                      <p className="text-slate-500 text-[11px] mt-2">{filteredOrders.length.toLocaleString()} orders</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">Gross Profit</p>
                        {(() => { const c = pct(profit, prevProfit); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}%</span> : null; })()}
                      </div>
                      <p className={`text-2xl font-black mb-2 ${profit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(profit)}</p>
                      <Sparkline data={sparkData.map(v => v * (revenue > 0 ? profit / revenue : 0))} color="#10B981" height={32} />
                      <p className="text-slate-400 text-[11px] mt-1">after COGS</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">Avg Margin</p>
                        {(() => { const c = pct(margin, prevMargin); return c !== null ? <span className={`text-xs font-bold ${c >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{c >= 0 ? '↑' : '↓'} {Math.abs(c).toFixed(1)}%</span> : null; })()}
                      </div>
                      <p className={`text-2xl font-black mb-2 ${margin >= 15 ? 'text-emerald-600 dark:text-emerald-400' : margin >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{margin.toFixed(1)}%</p>
                      <Sparkline data={Array(sparkData.length).fill(margin)} color="#3B82F6" height={32} />
                      <p className="text-slate-400 text-[11px] mt-1">profit / revenue</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                      <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Inventory Value</p>
                      <p className="text-2xl font-black text-slate-900 dark:text-white mb-2">${fmt(invValue)}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">{outOfStock} out</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">{lowStock} low</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">{items.length - outOfStock - lowStock} ok</span>
                      </div>
                      <p className="text-slate-400 text-[11px] mt-2">{items.length} total SKUs</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                    <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div><h2 className="font-bold text-slate-900 dark:text-white text-sm">Gross Volume</h2><p className="text-xl font-black text-slate-900 dark:text-white">${fmt(revenue)}</p></div>
                        <span className="flex items-center gap-1 text-xs text-slate-400"><span className="w-2.5 h-1.5 rounded-sm bg-amber-400 inline-block" /> This period</span>
                      </div>
                      <Line data={{ labels: byTab.map(([t]) => t), datasets: [{ label: 'Sales ($)', data: byTab.map(([, v]) => v), borderColor: '#F59E0B', backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#F59E0B', pointBorderColor: '#fff', pointBorderWidth: 1.5 }] }}
                        options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` $${fmt(c.raw as number)}` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } }, y: { grid: { color: 'rgba(148,163,184,0.08)' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => `$${(Number(v)/1000).toFixed(0)}k` } } } }} />
                    </div>
                    <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
                      <div className="mb-3"><h2 className="font-bold text-slate-900 dark:text-white text-sm">Revenue by Host</h2><p className="text-xs text-slate-400 mt-0.5">{Object.keys(byHost).length} hosts</p></div>
                      <div className="flex-1 flex items-center justify-center min-h-[240px]">
                        <Doughnut data={{ labels: Object.keys(byHost), datasets: [{ data: Object.values(byHost), backgroundColor: HOST_COLORS, borderWidth: 3, borderColor: 'transparent', hoverBorderColor: '#fff' }] }}
                          options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, color: '#94a3b8', usePointStyle: true, pointStyleWidth: 8 } } } }} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                      <h2 className="font-bold text-slate-900 dark:text-white text-sm">Recent Orders</h2>
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
                        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, buyer, host..." className="bg-transparent text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none flex-1" />
                        {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                      </div>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs text-slate-400">Show</span>
                        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} className="text-xs border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">{[20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select>
                        <span className="text-xs text-slate-400">per page</span>
                      </div>
                      <span className="text-xs text-slate-400">{searchedOrders.length.toLocaleString()} results</span>
                    </div>
                    <div className="overflow-x-auto" ref={tableRef}>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-slate-100 dark:border-slate-700"><SortHeader col="product" label="Product" /><SortHeader col="buyer" label="Buyer" align="center" /><SortHeader col="host" label="Host" align="center" /><SortHeader col="tab" label="Show" align="center" /><SortHeader col="sold" label="Revenue" align="center" /><SortHeader col="profit" label="Profit" align="center" /><SortHeader col="timestamp" label="Time" align="center" /></tr></thead>
                        <tbody>
                          {pagedOrders.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-sm">No orders found</td></tr>
                            : pagedOrders.map((o, i) => (
                              <tr key={i} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs font-medium max-w-[180px] truncate">{o.productName || o.modelNum}</td>
                                <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs text-center">{o.buyer}</td>
                                <td className="py-3 px-4 text-center"><span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-[10px] px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                                <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs text-center">{o.tab}</td>
                                <td className="py-3 px-4 text-center font-semibold text-slate-900 dark:text-white text-xs">${o.sold.toFixed(2)}</td>
                                <td className={`py-3 px-4 text-center font-bold text-xs ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
                                <td className="py-3 px-4 text-slate-400 dark:text-slate-500 text-xs whitespace-nowrap text-center">{fmtTimestamp(o.timestamp)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-700">
                        <span className="text-xs text-slate-400">Page {page + 1} of {totalPages} · {searchedOrders.length.toLocaleString()} orders</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">«</button>
                          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="px-3 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">Prev</button>
                          {Array.from({length: Math.min(5, totalPages)}, (_, idx) => { const pn = Math.max(0, Math.min(totalPages-5, page-2)) + idx; return <button key={pn} onClick={() => setPage(pn)} className={`w-7 h-7 rounded text-xs font-bold transition-colors ${pn === page ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{pn+1}</button>; })}
                          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1} className="px-3 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">Next</button>
                          <button onClick={() => setPage(totalPages-1)} disabled={page >= totalPages-1} className="px-2 py-1 rounded text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30">»</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── CALENDAR VIEW ────────────────────────────────────────── */}
              {dashTab === 'calendar' && <CalendarView orders={orders} />}

              {/* ── SHIPPING MAP ──────────────────────────────────────────── */}
              {dashTab === 'shipping' && <ShipmentDistribution orders={filteredOrders} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
