'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  timestamp: string; host: string;
};

const HOST_COLORS = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];

const DATE_PRESETS = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastmonth' },
  { label: 'Custom', value: 'custom' },
];

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

function parseTimestamp(ts: string): number | null {
  if (!ts) return null;
  // "2026-05-29 15:14:18"
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}T${m[2]}`);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDuration(hours: number): string {
  if (hours <= 0) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type ShowStat = {
  tab: string;
  sales: number;
  profit: number;
  orders: number;
  units: number;
  avgMargin: number;
  durationHours: number;
};

type HostStat = {
  host: string;
  totalSales: number;
  totalProfit: number;
  totalOrders: number;
  totalUnits: number;
  avgMargin: number;
  totalDurationHours: number;
  showCount: number;
  shows: ShowStat[];
};

export default function PerformancePage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('all');
  const [customDate, setCustomDate] = useState('');
  const [expandedHost, setExpandedHost] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      if (s.role !== 'admin' && s.role !== 'manager') { router.push('/login'); return; }
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

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (preset === 'today') return d >= todayStart;
      if (preset === '7days') { const w = new Date(todayStart); w.setDate(todayStart.getDate() - 7); return d >= w; }
      if (preset === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (preset === 'lastmonth') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lme = new Date(now.getFullYear(), now.getMonth(), 0); return d >= lm && d <= lme; }
      if (preset === 'custom' && customDate) { const [cy, cm, cd] = customDate.split('-').map(Number); const sel = new Date(cy, cm - 1, cd); return d.getTime() === sel.getTime(); }
      return true;
    });
  }, [orders, preset, customDate]);

  const hostStats = useMemo((): HostStat[] => {
    // Accumulate per-host, per-show data
    const map: Record<string, {
      sales: number; profit: number; orders: number; units: number; margins: number[];
      shows: Record<string, { sales: number; profit: number; orders: number; units: number; margins: number[]; minTs: number | null; maxTs: number | null }>;
    }> = {};

    filtered.forEach(o => {
      const h = o.host;
      if (!h) return;
      if (!map[h]) map[h] = { sales: 0, profit: 0, orders: 0, units: 0, margins: [], shows: {} };

      map[h].sales += o.sold;
      map[h].profit += o.profit;
      map[h].orders++;
      map[h].units += o.qty;
      map[h].margins.push(o.margin);

      if (!map[h].shows[o.tab]) map[h].shows[o.tab] = { sales: 0, profit: 0, orders: 0, units: 0, margins: [], minTs: null, maxTs: null };
      const show = map[h].shows[o.tab];
      show.sales += o.sold;
      show.profit += o.profit;
      show.orders++;
      show.units += o.qty;
      show.margins.push(o.margin);

      const ts = parseTimestamp(o.timestamp);
      if (ts !== null) {
        if (show.minTs === null || ts < show.minTs) show.minTs = ts;
        if (show.maxTs === null || ts > show.maxTs) show.maxTs = ts;
      }
    });

    return Object.entries(map)
      .map(([host, data]) => {
        let totalDurationMs = 0;
        const shows: ShowStat[] = Object.entries(data.shows)
          .map(([tab, s]) => {
            const durationMs = (s.minTs !== null && s.maxTs !== null && s.maxTs > s.minTs) ? s.maxTs - s.minTs : 0;
            totalDurationMs += durationMs;
            return {
              tab,
              sales: s.sales,
              profit: s.profit,
              orders: s.orders,
              units: s.units,
              avgMargin: s.margins.reduce((a, b) => a + b, 0) / (s.margins.length || 1),
              durationHours: durationMs / 3600000,
            };
          })
          .sort((a, b) => parseTabDate(b.tab).getTime() - parseTabDate(a.tab).getTime());

        const totalDurationHours = totalDurationMs / 3600000;
        return {
          host,
          totalSales: data.sales,
          totalProfit: data.profit,
          totalOrders: data.orders,
          totalUnits: data.units,
          avgMargin: data.margins.reduce((a, b) => a + b, 0) / (data.margins.length || 1),
          totalDurationHours,
          showCount: shows.length,
          shows,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [filtered]);

  const btnActive = 'bg-amber-400 border-amber-400 text-slate-900';
  const btnInactive = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400';

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Performance</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {DATE_PRESETS.map(p => (
              <button key={p.value} onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${preset === p.value ? btnActive : btnInactive}`}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                className="text-xs py-1.5 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
          ) : error ? (
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 border-l-4 border-l-red-500 rounded-xl p-6">
              <p className="font-bold text-red-600 mb-1">Error loading data</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{error}</p>
            </div>
          ) : hostStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No host data found</p>
              <p className="text-slate-400 text-xs mt-1">No orders with host information in the selected period</p>
            </div>
          ) : (
            <div className="space-y-5">
              {hostStats.map((hs, i) => {
                const color = HOST_COLORS[i % HOST_COLORS.length];
                const revenuePerHour = hs.totalDurationHours > 0 ? hs.totalSales / hs.totalDurationHours : null;
                const ordersPerHour = hs.totalDurationHours > 0 ? hs.totalOrders / hs.totalDurationHours : null;
                const isExpanded = expandedHost === hs.host;

                return (
                  <div key={hs.host} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    {/* Host header */}
                    <div className="p-5 border-b-4" style={{ borderBottomColor: color }}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-xl shadow-sm flex-shrink-0"
                            style={{ backgroundColor: color }}>
                            {hs.host[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-slate-900 dark:text-white text-base">{hs.host}</p>
                            <p className="text-xs text-slate-400">{hs.showCount} show{hs.showCount !== 1 ? 's' : ''} in period</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setExpandedHost(isExpanded ? null : hs.host)}
                          className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {isExpanded ? 'Hide Shows ↑' : 'View Shows ↓'}
                        </button>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-5">
                        {[
                          { label: 'Total Sales', value: `$${fmtMoney(hs.totalSales)}`, color: 'text-slate-900 dark:text-white' },
                          { label: 'Gross Profit', value: `$${fmtMoney(hs.totalProfit)}`, color: hs.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' },
                          { label: 'Overall Margin', value: `${hs.avgMargin.toFixed(1)}%`, color: hs.avgMargin >= 15 ? 'text-emerald-600 dark:text-emerald-400' : hs.avgMargin >= 0 ? 'text-amber-500' : 'text-red-500' },
                          { label: 'Orders / Units', value: `${hs.totalOrders} / ${hs.totalUnits}`, color: 'text-slate-700 dark:text-slate-300' },
                          { label: 'Show Duration', value: fmtDuration(hs.totalDurationHours), color: 'text-slate-700 dark:text-slate-300' },
                          { label: 'Revenue / Hour', value: revenuePerHour !== null ? `$${fmtMoney(revenuePerHour)}` : '—', color: 'text-amber-500' },
                          { label: 'Orders / Hour', value: ordersPerHour !== null ? ordersPerHour.toFixed(1) : '—', color: 'text-slate-700 dark:text-slate-300' },
                        ].map(stat => (
                          <div key={stat.label} className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-center">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">{stat.label}</p>
                            <p className={`font-black text-sm ${stat.color}`}>{stat.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Show breakdown */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                              {['Show Date', 'Sales', 'Profit', 'Margin', 'Orders / Units', 'Duration', 'Rev / Hr', 'Orders / Hr'].map(h => (
                                <th key={h} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${h === 'Show Date' ? 'text-left' : 'text-right'}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {hs.shows.map(show => {
                              const rph = show.durationHours > 0 ? show.sales / show.durationHours : null;
                              const oph = show.durationHours > 0 ? show.orders / show.durationHours : null;
                              return (
                                <tr key={show.tab} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                  <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-300">{show.tab}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">${fmtMoney(show.sales)}</td>
                                  <td className={`px-4 py-2.5 text-right font-bold ${show.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${fmtMoney(show.profit)}</td>
                                  <td className={`px-4 py-2.5 text-right font-semibold ${show.avgMargin >= 15 ? 'text-emerald-600' : show.avgMargin >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{show.avgMargin.toFixed(1)}%</td>
                                  <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{show.orders} / {show.units}</td>
                                  <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{fmtDuration(show.durationHours)}</td>
                                  <td className="px-4 py-2.5 text-right text-amber-500 font-semibold">{rph !== null ? `$${fmtMoney(rph)}` : '—'}</td>
                                  <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">{oph !== null ? oph.toFixed(1) : '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
