'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

const SHIPMENTS = [
  { id: 'ORD-7842', buyer: 'Sarah M.', item: 'Nintendo Switch Bundle', carrier: 'USPS', tracking: '9400111899224075942802', status: 'Delivered', date: '5/27/26' },
  { id: 'ORD-7841', buyer: 'Mike T.', item: 'Sony Headphones WH-1000XM5', carrier: 'USPS', tracking: '9400111899224075942791', status: 'In Transit', date: '5/27/26' },
  { id: 'ORD-7840', buyer: 'Lisa R.', item: 'iPad 10th Gen Case', carrier: 'USPS', tracking: '9400111899224075942784', status: 'In Transit', date: '5/27/26' },
  { id: 'ORD-7839', buyer: 'James K.', item: 'Apple Watch Series 9', carrier: 'USPS', tracking: '9400111899224075942777', status: 'Label Created', date: '5/28/26' },
  { id: 'ORD-7838', buyer: 'Anna P.', item: 'Roku Streaming Stick 4K', carrier: 'USPS', tracking: '9400111899224075942760', status: 'Delivered', date: '5/26/26' },
  { id: 'ORD-7837', buyer: 'Chris W.', item: 'Ring Video Doorbell Pro', carrier: 'USPS', tracking: '9400111899224075942753', status: 'Delivered', date: '5/26/26' },
];

const STATUS_STYLE: Record<string, string> = {
  'Delivered': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  'In Transit': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'Label Created': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'Exception': 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
};

export default function ShipperPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [search, setSearch] = useState('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'shipper' && s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  const filtered = SHIPMENTS.filter(s =>
    !search || s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.buyer.toLowerCase().includes(search.toLowerCase()) ||
    s.item.toLowerCase().includes(search.toLowerCase()) ||
    s.tracking.includes(search)
  );

  const delivered = SHIPMENTS.filter(s => s.status === 'Delivered').length;
  const inTransit = SHIPMENTS.filter(s => s.status === 'In Transit').length;
  const pending = SHIPMENTS.filter(s => s.status === 'Label Created').length;
  const rate = Math.round((delivered / SHIPMENTS.length) * 100);

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Shipper Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
            <div className="w-8 h-8 bg-violet-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Shipments', value: SHIPMENTS.length.toString(), color: 'border-l-slate-400', text: 'text-slate-900 dark:text-white' },
              { label: 'Delivered', value: delivered.toString(), color: 'border-l-emerald-400', text: 'text-emerald-600' },
              { label: 'In Transit', value: inTransit.toString(), color: 'border-l-blue-400', text: 'text-blue-600' },
              { label: 'Delivery Rate', value: `${rate}%`, color: 'border-l-amber-400', text: 'text-amber-600' },
            ].map(k => (
              <div key={k.label} className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${k.color} shadow-sm p-5`}>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mb-2">{k.label}</p>
                <p className={`text-2xl font-black ${k.text}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Today's Shipping Progress</h2>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{delivered + inTransit} / {SHIPMENTS.length} processed</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex gap-0.5">
              <div className="h-full bg-emerald-400 rounded-l-full transition-all" style={{ width: `${(delivered / SHIPMENTS.length) * 100}%` }} />
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${(inTransit / SHIPMENTS.length) * 100}%` }} />
              <div className="h-full bg-amber-300 transition-all" style={{ width: `${(pending / SHIPMENTS.length) * 100}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-2">
              {[['bg-emerald-400', 'Delivered'], ['bg-blue-400', 'In Transit'], ['bg-amber-300', 'Label Created']].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${c}`} />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shipments table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 gap-4">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Shipment Queue</h2>
              <input
                type="text"
                placeholder="Search order, buyer, tracking..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-xs px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 w-64 placeholder-slate-400"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-100 dark:border-slate-700">
                  {['Order ID', 'Buyer', 'Item', 'Tracking #', 'Date', 'Status'].map(h => (
                    <th key={h} className="text-left text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide py-3 px-4">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-bold text-violet-600 dark:text-violet-400">{s.id}</td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 font-medium">{s.buyer}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">{s.item}</td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-400 dark:text-slate-500">{s.tracking.slice(0, 16)}…</td>
                      <td className="py-3 px-4 text-xs text-slate-400 dark:text-slate-500">{s.date}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[s.status] ?? ''}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
