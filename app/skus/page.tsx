'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import type { MasterSku, CatalogIssue } from '@/lib/whatnot/catalog';
import type { Bundle, Allocation, AllocationMethod, BundleComponent } from '@/lib/whatnot/bundles';
import type { SyncState } from '@/lib/whatnot/store';

type Session = { username: string; role: Role; name: string };

type Catalog = {
  configured: boolean;
  skus: MasterSku[];
  skuCount: number;
  counts: {
    total: number; linked: number; withCost: number; costFromKit: number;
    listingsWithoutIdentifier: number; stockMismatches: number;
  };
  issues: Record<CatalogIssue, string[]>;
  bundles: Bundle[];
  allocations: Allocation[];
  inventory: { tab: string; demo: boolean; rows: number; error?: string };
  sync: SyncState & { stats: Record<string, number> };
};

type TabKey = 'skus' | 'kits' | 'issues';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'skus', label: 'Master SKUs' },
  { key: 'kits', label: 'Kit Breakouts' },
  { key: 'issues', label: 'Data Issues' },
];

const money = (n: number | null | undefined, dp = 2) =>
  n == null || !Number.isFinite(n) ? '—'
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const int = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
const pct = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(dp)}%`;
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
const INPUT = 'text-sm px-2 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400';

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const c = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'bad' ? 'text-red-600 dark:text-red-400'
    : 'text-slate-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-xl font-black mt-1 ${c}`}>{value}</p>
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

// ─── Master SKUs ────────────────────────────────────────────────────────────

type SkuSort = 'revenue' | 'profit' | 'units' | 'margin' | 'delta' | 'model';

