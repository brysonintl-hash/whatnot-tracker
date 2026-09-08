'use client';

import * as React from 'react';
import { Button, Icon } from '@/components/ui';

const SLIDES = [
  { label: 'Verified Pro Stock: Pallet #409B', status: 'In Stock' },
  { label: 'Verified Pro Stock: Pallet #412A', status: 'In Stock' },
  { label: 'New Arrivals: Milwaukee M18 Line', status: 'Just In' },
  { label: 'Clearance Yard: Final Markdowns', status: 'Ends Soon' },
];

export function Hero() {
  const [slide, setSlide] = React.useState(0);
  const go = (delta: number) => setSlide(s => (s + delta + SLIDES.length) % SLIDES.length);

  return (
    <section className="relative w-full overflow-hidden bg-inverse-surface text-inverse-on-surface">
      <div className="relative z-10 mx-auto max-w-7xl px-margin-mobile py-unit-xl md:px-margin-tablet lg:px-margin-desktop lg:py-unit-3xl">
        <div className="grid grid-cols-1 items-center gap-unit-xl lg:grid-cols-12">
          {/* Left: offer */}
          <div className="flex flex-col gap-unit-md lg:col-span-7">
            <div className="flex flex-wrap items-center gap-unit-xs">
              <span className="inline-flex items-center gap-unit-2xs rounded bg-primary-container px-unit-sm py-unit-2xs font-display text-label-badge uppercase tracking-wider text-on-primary-container shadow-sm">
                <Icon name="local_fire_department" size="xs" />
                Contractor &amp; Pro Clearance · Summer Tool Event
              </span>
              <span className="hidden rounded bg-inverse-on-surface/10 px-unit-xs py-unit-2xs font-mono text-spec-code text-inverse-on-surface/70 sm:inline-block">
                SKU-PRO-2024
              </span>
            </div>

            <h1 className="text-balance font-display text-display-lg-mobile uppercase leading-none tracking-tight text-inverse-on-surface md:text-display-lg">
              Gear Up With <span className="text-primary-fixed-dim">Pro-Grade</span> Power Tools
            </h1>

            <p className="max-w-xl text-body-lg text-inverse-on-surface/75">
              Over 10,000 professional-grade power tools, heavy-duty impact equipment, and workshop gear at direct-to-pro wholesale liquidation rates.
            </p>

            <div className="flex flex-wrap items-center gap-unit-md pt-unit-xs">
              <Button asChild size="lg">
                <a href="#flash-deals">
                  Shop Power Tools Deals
                  <Icon name="arrow_forward" size="md" />
                </a>
              </Button>
              <Button asChild variant="inverse" size="lg" className="bg-inverse-on-surface/10 hover:bg-inverse-on-surface/20">
                <a href="#categories">
                  <Icon name="menu_book" size="md" />
                  Browse Weekly Flyer
                </a>
              </Button>
            </div>

            {/* Quick metrics */}
            <div className="mt-unit-sm grid grid-cols-3 gap-unit-md rounded-lg bg-inverse-on-surface/5 p-unit-md">
              {[
                { v: '50% OFF', l: 'Max Overstock Tier' },
                { v: '24-HR', l: 'Jobsite Direct Dispatch' },
                { v: '100%', l: 'OEM Factory Sealed' },
              ].map(m => (
                <div key={m.l}>
                  <span className="block font-display text-headline-md leading-none text-primary-fixed-dim">{m.v}</span>
                  <span className="font-mono text-spec-code uppercase text-inverse-on-surface/60">{m.l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: stock banner + carousel controls */}
          <div className="relative lg:col-span-5">
            <div className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br from-surface-container-high/20 to-inverse-on-surface/5 shadow-xl">
              <div
                className="absolute inset-0 opacity-30 transition-opacity duration-500"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(135deg, rgb(var(--primary-container)) 0 2px, transparent 2px 28px)',
                }}
                aria-hidden="true"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon name="inventory_2" className="text-inverse-on-surface/20" style={{ fontSize: '96px' }} />
              </div>
              <div className="absolute inset-x-unit-md bottom-unit-md flex items-center justify-between rounded bg-inverse-surface/90 p-unit-sm text-inverse-on-surface backdrop-blur">
                <div className="flex items-center gap-unit-xs">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary-container" />
                  <span className="font-mono text-spec-code uppercase">{SLIDES[slide].label}</span>
                </div>
                <span className="font-display text-label-badge uppercase text-primary-fixed-dim">{SLIDES[slide].status}</span>
              </div>
            </div>

            <div className="mt-unit-sm flex items-center justify-between px-unit-xs">
              <div className="flex items-center gap-unit-xs">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() => go(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded bg-inverse-on-surface/10 text-inverse-on-surface transition-colors hover:bg-inverse-on-surface/20"
                >
                  <Icon name="arrow_back" size="sm" />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => go(1)}
                  className="flex h-8 w-8 items-center justify-center rounded bg-inverse-on-surface/10 text-inverse-on-surface transition-colors hover:bg-inverse-on-surface/20"
                >
                  <Icon name="arrow_forward" size="sm" />
                </button>
              </div>
              <div className="flex items-center gap-unit-xs">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.label}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide ? 'w-6 bg-primary-container' : 'w-2 bg-inverse-on-surface/25'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-spec-code text-inverse-on-surface/60">
                {String(slide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
