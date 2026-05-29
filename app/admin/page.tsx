'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

type Session = { username: string; role: string; name: string };
type Order = { tab: string; sold: number; profit: number; margin: number; host: string; buyer: string; modelNum: string; productName: string };
type Item = { qty: number; modelNum: string; description: string; retail: number; total: number };

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseTabDate(tab: string) {
  const [m, d, y] = tab.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

const HOST_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899'];

function KPI({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${color} bg-opacity-10 flex items-center justify-center`} style={{ backgroundColor: color + '15' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900 mb-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 font-medium">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || s.role !== 'admin') { router.push('/login'); return; }
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

  const revenue = orders.reduce((s, o) => s + o.sold, 0);
  const profit = orders.reduce((s, o) => s + o.profit, 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const outOfStock = items.filter(i => i.qty <= 0).length;
  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5).length;
  const invValue = items.reduce((s, i) => s + i.total, 0);

  const byTab = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { m[o.tab] = (m[o.tab] || 0) + o.sold; });
    return Object.entries(m).sort((a, b) => parseTabDate(a[0]).getTime() - parseTabDate(b[0]).getTime()).slice(-12);
  }, [orders]);

  const byHost = useMemo(() => {
    const m: Record<string, number> = {};
    orders.forEach(o => { if (o.host) m[o.host] = (m[o.host] || 0) + o.sold; });
    return m;
  }, [orders]);

  const recent = orders.slice(0, 8);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role="admin" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900">Admin Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold">Admin</span>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading data...</div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KPI label="Total Revenue" value={`$${fmt(revenue)}`} sub={`${orders.length.toLocaleString()} orders`} color="#F59E0B"
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
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">In Stock</span>
                  </div>
                  <p className="text-3xl font-black text-slate-900">{(items.length - outOfStock - lowStock).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Low Stock (≤5)</span>
                  </div>
                  <p className="text-3xl font-black text-amber-500">{lowStock.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Out of Stock</span>
                  </div>
                  <p className="text-3xl font-black text-red-500">{outOfStock.toLocaleString()}</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 text-sm mb-4">Sales by Show (Last 12)</h2>
                  <Bar
                    data={{
                      labels: byTab.map(([t]) => t),
                      datasets: [{ label: 'Sales ($)', data: byTab.map(([, v]) => v), backgroundColor: '#FBBF24', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 4 }],
                    }}
                    options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } } }}
                  />
                </div>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 text-sm mb-4">Revenue by Host</h2>
                  <div className="flex items-center justify-center h-44">
                    <Doughnut
                      data={{
                        labels: Object.keys(byHost),
                        datasets: [{ data: Object.values(byHost), backgroundColor: HOST_COLORS, borderWidth: 2, borderColor: '#fff' }],
                      }}
                      options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8 } } } }}
                    />
                  </div>
                </div>
              </div>

              {/* Recent orders */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">Recent Orders</h2>
                  <span className="text-xs text-slate-400">{orders.length.toLocaleString()} total</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100">
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Product</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Buyer</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Host</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Show</th>
                      <th className="text-right text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Revenue</th>
                      <th className="text-right text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Profit</th>
                    </tr></thead>
                    <tbody>
                      {recent.map((o, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-5 text-slate-700 text-xs font-medium max-w-[180px] truncate">{o.productName || o.modelNum}</td>
                          <td className="py-3 px-4 text-slate-500 text-xs">{o.buyer}</td>
                          <td className="py-3 px-4"><span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                          <td className="py-3 px-4 text-slate-400 text-xs">{o.tab}</td>
                          <td className="py-3 px-5 text-right font-semibold text-slate-900 text-xs">${o.sold.toFixed(2)}</td>
                          <td className={`py-3 px-5 text-right font-bold text-xs ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
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
    </div>
  );
}
