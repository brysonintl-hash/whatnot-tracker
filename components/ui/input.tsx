'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Material Symbols name rendered inside the field's leading edge. */
  icon?: string;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, invalid, type = 'text', ...props }, ref) => {
    const field = (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          // Overrides the legacy global `input` rule until every page is migrated.
          'w-full bg-surface-container-lowest text-body-md text-on-surface rounded-lg',
          'border transition-colors duration-150 placeholder:text-on-surface-variant/60',
          'focus:outline-none focus-visible:outline-none',
          invalid
            ? 'border-error focus:border-error focus:ring-2 focus:ring-error/30'
            : 'border-outline-variant focus:border-primary-container focus:ring-2 focus:ring-primary-container/25',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          icon ? 'h-10 pl-9 pr-unit-md' : 'h-10 px-unit-md',
          className,
        )}
        {...props}
      />
    );

    if (!icon) return field;

    return (
      <div className="relative w-full">
        <Icon
          name={icon}
          size="sm"
          className="pointer-events-none absolute left-unit-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        {field}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

/** Label + control + hint/error, with consistent vertical rhythm. */
export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-unit-xs', className)}>
      <label
        htmlFor={htmlFor}
        className="font-mono text-spec-code uppercase text-on-surface-variant"
      >
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-body-sm text-error">{error}</span>
      ) : hint ? (
        <span className="text-body-sm text-on-surface-variant">{hint}</span>
      ) : null}
    </div>
  );
}
