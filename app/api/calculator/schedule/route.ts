import { NextRequest, NextResponse } from 'next/server';
import { getEntries } from '@/lib/timekeepingStore';
import { readData } from '@/lib/storage';

type TierMap = Record<string, number>;

// Convert "YYYY-MM-DD" → "M/D/YYYY" (timekeeping date format)
function isoToUsDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${y}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateISO = searchParams.get('date'); // e.g. "2026-07-16"

  const entries = getEntries();
  const tiers = readData<TierMap>('host-tiers.json', {});

  if (dateISO) {
    const usDate = isoToUsDate(dateISO);
    const hostEntries = entries.filter(e => e.role === 'host' && e.date === usDate);
    const seen = new Set<string>();
    const hosts = hostEntries
      .filter(e => { if (seen.has(e.name)) return false; seen.add(e.name); return true; })
      .map(e => ({ name: e.name, tierRate: tiers[e.name] ?? 20 }));
    return NextResponse.json({ hosts });
  }

  // No date → return all known hosts from tiers + recent entries
  const seen = new Set<string>();
  const allHosts = entries
    .filter(e => e.role === 'host')
    .filter(e => { if (seen.has(e.name)) return false; seen.add(e.name); return true; })
    .map(e => ({ name: e.name, tierRate: tiers[e.name] ?? 20 }));
  return NextResponse.json({ hosts: allHosts });
}
