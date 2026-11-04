import { google } from 'googleapis';
import { sampleSales, sampleInventory, SaleOrder, InventoryItem } from './sampleData';

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

function isDemo() {
  return process.env.DEMO_MODE === 'true' || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
}

function parseMoney(val: string | undefined): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,%]/g, '')) || 0;
}

function parseHost(val: string | undefined): string {
  if (!val) return '';
  const v = val.trim();
  // Reject pure numbers (tracking #s, order IDs) and anything over 60 chars
  if (!v || /^\d+$/.test(v) || v.length > 60) return '';
  return v;
}

// One pull of the sales workbook means a metadata call plus a batchGet of
// every date tab, so it's slow and counts against the Sheets API quota. The
// pay calculator fires one per date-picker segment (month, then day), and
// Performance/Reports pull the same data on load — which is what pushes these
// calls into timeouts. Nothing in this app writes to the sales sheet, so a
// short in-process cache is safe, and sharing the in-flight promise collapses
// a burst of overlapping requests into a single download.
const SALES_TTL_MS = 60_000;
let salesCache: { at: number; data: SaleOrder[] } | null = null;
let salesInFlight: Promise<SaleOrder[]> | null = null;

export async function getSalesData(): Promise<SaleOrder[]> {
  if (isDemo()) return sampleSales;

  const auth = getAuth();
  if (!auth) return sampleSales;

  if (salesCache && Date.now() - salesCache.at < SALES_TTL_MS) return salesCache.data;
  if (salesInFlight) return salesInFlight;

  // Failures are deliberately not cached — the next caller retries.
  salesInFlight = fetchSalesFromSheets(auth)
    .then(data => {
      salesCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      salesInFlight = null;
    });

  return salesInFlight;
}

async function fetchSalesFromSheets(auth: NonNullable<ReturnType<typeof getAuth>>): Promise<SaleOrder[]> {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID;
  if (!spreadsheetId) throw new Error('SALES_SHEET_ID environment variable is not set');

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = (meta.data.sheets || [])
    .map(s => s.properties?.title || '')
    .filter(n => n && /^\d+\/\d+\/\d+$/.test(n));

  const allOrders: SaleOrder[] = [];
  const BATCH = 50; // batchGet limit is 100; use 50 to stay safe

  for (let i = 0; i < sheetNames.length; i += BATCH) {
    const batch = sheetNames.slice(i, i + BATCH);
    const ranges = batch.map(tab => `'${tab}'!A3:R2000`); // A-R covers any host column

    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    (batchRes.data.valueRanges || []).forEach((vr, idx) => {
      const tab = batch[idx];
      const rows = vr.values || [];
      for (const row of rows) {
        if (!row[0]) continue;
        allOrders.push({
          tab,
          orderId: row[0] || '',
          orderNum: row[1] || '',
          buyer: row[2] || '',
          modelNum: row[3] || '',
          productName: row[4] || '',
          qty: parseInt(row[5]) || 0,
          sold: parseMoney(row[6]),
          cost: parseMoney(row[7]),
          earn: parseMoney(row[8]),
          profit: parseMoney(row[9]),
          margin: parseMoney(row[10]),
          timestamp: row[11] || '',
          host: parseHost(row[12]) || '',
          livestream: parseInt(row[13]) || 1,
          shippingAddress: row[14] || '',
          status: row[15] || '',
        });
      }
    });
  }

  return allOrders;
}

export type ShipmentRecord = { shipmentId: string; tab: string };

// ─── Claim Records (Cancellations / Incomplete / Replacement / Refund / USPS) ─

export type ClaimRecord = {
  rowIndex: number;
  // General claim fields (cancellation / incomplete / replacement / refund)
  orderNumber?: string;
  dateOrder?: string;
  modelNumber?: string;
  itemName?: string;
  // Incomplete-order fields — how many of the item were bought vs. received,
  // plus whatever the buyer said or the team needs to remember about it
  qtyOrdered?: number;
  qtyReceived?: number;
  note?: string;
  // USPS claim fields
  amountRequested?: number;
  amountApproved?: number;
  dateSubmitted?: string;
  trackingNumber?: string;
  // Common
  username: string;
  status: string;
};

const CLAIM_TABS: Record<string, string> = {
  cancellation: 'CANCELLATIONS',
  incomplete: 'INCOMPLETE ORDER',
  replacement: 'REPLACEMENT',
  refund: 'REFUND',
  usps: 'USPS CLAIM',
};

