let _cache: { token: string; exp: number } | null = null;

export async function getGmailToken(): Promise<string> {
  if (_cache && Date.now() < _cache.exp - 60_000) return _cache.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gmail auth failed: ' + JSON.stringify(data));
  _cache = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export function getHeader(headers: { name: string; value: string }[], name: string) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function cleanBody(raw: string): string {
  let body = raw;
  // Strip Zendesk/email footers and quoted replies
  const cutPatterns = [
    /\n?##-? ?Please type your reply above this line[\s\S]*/i,
    /\n?\[Conversation ID:[\s\S]*/i,
    /\n?You are receiving this (email|notification) because[\s\S]*/i,
    /\n?This email was sent by Whatnot[\s\S]*/i,
    /\n?On .{5,80}wrote:\s*[\s\S]*/,   // strip quoted reply
    /\n?_{5,}[\s\S]*/,                  // strip ---- dividers and below
  ];
  for (const pat of cutPatterns) {
    const match = body.search(pat);
    if (match !== -1) body = body.substring(0, match);
  }
  return body.trim();
}

export function extractBody(payload: any): string {
  let text = '';
  let html = '';
  function walk(part: any) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
    if (part.parts) for (const p of part.parts) walk(p);
  }
  walk(payload);
  const raw = text || (html
    ? html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<li>/gi, '\n• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : '');
  return cleanBody(raw);
}

export function buildRawEmail({
  to, from, subject, inReplyTo, references, body,
}: {
  to: string; from: string; subject: string;
  inReplyTo?: string; references?: string;
  body: string; threadId?: string;
}): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    '',
    body,
  ].filter((l): l is string => l !== null);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}
