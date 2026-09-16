import { google } from 'googleapis';

// Reads the live-selling inventory tab that hosts run from.
//
// Columns are matched by HEADER NAME, not by position: this sheet has hidden
// columns and gets rearranged, and a fixed A/B/C mapping silently reads the
// wrong column the moment someone inserts one. Anything not found just comes
// back empty rather than taking down the whole page.

export type RunItem = {
  modelNum: string;
  description: string;
  image: string;
  link: string;
  upc: string;
  asin: string;
  retail: number;
  cost: number;
  startPrice: number;
  qty: number;
  amz: number;
  wn: number;
  ws: number;
  remaining: number; // the sheet's "Total" column — what's actually left to sell
  sourceRows: number; // how many sheet rows were combined into this entry
};

export type RunInventoryResult = {
  items: RunItem[];
  tab: string;
  demo: boolean;
  error?: string;
  hint?: string;
  serviceAccount?: string;
};

// Jason's "Inventory - 08092026" workbook. Not a secret — access is controlled
// by who the sheet is shared with, not by hiding the id.
const DEFAULT_SHEET_ID = '1lC3w7YVVYQWxX6T3MMmtSZJNjyykXKIW4yT1XYp_qZc';
const PREFERRED_TAB = 'TOOLS';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Finds a column by header name: exact match first, then a cautious prefix match. */
function findCol(headers: string[], candidates: string[]): number {
  const H = headers.map(norm);
  for (const c of candidates) {
    const i = H.indexOf(norm(c));
    if (i !== -1) return i;
  }
  for (const c of candidates) {
    const n = norm(c);
    if (n.length < 3) continue; // "mo" would swallow "model"
    const i = H.findIndex(h => h.length >= 3 && (h.startsWith(n) || n.startsWith(h)));
    if (i !== -1) return i;
  }
  return -1;
}

function num(val: unknown): number {
  if (typeof val === 'number') return val;
  const s = String(val ?? '').replace(/[$,%\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return '';
  return String(row[idx] ?? '').trim();
}

export async function getRunInventory(): Promise<RunInventoryResult> {
  const auth = getAuth();
  if (!auth) {
    return { items: demoItems(), tab: 'DEMO', demo: true };
  }

  const spreadsheetId = process.env.RUN_SHEET_ID || DEFAULT_SHEET_ID;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  try {
    const sheets = google.sheets({ version: 'v4', auth });

    // Resolve the tab first — the workbook has a dozen tabs and the one we
    // want may get renamed, so fall back to the first tab rather than 404.
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const titles = (meta.data.sheets || []).map(s => s.properties?.title || '').filter(Boolean);
    const wanted = process.env.RUN_SHEET_TAB || PREFERRED_TAB;
    const tab = titles.find(t => norm(t) === norm(wanted)) || titles[0] || wanted;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!A1:AZ5000`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) {
      return { items: [], tab, demo: false, error: `The "${tab}" tab looks empty.` };
    }

    const headers = (rows[0] || []).map(h => String(h ?? ''));
    const col = {
      model: findCol(headers, ['Model #', 'Model', 'Model Number', 'Model No']),
      desc: findCol(headers, ['Description', 'Item Name', 'Item', 'Product Name', 'Product', 'Title', 'Name']),
      image: findCol(headers, ['Image', 'Photo', 'Picture']),
      link: findCol(headers, ['Link', 'URL']),
      upc: findCol(headers, ['UPC', 'Barcode']),
      asin: findCol(headers, ['ASIN']),
      retail: findCol(headers, ['Retail', 'Retail Price', 'MSRP']),
      cost: findCol(headers, ['Cost', 'Unit Cost', 'Our Cost']),
      start: findCol(headers, ['Start Price', 'Starting Price', 'Start Bid', 'Starting Bid']),
      qty: findCol(headers, ['Qty', 'Quantity']),
      amz: findCol(headers, ['AMZ', 'Amazon']),
      wn: findCol(headers, ['WN', 'Whatnot']),
      ws: findCol(headers, ['WS', 'Whatnot Shop']),
      total: findCol(headers, ['Total', 'Remaining', 'Available', 'Left']),
    };

    if (col.model === -1) {
      return {
        items: [],
        tab,
        demo: false,
        error: `Couldn't find a "Model #" column in the "${tab}" tab.`,
        hint: `Columns found: ${headers.filter(Boolean).slice(0, 20).join(', ')}`,
      };
    }

    // Same model can appear on more than one row (separate pallets/lots) —
    // roll those up so the host sees one line with the true amount on hand.
    const byModel = new Map<string, RunItem>();

    for (const row of rows.slice(1)) {
      const modelNum = cell(row, col.model);
      if (!modelNum || modelNum === '-') continue;

      const qty = num(row[col.qty]);
      const amz = num(row[col.amz]);
      const wn = num(row[col.wn]);
      const ws = num(row[col.ws]);
      // Prefer the sheet's own Total column; if it's missing, derive it.
      const remaining = col.total !== -1 ? num(row[col.total]) : qty - amz - wn - ws;

      const existing = byModel.get(modelNum);
      if (existing) {
        existing.qty += qty;
        existing.amz += amz;
        existing.wn += wn;
        existing.ws += ws;
        existing.remaining += remaining;
        existing.sourceRows += 1;
        existing.description ||= cell(row, col.desc);
        existing.image ||= cell(row, col.image);
        existing.cost ||= num(row[col.cost]);
        existing.retail ||= num(row[col.retail]);
        existing.startPrice ||= num(row[col.start]);
        continue;
      }

      byModel.set(modelNum, {
        modelNum,
        description: cell(row, col.desc),
        image: cell(row, col.image),
        link: cell(row, col.link),
        upc: cell(row, col.upc),
        asin: cell(row, col.asin),
        retail: num(row[col.retail]),
        cost: num(row[col.cost]),
        startPrice: num(row[col.start]),
        qty, amz, wn, ws, remaining,
        sourceRows: 1,
      });
    }

    return { items: Array.from(byModel.values()), tab, demo: false };
  } catch (e) {
    const err = e as { code?: number; message?: string };
    const denied = err.code === 403 || err.code === 404;
    return {
      items: [],
      tab: process.env.RUN_SHEET_TAB || PREFERRED_TAB,
      demo: false,
      error: denied
        ? 'The app does not have access to that inventory sheet yet.'
        : `Could not read the inventory sheet: ${err.message || 'unknown error'}`,
      hint: denied
        ? 'Open the sheet in Google Sheets, click Share, and give this service account Viewer access.'
        : undefined,
      serviceAccount: denied ? serviceAccount : undefined,
    };
  }
}

