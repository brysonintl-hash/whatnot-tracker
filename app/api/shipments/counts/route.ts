import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAssignments } from '@/lib/shipmentStore';
import { getClaimCounts } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

// Everything under Shipments that still needs someone, in one call: the
// sidebar badges this on every page, so five separate fetches would be five
// round trips per poll.
export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assignments = getAssignments();
  const shipments = assignments.filter(a => a.status !== 'resolved').length;
  const claims = await getClaimCounts();

  const total = shipments + Object.values(claims).reduce((a, b) => a + b, 0);
  return NextResponse.json({ shipments, claims, total });
}
