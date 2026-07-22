import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getGmailToken, getHeader, buildRawEmail } from '@/lib/gmail';
import { upsertTicket } from '@/lib/ticketStore';

export const dynamic = 'force-dynamic';

const ALLOWED = ['admin', 'manager', 'host', 'shipper'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || !ALLOWED.includes(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { body } = await req.json() as { body: string };
  if (!body?.trim()) return NextResponse.json({ error: 'Reply body required' }, { status: 400 });

  try {
    const token = await getGmailToken();

    // Fetch thread to get last message details for proper threading
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${params.id}?format=metadata` +
      `&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID&metadataHeaders=References`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const thread = await threadRes.json();
    const messages: any[] = thread.messages ?? [];
    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];
    const firstHeaders: { name: string; value: string }[] = firstMsg?.payload?.headers ?? [];
    const lastHeaders: { name: string; value: string }[] = lastMsg?.payload?.headers ?? [];

    const subject = getHeader(firstHeaders, 'Subject');
    const lastMsgId = getHeader(lastHeaders, 'Message-ID');
    const existingRefs = getHeader(lastHeaders, 'References');
    const replyTo = getHeader(firstHeaders, 'From'); // reply to original sender (Zendesk)

    const raw = buildRawEmail({
      to: 'support@whatnot.zendesk.com',
      from: process.env.GMAIL_USER_EMAIL || 'brysonintl@gmail.com',
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      inReplyTo: lastMsgId || undefined,
      references: existingRefs
        ? `${existingRefs} ${lastMsgId}`.trim()
        : lastMsgId || undefined,
      body: body.trim(),
    });

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, threadId: params.id }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json();
      throw new Error(err.error?.message || 'Send failed');
    }

    // Auto-set status to "pending" (awaiting customer reply) after we respond
    upsertTicket(params.id, { status: 'pending' });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
