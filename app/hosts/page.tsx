'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import type { ShowPerf, HostPerf, ItemPerf } from '@/lib/whatnot/metrics';
import type { MatchReport } from '@/lib/whatnot/sku';
import type { SyncState } from '@/lib/whatnot/store';
import HostsOverview, { type Overview } from './overview';

type Session = { username: string; role: Role; name: string };

type Perf = {
  configured: boolean;
  range: { days: number; host: string; from: string | null; to: string };
  hostNames: string[];
  shows: ShowPerf[];
  hosts: HostPerf[];
  items: ItemPerf[];
  itemCount: number;
  match: MatchReport;
  unassignedShows: number;
  overview: Overview;
  inventory: { tab: string; demo: boolean; costRows: number; error?: string };
  sync: SyncState & { stats: Record<string, number> };
};

type ShowRow = {
  id: string; title: string; startedAt: string | null; endedAt: string | null;
  sales: string | null; host: string | null; source: string | null;
};

type TabKey = 'hosts' | 'shows' | 'items' | 'setup';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'hosts', label: 'Hosts' },
  { key: 'shows', label: 'Shows' },
  { key: 'items', label: 'Item Margins' },
  { key: 'setup', label: 'Setup' },
];

const RANGES = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: 'All time', value: 0 },
];

// ─── Formatting ─────────────────────────────────────────────────────────────

