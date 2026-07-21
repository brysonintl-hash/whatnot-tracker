'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Order = {
  tab: string; orderId: string; buyer: string; modelNum: string; productName: string;
  qty: number; sold: number; cost: number; earn: number; profit: number; margin: number;
  timestamp: string; host: string; livestream: number;
};

const HOST_COLORS = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];

function parseTabDate(tab: string): Date {
  const parts = tab.split('/');
  if (parts.length !== 3) return new Date(0);
  const [m, d, y] = parts.map(Number);
  return new Date(2000 + y, m - 1, d);
}

// "5/29/26" -> "2026-05-29"
function tabToISO(tab: string): string {
  const parts = tab.split('/');
  if (parts.length !== 3) return '';
  const [m, d, y] = parts.map(Number);
  return `${2000 + y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "2026-05-29" -> "5/29/26"
function isoToTab(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  return `${m}/${d}/${y - 2000}`;
}

// "2026-05-29" -> "May 29, 2026"
function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseTimestamp(ts: string): number | null {
  if (!ts) return null;
  const s = ts.trim();
  if (!s) return null;

  // "YYYY-MM-DD HH:MM:SS" / "YYYY/MM/DD HH:MM:SS" / ISO with T â€” handles 1 or 2 digit hour
  const iso = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[\sT](\d{1,2}):(\d{2}):(\d{2})/);
  if (iso) {
    const [, yr, mo, dy, hr, min, sec] = iso;
    const d = new Date(`${yr}-${mo}-${dy}T${hr.padStart(2, '0')}:${min}:${sec}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // "M/D/YYYY H:MM:SS" or "M/D/YYYY H:MM:SS AM/PM"
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(\s*[AP]M)?$/i);
  if (us) {
    let h = parseInt(us[4]);
    const ampm = us[7]?.trim().toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const d = new Date(parseInt(us[3]), parseInt(us[1]) - 1, parseInt(us[2]), h, parseInt(us[5]), parseInt(us[6]));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Google Sheets serial date (days since Dec 30, 1899) â€” returned when cell has no text format
  // Valid modern dates are serial ~40000â€“50000 (year 2009â€“2036)
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 40000 && serial < 60000) {
      const MS_PER_DAY = 86400000;
      const EPOCH_DIFF = 25569; // days from Dec 30, 1899 to Jan 1, 1970
      const d = new Date((serial - EPOCH_DIFF) * MS_PER_DAY);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  // Fallback: let JS Date try to parse it (handles ISO 8601 and other standard formats)
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback.getTime();

  return null;
}

