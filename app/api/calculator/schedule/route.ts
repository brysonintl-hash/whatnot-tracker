import { NextRequest, NextResponse } from 'next/server';
import { getSalesData } from '@/lib/sheets';
import { readData, writeData } from '@/lib/storage';
import type { SaleOrder } from '@/lib/sampleData';
import { aggregateHostDays } from '@/lib/hostDay';

type TierMap = Record<string, number>;

// "YYYY-MM-DD" → "M/D/YY"  (matches the tab format in SaleOrder)
function isoToTab(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y - 2000}`;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateISO = searchParams.get('date');
  const tiers = readData<TierMap>('host-tiers.json', {});

  if (!dateISO) {
    const hosts = Object.entries(tiers).map(([name, tierRate]) => ({
      name, tierRate, profitPerHour: null, marginPct: null,
    }));
    return NextResponse.json({ hosts });
  }

  try {
    const allOrders: SaleOrder[] = await getSalesData();
    const tabDate = isoToTab(dateISO);
    const dayOrders = allOrders.filter(o => o.tab === tabDate && o.host);

    if (dayOrders.length === 0) {
      return NextResponse.json({ hosts: [] });
    }

    const hosts = aggregateHostDays(dayOrders).map(d => {
      tiers[d.host] = d.tierRate;
      return {
        name: d.host,
        tierRate: d.tierRate,
        profitPerHour: d.profitPerHour !== null && d.profitPerHour > 0 ? Math.round(d.profitPerHour) : null,
        marginPct: d.marginPct !== null ? Math.round(d.marginPct * 10) / 10 : null,
      };
    });

    writeData('host-tiers.json', tiers);
    return NextResponse.json({ hosts });
  } catch (e) {
    // Previously this fell back to the stored tier list, which the UI then
    // labelled "Performed this day" — so a failed read looked like a real
    // (and wrong) roster, quietly dropping hosts who actually worked that
    // day. Say nothing rather than say something false; the page shows the
    // error instead.
    console.error('calculator/schedule: sales read failed', e);
    return NextResponse.json({
      hosts: [],
      error: 'Could not read the sales sheet, so the hosts for this date are unknown. Pick the host manually, or try again in a moment.',
    });
  }
}
