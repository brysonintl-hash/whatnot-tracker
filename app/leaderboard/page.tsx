'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import {
  METRICS, DEFAULT_WEIGHTS, PERIODS, MIN_SHOWS, MIN_HOURS,
  buildLeaderboard, periodWindows, showsInWindow, DEFAULT_PERIOD,
  type LeaderboardRow, type PeriodKey, type ShowRecord, type SortKey, type Weights,
} from '@/lib/leaderboard';
import { buildSampleShows } from '@/lib/sampleShows';
import { showRecordsFromOrders } from '@/lib/showRecords';
import type { SaleOrder } from '@/lib/sampleData';

type Session = { username: string; role: Role; name: string; hostName?: string | null };

// Warm family to match the dashboard, spread far enough apart that two hosts
// side by side never read as the same colour.
const AVATAR_COLORS = ['#EA580C', '#DC2626', '#D97706', '#E11D48', '#F97316', '#B45309', '#9A3412'];

/**
 * Colour by position in the alphabetical roster rather than by hashing the
 * name. Hashing six names into seven colours collides more often than not —
 * three of our own hosts landed on the same orange.
 */
function buildColorMap(hosts: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  Array.from(new Set(hosts)).sort((a, b) => a.localeCompare(b)).forEach((h, i) => {
    map[h] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  });
  return map;
}

/** Each metric gets its own bar colour so a row scans as a profile, not a wall of numbers. */
const METRIC_COLOR: Record<SortKey, string> = {
  overall: '#F97316',
  salesPerHour: '#3B82F6',
  ordersPerHour: '#A855F7',
  aov: '#14B8A6',
  margin: '#22C55E',
  profitPerHour: '#F59E0B',
};

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  ...METRICS.map(m => ({ key: m.key as SortKey, label: m.short })),
];

const COLUMN_TIP: Record<SortKey | 'shows' | 'liveTime' | 'trend', string> = {
  overall: 'Each metric as a share of the best host’s that period, then averaged. 100 means leading on everything.',
  salesPerHour: 'Sales divided by hours on air, pooled across every show in the period.',
  ordersPerHour: 'Orders divided by hours on air. Failed and cancelled orders are excluded.',
  aov: 'Average spend per order. Giveaways go out at $0 and are left out.',
  margin: 'Gross profit as a percentage of sales.',
  profitPerHour: 'Gross profit divided by hours on air — the bottom line per hour.',
  shows: 'Shows in this period. A host running two livestreams in a day counts as two.',
  liveTime: 'Total hours on air. Gaps longer than two hours are treated as off air, not slow selling.',
  // Replaced at render time with one naming the metric actually plotted.
  trend: 'Show by show across the period, oldest on the left.',
};

function formatFor(key: SortKey, row: LeaderboardRow): string {
  if (key === 'overall') return row.overall.toFixed(1);
  const m = METRICS.find(x => x.key === key)!;
  return m.format(row.metrics[key]);
}

const fmtHours = (h: number) => `${h.toFixed(1)}h`;

// ─── Small pieces ───────────────────────────────────────────────────────────

function Avatar({ color, initial, size, ring }: { color: string; initial: string; size: number; ring?: string }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-black flex-shrink-0 transition-transform duration-300"
      style={{
        width: size, height: size, backgroundColor: color, fontSize: size * 0.42,
        boxShadow: ring ? `0 0 0 3px ${ring}, 0 6px 16px rgba(0,0,0,0.18)` : '0 2px 6px rgba(0,0,0,0.12)',
      }}
    >
      {initial}
    </div>
  );
}