function SkusTab({ data }: { data: Catalog }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SkuSort>('revenue');
  const [filter, setFilter] = useState<'all' | 'unlinked' | 'nocost' | 'mismatch' | 'kitcost'>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = data.skus.filter(s =>
      !q || s.modelNum.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));

    if (filter === 'unlinked') out = out.filter(s => !s.whatnot);
    if (filter === 'nocost') out = out.filter(s => s.unitCost === null);
    if (filter === 'mismatch') out = out.filter(s => s.stockDelta !== null && s.stockDelta !== 0);
    if (filter === 'kitcost') out = out.filter(s => s.costOrigin === 'kit');

    const val = (s: MasterSku) => {
      switch (sort) {
        case 'revenue': return s.revenue;
        case 'profit': return s.grossProfit ?? -Infinity;
        case 'units': return s.unitsSold;
        case 'margin': return s.marginPct ?? -Infinity;
        case 'delta': return s.stockDelta === null ? -Infinity : Math.abs(s.stockDelta);
        case 'model': return 0;
      }
    };
    return sort === 'model'
      ? [...out].sort((a, b) => a.modelNum.localeCompare(b.modelNum))
      : [...out].sort((a, b) => val(b) - val(a) || b.revenue - a.revenue);
  }, [data.skus, query, sort, filter]);

  const FILTERS: [typeof filter, string][] = [
    ['all', `All (${int(data.counts.total)})`],
    ['unlinked', `No Whatnot listing (${int(data.counts.total - data.counts.linked)})`],
    ['nocost', `No cost (${int(data.counts.total - data.counts.withCost)})`],
    ['mismatch', `Stock disagrees (${int(data.counts.stockMismatches)})`],
    ['kitcost', `Costed from a kit (${int(data.counts.costFromKit)})`],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="SKUs tracked" value={int(data.counts.total)} sub={`${int(data.inventory.rows)} on the sheet`} />
        <Tile label="Linked to a listing" value={int(data.counts.linked)}
          sub={`${int(data.counts.total - data.counts.linked)} with none`} />
        <Tile label="Have a cost" value={int(data.counts.withCost)}
          sub={data.counts.costFromKit > 0 ? `${int(data.counts.costFromKit)} allocated from kits` : undefined}
          tone={data.counts.withCost < data.counts.total ? 'warn' : 'good'} />
        <Tile label="Stock disagreements" value={int(data.counts.stockMismatches)}
          tone={data.counts.stockMismatches > 0 ? 'bad' : 'good'}
          sub="Whatnot vs the sheet" />
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Filter by model or description" className={`${INPUT} flex-1 min-w-[200px]`} />
        <select value={sort} onChange={e => setSort(e.target.value as SkuSort)} className={INPUT}>
          <option value="revenue">Sort: revenue</option>
          <option value="profit">Sort: profit</option>
          <option value="units">Sort: units sold</option>
          <option value="margin">Sort: margin</option>
          <option value="delta">Sort: stock gap</option>
          <option value="model">Sort: model number</option>
        </select>
        <span className="text-[11px] text-slate-400">{int(rows.length)} of {int(data.skuCount)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter === k
              ? 'bg-red-500 border-red-500 text-white'
              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {!rows.length ? <Empty title="Nothing matched" body="Clear the filter or the search box." /> : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className={TH}>Model</th>
                  <th className={TH}>Description</th>
                  <th className={THR}>Cost</th>
                  <th className={THR}>Retail</th>
                  <th className={THR}>Sheet qty</th>
                  <th className={THR}>Whatnot qty</th>
                  <th className={THR}>Gap</th>
                  <th className={THR}>Start bid</th>
                  <th className={THR}>Units sold</th>
                  <th className={THR}>Revenue</th>
                  <th className={THR}>Profit</th>
                  <th className={THR}>Margin</th>
                  <th className={TH}>Last sold</th>
                  <th className={TH}>Listing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map(s => (
                  <tr key={s.modelNum} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                    <td className={`${TD} font-mono text-xs whitespace-nowrap text-slate-900 dark:text-white`}>
                      {s.modelNum}
                      {s.isKit && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">KIT</span>}
                    </td>
                    <td className={`${TD} max-w-[260px]`}>
                      <span className="block truncate" title={s.description}>{s.description || '—'}</span>
                    </td>
                    <td className={TDR}>
                      {money(s.unitCost)}
                      {s.costOrigin === 'kit' && (
                        <span className="ml-1 text-[9px] font-bold text-violet-600 dark:text-violet-400"
                          title={`Allocated from ${s.fromKits.join(', ')}`}>kit</span>
                      )}
                    </td>
                    <td className={TDR}>{money(s.retail)}</td>
                    <td className={TDR}>{int(s.sheetQty)}</td>
                    <td className={TDR}>{s.whatnot ? int(s.whatnot.availableQuantity) : '—'}</td>
                    <td className={`${TDR} ${s.stockDelta ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                      {s.stockDelta === null ? '—' : s.stockDelta === 0 ? '0' : (s.stockDelta > 0 ? `+${s.stockDelta}` : s.stockDelta)}
                    </td>
                    <td className={TDR}>{money(s.whatnot?.startPrice ?? null)}</td>
                    <td className={TDR}>{int(s.unitsSold)}</td>
                    <td className={TDR}>{money(s.revenue, 0)}</td>
                    <td className={`${TDR} ${s.grossProfit == null ? 'text-slate-400'
                      : s.grossProfit < 0 ? 'text-red-600 dark:text-red-400 font-bold'
                      : 'text-emerald-600 dark:text-emerald-400 font-bold'}`}>
                      {s.grossProfit == null ? 'no cost' : money(s.grossProfit, 0)}
                    </td>
                    <td className={TDR}>{pct(s.marginPct)}</td>
                    <td className={`${TD} text-xs text-slate-400 whitespace-nowrap`}>{shortDate(s.lastSoldAt)}</td>
                    <td className={TD}>
                      {!s.whatnot ? <span className="text-[10px] text-slate-400">none</span>
                        : s.whatnot.externalIdSet || s.whatnot.skuSet
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">linked</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                              title="Matched only by reading the model number out of the title">by title</span>}
                    </td>
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

// ─── Kit breakouts ──────────────────────────────────────────────────────────

const emptyDraft = () => ({
  id: '', modelNum: '', description: '', purchaseCost: '',
  method: 'by-retail' as AllocationMethod,
  components: [{ modelNum: '', qty: '1', weight: '' }],
});
type Draft = ReturnType<typeof emptyDraft>;

function KitsTab({ data, reload }: { data: Catalog; reload: () => void }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const allocById = useMemo(
    () => Object.fromEntries(data.allocations.map(a => [a.bundleId, a])), [data.allocations]);

  function edit(b: Bundle) {
    setDraft({
      id: b.id, modelNum: b.modelNum, description: b.description,
      purchaseCost: String(b.purchaseCost), method: b.method,
      components: b.components.length
        ? b.components.map(c => ({ modelNum: c.modelNum, qty: String(c.qty), weight: c.weight == null ? '' : String(c.weight) }))
        : [{ modelNum: '', qty: '1', weight: '' }],
    });
    setErrors([]);
  }

  async function save() {
    setSaving(true); setErrors([]);
    const body = {
      id: draft.id || undefined,
      modelNum: draft.modelNum,
      description: draft.description,
      purchaseCost: Number(draft.purchaseCost),
      method: draft.method,
      components: draft.components
        .filter(c => c.modelNum.trim())
        .map(c => ({ modelNum: c.modelNum, qty: Number(c.qty), weight: c.weight === '' ? undefined : Number(c.weight) })),
    };
    const r = await fetch('/api/whatnot/catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.errors || d.error) setErrors(d.errors ?? [d.error]);
    else { setDraft(emptyDraft()); reload(); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm('Delete this kit breakout? Components costed from it will lose that cost.')) return;
    await fetch('/api/whatnot/catalog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (draft.id === id) setDraft(emptyDraft());
    reload();
  }

  const setComp = (i: number, patch: Partial<Draft['components'][number]>) =>
    setDraft(d => ({ ...d, components: d.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
        <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
          <span className="font-bold">What this replaces.</span> A combo kit arrives at one price and gets broken
          into pieces that sell separately, so each piece needs its own cost before any margin on it means anything.
          By value is the default: a $300 kit holding a $400 drill and a $100 battery charges the drill $240 and the
          battery $60. The pieces always add back up to exactly what the kit cost.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {draft.id ? `Editing ${draft.modelNum || 'kit'}` : 'Add a kit breakout'}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={draft.modelNum} onChange={e => setDraft(d => ({ ...d, modelNum: e.target.value }))}
            placeholder="Kit model number" className={INPUT} />
          <input value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Description" className={`${INPUT} sm:col-span-2`} />
          <input value={draft.purchaseCost} onChange={e => setDraft(d => ({ ...d, purchaseCost: e.target.value }))}
            placeholder="What one kit cost" inputMode="decimal" className={INPUT} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Split the cost</span>
          {(['by-retail', 'equal', 'manual'] as AllocationMethod[]).map(m => (
            <button key={m} onClick={() => setDraft(d => ({ ...d, method: m }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${draft.method === m
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
              {m === 'by-retail' ? 'By value' : m === 'equal' ? 'Evenly per unit' : 'Manual weights'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">What comes out of one kit</p>
          {draft.components.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={c.modelNum} onChange={e => setComp(i, { modelNum: e.target.value })}
                placeholder="Component model number" className={`${INPUT} flex-1`} />
              <input value={c.qty} onChange={e => setComp(i, { qty: e.target.value })}
                placeholder="Qty" inputMode="numeric" className={`${INPUT} w-20`} />
              {draft.method === 'manual' && (
                <input value={c.weight} onChange={e => setComp(i, { weight: e.target.value })}
                  placeholder="Weight" inputMode="decimal" className={`${INPUT} w-24`} />
              )}
              <button onClick={() => setDraft(d => ({ ...d, components: d.components.filter((_, j) => j !== i) }))}
                className="px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                aria-label="Remove component">✕</button>
            </div>
          ))}
          <button onClick={() => setDraft(d => ({ ...d, components: [...d.components, { modelNum: '', qty: '1', weight: '' }] }))}
            className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline">+ Add a component</button>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2">
            {errors.map((e, i) => <p key={i} className="text-xs text-red-700 dark:text-red-300">{e}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <button disabled={saving} onClick={save}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-red-500 border-red-500 text-white disabled:opacity-50 hover:bg-red-600 transition-colors">
            {saving ? 'Saving…' : draft.id ? 'Save changes' : 'Add kit'}
          </button>
          {draft.id && (
            <button onClick={() => { setDraft(emptyDraft()); setErrors([]); }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
              Cancel
            </button>
          )}
        </div>
      </div>

      {!data.bundles.length ? (
        <Empty title="No kit breakouts yet"
          body="Add the combo kits you buy and break apart. Every piece then carries a share of what the kit cost, so its margin is real rather than reconciled by hand afterwards." />
      ) : (
        <div className="space-y-3">
          {data.bundles.map(b => {
            const a = allocById[b.id];
            return (
              <div key={b.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      <span className="font-mono">{b.modelNum}</span>
                      {b.description && <span className="font-normal text-slate-400"> · {b.description}</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {money(b.purchaseCost)} per kit · split {a?.effectiveMethod === 'by-retail' ? 'by value'
                        : a?.effectiveMethod === 'manual' ? 'by manual weights' : 'evenly per unit'}
                      {' · '}{b.components.length} component{b.components.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => edit(b)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400">Edit</button>
                    <button onClick={() => remove(b.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-red-400 hover:text-red-500">Delete</button>
                  </div>
                </div>

                {a?.warning && (
                  <div className="px-4 pb-2">
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                      {a.warning}
                    </p>
                  </div>
                )}

                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-900/40 border-y border-slate-100 dark:border-slate-700">
                    <tr>
                      <th className={TH}>Component</th>
                      <th className={THR}>Qty</th>
                      <th className={THR}>Retail</th>
                      <th className={THR}>Share</th>
                      <th className={THR}>Cost each</th>
                      <th className={THR}>Line cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(a?.components ?? []).map(c => (
                      <tr key={c.modelNum}>
                        <td className={`${TD} font-mono text-xs`}>{c.modelNum}</td>
                        <td className={TDR}>{int(c.qty)}</td>
                        <td className={TDR}>{money(c.retail)}</td>
                        <td className={TDR}>{pct(c.share * 100, 0)}</td>
                        <td className={`${TDR} font-bold text-slate-900 dark:text-white`}>{money(c.unitCost)}</td>
                        <td className={TDR}>{money(c.lineCost)}</td>
                      </tr>
                    ))}
                    {a && a.components.length > 0 && (
                      <tr className="bg-slate-50 dark:bg-slate-900/40">
                        <td className={`${TD} font-bold`} colSpan={5}>Adds back up to</td>
                        <td className={`${TDR} font-black text-slate-900 dark:text-white`}>
                          {money(a.components.reduce((s, c) => s + c.lineCost, 0))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Issues ─────────────────────────────────────────────────────────────────

const ISSUE_COPY: Record<CatalogIssue, { title: string; body: string }> = {
  'unlinked-listing': {
    title: 'Whatnot listings with no identifier',
    body: 'Nothing on these listings points back at our model number — no SKU, no external ID. They are matched only by reading the model out of the title, which works for most but not all. Setting external_id on each product makes the cost lookup exact.',
  },
  'stock-mismatch': {
    title: 'Stock counts that disagree',
    body: 'Whatnot and the inventory sheet report different quantities on hand. One of the two is wrong, and the run list trusts the sheet.',
  },
  'no-cost': {
    title: 'Sold, but we cannot say what it cost',
    body: 'These moved units with no purchase cost on file, so they contribute revenue but no margin. Either add them to the inventory sheet or, if they came out of a combo, set up a kit breakout.',
  },
  'sold-not-on-sheet': {
    title: 'Sold on Whatnot, absent from the sheet',
    body: 'These sold but have no row on the inventory sheet at all. Usually a model number typed differently in the two systems.',
  },
  'missing-listing': {
    title: 'On the sheet with no Whatnot listing',
    body: 'Stock we hold that has no product on Whatnot, so it cannot be run until one is created.',
  },
};

function IssuesTab({ data }: { data: Catalog }) {
  const order: CatalogIssue[] = ['no-cost', 'stock-mismatch', 'unlinked-listing', 'sold-not-on-sheet', 'missing-listing'];
  const any = order.some(k => (data.issues[k] ?? []).length > 0);

  if (!any) return <Empty title="Nothing to fix" body="Every SKU has a cost, a listing, and matching stock counts." />;

  return (
    <div className="space-y-4">
      {order.map(k => {
        const rows = data.issues[k] ?? [];
        if (!rows.length) return null;
        const copy = ISSUE_COPY[k];
        return (
          <div key={k} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.title}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                {int(rows.length)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed max-w-3xl">{copy.body}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {rows.slice(0, 200).map((r, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300 max-w-[320px] truncate" title={r}>
                  {r}
                </span>
              ))}
              {rows.length > 200 && <span className="text-[11px] text-slate-400">+{int(rows.length - 200)} more</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SkusPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('skus');

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then((s: Session | null) => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    fetch('/api/whatnot/catalog', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d?.error) { setError(d.error); setData(null); }
        else { setError(''); setData(d as Catalog); }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [session]);

  useEffect(load, [load]);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white">Master SKUs</h1>
            <p className="text-xs text-slate-400 hidden sm:block truncate">
              The inventory sheet, the Whatnot catalogue and what actually sold, in one row each
            </p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize flex-shrink-0">{session.role}</span>
        </header>

        <div className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex gap-1 overflow-x-auto flex-shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${tab === t.key
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
              {t.label}
              {t.key === 'issues' && data && (
                (() => {
                  const n = Object.values(data.issues).reduce((s, a) => s + a.length, 0);
                  return n > 0 ? (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-amber-500 text-white text-[9px] font-black rounded-full">{n}</span>
                  ) : null;
                })()
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={load} className="my-1.5 px-3 py-1 rounded-lg text-xs font-bold border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
            Refresh
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {data?.inventory.demo && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Sample inventory sheet</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                This server has no Google credentials, so costs and quantities are placeholders.
              </p>
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {loading && !data ? (
            <div className="text-center py-16 text-sm text-slate-400">Loading…</div>
          ) : !data ? (
            <Empty title="Nothing loaded" body="Try again in a moment." />
          ) : data.sync.stats.catalogProducts === 0 && tab === 'skus' ? (
            <Empty title="The Whatnot catalogue has not been pulled yet"
              body="Open Host & Profit → Setup and run a sync. The catalogue step fetches every product and its variants, which is where listing IDs, starting bids and Whatnot's own stock counts come from." />
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              {tab === 'skus' && <SkusTab data={data} />}
              {tab === 'kits' && <KitsTab data={data} reload={load} />}
              {tab === 'issues' && <IssuesTab data={data} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
