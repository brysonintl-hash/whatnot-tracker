import { Icon } from '@/components/ui';

const PROPS = [
  {
    icon: 'shield',
    title: 'Lifetime Warranty',
    body: "Hassle-free in-store or online field exchanges on all professional hand tool structural integrity.",
    tag: 'No-Receipt Swaps',
  },
  {
    icon: 'price_check',
    title: 'Price Match + 10%',
    body: "We actively beat any authorized industrial tool distributor's documented advertised rate.",
    tag: 'Wholesale Guaranteed',
  },
  {
    icon: 'local_shipping',
    title: 'Same-Day Jobsite Run',
    body: 'Orders over $99 qualify for prioritized rapid contractor flatbed or parcel dispatch.',
    tag: 'Chicago Yard Fleet',
  },
  {
    icon: 'engineering',
    title: 'Certified Tech Desk',
    body: 'Speak directly with experienced master carpenters and certified electrical mechanics.',
    tag: 'Toll-Free Pro Support',
  },
];

export function ValueProps() {
  return (
    <section className="w-full bg-surface py-unit-2xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        <div className="grid grid-cols-1 gap-unit-md md:grid-cols-2 lg:grid-cols-4">
          {PROPS.map(p => (
            <div
              key={p.title}
              className="flex flex-col gap-unit-sm rounded-xl bg-surface-container-lowest p-unit-lg shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container-low text-primary-container">
                <Icon name={p.icon} size="lg" />
              </div>
              <h3 className="font-display text-headline-sm uppercase text-on-surface">{p.title}</h3>
              <p className="text-body-sm text-on-surface-variant">{p.body}</p>
              <span className="mt-auto flex items-center gap-unit-2xs font-mono text-spec-code uppercase text-secondary">
                <Icon name="check_circle" size="xs" className="text-primary-container" />
                {p.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
