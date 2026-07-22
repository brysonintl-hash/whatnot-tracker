import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailToken, getHeader } from '@/lib/gmail';
import { getAllTicketMeta } from '@/lib/ticketStore';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'host', 'shipper'];

export async function GET() {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.GMAIL_CLIENT_ID) {
    return NextResponse.json({ error: 'Gmail not configured' }, { status: 503 });
  }

  try {
    const token = await getGmailToken();
    const ticketMeta = getAllTicketMeta();

    const searchRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/threads?q=from:support@whatnot.zendesk.com&maxResults=50',
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const searchData = await searchRes.json();
    if (!searchData.threads?.length) return NextResponse.json([]);

    const threads = await Promise.all(
      searchData.threads.map(async (t: { id: string; snippet: string }) => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata` +
          `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=Message-ID`,
          { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );
        const d = await r.json();
        const messages: any[] = d.messages ?? [];
        const firstMsg = messages[0];
        const lastMsg = messages[messages.length - 1];
        const firstHeaders: { name: string; value: string }[] = firstMsg?.payload?.headers ?? [];
        const lastHeaders: { name: string; value: string }[] = lastMsg?.payload?.headers ?? [];
        const allLabels: string[] = messages.flatMap((m: any) => m.labelIds ?? []);
        const hasUnread = allLabels.includes('UNREAD');
        const meta = ticketMeta[t.id];

        return {
          id: t.id,
          subject: getHeader(firstHeaders, 'Subject'),
          from: getHeader(firstHeaders, 'From'),
          firstDate: getHeader(firstHeaders, 'Date'),
          lastDate: getHeader(lastHeaders, 'Date'),
          snippet: t.snippet,
          unread: hasUnread,
          messageCount: messages.length,
          // ticket metadata
          status: meta?.status ?? 'new',
          priority: meta?.priority ?? 'normal',
          assignedTo: meta?.assignedTo ?? null,
          noteCount: meta?.notes?.length ?? 0,
        };
      })
    );

    // Sort: unresolved first by last date, resolved last
    threads.sort((a, b) => {
      const aResolved = a.status === 'resolved' || a.status === 'closed';
      const bResolved = b.status === 'resolved' || b.status === 'closed';
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      return new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime();
    });

    return NextResponse.json(threads);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
