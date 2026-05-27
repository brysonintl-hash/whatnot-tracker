import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const key = rawKey?.replace(/\\n/g, '\n');
  const salesId = process.env.SALES_SHEET_ID;
  const demoMode = process.env.DEMO_MODE;

  if (!email || !key) {
    return NextResponse.json({
      status: 'missing_credentials',
      hasEmail: !!email,
      hasKey: !!rawKey,
      demoMode,
    });
  }

  try {
    const auth = new google.auth.JWT({
      email, key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: salesId! });

    return NextResponse.json({
      status: 'success',
      demoMode,
      email,
      sheetTitle: meta.data.properties?.title,
      tabs: meta.data.sheets?.map(s => s.properties?.title),
    });
  } catch (e: any) {
    return NextResponse.json({
      status: 'error',
      error: e.message,
      demoMode,
      email,
    });
  }
}
