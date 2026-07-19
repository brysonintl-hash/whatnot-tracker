'use client';

import { useState, useMemo } from 'react';

export type CalOrder = { tab: string; sold: number; profit: number };

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseTabDate(tab: string) { const [m, d, y] = tab.split('/').map(Number); return new Date(2000 + y, m - 1, d); }
function tabToKey(tab: string): string { const p = tab.split('/'); if (p.length !== 3) return ''; const [m, d, y] = p.map(Number); return `${2000+y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function dKey(y: number, mo: number, d: number) { return `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const calIco = <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;

export default function SalesCalendar({ orders }: { orders: CalOrder[] }) {
  const now = new Date();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const todayKey = dKey(now.getFullYear(), now.getMonth(), now.getDate());

  const ordersByDay = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; count: number }> = {};
    orders.forEach(o => {
      const k = tabToKey(o.tab); if (!k) return;
      if (!map[k]) map[k] = { revenue: 0, profit: 0, count: 0 };
      map[k].revenue += o.sold; map[k].profit += o.profit; map[k].count++;
    });
    return map;
  }, [orders]);

  const monthOrders = useMemo(() =>
    orders.filter(o => { const d = parseTabDate(o.tab); return d.getFullYear() === calYear && d.getMonth() === calMonth; }),
  [orders, calYear, calMonth]);

  const mRev    = monthOrders.reduce((s, o) => s + o.sold, 0);
  const mProfit = monthOrders.reduce((s, o) => s + o.profit, 0);
  const mMargin = mRev > 0 ? (mProfit / mRev) * 100 : 0;
  const mCount  = monthOrders.length;
  const opDays  = Object.keys(ordersByDay).filter(k => { const [y, m] = k.split('-').map(Number); return y === calYear && m === calMonth + 1 && ordersByDay[k].revenue > 0; }).length;

  const maxDay = useMemo(() => {
    let max = 0;
    for (let d = 1; d <= new Date(calYear, calMonth + 1, 0).getDate(); d++) {
      const r = ordersByDay[dKey(calYear, calMonth, d)]?.revenue ?? 0;
      if (r > max) max = r;
    }
    return max;
  }, [ordersByDay, calYear, calMonth]);

  const cells = useMemo(() => {
    const firstDow = new Date(calYear, calMonth, 1).getDay();
    const last = new Date(calYear, calMonth + 1, 0).getDate();
    const arr: Array<{ day: number | null; key: string | null }> = [];
    for (let i = 0; i < firstDow; i++) arr.push({ day: null, key: null });
    for (let d = 1; d <= last; d++) arr.push({ day: d, key: dKey(calYear, calMonth, d) });
    return arr;
  }, [calYear, calMonth]);

  const dayBg  = (r: number) => { if (!r || !maxDay) return ''; const x = r/maxDay; return x>=.6 ? 'bg-green-100 dark:bg-green-900/30' : x>=.25 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-50 dark:bg-red-900/20'; };
  const dayDot = (r: number) => { if (!r || !maxDay) return ''; const x = r/maxDay; return x>=.6 ? 'bg-green-500' : x>=.25 ? 'bg-amber-500' : 'bg-red-400'; };
  const prevM = () => { if (calMonth === 0) { setCalYear(y=>y-1); setCalMonth(11); } else setCalMonth(m=>m-1); };
  const nextM = () => { if (calMonth === 11) { setCalYear(y=>y+1); setCalMonth(0); } else setCalMonth(m=>m+1); };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 shadow-lg">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Revenue</p>
          <p className="text-3xl font-black text-white mb-3">${fmt(mRev)}</p>
          <p className="text-slate-500 text-[11px]">{opDays} operating day{opDays !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Gross Profit</p>
          <p className={`text-2xl font-black mb-1 ${mProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(mProfit)}</p>
          <p className="text-slate-400 text-[11px]">{mMargin.toFixed(1)}% margin</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Net Profit</p>
          <p className={`text-2xl font-black mb-1 ${mProfit >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>${fmt(mProfit)}</p>
          <p className="text-slate-400 text-[11px]">{mProfit >= 0 ? 'Profitable' : 'Not profitable'}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Sales</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mb-1">{mCount}</p>
          <p className="text-slate-400 text-[11px]">{opDays > 0 ? (mCount / opDays).toFixed(1) : '0'} avg/day</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center">{calIco}</div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">{MONTHS[calMonth]} {calYear}</h2>
              <p className="text-[10px] text-slate-400">Daily financial overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); }} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Today</button>
            <button onClick={prevM} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextM} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell.day || !cell.key) return <div key={i} className="border-r border-b border-slate-50 dark:border-slate-700/40 h-24" />;
            const data = ordersByDay[cell.key]; const rev = data?.revenue ?? 0; const isToday = cell.key === todayKey;
            return (
              <div key={cell.key} className={`border-r border-b border-slate-100 dark:border-slate-700/40 h-24 p-2.5 ${rev > 0 ? dayBg(rev) : 'hover:bg-slate-50 dark:hover:bg-slate-700/20'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  {isToday
                    ? <span className="text-[9px] font-black text-white bg-blue-500 rounded px-1.5 py-0.5">{cell.day} TODAY</span>
                    : <span className={`text-xs font-bold ${rev > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>{cell.day}</span>}
                  {rev > 0 && <div className={`w-2 h-2 rounded-full ${dayDot(rev)}`} />}
                </div>
                {rev > 0
                  ? <div><p className="text-[11px] font-black text-slate-800 dark:text-slate-200">${fmt(rev)}</p><p className="text-[9px] text-slate-400 mt-0.5">{data.count} order{data.count !== 1 ? 's' : ''}</p></div>
                  : <p className="text-[10px] text-slate-300 dark:text-slate-600">No sales</p>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-5 px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60">
          {[{l:'High',d:'bg-green-500'},{l:'Medium',d:'bg-amber-500'},{l:'Low',d:'bg-red-400'},{l:'No sales',d:'bg-slate-200 dark:bg-slate-600'}].map(({l,d})=>(
            <div key={l} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${d}`}/><span className="text-[11px] text-slate-500 dark:text-slate-400">{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
