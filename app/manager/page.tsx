'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

type Session = { username: string; role: string; name: string };
type Order = { tab: string; sold: number; profit: number; host: string };
type Item = { qty: number; modelNum: string; description: string };

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ManagerPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'manager' && s.role !== 'admin')) { router.push('/login'); return; }
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
  const outOfStock = items.filter(i => i.qty <= 0);
  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const teamMetrics = [
    { name: 'Jason', role: 'Host', orders: orders.filter(o => o.host === 'Jason').length, revenue: orders.filter(o => o.host === 'Jason').reduce((s, o) => s + o.sold, 0), color: 'bg-amber-500' },
    { name: 'Abraham', role: 'Host', orders: orders.filter(o => o.host === 'Abraham').length, revenue: orders.filter(o => o.host === 'Abraham').reduce((s, o) => s + o.sold, 0), color: 'bg-blue-500' },
    { name: 'Anthony', role: 'Host', orders: orders.filter(o => o.host === 'Anthony').length, revenue: orders.filter(o => o.host === 'Anthony').reduce((s, o) => s + o.sold, 0), color: 'bg-emerald-500' },
  ].filter(m => m.orders > 0);

  if (!session) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role="manager" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900">Manager Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded-full font-bold">Manager</span>
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div> : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total Revenue', value: `$${fmt(revenue)}`, color: 'border-l-amber-400' },
                  { label: 'Total Profit', value: `$${fmt(profit)}`, color: 'border-l-emerald-400' },
                  { label: 'Total Orders', value: orders.length.toLocaleString(), color: 'border-l-blue-400' },
                  { label: 'Inventory SKUs', value: items.length.toLocaleString(), color: 'border-l-violet-400' },
                ].map(k => (
                  <div key={k.label} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${k.color} shadow-sm p-5`}>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                    <p className="text-2xl font-black text-slate-900">{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Team performance */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 text-sm mb-4">Team Performance</h2>
                  {teamMetrics.length === 0 ? (
                    <p className="text-slate-400 text-sm">No host data available</p>
                  ) : (
                    <div className="space-y-3">
                      {teamMetrics.map(m => (
                        <div key={m.name} className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full ${m.color} flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>{m.name[0]}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-slate-700">{m.name}</span>
                              <span className="text-xs font-bold text-slate-500">${fmt(m.revenue)}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full ${m.color} rounded-full`} style={{ width: `${Math.min(100, (m.revenue / (revenue || 1)) * 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{m.orders} orders</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inventory alerts */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 text-sm mb-4">Inventory Alerts</h2>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                      <span className="text-sm font-semibold text-red-700">Out of Stock</span>
                      <span className="text-lg font-black text-red-600">{outOfStock.length}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <span className="text-sm font-semibold text-amber-700">Low Stock (≤5)</span>
                      <span className="text-lg font-black text-amber-600">{lowStock.length}</span>
                    </div>
                  </div>
                  {outOfStock.slice(0, 4).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-xs text-slate-600 truncate">{item.modelNum || item.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent orders table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="font-bold text-slate-900 text-sm">Recent Sales Activity</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-100">
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Show</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Host</th>
                      <th className="text-right text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Revenue</th>
                      <th className="text-right text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Profit</th>
                    </tr></thead>
                    <tbody>
                      {orders.slice(0, 10).map((o, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-5 text-slate-700 text-xs font-medium">{o.tab}</td>
                          <td className="py-3 px-4"><span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full font-semibold">{o.host}</span></td>
                          <td className="py-3 px-5 text-right text-xs font-semibold text-slate-900">${o.sold.toFixed(2)}</td>
                          <td className={`py-3 px-5 text-right text-xs font-bold ${o.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>${o.profit.toFixed(2)}</td>
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