// Every tab keeps STATUS in column F so one status-write path serves them all.
// INCOMPLETE ORDER hangs its two quantity columns off the end rather than
// inserting them mid-row, which would shift STATUS out from under that path.
const CLAIM_HEADERS: Record<string, string[]> = {
  cancellation: ['ORDER NUMBER', 'DATE ORDER', 'MODEL NUMBER', 'ITEM NAME', 'USERNAME', 'STATUS'],
  incomplete: ['ORDER NUMBER', 'DATE ORDER', 'MODEL NUMBER', 'ITEM NAME', 'USERNAME', 'STATUS', 'QTY ORDERED', 'QTY RECEIVED', 'NOTE'],
  replacement: ['ORDER NUMBER', 'DATE ORDER', 'MODEL NUMBER', 'ITEM NAME', 'USERNAME', 'STATUS'],
  refund: ['ORDER NUMBER', 'DATE ORDER', 'MODEL NUMBER', 'ITEM NAME', 'USERNAME', 'STATUS'],
  usps: ['USERNAME', 'AMOUNT REQUESTED', 'AMOUNT APPROVED', 'DATE SUBMITTED', 'TRACKING NUMBER', 'STATUS'],
};

function lastCol(type: string): string {
  return String.fromCharCode('A'.charCodeAt(0) + (CLAIM_HEADERS[type]?.length ?? 6) - 1);
}

function parseQty(val: string | undefined): number | undefined {
  if (val == null || val === '') return undefined;
  const n = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

function claimToRow(type: string, data: Omit<ClaimRecord, 'rowIndex'>): (string | number)[] {
  if (type === 'usps') {
    return [data.username, data.amountRequested ?? 0, data.amountApproved ?? '', data.dateSubmitted ?? '', data.trackingNumber ?? '', data.status];
  }
  const base: (string | number)[] = [data.orderNumber ?? '', data.dateOrder ?? '', data.modelNumber ?? '', data.itemName ?? '', data.username, data.status];
  if (type === 'incomplete') base.push(data.qtyOrdered ?? '', data.qtyReceived ?? '', data.note ?? '');
  return base;
}

// A tab the app writes to may not exist in the workbook yet — a new claim
// category ships here before anyone adds it by hand in Sheets. Create it with
// its header row the first time a write needs it, so nobody has to.
async function ensureClaimTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  type: string,
): Promise<boolean> {
  const tab = CLAIM_TABS[type];
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (meta.data.sheets?.some(s => s.properties?.title === tab)) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1:${lastCol(type)}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [CLAIM_HEADERS[type]] },
  });
  headersSynced.add(tab);
  return true;
}

// A tab created before a column was added still has the old header row, so a
// new column would land under a blank heading. Fill in the missing headings
// once per process — blanks only, so a heading anyone renamed by hand stays.
const headersSynced = new Set<string>();
async function syncClaimHeaders(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  type: string,
): Promise<void> {
  const tab = CLAIM_TABS[type];
  if (headersSynced.has(tab)) return;
  const want = CLAIM_HEADERS[type];
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:${lastCol(type)}1` });
    const have = (res.data.values?.[0] ?? []).map(v => (v ?? '').toString());
    const merged = want.map((h, i) => have[i]?.trim() ? have[i] : h);
    if (merged.some((h, i) => h !== have[i])) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tab}'!A1:${lastCol(type)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [merged] },
      });
    }
    headersSynced.add(tab);
  } catch {
    // The tab probably isn't there yet; addClaim creates it on the retry path.
  }
}

export async function getClaims(type: string): Promise<ClaimRecord[]> {
  const auth = getAuth();
  if (!auth) return [];
  const tab = CLAIM_TABS[type];
  if (!tab) return [];
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SALES_SHEET_ID!;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A2:${lastCol(type)}2000` });
    const rows = res.data.values || [];
    // rowIndex must come from the row's real position in the sheet, so number
    // the rows BEFORE dropping the blank ones. Filtering first makes a gap
    // anywhere above a record point edits and deletes at the wrong row.
    const numbered = rows.map((row, idx) => ({ row, rowIndex: idx + 2 })).filter(r => r.row[0]);
    if (type === 'usps') {
      // USPS: A=username, B=amountRequested, C=amountApproved, D=dateSubmitted, E=trackingNumber, F=status
      return numbered.map(({ row, rowIndex }): ClaimRecord => ({
        rowIndex,
        username: row[0] || '',
        amountRequested: parseMoney(row[1]),
        amountApproved: row[2] ? parseMoney(row[2]) : undefined,
        dateSubmitted: row[3] || '',
        trackingNumber: row[4] || '',
        status: row[5] || '',
      }));
    }
    // General: A=orderNumber, B=dateOrder, C=modelNumber, D=itemName, E=username, F=status
    // Incomplete adds: G=qtyOrdered, H=qtyReceived, I=note
    return numbered.map(({ row, rowIndex }): ClaimRecord => ({
      rowIndex,
      orderNumber: row[0] || '',
      dateOrder: row[1] || '',
      modelNumber: row[2] || '',
      itemName: row[3] || '',
      username: row[4] || '',
      status: row[5] || '',
      ...(type === 'incomplete' ? { qtyOrdered: parseQty(row[6]), qtyReceived: parseQty(row[7]), note: row[8] || '' } : {}),
    }));
  } catch (e) {
    console.error('getClaims error:', e);
    return [];
  }
}

