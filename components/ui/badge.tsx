import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-unit-2xs whitespace-nowrap rounded',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-container-high text-on-surface-variant',
        brand: 'bg-primary-container text-on-primary-container',
        soft: 'bg-primary-fixed text-on-primary-fixed',
        success: 'bg-success-container text-on-success-container',
        warning: 'bg-warning-container text-on-warning-container',
        danger: 'bg-error-container text-on-error-container',
        outline: 'border border-outline-variant text-on-surface-variant',
      },
      /**
       * `label` — condensed uppercase, for status and category chips.
       * `spec`  — monospace, for SKUs, model numbers and measured values.
       */
      tone: {
        label: 'font-display text-label-badge uppercase tracking-wider px-unit-xs py-unit-2xs',
        spec: 'font-mono text-spec-code uppercase px-unit-xs py-unit-2xs',
      },
    },
    defaultVariants: { variant: 'neutral', tone: 'label' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, tone }), className)} {...props} />;
}

/** Live status dot + label, e.g. "In Stock", "Online". */
export function StatusDot({
  status = 'neutral',
  pulse = false,
  className,
}: {
  status?: 'success' | 'warning' | 'danger' | 'neutral';
  pulse?: boolean;
  className?: string;
}) {
  const color = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-error',
    neutral: 'bg-outline',
  }[status];
  return (
    <span className={cn('relative flex h-2 w-2 shrink-0', className)}>
      {pulse && (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

export { badgeVariants };
