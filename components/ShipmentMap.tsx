'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

const USChoroplethMap = dynamic(() => import('@/components/USChoroplethMap'), { ssr: false });

export type MapOrder = { tab: string; shippingAddress?: string };
type ShipPeriod = 'all' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth';

function parseTabDate(tab: string) { const [m, d, y] = tab.split('/').map(Number); return new Date(2000 + y, m - 1, d); }

const PERIODS: { label: string; value: ShipPeriod }[] = [
  { label: 'All Time', value: 'all' },
  { label: '7 Days',   value: '7d' },
  { label: '30 Days',  value: '30d' },
  { label: '90 Days',  value: '90d' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
];

const STATE_FULL_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',
  NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'Washington D.C.',
};

export default function ShipmentMap({ orders }: { orders: MapOrder[] }) {
  const [hovered, setHovered]     = useState<string | null>(null);
  const [shipPeriod, setShipPeriod] = useState<ShipPeriod>('all');

  const filtered = useMemo(() => {
    if (shipPeriod === 'all') return orders;
    const now = new Date();
    return orders.filter(o => {
      const d = parseTabDate(o.tab);
      if (shipPeriod === '7d')        { const c = new Date(now); c.setDate(now.getDate() - 7);  return d >= c; }
      if (shipPeriod === '30d')       { const c = new Date(now); c.setDate(now.getDate() - 30); return d >= c; }
      if (shipPeriod === '90d')       { const c = new Date(now); c.setDate(now.getDate() - 90); return d >= c; }
      if (shipPeriod === 'thisMonth') { return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
      if (shipPeriod === 'lastMonth') { const lm = new Date(now.getFullYear(), now.getMonth()-1,1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
      return true;
    });
  }, [orders, shipPeriod]);

  const stateData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(o => {
      const addr = o.shippingAddress?.trim();
      if (!addr) return;
      let st = '';
      if (/^[A-Z]{2}$/.test(addr)) { st = addr; }
      else { const parts = addr.split(',').map(p => p.trim()); const c = parts[1] ?? ''; if (/^[A-Z]{2}$/.test(c) && c !== 'US') st = c; }
      if (st) counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  const total    = Object.values(stateData).reduce((s, v) => s + v, 0);
  const maxCount = total > 0 ? Math.max(...Object.values(stateData)) : 0;
  const topStates = Object.entries(stateData).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map(btn => (
          <button key={btn.value} onClick={() => setShipPeriod(btn.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              shipPeriod === btn.value
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400'
            }`}
          >{btn.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="text-base font-black text-slate-900 dark:text-white">Shipment Distribution</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {total > 0
                ? `${total.toLocaleString()} orders across ${Object.keys(stateData).length} states`
                : 'No shipping data — add state codes to column O in your spreadsheet'}
            </p>
          </div>

          <USChoroplethMap stateData={stateData} maxCount={maxCount} total={total} hovered={hovered} onHover={setHovered} />

          <div className="flex items-center gap-2 mt-1 justify-center">
            <span className="text-[10px] text-slate-500">0</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 12 }, (_, i) => {
                const t = i / 11;
                const stops = [[209,250,229],[110,231,183],[16,185,129],[4,120,87],[6,78,59]] as const;
                const raw = t * 4; const si = Math.min(Math.floor(raw), 3); const f = raw - si;
                const r = Math.round(stops[si][0]*(1-f)+stops[si+1][0]*f);
                const g = Math.round(stops[si][1]*(1-f)+stops[si+1][1]*f);
                const b = Math.round(stops[si][2]*(1-f)+stops[si+1][2]*f);
                return <div key={i} className="w-5 h-2.5 rounded-sm" style={{ background: `rgb(${r},${g},${b})` }} />;
              })}
            </div>
            <span className="text-[10px] text-slate-500">{maxCount > 0 ? maxCount.toLocaleString() : 'Max'}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-900 dark:text-white mb-4">Top States</h2>
          {total === 0 ? (
            <p className="text-slate-400 text-sm leading-relaxed">Add state codes to column O in your spreadsheet.<br /><br />Format: <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">TX</span></p>
          ) : (
            <div className="space-y-2.5">
              {topStates.map(([st, count], i) => (
                <div key={st}
                  className={`rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${hovered === st ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}
                  onMouseEnter={() => setHovered(st)} onMouseLeave={() => setHovered(null)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-4 text-right">{i+1}</span>
                      <div>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{st}</span>
                        <span className="text-[10px] text-slate-400 ml-1">{STATE_FULL_NAMES[st] ?? ''}</span>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{count.toLocaleString()}</span>
                      <span className="text-[11px] text-slate-400">{((count/total)*100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                    <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${(count/topStates[0][1])*100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
