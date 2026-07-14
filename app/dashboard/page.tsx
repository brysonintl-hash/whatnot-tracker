'use client';

import { useEffect, useState, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from 'chart.js';
import { useTheme } from '@/lib/useTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

// ── Types ──────────────────────────────────────────────────────────────────────

type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  timestamp: string; host: string;
};

type DashTab = 'today' | 'historical' | 'calendar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

function tabToKey(tab: string): string {
  const parts = tab.split('/');
  if (parts.length !== 3) return '';
  const [m, d, y] = parts.map(Number);
  return `${2000 + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctDiff(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return curr > 0 ? 100 : -100;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function filterByPreset(orders: Order[], preset: string, customStart: string, customEnd: string): Order[] {
  const now = new Date();
  const today = startOfDay(now);

  return orders.filter(o => {
    const d = parseTabDate(o.tab);
    if (preset === 'today') return d >= today;
    if (preset === 'yesterday') {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      return d >= y && d < today;
    }
    if (preset === 'week') {
      const w = new Date(today); w.setDate(today.getDate() - today.getDay());
      return d >= w;
    }
    if (preset === 'lastweek') {
      const end = new Date(today); end.setDate(today.getDate() - today.getDay());
      const start = new Date(end); start.setDate(end.getDate() - 7);
      return d >= start && d < end;
    }
    if (preset === '2weeks') {
      const w = new Date(today); w.setDate(today.getDate() - 14); return d >= w;
    }
    if (preset === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (preset === 'lastmonth') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lme = new Date(now.getFullYear(), now.getMonth(), 0);
      return d >= lm && d <= lme;
    }
    if (preset === 'custom') {
      if (customStart && customEnd) {
        const s = new Date(customStart + 'T00:00:00');
        const e = new Date(customEnd + 'T23:59:59');
        return d >= s && d <= e;
      }
      if (customStart) {
        const [cy, cm, cd] = customStart.split('-').map(Number);
        const sel = new Date(cy, cm - 1, cd);
        return d.getTime() === sel.getTime();
      }
    }
    return true;
  });
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const HOST_COLORS = ['#F59E0B','#DC2626','#3B82F6','#10B981','#8B5CF6','#EC4899','#F97316'];

const HIST_PRESETS = [
  { label: 'Today',      value: 'today' },
  { label: 'Yesterday',  value: 'yesterday' },
  { label: 'This Week',  value: 'week' },
  { label: 'Last Week',  value: 'lastweek' },
  { label: 'Last 2 Weeks', value: '2weeks' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastmonth' },
  { label: 'All Time',   value: 'all' },
  { label: 'Custom',     value: 'custom' },
];

// ── Icon objects ───────────────────────────────────────────────────────────────

const IC = {
  revenue: <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  cart:    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  tag:     <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>,
  box:     <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  wallet:  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>,
  cash:    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  calIcon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  barIcon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
};

// ── MetricCard ─────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  cardBg: string;
  valueColor?: string;
  trend?: number | null;
  trendLabel?: string;
}

function MetricCard({ label, value, sub, icon, iconBg, cardBg, valueColor = 'text-gray-900 dark:text-white', trend, trendLabel = 'vs yesterday' }: MetricCardProps) {
  const up = trend !== null && trend !== undefined && trend > 0.05;
  const dn = trend !== null && trend !== undefined && trend < -0.05;
  return (
    <div className={`rounded-2xl p-5 ${cardBg}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${iconBg}`}>
          {icon}
        </div>
        <span className={`flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-green-600 dark:text-green-400' : dn ? 'text-red-500 dark:text-red-400' : 'text-gray-400'}`}>
          {up ? '↗' : dn ? '↘' : '→'}&nbsp;
          {trend !== null && trend !== undefined ? `${Math.abs(trend).toFixed(1)}%` : '0.0%'} {trendLabel}
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-black mb-1.5 ${valueColor}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

// ── computeMetrics ─────────────────────────────────────────────────────────────

function computeMetrics(orders: Order[]) {
  const revenue   = orders.reduce((s, o) => s + o.sold, 0);
  const cogs      = orders.reduce((s, o) => s + o.cost, 0);
  const profit    = orders.reduce((s, o) => s + o.profit, 0);
  const count     = orders.length;
  const margin    = revenue > 0 ? (profit / revenue) * 100 : 0;
  const avgTicket = count > 0 ? revenue / count : 0;
  const shows     = new Set(orders.map(o => o.tab)).size;
  return { revenue, cogs, profit, count, margin, avgTicket, shows };
}

// ── MetricGrid ─────────────────────────────────────────────────────────────────

function MetricGrid({ orders, prevOrders, trendLabel }: { orders: Order[]; prevOrders: Order[]; trendLabel: string }) {
  const cur  = computeMetrics(orders);
  const prev = computeMetrics(prevOrders);

  const cards: MetricCardProps[] = [
    {
      label: 'Revenue',
      value: `$${fmt(cur.revenue)}`,
      sub: `Avg/order: $${fmt(cur.avgTicket)} · ${cur.shows} show${cur.shows !== 1 ? 's' : ''}`,
      icon: IC.revenue,
      iconBg: 'bg-orange-400',
      cardBg: 'bg-amber-50 dark:bg-amber-900/10',
      valueColor: 'text-amber-500',
      trend: pctDiff(cur.revenue, prev.revenue),
      trendLabel,
    },
    {
      label: 'Total Sales',
      value: String(cur.count),
      sub: `Avg ticket: $${fmt(cur.avgTicket)} · Avg/show: ${cur.shows > 0 ? (cur.count / cur.shows).toFixed(1) : '0'}`,
      icon: IC.cart,
      iconBg: 'bg-blue-500',
      cardBg: 'bg-blue-50 dark:bg-blue-900/10',
      valueColor: 'text-blue-500',
      trend: pctDiff(cur.count, prev.count),
      trendLabel,
    },
    {
      label: 'Avg Margin',
      value: `${cur.margin.toFixed(1)}%`,
      sub: `Based on ${cur.count} order${cur.count !== 1 ? 's' : ''} · Target: 30%`,
      icon: IC.tag,
      iconBg: 'bg-orange-400',
      cardBg: 'bg-amber-50 dark:bg-amber-900/10',
      valueColor: cur.margin >= 30 ? 'text-green-500' : cur.margin >= 20 ? 'text-amber-500' : 'text-red-500',
      trend: pctDiff(cur.margin, prev.margin),
      trendLabel,
    },
    {
      label: 'COGS',
      value: `$${fmt(cur.cogs)}`,
      sub: 'Cost of Goods Sold',
      icon: IC.box,
      iconBg: 'bg-yellow-500',
      cardBg: 'bg-yellow-50 dark:bg-yellow-900/10',
      valueColor: 'text-yellow-600 dark:text-yellow-400',
      trend: pctDiff(cur.cogs, prev.cogs),
      trendLabel,
    },
    {
      label: 'Gross Profit',
      value: `$${fmt(cur.profit)}`,
      sub: `COGS: $${fmt(cur.cogs)} · Margin: ${cur.margin.toFixed(1)}%`,
      icon: IC.wallet,
      iconBg: 'bg-purple-500',
      cardBg: 'bg-purple-50 dark:bg-purple-900/10',
      valueColor: cur.profit >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-red-500',
      trend: pctDiff(cur.profit, prev.profit),
      trendLabel,
    },
    {
      label: 'Net Profit',
      value: `$${fmt(cur.profit)}`,
      sub: `Margin: ${cur.margin.toFixed(1)}%`,
      icon: IC.cash,
      iconBg: 'bg-orange-500',
      cardBg: 'bg-amber-50 dark:bg-amber-900/10',
      valueColor: cur.profit >= 0 ? 'text-amber-500' : 'text-red-500',
      trend: pctDiff(cur.profit, prev.profit),
      trendLabel,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(c => <MetricCard key={c.label} {...c} />)}
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────

function CalendarView({ orders }: { orders: Order[] }) {
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const todayKey = dKey(now.getFullYear(), now.getMonth(), now.getDate());

  const ordersByDay = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; count: number }> = {};
    orders.forEach(o => {
      const k = tabToKey(o.tab);
      if (!k) return;
      if (!map[k]) map[k] = { revenue: 0, profit: 0, count: 0 };
      map[k].revenue += o.sold;
      map[k].profit  += o.profit;
      map[k].count++;
    });
    return map;
  }, [orders]);

  const monthOrders = useMemo(() => {
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    });
  }, [orders, calYear, calMonth]);

  const monthMetrics = useMemo(() => computeMetrics(monthOrders), [monthOrders]);

  const maxDayRevenue = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    let max = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dKey(calYear, calMonth, d);
      const rev = ordersByDay[k]?.revenue ?? 0;
      if (rev > max) max = rev;
    }
    return max;
  }, [ordersByDay, calYear, calMonth]);

  const cells = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const arr: Array<{ day: number | null; key: string | null }> = [];
    for (let i = 0; i < firstDow; i++) arr.push({ day: null, key: null });
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, key: dKey(calYear, calMonth, d) });
    return arr;
  }, [calYear, calMonth]);

  function dayColor(revenue: number): string {
    if (revenue === 0 || maxDayRevenue === 0) return '';
    const ratio = revenue / maxDayRevenue;
    if (ratio >= 0.6) return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-700';
    if (ratio >= 0.25) return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700';
    return 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800';
  }

  function dayDotColor(revenue: number): string {
    if (revenue === 0 || maxDayRevenue === 0) return '';
    const ratio = revenue / maxDayRevenue;
    if (ratio >= 0.6) return 'bg-green-500';
    if (ratio >= 0.25) return 'bg-amber-500';
    return 'bg-red-400';
  }

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };
  const goToday = () => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); };

  const operatingDays = Object.keys(ordersByDay).filter(k => {
    const [y, m] = k.split('-').map(Number);
    return y === calYear && m === calMonth + 1;
  }).length;

  return (
    <div>
      {/* Month summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Revenue', value: `$${fmt(monthMetrics.revenue)}`, sub: `${operatingDays} operating day${operatingDays !== 1 ? 's' : ''}`, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10', icon: IC.revenue, iconBg: 'bg-orange-400' },
          { label: 'Gross Profit', value: `$${fmt(monthMetrics.profit)}`, sub: `${monthMetrics.margin.toFixed(1)}% margin`, color: monthMetrics.profit >= 0 ? 'text-purple-600 dark:text-purple-400' : 'text-red-500', bg: 'bg-purple-50 dark:bg-purple-900/10', icon: IC.wallet, iconBg: 'bg-purple-500' },
          { label: 'Net Profit', value: `$${fmt(monthMetrics.profit)}`, sub: monthMetrics.profit >= 0 ? 'Profitable' : 'Not profitable', color: monthMetrics.profit >= 0 ? 'text-amber-500' : 'text-red-500', bg: 'bg-amber-50 dark:bg-amber-900/10', icon: IC.cash, iconBg: 'bg-orange-500' },
          { label: 'Total Sales', value: String(monthMetrics.count), sub: `${operatingDays > 0 ? (monthMetrics.count / operatingDays).toFixed(1) : '0'} avg/day`, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/10', icon: IC.cart, iconBg: 'bg-blue-500' },
        ].map(c => (
          <div key={c.label} className={`rounded-2xl p-4 ${c.bg}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${c.iconBg}`}>{c.icon}</div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
            </div>
            <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center">{IC.calIcon}</div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white">{MONTH_NAMES[calMonth]} {calYear}</h2>
            </div>
            <p className="text-[11px] text-gray-400 ml-9">Daily financial overview</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goToday} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Today
            </button>
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell.day || !cell.key) {
              return <div key={i} className="border-r border-b border-gray-50 dark:border-gray-700/50 h-24" />;
            }
            const data     = ordersByDay[cell.key];
            const isToday  = cell.key === todayKey;
            const hasSales = data && data.revenue > 0;
            return (
              <div
                key={cell.key}
                className={`border-r border-b border-gray-100 dark:border-gray-700/50 h-24 p-2.5 transition-colors ${
                  hasSales ? dayColor(data.revenue) : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'
                }`}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1.5">
                  {isToday ? (
                    <span className="text-[10px] font-black text-white bg-blue-500 rounded px-1.5 py-0.5 leading-tight">{cell.day} TODAY</span>
                  ) : (
                    <span className={`text-xs font-bold ${hasSales ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{cell.day}</span>
                  )}
                  {hasSales && <div className={`w-2 h-2 rounded-full ${dayDotColor(data.revenue)}`} />}
                </div>
                {/* Sales info */}
                {hasSales ? (
                  <div>
                    <p className="text-[11px] font-black text-gray-800 dark:text-gray-200 leading-tight">${fmt(data.revenue)}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{data.count} order{data.count !== 1 ? 's' : ''}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-300 dark:text-gray-600">No sales</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-5 px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/60">
          {[
            { label: 'High',     dot: 'bg-green-500' },
            { label: 'Medium',   dot: 'bg-amber-500' },
            { label: 'Low',      dot: 'bg-red-400' },
            { label: 'No sales', dot: 'bg-gray-200 dark:bg-gray-600' },
          ].map(({ label, dot }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── HistoricalCharts ──────────────────────────────────────────────────────────

function HistoricalCharts({ orders, isDark }: { orders: Order[]; isDark: boolean }) {
  const chartText = isDark ? '#e6edf3' : '#374151';
  const chartGrid = isDark ? '#21262d' : '#F3F4F6';
  const chartTick = isDark ? '#8b949e' : '#6B7280';

  const chartOpts = useMemo(() => ({
    responsive: true,
    plugins: { legend: { labels: { color: chartText } } },
    scales: {
      x: { ticks: { color: chartTick }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTick }, grid: { color: chartGrid } },
    },
  }), [isDark]);

  const byTab = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { m[o.tab] = (m[o.tab] || 0) + o.sold; });
    return m;
  }, [orders]);

  const sortedTabs = Object.entries(byTab).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime());

  const byHost = useMemo(() => {
    const m: Record<string, { sales: number; profit: number; orders: number }> = {};
    orders.forEach(o => {
      const h = o.host;
      if (!h) return;
      if (!m[h]) m[h] = { sales: 0, profit: 0, orders: 0 };
      m[h].sales += o.sold; m[h].profit += o.profit; m[h].orders++;
    });
    return m;
  }, [orders]);

  const byProduct = useMemo(() => {
    const m: Record<string, { profit: number }> = {};
    orders.forEach(o => {
      const k = o.modelNum || 'Unknown';
      if (!m[k]) m[k] = { profit: 0 };
      m[k].profit += o.profit;
    });
    return m;
  }, [orders]);

  const topProducts = Object.entries(byProduct).sort((a, b) => b[1].profit - a[1].profit).slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Host cards */}
      {Object.keys(byHost).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(byHost).map(([host, data], i) => (
            <div key={host} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border border-gray-100 dark:border-gray-700" style={{ borderLeftColor: HOST_COLORS[i % HOST_COLORS.length] }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black shadow" style={{ backgroundColor: HOST_COLORS[i % HOST_COLORS.length] }}>
                    {host[0]}
                  </div>
                  <span className="font-black text-gray-900 dark:text-white text-base">{host}</span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full font-semibold">{data.orders.toLocaleString()} orders</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Sales</p>
                  <p className="font-black text-gray-900 dark:text-white text-lg">${fmt(data.sales)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3">
                  <p className="text-gray-400 text-xs mb-0.5">Profit</p>
                  <p className={`font-black text-lg ${data.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>${fmt(data.profit)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Sales by Show</h2>
          {sortedTabs.length > 0 ? (
            <Bar data={{
              labels: sortedTabs.map(([tab]) => tab),
              datasets: [{ label: 'Sales ($)', data: sortedTabs.map(([, v]) => v), backgroundColor: '#FBBF24', borderColor: '#F59E0B', borderWidth: 1 }],
            }} options={{ ...chartOpts, plugins: { legend: { display: false } } }} />
          ) : (
            <div className="h-40 flex items-center justify-center text-gray-300 dark:text-gray-600 text-sm">No data</div>
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Sales by Host</h2>
          {Object.keys(byHost).length > 0 ? (
            <div className="flex items-center justify-center h-52">
              <Doughnut data={{
                labels: Object.keys(byHost),
                datasets: [{ data: Object.values(byHost).map(h => h.sales), backgroundColor: HOST_COLORS, borderWidth: 2, borderColor: isDark ? '#1f2937' : '#fff' }],
              }} options={{ responsive: true, plugins: { legend: { labels: { color: chartText } } } }} />
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-300 dark:text-gray-600 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Top Products by Profit</h2>
          <Bar data={{
            labels: topProducts.map(([k]) => k),
            datasets: [{ label: 'Profit ($)', data: topProducts.map(([, v]) => v.profit), backgroundColor: topProducts.map(([, v]) => v.profit >= 0 ? '#FBBF24' : '#EF4444') }],
          }} options={{ ...chartOpts, indexAxis: 'y' as const, plugins: { legend: { display: false } } }} />
        </div>
      )}

      {/* Recent orders */}
      {orders.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white mb-4">Recent Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {['Product','Model #','Buyer','Host','Show','Sold','Profit','Margin'].map(h => (
                    <th key={h} className={`pb-2 font-bold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide ${h === 'Sold' || h === 'Profit' || h === 'Margin' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((o, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="py-2 max-w-xs"><span className="truncate block text-xs text-gray-700 dark:text-gray-300">{o.productName}</span></td>
                    <td className="py-2 font-mono text-xs text-blue-500 font-bold">{o.modelNum}</td>
                    <td className="py-2 text-xs text-gray-500">{o.buyer}</td>
                    <td className="py-2"><span className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                    <td className="py-2 text-xs text-gray-400">{o.tab}</td>
                    <td className="py-2 text-right font-semibold text-xs">${o.sold.toFixed(2)}</td>
                    <td className={`py-2 text-right font-bold text-xs ${o.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
                    <td className={`py-2 text-right text-xs font-semibold ${o.margin >= 20 ? 'text-green-500' : o.margin >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{o.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const isDark = useTheme();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState<DashTab>('today');

  // Historical tab
  const [preset, setPreset]           = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');

  useEffect(() => {
    fetch('/api/sales', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data?.error) setError(data.error);
        else setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const now = new Date();

  // Today / Yesterday slices
  const todayOrders = useMemo(() => {
    const today = startOfDay(now);
    return orders.filter(o => parseTabDate(o.tab) >= today);
  }, [orders]);

  const yesterdayOrders = useMemo(() => {
    const today = startOfDay(now);
    const yest  = new Date(today); yest.setDate(today.getDate() - 1);
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      return d >= yest && d < today;
    });
  }, [orders]);

  // Historical filtered
  const histOrders = useMemo(() => filterByPreset(orders, preset, customStart, customEnd), [orders, preset, customStart, customEnd]);

  // Historical previous period (for trend)
  const histPrevOrders = useMemo(() => {
    if (preset === 'today')     return yesterdayOrders;
    if (preset === 'yesterday') {
      const today = startOfDay(now);
      const yest  = new Date(today); yest.setDate(today.getDate() - 1);
      const prev  = new Date(yest);  prev.setDate(yest.getDate() - 1);
      return orders.filter(o => { const d = parseTabDate(o.tab); return d >= prev && d < yest; });
    }
    if (preset === 'week')      return filterByPreset(orders, 'lastweek', '', '');
    if (preset === 'month')     return filterByPreset(orders, 'lastmonth', '', '');
    return [];
  }, [orders, preset, yesterdayOrders]);

  const todayDateLabel = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const tabs: { key: DashTab; label: string; icon: React.ReactNode }[] = [
    { key: 'today',      label: "Today's Sales",      icon: IC.calIcon },
    { key: 'historical', label: 'Historical Analytics', icon: IC.barIcon },
    { key: 'calendar',   label: 'Calendar View',       icon: IC.calIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0d1117]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-gray-200/70 dark:bg-gray-800 rounded-2xl p-1.5 w-fit mb-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                tab === t.key
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading data…</div>
        ) : error ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border-l-4 border-red-500">
            <p className="font-bold text-red-600 mb-1">Error loading data</p>
            <p className="text-sm text-gray-500 font-mono">{error}</p>
          </div>
        ) : (
          <>
            {/* ── Today's Sales ─────────────────────────────────────── */}
            {tab === 'today' && (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-black text-gray-900 dark:text-white">Today&apos;s Sales Dashboard</h1>
                  <p className="text-gray-400 text-sm mt-0.5">{todayDateLabel}</p>
                </div>
                <MetricGrid orders={todayOrders} prevOrders={yesterdayOrders} trendLabel="vs yesterday" />
              </>
            )}

            {/* ── Historical Analytics ───────────────────────────────── */}
            {tab === 'historical' && (
              <>
                {/* Period filter */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {HIST_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPreset(p.value)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors border ${
                        preset === p.value
                          ? 'bg-amber-400 border-amber-400 text-gray-900'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-amber-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {preset === 'custom' && (
                    <div className="flex items-center gap-2">
                      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
                      <span className="text-gray-400 text-xs">to</span>
                      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="text-xs py-1.5 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="mb-6">
                  <MetricGrid orders={histOrders} prevOrders={histPrevOrders} trendLabel="vs prev" />
                </div>
                <HistoricalCharts orders={histOrders} isDark={isDark} />
              </>
            )}

            {/* ── Calendar View ──────────────────────────────────────── */}
            {tab === 'calendar' && (
              <CalendarView orders={orders} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
