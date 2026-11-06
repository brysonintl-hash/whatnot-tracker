'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import {
  SHOW_METRICS, RUN_RANKS, RESOURCE_LABEL, slotLabel, metricValue,
  type AnalyzedShow, type ItemStat, type RunListEntry, type ResourceEntry,
  type ShowMetric, type RunRank, type SlotLabel,
} from '@/lib/showAnalyzer';

type Session = { username: string; role: Role; name: string };

type Analysis = {
  range: { days: number; from: string | null; to: string; host: string; metric: ShowMetric };
  hosts: string[];
  showCount: number;
  totalShowCount: number;
  shows: AnalyzedShow[];
  topItems: ItemStat[];
  allItems: ItemStat[];
  allItemCount: number;
  runList: RunListEntry[];
  resource: ResourceEntry[];
  inventory: {
    tab: string; demo: boolean; count: number;
    error?: string; hint?: string; serviceAccount?: string;
  };
};

type TabKey = 'shows' | 'items' | 'runlist' | 'resource';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'shows', label: 'Top Shows' },
  { key: 'items', label: 'Winning Items' },
  { key: 'runlist', label: 'Run List' },
  { key: 'resource', label: 'Re-Source' },
];

const RANGES = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: 'All time', value: 0 },
];

const TOP_SIZES = [5, 10, 15, 25];

const SLOT_STYLE: Record<SlotLabel, string> = {
  Opening: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  Early: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  Mid: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  Late: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
};

const RESOURCE_STYLE: Record<ResourceEntry['reason'], string> = {
  'sold-out': 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  'low-stock': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'not-listed': 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
};

// ─── Formatting ─────────────────────────────────────────────────────────────

