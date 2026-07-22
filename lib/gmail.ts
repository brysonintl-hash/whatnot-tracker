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
  if (text) return text;
  if (html) {
    return html
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
      .trim();
  }
  return '';
}
