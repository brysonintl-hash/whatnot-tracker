import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table primitives. Every class here is on an element class attribute rather
 * than a bare tag selector, so these override the legacy global `table`/`th`/
 * `td` rules in globals.css while pages are still being migrated.
 *
 * Wrap in `<TableScroll>` so wide tables scroll inside their own container
 * instead of pushing the page sideways.
 */

export function TableScroll({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />;
}

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full border-collapse text-body-sm', className)} {...props} />
  ),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('', className)} {...props} />,
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('', className)} {...props} />,
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-outline-variant transition-colors last:border-0 hover:bg-surface-container-low',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'bg-surface-container-low border-b border-outline-variant px-unit-md py-unit-sm text-left align-middle',
        'font-mono text-spec-code uppercase text-on-surface-variant whitespace-nowrap',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('border-0 px-unit-md py-unit-sm align-middle text-on-surface', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

/** Right-aligned, tabular figures — use for every money and count column. */
export const TableNumCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <TableCell ref={ref} className={cn('text-right tabular-nums font-medium', className)} {...props} />
  ),
);
TableNumCell.displayName = 'TableNumCell';