export async function addClaim(type: string, data: Omit<ClaimRecord, 'rowIndex'>): Promise<void> {
  const auth = getAuth();
  if (!auth) throw new Error('Google Sheets not configured');
  const tab = CLAIM_TABS[type];
  if (!tab) throw new Error(`Unknown claim type: ${type}`);
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const append = () => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tab}'!A2:${lastCol(type)}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [claimToRow(type, data)] },
  });
  await syncClaimHeaders(sheets, spreadsheetId, type);
  try {
    await append();
  } catch (e) {
    // The usual cause of a failed append is a tab that isn't there yet.
    // Create it and retry once; anything else still throws.
    try {
      const created = await ensureClaimTab(sheets, spreadsheetId, type);
      if (!created) throw e;
    } catch {
      console.error('addClaim error:', e);
      throw e;
    }
    await append();
  }
}

export async function deleteClaim(type: string, rowIndex: number): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const tab = CLAIM_TABS[type];
  if (!tab) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === tab)?.properties?.sheetId;
  if (sheetId == null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }],
    },
  });
}

export async function updateClaimStatus(type: string, rowIndex: number, status: string): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const tab = CLAIM_TABS[type];
  if (!tab) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const col = 'F';
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!${col}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] },
  });
}

export async function updateClaim(type: string, rowIndex: number, data: Omit<ClaimRecord, 'rowIndex'>): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const tab = CLAIM_TABS[type];
  if (!tab) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const end = lastCol(type);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A${rowIndex}:${end}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [claimToRow(type, data)] },
  });
}

// ─── Open-claim counts for the sidebar badge ────────────────────────────────

export type ClaimCounts = Record<string, number>;

// "Still needs someone" — the same rule the Shipments page uses for its own
// per-tab badges, so the sidebar and the page can never disagree.
function isOpenStatus(type: string, status: string): boolean {
  return type === 'usps' ? status !== 'Approved' : status !== 'Resolved';
}

// The sidebar polls this on every page, for every admin. One batchGet covers
// all five tabs, and a short cache plus a shared in-flight promise keeps a
// burst of sessions down to a single round trip — the same shape as the sales
// cache above, for the same reason.
const CLAIM_COUNT_TTL_MS = 60_000;
let claimCountCache: { at: number; data: ClaimCounts } | null = null;
let claimCountInFlight: Promise<ClaimCounts> | null = null;

export async function getClaimCounts(): Promise<ClaimCounts> {
  const auth = getAuth();
  if (!auth) return {};
  if (claimCountCache && Date.now() - claimCountCache.at < CLAIM_COUNT_TTL_MS) return claimCountCache.data;
  if (claimCountInFlight) return claimCountInFlight;

  claimCountInFlight = fetchClaimCounts(auth)
    .then(data => {
      claimCountCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      claimCountInFlight = null;
    });
  return claimCountInFlight;
}

async function fetchClaimCounts(auth: ReturnType<typeof getAuth>): Promise<ClaimCounts> {
  const sheets = google.sheets({ version: 'v4', auth: auth! });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const types = Object.keys(CLAIM_TABS);
  const ranges = types.map(t => `'${CLAIM_TABS[t]}'!A2:F2000`);

  const count = (type: string, rows: string[][]) =>
    rows.filter(r => (r[0] ?? '').toString().trim() && isOpenStatus(type, (r[5] ?? '').toString().trim())).length;

  try {
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
    const out: ClaimCounts = {};
    types.forEach((t, i) => { out[t] = count(t, (res.data.valueRanges?.[i]?.values ?? []) as string[][]); });
    return out;
  } catch {
    // batchGet is all-or-nothing: one tab that isn't there yet fails the whole
    // call. Fall back to reading them separately so a missing tab costs only
    // its own count rather than blanking every badge.
    const out: ClaimCounts = {};
    await Promise.all(types.map(async t => {
      try {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${CLAIM_TABS[t]}'!A2:F2000` });
        out[t] = count(t, (r.data.values ?? []) as string[][]);
      } catch {
        out[t] = 0;
      }
    }));
    return out;
  }
}

// ─── Write assignment back to SHIPMENT RECORDS Google Sheet ──────────────────

