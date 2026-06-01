import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAssignments } from '@/lib/shipmentStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ count: 0 });

  const count = getAssignments().filter(
    a => a.assignedTo === session.username && a.status !== 'resolved'
  ).length;

  return NextResponse.json({ count });
}
