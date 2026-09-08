'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import {
  Avatar, Badge, Button, Card, CardContent, CardDescription, CardEyebrow, CardFooter,
  CardHeader, CardTitle, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, Field, FilterPill, Icon, Input, StatTile,
  StatusDot, Table, TableBody, TableCell, TableHead, TableHeader, TableNumCell, TableRow,
  TableScroll, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';

type Session = { username: string; role: Role; name: string };

// Written out rather than interpolated — Tailwind only generates classes it
// can see as complete strings in the source.
const SURFACES: [string, string][] = [
  ['background', 'bg-background'],
  ['surface-container-lowest', 'bg-surface-container-lowest'],
  ['surface-container-low', 'bg-surface-container-low'],
  ['surface-container', 'bg-surface-container'],
  ['surface-container-high', 'bg-surface-container-high'],
  ['surface-container-highest', 'bg-surface-container-highest'],
  ['surface-variant', 'bg-surface-variant'],
  ['inverse-surface', 'bg-inverse-surface'],
];
const BRAND: [string, string][] = [
  ['primary', 'bg-primary'],
  ['primary-container', 'bg-primary-container'],
  ['primary-fixed', 'bg-primary-fixed'],
  ['secondary', 'bg-secondary'],
  ['tertiary', 'bg-tertiary'],
  ['tertiary-container', 'bg-tertiary-container'],
];
const STATUS: [string, string][] = [
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['error', 'bg-error'],
  ['outline', 'bg-outline'],
  ['outline-variant', 'bg-outline-variant'],
];

const TYPE_SCALE = [
  { cls: 'font-display text-display-lg', name: 'display-lg', spec: 'Barlow Condensed 56/60 · 800', sample: 'Pro-Grade' },
  { cls: 'font-display text-headline-xl', name: 'headline-xl', spec: 'Barlow Condensed 40/44 · 700', sample: 'Hot Deals Ending Soon' },
  { cls: 'font-display text-headline-md', name: 'headline-md', spec: 'Barlow Condensed 24/28 · 700', sample: 'Shop By Pro Category' },
  { cls: 'font-display text-headline-sm', name: 'headline-sm', spec: 'Barlow Condensed 20/24 · 600', sample: 'Cordless Drill Kits' },
  { cls: 'font-display text-price-huge', name: 'price-huge', spec: 'Barlow Condensed 32/32 · 800', sample: '$179.00' },
  { cls: 'font-display text-label-badge uppercase', name: 'label-badge', spec: 'Barlow Condensed 14/16 · 700 · 0.08em', sample: 'Add To Cart' },
  { cls: 'text-body-lg', name: 'body-lg', spec: 'Hanken Grotesk 18/28 · 400', sample: 'Over 10,000 professional-grade power tools.' },
  { cls: 'text-body-md', name: 'body-md', spec: 'Hanken Grotesk 15/22 · 400', sample: 'Default body copy for the interface.' },
  { cls: 'text-body-sm', name: 'body-sm', spec: 'Hanken Grotesk 13/18 · 400', sample: 'Captions, hints and dense table text.' },
  { cls: 'font-mono text-spec-code uppercase', name: 'spec-code', spec: 'JetBrains Mono 12/16 · 500', sample: 'SKU #DW-9821' },
];

const SPACING: [string, string, string][] = [
  ['unit-2xs', '2px', 'w-unit-2xs'],
  ['unit-xs', '4px', 'w-unit-xs'],
  ['unit-sm', '8px', 'w-unit-sm'],
  ['unit-md', '16px', 'w-unit-md'],
  ['unit-lg', '24px', 'w-unit-lg'],
  ['unit-xl', '32px', 'w-unit-xl'],
  ['unit-2xl', '48px', 'w-unit-2xl'],
  ['unit-3xl', '72px', 'w-unit-3xl'],
];

function Section({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-unit-lg">
      <div className="flex flex-col gap-unit-2xs border-b border-outline-variant pb-unit-sm">
        <h2 className="font-display text-headline-md uppercase text-on-surface">{title}</h2>
        <p className="text-body-sm text-on-surface-variant">{caption}</p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ token, cls }: { token: string; cls: string }) {
  return (
    <div className="flex flex-col gap-unit-xs">
      <div className={`h-14 rounded-lg border border-outline-variant ${cls}`} />
      <span className="font-mono text-spec-code text-on-surface-variant">{token}</span>
    </div>
  );
}

