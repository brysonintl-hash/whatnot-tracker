// ─── Sheet orders → show records ───────────────────────────────────────────
//
// Turns the WN sheet's order rows into one record per show, which is what the
// leaderboard ranks on. Shares the duration and voided-row rules with the rest
// of the app so a host's hours and sales never disagree between pages.

import { isVoided, type SaleOrder } from './sampleData';
import { parseTimestamp, parseDurationStr, durationFromTimestamps } from './hostDay';
import type { ShowRecord } from './leaderboard';

/** "M/D/YY" (the sheet's tab name) → "YYYY-MM-DD". */
export function tabToISO(tab: string): string | null {
  const m = tab.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (!month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Group order rows into shows — one per host per livestream per date.
 *
 * A host who runs two livestreams in a day gets two records, because that is
 * two shows, and the leaderboard's "at least 3 shows" rule should count them
 * as such.
 *
 * Failed and cancelled rows contribute no sales, profit or orders — the money
 * never landed — but their timestamps still count toward hours, since the host
 * was on air when the item ran.
 */
export function showRecordsFromOrders(orders: SaleOrder[]): ShowRecord[] {
  type Acc = {
    host: string; date: string;
    sales: number; orders: number; paidOrders: number; profit: number;
    timestamps: number[]; durStr: number | null;
  };
  const map = new Map<string, Acc>();

  for (const o of orders) {
    if (!o.host) continue;
    const date = tabToISO(o.tab);
    if (!date) continue;

    const key = `${o.host}|${date}|${o.livestream || 1}`;
    let a = map.get(key);
    if (!a) {
      a = { host: o.host, date, sales: 0, orders: 0, paidOrders: 0, profit: 0, timestamps: [], durStr: null };
      map.set(key, a);
    }

    if (!isVoided(o)) {
      a.sales += o.sold;
      a.profit += o.profit;
      a.orders++;
      if (o.sold > 0) a.paidOrders++;
    }

    const ts = parseTimestamp(o.timestamp);
    if (ts !== null) {
      a.timestamps.push(ts);
    } else {
      const d = parseDurationStr(o.timestamp);
      if (d !== null && (a.durStr === null || d > a.durStr)) a.durStr = d;
    }
  }

  return Array.from(map.values()).map(a => {
    const fromTs = durationFromTimestamps(a.timestamps);
    return {
      host: a.host,
      date: a.date,
      durationHours: fromTs > 0 ? fromTs : (a.durStr ?? 0),
      sales: a.sales,
      orders: a.orders,
      grossProfit: a.profit,
      paidOrders: a.paidOrders,
    };
  });
}
