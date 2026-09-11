'use client';

import * as React from 'react';
import Image from 'next/image';
import { Button, Icon } from '@/components/ui';
import { useCart } from './cart-context';
import { Reveal } from './reveal';
import type { Deal as Product } from '@/lib/dealsStore';

// The catalog itself now lives in the Hot Deals admin page (/deals) and is
// fetched below — nothing here is hardcoded any more. Discount is always
// computed from price vs. wasPrice rather than stored, so it can't drift
// out of sync with the prices an admin actually typed in.
function discountOf(p: { price: number; wasPrice: number }): number {
  return p.wasPrice > p.price ? Math.round(((p.wasPrice - p.price) / p.wasPrice) * 100) : 0;
}

function Countdown() {
  const [secondsLeft, setSecondsLeft] = React.useState(14 * 3600 + 22 * 60 + 10);

  React.useEffect(() => {
    const t = window.setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;

  return (
    <div className="flex items-center gap-unit-sm font-mono">
      {[{ v: h, l: 'Hrs' }, { v: m, l: 'Min' }, { v: s, l: 'Sec' }].map((u, i) => (
        <React.Fragment key={u.l}>
          {i > 0 && <span className="font-display text-headline-md text-inverse-on-surface/40">:</span>}
          <div className="rounded bg-inverse-on-surface/10 px-unit-md py-unit-xs text-center">
            <span
              className={`block font-display text-headline-md leading-none tabular-nums ${
                i === 2 ? 'text-primary-fixed-dim' : 'text-inverse-on-surface'
              }`}
            >
              {String(u.v).padStart(2, '0')}
            </span>
            <span className="text-spec-code uppercase text-inverse-on-surface/60">{u.l}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function StarRating({ rating, reviews }: { rating: number; reviews: number }) {
  return (
    <div className="mb-unit-sm flex items-center gap-unit-2xs text-secondary">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i + 1 <= Math.floor(rating);
        const half = !filled && i < rating;
        return (
          <Icon
            key={i}
            name={half ? 'star_half' : 'star'}
            size="sm"
            filled={filled || half}
            className={filled || half ? 'text-primary-container' : 'text-secondary'}
          />
        );
      })}
      <span className="ml-unit-2xs font-mono text-spec-code">({reviews})</span>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { add, justAdded } = useCart();
  const added = justAdded === product.sku;
  const discount = discountOf(product);

  return (
    <div className="group flex flex-col justify-between rounded-xl bg-surface-container-lowest p-unit-md shadow-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-1 hover:shadow-md">
      <div>
        <div className="relative mb-unit-md flex items-center justify-center overflow-hidden rounded-lg bg-surface-container-low p-unit-md">
          {discount > 0 && (
            <span className="absolute left-unit-xs top-unit-xs rounded bg-primary-container px-unit-xs py-unit-2xs font-display text-label-badge uppercase text-on-primary">
              -{discount}% Off
            </span>
          )}
          <span className="absolute right-unit-xs top-unit-xs font-mono text-spec-code text-secondary">
            SKU #{product.sku}
          </span>
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              width={280}
              height={192}
              unoptimized
              className="h-48 w-full object-contain transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center">
              <Icon name="inventory_2" className="text-on-surface-variant/30" style={{ fontSize: '64px' }} />
            </div>
          )}
        </div>
        <span className="block font-mono text-spec-code uppercase text-secondary">
          {product.brand} · {product.line}
        </span>
        <h3 className="mt-unit-2xs line-clamp-2 font-display text-headline-sm uppercase text-on-surface">
          {product.name}
        </h3>
        {product.specs.length > 0 && (
          <div className="my-unit-sm flex flex-wrap items-center gap-unit-2xs">
            {product.specs.map(s => (
              <span key={s} className="rounded bg-surface-container px-unit-xs py-unit-2xs font-mono text-spec-code text-on-surface">
                {s}
              </span>
            ))}
          </div>
        )}
        {product.description && (
          <p className="mb-unit-sm line-clamp-2 text-body-sm text-on-surface-variant">{product.description}</p>
        )}
        <StarRating rating={product.rating} reviews={product.reviews} />
      </div>
      <div>
        <div className="mb-unit-sm flex items-baseline gap-unit-xs">
          <span className="font-display text-price-huge text-primary-container">${product.price.toFixed(2)}</span>
          {product.wasPrice > product.price && (
            <span className="text-body-sm text-secondary line-through">${product.wasPrice.toFixed(2)}</span>
          )}
        </div>
        <Button
          className="w-full"
          onClick={() => add({ sku: product.sku, name: product.name, price: product.price })}
        >
          <Icon name={added ? 'check' : 'add_shopping_cart'} size="sm" />
          {added ? 'Added' : 'Add To Cart'}
        </Button>
      </div>
    </div>
  );
}

export function FlashDeals() {
  // Fetched from the admin-managed catalog (/deals) rather than hardcoded —
  // starts empty and fills in on mount, so an admin who removes every deal
  // sees the section disappear instead of showing an empty grid.
  const [deals, setDeals] = React.useState<Product[] | null>(null);

  React.useEffect(() => {
    fetch('/api/deals')
      .then(r => (r.ok ? r.json() : []))
      .then((data: Product[]) => setDeals(Array.isArray(data) ? data : []))
      .catch(() => setDeals([]));
  }, []);

  if (deals !== null && deals.length === 0) return null;

  return (
    <section id="flash-deals" className="w-full bg-surface-container-low py-unit-2xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        <Reveal>
          <div className="mb-unit-xl flex flex-col items-center justify-between gap-unit-md rounded-xl bg-inverse-surface p-unit-lg text-inverse-on-surface shadow-md md:flex-row">
            <div className="flex items-center gap-unit-md">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-container text-on-primary-container">
                <Icon name="timer" size="lg" />
              </div>
              <div>
                <span className="block font-display text-label-badge uppercase tracking-widest text-primary-fixed-dim">
                  Industrial Flash Liquidation
                </span>
                <h2 className="text-balance font-display text-headline-xl uppercase leading-none text-inverse-on-surface">
                  Hot Deals Ending Soon
                </h2>
              </div>
            </div>
            <Countdown />
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-unit-lg sm:grid-cols-2 lg:grid-cols-4">
          {(deals ?? []).map((p, i) => (
            <Reveal key={p.sku} delay={i * 80}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
