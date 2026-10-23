'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import {
  METRICS, DEFAULT_WEIGHTS, PERIODS, MIN_SHOWS, MIN_HOURS,
  buildLeaderboard, periodWindows, showsInWindow,
  type LeaderboardRow, type MetricKey, type PeriodKey, type ShowRecord, type SortKey, type Weights,
} from '@/lib/leaderboard';
import { buildSampleShows } from '@/lib/sampleShows';

type Session = { username: string; role: Role; name: string };

// Warm family to match the dashboard, spread far enough apart that two hosts
// side by side never read as the same colour.
const AVATAR_COLORS = ['#EA580C', '#DC2626', '#D97706', '#E11D48', '#F97316', '#B45309', '#9A3412'];

/**
 * Colour by position in the alphabetical roster rather than by hashing the
 * name. Hashing six names into seven colours collides more often than not —
 * three of our own hosts landed on the same orange — and two identical
 * avatars next to each other is exactly what this is meant to avoid.
 */
function buildColorMap(hosts: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  Array.from(new Set(hosts)).sort((a, b) => a.localeCompare(b)).forEach((h, i) => {
    map[h] = AVATAR_COLORS[i % AVATAR_COLORS.length];
  });
  return map;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  ...METRICS.map(m => ({ key: m.key as SortKey, label: m.short })),
];

function formatFor(key: SortKey, row: LeaderboardRow): string {
  if (key === 'overall') return row.overall.toFixed(1);
  const m = METRICS.find(x => x.key === key)!;
  return m.format(row.metrics[key]);
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Avatar({ color, initial, size }: { color: string; initial: string; size: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-black flex-shrink-0 shadow-sm"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

/** Spots gained or lost since the previous period. Absent when there's nothing to compare. */
function RankDelta({ change }: { change: number | null }) {
  if (change === null) return null;
  if (change === 0) {
    return <span className="text-[11px] text-slate-300 dark:text-slate-600 font-bold" title="No change">—</span>;
  }
  const up = change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
      }`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'spot' : 'spots'} vs the previous period`}
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={up ? 'M12 5l7 9h-14z' : 'M12 19l-7-9h14z'} />
      </svg>
      {Math.abs(change)}
    </span>
  );
}

function ImprovedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 whitespace-nowrap">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
      Most improved
    </span>
  );
}

const PLACES = [
  { medal: '#D97706', ring: '#FDE68A', label: '2nd', height: 'sm:pt-6' },
  { medal: '#EA580C', ring: '#FED7AA', label: '1st', height: '' },
  { medal: '#A16207', ring: '#FEF3C7', label: '3rd', height: 'sm:pt-10' },
];

function PodiumCard({ row, place, sort, isMostImproved, color }: {
  row: LeaderboardRow; place: 0 | 1 | 2; sort: SortKey; isMostImproved: boolean; color: string;
}) {
  const first = place === 1;
  const style = PLACES[place];
  // Visual order on wide screens is 2nd · 1st · 3rd; stacked phones keep 1,2,3.
  const order = first ? 'order-1 sm:order-2' : place === 0 ? 'order-2 sm:order-1' : 'order-3 sm:order-3';

  return (
    <div className={`${order} ${style.height} flex-1 min-w-0`}>
      <div
        className={`relative bg-white dark:bg-slate-800 rounded-2xl border text-center px-4 ${
          first ? 'pt-8 pb-6 border-orange-300 dark:border-orange-700 shadow-lg' : 'pt-6 pb-5 border-slate-200 dark:border-slate-700 shadow-sm'
        }`}
        style={first ? { boxShadow: '0 10px 30px -12px rgba(234,88,12,0.45)' } : undefined}
      >
        {first && (
          <svg className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-8 text-amber-400 drop-shadow" viewBox="0 0 24 24" fill="currentColor" aria-label="First place">
            <path d="M2.5 19h19v2h-19zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14 10l-3.45-6.89c-.34-.68-1.15-.95-1.83-.61-.28.14-.51.37-.64.64L4.89 10 .78 8.58A1.5 1.5 0 00.04 10.8l3 9h18l3-9a1.5 1.5 0 00-2-1.16z" />
          </svg>
        )}

        <span
          className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-3"
          style={{ backgroundColor: `${style.medal}1a`, color: style.medal }}
        >
          {style.label}
        </span>

        <div className="flex justify-center mb-3">
          <div className="rounded-full p-1" style={{ boxShadow: `0 0 0 3px ${style.ring}` }}>
            <Avatar color={color} initial={row.initial} size={first ? 64 : 52} />
          </div>
        </div>

        <p className={`font-black text-slate-900 dark:text-white truncate ${first ? 'text-lg' : 'text-base'}`}>
          {row.host}
        </p>

        <p className={`font-black mt-1 ${first ? 'text-3xl' : 'text-2xl'}`} style={{ color: style.medal }}>
          {formatFor(sort, row)}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          {sort === 'overall' ? 'Overall score' : SORTS.find(s => s.key === sort)?.label}
        </p>

        <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
          <RankDelta change={row.rankChange} />
          {isMostImproved && <ImprovedBadge />}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          {row.totals.shows} shows · {row.totals.hours.toFixed(1)}h live
        </p>
      </div>
    </div>
  );
}

