import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) return null;
  return new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

export async function POST(req: NextRequest) {
  const token = (await cookies()).get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
  let name = 'Unknown';
  let role = 'unknown';
  try {
    const { payload } = await jwtVerify(token, secret);
    name = (payload.name as string) || (payload.username as string) || 'Unknown';
    role = (payload.role as string) || 'unknown';
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { title, category, description, priority } = await req.json();
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
  }

  const auth = getAuth();
  const spreadsheetId = process.env.SALES_SHEET_ID;
  if (!auth || !spreadsheetId) {
    return NextResponse.json({ error: 'Sheets not configured' }, { status: 500 });
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const TAB = 'Feature Requests';
  const row = [
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    name, role, category, title, description, priority,
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${TAB}'!A:G`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return NextResponse.json({ success: true });
  } catch {
    // Sheet probably doesn't exist — create it, add headers, then append
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const exists = meta.data.sheets?.some(s => s.properties?.title === TAB);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId, range: `'${TAB}'!A1:G1`, valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['Date', 'User', 'Role', 'Category', 'Feature Title', 'Description', 'Priority']] },
        });
      }
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `'${TAB}'!A:G`, valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
      return NextResponse.json({ success: true });
    } catch (e2) {
      return NextResponse.json({ error: String(e2) }, { status: 500 });
    }
  }
}
