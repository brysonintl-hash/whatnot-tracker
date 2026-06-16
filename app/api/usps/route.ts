import { NextRequest, NextResponse } from 'next/server';

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;

  const res = await fetch('https://api.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.USPS_CONSUMER_KEY!,
      client_secret: process.env.USPS_CONSUMER_SECRET!,
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`USPS token error ${res.status}: ${err}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

export async function GET(req: NextRequest) {
  const tracking = req.nextUrl.searchParams.get('tracking');
  if (!tracking) return NextResponse.json({ error: 'Missing tracking number' }, { status: 400 });

  try {
    const token = await getToken();
    const res = await fetch(
      `https://api.usps.com/tracking/v3/tracking/${encodeURIComponent(tracking)}?expand=SUMMARY`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error('USPS tracking error:', res.status, JSON.stringify(data));
      return NextResponse.json({ error: `USPS ${res.status}: ${data?.description || data?.message || data?.errors?.[0]?.message || JSON.stringify(data)}` }, { status: res.status });
    }

    // Normalize to a simple shape
    const summary = data.trackSummary;
    return NextResponse.json({
      status: summary?.eventType || 'Unknown',
      description: summary?.eventDescription || '',
      city: summary?.eventCity || '',
      state: summary?.eventState || '',
      date: summary?.eventDate || '',
      time: summary?.eventTime || '',
      raw: data,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
