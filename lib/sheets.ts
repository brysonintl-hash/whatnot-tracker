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

export async function getSalesData(): Promise<SaleOrder[]> {
  if (isDemo()) return sampleSales;

  const auth = getAuth();
  if (!auth) return sampleSales;

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
        });
      }
    });
  }

  return allOrders;
}

export type ShipmentRecord = { shipmentId: string; tab: string };

// ─── Claim Records (Cancellations / Replacement / Refund / USPS Claim) ───────

export type ClaimRecord = {
  rowIndex: number;
  orderNumber: string;
  dateOrder: string;
  modelNumber: string;
  itemName: string;
  username: string;
  amountRefunded?: number;
  status: string;
};

const CLAIM_TABS: Record<string, string> = {
  cancellation: 'CANCELLATIONS',
  replacement: 'REPLACEMENT',
  refund: 'REFUND',
  usps: 'USPS CLAIM',
};

export async function getClaims(type: string): Promise<ClaimRecord[]> {
  const auth = getAuth();
  if (!auth) return [];
  const tab = CLAIM_TABS[type];
  if (!tab) return [];
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SALES_SHEET_ID!;
    const range = type === 'usps' ? `'${tab}'!A2:G2000` : `'${tab}'!A2:F2000`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    return rows.filter(r => r[0]).map((row, idx): ClaimRecord => ({
      rowIndex: idx + 2,
      orderNumber: row[0] || '',
      dateOrder: row[1] || '',
      modelNumber: row[2] || '',
      itemName: row[3] || '',
      username: row[4] || '',
      ...(type === 'usps' ? { amountRefunded: parseMoney(row[5]) } : {}),
      status: type === 'usps' ? (row[6] || '') : (row[5] || ''),
    }));
  } catch (e) {
    console.error('getClaims error:', e);
    return [];
  }
}

export async function addClaim(type: string, data: Omit<ClaimRecord, 'rowIndex'>): Promise<void> {
  const auth = getAuth();
  if (!auth) return;
  const tab = CLAIM_TABS[type];
  if (!tab) return;
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SALES_SHEET_ID!;
  const values = type === 'usps'
    ? [[data.orderNumber, data.dateOrder, data.modelNumber, data.itemName, data.username, data.amountRefunded ?? 0, data.status]]
    : [[data.orderNumber, data.dateOrder, data.modelNumber, data.itemName, data.username, data.status]];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tab}'!A:G`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
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
  const col = type === 'usps' ? 'G' : 'F';
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!${col}${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status]] },
  });
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
