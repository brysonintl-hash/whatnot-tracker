import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const key = rawKey?.replace(/\\n/g, '\n');
  const salesId = process.env.SALES_SHEET_ID;
  const demoMode = process.env.DEMO_MODE;

  if (!email || !key) {
    return NextResponse.json({ status: 'missing_credentials', hasEmail: !!email, hasKey: !!rawKey, demoMode });
  }

  try {
    const auth = new google.auth.JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: salesId! });

    const allTabs = meta.data.sheets?.map(s => s.properties?.title) || [];
    const dateTabs = allTabs.filter(t => t && /^\d+\/\d+\/\d+$/.test(t as string)) as string[];

    // Read first 5 rows from the most recent date tab to diagnose column structure
    let sampleRows: any[][] = [];
    let rowReadError = '';
    let rowTabUsed = '';
    if (dateTabs.length > 0) {
      rowTabUsed = dateTabs[dateTabs.length - 1]; // most recent tab
      try {
        const rowRes = await sheets.spreadsheets.values.get({
          spreadsheetId: salesId!,
          range: `'${rowTabUsed}'!A1:M8`,
        });
        sampleRows = rowRes.data.values || [];
      } catch (e: any) {
        rowReadError = e.message;
      }
    }

    return NextResponse.json({
      status: 'success',
      demoMode,
      email,
      sheetTitle: meta.data.properties?.title,
      allTabs,
      dateTabs,
      rowDiagnostic: {
        tabRead: rowTabUsed,
        rowCount: sampleRows.length,
        rows: sampleRows,
        error: rowReadError || null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e.message, demoMode, email });
  }
}
