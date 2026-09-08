import * as React from 'react';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-[16px]',
} as const;

/** Role colours are consistent everywhere a person appears in the app. */
export const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-primary-container text-on-primary-container',
  manager: 'bg-secondary text-on-secondary',
  host: 'bg-warning text-on-warning',
  shipper: 'bg-tertiary text-on-tertiary',
  employee: 'bg-success text-on-success',
};

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  role?: string;
  size?: keyof typeof sizes;
  /** Shows a presence dot on the lower-right corner. */
  online?: boolean;
}

export function Avatar({ name, role, size = 'md', online, className, ...props }: AvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <span className={cn('relative inline-flex shrink-0', className)} {...props}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-display font-bold uppercase leading-none',
          sizes[size],
          (role && ROLE_COLOR[role]) || 'bg-surface-container-highest text-on-surface',
        )}
        title={role ? `${name} · ${role}` : name}
      >
        {initial}
      </span>
      {online && (
        <span
          className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface-container-lowest"
          aria-label="Online"
          role="img"
        />
      )}
    </span>
  );
}
