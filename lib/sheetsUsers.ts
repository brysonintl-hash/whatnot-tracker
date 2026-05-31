import { google } from 'googleapis';
import type { StoredUser } from './types';

const PW_SHEET = 'pw';
const HEADERS = ['id', 'username', 'password', 'name', 'role', 'status', 'createdAt'];

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSpreadsheetId() {
  return process.env.SALES_SHEET_ID || null;
}

export async function readUsersFromSheet(): Promise<StoredUser[] | null> {
  const auth = getAuth();
  const spreadsheetId = getSpreadsheetId();
  if (!auth || !spreadsheetId) return null;

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${PW_SHEET}!A1:G2000`,
    });

    const rows = res.data.values || [];
    if (rows.length === 0) return [];

    // Skip header row if first cell matches expected header
    const dataRows = rows[0][0] === 'id' ? rows.slice(1) : rows;

    return dataRows
      .map(row => ({
        id: row[0] || '',
        username: row[1] || '',
        password: row[2] || '',
        name: row[3] || '',
        role: (row[4] || 'host') as StoredUser['role'],
        status: (row[5] || 'pending') as StoredUser['status'],
        createdAt: row[6] || new Date().toISOString(),
      }))
      .filter(u => u.id && u.username);
  } catch (e) {
    console.error('readUsersFromSheet error:', e);
    return null;
  }
}

export async function writeUsersToSheet(users: StoredUser[]): Promise<void> {
  const auth = getAuth();
  const spreadsheetId = getSpreadsheetId();
  if (!auth || !spreadsheetId) return;

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const values = [
      HEADERS,
      ...users.map(u => [u.id, u.username, u.password, u.name, u.role, u.status, u.createdAt]),
    ];

    // Clear existing data then write fresh
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${PW_SHEET}!A:G` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PW_SHEET}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } catch (e) {
    console.error('writeUsersToSheet error:', e);
  }
}
