import { Button, Icon } from '@/components/ui';
import { Reveal } from './reveal';

const PERKS = [
  { icon: 'payments', title: '5% Extra Cashback', sub: 'Applied automatically' },
  { icon: 'receipt_long', title: 'Net 30 Invoicing', sub: 'Flexible commercial terms' },
  { icon: 'assignment_ind', title: 'Dedicated Account Manager', sub: 'One regional contact' },
];

export function ProClubBanner() {
  return (
    <section className="w-full bg-surface pb-unit-3xl">
      <div className="mx-auto max-w-7xl px-margin-mobile md:px-margin-tablet lg:px-margin-desktop">
        <Reveal as="div" className="relative overflow-hidden rounded-2xl bg-inverse-surface p-unit-xl text-inverse-on-surface shadow-xl lg:p-unit-2xl">
          {/* Subtle grid graphic — echoes the industrial line-drawing motif */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]" aria-hidden="true">
            <defs>
              <pattern id="pcb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#pcb-grid)" />
          </svg>

          <div className="relative z-10 grid grid-cols-1 items-center gap-unit-xl lg:grid-cols-12">
            <div className="flex flex-col gap-unit-sm lg:col-span-8">
              <div className="flex items-center gap-unit-xs">
                <span className="h-3 w-3 rounded-sm bg-primary-container" />
                <span className="font-mono text-spec-code uppercase tracking-wider text-primary-fixed-dim">
                  Contractor Advantage Program
                </span>
              </div>
              <h2 className="text-balance font-display text-headline-xl uppercase leading-none tracking-tight text-inverse-on-surface md:text-display-lg-mobile">
                Join the Stack Bargains <span className="text-primary-fixed-dim">Contractor Pro Club</span>
              </h2>
              <p className="max-w-2xl text-body-lg text-inverse-on-surface/75">
                Unlock tax-exempt purchasing, net 30 invoicing terms, dedicated regional account management, and an additional 5% instant cashback on all warehouse pallets.
              </p>

              <div className="mt-unit-sm grid grid-cols-1 gap-unit-md pt-unit-sm sm:grid-cols-3">
                {PERKS.map(p => (
                  <div key={p.title} className="flex items-center gap-unit-xs">
                    <Icon name={p.icon} size="lg" className="text-primary-container" />
                    <div className="leading-tight">
                      <span className="block font-display text-label-badge uppercase text-inverse-on-surface">{p.title}</span>
                      <span className="font-mono text-spec-code text-inverse-on-surface/60">{p.sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-start gap-unit-sm lg:col-span-4 lg:items-end">
              <Button size="lg" className="w-full lg:w-auto">
                Join Pro Club — It's Free
                <Icon name="arrow_forward" size="md" className="transition-transform duration-200 group-hover:translate-x-1" />
              </Button>
              <Button asChild variant="inverse" size="md" className="w-full bg-inverse-on-surface/10 hover:bg-inverse-on-surface/20 lg:w-auto">
                <a href="#">See Full Benefits</a>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