function WeightsPanel({ weights, setWeights, onClose }: {
  weights: Weights; setWeights: (w: Weights) => void; onClose: () => void;
}) {
  const total = METRICS.reduce((s, m) => s + Math.max(0, weights[m.key]), 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">Score weighting</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            How much each metric counts toward the Overall Score. Everything is equal by default.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
          aria-label="Close settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-4">
        {METRICS.map(m => {
          const share = total > 0 ? (Math.max(0, weights[m.key]) / total) * 100 : 0;
          return (
            <div key={m.key}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor={`w-${m.key}`} className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                  {m.label}
                </label>
                <span className="text-[11px] font-black text-orange-600 dark:text-orange-400 tabular-nums flex-shrink-0">
                  ×{weights[m.key]} · {share.toFixed(0)}%
                </span>
              </div>
              <input
                id={`w-${m.key}`}
                type="range" min={0} max={5} step={1}
                value={weights[m.key]}
                onChange={e => setWeights({ ...weights, [m.key]: Number(e.target.value) })}
                className="w-full accent-orange-600"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {total === 0
            ? 'Every metric is at zero, so no score can be calculated — raise at least one.'
            : 'Set a metric to 0 to leave it out of the score entirely.'}
        </p>
        <button
          onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}
          className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex-shrink-0"
        >
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
  const [period, setPeriod] = useState<PeriodKey>('last28');
  const [sort, setSort] = useState<SortKey>('overall');
  const [weights, setWeights] = useState<Weights>({ ...DEFAULT_WEIGHTS });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      if (s.role !== 'admin' && s.role !== 'manager' && s.role !== 'host') { router.push('/login'); return; }
      setSession(s);
    });
    // Built after mount so the dates come from the browser's clock without
    // risking a server/client mismatch on the rendered markup.
    setShows(buildSampleShows(new Date()));
  }, [router]);

  const board = useMemo(() => {
    if (!shows) return null;
    const { current, previous } = periodWindows(period);
    return buildLeaderboard(showsInWindow(shows, current), {
      weights,
      sort,
      previous: previous ? showsInWindow(shows, previous) : undefined,
    });
  }, [shows, period, sort, weights]);

  if (!session || !board) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  const { ranked, unranked, mostImproved } = board;
  const podium = ranked.slice(0, 3);
  // Built from the whole roster, ranked and not, so a host keeps the same
  // colour whichever section they land in.
  const colors = buildColorMap([...ranked, ...unranked].map(r => r.host));
  const colActive = (key: SortKey) =>
    sort === key ? 'bg-orange-50/70 dark:bg-orange-900/20' : '';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 pl-16 pr-4 md:px-6 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <svg className="w-6 h-6 text-amber-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M19 5h-2V3H7v2H5a2 2 0 00-2 2v1a4 4 0 004 4h.26A6 6 0 0011 15.9V18H8v2h8v-2h-3v-2.1A6 6 0 0016.74 12H17a4 4 0 004-4V7a2 2 0 00-2-2zM5 8V7h2v3a2 2 0 01-2-2zm14 0a2 2 0 01-2 2V7h2v1z" />
            </svg>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-white truncate">Host Leaderboard</h1>
              <p className="hidden sm:block text-xs text-slate-400 truncate">
                Ranked on per-hour performance across every show
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as PeriodKey)}
              aria-label="Period"
              className="text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button
              onClick={() => setShowSettings(v => !v)}
              aria-label="Score weighting settings"
              className={`p-1.5 rounded-lg border transition-colors ${
                showSettings
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Ranking switcher */}
          <div className="flex gap-2 overflow-x-auto pb-1 mb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${
                  sort === s.key
                    ? 'bg-orange-600 border-orange-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-300 dark:hover:border-orange-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {showSettings && (
            <WeightsPanel weights={weights} setWeights={setWeights} onClose={() => setShowSettings(false)} />
          )}

          {ranked.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No hosts qualify for this period yet</p>
              <p className="text-xs text-slate-400 mt-1">
                A host needs {MIN_SHOWS} shows or {MIN_HOURS} hours live to be ranked. Try a longer period.
              </p>
            </div>
          ) : (
            <>
              {/* Podium */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-6">
                {podium.map((row, i) => (
                  <PodiumCard
                    key={row.host}
                    row={row}
                    // Centre the winner on wide screens: 2nd · 1st · 3rd.
                    place={(i === 0 ? 1 : i === 1 ? 0 : 2) as 0 | 1 | 2}
                    sort={sort}
                    isMostImproved={row.host === mostImproved}
                    color={colors[row.host]}
                  />
                ))}
              </div>

              {/* Full table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                        <th className="py-3 px-4 text-left text-[10px] font-black uppercase tracking-wide text-slate-400 w-16">Rank</th>
                        <th className="py-3 px-4 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">Host</th>
                        {SORTS.map(s => (
                          <th
                            key={s.key}
                            className={`py-3 px-4 text-right text-[10px] font-black uppercase tracking-wide whitespace-nowrap cursor-pointer transition-colors ${colActive(s.key)} ${
                              sort === s.key ? 'text-orange-700 dark:text-orange-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                            onClick={() => setSort(s.key)}
                            aria-sort={sort === s.key ? 'descending' : 'none'}
                          >
                            {s.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map(row => (
                        <tr
                          key={row.host}
                          className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50/70 dark:hover:bg-slate-700/20"
                        >
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${
                              row.rank <= 3
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                            }`}>
                              {row.rank}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Avatar color={colors[row.host]} initial={row.initial} size={32} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-black text-slate-900 dark:text-white truncate">{row.host}</span>
                                  <RankDelta change={row.rankChange} />
                                  {row.host === mostImproved && <ImprovedBadge />}
                                </div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {row.totals.shows} shows · {row.totals.hours.toFixed(1)}h
                                </p>
                              </div>
                            </div>
                          </td>
                          {SORTS.map(s => (
                            <td
                              key={s.key}
                              className={`py-3 px-4 text-right text-sm whitespace-nowrap tabular-nums ${colActive(s.key)} ${
                                sort === s.key
                                  ? 'font-black text-slate-900 dark:text-white'
                                  : 'font-bold text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {formatFor(s.key, row)}
                            </td>
                          ))}
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
            <div className="mt-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
              <p className="text-sm font-black text-slate-900 dark:text-white">Not enough data yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 mb-3">
                Ranking needs at least {MIN_SHOWS} shows or {MIN_HOURS} hours live in this period, so a couple of
                lucky shows can&apos;t win the board.
              </p>
              <div className="flex flex-wrap gap-2.5">
                {unranked.map(row => (
                  <div
                    key={row.host}
                    className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
                  >
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
          <div className="mt-5 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-900/10 p-5">
            <p className="text-xs font-black text-orange-800 dark:text-orange-300 mb-1.5">How the Overall Score works</p>
            <p className="text-xs text-orange-900/70 dark:text-orange-200/60 leading-relaxed">
              For each of the five metrics, a host&apos;s figure is compared with the best figure anyone posted that
              period — the leader on that metric scores 100%, and everyone else scores their share of it. Those five
              percentages are then averaged{' '}
              {METRICS.every(m => weights[m.key] === DEFAULT_WEIGHTS[m.key])
                ? 'equally'
                : 'using the weights you set'}{' '}
              to give the score out of 100.
            </p>
            <p className="text-xs text-orange-900/70 dark:text-orange-200/60 leading-relaxed mt-2">
              Every metric is per hour or per order, never a raw total, so a short show and a long one are judged the
              same way — a host can&apos;t climb simply by streaming longer. Hours and sales are pooled across a
              host&apos;s shows before dividing, so one brief hot streak doesn&apos;t outweigh a full afternoon.
            </p>
            <p className="text-[11px] text-orange-900/50 dark:text-orange-200/40 mt-2">
              Showing sample data until the board is connected to the WN sheet.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
