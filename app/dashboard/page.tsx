'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, ArcElement,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  showDuration: string; host: string;
};

function StatCard({ label, value, sub, color = 'emerald' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400', blue: 'text-blue-400', purple: 'text-purple-400',
    amber: 'text-amber-400', red: 'text-red-400',
  };
  return (
    <div className="card p-5">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color] || colors.emerald}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

const chartOptions = {
  responsive: true,
  plugins: { legend: { labels: { color: '#9ca3af' } } },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: '#21262d' } },
    y: { ticks: { color: '#9ca3af' }, grid: { color: '#21262d' } },
  },
};

export default function DashboardPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sales').then(r => r.json()).then(data => {
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const totalSales = orders.reduce((s, o) => s + o.sold, 0);
  const totalProfit = orders.reduce((s, o) => s + o.profit, 0);
  const totalOrders = orders.length;
  const avgMargin = orders.length ? orders.reduce((s, o) => s + o.margin, 0) / orders.length : 0;

  // Sales by host
  const byHost = orders.reduce<Record<string, { sales: number; profit: number; orders: number }>>((acc, o) => {
    const h = o.host || 'Unknown';
    if (!acc[h]) acc[h] = { sales: 0, profit: 0, orders: 0 };
    acc[h].sales += o.sold;
    acc[h].profit += o.profit;
    acc[h].orders++;
    return acc;
  }, {});

  // Sales by show (tab)
  const byTab = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.tab] = (acc[o.tab] || 0) + o.sold;
    return acc;
  }, {});
  const sortedTabs = Object.entries(byTab).sort((a, b) => a[0].localeCompare(b[0]));

  // Top products by profit
  const byProduct = orders.reduce<Record<string, { profit: number; sold: number; orders: number }>>((acc, o) => {
    const k = o.modelNum || o.productName?.slice(0, 30) || 'Unknown';
    if (!acc[k]) acc[k] = { profit: 0, sold: 0, orders: 0 };
    acc[k].profit += o.profit;
    acc[k].sold += o.sold;
    acc[k].orders++;
    return acc;
  }, {});
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 10);

  const hostColors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  const salesByShowChart = {
    labels: sortedTabs.map(([tab]) => tab),
    datasets: [{
      label: 'Sales ($)',
      data: sortedTabs.map(([, v]) => v),
      backgroundColor: '#10b981',
      borderColor: '#059669',
      borderWidth: 1,
    }],
  };

  const salesByHostChart = {
    labels: Object.keys(byHost),
    datasets: [
      {
        label: 'Sales ($)',
        data: Object.values(byHost).map(h => h.sales),
        backgroundColor: hostColors.slice(0, Object.keys(byHost).length),
      },
    ],
  };

  const profitByProductChart = {
    labels: topProducts.map(([k]) => k),
    datasets: [{
      label: 'Profit ($)',
      data: topProducts.map(([, v]) => v),
      backgroundColor: topProducts.map(([, v]) => v.profit >= 0 ? '#10b981' : '#ef4444'),
    }],
  };

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-400 text-sm">All-time sales overview</p>
          </div>
          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <span className="bg-amber-900/30 border border-amber-700/50 text-amber-400 text-xs px-3 py-1 rounded-full">
              Demo Mode — connect Google Sheets in settings
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">Loading data...</div>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Sales" value={`$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sub={`${totalOrders} orders`} color="emerald" />
              <StatCard label="Gross Profit" value={`$${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sub="after cost of goods" color={totalProfit >= 0 ? 'blue' : 'red'} />
              <StatCard label="Avg Margin" value={`${avgMargin.toFixed(1)}%`} sub="across all shows" color="purple" />
              <StatCard label="Total Shows" value={`${Object.keys(byTab).length}`} sub={`${totalOrders} total orders`} color="amber" />
            </div>

            {/* Host breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {Object.entries(byHost).map(([host, data], i) => (
                <div key={host} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hostColors[i % hostColors.length] }} />
                      <span className="font-medium text-white">{host}</span>
                    </div>
                    <span className="text-xs text-gray-400">{data.orders} orders</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Sales</p>
                      <p className="text-white font-medium">${data.sales.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Profit</p>
                      <p className={`font-medium ${data.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${data.profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Sales by Show</h2>
                <Bar data={salesByShowChart} options={chartOptions} />
              </div>
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Sales by Host</h2>
                <div className="flex items-center justify-center h-48">
                  <Doughnut
                    data={salesByHostChart}
                    options={{
                      responsive: true,
                      plugins: { legend: { labels: { color: '#9ca3af' } } },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Top products by profit */}
            <div className="card p-5 mb-4">
              <h2 className="text-sm font-semibold text-white mb-4">Top 10 Products by Profit</h2>
              <Bar
                data={profitByProductChart}
                options={{
                  ...chartOptions,
                  indexAxis: 'y' as const,
                  plugins: { legend: { display: false } },
                }}
              />
            </div>

            {/* Recent orders table */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Recent Orders</h2>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Model #</th>
                      <th>Buyer</th>
                      <th>Host</th>
                      <th>Show</th>
                      <th className="text-right">Sold</th>
                      <th className="text-right">Profit</th>
                      <th className="text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 20).map((o, i) => (
                      <tr key={i}>
                        <td className="text-gray-300 max-w-xs truncate">{o.productName}</td>
                        <td className="text-gray-400 font-mono text-xs">{o.modelNum}</td>
                        <td className="text-gray-400">{o.buyer}</td>
                        <td>
                          <span className="bg-emerald-900/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full">
                            {o.host}
                          </span>
                        </td>
                        <td className="text-gray-400 text-xs">{o.tab}</td>
                        <td className="text-right text-white">${o.sold.toFixed(2)}</td>
                        <td className={`text-right font-medium ${o.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ${o.profit.toFixed(2)}
                        </td>
                        <td className={`text-right text-xs ${o.margin >= 20 ? 'text-emerald-400' : o.margin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                          {o.margin.toFixed(1)}%
                        </td>
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
