import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByUsername } from '@/lib/userStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });

  // hostName is looked up per request rather than baked into the JWT: an admin
  // linking or re-linking an account should take effect immediately, not after
  // the host next signs in.
  const user = await findByUsername(session.username);
  return NextResponse.json({ ...session, hostName: user?.hostName ?? null });
}
