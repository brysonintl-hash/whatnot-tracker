import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSalesData } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

/**
 * The distinct host names in the WN sheet, newest shows first.
 *
 * User Management uses this to populate the "host stats" picker, so an admin
 * links an account by choosing a name that genuinely exists in the sheet
 * rather than typing one and silently mismatching it.
 */
export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const orders = await getSalesData();

    // Count shows per host so the picker can show who is actually active.
    const seen = new Map<string, { host: string; orders: number; tabs: Set<string> }>();
    for (const o of orders) {
      const host = (o.host ?? '').trim();
      if (!host) continue;
      const key = host.toLowerCase();
      let e = seen.get(key);
      if (!e) { e = { host, orders: 0, tabs: new Set() }; seen.set(key, e); }
      e.orders++;
      if (o.tab) e.tabs.add(o.tab);
    }

    const hosts = Array.from(seen.values())
      .map(e => ({ host: e.host, orders: e.orders, shows: e.tabs.size }))
      .sort((a, b) => b.shows - a.shows || a.host.localeCompare(b.host));

    return NextResponse.json({ hosts });
  } catch (e) {
    console.error('api/hosts: sales read failed', e);
    return NextResponse.json(
      { hosts: [], error: 'Could not read the sales sheet, so host names are unavailable right now.' },
      { status: 200 },
    );
  }
}
