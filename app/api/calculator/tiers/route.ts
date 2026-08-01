import { NextRequest, NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

type TierMap = Record<string, number>; // hostName -> tierRate

export async function GET() {
  const tiers = readData<TierMap>('host-tiers.json', {});
  return NextResponse.json(tiers);
}

export async function POST(req: NextRequest) {
  const { hostName, tierRate } = await req.json();
  if (!hostName || tierRate == null) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const tiers = readData<TierMap>('host-tiers.json', {});
  tiers[hostName] = Number(tierRate);
  writeData('host-tiers.json', tiers);
  return NextResponse.json({ success: true });
}