/** Hover explainer. Opens downward and is clamped to its column so it never gets clipped. */
function Info({ text, align = 'center' }: { text: string; align?: 'center' | 'right' }) {
  return (
    <span className="relative inline-flex group/tip align-middle ml-1">
      <svg className="w-3 h-3 text-slate-400 dark:text-slate-500 cursor-help transition-colors group-hover/tip:text-orange-500"
        fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth={2} />
        <path strokeLinecap="round" strokeWidth={2.5} d="M12 11v5M12 7.5v.01" />
      </svg>
      <span className="sr-only">{text}</span>
      <span className={`absolute top-full mt-2 z-40 w-56 pointer-events-none normal-case tracking-normal
                        invisible opacity-0 translate-y-1 group-hover/tip:visible group-hover/tip:opacity-100
                        group-hover/tip:translate-y-0 transition-all duration-200 ease-out
                        ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2 group-hover/tip:-translate-x-1/2'}`}>
        <span className="block bg-slate-900 text-white text-[11px] font-normal leading-snug rounded-xl shadow-2xl px-3 py-2 ring-1 ring-white/10">
          {text}
        </span>
      </span>
    </span>
  );
}

/** A laurel branch; mirrored for the other side of a podium avatar. */
function Laurel({ flip, color }: { flip?: boolean; color: string }) {
  return (
    <svg viewBox="0 0 40 90" className="w-7 h-16 transition-all duration-500 group-hover/card:scale-110"
      style={{ transform: flip ? 'scaleX(-1)' : undefined, color }} fill="currentColor" aria-hidden="true">
      <path d="M33 86C20 70 14 50 18 28c1-6 3-12 6-17" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.75" />
      {[0, 1, 2, 3, 4, 5].map(i => {
        const t = i / 5;
        const x = 30 - t * 11;
        const y = 76 - t * 52;
        return (
          <ellipse key={i} cx={x - 6} cy={y} rx="7.5" ry="3.6"
            transform={`rotate(${-38 + t * 18} ${x - 6} ${y})`} opacity={0.5 + t * 0.45} />
        );
      })}
    </svg>
  );
}

/** Per-show history of the sorted metric. */
function Sparkline({ values, up, delay }: { values: number[]; up: boolean | null; delay: number }) {
  if (values.length < 2) {
    return <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>;
  }
  const W = 76, H = 26, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = up === null ? '#94A3B8' : up ? '#10B981' : '#EF4444';
  const id = `spark-${values.length}-${Math.round(values[0])}-${Math.round(values[values.length - 1])}`;

  return (
    <svg width={W} height={H} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${H - pad} ${pts.join(' ')} ${W - pad},${H - pad}`} fill={`url(#${id})`}
        className="lb-fade" style={{ animationDelay: `${delay + 220}ms` }} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.8"
        strokeLinejoin="round" strokeLinecap="round"
        className="lb-draw" style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}

/** Value plus a bar showing how the host compares with the leader on that metric. */
function MetricCell({ value, pct, color, delay, strong }: {
  value: string; pct: number; color: string; delay: number; strong?: boolean;
}) {
  return (
    <div className="min-w-[88px]">
      <p className={`text-sm tabular-nums leading-none mb-1.5 transition-colors ${
        strong ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-200'
      }`}>
        {value}
      </p>
      <span className="block h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/70 overflow-hidden">
        <span className="block h-full rounded-full origin-left lb-grow"
          style={{
            width: `${Math.max(2, Math.min(100, pct))}%`,
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            animationDelay: `${delay}ms`,
          }} />
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black
                       bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400
                       transition-all duration-300 group-hover/row:scale-110">
        {rank}
      </span>
    );
  }
  const look = [
    { bg: 'linear-gradient(135deg,#FDE68A,#F59E0B)', ring: '#FCD34D' },
    { bg: 'linear-gradient(135deg,#F1F5F9,#CBD5E1)', ring: '#E2E8F0' },
    { bg: 'linear-gradient(135deg,#FED7AA,#C2764A)', ring: '#FDBA74' },
  ][rank - 1];

  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300
                     group-hover/row:scale-110 group-hover/row:rotate-6"
      style={{ background: look.bg, boxShadow: `0 0 0 2px ${look.ring}66, 0 2px 8px rgba(0,0,0,0.12)` }}>
      {rank === 1 ? (
        <svg className="w-4 h-4 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14 10l-3.45-6.89c-.34-.68-1.15-.95-1.83-.61-.28.14-.51.37-.64.64L4.89 10 .78 8.58A1.5 1.5 0 00.04 10.8l3 9h18l3-9a1.5 1.5 0 00-2-1.16z" />
        </svg>
      ) : (
        <span className="text-xs font-black text-white drop-shadow">{rank}</span>
      )}
    </span>
  );
}

