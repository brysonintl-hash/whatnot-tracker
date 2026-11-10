import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers } from '@/lib/userStore';
import { isManager } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * Who a shipment can be handed to: hosts and shippers, name and role only.
 * /api/users is admin-only and returns whole accounts; managers assign
 * shipments too, so they get this narrower list.
 */
export async function GET() {
  const session = await getSession();
  if (!session || !isManager(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const people = (await getAllUsers())
    .filter(u => (u.role === 'host' || u.role === 'shipper') && u.status !== 'pending')
    .map(u => ({ username: u.username, name: u.name, role: u.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json(people);
}
