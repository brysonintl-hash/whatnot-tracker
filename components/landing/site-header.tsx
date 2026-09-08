'use client';

import * as React from 'react';
import { Icon } from '@/components/ui';
import { useCart } from './cart-context';

const NAV_LINKS = [
  { label: 'Power Tools', href: '#' },
  { label: 'Hand Tools', href: '#' },
  { label: 'Storage & Gear', href: '#' },
  { label: 'Clearance', href: '#' },
  { label: 'Bulk Deals', href: '#' },
];

const DEPARTMENTS = ['All Depts', 'Power Tools', 'Hand Tools', 'Storage', 'Clearance'];

export function SiteHeader() {
  const { count, subtotal } = useCart();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="fixed left-0 top-0 z-50 w-full bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
      {/* Announcement bar */}
      <div className="flex items-center justify-center gap-unit-sm bg-primary-container px-margin-mobile py-unit-xs text-center text-on-primary-container">
        <Icon name="bolt" size="sm" />
        <span className="font-display text-label-badge uppercase tracking-wider">
          Flash Sale: Up to 50% Off Professional Power Tools · Free Shipping over $75
        </span>
        <Icon name="local_shipping" size="sm" className="hidden sm:inline-flex" />
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-unit-lg px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        {/* Logo */}
        <a href="/" className="flex shrink-0 items-baseline gap-unit-xs">
          <span className="font-display text-headline-md uppercase tracking-tight text-on-surface">Stack</span>
          <span className="font-display text-headline-md uppercase tracking-tight text-primary-container">Bargains</span>
          <span className="ml-unit-xs hidden rounded bg-surface-container-high px-unit-xs py-unit-2xs font-mono text-spec-code uppercase text-secondary sm:inline-block">
            Pro Spec
          </span>
        </a>

        {/* Search — desktop */}
        <div className="hidden max-w-2xl flex-1 items-center gap-unit-2xs rounded-lg bg-surface-container-low p-unit-2xs md:flex">
          <select
            aria-label="Department"
            className="rounded bg-surface-container px-unit-sm py-unit-xs font-mono text-spec-code uppercase text-on-surface outline-none"
          >
            {DEPARTMENTS.map(d => (
              <option key={d}>{d.toUpperCase()}</option>
            ))}
          </select>
          <div className="flex flex-1 items-center px-unit-sm">
            <input
              type="text"
              placeholder="Search by SKU, Model Number, or Keyword..."
              className="w-full bg-transparent text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
            />
            <button type="button" aria-label="Search" className="flex items-center text-secondary hover:text-on-surface">
              <Icon name="search" size="md" />
            </button>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-unit-md">
          <div className="hidden items-center gap-unit-xs xl:flex">
            <Icon name="support_agent" size="lg" className="text-primary-container" />
            <div className="flex flex-col leading-none">
              <span className="font-mono text-spec-code uppercase text-on-surface-variant">Contractor Desk</span>
              <span className="font-display text-label-badge uppercase tracking-wide text-on-surface">1-800-555-STCK</span>
            </div>
          </div>
          <a
            href="/login"
            className="hidden items-center gap-unit-xs text-on-surface transition-colors hover:text-primary-container sm:flex"
          >
            <Icon name="person" size="md" />
            <span className="font-display text-label-badge uppercase tracking-wider">Account</span>
          </a>
          <button
            type="button"
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
            className="flex items-center gap-unit-xs rounded-lg bg-surface-container-high px-unit-md py-unit-xs transition-[background-color,transform] duration-150 hover:-translate-y-0.5 hover:bg-surface-container-highest active:translate-y-0"
          >
            <span className="relative flex items-center">
              <Icon name="shopping_cart" size="md" className="text-on-surface" />
              {count > 0 && (
                // key={count} remounts the badge on every change so the pop
                // animation replays each time — a CSS class alone won't
                // retrigger without the DOM node itself being fresh.
                <span
                  key={count}
                  className="absolute -right-unit-xs -top-unit-xs flex h-4 w-4 animate-pop items-center justify-center rounded-full bg-primary-container font-mono text-[10px] font-bold leading-none text-on-primary-container"
                >
                  {count}
                </span>
              )}
            </span>
            <span className="hidden font-mono text-spec-code font-bold text-on-surface lg:inline">
              ${subtotal.toFixed(2)}
            </span>
          </button>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(v => !v)}
            className="flex h-9 w-9 items-center justify-center rounded text-on-surface md:hidden"
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size="lg" />
          </button>
        </div>
      </div>

      {/* Category nav — desktop */}
      <div className="mx-auto hidden h-12 max-w-7xl items-center justify-between px-margin-mobile pt-unit-xs md:flex md:px-margin-tablet lg:px-margin-desktop">
        <nav className="flex items-center gap-unit-xl overflow-x-auto">
          {NAV_LINKS.map(l => (
            <a
              key={l.label}
              href={l.href}
              className="relative whitespace-nowrap py-unit-2xs font-display text-label-badge uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface after:absolute after:-bottom-px after:left-0 after:h-[1.5px] after:w-0 after:bg-primary-container after:transition-[width] after:duration-200 hover:after:w-full"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-unit-md">
          <a href="#" className="flex items-center gap-unit-2xs font-mono text-spec-code uppercase text-secondary hover:text-on-surface">
            <Icon name="pin_drop" size="sm" />
            Store Locator
          </a>
          <a href="#" className="flex items-center gap-unit-2xs font-mono text-spec-code uppercase text-secondary hover:text-on-surface">
            <Icon name="verified" size="sm" />
            Pro Warranty
          </a>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="flex flex-col gap-unit-md border-t border-outline-variant bg-surface-container-lowest px-margin-mobile py-unit-lg md:hidden animate-slide-up">
          <div className="flex items-center gap-unit-sm rounded-lg bg-surface-container-low px-unit-sm py-unit-xs">
            <Icon name="search" size="sm" className="text-on-surface-variant" />
            <input
              type="text"
              placeholder="Search SKU or keyword..."
              className="w-full bg-transparent text-body-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
            />
          </div>
          <nav className="flex flex-col gap-unit-sm">
            {NAV_LINKS.map(l => (
              <a
                key={l.label}
                href={l.href}
                className="py-unit-xs font-display text-headline-sm uppercase text-on-surface"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <a href="/login" className="flex items-center gap-unit-xs py-unit-xs text-on-surface">
            <Icon name="person" size="md" />
            <span className="font-display text-label-badge uppercase tracking-wider">Account</span>
          </a>
        </div>
      )}
    </header>
  );
}