// Only used when Google Sheets credentials aren't configured (local dev).
// The UI labels this clearly so it's never mistaken for live stock.
function demoItems(): RunItem[] {
  const raw: [string, string, number, number, number, number, number, number, number][] = [
    ['48-20-8946', 'SHOCKWAVE Carbide Multi-Material Drill Bit Set', 76.97, 26.94, 31.0, 100, 0, 1, 99],
    ['48-20-8972', 'SDS-Plus Carbide Hammer Drill Bit Kit', 119.0, 41.65, 48.0, 8, 0, 3, 5],
    ['48-20-8988', 'SHOCKWAVE Impact Duty Titanium Drill Bit Set', 23.97, 8.39, 10.0, 960, 0, 114, 846],
    ['48-20-8990', 'Titanium Drill Bit, 1/8 in.', 17.47, 6.11, 7.0, 45, 0, 8, 37],
    ['48-20-8992', 'Titanium Drill Bit, 3/16 in.', 18.47, 6.46, 8.0, 240, 10, 32, 198],
    ['48-20-8993', 'Titanium Drill Bit, 7/32 in.', 19.97, 6.99, 8.0, 25, 0, 17, 8],
    ['48-20-8994', 'Titanium Drill Bit, 1/4 in.', 22.47, 7.86, 9.0, 20, 0, 5, 15],
    ['48-20-8995', 'Tile & Stone Carbide Bit, 5/16 in.', 28.47, 9.96, 12.0, 35, 0, 15, 20],
    ['48-20-8998', 'SHOCKWAVE Impact Duty Bit, 3/8 in.', 27.47, 9.61, 11.0, 480, 415, 51, 14],
    ['48-20-9000', 'SHOCKWAVE Impact Duty Bit, 1/16 in.', 4.77, 1.67, 2.0, 219, 1, 113, 105],
    ['48-20-9009', 'SHOCKWAVE Impact Duty Bit, 5/64 in.', 8.47, 2.96, 4.0, 36, 0, 28, 8],
  ];
  return raw.map(([modelNum, description, retail, cost, startPrice, qty, amz, wn, remaining]) => ({
    modelNum, description, image: '', link: '', upc: '', asin: '',
    retail, cost, startPrice, qty, amz, wn, ws: 0, remaining, sourceRows: 1,
  }));
}
