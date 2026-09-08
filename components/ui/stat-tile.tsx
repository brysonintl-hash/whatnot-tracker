import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

type Accent = 'brand' | 'success' | 'warning' | 'info' | 'neutral';

const accentBar: Record<Accent, string> = {
  brand: 'bg-primary-container',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-secondary',
  neutral: 'bg-outline',
};

const accentText: Record<Accent, string> = {
  brand: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-secondary',
  neutral: 'text-on-surface',
};

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((n, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((n - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [lastX, lastY] = pts[pts.length - 1];
  const gradId = React.useId();

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('w-full h-7 overflow-visible', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.25" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  /** Caption under the value — "after COGS", "48,060 orders". */
  sub?: string;
  accent?: Accent;
  icon?: string;
  /** Percentage change vs. the previous period. */
  delta?: { value: string; direction: 'up' | 'down' };
  trend?: number[];
  /** Dark treatment, for the one headline metric on a page. */
  inverse?: boolean;
}

export function StatTile({
  label,
  value,
  sub,
  accent = 'brand',
  icon,
  delta,
  trend,
  inverse = false,
  className,
  ...props
}: StatTileProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-unit-sm overflow-hidden rounded-xl p-unit-lg shadow-sm',
        inverse
          ? 'bg-inverse-surface text-inverse-on-surface'
          : 'bg-surface-container-lowest border border-outline-variant',
        className,
      )}
      {...props}
    >
      {/* Accent rail keys the tile to its metric family */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', accentBar[accent])} aria-hidden="true" />

      <div className="flex items-start justify-between gap-unit-sm">
        <span
          className={cn(
            'font-mono text-spec-code uppercase tracking-wide',
            inverse ? 'text-inverse-on-surface/60' : 'text-on-surface-variant',
          )}
        >
          {label}
        </span>
        {icon && (
          <Icon
            name={icon}
            size="sm"
            className={cn(inverse ? 'text-inverse-on-surface/50' : 'text-on-surface-variant')}
          />
        )}
      </div>

      <div className="flex items-baseline gap-unit-sm">
        <span
          className={cn(
            'font-display text-price-huge tabular-nums leading-none',
            inverse ? 'text-inverse-on-surface' : 'text-on-surface',
          )}
        >
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-unit-2xs font-mono text-spec-code',
              delta.direction === 'up' ? 'text-success' : 'text-error',
            )}
          >
            <Icon name={delta.direction === 'up' ? 'trending_up' : 'trending_down'} size="xs" />
            {delta.value}
          </span>
        )}
      </div>

      {trend && trend.length > 1 && (
        <div className={cn('-mx-unit-2xs', inverse ? 'text-inverse-on-surface/70' : accentText[accent])}>
          <Sparkline data={trend} />
        </div>
      )}

      {sub && (
        <span
          className={cn(
            'text-body-sm',
            inverse ? 'text-inverse-on-surface/55' : 'text-on-surface-variant',
          )}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
