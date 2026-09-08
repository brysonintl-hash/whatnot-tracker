'use client';

import * as React from 'react';
import Image from 'next/image';
import { Button, Icon } from '@/components/ui';
import { useCart } from './cart-context';

type Product = {
  sku: string;
  brand: string;
  line: string;
  name: string;
  image: string;
  alt: string;
  specs: [string, string, string];
  rating: number;
  reviews: number;
  price: number;
  wasPrice: number;
  discount: number;
};

const PRODUCTS: Product[] = [
  {
    sku: 'DW-9821', brand: 'DEWALT', line: '20V MAX XR',
    name: '1/2-in Brushless Hammer Drill / Driver Kit (5.0Ah)',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBObB5_ZBNrgqy56zYdxpNOAfKzOlikzi7RWWsl_aJlHR0GxWuKTkG0EjAL83dqiopiUi0qNYYVFp8a3mDS2Ejqizf3SEbyZgN-ki9U8g3_KpLz8mXYFunsQiuJZ2GS1YYZFKdyD4l1pMv2f5tbMC98ur2MVnCxeczOMtO9wTm5xaZytn38SUgoZ8NYBdvJRQRVdGcImdnUugm4P2x9S7C-647ng527ZeQ3PtFgJZUqownrGn_bEu80kQ',
    alt: 'DEWALT 20V MAX brushless hammer drill kit with two batteries and charger',
    specs: ['2,000 RPM', '820 UWO', '2× Batt'],
    rating: 4.5, reviews: 142, price: 179, wasPrice: 289, discount: 38,
  },
  {
    sku: 'MW-2853', brand: 'MILWAUKEE', line: 'M18 FUEL',
    name: '1/4-in Hex Impact Driver Bare Tool High Velocity',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCpinaXeJy6-T5qTyH6-0NGn-K1Zv-Iz7PRzF6MkA4_GtfgcTJyZH4EMChoRJnNfVa51EQyJi3TyUyGkYYXxlG6EsUQ6S1HA99RgTTzSiuAqmJcTpOeNHzIMBAt0l5LOvH01rKa_H9K-x6LOA_2LOCutGJ1N6DLF1Y6aFIH15ejAu95F0AfytjZzC4uZrSboF2lchWkcJryNaqldM49-64uW6ywMCQqDPmVG_62An18qunPjSMbSnZuXA',
    alt: 'Milwaukee M18 Fuel high torque impact driver, bare tool',
    specs: ['2,000 IN-LBS', '3,600 RPM', 'Bare Tool'],
    rating: 5, reviews: 389, price: 99, wasPrice: 169, discount: 42,
  },
  {
    sku: 'MK-5007', brand: 'MAKITA', line: '15 AMP',
    name: '7-1/4-in Magnesium Circular Saw With Electric Brake',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDKoHnnShQUPKGigHU4Kv3ggcXaX3hnNMhPXBvs0fJFKKWFiIw94VRMntZlZTg7EasiYX8bMf50V5rblxe0Rnkbgkr8xG2rBh178F_VqfrfV1cEbF8Hv_SIdkzdEf99mWo-G0GoazBISvM7xHuGedw6Jpkf26I70HRr3QaD0Nya7yCh1t3KSMNaJc4iV2NT4V1HTzVYu-FmvxUIM50dhCKCQCTat_zk4iBdGXiwcIybrCFIB0aLyoHWMg',
    alt: 'Makita 7-1/4 inch magnesium circular saw with electric brake',
    specs: ['5,800 RPM', '10.6 LBS', '56° Bevel'],
    rating: 4, reviews: 88, price: 139, wasPrice: 199, discount: 30,
  },
  {
    sku: 'BSH-11255', brand: 'BOSCH', line: 'BULLDOG XTREME',
    name: '1-in SDS-plus D-Handle Rotary Hammer Drill',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDpuT9FCT3qGsUe_WQf7hxLBI5I62wQIOy5KtVuSArQiSdyK3naZmL325T35kGuqshh7pHASgPUXamm4iqgFY1yA3_8iHiVuja1nh5xcV4MlhVmyVkO-9gc1syQA6ASRD8YcuaU2mUFg1fxlzlejKkKonzQRHIYl_NzdSiS0MZ2N0CYvasRbLFmF-WKcmqTTlkSG_F1PWYFEaZz4Dl7NsPRWTeICIInc8Ka-b02kTmjKhovTgET89W7zw',
    alt: 'Bosch Bulldog Xtreme SDS-plus rotary hammer drill',
    specs: ['8.0 AMP', '2.0 FT-LBS', 'Vario-Lock'],
    rating: 5, reviews: 210, price: 149, wasPrice: 269, discount: 45,
  },
];

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

  return (
    <div className="group flex flex-col justify-between rounded-xl bg-surface-container-lowest p-unit-md shadow-sm transition-shadow hover:shadow-md">
      <div>
        <div className="relative mb-unit-md flex items-center justify-center overflow-hidden rounded-lg bg-surface-container-low p-unit-md">
          <span className="absolute left-unit-xs top-unit-xs rounded bg-primary-container px-unit-xs py-unit-2xs font-display text-label-badge uppercase text-on-primary">
            -{product.discount}% Off
          </span>
          <span className="absolute right-unit-xs top-unit-xs font-mono text-spec-code text-secondary">
            SKU #{product.sku}
          </span>
          <Image
            src={product.image}
            alt={product.alt}
            width={280}
            height={192}
            unoptimized
            className="h-48 w-full object-contain transition-transform group-hover:scale-105"
          />
        </div>
        <span className="block font-mono text-spec-code uppercase text-secondary">
          {product.brand} · {product.line}
        </span>
        <h3 className="mt-unit-2xs line-clamp-2 font-display text-headline-sm uppercase text-on-surface">
          {product.name}
        </h3>
        <div className="my-unit-sm flex flex-wrap items-center gap-unit-2xs">
          {product.specs.map(s => (
            <span key={s} className="rounded bg-surface-container px-unit-xs py-unit-2xs font-mono text-spec-code text-on-surface">
              {s}
            </span>
          ))}
        </div>
        <StarRating rating={product.rating} reviews={product.reviews} />
      </div>
      <div>
        <div className="mb-unit-sm flex items-baseline gap-unit-xs">
          <span className="font-display text-price-huge text-primary-container">${product.price.toFixed(2)}</span>
          <span className="text-body-sm text-secondary line-through">${product.wasPrice.toFixed(2)}</span>
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
  return (
    <section id="flash-deals" className="w-full bg-surface-container-low py-unit-2xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
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

        <div className="grid grid-cols-1 gap-unit-lg sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map(p => (
            <ProductCard key={p.sku} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
