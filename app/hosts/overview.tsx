'use client';

// ─── Host & Profit — the Hosts tab ─────────────────────────────────────────
//
// Charts follow the dataviz method: every chart here is a single series, so
// one validated blue carries all of them (light #2a78d6 on white, dark #3987e5
// on slate-800 — both pass the band, chroma and 3:1 contrast checks). The one
// exception is Unassigned, drawn in muted gray because it is not a host and
// should never read as a rival to one. Deltas pair colour with an arrow and a
// word, so nothing depends on colour alone.
//
// Motion uses the same easing as the sidebar, and every animation is dropped
// under prefers-reduced-motion.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip,
  type Plugin,
} from 'chart.js';
import type { HostPerf } from '@/lib/whatnot/metrics';
import type { Totals, Deltas, Delta, SeriesPoint, Takeaway } from '@/lib/whatnot/overview';
import { useTheme } from '@/lib/useTheme';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip);

export type Overview = {
  totals: Totals;
  prior: Totals | null;
  deltas: Deltas;
  series: { bucket: 'day' | 'week'; points: SeriesPoint[] };
  takeaways: Takeaway[];
};

const UNASSIGNED = 'Unassigned';
const EASE = 'ease-[cubic-bezier(.22,1,.36,1)]';

const SERIES = { light: '#2a78d6', dark: '#3987e5' };
const MUTED = '#898781';
const GRID = { light: '#e2e8f0', dark: '#334155' };

// ─── Formatting ─────────────────────────────────────────────────────────────

