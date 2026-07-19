import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

// Dedicated Feature Requests spreadsheet (shared with service account)
const FEATURE_SHEET_ID = '1f3KoC0ofvo7xDKO-WIT8EElxVD9u2OYks5I-TlYSv2A';
const HEADERS = ['Date', 'User', 'Role', 'Category', 'Feature Title', 'Description', 'Priority', 'Status'];

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
  if (!auth) return NextResponse.json({ error: 'Google credentials not configured' }, { status: 500 });

  const sheets = google.sheets({ version: 'v4', auth });
  const row = [
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }),
    name, role, category, title, description, priority, 'Open',
  ];

  try {
    // Get the first sheet name from the spreadsheet
    const meta = await sheets.spreadsheets.get({ spreadsheetId: FEATURE_SHEET_ID });
    const firstSheet = meta.data.sheets?.[0]?.properties?.title ?? 'Sheet1';

    // Check if headers exist (row 1)
    const headersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: FEATURE_SHEET_ID,
      range: `'${firstSheet}'!A1:H1`,
    });
    const firstRow = headersRes.data.values?.[0];
    if (!firstRow || firstRow.length === 0) {
      // Add headers to row 1
      await sheets.spreadsheets.values.update({
        spreadsheetId: FEATURE_SHEET_ID,
        range: `'${firstSheet}'!A1:H1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] },
      });
    }

    // Append the new row
    await sheets.spreadsheets.values.append({
      spreadsheetId: FEATURE_SHEET_ID,
      range: `'${firstSheet}'!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Feature request error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