export default function DesignSystemPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState('7d');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
    setDark(document.documentElement.classList.contains('dark'));
  }, [router]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="text-body-sm text-on-surface-variant">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-outline-variant bg-inverse-surface px-unit-lg">
          <div>
            <h1 className="font-display text-headline-sm uppercase text-inverse-on-surface">Design System</h1>
            <p className="font-mono text-spec-code text-inverse-on-surface/60">Stack Bargains · v1 foundation</p>
          </div>
          <Button variant="inverse" size="sm" onClick={toggleTheme}>
            <Icon name={dark ? 'light_mode' : 'dark_mode'} size="xs" />
            {dark ? 'Light' : 'Dark'}
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-5xl flex-col gap-unit-2xl px-unit-lg py-unit-xl">

            <Section title="Color" caption="Every token resolves through a CSS variable, so components adapt to light and dark without dark: variants. Toggle the theme above to check both.">
              <div className="flex flex-col gap-unit-lg">
                <div>
                  <CardEyebrow className="mb-unit-sm">Surfaces</CardEyebrow>
                  <div className="grid grid-cols-2 gap-unit-md sm:grid-cols-4">
                    {SURFACES.map(([t, c]) => <Swatch key={t} token={t} cls={c} />)}
                  </div>
                </div>
                <div>
                  <CardEyebrow className="mb-unit-sm">Brand</CardEyebrow>
                  <div className="grid grid-cols-2 gap-unit-md sm:grid-cols-6">
                    {BRAND.map(([t, c]) => <Swatch key={t} token={t} cls={c} />)}
                  </div>
                </div>
                <div>
                  <CardEyebrow className="mb-unit-sm">Status &amp; lines</CardEyebrow>
                  <div className="grid grid-cols-2 gap-unit-md sm:grid-cols-5">
                    {STATUS.map(([t, c]) => <Swatch key={t} token={t} cls={c} />)}
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Typography" caption="Barlow Condensed for headings and figures, Hanken Grotesk for reading, JetBrains Mono for anything that must line up or be read character by character.">
              <div className="flex flex-col divide-y divide-outline-variant">
                {TYPE_SCALE.map(t => (
                  <div key={t.name} className="flex flex-col gap-unit-xs py-unit-md sm:flex-row sm:items-baseline sm:gap-unit-lg">
                    <div className="w-full shrink-0 sm:w-52">
                      <div className="font-mono text-spec-code text-primary">{t.name}</div>
                      <div className="text-body-sm text-on-surface-variant">{t.spec}</div>
                    </div>
                    <div className={`${t.cls} min-w-0 text-on-surface`}>{t.sample}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Spacing" caption="One scale, used for padding, gaps and margins alike. Layout uses flex/grid gap rather than per-element margins.">
              <div className="flex flex-col gap-unit-sm">
                {SPACING.map(([name, px, cls]) => (
                  <div key={name} className="flex items-center gap-unit-md">
                    <span className="w-24 shrink-0 font-mono text-spec-code text-on-surface-variant">{name}</span>
                    <span className={`h-3 rounded-sm bg-primary-container ${cls}`} />
                    <span className="font-mono text-spec-code text-on-surface-variant/70">{px}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Buttons" caption="Condensed uppercase labels, tight radius, a 1px press. Six variants cover every action weight in the app.">
              <div className="flex flex-col gap-unit-lg">
                <div className="flex flex-wrap items-center gap-unit-sm">
                  <Button variant="primary">Add To Cart</Button>
                  <Button variant="secondary">Export CSV</Button>
                  <Button variant="outline">Filter</Button>
                  <Button variant="ghost">Cancel</Button>
                  <Button variant="danger">Delete</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                </div>
                <div className="flex flex-wrap items-center gap-unit-sm">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon" variant="outline" aria-label="Search"><Icon name="search" size="sm" /></Button>
                  <Button variant="primary"><Icon name="download" size="sm" />With Icon</Button>
                </div>
              </div>
            </Section>

            <Section title="Stat tiles" caption="The dashboard's core unit. Accent rail keys the metric family; the sparkline gets an area fill and an emphasized endpoint so the latest value reads first.">
              <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                  inverse label="Gross Volume" value="$918,180" sub="48,060 orders" icon="payments"
                  trend={[4, 6, 5, 8, 7, 11, 9, 14, 12, 15]}
                />
                <StatTile
                  label="Gross Profit" value="$250,868" sub="after COGS" accent="success" icon="trending_up"
                  delta={{ value: '12.4%', direction: 'up' }} trend={[3, 4, 4, 6, 5, 7, 8, 7, 9, 10]}
                />
                <StatTile
                  label="Avg Margin" value="27.3%" sub="profit / revenue" accent="warning" icon="percent"
                  delta={{ value: '1.8%', direction: 'down' }}
                />
                <StatTile label="Inventory Value" value="$3.44M" sub="1,810 total SKUs" accent="info" icon="inventory_2" />
              </div>
            </Section>

            <Section title="Cards" caption="One container, composed from header / content / footer parts. Interactive cards lift on hover; static ones never do.">
              <div className="grid grid-cols-1 gap-unit-md md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardEyebrow>Dewalt · 20V Max XR</CardEyebrow>
                    <CardTitle>1/2-in Brushless Hammer Drill Kit</CardTitle>
                    <CardDescription>Two 5.0Ah batteries, charger and hard case included.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-unit-xs">
                      <Badge tone="spec">2,000 RPM</Badge>
                      <Badge tone="spec">820 UWO</Badge>
                      <Badge tone="spec">2× Batt</Badge>
                    </div>
                  </CardContent>
                  <CardFooter className="justify-between">
                    <span className="font-display text-price-huge text-primary">$179.00</span>
                    <Button size="sm">Add</Button>
                  </CardFooter>
                </Card>

                <Card interactive>
                  <CardHeader>
                    <CardEyebrow>Interactive</CardEyebrow>
                    <CardTitle>Rotary Hammers</CardTitle>
                    <CardDescription>62 products · save up to 45%</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span className="font-mono text-spec-code uppercase">SDS-Plus &amp; SDS-Max</span>
                      <Icon name="arrow_forward" size="sm" className="text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardEyebrow>Shipment #409B</CardEyebrow>
                    <CardTitle>Verified Pro Stock</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-unit-sm">
                    <div className="flex items-center gap-unit-sm">
                      <StatusDot status="success" pulse />
                      <span className="text-body-sm text-on-surface">Packed and staged for pickup</span>
                    </div>
                    <div className="flex items-center gap-unit-sm">
                      <StatusDot status="warning" />
                      <span className="text-body-sm text-on-surface">2 items awaiting verification</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </Section>

            <Section title="Badges & status" caption="Label badges for categories and states; spec badges for SKUs, model numbers and measurements.">
              <div className="flex flex-col gap-unit-md">
                <div className="flex flex-wrap items-center gap-unit-sm">
                  <Badge variant="brand">-38% Off</Badge>
                  <Badge variant="soft">Save Up To 40%</Badge>
                  <Badge variant="success">In Stock</Badge>
                  <Badge variant="warning">Low Stock</Badge>
                  <Badge variant="danger">Out Of Stock</Badge>
                  <Badge variant="neutral">Draft</Badge>
                  <Badge variant="outline">Archived</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-unit-sm">
                  <Badge tone="spec">SKU #MW-2853</Badge>
                  <Badge tone="spec" variant="outline">DCE530B</Badge>
                  <Badge tone="spec" variant="success">2,000 IN-LBS</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-unit-lg">
                  {(['admin', 'manager', 'host', 'shipper', 'employee'] as const).map(r => (
                    <div key={r} className="flex items-center gap-unit-sm">
                      <Avatar name={r} role={r} online={r === 'host'} />
                      <span className="font-mono text-spec-code uppercase text-on-surface-variant">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Forms" caption="Labels are monospace uppercase so they never compete with the value. Focus is a brand ring, error state is a colour change plus a message — never colour alone.">
              <div className="grid grid-cols-1 gap-unit-lg md:grid-cols-3">
                <Field label="Search Inventory" htmlFor="ds-search" hint="Model number, SKU or keyword">
                  <Input id="ds-search" icon="search" placeholder="e.g. DCE530B" />
                </Field>
                <Field label="Show Date" htmlFor="ds-date">
                  <Input id="ds-date" type="date" />
                </Field>
                <Field label="Base Pay Rate" htmlFor="ds-rate" error="Enter an amount greater than zero">
                  <Input id="ds-rate" defaultValue="0" invalid />
                </Field>
              </div>
            </Section>

            <Section title="Tabs & filters" caption="Radix tabs for switching panels; filter pills for narrowing the current view. Different jobs, deliberately different shapes.">
              <div className="flex flex-col gap-unit-lg">
                <Tabs defaultValue="historical">
                  <TabsList>
                    <TabsTrigger value="historical"><Icon name="bar_chart" size="xs" />Historical</TabsTrigger>
                    <TabsTrigger value="calendar"><Icon name="calendar_month" size="xs" />Calendar</TabsTrigger>
                    <TabsTrigger value="map"><Icon name="map" size="xs" />Shipping Map</TabsTrigger>
                  </TabsList>
                  <TabsContent value="historical">
                    <p className="text-body-md text-on-surface-variant">Revenue, profit and margin across every recorded show.</p>
                  </TabsContent>
                  <TabsContent value="calendar">
                    <p className="text-body-md text-on-surface-variant">Shows plotted by date, with host and duration.</p>
                  </TabsContent>
                  <TabsContent value="map">
                    <p className="text-body-md text-on-surface-variant">Order destinations by state.</p>
                  </TabsContent>
                </Tabs>

                <div className="flex flex-wrap items-center gap-unit-xs">
                  {[
                    { v: 'today', l: 'Today' }, { v: '7d', l: 'Last 7 Days' },
                    { v: '30d', l: 'Last 30 Days' }, { v: 'month', l: 'This Month' },
                    { v: 'all', l: 'All Time' },
                  ].map(p => (
                    <FilterPill key={p.v} active={filter === p.v} onClick={() => setFilter(p.v)}>
                      {p.l}
                    </FilterPill>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Tables" caption="Monospace uppercase headers, tabular figures right-aligned, rows that respond on hover. Wide tables scroll inside their own container.">
              <Card className="overflow-hidden">
                <TableScroll>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead className="text-right">Sold</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { id: '1064183999', item: 'DEWALT DCE530B Heat Gun', host: 'Evon', sold: '$81.00', profit: '$8.70', ok: true },
                        { id: '1064185373', item: 'Greenworks 40V Hedge Trimmer', host: 'Jason', sold: '$49.00', profit: '-$6.02', ok: false },
                        { id: '1064188273', item: 'DEWALT 16-Gauge Straight Nails', host: 'Khloe', sold: '$20.00', profit: '$2.69', ok: true },
                      ].map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-spec-code">{r.id}</TableCell>
                          <TableCell className="max-w-[240px] truncate">{r.item}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-unit-sm">
                              <Avatar name={r.host} role="host" size="sm" />
                              {r.host}
                            </span>
                          </TableCell>
                          <TableNumCell>{r.sold}</TableNumCell>
                          <TableNumCell className={r.ok ? 'text-success' : 'text-error'}>{r.profit}</TableNumCell>
                          <TableCell>
                            <Badge variant={r.ok ? 'success' : 'danger'}>{r.ok ? 'Shipped' : 'Review'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              </Card>
            </Section>

            <Section title="Dialog" caption="Radix under the hood — focus trapping, escape to close and scroll locking come for free.">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline"><Icon name="open_in_full" size="sm" />Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>How Tiers Work</DialogTitle>
                    <DialogDescription>
                      Tier is based on profit per hour earned during the stream. The host earns the matching hourly rate for the full show duration.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogBody className="flex flex-col gap-unit-sm">
                    {[
                      { t: 'Tier 1 — Gold', th: '≥ $500/hr profit', p: '$30/hr' },
                      { t: 'Tier 2 — Silver', th: '≥ $400/hr profit', p: '$25/hr' },
                      { t: 'Tier 3 — Bronze', th: '≥ $300/hr profit', p: '$20/hr' },
                    ].map(t => (
                      <div key={t.t} className="flex items-center justify-between rounded-lg bg-surface-container-low px-unit-md py-unit-sm">
                        <div>
                          <div className="font-display text-headline-sm uppercase text-on-surface">{t.t}</div>
                          <div className="font-mono text-spec-code text-on-surface-variant">{t.th}</div>
                        </div>
                        <span className="font-display text-headline-sm text-primary">{t.p}</span>
                      </div>
                    ))}
                  </DialogBody>
                  <DialogFooter>
                    <Button variant="ghost">Close</Button>
                    <Button>Got It</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Section>

          </div>
        </main>
      </div>
    </div>
  );
}