export async function updateShipmentInSheet(tab: string, shipmentId: string, assignedName: string, status: string): Promise<void> {
  const auth = getAuth();
  const spreadsheetId = process.env.SHIPMENT_SHEET_ID;
  if (!auth || !spreadsheetId) return;
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A:A` });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0]?.toString() === shipmentId);
    if (rowIdx === -1) return;
    const rowNumber = rowIdx + 1;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${tab}'!B${rowNumber}`, values: [[assignedName]] },
          { range: `'${tab}'!C${rowNumber}`, values: [[status]] },
        ],
      },
    });
  } catch (e) {
    console.error('updateShipmentInSheet error:', e);
  }
}

export async function getShipmentData(): Promise<ShipmentRecord[]> {
  const auth = getAuth();
  const spreadsheetId = process.env.SHIPMENT_SHEET_ID;
  if (!auth || !spreadsheetId) return [];

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = (meta.data.sheets || [])
      .map(s => s.properties?.title || '')
      .filter(Boolean);

    const all: ShipmentRecord[] = [];
    const BATCH = 50;

    for (let i = 0; i < sheetNames.length; i += BATCH) {
      const batch = sheetNames.slice(i, i + BATCH);
      const ranges = batch.map(tab => `'${tab}'!A1:A2000`);
      const batchRes = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });

      (batchRes.data.valueRanges || []).forEach((vr, idx) => {
        const tab = batch[idx];
        const rows = vr.values || [];
        rows.forEach(row => {
          const val = (row[0] || '').toString().trim();
          if (val && val.toLowerCase() !== 'shipment' && /^\d+$/.test(val)) {
            all.push({ shipmentId: val, tab });
          }
        });
      });
    }

    return all;
  } catch (e) {
    console.error('getShipmentData error:', e);
    return [];
  }
}

export async function getInventoryData(): Promise<InventoryItem[]> {
  if (isDemo()) return sampleInventory;

  const auth = getAuth();
  if (!auth) return sampleInventory;

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.INVENTORY_SHEET_ID!;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'INV!A2:T2000',
    });

    const rows = res.data.values || [];
    return rows
      .map((row, idx): InventoryItem => ({
        rowIndex: idx + 2,
        imageUrl: row[1] || '',
        upc: row[2] || '',
        modelNum: row[3] || '',
        asin: row[4] || '',
        description: row[6] || '',
        jz: parseInt(row[7]) || 0,
        old: parseInt(row[8]) || 0,
        newStock: parseInt(row[9]) || 0,
        amz: parseInt(row[10]) || 0,
        ws: parseInt(row[11]) || 0,
        wn: parseInt(row[12]) || 0,
        fbm: parseInt(row[13]) || 0,
        qty: parseInt(row[14]) || 0,
        retail: parseMoney(row[16]),
        total: parseMoney(row[17]),
      }))
      .filter(item => item.modelNum || item.description);
  } catch (e) {
    console.error('Inventory sheets error:', e);
    return sampleInventory;
  }
}

export async function updateInventoryItem(rowIndex: number, updates: Partial<InventoryItem>) {
  if (isDemo()) return;

  const auth = getAuth();
  if (!auth) return;

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.INVENTORY_SHEET_ID!;

  const colMap: Record<string, string> = {
    upc: 'C', modelNum: 'D', asin: 'E', description: 'G',
    jz: 'H', old: 'I', newStock: 'J', amz: 'K',
    ws: 'L', wn: 'M', fbm: 'N', qty: 'O', retail: 'Q',
  };

  const data = Object.entries(updates)
    .filter(([k]) => colMap[k])
    .map(([k, v]) => ({ range: `INV!${colMap[k]}${rowIndex}`, values: [[v]] }));

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
  }
}

export async function addInventoryItem(item: Partial<InventoryItem>) {
  if (isDemo()) return;

  const auth = getAuth();
  if (!auth) return;

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.INVENTORY_SHEET_ID!;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'INV!A:Q',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        '', item.imageUrl || '',
        item.upc || '', item.modelNum || '', item.asin || '', '',
        item.description || '',
        item.jz || 0, item.old || 0, item.newStock || 0,
        item.amz || 0, item.ws || 0, item.wn || 0, item.fbm || 0,
        item.qty || 0, '', item.retail || 0,
      ]],
    },
  });
}

export async function deleteInventoryRow(rowIndex: number) {
  if (isDemo()) return;

  const auth = getAuth();
  if (!auth) return;

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.INVENTORY_SHEET_ID!;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === 'INV')?.properties?.sheetId;
  if (sheetId == null) throw new Error('INV sheet not found');

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex },
        },
      }],
    },
  });
}