function ChangePill({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-[11px] text-slate-300 dark:text-slate-600 font-bold" title="No figure last period to compare with">—</span>;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) return <span className="text-[11px] text-slate-400 font-bold">0%</span>;
  const up = rounded > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-black transition-transform duration-300 group-hover/row:scale-110 ${
      up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
    }`}>
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d={up ? 'M12 5l7 9h-14z' : 'M12 19l-7-9h14z'} /></svg>
      {Math.abs(rounded)}%
    </span>
  );
}


/** A gap expressed in the sorted metric's own units. */
function formatGap(key: SortKey, v: number): string {
  if (key === 'overall') return `${v.toFixed(1)} pts`;
  return METRICS.find(m => m.key === key)!.format(v);
}

/**
 * The next rung up.
 *
 * Shows the gap to the host directly above rather than to the leader: a gap
 * you could close this week is something to chase, while "60 points off the
 * top" mostly tells a host to stop trying. Whoever is first sees their cushion
 * instead, which is its own reason to defend it.
 */
function ChaseLine({ row, sort }: { row: LeaderboardRow; sort: SortKey }) {
  if (row.rank === 1) {
    if (row.leadOverNext === null) return null;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.6-6.2 4.6 2.4-7.4L2 9.4h7.6z" /></svg>
        Leading by {formatGap(sort, row.leadOverNext)}
      </span>
    );
  }
  if (row.gapToNext === null || !row.chasing) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500
                     transition-colors duration-200 group-hover/row:text-orange-600 dark:group-hover/row:text-orange-400">
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l7 9h-14z" /></svg>
      {formatGap(sort, row.gapToNext)} to pass {row.chasing}
    </span>
  );
}

/**
 * A host's own standing, pinned above the board.
 *
 * The table tells everyone where they sit; this says what to do next, in the
 * units of whatever is being ranked. Only shown to a host whose account is
 * linked to a sheet name, since otherwise we don't know which row is theirs.
 */
function YourStanding({ row, sort, color, total, runnerUp }: {
  row: LeaderboardRow; sort: SortKey; color: string; total: number; runnerUp: string | null;
}) {
  const first = row.rank === 1;
  return (
    <div className="mb-5 rounded-2xl overflow-hidden lb-rise shadow-lg"
      style={{ background: first
        ? 'linear-gradient(110deg,#7C2D12 0%,#B45309 55%,#D97706 100%)'
        : 'linear-gradient(110deg,#0B1220 0%,#1E293B 55%,#3B2A5A 100%)' }}>
      <div className="px-5 py-4 flex items-center gap-4 flex-wrap">
        <Avatar color={color} initial={row.initial} size={46} ring="rgba(255,255,255,0.35)" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-white/50">Your standing</p>
          <p className="text-lg font-black text-white leading-tight">
            {first ? `You're #1 of ${total} — hold it` : `You're #${row.rank} of ${total}`}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {first
              ? row.leadOverNext !== null
                ? <>You&apos;re <strong className="text-white">{formatGap(sort, row.leadOverNext)}</strong> clear of {runnerUp ?? 'second place'}. Hold the gap and the crown stays yours.</>
                : 'You’re the only ranked host this period.'
              : row.gapToNext !== null && row.chasing
                ? <>Just <strong className="text-white">{formatGap(sort, row.gapToNext)}</strong> more and you overtake <strong className="text-white">{row.chasing}</strong>.</>
                : 'Keep streaming — your next show moves this.'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-3xl font-black text-white leading-none">{formatFor(sort, row)}</p>
          <p className="text-[10px] uppercase tracking-wide font-bold text-white/50 mt-1">
            {sort === 'overall' ? 'Overall Score' : SORTS.find(x => x.key === sort)?.label}
          </p>
        </div>
      </div>
      {!first && row.gapToNext !== null && (
        <div className="h-1.5 bg-black/25">
          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-400 lb-grow origin-left"
            style={{ width: `${Math.max(4, Math.min(100, (1 - row.gapToNext / Math.max(1e-9, (sort === 'overall' ? row.overall : row.metrics[sort]) + row.gapToNext)) * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Podium ─────────────────────────────────────────────────────────────────

const PLACES = [
  { // 2nd — silver
    label: '2nd', pad: 'sm:mt-8',
    card: 'linear-gradient(145deg,#FBFDFF 0%,#EEF3F8 45%,#DCE5EE 100%)',
    sheen: 'linear-gradient(115deg,transparent 30%,rgba(255,255,255,0.85) 50%,transparent 70%)',
    border: '#CBD8E5', accent: '#64748B', ring: '#E2E8F0', score: '#EA580C',
    glow: '0 18px 40px -18px rgba(100,116,139,0.55)',
  },
  { // 1st — gold
    label: '1st', pad: '',
    card: 'linear-gradient(145deg,#FFF7DC 0%,#FDE9A8 45%,#F8C95B 100%)',
    sheen: 'linear-gradient(115deg,transparent 28%,rgba(255,255,255,0.9) 50%,transparent 72%)',
    border: '#EFB73E', accent: '#92400E', ring: '#FDE68A', score: '#D9540A',
    glow: '0 26px 60px -20px rgba(234,179,8,0.75)',
  },
  { // 3rd — bronze
    label: '3rd', pad: 'sm:mt-12',
    card: 'linear-gradient(145deg,#FFF4EE 0%,#FBDFCE 45%,#F0BFA3 100%)',
    sheen: 'linear-gradient(115deg,transparent 30%,rgba(255,255,255,0.8) 50%,transparent 70%)',
    border: '#E2AE8C', accent: '#9A3412', ring: '#FED7AA', score: '#C2410C',
    glow: '0 18px 40px -18px rgba(194,120,74,0.55)',
  },
];

function PodiumCard({ row, place, sort, color, delay }: {
  row: LeaderboardRow; place: 0 | 1 | 2; sort: SortKey; color: string; delay: number;
}) {
  const first = place === 1;
  const s = PLACES[place];
  const order = first ? 'order-1 sm:order-2' : place === 0 ? 'order-2 sm:order-1' : 'order-3 sm:order-3';

  const stats = [
    { label: 'Shows', value: String(row.totals.shows) },
    { label: 'Live Time', value: fmtHours(row.totals.hours) },
    { label: 'Sales/hr', value: METRICS[0].format(row.metrics.salesPerHour) },
    { label: 'Orders/hr', value: row.metrics.ordersPerHour.toFixed(1) },
  ];

  return (
    <div className={`${order} ${s.pad} flex-1 min-w-0 group/card lb-rise`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className={`relative rounded-3xl overflow-hidden transition-all duration-500 ease-out
                   hover:-translate-y-2 cursor-default ${first ? 'sm:scale-[1.04] hover:sm:scale-[1.07]' : 'hover:scale-[1.02]'}`}
        style={{ background: s.card, border: `1px solid ${s.border}`, boxShadow: s.glow }}
      >
        {/* sheen sweeps across on hover */}
        <span className="pointer-events-none absolute inset-0 -translate-x-full group-hover/card:translate-x-full
                         transition-transform duration-[1100ms] ease-out"
          style={{ background: s.sheen }} />

        {first && (
          <svg className="absolute left-1/2 -translate-x-1/2 -top-1 w-9 h-9 text-amber-400 drop-shadow-md z-10
                          transition-transform duration-500 group-hover/card:-translate-y-1 group-hover/card:scale-110"
            viewBox="0 0 24 24" fill="currentColor" aria-label="First place">
            <path d="M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14 10l-3.45-6.89c-.34-.68-1.15-.95-1.83-.61-.28.14-.51.37-.64.64L4.89 10 .78 8.58A1.5 1.5 0 00.04 10.8l3 9h18l3-9a1.5 1.5 0 00-2-1.16z" />
          </svg>
        )}

        <div className={`relative text-center px-4 ${first ? 'pt-9 pb-5' : 'pt-7 pb-5'}`}>
          <span className="inline-block text-[10px] font-black uppercase tracking-[0.15em] px-2.5 py-0.5 rounded-full mb-3"
            style={{ background: 'rgba(255,255,255,0.65)', color: s.accent }}>
            {s.label}
          </span>

          <div className="flex items-center justify-center gap-1">
            <Laurel color={s.accent} />
            <Avatar color={color} initial={row.initial} size={first ? 68 : 56} ring="rgba(255,255,255,0.95)" />
            <Laurel flip color={s.accent} />
          </div>

          <p className={`font-black mt-2 truncate ${first ? 'text-xl' : 'text-lg'}`} style={{ color: s.accent }}>
            {row.host}
          </p>
          <p className={`font-black leading-none mt-1 transition-transform duration-500 group-hover/card:scale-105 ${first ? 'text-4xl' : 'text-3xl'}`}
            style={{ color: s.score }}>
            {formatFor(sort, row)}
          </p>
          <p className="text-[11px] mt-1 font-semibold" style={{ color: s.accent, opacity: 0.7 }}>
            {sort === 'overall' ? 'Overall Score' : SORTS.find(x => x.key === sort)?.label}
          </p>
        </div>

        {/* stat strip */}
        <div className="relative grid grid-cols-4 border-t" style={{ borderColor: `${s.border}99`, background: 'rgba(255,255,255,0.4)' }}>
          {stats.map((st, i) => (
            <div key={st.label} className={`py-2.5 text-center ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: `${s.border}80` }}>
              <p className="text-sm font-black tabular-nums" style={{ color: s.accent }}>{st.value}</p>
              <p className="text-[9px] uppercase tracking-wide font-bold mt-0.5" style={{ color: s.accent, opacity: 0.6 }}>{st.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Weights panel ──────────────────────────────────────────────────────────

function WeightsPanel({ weights, setWeights, onClose }: {
  weights: Weights; setWeights: (w: Weights) => void; onClose: () => void;
}) {
  const total = METRICS.reduce((s, m) => s + Math.max(0, weights[m.key]), 0);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5 shadow-lg lb-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Score weighting</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            How much each metric counts toward the Overall Score. Everything is equal by default.
          </p>
        </div>
        <button onClick={onClose} aria-label="Close settings"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0 hover:rotate-90 duration-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
        {METRICS.map(m => {
          const share = total > 0 ? (Math.max(0, weights[m.key]) / total) * 100 : 0;
          return (
            <div key={m.key} className="group/w">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor={`w-${m.key}`} className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{m.label}</label>
                <span className="text-[11px] font-black tabular-nums flex-shrink-0 transition-colors"
                  style={{ color: METRIC_COLOR[m.key as SortKey] }}>
                  ×{weights[m.key]} · {share.toFixed(0)}%
                </span>
              </div>
              <input id={`w-${m.key}`} type="range" min={0} max={5} step={1} value={weights[m.key]}
                onChange={e => setWeights({ ...weights, [m.key]: Number(e.target.value) })}
                className="w-full accent-orange-600 cursor-pointer" />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {total === 0 ? 'Every metric is at zero, so no score can be calculated — raise at least one.'
                       : 'Set a metric to 0 to leave it out of the score entirely.'}
        </p>
        <button onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
          className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex-shrink-0">
          Reset to equal
        </button>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [shows, setShows] = useState<ShowRecord[] | null>(null);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [sort, setSort] = useState<SortKey>('overall');
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [showSettings, setShowSettings] = useState(false);
  const [usingSample, setUsingSample] = useState(false);
  const [dataNote, setDataNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      if (s.role !== 'admin' && s.role !== 'manager' && s.role !== 'host' && s.role !== 'shipper') { router.push('/login'); return; }
      setSession(s);
    });

    // Real shows from the WN sheet. Sample data is only a fallback for when
    // the sheet can't be read, and the page says so rather than passing
    // invented hosts off as real.
    fetch('/api/sales', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: SaleOrder[] | { error?: string }) => {
        if (!Array.isArray(data)) throw new Error('error' in data && data.error ? data.error : 'Sales data unavailable');
        const records = showRecordsFromOrders(data);
        if (records.length === 0) throw new Error('No shows found in the sales sheet');
        setShows(records);
        setUsingSample(false);
      })
      .catch((e: Error) => {
        setShows(buildSampleShows(new Date()));
        setUsingSample(true);
        setDataNote(e.message);
      });
  }, [router]);

  const board = useMemo(() => {
    if (!shows) return null;
    const { current, previous } = periodWindows(period);
    return buildLeaderboard(showsInWindow(shows, current), {
      weights, sort,
      previous: previous ? showsInWindow(shows, previous) : undefined,
    });
  }, [shows, period, sort, weights]);

  if (!session || !board) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-400 text-sm animate-pulse">Loading leaderboard…</p>
      </div>
    );
  }

  const { ranked, unranked, mostImproved } = board;
  const podium = ranked.slice(0, 3);
  const colors = buildColorMap([...ranked, ...unranked].map(r => r.host));
  const trendLabel = sort === 'overall' ? 'Profit/hr' : SORTS.find(s => s.key === sort)?.label;
  // Which row belongs to the person looking, so the board can speak to them
  // directly. Exact match on the linked sheet name — same rule the Performance
  // page uses, so an unlinked account simply gets no personal card.
  const myHostName = session.role === 'host' ? (session.hostName ?? '').trim().toLowerCase() : '';
  const myRow = myHostName ? ranked.find(r => r.host.trim().toLowerCase() === myHostName) ?? null : null;
  const trendTip = `${trendLabel} show by show, oldest on the left. The percentage compares this period's ${trendLabel} with the period before.`
    + (sort === 'overall' ? ' Overall is a score relative to other hosts, so it has no per-show value — profit per hour stands in for it here.' : '');

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />

      <style>{`
        @keyframes lbRise { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:none } }
        @keyframes lbGrow { from { transform:scaleX(0) } to { transform:scaleX(1) } }
        @keyframes lbDraw { from { stroke-dasharray:200; stroke-dashoffset:200 } to { stroke-dasharray:200; stroke-dashoffset:0 } }
        @keyframes lbFade { from { opacity:0 } to { opacity:1 } }
        .lb-rise { animation: lbRise .55s cubic-bezier(.22,1,.36,1) both }
        .lb-grow { animation: lbGrow .85s cubic-bezier(.22,1,.36,1) both }
        .lb-draw { animation: lbDraw 1s ease-out both }
        .lb-fade { animation: lbFade .6s ease-out both }
        @media (prefers-reduced-motion: reduce) {
          .lb-rise,.lb-grow,.lb-draw,.lb-fade { animation: none !important }
        }
      `}</style>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="relative h-20 flex-shrink-0 overflow-hidden flex items-center justify-between gap-3 pl-16 pr-4 md:px-7"
          style={{ background: 'linear-gradient(110deg,#0B1220 0%,#17203A 45%,#2A1E4A 100%)' }}>
          <svg className="pointer-events-none absolute -right-6 -top-10 w-56 h-56 text-white/[0.055]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14 10l-3.45-6.89c-.34-.68-1.15-.95-1.83-.61-.28.14-.51.37-.64.64L4.89 10 .78 8.58A1.5 1.5 0 00.04 10.8l3 9h18l3-9a1.5 1.5 0 00-2-1.16z" />
          </svg>

          <div className="relative flex items-center gap-3 min-w-0">
            <svg className="w-8 h-8 flex-shrink-0 drop-shadow transition-transform duration-500 hover:scale-110 hover:rotate-6"
              viewBox="0 0 24 24" fill="url(#trophyGrad)" aria-hidden="true">
              <defs>
                <linearGradient id="trophyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FDE68A" /><stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>
              <path d="M19 5h-2V3H7v2H5a2 2 0 00-2 2v1a4 4 0 004 4h.26A6 6 0 0011 15.9V18H8v2h8v-2h-3v-2.1A6 6 0 0016.74 12H17a4 4 0 004-4V7a2 2 0 00-2-2zM5 8V7h2v3a2 2 0 01-2-2zm14 0a2 2 0 01-2 2V7h2v1z" />
            </svg>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-white truncate leading-tight">Host Leaderboard</h1>
              <p className="hidden sm:block text-xs text-slate-300/70 truncate">Ranked on per-hour performance across every show</p>
            </div>
          </div>

          <div className="relative flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 rounded-xl bg-white/10 ring-1 ring-white/15 px-2.5 py-1.5
                            hover:bg-white/15 transition-colors backdrop-blur">
              <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <select value={period} onChange={e => setPeriod(e.target.value as PeriodKey)} aria-label="Period"
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer [&>option]:text-slate-900">
                {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <button onClick={() => setShowSettings(v => !v)} aria-label="Score weighting settings"
              className={`p-2 rounded-xl ring-1 transition-all duration-300 hover:scale-105 ${
                showSettings ? 'bg-orange-500 ring-orange-400 text-white rotate-90' : 'bg-white/10 ring-white/15 text-slate-200 hover:bg-white/20'
              }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Ranking switcher */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORTS.map((s, i) => (
              <button key={s.key} onClick={() => setSort(s.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border lb-rise
                            transition-all duration-300 hover:-translate-y-0.5 ${
                  sort === s.key
                    ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-500/30 scale-105'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-300 hover:text-orange-600 hover:shadow-md'
                }`}
                style={{ animationDelay: `${i * 45}ms` }}>
                {s.label}
              </button>
            ))}
          </div>

          {showSettings && <WeightsPanel weights={weights} setWeights={setWeights} onClose={() => setShowSettings(false)} />}

          {usingSample && (
            <div className="mb-5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start gap-3 lb-rise">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              <div className="min-w-0">
                <p className="text-xs font-black text-amber-800 dark:text-amber-300">Showing sample hosts — these are not your real hosts</p>
                <p className="text-[11px] text-amber-900/70 dark:text-amber-200/60 mt-0.5 leading-relaxed">
                  The sales sheet couldn&apos;t be read, so the board is filled with placeholder names and figures.
                  {dataNote ? ` (${dataNote})` : ''} Real host names come straight from the sheet&apos;s host column once it loads.
                </p>
              </div>
            </div>
          )}

          {ranked.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center lb-rise">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No hosts qualify for this period yet</p>
              <p className="text-xs text-slate-400 mt-1">
                A host needs {MIN_SHOWS} shows or {MIN_HOURS} hours live to be ranked. Try a longer period.
              </p>
            </div>
          ) : (
            <>
              {myRow && (
                <YourStanding row={myRow} sort={sort} color={colors[myRow.host]}
                  total={ranked.length} runnerUp={ranked[1]?.host ?? null} />
              )}

              {/* Podium */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-7">
                {podium.map((row, i) => (
                  <PodiumCard key={row.host} row={row}
                    place={(i === 0 ? 1 : i === 1 ? 0 : 2) as 0 | 1 | 2}
                    sort={sort} color={colors[row.host]} delay={i * 110} />
                ))}
              </div>

              {/* Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm lb-rise" style={{ animationDelay: '220ms' }}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                        <th className="py-3 pl-5 pr-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 w-14">#</th>
                        <th className="py-3 px-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Host</th>
                        {SORTS.map(s => (
                          <th key={s.key} onClick={() => setSort(s.key)}
                            aria-sort={sort === s.key ? 'descending' : 'none'}
                            className={`py-3 px-3 text-left text-[10px] font-black uppercase tracking-wide whitespace-nowrap cursor-pointer
                                        transition-colors group/th ${
                              sort === s.key ? 'text-orange-700 dark:text-orange-400 bg-orange-50/70 dark:bg-orange-900/20'
                                             : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}>
                            <span className="inline-flex items-center">
                              {s.label}
                              {sort === s.key && <span className="ml-1 text-[9px]">▼</span>}
                              <Info text={COLUMN_TIP[s.key]} />
                            </span>
                          </th>
                        ))}
                        <th className="py-3 px-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center">Shows<Info text={COLUMN_TIP.shows} /></span>
                        </th>
                        <th className="py-3 px-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center">Live Time<Info text={COLUMN_TIP.liveTime} /></span>
                        </th>
                        <th className="py-3 px-5 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center">Trend<Info text={trendTip} align="right" /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((row, i) => (
                        <tr key={row.host}
                          className="group/row border-b border-slate-100 dark:border-slate-700/50 last:border-0
                                     transition-colors duration-200 hover:bg-orange-50/40 dark:hover:bg-orange-900/10 lb-rise"
                          style={{ animationDelay: `${260 + i * 70}ms` }}>
                          <td className="py-3.5 pl-5 pr-2"><RankBadge rank={row.rank} /></td>

                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="transition-transform duration-300 group-hover/row:scale-110">
                                <Avatar color={colors[row.host]} initial={row.initial} size={34} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">{row.host}</span>
                                  {row.host === mostImproved && (
                                    <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full
                                                     bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400
                                                     border border-emerald-200 dark:border-emerald-700 whitespace-nowrap"
                                      title="Biggest rank gain vs the previous period">
                                      ↑ Most improved
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {row.totals.shows} shows · {fmtHours(row.totals.hours)}
                                </p>
                                <ChaseLine row={row} sort={sort} />
                              </div>
                            </div>
                          </td>

                          {SORTS.map(s => (
                            <td key={s.key} className={`py-3.5 px-3 transition-colors ${
                              sort === s.key ? 'bg-orange-50/60 dark:bg-orange-900/15' : ''
                            }`}>
                              <MetricCell
                                value={formatFor(s.key, row)}
                                pct={s.key === 'overall' ? row.overall : row.percentages[s.key]}
                                color={METRIC_COLOR[s.key]}
                                delay={320 + i * 70}
                                strong={sort === s.key}
                              />
                            </td>
                          ))}

                          <td className="py-3.5 px-3 text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums">{row.totals.shows}</td>
                          <td className="py-3.5 px-3 text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">{fmtHours(row.totals.hours)}</td>

                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-2" title={`${trendLabel} across their shows this period`}>
                              <Sparkline values={row.trend}
                                up={row.changePct === null ? null : row.changePct >= 0}
                                delay={360 + i * 70} />
                              <ChangePill pct={row.changePct} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Not enough data yet */}
          {unranked.length > 0 && (
            <div className="mt-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm lb-rise">
              <p className="text-sm font-black text-slate-900 dark:text-white">Not enough data yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-3">
                Ranking needs at least {MIN_SHOWS} shows or {MIN_HOURS} hours live in this period, so a couple of
                lucky shows can&apos;t win the board.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {unranked.map(row => (
                  <div key={row.host}
                    className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700
                               rounded-xl px-3 py-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
                    <Avatar color={colors[row.host]} initial={row.initial} size={28} />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate">{row.host}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{row.ineligibleReason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How the score works */}
          <div className="mt-5 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 p-5 flex items-start gap-3 lb-rise">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-orange-800 dark:text-orange-300 mb-1.5">How the Overall Score works</p>
              <p className="text-xs text-orange-900/70 dark:text-orange-200/60 leading-relaxed">
                For each of the five metrics, a host&apos;s figure is compared with the best figure anyone posted that
                period — the leader on that metric scores 100%, and everyone else scores their share of it. Those five
                percentages are then averaged{' '}
                {METRICS.every(m => weights[m.key] === DEFAULT_WEIGHTS[m.key]) ? 'equally' : 'using the weights you set'}{' '}
                to give the score out of 100.
              </p>
              <p className="text-xs text-orange-900/70 dark:text-orange-200/60 leading-relaxed mt-2">
                Every metric is per hour or per order, never a raw total, so a short show and a long one are judged the
                same way — a host can&apos;t climb simply by streaming longer. Hours and sales are pooled across a
                host&apos;s shows before dividing, so one brief hot streak doesn&apos;t outweigh a full afternoon.
              </p>
              <p className="text-[11px] text-orange-900/50 dark:text-orange-200/40 mt-2">
                {usingSample
                  ? 'Showing sample data — the sales sheet could not be read.'
                  : 'Built from the WN sheet: one record per host per livestream, failed and cancelled orders excluded.'}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
