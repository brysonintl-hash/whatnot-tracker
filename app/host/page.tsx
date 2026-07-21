'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import SalesCalendar from '@/components/SalesCalendar';
import ShipmentMap from '@/components/ShipmentMap';

type Session = { username: string; role: string; name: string };
type Order = { tab: string; sold: number; profit: number; margin: number; host: string; buyer: string; productName: string; modelNum: string; qty: number; shippingAddress?: string };
type Item = { qty: number; modelNum: string; description: string; retail: number };
type DashTab = 'overview' | 'calendar' | 'shipping';

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseTabDate(tab: string) {
  const [m, d, y] = tab.split('/').map(Number);
  return new Date(2000 + y, m - 1, d);
}

const TABS: { key: DashTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
  { key: 'calendar', label: 'Calendar View', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
  { key: 'shipping', label: 'Shipping Map', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg> },
];

export default function HostPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [items, setItems]     = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashTab, setDashTab] = useState<DashTab>('overview');

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'host' && s.role !== 'admin')) { router.push('/login'); return; }
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

  const myOrders = useMemo(() => {
    if (!session) return orders;
    const hostName = session.name;
    const filtered = orders.filter(o => o.host && o.host.toLowerCase().includes(hostName.toLowerCase().split(' ')[0]));
    return filtered.length > 0 ? filtered : orders;
  }, [orders, session]);

  const revenue = myOrders.reduce((s, o) => s + o.sold, 0);
  const profit  = myOrders.reduce((s, o) => s + o.profit, 0);
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;

  const showBreakdown = useMemo(() => {
    const m: Record<string, { sales: number; profit: number; orders: number }> = {};
    myOrders.forEach(o => {
      if (!m[o.tab]) m[o.tab] = { sales: 0, profit: 0, orders: 0 };
      m[o.tab].sales += o.sold; m[o.tab].profit += o.profit; m[o.tab].orders++;
    });
    return Object.entries(m).sort((a, b) => parseTabDate(b[0]).getTime() - parseTabDate(a[0]).getTime()).slice(0, 8);
  }, [myOrders]);

  const topItems = useMemo(() => {
    const m: Record<string, { revenue: number; qty: number }> = {};
    myOrders.forEach(o => {
      const k = o.modelNum || o.productName || 'Unknown';
      if (!m[k]) m[k] = { revenue: 0, qty: 0 };
      m[k].revenue += o.sold; m[k].qty += o.qty;
    });
    return Object.entries(m).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  }, [myOrders]);

  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5).slice(0, 4);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role="host" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Host Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full font-bold">Host</span>
        </header>

        {/* Tab bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-6">
          <div className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setDashTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3.5 text-xs font-bold border-b-2 transition-colors ${
                  dashTab === tab.key
                    ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>
          ) : dashTab === 'calendar' ? (
            <SalesCalendar orders={myOrders} />
          ) : dashTab === 'shipping' ? (
            <ShipmentMap orders={orders} />
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'My Revenue',   value: `$${fmt(revenue)}`, border: 'border-l-amber-400',  text: 'text-slate-900 dark:text-white' },
                  { label: 'My Profit',    value: `$${fmt(profit)}`,  border: 'border-l-emerald-400', text: profit >= 0 ? 'text-emerald-600' : 'text-red-500' },
                  { label: 'Avg Margin',   value: `${margin.toFixed(1)}%`, border: 'border-l-blue-400', text: 'text-blue-600' },
                  { label: 'Total Orders', value: myOrders.length.toLocaleString(), border: 'border-l-violet-400', text: 'text-slate-900 dark:text-white' },
                ].map(k => (
                  <div key={k.label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${k.border} shadow-sm p-5`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                    <p className={`text-2xl font-black ${k.text}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Show breakdown */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Recent Shows</h2>
                  <div className="space-y-2">
                    {showBreakdown.map(([tab, d]) => (
                      <div key={tab} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <div className="w-10 h-10 bg-amber-400/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{tab}</span>
                            <span className="text-xs font-black text-white">${fmt(d.sales)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[10px] text-slate-400">{d.orders} orders</span>
                            <span className={`text-[10px] font-bold ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>+${fmt(d.profit)} profit</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Top items */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                    <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-3">Top Selling Items</h2>
                    <div className="space-y-2">
                      {topItems.map(([name, d], i) => (
                        <div key={name} className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                          <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{name}</span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">${fmt(d.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Low stock alert */}
                  {lowStock.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Low Stock Alert</span>
                      </div>
                      {lowStock.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                          <span className="text-xs text-amber-800 dark:text-amber-300 truncate">{item.modelNum || item.description}</span>
                          <span className="text-xs font-black text-amber-600 dark:text-amber-400 ml-2">{item.qty} left</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent orders */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <h2 className="font-bold text-slate-900 dark:text-white text-sm">Recent Orders</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700">
                        {['Item', 'Buyer', 'Show', 'Revenue', 'Profit'].map(h => (
                          <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {myOrders.slice(0, 10).map((o, i) => (
                        <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 px-5 text-xs text-slate-700 dark:text-slate-300 font-medium max-w-[180px] truncate">{o.productName || o.modelNum}</td>
                          <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{o.buyer}</td>
                          <td className="py-3 px-4 text-xs text-slate-400">{o.tab}</td>
                          <td className="py-3 px-5 text-right text-xs font-semibold text-slate-900 dark:text-white">${o.sold.toFixed(2)}</td>
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
