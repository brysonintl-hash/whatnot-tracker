'use client';

import { useMemo, useRef, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import type { Chart as ChartJSInstance } from 'chart.js';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { useTheme } from '@/lib/useTheme';
import { topHostsWithOther, sliceColors, TOP_HOST_SLICES } from '@/lib/hostShare';

// Registered here so the card works on any page, not only ones that happen
// to register ArcElement for their own charts.
ChartJS.register(ArcElement, Tooltip);

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;

/**
 * Revenue split across hosts.
 *
 * Only the top few hosts get their own slice; the rest are pooled into one
 * neutral "Others" wedge. With every host charted the six-colour palette
 * cycled and two hosts came out the same green, which made the legend
 * useless — see lib/hostShare for the reasoning.
 */
export default function RevenueByHostCard({ byHost }: { byHost: Record<string, number> }) {
  const isDark = useTheme();
  const chartRef = useRef<ChartJSInstance<'doughnut'> | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const { slices, total, hostCount } = useMemo(() => topHostsWithOther(byHost), [byHost]);
  const colors = useMemo(() => sliceColors(slices, isDark), [slices, isDark]);

  /** Hovering a legend row drives the arc, so the two halves stay in step. */
  function focus(i: number | null) {
    setHovered(i);
    const chart = chartRef.current;
    if (!chart) return;
    chart.setActiveElements(i === null ? [] : [{ datasetIndex: 0, index: i }]);
    chart.update();
  }

  if (slices.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col">
        <h2 className="font-bold text-slate-900 dark:text-white text-sm">Revenue by Host</h2>
        <div className="flex-1 flex items-center justify-center min-h-[240px] text-sm text-slate-400">
          No host revenue in this period
        </div>
      </div>
    );
  }

  const pooled = slices.find(s => s.isOther);

  return (
    <div className="dash-card h-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm
                    hover:shadow-xl p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white text-sm">Revenue by Host</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {hostCount} host{hostCount === 1 ? '' : 's'}
            {pooled && <> · top {TOP_HOST_SLICES} shown</>}
          </p>
        </div>
      </div>

      {/* Donut with the period total in the hole */}
      <div className="relative mx-auto mt-2" style={{ width: 196, height: 196 }}>
        <Doughnut
          ref={chartRef}
          data={{
            labels: slices.map(s => s.label),
            datasets: [{
              data: slices.map(s => s.value),
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: isDark ? '#1e293b' : '#ffffff',
              hoverBorderColor: isDark ? '#1e293b' : '#ffffff',
              hoverOffset: 10,
            }],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            animation: { animateRotate: true, animateScale: false, duration: 900, easing: 'easeOutQuart' },
            // The custom legend below carries the labels and values; Chart.js's
            // own legend can't show the share, and the palette's light-mode
            // contrast warning obliges visible labels.
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: isDark ? '#0f172a' : '#0f172a',
                padding: 10, cornerRadius: 10, displayColors: true, boxPadding: 4,
                callbacks: {
                  label: c => {
                    const s = slices[c.dataIndex];
                    return ` $${fmt(s.value)} · ${s.share.toFixed(1)}%`;
                  },
                  afterLabel: c => {
                    const s = slices[c.dataIndex];
                    return s.isOther ? `${s.hosts} hosts combined` : '';
                  },
                },
              },
            },
            onHover: (_e, els) => setHovered(els.length ? els[0].index : null),
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            {hovered === null ? 'Total' : slices[hovered].isOther ? 'Others' : slices[hovered].label}
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums transition-all duration-200">
            {compact(hovered === null ? total : slices[hovered].value)}
          </span>
          {hovered !== null && (
            <span className="text-[11px] font-bold text-slate-400 tabular-nums">
              {slices[hovered].share.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend: swatch, name, value, share — and a bar for quick scanning */}
      <div className="mt-4 space-y-1.5">
        {slices.map((s, i) => (
          <div
            key={s.label}
            onMouseEnter={() => focus(i)}
            onMouseLeave={() => focus(null)}
            className={`rbh-row flex items-center gap-2.5 rounded-lg px-2 py-1.5 cursor-default
                        transition-colors duration-200 ${
              hovered === i ? 'bg-slate-50 dark:bg-slate-700/40' : ''
            }`}
            style={{ animationDelay: `${120 + i * 60}ms` }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-200"
              style={{ backgroundColor: colors[i], transform: hovered === i ? 'scale(1.35)' : 'none' }} />
            <span className={`text-xs truncate flex-1 min-w-0 ${
              s.isOther ? 'text-slate-500 dark:text-slate-400 italic' : 'text-slate-700 dark:text-slate-200 font-semibold'
            }`} title={s.isOther ? `${s.hosts} hosts combined` : s.label}>
              {s.label}
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
              {compact(s.value)}
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums w-11 text-right flex-shrink-0">
              {s.share.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {pooled && (
        <p className="text-[11px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
          &ldquo;Others&rdquo; pools the {pooled.hosts} hosts outside the top {TOP_HOST_SLICES} — nothing is left out of the total.
        </p>
      )}
    </div>
  );
}
