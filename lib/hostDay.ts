// ─── Host show-day math ────────────────────────────────────────────────────
//
// Turning raw sheet rows into "what did this host earn per hour" is used in two
// places — the Performance page's tier board and the Pay Calculator's schedule
// lookup. They have to agree, so the timestamp parsing, the duration rule and
// the per-host roll-up all live here.

import { isVoided, type SaleOrder } from './sampleData';
import { getPayRate } from './payTiers';

export const BUSINESS_TZ = 'America/Los_Angeles';

/** Converts Y-M-D H:M:S wall-clock digits *as read in BUSINESS_TZ* into the correct UTC epoch ms. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcGuess));
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0');
  const shownAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return utcGuess + (utcGuess - shownAsUtc);
}

export function parseTimestamp(ts: string): number | null {
  if (!ts) return null;
  const s = ts.trim();
  if (!s) return null;

  // "YYYY-MM-DD HH:MM:SS" / "YYYY/MM/DD HH:MM:SS" / ISO with T — a machine-generated
  // timestamp (e.g. an export's `created_at`); treated as UTC, per ISO-8601 convention.
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[\sT](\d{1,2}):(\d{2}):(\d{2})/);
  if (iso) {
    const [, yr, mo, dy, hr, min, sec] = iso;
    return Date.UTC(parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr), parseInt(min), parseInt(sec));
  }

  // "M/D/YYYY H:MM:SS" or "M/D/YYYY H:MM:SS AM/PM" — a naive wall-clock time with no
  // timezone marker, meant as the business's own local time (BUSINESS_TZ).
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(\s*[AP]M)?$/i);
  if (us) {
    let h = parseInt(us[4]);
    const ampm = us[7]?.trim().toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return zonedToUtc(parseInt(us[3]), parseInt(us[1]), parseInt(us[2]), h, parseInt(us[5]), parseInt(us[6]));
  }

  // Google Sheets serial date (days since Dec 30, 1899) — returned when cell has no text format.
  // Valid modern dates are serial ~40000–50000 (year 2009–2036). Serial numbers carry no
  // timezone info; the fractional part is wall-clock time in BUSINESS_TZ (the spreadsheet's
  // own timezone setting), not UTC.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 40000 && serial < 60000) {
      const MS_PER_DAY = 86400000;
      const EPOCH_DIFF = 25569; // days from Dec 30, 1899 to Jan 1, 1970
      const naive = new Date((serial - EPOCH_DIFF) * MS_PER_DAY);
      return zonedToUtc(naive.getUTCFullYear(), naive.getUTCMonth() + 1, naive.getUTCDate(), naive.getUTCHours(), naive.getUTCMinutes(), naive.getUTCSeconds());
    }
  }

  // Fallback: let JS Date try to parse it (handles ISO 8601 and other standard formats)
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.getTime();

  return null;
}

/** "02h 14m" or "2h 14m" or "00h 51m" → fractional hours */
export function parseDurationStr(ts: string): number | null {
  const m = ts.match(/^(\d+)h\s*(\d+)m$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  return null;
}

/**
 * Gaps longer than this aren't time on air — they're the host being off between
 * shows, so they don't count toward hours worked.
 */
export const MAX_GAP_MS = 2 * 3600000;

/** Sum the gaps between consecutive order times, ignoring off-air stretches. */
export function durationFromTimestamps(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  let ms = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap <= MAX_GAP_MS) ms += gap;
  }
  return ms / 3600000;
}

export type HostDay = {
  host: string;
  /** Revenue and profit from sales that actually paid out. */
  sales: number;
  profit: number;
  durationHours: number;
  /** null when the day has no measurable duration, so no streaming tier applies. */
  profitPerHour: number | null;
  /** null when nothing paid out, so there's no margin to measure. */
  marginPct: number | null;
  tierRate: number;
};

/**
 * Roll a single show date's orders up per host and resolve each host's pay rate.
 *
 * Failed and cancelled rows never paid out, so they count toward neither profit
 * nor revenue — but the host was on air when they ran, so their timestamps still
 * count toward hours worked.
 */
export function aggregateHostDays(dayOrders: SaleOrder[]): HostDay[] {
  const map: Record<string, { profit: number; sales: number; timestamps: number[]; durStr: number | null }> = {};

  for (const o of dayOrders) {
    if (!o.host) continue;
    if (!map[o.host]) map[o.host] = { profit: 0, sales: 0, timestamps: [], durStr: null };
    const m = map[o.host];

    if (!isVoided(o)) {
      m.profit += o.profit;
      m.sales += o.sold;
    }

    const ts = parseTimestamp(o.timestamp);
    if (ts !== null) {
      m.timestamps.push(ts);
    } else {
      // Some sheets carry a show length ("02h 14m") instead of a clock time.
      const dur = parseDurationStr(o.timestamp);
      if (dur !== null && (m.durStr === null || dur > m.durStr)) m.durStr = dur;
    }
  }

  return Object.entries(map).map(([host, m]) => {
    const fromTs = durationFromTimestamps(m.timestamps);
    const durationHours = fromTs > 0 ? fromTs : (m.durStr ?? 0);
    const profitPerHour = durationHours > 0 ? m.profit / durationHours : null;
    const marginPct = m.sales > 0 ? (m.profit / m.sales) * 100 : null;
    return {
      host,
      sales: m.sales,
      profit: m.profit,
      durationHours,
      profitPerHour,
      marginPct,
      tierRate: getPayRate(profitPerHour, marginPct),
    };
  });
}