function money(n: number | null, dp = 0): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}
function int(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}
function pct(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '—' : `${n.toFixed(1)}%`;
}
function hours(n: number): string {
  if (!n) return '—';
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
/** "2026-05-26" → "May 26" — the sheet's own dates, not re-zoned. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}
function fullDate(iso: string): string {
  const [y] = iso.split('-');
  return `${shortDate(iso)}, ${y}`;
}
function metricLabel(m: ShowMetric): string {
  return SHOW_METRICS.find(x => x.key === m)?.label ?? m;
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function SlotPill({ slot }: { slot: SlotLabel | null }) {
  if (!slot) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${SLOT_STYLE[slot]}`}>
      {slot}
    </span>
  );
}

function StockPill({ stock }: { stock: ItemStat['stock'] }) {
  if (!stock) {
    return <span className="text-[10px] font-bold text-slate-400" title="This model number isn't on the inventory sheet">Not listed</span>;
  }
  if (stock.remaining <= 0) {
    return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">Sold out</span>;
  }
  const low = stock.remaining <= 5;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${low
      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
      : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'}`}>
      {int(stock.remaining)} left
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center shadow-sm">
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto">{body}</p>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      {done ? 'Copied' : label}
    </button>
  );
}

const TH = 'py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const THR = `${TH} text-right`;
const TD = 'py-2.5 px-3 text-sm text-slate-700 dark:text-slate-300';
const TDR = `${TD} text-right tabular-nums whitespace-nowrap`;

// ─── Tab 1: Top shows ───────────────────────────────────────────────────────

function TopShows({ data }: { data: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  const metric = data.range.metric;

  if (!data.shows.length) {
    return <Empty title="No shows in this range"
      body="Widen the date range, or clear the host filter. A show needs at least one order row on a dated tab of the sales sheet to be counted." />;
  }

  const totals = data.shows.reduce((a, s) => ({
    sales: a.sales + s.sales, profit: a.profit + s.profit, units: a.units + s.units,
  }), { sales: 0, profit: 0, units: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={`Top ${data.shows.length} shows`} value={int(data.shows.length)} sub={`of ${int(data.showCount)} in range`} />
        <Tile label="Their sales" value={money(totals.sales)} />
        <Tile label="Their profit" value={money(totals.profit)}
          sub={totals.sales > 0 ? `${pct((totals.profit / totals.sales) * 100)} margin` : undefined} />
        <Tile label="Units sold" value={int(totals.units)} />
      </div>

      <div className="space-y-2">
        {data.shows.map((s, i) => {
          const expanded = open === s.id;
          return (
            <div key={s.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setOpen(expanded ? null : s.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${i < 3
                  ? 'bg-amber-400 text-amber-950'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {s.host}
                    <span className="font-normal text-slate-400"> · {fullDate(s.date)}</span>
                    {s.livestream > 1 && <span className="font-normal text-slate-400"> · stream {s.livestream}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {int(s.runs.length)} items · {int(s.orders)} orders · {hours(s.durationHours)}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-5 text-right">
                  <div>
                    <p className={`text-[10px] font-bold uppercase ${metric === 'sales' ? 'text-amber-500' : 'text-slate-400'}`}>Sales{metric === 'sales' ? ' ▾' : ''}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{money(s.sales)}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] font-bold uppercase ${metric === 'profit' ? 'text-amber-500' : 'text-slate-400'}`}>Profit{metric === 'profit' ? ' ▾' : ''}</p>
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{money(s.profit)}</p>
                  </div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-400">Margin</p><p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{pct(s.marginPct)}</p></div>
                </div>

                {/* Sales and Profit already sit in the row above, so the rank
                    column would just print the same number twice. There it is
                    marked in the row instead, and this stays for narrow screens
                    where the row is hidden. */}
                <div className={`text-right flex-shrink-0 pl-2 border-l border-slate-100 dark:border-slate-700 ${
                  metric === 'sales' || metric === 'profit' ? 'sm:hidden' : ''}`}>
                  <p className="text-[10px] font-bold uppercase text-amber-500">{metricLabel(metric)}</p>
                  <p className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                    {money(metricValue(s, metric))}
                  </p>
                </div>

                <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-700">
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {s.orderSource === 'timestamp'
                        ? 'Run order taken from the order times on the sheet.'
                        : 'This tab records a show length rather than clock times, so the order below is the order the rows sit in the sheet.'}
                    </p>
                    <CopyButton
                      label="Copy run order"
                      text={[
                        `${s.host} — ${fullDate(s.date)}${s.livestream > 1 ? ` (stream ${s.livestream})` : ''}`,
                        ...s.runs.map(r => `${r.runOrder}. ${r.modelNum} — ${r.productName} — ${r.units} sold, ${money(r.revenue)}`),
                      ].join('\n')}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-900/40 border-y border-slate-100 dark:border-slate-700">
                        <tr>
                          <th className={TH}>#</th>
                          <th className={TH}>Item</th>
                          <th className={TH}>Model</th>
                          <th className={THR}>Units</th>
                          <th className={THR}>Sales</th>
                          <th className={THR}>Profit</th>
                          <th className={THR}>Margin</th>
                          <th className={TH}>Slot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {s.runs.map(r => (
                          <tr key={r.modelNum} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                            <td className={`${TD} text-slate-400 tabular-nums w-10`}>{r.runOrder}</td>
                            <td className={`${TD} max-w-[320px]`}>
                              <span className="block truncate" title={r.productName}>{r.productName || '—'}</span>
                            </td>
                            <td className={`${TD} font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{r.modelNum}</td>
                            <td className={TDR}>{int(r.units)}</td>
                            <td className={TDR}>{money(r.revenue)}</td>
                            <td className={`${TDR} ${r.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(r.profit)}</td>
                            <td className={TDR}>{pct(r.revenue > 0 ? (r.profit / r.revenue) * 100 : null)}</td>
                            <td className={TD}><SlotPill slot={slotLabel(r.slotPct)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab 2: Winning items ───────────────────────────────────────────────────

type ItemSort = 'profit' | 'revenue' | 'units' | 'marginPct' | 'showsRun' | 'profitPerShow';

const ITEM_COLUMNS: { key: ItemSort; label: string }[] = [
  { key: 'showsRun', label: 'Shows' },
  { key: 'units', label: 'Units' },
  { key: 'revenue', label: 'Sales' },
  { key: 'profit', label: 'Profit' },
  { key: 'profitPerShow', label: 'Profit/show' },
  { key: 'marginPct', label: 'Margin' },
];

function itemSortValue(i: ItemStat, k: ItemSort): number {
  switch (k) {
    case 'profit': return i.profit;
    case 'revenue': return i.revenue;
    case 'units': return i.units;
    case 'marginPct': return i.marginPct ?? -Infinity;
    case 'showsRun': return i.showsRun;
    case 'profitPerShow': return i.profitPerShow;
  }
}

function WinningItems({ data }: { data: Analysis }) {
  const [scope, setScope] = useState<'top' | 'all'>('top');
  const [sort, setSort] = useState<ItemSort>('profit');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const base = scope === 'top' ? data.topItems : data.allItems;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(i => i.modelNum.toLowerCase().includes(q) || i.productName.toLowerCase().includes(q))
      : base;
    return [...filtered].sort((a, b) => itemSortValue(b, sort) - itemSortValue(a, sort) || b.revenue - a.revenue);
  }, [data, scope, sort, query]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {([['top', `Top ${data.shows.length} shows`], ['all', 'All shows in range']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${scope === k
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
              {label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by model or name"
          className="flex-1 min-w-[180px] text-sm px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <span className="text-[11px] text-slate-400">
          {int(rows.length)} items
          {scope === 'all' && data.allItemCount > data.allItems.length &&
            ` · showing the top ${int(data.allItems.length)} of ${int(data.allItemCount)} by sales`}
        </span>
      </div>

      {!rows.length ? (
        <Empty title="Nothing to show yet"
          body="No items matched. Try the other scope, clear the filter, or widen the date range." />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className={TH}>Item</th>
                  <th className={TH}>Model</th>
                  {ITEM_COLUMNS.map(c => (
                    <th key={c.key} className={`${THR} cursor-pointer select-none hover:text-slate-600 dark:hover:text-slate-200`}
                      onClick={() => setSort(c.key)}>
                      {c.label}{sort === c.key ? ' ▾' : ''}
                    </th>
                  ))}
                  <th className={THR}>Avg price</th>
                  <th className={TH}>Typical slot</th>
                  <th className={TH}>Stock now</th>
                  <th className={TH}>Last run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map(i => (
                  <tr key={i.modelNum} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className={`${TD} max-w-[300px]`}>
                      <span className="block truncate font-medium text-slate-900 dark:text-white" title={i.productName}>
                        {i.productName || '—'}
                      </span>
                      <span className="text-[11px] text-slate-400">{i.hosts.join(', ')}</span>
                    </td>
                    <td className={`${TD} font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{i.modelNum}</td>
                    <td className={TDR}>{int(i.showsRun)}</td>
                    <td className={TDR}>{int(i.units)}</td>
                    <td className={TDR}>{money(i.revenue)}</td>
                    <td className={`${TDR} ${i.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} font-bold`}>{money(i.profit)}</td>
                    <td className={TDR}>{money(i.profitPerShow)}</td>
                    <td className={TDR}>{pct(i.marginPct)}</td>
                    <td className={TDR}>{money(i.avgPrice, 2)}</td>
                    <td className={TD}><SlotPill slot={i.slot} /></td>
                    <td className={TD}><StockPill stock={i.stock} /></td>
                    <td className={`${TD} text-xs text-slate-400 whitespace-nowrap`}>{shortDate(i.lastRun)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Run list ────────────────────────────────────────────────────────

function RunList({
  data, runSize, setRunSize, runRank, setRunRank,
}: {
  data: Analysis;
  runSize: number; setRunSize: (n: number) => void;
  runRank: RunRank; setRunRank: (r: RunRank) => void;
}) {
  const list = data.runList;

  const asText = useMemo(() => [
    `Run list — built from the top ${data.shows.length} shows by ${metricLabel(data.range.metric)}`,
    `Ranked on ${RUN_RANKS.find(r => r.key === runRank)?.label.toLowerCase()}, ordered by the slot each item usually ran in.`,
    '',
    ...list.map(e =>
      `${e.position}. ${e.modelNum} — ${e.productName}` +
      ` | run ${e.suggestedQty} (${e.remaining} in stock)` +
      ` | avg sold ${money(e.avgPrice, 2)}` +
      ` | ${money(e.profitPerShow)} profit/show over ${e.showsRun} show${e.showsRun === 1 ? '' : 's'}`),
  ].join('\n'), [list, data, runRank]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          Rank by
          <select value={runRank} onChange={e => setRunRank(e.target.value as RunRank)}
            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400">
            {RUN_RANKS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          List size
          <select value={runSize} onChange={e => setRunSize(Number(e.target.value))}
            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400">
            {[10, 15, 20, 30, 40].map(n => <option key={n} value={n}>{n} items</option>)}
          </select>
        </label>
        <div className="flex-1" />
        {list.length > 0 && <CopyButton label="Copy run list" text={asText} />}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <span className="font-bold">How this is built.</span> Items are picked from the top {data.shows.length} shows
          by {RUN_RANKS.find(r => r.key === runRank)?.label.toLowerCase()}, kept only if the inventory sheet still shows
          stock, then ordered by where in a show each one usually ran — so openers open. Suggested quantity is what the
          item typically shifts in one show, capped at what is on hand.
        </p>
      </div>

      {!list.length ? (
        <Empty
          title="Nothing on this list yet"
          body={data.inventory.error
            ? `The inventory sheet couldn't be read, so nothing could be matched to stock. ${data.inventory.error}`
            : 'None of the winning items from these shows came back with stock on the inventory sheet. Check the Re-Source tab — they may all be sold out, or their model numbers may be written differently in the two sheets.'}
        />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className={TH}>#</th>
                  <th className={TH}>Item</th>
                  <th className={TH}>Model</th>
                  <th className={THR}>Run</th>
                  <th className={THR}>In stock</th>
                  <th className={THR}>Avg sold</th>
                  <th className={THR}>Profit/show</th>
                  <th className={THR}>Margin</th>
                  <th className={TH}>Slot</th>
                  <th className={THR}>Track record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {list.map(e => (
                  <tr key={e.modelNum} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className={`${TD} w-10`}>
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-[11px] font-black text-slate-600 dark:text-slate-300">
                        {e.position}
                      </span>
                    </td>
                    <td className={`${TD} max-w-[300px]`}>
                      <span className="block truncate font-medium text-slate-900 dark:text-white" title={e.productName}>
                        {e.productName || '—'}
                      </span>
                    </td>
                    <td className={`${TD} font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{e.modelNum}</td>
                    <td className={`${TDR} font-black text-slate-900 dark:text-white`}>{int(e.suggestedQty)}</td>
                    <td className={TDR}>{int(e.remaining)}</td>
                    <td className={TDR}>{money(e.avgPrice, 2)}</td>
                    <td className={`${TDR} text-emerald-600 dark:text-emerald-400 font-bold`}>{money(e.profitPerShow)}</td>
                    <td className={TDR}>{pct(e.marginPct)}</td>
                    <td className={TD}><SlotPill slot={e.slot} /></td>
                    <td className={`${TDR} text-xs text-slate-400`}>{int(e.showsRun)} show{e.showsRun === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Re-source ───────────────────────────────────────────────────────

function ReSource({ data }: { data: Analysis }) {
  const [filter, setFilter] = useState<'all' | ResourceEntry['reason']>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { 'sold-out': 0, 'low-stock': 0, 'not-listed': 0 };
    for (const r of data.resource) c[r.reason]++;
    return c;
  }, [data.resource]);

  const rows = filter === 'all' ? data.resource : data.resource.filter(r => r.reason === filter);

  const asText = useMemo(() => [
    'Re-source list — winners from the top shows that we can no longer run',
    '',
    ...rows.map((r, i) =>
      `${i + 1}. ${r.modelNum} — ${r.productName}` +
      ` | ${RESOURCE_LABEL[r.reason]}${r.remaining !== null ? ` (${r.remaining} left)` : ''}` +
      ` | ${int(r.units)} sold, ${money(r.revenue)} sales, ${money(r.profit)} profit at ${pct(r.marginPct)}` +
      ` | avg sold ${money(r.avgPrice, 2)} | last run ${r.lastRun}`),
  ].join('\n'), [rows]);

  // Always the whole list, never the filtered view — the four tiles describe
  // the same thing as each other, and a headline that moved when you clicked a
  // filter would read as a different number for the same question.
  const lost = data.resource.reduce((s, r) => s + r.profit, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Sold out" value={int(counts['sold-out'])} sub="Zero left on the sheet" />
        <Tile label="Running low" value={int(counts['low-stock'])} sub="5 or fewer left" />
        <Tile label="Not on the sheet" value={int(counts['not-listed'])} sub="Model number not found" />
        <Tile label="Profit at stake" value={money(lost)} sub="What all of these made over the window" />
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <span className="font-bold">Before you buy.</span> Sold out and running low are real sourcing jobs. <span className="font-bold">Not on the inventory
          sheet</span> usually means the model number is typed differently in the two sheets rather than that we never
          stocked it — worth a look on the inventory tab first.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        {(['all', 'sold-out', 'low-stock', 'not-listed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter === f
              ? 'bg-red-500 border-red-500 text-white'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
            {f === 'all' ? `All (${data.resource.length})` : `${RESOURCE_LABEL[f]} (${counts[f]})`}
          </button>
        ))}
        <div className="flex-1" />
        {rows.length > 0 && <CopyButton label="Copy sourcing list" text={asText} />}
      </div>

      {!rows.length ? (
        <Empty title="Nothing to re-source"
          body="Every item that did well on these shows still has stock on the inventory sheet. Good place to be." />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className={TH}>Item</th>
                  <th className={TH}>Model</th>
                  <th className={TH}>Why</th>
                  <th className={THR}>Units sold</th>
                  <th className={THR}>Sales</th>
                  <th className={THR}>Profit</th>
                  <th className={THR}>Margin</th>
                  <th className={THR}>Avg sold</th>
                  <th className={THR}>Shows</th>
                  <th className={TH}>Last run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map(r => (
                  <tr key={r.modelNum} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className={`${TD} max-w-[300px]`}>
                      <span className="block truncate font-medium text-slate-900 dark:text-white" title={r.productName}>
                        {r.productName || '—'}
                      </span>
                    </td>
                    <td className={`${TD} font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap`}>{r.modelNum}</td>
                    <td className={TD}>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${RESOURCE_STYLE[r.reason]}`}>
                        {RESOURCE_LABEL[r.reason]}{r.reason === 'low-stock' ? ` · ${int(r.remaining)}` : ''}
                      </span>
                    </td>
                    <td className={TDR}>{int(r.units)}</td>
                    <td className={TDR}>{money(r.revenue)}</td>
                    <td className={`${TDR} ${r.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} font-bold`}>{money(r.profit)}</td>
                    <td className={TDR}>{pct(r.marginPct)}</td>
                    <td className={TDR}>{money(r.avgPrice, 2)}</td>
                    <td className={TDR}>{int(r.showsRun)}</td>
                    <td className={`${TD} text-xs text-slate-400 whitespace-nowrap`}>{shortDate(r.lastRun)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AnalyzerPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<TabKey>('shows');
  const [days, setDays] = useState(90);
  const [host, setHost] = useState('');
  const [metric, setMetric] = useState<ShowMetric>('sales');
  const [top, setTop] = useState(10);
  const [runSize, setRunSize] = useState(20);
  const [runRank, setRunRank] = useState<RunRank>('profitPerShow');

  useEffect(() => {
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then((s: Session | null) => {
        if (!s) { router.push('/login'); return; }
        setSession(s);
      });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams({
      days: String(days), top: String(top), metric, host,
      runSize: String(runSize), runRank,
    });
    setLoading(true);
    fetch(`/api/analyzer?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d?.error) { setError(d.error); setData(null); }
        else { setError(''); setData(d as Analysis); }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [session, days, top, metric, host, runSize, runRank]);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const selectCls = 'text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white">Show Analyzer</h1>
            <p className="text-xs text-slate-400 hidden sm:block truncate">
              Best shows → what ran in them → what to run next → what to buy again
            </p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize flex-shrink-0">{session.role}</span>
        </header>

        <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex gap-1 overflow-x-auto flex-shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${tab === t.key
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters drive every tab — the run list and the sourcing list are
            both built from whichever shows are selected here. */}
        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 flex-shrink-0">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Range
            <select value={days} onChange={e => setDays(Number(e.target.value))} className={selectCls}>
              {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Host
            <select value={host} onChange={e => setHost(e.target.value)} className={selectCls}>
              <option value="">All hosts</option>
              {(data?.hosts ?? []).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Best by
            <select value={metric} onChange={e => setMetric(e.target.value as ShowMetric)} className={selectCls}>
              {SHOW_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Top
            <select value={top} onChange={e => setTop(Number(e.target.value))} className={selectCls}>
              {TOP_SIZES.map(n => <option key={n} value={n}>{n} shows</option>)}
            </select>
          </label>
          {data && (
            <span className="text-[11px] text-slate-400">
              {int(data.showCount)} show{data.showCount === 1 ? '' : 's'} in range
              {data.range.from && ` · ${shortDate(data.range.from)} – ${shortDate(data.range.to)}`}
            </span>
          )}
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {data?.inventory.demo && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Sample inventory</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                Google Sheets credentials aren&apos;t configured here, so stock levels are placeholders. Sales figures
                are placeholders too — don&apos;t buy anything off this screen.
              </p>
            </div>
          )}
          {data?.inventory.error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">Inventory sheet: {data.inventory.error}</p>
              {data.inventory.hint && <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">{data.inventory.hint}</p>}
              {data.inventory.serviceAccount && <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5 font-mono break-all">{data.inventory.serviceAccount}</p>}
              <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
                Show and item figures below are still correct — only the stock columns are blank.
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {loading && !data ? (
            <div className="text-center py-16 text-sm text-slate-400">Reading the sales and inventory sheets...</div>
          ) : !data ? (
            <Empty title="Nothing loaded" body="The analyzer couldn't read the sheets. Try again in a moment." />
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {tab === 'shows' && <TopShows data={data} />}
              {tab === 'items' && <WinningItems data={data} />}
              {tab === 'runlist' && (
                <RunList data={data} runSize={runSize} setRunSize={setRunSize} runRank={runRank} setRunRank={setRunRank} />
              )}
              {tab === 'resource' && <ReSource data={data} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