const money = (n: number | null | undefined, dp = 0) =>
  n == null || !Number.isFinite(n) ? '—'
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const int = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
const pct = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(dp)}%`;
const hrs = (n: number) => {
  if (!n) return '—';
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return h ? `${h.toLocaleString('en-US')}h ${m}m` : `${m}m`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

// ─── Motion helpers ─────────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Eases a figure from where it was to where it is now.
 *
 * Starts from the previous value, not zero, so changing the date range moves
 * the number rather than replaying the whole count.
 */
function useCountUp(target: number, ms = 650): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setValue(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms, reduced]);
  return value;
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

/**
 * Inline SVG rather than a chart instance: four of these sit in the tiles and
 * a canvas each would be heavy for a 40px line. Nulls break the line rather
 * than dropping to zero, so a day with nothing costed reads as unknown.
 */
function Sparkline({ values }: { values: (number | null)[] }) {
  const W = 120, H = 36, PAD = 3;
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  // A handful of scattered points is not a trend, and drawn as one it looks
  // like a broken line. Leave the space empty rather than imply a shape.
  if (nums.length < Math.max(4, values.length * 0.25)) return <div className="h-9 w-[120px]" />;

  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / Math.max(1, values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const segments: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { if (cur) segments.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  const lastIdx = values.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0).pop()!;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden>
      {segments.map((d, i) => (
        <path key={i} d={d} pathLength={1} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          className="stroke-[#2a78d6] dark:stroke-[#3987e5] [stroke-dasharray:1] animate-[spark-draw_900ms_cubic-bezier(.22,1,.36,1)_both] motion-reduce:animate-none" />
      ))}
      <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r={3}
        className="fill-[#2a78d6] dark:fill-[#3987e5] stroke-white dark:stroke-slate-800" strokeWidth={2} />
    </svg>
  );
}

// ─── KPI tile ───────────────────────────────────────────────────────────────

function DeltaChip({ d, period }: { d: Delta | null; period: string | null }) {
  if (!d || !period) return <span className="h-5" aria-hidden />;
  const flat = Math.abs(d.value) < 0.05;
  const up = d.value > 0;
  const text = d.unit === 'pct' ? `${Math.abs(d.value).toFixed(1)}%` : `${Math.abs(d.value).toFixed(1)} pts`;
  const tone = flat
    ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
    : d.good
      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-[#006300] dark:text-[#0ca30c]'
      : 'bg-red-50 dark:bg-red-900/30 text-[#d03b3b]';
  return (
    <span className={`inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md text-[11px] font-bold whitespace-nowrap ${tone}`}
      title={`${d.good ? 'Better' : 'Worse'} than the previous ${period}`}>
      <span aria-hidden>{flat ? '→' : up ? '↑' : '↓'}</span>
      <span className="sr-only">{flat ? 'unchanged' : up ? 'up' : 'down'}</span>
      {text}
    </span>
  );
}

function Tile({
  label, value, format, sub, delta, period, spark, chip, index, dim,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  sub?: React.ReactNode;
  delta: Delta | null;
  period: string | null;
  spark: (number | null)[];
  chip?: React.ReactNode;
  index: number;
  /** Greys the figure when it rests on too little data to lean on. */
  dim?: boolean;
}) {
  const shown = useCountUp(value ?? 0);
  return (
    <div
      style={{ animationDelay: `${index * 70}ms` }}
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm
        animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both ${EASE} motion-reduce:animate-none
        hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-300 motion-reduce:transition-none`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <DeltaChip d={delta} period={period} />
      </div>
      {/* Proportional figures on the hero number: tabular digits look loose at this size. */}
      <p className={`text-[26px] leading-tight font-black mt-1 ${dim ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
        {value == null ? '—' : format(shown)}
      </p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <div className="min-w-0 text-[11px] text-slate-400 leading-snug">
          {sub}
          {chip && <div className="mt-1">{chip}</div>}
        </div>
        <Sparkline values={spark} />
      </div>
    </div>
  );
}

// ─── Trend chart ────────────────────────────────────────────────────────────

type TrendMetric = 'sales' | 'hours' | 'giveaway';
const TREND_METRICS: { key: TrendMetric; label: string; money: boolean }[] = [
  { key: 'sales', label: 'Sales', money: true },
  { key: 'hours', label: 'Hours on air', money: false },
  { key: 'giveaway', label: 'Giveaway cost', money: true },
];

/** A vertical hairline at the hovered point, so the tooltip has an anchor. */
const crosshair: Plugin<'line'> = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = MUTED;
    ctx.stroke();
    ctx.restore();
  },
};

/** A segmented control whose highlight slides to the chosen option. */
function Segmented<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const i = Math.max(0, options.findIndex(o => o.key === value));
  return (
    <div role="tablist" className="relative grid bg-slate-100 dark:bg-slate-900/60 rounded-lg p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 rounded-md bg-white dark:bg-slate-700 shadow-sm transition-transform duration-300 ${EASE} motion-reduce:transition-none`}
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map(o => (
        <button key={o.key} role="tab" aria-selected={o.key === value} onClick={() => onChange(o.key)}
          className={`relative z-10 px-3 py-1 text-[11px] font-bold whitespace-nowrap transition-colors duration-200 ${
            o.key === value ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TrendCard({ series }: { series: Overview['series'] }) {
  const isDark = useTheme();
  const reduced = usePrefersReducedMotion();
  const [metric, setMetric] = useState<TrendMetric>('sales');
  const [asTable, setAsTable] = useState(false);
  const m = TREND_METRICS.find(x => x.key === metric)!;
  const color = isDark ? SERIES.dark : SERIES.light;
  const fmt = (v: number) => (m.money ? money(v) : hrs(v));
  const pts = series.points;
  const total = pts.reduce((s, p) => s + p[metric], 0);
  const best = pts.reduce<SeriesPoint | null>((b, p) => (!b || p[metric] > b[metric] ? p : b), null);
  const label = (d: string) => (series.bucket === 'week' ? `Wk of ${shortDate(d)}` : shortDate(d));

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            {m.label} by {series.bucket === 'week' ? 'week' : 'day'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {fmt(total)} total
            {best && best[metric] > 0 && <> · best {label(best.date)}, {fmt(best[metric])}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented options={TREND_METRICS} value={metric} onChange={setMetric} />
          <button onClick={() => setAsTable(v => !v)}
            className="px-2 py-1 rounded-md text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600">
            {asTable ? 'Chart' : 'Table'}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="mt-3 max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800">
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="text-left py-1.5 font-bold">{series.bucket === 'week' ? 'Week of' : 'Day'}</th>
                <th className="text-right py-1.5 font-bold">Shows</th>
                <th className="text-right py-1.5 font-bold">{m.label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 tabular-nums">
              {[...pts].reverse().map(p => (
                <tr key={p.date} className="text-slate-700 dark:text-slate-300">
                  <td className="py-1.5">{shortDate(p.date)}</td>
                  <td className="py-1.5 text-right">{p.shows || '—'}</td>
                  <td className="py-1.5 text-right">{p.shows ? fmt(p[metric]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // The wrapper's height includes the x-axis band, so the labels are
        // never clipped into a nested scroll.
        <div className="relative mt-3 h-64">
          <Line
            plugins={[crosshair]}
            data={{
              labels: pts.map(p => label(p.date)),
              datasets: [{
                data: pts.map(p => (m.money ? Math.round(p[metric]) : Math.round(p[metric] * 10) / 10)),
                borderColor: color,
                backgroundColor: (ctx) => {
                  const { chart } = ctx;
                  const area = chart.chartArea;
                  if (!area) return 'transparent';
                  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
                  g.addColorStop(0, `${color}38`);
                  g.addColorStop(1, `${color}00`);
                  return g;
                },
                borderWidth: 2,
                fill: true,
                // Monotone keeps the smoothing from overshooting: a plain
                // tension curve dips below $0 between a big day and an empty one.
                cubicInterpolationMode: 'monotone',
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBorderWidth: 2,
                pointHoverBorderColor: isDark ? '#1e293b' : '#ffffff',
                pointHoverBackgroundColor: color,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: reduced ? false : { duration: 650, easing: 'easeOutQuart' },
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  displayColors: false,
                  backgroundColor: '#0f172a',
                  padding: 10,
                  titleFont: { size: 11, weight: 'bold' },
                  bodyFont: { size: 12 },
                  callbacks: {
                    label: c => {
                      const p = pts[c.dataIndex];
                      const shows = p.shows ? ` · ${p.shows} show${p.shows === 1 ? '' : 's'}` : ' · no shows';
                      return `${fmt(p[metric])}${shows}`;
                    },
                  },
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  border: { display: false },
                  grid: { color: isDark ? GRID.dark : GRID.light },
                  ticks: {
                    color: MUTED, font: { size: 10 }, maxTicksLimit: 5,
                    callback: v => (m.money ? `$${Number(v).toLocaleString('en-US', { notation: 'compact' })}` : `${v}h`),
                  },
                },
                x: {
                  grid: { display: false },
                  border: { color: isDark ? GRID.dark : GRID.light },
                  ticks: { color: MUTED, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0, autoSkip: true },
                },
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Sales by host ──────────────────────────────────────────────────────────

type ShareMetric = 'sales' | 'salesPerHour' | 'hours';
const SHARE_METRICS: { key: ShareMetric; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'salesPerHour', label: 'Sales / hr' },
  { key: 'hours', label: 'Hours' },
];

function HostBars({ hosts }: { hosts: HostPerf[] }) {
  const [metric, setMetric] = useState<ShareMetric>('sales');
  // Bars grow from zero on first paint, then glide between metrics.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, []);

  const val = (h: HostPerf) => (metric === 'sales' ? h.sales : metric === 'hours' ? h.hours : h.salesPerHour ?? 0);
  const rows = [...hosts].sort((a, b) =>
    (a.host === UNASSIGNED ? 1 : 0) - (b.host === UNASSIGNED ? 1 : 0) || val(b) - val(a));
  const max = Math.max(1, ...rows.map(val));
  const sum = rows.reduce((s, h) => s + val(h), 0);
  const fmt = (v: number) => (metric === 'hours' ? hrs(v) : money(v));

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">By host</h3>
        <Segmented options={SHARE_METRICS} value={metric} onChange={setMetric} />
      </div>
      <ul className="space-y-2.5">
        {rows.map((h, i) => {
          const v = val(h);
          const unassigned = h.host === UNASSIGNED;
          const share = metric !== 'salesPerHour' && sum > 0 ? (v / sum) * 100 : null;
          return (
            <li key={h.host} className="grid grid-cols-[84px_1fr_auto] items-center gap-2">
              <span className={`text-xs truncate ${unassigned ? 'italic text-slate-400' : 'font-bold text-slate-700 dark:text-slate-200'}`}>{h.host}</span>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${EASE} motion-reduce:transition-none ${
                    unassigned ? 'bg-slate-300 dark:bg-slate-500' : 'bg-[#2a78d6] dark:bg-[#3987e5]'}`}
                  style={{ width: mounted ? `${(v / max) * 100}%` : '0%', transitionDelay: `${i * 40}ms` }} />
              </div>
              <span className="text-xs tabular-nums text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                {fmt(v)}
                {share != null && <span className="text-slate-400 text-[10px]"> {share.toFixed(0)}%</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {metric === 'salesPerHour' && (
        <p className="text-[10px] text-slate-400 mt-3">Pooled: each host&apos;s sales over their hours on air.</p>
      )}
    </div>
  );
}

// ─── Takeaways ──────────────────────────────────────────────────────────────

function Takeaways({ items, onGoSetup }: { items: Takeaway[]; onGoSetup: () => void }) {
  if (!items.length) return null;
  const dot = { good: 'bg-[#0ca30c]', warn: 'bg-[#fab219]', info: 'bg-[#2a78d6]' } as const;
  const word = { good: 'Good', warn: 'Needs attention', info: 'Note' } as const;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">Worth knowing</h3>
      <ul className="space-y-3">
        {items.map((t, i) => (
          <li key={i} style={{ animationDelay: `${150 + i * 80}ms` }}
            className={`flex gap-2.5 animate-in fade-in slide-in-from-right-2 duration-500 fill-mode-both ${EASE} motion-reduce:animate-none`}>
            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot[t.tone]}`} aria-label={word[t.tone]} />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.text}
              {t.action === 'setup' && (
                <button onClick={onGoSetup} className="ml-1 font-bold text-red-600 dark:text-red-400 hover:underline">Open Setup →</button>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Host table ─────────────────────────────────────────────────────────────

type View = 'performance' | 'efficiency' | 'mix';
const VIEWS: { key: View; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'efficiency', label: 'Efficiency' },
  { key: 'mix', label: 'Sales mix' },
];

/**
 * Profit needs a purchase cost on each item, and for most hosts most items
 * have none yet. Below this share of sales, a profit figure says more about
 * the backfill than the host, so it is shown as a dash with the reason on hover.
 */
const PROFIT_SHOWN_FROM = 50;

type Col = {
  key: string;
  label: string;
  title?: string;
  cell: (h: HostPerf, t: Totals) => React.ReactNode;
  total: (t: Totals, hs: HostPerf[]) => React.ReactNode;
};

const covers = (h: HostPerf) => (h.sales > 0 ? (h.costedRevenue / h.sales) * 100 : 0);
const partial = (h: HostPerf) => (
  <span className="text-slate-300 dark:text-slate-600"
    title={`Only ${pct(covers(h), 0)} of this host's sales have a purchase cost yet, so profit would be mostly guesswork.`}>—</span>
);
const sumOf = (hs: HostPerf[], f: (h: HostPerf) => number) => hs.reduce((s, h) => s + f(h), 0);

const COLS: Record<View, Col[]> = {
  performance: [
    { key: 'shows', label: 'Shows', cell: h => int(h.shows), total: t => int(t.shows) },
    { key: 'hours', label: 'Hours', cell: h => hrs(h.hours), total: t => hrs(t.hours) },
    { key: 'sales', label: 'Sales', cell: h => money(h.sales), total: t => money(t.sales) },
    { key: 'sph', label: 'Sales/hr', cell: h => <b>{money(h.salesPerHour)}</b>, total: t => <b>{money(t.salesPerHour)}</b> },
    {
      key: 'profit', label: 'Profit', title: 'Item revenue less purchase cost — only for items we could cost',
      cell: h => (covers(h) < PROFIT_SHOWN_FROM ? partial(h) : <span className="text-[#006300] dark:text-[#0ca30c]">{money(h.grossProfit)}</span>),
      total: t => (t.marginCoversPct < PROFIT_SHOWN_FROM ? '—' : money(t.profit)),
    },
    {
      key: 'margin', label: 'Margin', title: 'Profit over the revenue it was measured on',
      cell: h => (h.costedRevenue > 0 ? pct(h.marginPct) : partial(h)),
      total: t => pct(t.marginPct),
    },
    { key: 'aov', label: 'AOV', cell: h => money(h.aov, 2), total: t => money(t.orders ? t.sales / t.orders : null, 2) },
  ],
  efficiency: [
    { key: 'sph', label: 'Sales/hr', cell: h => <b>{money(h.salesPerHour)}</b>, total: t => <b>{money(t.salesPerHour)}</b> },
    {
      key: 'pph', label: 'Profit/hr',
      cell: h => (covers(h) < PROFIT_SHOWN_FROM ? partial(h) : money(h.profitPerHour)),
      total: t => (t.marginCoversPct < PROFIT_SHOWN_FROM || !t.hours ? '—' : money(t.profit / t.hours)),
    },
    { key: 'payout', label: 'Payout/hr', title: 'Takings after Whatnot fees, per hour on air', cell: h => money(h.earningsPerHour), total: t => money(t.hours ? t.earnings / t.hours : null) },
    { key: 'oph', label: 'Orders/hr', cell: h => (h.ordersPerHour == null ? '—' : h.ordersPerHour.toFixed(1)), total: t => (t.hours ? (t.orders / t.hours).toFixed(1) : '—') },
    {
      key: 'give', label: 'Giveaway', cell: h => (
        <span>{money(h.giveawaySpend, 2)} <span className="text-slate-400 text-[10px]">{pct(h.giveawayPctOfSales, 2)}</span></span>
      ),
      total: t => <span>{money(t.giveaway, 2)} <span className="text-slate-400 text-[10px]">{pct(t.giveawayPct, 2)}</span></span>,
    },
    {
      key: 'st', label: 'Sell-thru', title: 'Units sold ÷ (sold + still on the shelf) for the items this host ran',
      cell: h => pct(h.stockSellThroughPct, 0), total: () => '—',
    },
  ],
  mix: [
    { key: 'sales', label: 'Sales', cell: h => money(h.sales), total: t => money(t.sales) },
    {
      key: 'share', label: 'Share', cell: (h, t) => pct(t.sales ? (h.sales / t.sales) * 100 : null, 0), total: () => '100%',
    },
    { key: 'orders', label: 'Orders', cell: h => int(h.orders), total: t => int(t.orders) },
    { key: 'units', label: 'Units', cell: h => int(h.unitsSold), total: (_t, hs) => int(sumOf(hs, h => h.unitsSold)) },
    { key: 'buyers', label: 'Buyers', cell: h => int(h.buyers), total: (_t, hs) => int(sumOf(hs, h => h.buyers)) },
    {
      key: 'new', label: 'New buyers', title: 'First-time buyers as a share of all buyers',
      cell: h => pct(h.buyers ? (h.firstTimeBuyers / h.buyers) * 100 : null, 0),
      total: (_t, hs) => {
        const b = sumOf(hs, h => h.buyers);
        return pct(b ? (sumOf(hs, h => h.firstTimeBuyers) / b) * 100 : null, 0);
      },
    },
  ],
};

const AVATAR = 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300';

function HostTable({ hosts, totals }: { hosts: HostPerf[]; totals: Totals }) {
  const [view, setView] = useState<View>('performance');
  const cols = COLS[view];
  const rows = useMemo(() => [...hosts].sort((a, b) =>
    (a.host === UNASSIGNED ? 1 : 0) - (b.host === UNASSIGNED ? 1 : 0) || b.sales - a.sales), [hosts]);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 pt-4 pb-3">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">Host performance</h3>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-y border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30">
            <tr>
              <th className="py-2.5 pl-4 pr-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Host</th>
              {cols.map(c => (
                <th key={c.key} title={c.title}
                  className="py-2.5 px-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          {/* Keyed on the view so switching re-runs the fade rather than snapping. */}
          <tbody key={view} className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map((h, i) => {
              const unassigned = h.host === UNASSIGNED;
              return (
                <tr key={h.host} style={{ animationDelay: `${i * 35}ms` }}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors animate-in fade-in duration-300 fill-mode-both motion-reduce:animate-none ${unassigned ? 'opacity-80' : ''}`}>
                  <td className="py-2.5 pl-4 pr-3 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${
                        unassigned ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : AVATAR}`}>
                        {unassigned ? '?' : h.host.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p className={`text-sm ${unassigned ? 'italic text-slate-500' : 'font-bold text-slate-900 dark:text-white'}`}>{h.host}</p>
                        {covers(h) < PROFIT_SHOWN_FROM && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400" title="Share of this host's sales with a purchase cost on file">
                            {pct(covers(h), 0)} costed
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  {cols.map(c => (
                    <td key={c.key} className="py-2.5 px-3 text-right text-sm tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {c.cell(h, totals)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-900/30">
              <td className="py-2.5 pl-4 pr-3 text-sm font-black text-slate-900 dark:text-white">Total</td>
              {cols.map(c => (
                <td key={c.key} className="py-2.5 px-3 text-right text-sm font-bold tabular-nums whitespace-nowrap text-slate-900 dark:text-white">
                  {c.total(totals, rows)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-slate-400 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
        Sales, payout, hours, orders, buyers and giveaway cost come from Whatnot&apos;s own show analytics. Profit and margin are ours —
        item revenue less the purchase cost on the inventory sheet — and only cover items with a cost on file.
      </p>
    </div>
  );
}

// ─── Coverage strip ─────────────────────────────────────────────────────────

/**
 * How complete the numbers are, in one line. Replaces two stacked banners:
 * the important fact is a single chain — of all sales, how much has item
 * detail, and of that, how much has a cost.
 */
function Coverage({ t, unassigned, onGoSetup }: { t: Totals; unassigned: number; onGoSetup: () => void }) {
  if (t.sales <= 0) return null;
  const healthy = t.itemCoveragePct >= 80 && t.costCoveragePct >= 80 && unassigned === 0;
  if (healthy) return null;
  const Bar = ({ v }: { v: number }) => (
    <span className="inline-block w-16 h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-900/50 overflow-hidden align-middle ml-1.5">
      <span className={`block h-full bg-amber-500 rounded-full transition-[width] duration-700 ${EASE}`} style={{ width: `${Math.min(100, v)}%` }} />
    </span>
  );
  return (
    <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/60 rounded-xl px-4 py-2.5
      animate-in fade-in duration-500 motion-reduce:animate-none">
      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Data still filling in</span>
      <span className="text-xs text-amber-800/90 dark:text-amber-300/90">Item detail <b>{pct(t.itemCoveragePct, 0)}</b> of sales<Bar v={t.itemCoveragePct} /></span>
      <span className="text-xs text-amber-800/90 dark:text-amber-300/90">Costs found <b>{pct(t.costCoveragePct, 0)}</b> of that<Bar v={t.costCoveragePct} /></span>
      {unassigned > 0 && <span className="text-xs text-amber-800/90 dark:text-amber-300/90"><b>{unassigned}</b> shows with no host</span>}
      <button onClick={onGoSetup} className="ml-auto text-xs font-bold text-amber-900 dark:text-amber-200 hover:underline">Fix on Setup →</button>
    </div>
  );
}

// ─── The tab ────────────────────────────────────────────────────────────────

export default function HostsOverview({
  overview, hosts, unassignedShows, days, onGoSetup,
}: {
  overview: Overview;
  hosts: HostPerf[];
  unassignedShows: number;
  days: number;
  onGoSetup: () => void;
}) {
  const { totals: t, deltas, series } = overview;
  const period = days > 0 ? `${days} days` : null;
  const pts = series.points;
  const marginSpark = pts.map(p => (p.costedRevenue > 0 ? (p.profit / p.costedRevenue) * 100 : null));

  if (!hosts.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center shadow-sm">
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No shows in this range</p>
        <p className="text-xs text-slate-400 mt-1.5">Widen the range, or run a sync on the Setup tab if nothing has been pulled from Whatnot yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {period && (
        <p className="text-[11px] text-slate-400 -mb-2">Arrows compare with the {period} before this range.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile index={0} label="Sales" value={t.sales} format={v => money(v)}
          sub={<>{int(t.shows)} shows · {money(t.salesPerHour)}/hr</>}
          delta={deltas.sales} period={period} spark={pts.map(p => p.sales)} />
        <Tile index={1} label="Margin" value={t.marginPct} format={v => `${v.toFixed(1)}%`}
          sub={t.costedRevenue > 0 ? <>{money(t.profit)} profit on {money(t.costedRevenue)} costed</> : 'Nothing costed yet'}
          chip={t.marginCoversPct < PROFIT_SHOWN_FROM && t.sales > 0 && (
            <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              speaks for {pct(t.marginCoversPct, 0)} of sales
            </span>
          )}
          dim={t.marginCoversPct < 5}
          delta={deltas.margin} period={period} spark={marginSpark} />
        <Tile index={2} label="Hours on air" value={t.hours} format={v => hrs(v)}
          sub={<>{money(t.earnings)} payout after fees</>}
          delta={deltas.hours} period={period} spark={pts.map(p => p.hours)} />
        <Tile index={3} label="Giveaway cost" value={t.giveaway} format={v => money(v, 2)}
          sub={<>{pct(t.giveawayPct, 2)} of sales</>}
          delta={deltas.giveaway} period={period} spark={pts.map(p => p.giveaway)} />
      </div>

      <Coverage t={t} unassigned={unassignedShows} onGoSetup={onGoSetup} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both motion-reduce:animate-none">
          <TrendCard series={series} />
        </div>
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both motion-reduce:animate-none">
          <HostBars hosts={hosts} />
          <Takeaways items={overview.takeaways} onGoSetup={onGoSetup} />
        </div>
      </div>

      {/* Full width: it is the widest thing on the page. */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 fill-mode-both motion-reduce:animate-none">
        <HostTable hosts={hosts} totals={t} />
      </div>
    </div>
  );
}
