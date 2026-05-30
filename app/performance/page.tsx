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

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

// "5/29/26" -> "2026-05-29"
function tabToISO(tab: string): string {
  const parts = tab.split('/');
  if (parts.length !== 3) return '';
  const [m, d, y] = parts.map(Number);
  return `${2000 + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "2026-05-29" -> "5/29/26"
function isoToTab(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return `${m}/${d}/${y - 2000}`;
}

// "2026-05-29" -> "May 29, 2026"
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseTimestamp(ts: string): number | null {
  if (!ts) return null;
  const match = ts.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (match) {
    const d = new Date(`${match[1]}T${match[2]}`);
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

type HostStat = {
  host: string;
  colorIdx: number;
  totalSales: number;
  totalProfit: number;
  totalOrders: number;
  totalUnits: number;
  avgMargin: number;
  durationHours: number;
};

function computeHostStats(orders: Order[]): HostStat[] {
  const hostOrder: Record<string, number> = {};
  let colorIdx = 0;

  const map: Record<string, {
    sales: number; profit: number; orders: number; units: number; margins: number[];
    minTs: number | null; maxTs: number | null; colorIdx: number;
  }> = {};

  orders.forEach(o => {
    const h = o.host;
    if (!h) return;
    if (!map[h]) {
      map[h] = { sales: 0, profit: 0, orders: 0, units: 0, margins: [], minTs: null, maxTs: null, colorIdx: colorIdx++ };
      hostOrder[h] = colorIdx;
    }
    map[h].sales += o.sold;
    map[h].profit += o.profit;
    map[h].orders++;
    map[h].units += o.qty;
    map[h].margins.push(o.margin);

    const ts = parseTimestamp(o.timestamp);
    if (ts !== null) {
      if (map[h].minTs === null || ts < map[h].minTs!) map[h].minTs = ts;
      if (map[h].maxTs === null || ts > map[h].maxTs!) map[h].maxTs = ts;
    }
  });

  return Object.entries(map)
    .map(([host, d]) => {
      const durationMs = (d.minTs !== null && d.maxTs !== null && d.maxTs > d.minTs) ? d.maxTs - d.minTs : 0;
      return {
        host,
        colorIdx: d.colorIdx,
        totalSales: d.sales,
        totalProfit: d.profit,
        totalOrders: d.orders,
        totalUnits: d.units,
        avgMargin: d.margins.reduce((a, b) => a + b, 0) / (d.margins.length || 1),
        durationHours: durationMs / 3600000,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

export default function PerformancePage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD

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

  // All available show dates sorted newest → oldest
  const showDates = useMemo(() => {
    const tabs = Array.from(new Set(orders.map(o => o.tab).filter(Boolean)));
    return tabs
      .sort((a, b) => parseTabDate(b).getTime() - parseTabDate(a).getTime())
      .map(tabToISO)
      .filter(Boolean);
  }, [orders]);

  // Default to most recent date once data loads
  useEffect(() => {
    if (showDates.length > 0 && !selectedDate) {
      setSelectedDate(showDates[0]);
    }
  }, [showDates]);

  // Prev / Next navigable dates
  const currentIdx = showDates.indexOf(selectedDate);
  const prevDate = currentIdx < showDates.length - 1 ? showDates[currentIdx + 1] : null; // older
  const nextDate = currentIdx > 0 ? showDates[currentIdx - 1] : null;                   // newer

  // Orders for selected date
  const dayOrders = useMemo(() => {
    if (!selectedDate) return [];
    const targetTab = isoToTab(selectedDate);
    return orders.filter(o => o.tab === targetTab);
  }, [orders, selectedDate]);

  const hostStats = useMemo(() => computeHostStats(dayOrders), [dayOrders]);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Performance</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
          ) : error ? (
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 border-l-4 border-l-red-500 rounded-xl p-6">
              <p className="font-bold text-red-600 mb-1">Error loading data</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{error}</p>
            </div>
          ) : (
            <>
              {/* Date picker bar */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-6 flex items-center justify-between gap-4">
                <button
                  onClick={() => prevDate && setSelectedDate(prevDate)}
                  disabled={!prevDate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Prev Show
                </button>

                <div className="flex items-center gap-3 flex-1 justify-center">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Show Date</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white">
                      {selectedDate ? isoToDisplay(selectedDate) : '—'}
                    </p>
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>

                <button
                  onClick={() => nextDate && setSelectedDate(nextDate)}
                  disabled={!nextDate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next Show
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Results */}
              {dayOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No show data for this date</p>
                  <p className="text-slate-400 text-xs mt-1">Try a different date or use the arrows to navigate</p>
                </div>
              ) : (
                <>
                  {/* Summary row */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-black text-slate-900 dark:text-white text-base">
                        {isoToDisplay(selectedDate)}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {hostStats.length} host{hostStats.length !== 1 ? 's' : ''} · {dayOrders.length} orders
                      </p>
                    </div>
                  </div>

                  {/* Host cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                    {hostStats.map(hs => {
                      const color = HOST_COLORS[hs.colorIdx % HOST_COLORS.length];
                      const revenuePerHour = hs.durationHours > 0 ? hs.totalSales / hs.durationHours : null;
                      const ordersPerHour = hs.durationHours > 0 ? hs.totalOrders / hs.durationHours : null;

                      const stats = [
                        {
                          label: 'Total Sales',
                          value: `$${fmtMoney(hs.totalSales)}`,
                          valueClass: 'text-slate-900 dark:text-white font-black',
                        },
                        {
                          label: 'Orders / Units',
                          value: `${hs.totalOrders} / ${hs.totalUnits}`,
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                        {
                          label: 'Show Duration',
                          value: fmtDuration(hs.durationHours),
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                        {
                          label: 'Gross Profit',
                          value: `$${fmtMoney(hs.totalProfit)}`,
                          valueClass: `font-black ${hs.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`,
                        },
                        {
                          label: 'Overall Margin',
                          value: `${hs.avgMargin.toFixed(1)}%`,
                          valueClass: `font-black ${hs.avgMargin >= 15 ? 'text-emerald-600 dark:text-emerald-400' : hs.avgMargin >= 0 ? 'text-amber-500' : 'text-red-500'}`,
                        },
                        {
                          label: 'Revenue per Hour',
                          value: revenuePerHour !== null ? `$${fmtMoney(revenuePerHour)}` : '—',
                          valueClass: 'text-amber-500 font-black',
                        },
                        {
                          label: 'Orders per Hour',
                          value: ordersPerHour !== null ? ordersPerHour.toFixed(1) : '—',
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                      ];

                      return (
                        <div
                          key={hs.host}
                          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                        >
                          {/* Host name bar */}
                          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `3px solid ${color}` }}>
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: color }}
                            >
                              {hs.host[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-black text-slate-900 dark:text-white text-base leading-tight">{hs.host}</p>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Host</p>
                            </div>
                          </div>

                          {/* Stats list */}
                          <div className="px-5 py-4 space-y-3">
                            {stats.map(s => (
                              <div key={s.label} className="flex items-center justify-between gap-2">
                                <span className="text-sm text-slate-500 dark:text-slate-400">{s.label}</span>
                                <span className={`text-sm ${s.valueClass}`}>{s.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