// "02h 14m" or "2h 14m" or "00h 51m" â†’ fractional hours
function parseDurationStr(ts: string): number | null {
  const m = ts.match(/^(\d+)h\s*(\d+)m$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  return null;
}

function fmtMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// â”€â”€â”€ Host Pay Rate Tiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAY_TIERS = [
  { min: 500, pay: 30, label: '$30/hr', color: '#10B981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-400' },
  { min: 400, pay: 25, label: '$25/hr', color: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-200 dark:border-amber-700',   text: 'text-amber-700 dark:text-amber-400' },
  { min: 300, pay: 20, label: '$20/hr', color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-700',     text: 'text-blue-700 dark:text-blue-400' },
];

function getPayTier(profitPerHour: number | null) {
  if (profitPerHour === null || profitPerHour <= 0) return null;
  return PAY_TIERS.find(t => profitPerHour >= t.min) ?? null;
}

// â”€â”€â”€ PDF Report Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildPDFHtml(
  date: string,
  hostStats: HostStat[],
) {
  const dateLabel = isoToDisplay(date) || date;
  const now = new Date().toLocaleString('en-US');

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hostRows = hostStats.map(hs => {
    const pph      = hs.durationHours > 0 ? hs.totalProfit / hs.durationHours : null;
    const tier     = getPayTier(pph);
    const payColor = tier?.color ?? '#94a3b8';
    return `<tr>
      <td><strong>${hs.host}</strong></td>
      <td>$${fmt(hs.totalSales)}</td>
      <td>$${fmt(hs.totalProfit)}</td>
      <td>${hs.overallMargin.toFixed(1)}%</td>
      <td>${hs.durationHours > 0 ? fmtDuration(hs.durationHours) : 'â€”'}</td>
      <td>${pph !== null ? `$${fmt(pph)}/hr` : 'â€”'}</td>
      <td style="font-weight:900;color:${payColor}">${tier ? tier.label : 'â€”'}</td>
      <td style="font-weight:900;color:${payColor}">${tier ? `$${fmt(tier.pay * hs.durationHours)}` : 'â€”'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Stack Bargains â€” Performance Report â€” ${dateLabel}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1e293b;padding:40px;font-size:13px;line-height:1.5;background:#fff}
h1{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-0.5px}
.sub{font-size:12px;color:#64748b;margin-top:4px}
h2{font-size:12px;font-weight:900;color:#64748b;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.08em;border-bottom:2px solid #e2e8f0;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;padding:7px 10px;text-align:left;border-bottom:2px solid #e2e8f0;background:#f8fafc;white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:middle}
.tier-chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;border:1px solid #e2e8f0}
.chip-pay{font-weight:900;font-size:18px}
.chip-range{font-size:11px;color:#64748b}
.footer{margin-top:40px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:14px}
@media print{@page{margin:16mm}body{padding:0}}
</style></head><body>
<h1>Stack Bargains</h1>
<p class="sub">Performance Report &nbsp;Â·&nbsp; ${dateLabel} &nbsp;Â·&nbsp; Exported ${now}</p>

<h2>Host Performance</h2>
<table><thead><tr>
  <th>Host</th><th>Total Sales</th><th>Gross Profit</th><th>Margin</th>
  <th>Duration</th><th>Profit / Hour</th><th>Pay Rate</th><th>Estimated Pay</th>
</tr></thead><tbody>${hostRows}</tbody></table>

<h2>Pay Rate Scale</h2>
<div class="tier-chips">
  <div class="chip"><span class="chip-pay" style="color:#10B981">$30/hr</span><span class="chip-range">$500+ profit / hr</span></div>
  <div class="chip"><span class="chip-pay" style="color:#F59E0B">$25/hr</span><span class="chip-range">$400â€“$499 profit / hr</span></div>
  <div class="chip"><span class="chip-pay" style="color:#3B82F6">$20/hr</span><span class="chip-range">$300â€“$399 profit / hr</span></div>
</div>

<p class="footer">Stack Bargains &nbsp;Â·&nbsp; Confidential &nbsp;Â·&nbsp; ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

function fmtDuration(hours: number): string {
  if (hours <= 0) return 'â€”';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type HostStat = {
  host: string;
  livestream: number;
  colorIdx: number;
  totalSales: number;
  totalProfit: number;
  totalOrders: number;
  totalUnits: number;
  overallMargin: number;
  durationHours: number;
};

// Gaps larger than this between consecutive orders are excluded from show duration
const MAX_GAP_MS = 2 * 3600000; // 2 hours

function computeHostStats(orders: Order[]): HostStat[] {
  let colorIdx = 0;
  const hostColorMap: Record<string, number> = {};

  const map: Record<string, {
    host: string; livestream: number;
    sales: number; profit: number; orders: number; units: number;
    timestamps: number[];
    durStr: number | null;
    colorIdx: number;
  }> = {};

  orders.forEach(o => {
    const h = o.host;
    if (!h) return;
    const ls = o.livestream || 1;
    const key = `${h}|${ls}`;

    if (!(h in hostColorMap)) hostColorMap[h] = colorIdx++;
    if (!map[key]) {
      map[key] = { host: h, livestream: ls, sales: 0, profit: 0, orders: 0, units: 0, timestamps: [], durStr: null, colorIdx: hostColorMap[h] };
    }
    map[key].sales += o.sold;
    map[key].profit += o.profit;
    map[key].orders++;
    map[key].units += o.qty;

    const ts = parseTimestamp(o.timestamp);
    if (ts !== null) {
      map[key].timestamps.push(ts);
    } else {
      const dur = parseDurationStr(o.timestamp);
      if (dur !== null && (map[key].durStr === null || dur > map[key].durStr!)) {
        map[key].durStr = dur;
      }
    }
  });

  return Object.values(map)
    .map(d => {
      let durationFromTs = 0;
      if (d.timestamps.length >= 2) {
        const sorted = [...d.timestamps].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i] - sorted[i - 1];
          if (gap <= MAX_GAP_MS) durationFromTs += gap;
        }
        durationFromTs /= 3600000;
      }
      const durationHours = durationFromTs > 0 ? durationFromTs : (d.durStr ?? 0);
      const overallMargin = d.sales > 0 ? (d.profit / d.sales) * 100 : 0;
      return {
        host: d.host,
        livestream: d.livestream,
        colorIdx: d.colorIdx,
        totalSales: d.sales,
        totalProfit: d.profit,
        totalOrders: d.orders,
        totalUnits: d.units,
        overallMargin,
        durationHours,
      };
    })
    .sort((a, b) => a.host.localeCompare(b.host) || a.livestream - b.livestream);
}

// â”€â”€â”€ Pay Tier Board â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TierEntry = HostStat & { pph: number; tierNum: 1 | 2 | 3 };

const TIER_DISPLAY_CONFIG = [
  {
    num: 1 as const, payRate: 30, payLabel: '$30/hr', threshold: 'â‰¥ $500/hr profit',
    gradFrom: '#78350F', gradTo: '#B45309',
    avatarBg: '#D97706', avatarRing: '#FDE68A',
  },
  {
    num: 2 as const, payRate: 25, payLabel: '$25/hr', threshold: '$400â€“499/hr profit',
    gradFrom: '#1E293B', gradTo: '#64748B',
    avatarBg: '#94A3B8', avatarRing: '#E2E8F0',
  },
  {
    num: 3 as const, payRate: 20, payLabel: '$20/hr', threshold: '$300â€“399/hr profit',
    gradFrom: '#92400E', gradTo: '#F59E0B',
    avatarBg: '#F59E0B', avatarRing: '#FDE68A',
  },
];

function PayTierBoard({ hostStats }: { hostStats: HostStat[] }) {
  const tieredEntries: TierEntry[] = hostStats
    .filter(hs => hs.durationHours > 0)
    .flatMap(hs => {
      const pph = hs.totalProfit / hs.durationHours;
      const tier = getPayTier(pph);
      if (!tier) return [] as TierEntry[];
      const tierNum: 1 | 2 | 3 = tier.pay === 30 ? 1 : tier.pay === 25 ? 2 : 3;
      return [{ ...hs, pph, tierNum }];
    });

  if (tieredEntries.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Pay Tier Ranking</p>
      <div className="space-y-2.5">
        {TIER_DISPLAY_CONFIG.map(cfg => {
          const hosts = tieredEntries.filter(e => e.tierNum === cfg.num);
          if (hosts.length === 0) return null;
          return (
            <div
              key={cfg.num}
              className="relative rounded-2xl overflow-hidden px-5 py-4 flex items-center justify-between gap-4 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${cfg.gradFrom} 0%, ${cfg.gradTo} 100%)` }}
            >
              <span
                className="absolute top-3 left-4 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.85)' }}
              >
                Tier {cfg.num}
              </span>
              <div className="pt-5 min-w-0">
                <p className="text-xl font-black text-white leading-tight truncate">
                  {hosts.map(h => h.host).join(', ')}
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {cfg.payLabel}&nbsp;Â·&nbsp;{hosts.map(h => `$${Math.round(h.pph)}/hr`).join(' Â· ')} profit/hr
                </p>
              </div>
              <div className="flex -space-x-3 flex-shrink-0">
                {hosts.map((h, i) => (
                  <div
                    key={h.host + h.livestream}
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-xl flex-shrink-0"
                    style={{
                      backgroundColor: cfg.avatarBg,
                      boxShadow: `0 0 0 4px ${cfg.avatarRing}, 0 8px 20px rgba(0,0,0,0.35)`,
                      zIndex: hosts.length - i,
                    }}
                  >
                    {(h.host[0] ?? '?').toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€â”€ Tier History Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TierHistorySection({ allOrders, myName }: { allOrders: Order[]; myName: string | null }) {
  const [open, setOpen] = useState(false);

  const showDates = useMemo(() => {
    const tabs = Array.from(new Set(allOrders.map(o => o.tab).filter(Boolean)));
    return tabs
      .sort((a, b) => parseTabDate(b).getTime() - parseTabDate(a).getTime())
      .slice(0, 10);
  }, [allOrders]);

  const allHosts = useMemo(() => {
    const hosts = Array.from(new Set(allOrders.map(o => o.host).filter(Boolean))) as string[];
    if (!myName) return hosts.sort();
    const mn = myName.toLowerCase().trim();
    return hosts
      .filter(h => {
        const hn = h.toLowerCase().trim();
        return hn === mn || hn.includes(mn) || mn.includes(hn);
      })
      .sort();
  }, [allOrders, myName]);

  const historyMap = useMemo(() => {
    const result: Record<string, Record<string, { tierNum: 1 | 2 | 3; pph: number } | null>> = {};
    showDates.forEach(tab => {
      const dateOrders = allOrders.filter(o => o.tab === tab);
      const stats = computeHostStats(dateOrders);
      result[tab] = {};
      stats.forEach(hs => {
        const pph = hs.durationHours > 0 ? hs.totalProfit / hs.durationHours : null;
        const tier = getPayTier(pph);
        if (tier && pph !== null) {
          const tierNum: 1 | 2 | 3 = tier.pay === 30 ? 1 : tier.pay === 25 ? 2 : 3;
          const existing = result[tab][hs.host];
          if (!existing || tierNum < existing.tierNum) {
            result[tab][hs.host] = { tierNum, pph };
          }
        } else if (!(hs.host in result[tab])) {
          result[tab][hs.host] = null;
        }
      });
    });
    return result;
  }, [allOrders, showDates]);

  if (showDates.length < 2 || allHosts.length === 0) return null;

  const tierBadge = (entry: { tierNum: 1 | 2 | 3; pph: number } | null | undefined) => {
    if (!entry) return <span className="text-slate-300 dark:text-slate-600 text-xs">â€”</span>;
    const clr: Record<1 | 2 | 3, string> = {
      1: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
      2: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
      3: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
    };
    return (
      <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${clr[entry.tierNum]}`}>
        T{entry.tierNum}
      </span>
    );
  };

  const shortDate = (tab: string) => {
    const iso = tabToISO(tab);
    if (!iso) return tab;
    const [, m, d] = iso.split('-').map(Number);
    return `${m}/${d}`;
  };

  return (
    <div className="mt-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div>
          <p className="text-sm font-black text-white">Tier History</p>
          <p className="text-xs text-slate-400 mt-0.5">Last {showDates.length} shows Â· Best tier per date</p>
        </div>
        <svg className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2.5 px-4 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Host</th>
                {showDates.map(tab => (
                  <th key={tab} className="py-2.5 px-3 text-center text-[10px] font-bold text-slate-400 whitespace-nowrap">
                    {shortDate(tab)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allHosts.map(host => (
                <tr key={host} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                  <td className="py-3 px-4 text-sm font-bold text-white whitespace-nowrap">{host}</td>
                  {showDates.map(tab => (
                    <td key={tab} className="py-3 px-3 text-center">
                      {tierBadge(historyMap[tab]?.[host])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-50 dark:border-slate-700 flex flex-wrap gap-4 bg-slate-50/50 dark:bg-slate-800/60">
            {TIER_DISPLAY_CONFIG.map(cfg => (
              <div key={cfg.num} className="flex items-center gap-1.5">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  cfg.num === 1 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' :
                  cfg.num === 2 ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' :
                                 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                }`}>T{cfg.num}</span>
                <span className="text-[10px] text-slate-400">{cfg.payLabel} Â· {cfg.threshold}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Margin Analyzer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MARGIN_LOW    = 20;
const MARGIN_TARGET = 30;

function MarginAnalyzer({ orders }: { orders: Order[] }) {
  const [showTable, setShowTable] = useState(false);

  if (orders.length === 0) return null;

  const enriched = orders.map(o => {
    const margin         = o.sold > 0 ? (o.profit / o.sold) * 100 : 0;
    const costBack       = o.sold - o.profit;
    const suggestedPrice = costBack > 0 ? Math.ceil(costBack / (1 - MARGIN_TARGET / 100)) : Math.ceil(o.sold);
    const priceGap       = suggestedPrice - o.sold;
    const profitGap      = o.sold > 0 ? o.sold * (MARGIN_TARGET / 100) - o.profit : 0;
    return { ...o, margin, costBack, suggestedPrice, priceGap, profitGap };
  });

  const totalRevenue   = enriched.reduce((s, o) => s + o.sold, 0);
  const totalProfit    = enriched.reduce((s, o) => s + o.profit, 0);
  const overallMargin  = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const belowTarget    = enriched.filter(o => o.margin < MARGIN_TARGET).sort((a, b) => a.margin - b.margin);
  const totalProfitGap = belowTarget.reduce((s, o) => s + Math.max(0, o.profitGap), 0);
  const losingMoney    = belowTarget.filter(o => o.profit < 0);

  // Group by product for top drags
  const productGroups: Record<string, typeof enriched> = {};
  belowTarget.forEach(o => {
    const key = o.productName || o.modelNum || 'Unknown Item';
    if (!productGroups[key]) productGroups[key] = [];
    productGroups[key].push(o);
  });
  const topDrags = Object.entries(productGroups)
    .map(([name, items]) => ({
      name,
      shortName: name.length > 50 ? name.slice(0, 50) + 'â€¦' : name,
      avgMargin:      items.reduce((s, i) => s + i.margin, 0) / items.length,
      totalProfitGap: items.reduce((s, i) => s + Math.max(0, i.profitGap), 0),
      count:          items.length,
      avgSold:        items.reduce((s, i) => s + i.sold, 0) / items.length,
      avgSuggested:   Math.ceil(items.reduce((s, i) => s + i.suggestedPrice, 0) / items.length),
      losing:         items.some(i => i.profit < 0),
    }))
    .sort((a, b) => b.totalProfitGap - a.totalProfitGap)
    .slice(0, 3);

  // All good
  if (overallMargin >= MARGIN_TARGET && belowTarget.length === 0) return (
    <div className="mt-6 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-700 p-6 flex items-center gap-5">
      <div className="text-5xl">ðŸŽ‰</div>
      <div>
        <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">You&apos;re doing great today!</p>
        <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
          All {orders.length} orders are making good profit. Keep it up!
        </p>
      </div>
    </div>
  );

  const statusEmoji = losingMoney.length > 10 ? 'ðŸš¨' : losingMoney.length > 0 ? 'âš ï¸' : 'ðŸ“Š';
  const statusColor = losingMoney.length > 10 ? 'red' : losingMoney.length > 0 ? 'amber' : 'amber';

  return (
    <div className="mt-6 space-y-4">

      {/* â”€â”€ Plain-English Summary â”€â”€ */}
      <div className={`rounded-2xl border-2 p-6 ${
        statusColor === 'red'
          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-start gap-4">
          <span className="text-4xl flex-shrink-0">{statusEmoji}</span>
          <div className="flex-1">
            <p className={`text-lg font-black leading-snug mb-1 ${statusColor === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {losingMoney.length > 0
                ? `You lost money on ${losingMoney.length} sale${losingMoney.length > 1 ? 's' : ''} today`
                : `${belowTarget.length} sales were below your profit goal`}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Out of <strong>{orders.length} total sales</strong>, {belowTarget.length} were sold without making enough profit.
              {totalProfitGap > 0 && (
                <> If you raise prices on those items, you could earn an extra <strong className="text-emerald-600">${fmtMoney(totalProfitGap)}</strong>.</>
              )}
            </p>
          </div>
        </div>

        {/* Simple progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-500">Your profit margin today</span>
            <span className={`text-sm font-black ${overallMargin >= MARGIN_TARGET ? 'text-emerald-600' : overallMargin >= MARGIN_LOW ? 'text-amber-600' : 'text-red-600'}`}>
              {overallMargin.toFixed(0)}% <span className="text-xs font-normal text-slate-400">(goal: 30%)</span>
            </span>
          </div>
          <div className="relative w-full h-5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${overallMargin >= MARGIN_TARGET ? 'bg-emerald-500' : overallMargin >= MARGIN_LOW ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.max(3, (overallMargin / 40) * 100))}%` }} />
            {/* Goal line */}
            <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${(MARGIN_TARGET / 40) * 100}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>0%</span>
            <span className="text-emerald-600 font-bold">â† Goal is 30%</span>
            <span>40%+</span>
          </div>
        </div>
      </div>

      {/* â”€â”€ Fix These Items â”€â”€ */}
      {topDrags.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
          <p className="text-base font-black text-white mb-1">Raise these prices on Whatnot</p>
          <p className="text-xs text-slate-400 mb-4">These {topDrags.length} items are costing you the most money. Fix them first.</p>
          <div className="space-y-3">
            {topDrags.map((d, i) => (
              <div key={i} className={`rounded-xl border-2 p-4 ${d.losing ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${d.losing ? 'bg-red-500' : 'bg-amber-500'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-white leading-snug">{d.shortName}</p>
                    {d.count > 1 && <p className="text-[11px] text-slate-400 mt-0.5">Sold {d.count} times</p>}
                    {/* Simple 3-column action row */}
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white dark:bg-slate-700 rounded-lg p-2.5 border border-slate-100 dark:border-slate-600">
                        <p className="text-[10px] text-slate-400 mb-0.5">Sold for</p>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-200">${fmtMoney(d.avgSold)}</p>
                      </div>
                      <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-700">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5 font-bold">Charge at least</p>
                        <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">${fmtMoney(d.avgSuggested)}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-700 rounded-lg p-2.5 border border-slate-100 dark:border-slate-600">
                        <p className="text-[10px] text-slate-400 mb-0.5">You&apos;ll gain</p>
                        <p className="text-sm font-black text-emerald-600">+${fmtMoney(d.totalProfitGap)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* â”€â”€ See All Bad Orders (collapsed) â”€â”€ */}
      {belowTarget.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setShowTable(s => !s)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
            <div>
              <p className="text-sm font-black text-white">
                See all {belowTarget.length} orders that need attention
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tap to {showTable ? 'hide' : 'show'} the full list â€” sorted worst first</p>
            </div>
            <svg className={`w-5 h-5 text-slate-400 transition-transform ${showTable ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showTable && (
            <div className="border-t border-slate-100 dark:border-slate-700">
              {/* Mobile-friendly card list instead of dense table */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {belowTarget.map((o, i) => (
                  <div key={i} className={`px-5 py-3.5 ${o.profit < 0 ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug truncate">{o.productName || 'â€”'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{o.buyer} {o.modelNum ? `Â· ${o.modelNum}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-right">
                        <div>
                          <p className="text-[9px] text-slate-400">Sold</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">${fmtMoney(o.sold)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400">Profit</p>
                          <p className={`text-xs font-black ${o.profit < 0 ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}`}>
                            {o.profit < 0 ? 'âˆ’' : '+'}${fmtMoney(Math.abs(o.profit))}
                          </p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-2.5 py-1.5 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">Set to</p>
                          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">${fmtMoney(o.suggestedPrice)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Timekeeping types for Team Calendar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type TKEntry = {
  id: string; userId: string; username: string; name: string;
  role: string; clockIn: string; clockOut: string | null; note: string;
};

const ROLE_CLR: Record<string, string> = {
  admin: '#DC2626', manager: '#3B82F6', host: '#F59E0B',
  shipper: '#8B5CF6', employee: '#10B981',
};

function fmtTimeLocal(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtWorked(clockIn: string, clockOut: string | null): string {
  if (!clockOut) return 'In progress';
  const h = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

function TeamCalendar({ entries }: { entries: TKEntry[] }) {
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [hovered, setHovered] = useState<{ dateKey: string; x: number; y: number } | null>(null);

  const byDate = useMemo(() => {
    const map: Record<string, TKEntry[]> = {};
    entries.forEach(e => {
      const d = new Date(e.clockIn);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [entries]);

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const hoveredEntries = hovered ? (byDate[hovered.dateKey] ?? []) : [];
  const totalDays = Object.keys(byDate).filter(k => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).length;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setCalMonth(new Date(year, month - 1, 1))}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="text-center">
          <h2 className="text-base font-black text-white">
            {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          {totalDays > 0 && <p className="text-[10px] text-slate-400 mt-0.5">{totalDays} days with activity</p>}
        </div>
        <button onClick={() => setCalMonth(new Date(year, month + 1, 1))}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-2">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((dateKey, i) => {
          if (!dateKey) return <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-700/20" style={{ minHeight: '80px' }} />;

          const dayNum = parseInt(dateKey.split('-')[2]);
          const dayEntries = byDate[dateKey] ?? [];
          const isToday = dateKey === todayKey;
          const hasStaff = dayEntries.length > 0;
          const uniqueStaff = Array.from(new Map(dayEntries.map(e => [e.userId, e])).values());

          return (
            <div
              key={dateKey}
              className={`rounded-xl p-2 border transition-all ${
                isToday
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : hasStaff
                  ? 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-400 hover:shadow-md cursor-pointer'
                  : 'border-slate-100 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
              style={{ minHeight: '80px' }}
              onMouseEnter={hasStaff ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = rect.right + 10 > window.innerWidth - 280 ? rect.left - 280 : rect.right + 10;
                setHovered({ dateKey, x, y: Math.min(rect.top, window.innerHeight - 320) });
              } : undefined}
              onMouseLeave={() => setHovered(null)}
            >
              <div className={`text-xs font-black mb-1.5 ${isToday ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                {isToday ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-white text-[10px]">{dayNum}</span>
                ) : dayNum}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {uniqueStaff.slice(0, 4).map(e => (
                  <div key={e.userId}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black ring-1 ring-white dark:ring-slate-700"
                    style={{ backgroundColor: ROLE_CLR[e.role] ?? '#6B7280' }}>
                    {(e.name[0] ?? '?').toUpperCase()}
                  </div>
                ))}
                {uniqueStaff.length > 4 && (
                  <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-[8px] font-bold text-slate-600 dark:text-slate-300">
                    +{uniqueStaff.length - 4}
                  </div>
                )}
              </div>
              {hasStaff && (
                <div className="mt-1.5 text-[9px] text-slate-400">
                  {dayEntries.length} session{dayEntries.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        {Object.entries(ROLE_CLR).map(([role, color]) => (
          <div key={role} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-slate-500 capitalize">{role}</span>
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hovered && hoveredEntries.length > 0 && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 w-72 pointer-events-none"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <p className="text-xs font-black text-white mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
            {new Date(hovered.dateKey + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="space-y-3">
            {hoveredEntries.map(e => (
              <div key={e.id} className="flex items-start gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black flex-shrink-0 ring-2 ring-white dark:ring-slate-700"
                  style={{ backgroundColor: ROLE_CLR[e.role] ?? '#6B7280' }}>
                  {(e.name[0] ?? '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white leading-tight">{e.name}</p>
                  <p className="text-[10px] text-slate-400 capitalize mb-1">{e.role}</p>
                  <div className="text-[10px] space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">In:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtTimeLocal(e.clockIn)}</span>
                    </div>
                    {e.clockOut ? (
                      <>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Out:</span>
                          <span className="font-bold text-red-500">{fmtTimeLocal(e.clockOut)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">{fmtWorked(e.clockIn, e.clockOut)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="font-bold text-amber-500">Currently clocked in</p>
                    )}
                    {e.note && <p className="text-slate-400 italic truncate">"{e.note}"</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function PerformancePage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tkEntries, setTkEntries] = useState<TKEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD
  const [view, setView] = useState<'stats' | 'calendar'>('stats');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      if (s.role !== 'admin' && s.role !== 'manager' && s.role !== 'host') { router.push('/login'); return; }
      setSession(s);
    });
    Promise.all([
      fetch('/api/sales', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/timekeeping').then(r => r.json()),
    ]).then(([salesData, tkData]) => {
      if (salesData?.error) setError(salesData.error);
      else setOrders(Array.isArray(salesData) ? salesData : []);
      setTkEntries(Array.isArray(tkData) ? tkData : []);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, []);

  // All available show dates sorted newest â†’ oldest
  const showDates = useMemo(() => {
    const tabs = Array.from(new Set(orders.map(o => o.tab).filter(Boolean)));
    return tabs
      .sort((a, b) => parseTabDate(b).getTime() - parseTabDate(a).getTime())
      .map(tabToISO)
      .filter(Boolean);
  }, [orders]);

  // Default to most recent date once data loads
  useEffect(() => {
    if (showDates.length > 0 && !selectedDate) {
      setSelectedDate(showDates[0]);
    }
  }, [showDates]);

  // Prev / Next navigable dates
  const currentIdx = showDates.indexOf(selectedDate);
  const prevDate = currentIdx < showDates.length - 1 ? showDates[currentIdx + 1] : null; // older
  const nextDate = currentIdx > 0 ? showDates[currentIdx - 1] : null;                   // newer

  // Orders for selected date
  const dayOrders = useMemo(() => {
    if (!selectedDate) return [];
    const targetTab = isoToTab(selectedDate);
    return orders.filter(o => o.tab === targetTab);
  }, [orders, selectedDate]);

  const hostStats = useMemo(() => computeHostStats(dayOrders), [dayOrders]);

  // Hosts only see their own shows â€” flexible name matching (handles partial / reversed names)
  const visibleHostStats = useMemo(() => {
    if (session?.role !== 'host') return hostStats;
    const myName = session.name.toLowerCase().trim();
    return hostStats.filter(hs => {
      const h = hs.host.toLowerCase().trim();
      return h === myName || h.includes(myName) || myName.includes(h);
    });
  }, [hostStats, session]);

  const hostDayOrders = useMemo(() => {
    if (session?.role !== 'host') return dayOrders;
    const myName = session.name.toLowerCase().trim();
    return dayOrders.filter(o => {
      const h = (o.host ?? '').toLowerCase().trim();
      return h === myName || h.includes(myName) || myName.includes(h);
    });
  }, [dayOrders, session]);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Performance</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setView('stats')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${view === 'stats' ? 'bg-white dark:bg-slate-800 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              >
                Show Stats
              </button>
              <button
                onClick={() => setView('calendar')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${view === 'calendar' ? 'bg-white dark:bg-slate-800 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Team Calendar
              </button>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading...</div>
          ) : error ? (
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 border-l-4 border-l-red-500 rounded-xl p-6">
              <p className="font-bold text-red-600 mb-1">Error loading data</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{error}</p>
            </div>
          ) : view === 'calendar' ? (
            <TeamCalendar entries={tkEntries} />
          ) : (
            <>
              {/* Date picker bar */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mb-6 flex items-center justify-between gap-4">
                <button
                  onClick={() => prevDate && setSelectedDate(prevDate)}
                  disabled={!prevDate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Prev Show
                </button>

                <div className="flex items-center gap-3 flex-1 justify-center">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Show Date</p>
                    <p className="text-lg font-black text-white">
                      {selectedDate ? isoToDisplay(selectedDate) : 'â€”'}
                    </p>
                  </div>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>

                <button
                  onClick={() => nextDate && setSelectedDate(nextDate)}
                  disabled={!nextDate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next Show
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              {/* Results */}
              {dayOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="text-4xl mb-3">ðŸ“…</div>
                  <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No show data for this date</p>
                  <p className="text-slate-400 text-xs mt-1">Try a different date or use the arrows to navigate</p>
                </div>
              ) : (
                <>
                  {/* Summary row */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-black text-white text-base">
                        {isoToDisplay(selectedDate)}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {visibleHostStats.length} livestream{visibleHostStats.length !== 1 ? 's' : ''} Â· {hostDayOrders.length} orders
                      </p>
                    </div>
                  </div>

                  <PayTierBoard hostStats={visibleHostStats} />

                  {/* Host cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                    {visibleHostStats.map((hs, idx) => {
                      const color           = HOST_COLORS[hs.colorIdx % HOST_COLORS.length];
                      const profitPerHour   = hs.durationHours > 0 ? hs.totalProfit / hs.durationHours : null;
                      const revenuePerHour  = hs.durationHours > 0 ? hs.totalSales  / hs.durationHours : null;
                      const ordersPerHour   = hs.durationHours > 0 ? hs.totalOrders / hs.durationHours : null;
                      const tier            = getPayTier(profitPerHour);
                      const estimatedPay    = tier && hs.durationHours > 0 ? tier.pay * hs.durationHours : null;

                      const stats = [
                        {
                          label: 'Total Sales',
                          value: `$${fmtMoney(hs.totalSales)}`,
                          valueClass: 'text-white font-black',
                        },
                        {
                          label: 'Orders / Units',
                          value: hs.totalOrders === hs.totalUnits
                            ? `${hs.totalOrders}`
                            : `${hs.totalOrders} / ${hs.totalUnits}`,
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                        {
                          label: 'Show Duration',
                          value: hs.durationHours > 0 ? fmtDuration(hs.durationHours) : hs.totalOrders < 2 ? 'N/A (1 order)' : 'â€”',
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                        {
                          label: 'Gross Profit',
                          value: `$${fmtMoney(hs.totalProfit)}`,
                          valueClass: `font-black ${hs.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`,
                        },
                        {
                          label: 'Overall Margin',
                          value: `${hs.overallMargin.toFixed(1)}%`,
                          valueClass: `font-black ${hs.overallMargin >= 15 ? 'text-emerald-600 dark:text-emerald-400' : hs.overallMargin >= 0 ? 'text-amber-500' : 'text-red-500'}`,
                        },
                        {
                          label: 'Profit per Hour',
                          value: profitPerHour !== null ? `$${fmtMoney(profitPerHour)}/hr` : 'â€”',
                          valueClass: `font-black ${profitPerHour !== null && profitPerHour >= 300 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`,
                        },
                        {
                          label: 'Revenue per Hour',
                          value: revenuePerHour !== null ? `$${fmtMoney(revenuePerHour)}` : 'â€”',
                          valueClass: 'text-slate-500 dark:text-slate-400 font-bold',
                        },
                        {
                          label: 'Orders per Hour',
                          value: ordersPerHour !== null ? String(Math.round(ordersPerHour)) : 'â€”',
                          valueClass: 'text-slate-700 dark:text-slate-300 font-bold',
                        },
                      ];

                      return (
                        <div
                          key={`${hs.host}|${hs.livestream}`}
                          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                        >
                          {/* Host name bar */}
                          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: `3px solid ${color}` }}>
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: color }}
                            >
                              {hs.host[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-white text-base leading-tight">{hs.host}</p>
                              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>
                                Livestream {idx + 1}
                              </p>
                            </div>
                            {/* Pay rate badge in header */}
                            {tier && (
                              <div className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-center ${tier.bg} ${tier.border}`}>
                                <p className={`text-base font-black leading-none ${tier.text}`}>{tier.label}</p>
                                <p className={`text-[9px] font-bold mt-0.5 ${tier.text} opacity-70`}>pay rate</p>
                              </div>
                            )}
                          </div>

                          {/* Stats list */}
                          <div className="px-5 py-4 space-y-3">
                            {stats.map(s => (
                              <div key={s.label} className="flex items-center justify-between gap-2">
                                <span className="text-sm text-slate-500 dark:text-slate-400">{s.label}</span>
                                <span className={`text-sm ${s.valueClass}`}>{s.value}</span>
                              </div>
                            ))}
                          </div>

                          {/* Pay rate footer */}
                          {hs.durationHours > 0 && (
                            <div className={`px-5 py-3 border-t border-slate-100 dark:border-slate-700 ${tier ? `${tier.bg} ${tier.border}` : 'bg-slate-50 dark:bg-slate-700/30'}`}>
                              {tier ? (
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className={`text-xs font-black ${tier.text}`}>Estimated Pay This Show</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                      {tier.pay}/hr Ã— {fmtDuration(hs.durationHours)} = <strong>${fmtMoney(estimatedPay!)}</strong>
                                    </p>
                                  </div>
                                  <span className={`text-xl font-black ${tier.text}`}>${fmtMoney(estimatedPay!)}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-400">
                                    {profitPerHour !== null
                                      ? `$${fmtMoney(profitPerHour)}/hr profit â€” needs $300+/hr to qualify for pay tier`
                                      : 'Duration needed to calculate pay rate'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Margin Analyzer â€” admin / manager / host only */}
                  {(session?.role === 'admin' || session?.role === 'manager' || session?.role === 'host') && (
                    <MarginAnalyzer orders={hostDayOrders} />
                  )}

                  <TierHistorySection
                    allOrders={orders}
                    myName={session?.role === 'host' ? session.name : null}
                  />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
