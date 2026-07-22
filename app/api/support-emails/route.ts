import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailToken, getHeader } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['admin', 'manager', 'host', 'shipper'];

export async function GET() {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GMAIL_CLIENT_ID) {
    return NextResponse.json({ error: 'Gmail not configured' }, { status: 503 });
  }

  try {
    const token = await getGmailToken();

    const searchRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:support@whatnot.zendesk.com&maxResults=50',
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const searchData = await searchRes.json();

    if (!searchData.messages?.length) return NextResponse.json([]);

    const emails = await Promise.all(
      searchData.messages.map(async (msg: { id: string }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata` +
          `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );
        const d = await r.json();
        const headers: { name: string; value: string }[] = d.payload?.headers ?? [];
        return {
          id: msg.id,
          subject: getHeader(headers, 'Subject'),
          from: getHeader(headers, 'From'),
          date: getHeader(headers, 'Date'),
          snippet: (d.snippet ?? '') as string,
          unread: ((d.labelIds ?? []) as string[]).includes('UNREAD'),
        };
      })
    );

    return NextResponse.json(emails);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
