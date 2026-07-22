import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailToken, extractBody } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'manager', 'host', 'shipper'];

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = await getGmailToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${params.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const d = await r.json();
    const body = extractBody(d.payload);
    return NextResponse.json({ body });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
