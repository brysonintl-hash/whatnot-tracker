import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getRunTotalsByDate } from '@/lib/runSheetStore';
import { getAllUsers } from '@/lib/userStore';

export const dynamic = 'force-dynamic';

/**
 * Items *run* per show — sold and unsold.
 *
 * The WN sales sheet can't answer this: every row there is a completed order,
 * so an item that ran and didn't sell leaves no row behind. The Run in
 * Livestream sheet is the one place a host records what actually went up, so
 * that's the source here. Dates with no run sheet simply come back absent,
 * and the card falls back to "not tracked" rather than guessing.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const totals = getRunTotalsByDate(); // date -> username -> units run

  // Run sheets are keyed by login username; the sales sheet (and so the
  // performance cards) identify a host by display name. Translate.
  const displayName: Record<string, string> = {};
  for (const u of await getAllUsers()) displayName[u.username] = u.name || u.username;

  const byDate: Record<string, Record<string, number>> = {};
  for (const [date, byUser] of Object.entries(totals)) {
    for (const [username, ran] of Object.entries(byUser)) {
      const key = (displayName[username] ?? username).toLowerCase().trim();
      if (!byDate[date]) byDate[date] = {};
      byDate[date][key] = (byDate[date][key] ?? 0) + ran;
    }
  }

  return NextResponse.json({ byDate });
}
