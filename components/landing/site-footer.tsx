import { Icon } from '@/components/ui';

const COLUMNS = [
  {
    title: 'Shop',
    links: ['Power Tools', 'Hand Tools', 'Storage & Gear', 'Clearance', 'Bulk Deals'],
  },
  {
    title: 'Support',
    links: ['Contractor Desk', 'Pro Warranty', 'Returns & Exchanges', 'Shipping Info', 'Track an Order'],
  },
  {
    title: 'Company',
    links: ['About Stack Bargains', 'Store Locator', 'Contractor Pro Club', 'Careers'],
  },
];

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-outline-variant bg-inverse-surface text-inverse-on-surface">
      <div className="mx-auto max-w-7xl px-margin-mobile py-unit-2xl md:px-margin-tablet lg:px-margin-desktop">
        <div className="grid grid-cols-1 gap-unit-xl md:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-unit-sm lg:col-span-2">
            <a href="/" className="flex items-baseline gap-unit-xs">
              <span className="font-display text-headline-md uppercase tracking-tight text-inverse-on-surface">Stack</span>
              <span className="font-display text-headline-md uppercase tracking-tight text-primary-fixed-dim">Bargains</span>
            </a>
            <p className="max-w-xs text-body-sm text-inverse-on-surface/60">
              Direct-to-pro wholesale liquidation on professional-grade power tools and jobsite gear.
            </p>
            <div className="mt-unit-xs flex items-center gap-unit-xs text-inverse-on-surface/70">
              <Icon name="support_agent" size="sm" />
              <span className="font-mono text-spec-code">1-800-555-STCK</span>
            </div>
          </div>

          {COLUMNS.map(col => (
            <div key={col.title} className="flex flex-col gap-unit-sm">
              <span className="font-display text-label-badge uppercase tracking-wider text-inverse-on-surface/50">
                {col.title}
              </span>
              <ul className="flex flex-col gap-unit-xs">
                {col.links.map(l => (
                  <li key={l}>
                    <a href="#" className="text-body-sm text-inverse-on-surface/75 transition-colors hover:text-inverse-on-surface">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-unit-2xl flex flex-col items-center justify-between gap-unit-sm border-t border-inverse-on-surface/10 pt-unit-lg sm:flex-row">
          <span className="font-mono text-spec-code text-inverse-on-surface/50">
            © {new Date().getFullYear()} Stack Bargains. All rights reserved.
          </span>
          <div className="flex items-center gap-unit-lg">
            <a href="#" className="font-mono text-spec-code text-inverse-on-surface/50 hover:text-inverse-on-surface">Privacy</a>
            <a href="#" className="font-mono text-spec-code text-inverse-on-surface/50 hover:text-inverse-on-surface">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
