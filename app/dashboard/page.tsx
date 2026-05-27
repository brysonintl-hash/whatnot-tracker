'use client';

import { useEffect, useState, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card p-5">
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const DATE_PRESETS = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Month', value: 'lastmonth' },
  { label: 'Custom', value: 'custom' },
];

const chartOpts = {
  responsive: true,
  plugins: { legend: { labels: { color: '#374151' } } },
  scales: {
    x: { ticks: { color: '#6B7280' }, grid: { color: '#F3F4F6' } },
    y: { ticks: { color: '#6B7280' }, grid: { color: '#F3F4F6' } },
  },
};

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    fetch('/api/sales').then(r => r.json()).then(data => {
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (preset === 'today') return d >= today;
      if (preset === 'yesterday') {
        const yest = new Date(today); yest.setDate(today.getDate() - 1);
        return d >= yest && d < today;
      }
      if (preset === '7days') { const w = new Date(today); w.setDate(today.getDate() - 7); return d >= w; }
      if (preset === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (preset === 'lastmonth') {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lme = new Date(now.getFullYear(), now.getMonth(), 0);
        return d >= lm && d <= lme;
      }
      if (preset === 'custom' && customFrom && customTo) {
        const from = new Date(customFrom); const to = new Date(customTo);
        return d >= from && d <= to;
      }
      return true;
    });
  }, [orders, preset, customFrom, customTo]);

  const totalSales = filtered.reduce((s, o) => s + o.sold, 0);
  const totalProfit = filtered.reduce((s, o) => s + o.profit, 0);
  const avgMargin = filtered.length ? filtered.reduce((s, o) => s + o.margin, 0) / filtered.length : 0;

  const byHost = filtered.reduce<Record<string, { sales: number; profit: number; orders: number }>>((acc, o) => {
    const h = o.host || 'Unknown';
    if (!acc[h]) acc[h] = { sales: 0, profit: 0, orders: 0 };
    acc[h].sales += o.sold; acc[h].profit += o.profit; acc[h].orders++;
    return acc;
  }, {});

  const byTab = filtered.reduce<Record<string, number>>((acc, o) => {
    acc[o.tab] = (acc[o.tab] || 0) + o.sold; return acc;
  }, {});
  const sortedTabs = Object.entries(byTab).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime());

  const byProduct = filtered.reduce<Record<string, { profit: number }>>((acc, o) => {
    const k = o.modelNum || 'Unknown';
    if (!acc[k]) acc[k] = { profit: 0 };
    acc[k].profit += o.profit; return acc;
  }, {});
  const topProducts = Object.entries(byProduct).sort((a, b) => b[1].profit - a[1].profit).slice(0, 8);

  const hostColors = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6'];

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Dashboard</h1>
            <p className="text-gray-500 text-sm">{filtered.length} orders · {Object.keys(byTab).length} shows</p>
          </div>
          {/* Date filter */}
          <div className="flex flex-wrap gap-2 items-center">
            {DATE_PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                  preset === p.value
                    ? 'bg-amber-400 border-amber-400 text-gray-900'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-amber-400'
                }`}
              >
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

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading data...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Sales" value={`$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sub={`${filtered.length} orders`} color="text-gray-900" />
              <StatCard label="Gross Profit" value={`$${totalProfit.toFixed(2)}`} sub="after COGS" color={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'} />
              <StatCard label="Avg Margin" value={`${avgMargin.toFixed(1)}%`} color="text-amber-500" />
              <StatCard label="Shows" value={`${Object.keys(byTab).length}`} sub={`${filtered.length} total orders`} color="text-gray-900" />
            </div>

            {/* Host cards */}
            {Object.keys(byHost).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {Object.entries(byHost).map(([host, data], i) => (
                  <div key={host} className="card p-4 border-l-4" style={{ borderLeftColor: hostColors[i % hostColors.length] }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black"
                          style={{ backgroundColor: hostColors[i % hostColors.length] }}>
                          {host[0]}
                        </div>
                        <span className="font-bold text-gray-900">{host}</span>
                      </div>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{data.orders} orders</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-gray-400 text-xs">Sales</p>
                        <p className="font-black text-gray-900">${data.sales.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs">Profit</p>
                        <p className={`font-black ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${data.profit.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-5">
                <h2 className="font-bold text-gray-900 mb-4">Sales by Show</h2>
                <Bar data={{
                  labels: sortedTabs.map(([tab]) => tab),
                  datasets: [{ label: 'Sales ($)', data: sortedTabs.map(([, v]) => v), backgroundColor: '#FBBF24', borderColor: '#F59E0B', borderWidth: 1 }],
                }} options={{ ...chartOpts, plugins: { legend: { display: false } } }} />
              </div>
              <div className="card p-5">
                <h2 className="font-bold text-gray-900 mb-4">Sales by Host</h2>
                <div className="flex items-center justify-center h-52">
                  <Doughnut data={{
                    labels: Object.keys(byHost),
                    datasets: [{ data: Object.values(byHost).map(h => h.sales), backgroundColor: hostColors }],
                  }} options={{ responsive: true, plugins: { legend: { labels: { color: '#374151' } } } }} />
                </div>
              </div>
            </div>

            <div className="card p-5 mb-4">
              <h2 className="font-bold text-gray-900 mb-4">Top Products by Profit</h2>
              <Bar data={{
                labels: topProducts.map(([k]) => k),
                datasets: [{ label: 'Profit ($)', data: topProducts.map(([, v]) => v.profit), backgroundColor: topProducts.map(([, v]) => v.profit >= 0 ? '#FBBF24' : '#DC2626') }],
              }} options={{ ...chartOpts, indexAxis: 'y' as const, plugins: { legend: { display: false } } }} />
            </div>

            {/* Recent orders */}
            <div className="card p-5">
              <h2 className="font-bold text-gray-900 mb-4">Recent Orders</h2>
              <div className="overflow-x-auto">
                <table>
                  <thead><tr>
                    <th>Product</th><th>Model #</th><th>Buyer</th><th>Host</th><th>Show</th>
                    <th className="text-right">Sold</th><th className="text-right">Profit</th><th className="text-right">Margin</th>
                  </tr></thead>
                  <tbody>
                    {filtered.slice(0, 20).map((o, i) => (
                      <tr key={i}>
                        <td className="max-w-xs"><span className="truncate block text-xs">{o.productName}</span></td>
                        <td className="font-mono text-xs text-blue-600">{o.modelNum}</td>
                        <td className="text-xs">{o.buyer}</td>
                        <td><span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                        <td className="text-xs text-gray-400">{o.tab}</td>
                        <td className="text-right font-semibold text-gray-900">${o.sold.toFixed(2)}</td>
                        <td className={`text-right font-bold ${o.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${o.profit.toFixed(2)}</td>
                        <td className={`text-right text-xs font-semibold ${o.margin >= 20 ? 'text-green-600' : o.margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{o.margin.toFixed(1)}%</td>
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
  );
}
