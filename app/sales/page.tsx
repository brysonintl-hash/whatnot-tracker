'use client';

import { useEffect, useState, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  showDuration: string; host: string;
};

const chartOpts = {
  responsive: true,
  plugins: { legend: { labels: { color: '#9ca3af' } } },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: '#21262d' } },
    y: { ticks: { color: '#9ca3af' }, grid: { color: '#21262d' } },
  },
};

const HOST_COLORS: Record<string, string> = {
  Jason: '#10b981', Sarah: '#3b82f6', Mike: '#8b5cf6',
};
function hostColor(h: string) { return HOST_COLORS[h] || '#f59e0b'; }

export default function SalesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState<string>('All');

  useEffect(() => {
    fetch('/api/sales').then(r => r.json()).then(data => {
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const hosts = useMemo(() => ['All', ...Array.from(new Set(orders.map(o => o.host).filter(Boolean)))], [orders]);

  const filtered = selectedHost === 'All' ? orders : orders.filter(o => o.host === selectedHost);

  // Sales & profit by show (tab)
  const byTab = useMemo(() => {
    const m: Record<string, { sales: number; profit: number; cost: number; orders: number }> = {};
    filtered.forEach(o => {
      if (!m[o.tab]) m[o.tab] = { sales: 0, profit: 0, cost: 0, orders: 0 };
      m[o.tab].sales += o.sold;
      m[o.tab].profit += o.profit;
      m[o.tab].cost += o.cost;
      m[o.tab].orders++;
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Host comparison
  const byHost = useMemo(() => {
    const m: Record<string, { sales: number; profit: number; orders: number; margin: number[] }> = {};
    orders.forEach(o => {
      const h = o.host || 'Unknown';
      if (!m[h]) m[h] = { sales: 0, profit: 0, orders: 0, margin: [] };
      m[h].sales += o.sold;
      m[h].profit += o.profit;
      m[h].orders++;
      m[h].margin.push(o.margin);
    });
    return m;
  }, [orders]);

  // Top buyers
  const topBuyers = useMemo(() => {
    const m: Record<string, { spent: number; orders: number }> = {};
    filtered.forEach(o => {
      if (!m[o.buyer]) m[o.buyer] = { spent: 0, orders: 0 };
      m[o.buyer].spent += o.sold;
      m[o.buyer].orders++;
    });
    return Object.entries(m).sort((a, b) => b[1].spent - a[1].spent).slice(0, 10);
  }, [filtered]);

  // Margin distribution
  const marginBuckets = useMemo(() => {
    const buckets = { 'Negative': 0, '0–10%': 0, '10–25%': 0, '25–50%': 0, '50%+': 0 };
    filtered.forEach(o => {
      if (o.margin < 0) buckets['Negative']++;
      else if (o.margin < 10) buckets['0–10%']++;
      else if (o.margin < 25) buckets['10–25%']++;
      else if (o.margin < 50) buckets['25–50%']++;
      else buckets['50%+']++;
    });
    return buckets;
  }, [filtered]);

  const salesTrendChart = {
    labels: byTab.map(([tab]) => tab),
    datasets: [
      { label: 'Sales ($)', data: byTab.map(([, v]) => v.sales), borderColor: '#10b981', backgroundColor: '#10b98130', tension: 0.3, fill: true },
      { label: 'Profit ($)', data: byTab.map(([, v]) => v.profit), borderColor: '#3b82f6', backgroundColor: '#3b82f630', tension: 0.3, fill: true },
    ],
  };

  const hostCompareChart = {
    labels: Object.keys(byHost),
    datasets: [
      {
        label: 'Sales ($)',
        data: Object.entries(byHost).map(([, v]) => v.sales),
        backgroundColor: Object.keys(byHost).map(h => hostColor(h)),
      },
      {
        label: 'Profit ($)',
        data: Object.entries(byHost).map(([, v]) => v.profit),
        backgroundColor: Object.keys(byHost).map(h => hostColor(h) + '80'),
      },
    ],
  };

  const marginChart = {
    labels: Object.keys(marginBuckets),
    datasets: [{
      label: 'Orders',
      data: Object.values(marginBuckets),
      backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'],
    }],
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117]">
        <Navbar />
        <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Sales Analytics</h1>
            <p className="text-gray-400 text-sm">{filtered.length} orders analyzed</p>
          </div>
          <div className="flex gap-2">
            {hosts.map(h => (
              <button
                key={h}
                onClick={() => setSelectedHost(h)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedHost === h
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white border border-[#30363d]'
                }`}
                style={selectedHost === h ? { backgroundColor: h === 'All' ? '#10b981' : hostColor(h) } : {}}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Total Revenue', value: `$${filtered.reduce((s, o) => s + o.sold, 0).toFixed(2)}`, color: 'text-emerald-400' },
            { label: 'Total Profit', value: `$${filtered.reduce((s, o) => s + o.profit, 0).toFixed(2)}`, color: filtered.reduce((s, o) => s + o.profit, 0) >= 0 ? 'text-blue-400' : 'text-red-400' },
            { label: 'Avg Margin', value: `${(filtered.reduce((s, o) => s + o.margin, 0) / (filtered.length || 1)).toFixed(1)}%`, color: 'text-purple-400' },
            { label: 'Total Orders', value: `${filtered.length}`, color: 'text-amber-400' },
            { label: 'Shows', value: `${byTab.length}`, color: 'text-white' },
          ].map(kpi => (
            <div key={kpi.label} className="card p-4">
              <p className="text-gray-400 text-xs mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Sales trend */}
        <div className="card p-5 mb-4">
          <h2 className="text-sm font-semibold text-white mb-4">Sales & Profit Trend by Show</h2>
          <Line data={salesTrendChart} options={chartOpts} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Host comparison */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Host Comparison</h2>
            <Bar data={hostCompareChart} options={chartOpts} />
          </div>

          {/* Margin distribution */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Margin Distribution</h2>
            <Bar
              data={marginChart}
              options={{
                ...chartOpts,
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Show breakdown table */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Show Breakdown</h2>
            <table>
              <thead>
                <tr>
                  <th>Show</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Sales</th>
                  <th className="text-right">Profit</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {byTab.map(([tab, d]) => (
                  <tr key={tab}>
                    <td className="text-sm font-medium">{tab}</td>
                    <td className="text-right text-gray-400 text-sm">{d.orders}</td>
                    <td className="text-right text-sm">${d.sales.toFixed(2)}</td>
                    <td className={`text-right text-sm font-medium ${d.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${d.profit.toFixed(2)}
                    </td>
                    <td className={`text-right text-xs ${(d.profit / d.sales * 100) >= 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {d.sales > 0 ? ((d.profit / d.sales) * 100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top buyers */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Top Buyers</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Buyer</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {topBuyers.map(([buyer, d], i) => (
                  <tr key={buyer}>
                    <td className="text-gray-500 text-sm">{i + 1}</td>
                    <td className="text-sm font-medium">{buyer}</td>
                    <td className="text-right text-gray-400 text-sm">{d.orders}</td>
                    <td className="text-right text-emerald-400 text-sm font-medium">
                      ${d.spent.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Host detail cards */}
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-white mb-3">Host Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(byHost).map(([host, data]) => {
              const avgMargin = data.margin.reduce((s, m) => s + m, 0) / (data.margin.length || 1);
              return (
                <div key={host} className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ backgroundColor: hostColor(host) }}>
                      {host[0]}
                    </div>
                    <span className="font-semibold text-white">{host}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Revenue</p>
                      <p className="text-white font-medium">${data.sales.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Profit</p>
                      <p className={`font-medium ${data.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${data.profit.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Orders</p>
                      <p className="text-white font-medium">{data.orders}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Avg Margin</p>
                      <p className={`font-medium ${avgMargin >= 15 ? 'text-emerald-400' : avgMargin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                        {avgMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
