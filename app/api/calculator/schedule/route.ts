import { NextRequest, NextResponse } from 'next/server';
import { getSalesData } from '@/lib/sheets';
import { readData, writeData } from '@/lib/storage';
import type { SaleOrder } from '@/lib/sampleData';

type TierMap = Record<string, number>;

const PAY_TIERS = [
  { min: 500, pay: 30 },
  { min: 400, pay: 25 },
  { min: 300, pay: 20 },
];

function getPayRate(pph: number): number {
  return PAY_TIERS.find(t => pph >= t.min)?.pay ?? 20;
}

// "YYYY-MM-DD" → "M/D/YY"  (matches the tab format in SaleOrder)
function isoToTab(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y - 2000}`;
}

function parseTimestamp(ts: string): number | null {
  if (!ts) return null;
  const s = ts.trim();
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[\sT](\d{1,2}):(\d{2}):(\d{2})/);
  if (iso) {
    const [, yr, mo, dy, hr, min, sec] = iso;
    const d = new Date(`${yr}-${mo}-${dy}T${hr.padStart(2, '0')}:${min}:${sec}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(\s*[AP]M)?$/i);
  if (us) {
    let h = parseInt(us[4]);
    const ampm = us[7]?.trim().toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const d = new Date(parseInt(us[3]), parseInt(us[1]) - 1, parseInt(us[2]), h, parseInt(us[5]), parseInt(us[6]));
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 40000 && serial < 60000) {
      const d = new Date((serial - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.getTime();
  return null;
}

const MAX_GAP_MS = 2 * 3600000;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateISO = searchParams.get('date');
  const tiers = readData<TierMap>('host-tiers.json', {});

  if (!dateISO) {
    const hosts = Object.entries(tiers).map(([name, tierRate]) => ({ name, tierRate, profitPerHour: null }));
    return NextResponse.json({ hosts });
  }

  try {
    const allOrders: SaleOrder[] = await getSalesData();
    const tabDate = isoToTab(dateISO);
    const dayOrders = allOrders.filter(o => o.tab === tabDate && o.host);

    if (dayOrders.length === 0) {
      return NextResponse.json({ hosts: [] });
    }

    // Group by host — compute profit + timestamps for duration
    const hostMap: Record<string, { profit: number; timestamps: number[] }> = {};
    for (const o of dayOrders) {
      if (!hostMap[o.host]) hostMap[o.host] = { profit: 0, timestamps: [] };
      hostMap[o.host].profit += o.profit;
      const ts = parseTimestamp(o.timestamp);
      if (ts !== null) hostMap[o.host].timestamps.push(ts);
    }

    const hosts = Object.entries(hostMap).map(([name, data]) => {
      let durationHours = 0;
      if (data.timestamps.length >= 2) {
        const sorted = [...data.timestamps].sort((a, b) => a - b);
        let dur = 0;
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i] - sorted[i - 1];
          if (gap <= MAX_GAP_MS) dur += gap;
        }
        durationHours = dur / 3600000;
      }
      const pph = durationHours > 0 ? data.profit / durationHours : 0;
      const tierRate = getPayRate(pph);
      tiers[name] = tierRate;
      return { name, tierRate, profitPerHour: pph > 0 ? Math.round(pph) : null };
    });

    writeData('host-tiers.json', tiers);
    return NextResponse.json({ hosts });
  } catch {
    // Fallback to stored tiers if sales data unavailable
    const hosts = Object.entries(tiers).map(([name, tierRate]) => ({ name, tierRate, profitPerHour: null }));
    return NextResponse.json({ hosts });
  }
}
