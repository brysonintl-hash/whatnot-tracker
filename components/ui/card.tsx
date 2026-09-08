import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lifts on hover — use only when the whole card is a link or button. */
  interactive?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm',
        interactive &&
          'transition-shadow duration-200 hover:shadow-md focus-within:shadow-md cursor-pointer',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-unit-2xs p-unit-lg', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

/** Small uppercase kicker above a title — the "REVENUE" / "SKU #DW-9821" line. */
export const CardEyebrow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('font-mono text-spec-code uppercase text-on-surface-variant', className)}
      {...props}
    />
  ),
);
CardEyebrow.displayName = 'CardEyebrow';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-display text-headline-sm uppercase text-on-surface text-balance', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-body-sm text-on-surface-variant', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-unit-lg pb-unit-lg', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-unit-sm px-unit-lg py-unit-md border-t border-outline-variant', className)}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';
