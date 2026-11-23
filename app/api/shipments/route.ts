import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasToken } from '@/lib/whatnot/client';
import * as wnStore from '@/lib/whatnot/store';
import { queueSync, refreshQueue } from '@/lib/whatnot/shipQueue';
import { buildRows, defaultScope, homeScope, inScope, packingOrder, scopesOf } from '@/lib/shipmentRows';
import { canLabel } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

/**
 * Whatnot shipments from one show (`?scope=show:<id>`), the marketplace
 * (`marketplace`) or everything (`all`) — the newest show by default — with
 * who made each label here and anything reported against it, plus the list
 * of shows to pick from. `?shipment=` opens on that parcel's show, for links
 * that point at one parcel.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canLabel(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Re-list in the background; this request answers from what's stored.
  if (hasToken()) refreshQueue({ force: req.nextUrl.searchParams.get('refresh') === '1' }).catch(() => {});

  const all = buildRows();
  const scopes = scopesOf(all, new Map(wnStore.getShows().map(s => [s.id, s])));

  const asked = req.nextUrl.searchParams.get('scope');
  let scope = asked && scopes.some(x => x.id === asked) ? asked : defaultScope(scopes);
  const wanted = req.nextUrl.searchParams.get('shipment');
  const target = wanted ? all.find(r => r.shipmentId === wanted) : undefined;
  if (target && !inScope(target, scope)) scope = homeScope(target);

  const rows = all.filter(r => inScope(r, scope)).sort(packingOrder);
  // Parcels whose show isn't known yet appear only under "All" until it is.
  const unmatched = all.filter(r => !r.home).length;

  return NextResponse.json({ rows, scopes, scope, unmatched, sync: queueSync(), whatnot: hasToken() });
}
