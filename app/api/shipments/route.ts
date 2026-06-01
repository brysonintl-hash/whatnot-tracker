import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getShipmentData } from '@/lib/sheets';
import { getAssignments } from '@/lib/shipmentStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [shipments, assignments] = await Promise.all([
    getShipmentData(),
    Promise.resolve(getAssignments()),
  ]);

  const assignMap = new Map(assignments.map(a => [`${a.shipmentId}|${a.tab}`, a]));

  const result = shipments.map(s => ({
    ...s,
    assignment: assignMap.get(`${s.shipmentId}|${s.tab}`) ?? null,
  }));

  return NextResponse.json(result);
}
