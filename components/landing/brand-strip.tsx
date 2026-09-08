import { Icon } from '@/components/ui';

const BRANDS = ['DEWALT', 'MILWAUKEE', 'MAKITA', 'BOSCH', 'RYOBI', 'CRAFTSMAN', 'HILTI', 'STANLEY'];

export function BrandStrip() {
  return (
    <section className="w-full bg-surface-container-high py-unit-md shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-unit-md px-margin-mobile md:flex-row md:px-margin-tablet lg:px-margin-desktop">
        <div className="flex shrink-0 items-center gap-unit-xs">
          <Icon name="verified" size="sm" className="text-primary-container" />
          <span className="font-display text-label-badge uppercase tracking-wider text-on-surface">
            Factory Direct Brands:
          </span>
        </div>
        <div className="flex w-full items-center justify-between gap-unit-xl overflow-x-auto py-unit-2xs">
          {BRANDS.map(b => (
            <span
              key={b}
              className="cursor-pointer whitespace-nowrap font-display text-headline-sm uppercase tracking-tighter text-secondary transition-colors hover:text-on-surface"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
