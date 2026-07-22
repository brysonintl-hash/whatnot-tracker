import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailToken, getHeader, extractBody } from '@/lib/gmail';
import { getTicket } from '@/lib/ticketStore';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'host', 'shipper'];

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = await getGmailToken();
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${params.id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const d = await r.json();

    const messages = (d.messages ?? []).map((msg: any) => {
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
      return {
        id: msg.id,
        messageId: getHeader(headers, 'Message-ID'),
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        date: getHeader(headers, 'Date'),
        subject: getHeader(headers, 'Subject'),
        body: extractBody(msg.payload),
        unread: ((msg.labelIds ?? []) as string[]).includes('UNREAD'),
      };
    });

    const ticket = getTicket(params.id);

    return NextResponse.json({ messages, ticket });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