const money = (n: number | null | undefined, dp = 0) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const int = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
const pct = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(dp)}%`;
const hrs = (n: number) => {
  if (!n) return '—';
  const h = Math.floor(n);
  const m = Math.round((n - h) * 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return y ? `${MONTHS[m - 1]} ${d}` : iso;
};

const TH = 'py-2.5 px-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap';
const THR = `${TH} text-right`;
const TD = 'py-2.5 px-3 text-sm text-slate-700 dark:text-slate-300';
const TDR = `${TD} text-right tabular-nums whitespace-nowrap`;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  const colour = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xl font-black mt-1 ${colour}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center shadow-sm">
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-lg mx-auto leading-relaxed">{body}</p>
    </div>
  );
}

/**
 * Every margin on this page is computed only over the revenue we could put a
 * purchase cost against, so the page says how much that is rather than
 * presenting a partial figure as a whole one.
 */
function CoverageNote({ match }: { match: MatchReport }) {
  const exact = match.byRoute.variant_external_id + match.byRoute.product_external_id + match.byRoute.sku;
  const tone = match.coveragePct >= 85
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300';
  return (
    <div className={`border rounded-xl p-3 ${tone}`}>
      <p className="text-xs leading-relaxed">
        <span className="font-bold">Costs found for {pct(match.coveragePct)} of the item sales we hold.</span>{' '}
        {int(match.matched)} of {int(match.items)} sold items were matched to a purchase cost
        {exact > 0
          ? <> — {int(exact)} by SKU and {int(match.byRoute.title)} by reading the model number out of the title.</>
          : <>, all {int(match.byRoute.title)} of them by reading the model number out of the product title.
              No product in the catalogue has a SKU or external ID set yet; filling those in makes this exact
              instead of a guess.</>}
      </p>
    </div>
  );
}

// ─── Shows ──────────────────────────────────────────────────────────────────

function ShowsTab({ data }: { data: Perf }) {
  if (!data.shows.length) return <Empty title="No shows in this range" body="Widen the range, or run a sync on the Setup tab." />;
  return (
    <div className="space-y-4">
      <CoverageNote match={data.match} />
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Host</th>
                <th className={TH}>Show</th>
                <th className={THR}>On air</th>
                <th className={THR}>Sales</th>
                <th className={THR}>Sales/hr</th>
                <th className={THR}>Payout</th>
                <th className={THR}>Profit</th>
                <th className={THR}>Margin</th>
                <th className={THR}>Orders</th>
                <th className={THR}>AOV</th>
                <th className={THR}>Units</th>
                <th className={THR}>Buyers</th>
                <th className={THR}>Peak</th>
                <th className={THR}>Giveaway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.shows.map(s => (
                <tr key={s.showId} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className={`${TD} whitespace-nowrap`}>{shortDate(s.startedAt)}</td>
                  <td className={`${TD} whitespace-nowrap ${s.host === 'Unassigned' ? 'text-slate-400 italic' : 'font-medium text-slate-900 dark:text-white'}`}>{s.host}</td>
                  <td className={`${TD} max-w-[260px]`}>
                    <span className="block truncate" title={s.title}>{s.title}</span>
                    {s.analyticsMissing && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">analytics not pulled yet</span>
                    )}
                  </td>
                  <td className={TDR}>{hrs(s.hours)}</td>
                  <td className={TDR}>{money(s.sales)}</td>
                  <td className={`${TDR} font-bold`}>{money(s.salesPerHour)}</td>
                  <td className={TDR}>{money(s.estimatedEarnings)}</td>
                  <td className={`${TDR} text-emerald-600 dark:text-emerald-400`}>{money(s.grossProfit)}</td>
                  <td className={TDR}>
                    {pct(s.marginPct)}
                    {s.marginPct !== null && s.costCoveragePct < 80 && (
                      <span className="text-slate-400 text-[10px]"> ({pct(s.costCoveragePct, 0)})</span>
                    )}
                  </td>
                  <td className={TDR}>{int(s.ordersCount)}</td>
                  <td className={TDR}>{money(s.aov, 2)}</td>
                  <td className={TDR}>{int(s.unitsSold)}</td>
                  <td className={TDR}>{int(s.buyers)}</td>
                  <td className={TDR}>{int(s.maxConcurrentViewers)}</td>
                  <td className={`${TDR} text-amber-600 dark:text-amber-400`}>{money(s.giveawaySpend, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Item margins ───────────────────────────────────────────────────────────

function ItemsTab({ data }: { data: Perf }) {
  const [query, setQuery] = useState('');
  const [onlyUncosted, setOnlyUncosted] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.items.filter(i =>
      (!onlyUncosted || !i.costed) &&
      (!q || (i.modelNum ?? '').toLowerCase().includes(q) || i.title.toLowerCase().includes(q)));
  }, [data.items, query, onlyUncosted]);

  const uncosted = data.items.filter(i => !i.costed);
  const lostRevenue = uncosted.reduce((s, i) => s + i.revenue, 0);

  return (
    <div className="space-y-4">
      <CoverageNote match={data.match} />

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Filter by model or name"
          className="flex-1 min-w-[180px] text-sm px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400" />
        <button onClick={() => setOnlyUncosted(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${onlyUncosted
            ? 'bg-amber-500 border-amber-500 text-white'
            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-amber-400'}`}>
          No cost on file ({int(uncosted.length)} · {money(lostRevenue)})
        </button>
        <span className="text-[11px] text-slate-400">
          {int(rows.length)} of {int(data.itemCount)} items
        </span>
      </div>

      {!rows.length ? (
        <Empty title="Nothing matched" body="Clear the filter, or widen the date range." />
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className={TH}>Item</th>
                  <th className={TH}>Model</th>
                  <th className={THR}>Units</th>
                  <th className={THR}>Orders</th>
                  <th className={THR}>Revenue</th>
                  <th className={THR}>Unit cost</th>
                  <th className={THR}>Avg sold</th>
                  <th className={THR}>Profit</th>
                  <th className={THR}>Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((i, idx) => (
                  <tr key={`${i.modelNum ?? i.title}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className={`${TD} max-w-[340px]`}>
                      <span className="block truncate font-medium text-slate-900 dark:text-white" title={i.title}>{i.title || '—'}</span>
                    </td>
                    <td className={`${TD} font-mono text-xs whitespace-nowrap ${i.modelNum ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>
                      {i.modelNum ?? 'unreadable'}
                    </td>
                    <td className={TDR}>{int(i.units)}</td>
                    <td className={TDR}>{int(i.orders)}</td>
                    <td className={TDR}>{money(i.revenue)}</td>
                    <td className={TDR}>{money(i.unitCost, 2)}</td>
                    <td className={TDR}>{money(i.avgPrice, 2)}</td>
                    <td className={`${TDR} ${i.grossProfit == null ? 'text-slate-400'
                      : i.grossProfit < 0 ? 'text-red-600 dark:text-red-400 font-bold'
                      : 'text-emerald-600 dark:text-emerald-400 font-bold'}`}>
                      {i.grossProfit == null ? 'no cost' : money(i.grossProfit)}
                    </td>
                    <td className={TDR}>{pct(i.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Setup ──────────────────────────────────────────────────────────────────

type WebhookInfo = {
  configured: boolean;
  status: {
    received: number; byType: Record<string, number>; lastReceivedAt: string | null;
    rejected: number; lastRejected: { at: string; reason: string } | null;
  };
  recent: { id: string; type: string; at: string; outcome: string; note?: string; ref?: string }[];
  lineupShows: number;
  lineupEntries: number;
  timelines: number;
};

/** Is Whatnot reaching us, and what is it sending. */
function WebhookPanel({ info }: { info: WebhookInfo }) {
  const s = info.status;
  const ago = (iso: string | null) => {
    if (!iso) return 'never';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  };
  const healthy = info.configured && s.received > 0;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live updates from Whatnot (webhooks)</h3>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${healthy
          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
          : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'}`}>
          {!info.configured ? 'Secret missing' : s.received ? `Receiving · last ${ago(s.lastReceivedAt)}` : 'Waiting for the first event'}
        </span>
      </div>

      {!info.configured && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
          WHATNOT_WEBHOOK_SECRET is not set, so every delivery is being turned away for now. Whatnot keeps retrying
          for about 2½ days, so nothing is lost once it is added in Railway.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          ['Events received', s.received],
          ['Turned away', s.rejected],
          ['Shows with a lineup', info.lineupShows],
          ['Parcels timed', info.timelines],
        ].map(([label, n]) => (
          <div key={label as string} className="bg-slate-50 dark:bg-slate-900/40 rounded-lg py-2">
            <p className="text-lg font-black text-slate-900 dark:text-white">{(n as number).toLocaleString('en-US')}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {s.lastRejected && (
        <p className="text-[11px] text-slate-400">
          Last turned away {ago(s.lastRejected.at)}: {s.lastRejected.reason}
        </p>
      )}

      {info.recent.length > 0 && (
        <div className="max-h-48 overflow-y-auto border border-slate-100 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
          {info.recent.map(e => (
            <div key={e.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.outcome === 'processed' ? 'bg-emerald-500' : e.outcome === 'failed' ? 'bg-red-500' : 'bg-slate-300'}`}
                aria-label={e.outcome} />
              <span className="font-mono text-slate-600 dark:text-slate-300">{e.type}</span>
              <span className="text-slate-400 truncate">{e.note ?? e.ref ?? ''}</span>
              <span className="ml-auto text-slate-400 whitespace-nowrap">{ago(e.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupTab({ data, reload }: { data: Perf; reload: () => void }) {
  const [shows, setShows] = useState<ShowRow[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  const loadShows = useCallback(() => {
    fetch('/api/whatnot/hosts', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setShows(Array.isArray(d.shows) ? d.shows : []))
      .catch(() => {});
  }, []);

  useEffect(loadShows, [loadShows]);

  const [hook, setHook] = useState<WebhookInfo | null>(null);
  useEffect(() => {
    const get = () => fetch('/api/whatnot/webhook', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(setHook).catch(() => {});
    get();
    // Deliveries arrive on their own schedule; keep the panel current.
    const t = setInterval(get, 15000);
    return () => clearInterval(t);
  }, []);

  async function sync(body: Record<string, unknown>, label: string) {
    setBusy(label); setMsg('');
    try {
      const r = await fetch('/api/whatnot/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg(d.error ? `Error: ${d.error}` : 'Sync started — progress updates below.');
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
    setBusy('');
  }

  async function seedHosts() {
    setBusy('seed'); setMsg('');
    try {
      const r = await fetch('/api/whatnot/hosts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-from-sheet' }),
      });
      const d = await r.json();
      setMsg(d.error ? `Error: ${d.error}`
        : `Matched ${d.seeded} shows to a host from the sales sheet.${d.note ? ` ${d.note}` : ''}`);
      loadShows(); reload();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    }
    setBusy('');
  }

  async function setHost(showId: string, host: string) {
    setShows(cur => cur.map(s => (s.id === showId ? { ...s, host: host || null, source: 'manual' } : s)));
    await fetch('/api/whatnot/hosts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId, host }),
    });
    reload();
  }

  const running = data.sync.running;
  const visible = onlyUnassigned ? shows.filter(s => !s.host) : shows;
  const known = Array.from(new Set([...data.hostNames, ...shows.map(s => s.host).filter(Boolean) as string[]])).sort();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Orders stored" value={int(data.sync.stats.orders)} />
        <Tile label="Items costed" value={int(data.sync.stats.orderItems)} sub={`${int(data.sync.stats.orders - 0)} orders on file`} />
        <Tile label="Shows" value={int(data.sync.stats.shows)} sub={`${int(data.sync.stats.analytics)} with analytics`} />
        <Tile label="Hosts assigned" value={`${int(data.sync.stats.hostsAssigned)}`} sub={`${int(data.unassignedShows)} still unset`} />
      </div>

      {!data.configured && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs font-bold text-red-800 dark:text-red-300">WHATNOT_API_KEY is not set on this server.</p>
          <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
            Add it in Railway under the service&apos;s Variables tab, then redeploy.
          </p>
        </div>
      )}

      {running && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
          <p className="text-xs font-bold text-blue-800 dark:text-blue-300">
            Syncing {running.what} — {running.note}
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
            {int(running.done)}{running.total ? ` of ${int(running.total)}` : ''} · started {new Date(running.startedAt).toLocaleTimeString()}
          </p>
        </div>
      )}

      {data.sync.lastError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs font-bold text-red-800 dark:text-red-300">
            Last sync failed on {data.sync.lastError.what}: {data.sync.lastError.message}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">1 · Pull from Whatnot</h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            An update stops at the newest order it already has, so it takes a second or two. A backfill walks
            further back and fetches what was sold in each order one request at a time — that part is slow and
            resumes where it left off, so run it more than once.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy || !!running} onClick={() => sync({}, 'update')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500 border-red-500 text-white disabled:opacity-50 hover:bg-red-600 transition-colors">
            {busy === 'update' ? 'Starting…' : 'Update now'}
          </button>
          <button disabled={!!busy || !!running} onClick={() => sync({ days: 180, itemBudget: 6000 }, 'backfill')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:border-red-400 transition-colors">
            {busy === 'backfill' ? 'Starting…' : 'Backfill 180 days'}
          </button>
          <button disabled={!!busy || !!running} onClick={() => sync({ steps: ['items'], itemBudget: 6000 }, 'items')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:border-red-400 transition-colors">
            {busy === 'items' ? 'Starting…' : 'Continue item backfill'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">2 · Say who hosted each show</h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            Whatnot streams everything from the one <span className="font-mono">stackbargains</span> account and
            records no host, so none of the per-host figures work until this is filled in. Seeding reads the host
            column already in your sales sheet and matches it to shows by date; a date with two different hosts is
            left for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button disabled={!!busy} onClick={seedHosts}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500 border-red-500 text-white disabled:opacity-50 hover:bg-red-600 transition-colors">
            {busy === 'seed' ? 'Matching…' : 'Seed hosts from the sales sheet'}
          </button>
          <button onClick={() => setOnlyUnassigned(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${onlyUnassigned
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'}`}>
            {onlyUnassigned ? 'Showing unassigned only' : 'Showing all shows'}
          </button>
          <span className="text-[11px] text-slate-400">{int(visible.length)} shows</span>
        </div>

        {msg && <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-2">{msg}</p>}

        <div className="max-h-[420px] overflow-y-auto border border-slate-100 dark:border-slate-700 rounded-lg">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/40 sticky top-0">
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Show</th>
                <th className={THR}>Sales</th>
                <th className={TH}>Host</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.slice(0, 200).map(s => (
                <tr key={s.id}>
                  <td className={`${TD} whitespace-nowrap text-xs`}>{shortDate(s.startedAt)}</td>
                  <td className={`${TD} max-w-[280px]`}><span className="block truncate text-xs" title={s.title}>{s.title}</span></td>
                  <td className={`${TDR} text-xs`}>{s.sales ? money(parseFloat(s.sales)) : '—'}</td>
                  <td className={TD}>
                    <input
                      list="known-hosts"
                      defaultValue={s.host ?? ''}
                      placeholder="unassigned"
                      onBlur={e => { if (e.target.value !== (s.host ?? '')) setHost(s.id, e.target.value.trim()); }}
                      className="text-xs px-2 py-1 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 dark:text-white w-36 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                    {s.source === 'sheet' && <span className="ml-1 text-[9px] text-slate-400">from sheet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="known-hosts">{known.map(h => <option key={h} value={h} />)}</datalist>
        </div>
      </div>

      {hook && <WebhookPanel info={hook} />}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">3 · Purchase costs</h3>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
          Whatnot never knows what you paid, so margin comes from the <span className="font-mono">{data.inventory.tab}</span> tab
          of the inventory sheet — {int(data.inventory.costRows)} model numbers with a cost on file.
          {data.inventory.demo && ' This server has no Google credentials, so those are sample figures.'}
          {data.inventory.error && ` Sheet error: ${data.inventory.error}`}
        </p>
        {data.match.unmatchedExamples.length > 0 && (
          <>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-3">
              Biggest sales with no cost on file:
            </p>
            <ul className="mt-1 space-y-0.5">
              {data.match.unmatchedExamples.slice(0, 8).map((u, i) => (
                <li key={i} className="text-[11px] text-slate-500 dark:text-slate-400 flex gap-2">
                  <span className="tabular-nums w-16 text-right flex-shrink-0">{money(u.revenue)}</span>
                  <span className="font-mono w-24 flex-shrink-0 truncate">{u.guessed ?? '—'}</span>
                  <span className="truncate">{u.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function HostDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Perf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('hosts');
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const [underline, setUnderline] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  // Measured from the live button so the underline fits labels of any width,
  // and re-measured on resize because the tab row can scroll on a phone.
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab];
      if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab, session]);
  const [days, setDays] = useState(90);
  const [host, setHost] = useState('');

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then((s: Session | null) => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetch(`/api/whatnot/performance?days=${days}&host=${encodeURIComponent(host)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d?.error) { setError(d.error); setData(null); }
        else { setError(''); setData(d as Perf); }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [session, days, host]);

  useEffect(load, [load]);

  // While a sync is running the numbers move; poll so the page keeps up.
  useEffect(() => {
    if (!data?.sync.running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [data?.sync.running, load]);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const selectCls = 'text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-400';

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white">Host &amp; Profit Dashboard</h1>
            <p className="text-xs text-slate-400 hidden sm:block truncate">
              Live from Whatnot, costed against the inventory sheet
            </p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize flex-shrink-0">{session.role}</span>
        </header>

        <div className="relative bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex gap-1 overflow-x-auto flex-shrink-0">
          {/* One underline that glides to the active tab, rather than four
              borders that blink on and off. */}
          <span aria-hidden
            className="absolute bottom-0 h-0.5 bg-red-500 rounded-full transition-[left,width] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
            style={underline} />
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              ref={el => { tabRefs.current[t.key] = el; }}
              className={`px-3 py-3 text-xs font-bold whitespace-nowrap transition-colors duration-200 ${tab === t.key
                ? 'text-red-400'
                : 'text-slate-500 hover:text-slate-200'}`}>
              {t.label}
              {t.key === 'setup' && data && data.unassignedShows > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-amber-500 text-white text-[9px] font-black rounded-full">
                  {data.unassignedShows}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 flex-shrink-0">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Range
            <select value={days} onChange={e => setDays(Number(e.target.value))} className={selectCls}>
              {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            Host
            <select value={host} onChange={e => setHost(e.target.value)} className={selectCls}>
              <option value="">All hosts</option>
              {(data?.hostNames ?? []).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400 transition-colors">
            Refresh
          </button>
          {data && (
            <span className="text-[11px] text-slate-400">
              {int(data.shows.length)} shows · {int(data.sync.stats.orders)} orders stored
            </span>
          )}
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {loading && !data ? (
            <div className="text-center py-16 text-sm text-slate-400">Loading…</div>
          ) : !data ? (
            <Empty title="Nothing loaded" body="Try again in a moment." />
          ) : data.sync.stats.orders === 0 && tab !== 'setup' ? (
            <Empty title="Nothing pulled from Whatnot yet"
              body="Open the Setup tab and run a sync. The first one fetches your shows, orders and what was sold in each — give it a few minutes." />
          ) : (
            // Held at reduced opacity while refetching, never blanked, so a
            // range change doesn't make the layout jump.
            <div className={`transition-opacity duration-300 ${loading ? 'opacity-60' : ''}`}>
             <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:animate-none">
              {tab === 'hosts' && (
                <HostsOverview overview={data.overview} hosts={data.hosts}
                  unassignedShows={data.unassignedShows} days={data.range.days}
                  onGoSetup={() => setTab('setup')} />
              )}
              {tab === 'shows' && <ShowsTab data={data} />}
              {tab === 'items' && <ItemsTab data={data} />}
              {tab === 'setup' && <SetupTab data={data} reload={load} />}
             </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
