'use client';

import { useEffect, useState, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { useTheme } from '@/lib/useTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  showDuration: string; host: string;
};

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

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

export default function SalesPage() {
  const isDark = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedHost, setSelectedHost] = useState('All');

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

  const dateFiltered = useMemo(() => {
    const now = new Date(); const today = startOfDay(now);
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (preset === 'today') return d >= today;
      if (preset === 'yesterday') { const y = new Date(today); y.setDate(today.getDate() - 1); return d >= y && d < today; }
      if (preset === '7days') { const w = new Date(today); w.setDate(today.getDate() - 7); return d >= w; }
      if (preset === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (preset === 'lastmonth') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lme = new Date(now.getFullYear(), now.getMonth(), 0); return d >= lm && d <= lme; }
      if (preset === 'custom' && customFrom && customTo) { const from = new Date(customFrom); const to = new Date(customTo); return d >= from && d <= to; }
      return true;
    });
  }, [orders, preset, customFrom, customTo]);

  const hosts = useMemo(() => ['All', ...Array.from(new Set(dateFiltered.map(o => o.host).filter(Boolean)))], [dateFiltered]);
  const filtered = selectedHost === 'All' ? dateFiltered : dateFiltered.filter(o => o.host === selectedHost);

  const byTab = useMemo(() => {
    const m: Record<string, { sales: number; profit: number }> = {};
    filtered.forEach(o => {
      if (!m[o.tab]) m[o.tab] = { sales: 0, profit: 0 };
      m[o.tab].sales += o.sold; m[o.tab].profit += o.profit;
    });
    return Object.entries(m).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime());
  }, [filtered]);

  const byHost = useMemo(() => {
    const m: Record<string, { sales: number; profit: number; orders: number; margins: number[] }> = {};
    orders.forEach(o => {
      const h = o.host || 'Unknown';
      if (!m[h]) m[h] = { sales: 0, profit: 0, orders: 0, margins: [] };
      m[h].sales += o.sold; m[h].profit += o.profit; m[h].orders++; m[h].margins.push(o.margin);
    });
    return m;
  }, [orders]);

  const topBuyers = useMemo(() => {
    const m: Record<string, { spent: number; orders: number }> = {};
    filtered.forEach(o => { if (!m[o.buyer]) m[o.buyer] = { spent: 0, orders: 0 }; m[o.buyer].spent += o.sold; m[o.buyer].orders++; });
    return Object.entries(m).sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
  }, [filtered]);

  const btnInactive = 'bg-white border-gray-300 text-gray-600 hover:border-amber-400 dark:bg-[#21262d] dark:border-[#30363d] dark:text-gray-300 dark:hover:border-amber-400';

  if (loading) return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0d1117]">
      <Navbar />
      <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0d1117]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Sales Analytics</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{filtered.length} orders analyzed</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {DATE_PRESETS.map(p => (
              <button key={p.value} onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${preset === p.value ? 'bg-amber-400 border-amber-400 text-gray-900' : btnInactive}`}>
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-xs py-1.5" />
                <span className="text-gray-400 text-xs">to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="text-xs py-1.5" />
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="card p-6 border-l-4 border-red-500">
            <p className="font-bold text-red-600 mb-1">Error loading Google Sheets data</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{error}</p>
          </div>
        ) : (
          <>
            {/* Host filter */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {hosts.map((h, i) => (
                <button key={h} onClick={() => setSelectedHost(h)}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${selectedHost === h ? 'text-white border-transparent' : btnInactive}`}
                  style={selectedHost === h ? { backgroundColor: h === 'All' ? '#1F2937' : HOST_COLORS[(i - 1) % HOST_COLORS.length] } : {}}>
                  {h}
                </button>
              ))}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Revenue', value: `$${filtered.reduce((s, o) => s + o.sold, 0).toFixed(2)}`, color: 'text-gray-900 dark:text-white' },
                { label: 'Profit', value: `$${filtered.reduce((s, o) => s + o.profit, 0).toFixed(2)}`, color: filtered.reduce((s, o) => s + o.profit, 0) >= 0 ? 'text-green-500' : 'text-red-500' },
                { label: 'Avg Margin', value: `${(filtered.reduce((s, o) => s + o.margin, 0) / (filtered.length || 1)).toFixed(1)}%`, color: 'text-amber-500' },
                { label: 'Orders', value: `${filtered.length}`, color: 'text-gray-900 dark:text-white' },
                { label: 'Shows', value: `${byTab.length}`, color: 'text-gray-900 dark:text-white' },
              ].map(kpi => (
                <div key={kpi.label} className="card p-4">
                  <p className="text-gray-400 dark:text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">{kpi.label}</p>
                  <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Sales trend */}
            <div className="card p-5 mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white mb-4">Sales & Profit by Show</h2>
              <Line data={{
                labels: byTab.map(([tab]) => tab),
                datasets: [
                  { label: 'Sales ($)', data: byTab.map(([, v]) => v.sales), borderColor: '#F59E0B', backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7', tension: 0.3, fill: true },
                  { label: 'Profit ($)', data: byTab.map(([, v]) => v.profit), borderColor: '#EF4444', backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2', tension: 0.3, fill: true },
                ],
              }} options={chartOpts} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Show breakdown */}
              <div className="card p-5">
                <h2 className="font-bold text-gray-900 dark:text-white mb-4">Show Breakdown</h2>
                <table>
                  <thead><tr><th>Show</th><th className="text-right">Orders</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
                  <tbody>
                    {byTab.map(([tab, d]) => (
                      <tr key={tab}>
                        <td className="font-semibold">{tab}</td>
                        <td className="text-right text-gray-400 text-sm">{filtered.filter(o => o.tab === tab).length}</td>
                        <td className="text-right font-semibold">${d.sales.toFixed(2)}</td>
                        <td className={`text-right font-bold ${d.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>${d.profit.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Top buyers */}
              <div className="card p-5">
                <h2 className="font-bold text-gray-900 dark:text-white mb-4">Top Buyers</h2>
                <table>
                  <thead><tr><th>#</th><th>Buyer</th><th className="text-right">Orders</th><th className="text-right">Spent</th></tr></thead>
                  <tbody>
                    {topBuyers.map(([buyer, d], i) => (
                      <tr key={buyer}>
                        <td className="text-gray-400 text-sm font-bold">{i + 1}</td>
                        <td className="font-semibold">{buyer}</td>
                        <td className="text-right text-gray-400 text-sm">{d.orders}</td>
                        <td className="text-right font-black text-amber-500">${d.spent.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Host detail cards */}
            <h2 className="font-bold text-gray-900 dark:text-white mb-3">Host Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(byHost).map(([host, data], i) => {
                const avg = data.margins.reduce((s, m) => s + m, 0) / (data.margins.length || 1);
                return (
                  <div key={host} className="card p-5 border-t-4" style={{ borderTopColor: HOST_COLORS[i % HOST_COLORS.length] }}>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg shadow" style={{ backgroundColor: HOST_COLORS[i % HOST_COLORS.length] }}>{host[0]}</div>
                      <span className="font-black text-gray-900 dark:text-white text-lg">{host}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-gray-50 dark:bg-[#0d1117] rounded-lg p-2.5">
                        <p className="text-gray-400 dark:text-gray-500 text-xs mb-0.5">Revenue</p>
                        <p className="font-black text-gray-900 dark:text-white">${data.sales.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#0d1117] rounded-lg p-2.5">
                        <p className="text-gray-400 dark:text-gray-500 text-xs mb-0.5">Profit</p>
                        <p className={`font-black ${data.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>${data.profit.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#0d1117] rounded-lg p-2.5">
                        <p className="text-gray-400 dark:text-gray-500 text-xs mb-0.5">Orders</p>
                        <p className="font-bold text-gray-900 dark:text-white">{data.orders}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#0d1117] rounded-lg p-2.5">
                        <p className="text-gray-400 dark:text-gray-500 text-xs mb-0.5">Avg Margin</p>
                        <p className={`font-bold ${avg >= 15 ? 'text-green-500' : avg >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{avg.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
