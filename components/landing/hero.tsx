'use client';

import * as React from 'react';
import { Button, Icon } from '@/components/ui';
import { Reveal } from './reveal';
import type { HeroSlide } from '@/lib/storefrontStore';

const DEFAULT_SLIDES: HeroSlide[] = [
  { image: null, label: 'Verified Pro Stock: Pallet #409B', status: 'In Stock' },
  { image: null, label: 'Verified Pro Stock: Pallet #412A', status: 'In Stock' },
  { image: null, label: 'New Arrivals: Milwaukee M18 Line', status: 'Just In' },
  { image: null, label: 'Clearance Yard: Final Markdowns', status: 'Ends Soon' },
];

const AUTO_ADVANCE_MS = 5500;

export function Hero() {
  const [slide, setSlide] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  // Staff can swap these in (photo per slide, plus label/status) from the
  // Storefront admin page without a deploy — falls back to the built-in
  // placeholder art/copy until then.
  const [slides, setSlides] = React.useState<HeroSlide[]>(DEFAULT_SLIDES);
  React.useEffect(() => {
    fetch('/api/storefront')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (Array.isArray(data?.heroSlides) && data.heroSlides.length > 0) setSlides(data.heroSlides); })
      .catch(() => {});
  }, []);

  const go = React.useCallback((delta: number) => {
    setSlide(s => (s + delta + slides.length) % slides.length);
  }, [slides.length]);

  // Auto-advance on a timer, re-armed fresh every time the slide changes —
  // whether that change came from the timer itself or a manual click —
  // so a visitor who just clicked a dot isn't immediately bumped forward.
  // Paused on hover, and skipped entirely for reduced-motion visitors,
  // who get manual-only navigation.
  React.useEffect(() => {
    if (paused || slides.length <= 1) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => go(1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [slide, paused, slides.length, go]);

  const current = slides[slide] ?? slides[0];

  return (
    <section className="relative w-full bg-inverse-surface py-unit-lg lg:py-unit-xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        <Reveal
          as="div"
          className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl shadow-xl sm:aspect-[16/9] lg:aspect-[21/9]"
        >
          <div
            className="relative h-full w-full"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {/* Every slide's art is stacked and crossfaded via opacity — keeps
                the swap smooth and avoids a flash of missing image while a
                new src loads. */}
            {slides.map((s, i) => (
              <div
                key={i}
                aria-hidden={i !== slide}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${i === slide ? 'opacity-100' : 'opacity-0'}`}
              >
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt={s.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="relative h-full w-full bg-gradient-to-br from-surface-container-high/20 to-inverse-on-surface/5">
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(135deg, rgb(var(--primary-container)) 0 2px, transparent 2px 28px)',
                      }}
                      aria-hidden="true"
                    />
                    {/* No centered icon here on purpose — at this wide an
                        aspect ratio it would sit right behind the headline
                        overlay instead of reading as background texture. */}
                  </div>
                )}
              </div>
            ))}

            {/* Scrim for legible overlaid text regardless of what's in the photo */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" aria-hidden="true" />

            {/* Overlaid offer content */}
            <div className="relative z-10 flex h-full flex-col items-center justify-center px-margin-mobile text-center md:px-margin-tablet">
              <div className="flex max-w-2xl flex-col items-center gap-unit-sm">
                <span className="inline-flex items-center gap-unit-2xs rounded bg-primary-container px-unit-sm py-unit-2xs font-display text-label-badge uppercase tracking-wider text-on-primary-container shadow-sm">
                  <Icon name="local_fire_department" size="xs" />
                  Contractor &amp; Pro Clearance · Summer Tool Event
                </span>

                <h1 className="text-balance font-display text-display-lg-mobile uppercase leading-none tracking-tight text-white md:text-display-lg">
                  Gear Up With <span className="text-primary-fixed-dim">Pro-Grade</span> Power Tools
                </h1>

                <p className="hidden max-w-xl text-body-lg text-white/85 sm:block">
                  Over 10,000 professional-grade power tools, heavy-duty impact equipment, and workshop gear at direct-to-pro wholesale liquidation rates.
                </p>

                <div className="mt-unit-xs flex flex-wrap items-center justify-center gap-unit-md">
                  <Button asChild size="lg">
                    <a href="#flash-deals">
                      Shop Power Tools Deals
                      <Icon name="arrow_forward" size="md" />
                    </a>
                  </Button>
                  <Button asChild variant="inverse" size="lg" className="hidden bg-white/10 hover:bg-white/20 sm:inline-flex">
                    <a href="#categories">
                      <Icon name="menu_book" size="md" />
                      Browse Weekly Flyer
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            {/* Current slide's caption + status + dots, one bottom bar so
                nothing competes for the same strip of the image. */}
            <div className="absolute inset-x-unit-md bottom-unit-md z-10 flex items-center justify-between gap-unit-sm rounded bg-inverse-surface/90 p-unit-sm text-inverse-on-surface backdrop-blur sm:inset-x-unit-lg">
              <div className="flex min-w-0 items-center gap-unit-xs">
                <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-primary-container" />
                <span className="truncate font-mono text-spec-code uppercase">{current.label}</span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-unit-xs">
                {slides.map((s, i) => (
                  <button
                    key={i}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide ? 'w-6 bg-primary-container' : 'w-2 bg-inverse-on-surface/25 hover:bg-inverse-on-surface/40'
                    }`}
                  />
                ))}
              </div>
              <span className="flex-shrink-0 font-display text-label-badge uppercase text-primary-fixed-dim">{current.status}</span>
            </div>

            {/* Prev / next arrows */}
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => go(-1)}
              className="absolute left-unit-sm top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 transition-[opacity,background-color,transform] duration-150 hover:scale-110 hover:bg-black/50 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="arrow_back" size="sm" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => go(1)}
              className="absolute right-unit-sm top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 transition-[opacity,background-color,transform] duration-150 hover:scale-110 hover:bg-black/50 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="arrow_forward" size="sm" />
            </button>
          </div>
        </Reveal>

        {/* Quick metrics */}
        <Reveal delay={150} className="mt-unit-lg grid grid-cols-3 gap-unit-md rounded-lg bg-inverse-on-surface/5 p-unit-md">
          {[
            { v: '50% OFF', l: 'Max Overstock Tier' },
            { v: '24-HR', l: 'Jobsite Direct Dispatch' },
            { v: '100%', l: 'OEM Factory Sealed' },
          ].map(m => (
            <div key={m.l} className="text-center">
              <span className="block font-display text-headline-md leading-none text-primary-fixed-dim">{m.v}</span>
              <span className="font-mono text-spec-code uppercase text-inverse-on-surface/60">{m.l}</span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
