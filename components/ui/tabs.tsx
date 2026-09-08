'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-unit-2xs rounded-lg bg-surface-container p-unit-2xs',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-unit-xs rounded px-unit-md py-unit-xs',
      'font-display text-label-badge uppercase tracking-wider whitespace-nowrap',
      'text-on-surface-variant transition-colors duration-150',
      'hover:text-on-surface',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container',
      'disabled:pointer-events-none disabled:opacity-40',
      'data-[state=active]:bg-surface-container-lowest data-[state=active]:text-primary data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-unit-lg animate-fade-in',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/**
 * Standalone filter pill row (date presets, host filters) — not Radix Tabs,
 * because these filter a view rather than switch panels.
 */
export function FilterPill({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center rounded px-unit-md font-display text-label-badge uppercase tracking-wider',
        'border transition-colors duration-150 whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container',
        active
          ? 'border-primary-container bg-primary-container text-on-primary-container'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary-container hover:text-primary',
        className,
      )}
      {...props}
    />
  );
}
