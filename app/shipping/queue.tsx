'use client';

// Shipments: one day's Whatnot parcels. Anyone on the shipping desk can open
// a row to check what's in the box, make the label, and print it — and
// whoever makes the label is recorded on that shipment.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, I, Menu, Popover, Select, Spinner, Tip, useToast, type MenuItem, type Option } from './ui';
import {
  DueCell, ItemsCell, LabelByCell, LabelPill, ProblemChip, ReportProblemModal, ShipmentPanel,
  btnDark, btnGhost, btnPrimary, needsLabel, plural, recentRequest, timeOf,
  type LabelPhase, type Person, type Problem, type ShipmentRow,
} from './shipmentParts';

type Session = { username: string; role: string; name: string };
type TabInfo = { tab: string; total: number; needsLabel: number };
type QueueSync = { refreshedAt: string | null; running: boolean; error: string | null; pendingContents: number };
type View = 'all' | 'mine';
type WnFilter = 'needs-label' | 'ready' | 'shipped';
type SortKey = 'newest' | 'oldest' | 'due' | 'packing' | 'value' | 'buyer';
/** `by`: a username, 'whatnot' for labels made in Whatnot, or '' for anyone. */
type Extra = { cancel: boolean; overdue: boolean; hazmat: boolean; problems: boolean; multi: boolean; by: string };

const NO_EXTRA: Extra = { cancel: false, overdue: false, hazmat: false, problems: false, multi: false, by: '' };
const omit = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };

function wnBucket(r: ShipmentRow): WnFilter | null {
  const st = r.wn.status;
  if (st === 'created') return 'needs-label';
  if (st === 'label_generated') return 'ready';
  if (st === 'dropped_off' || st === 'in_transit' || st === 'delivered') return 'shipped';
  return null;
}

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

const SORTS: Option[] = [
  { value: 'packing', label: 'Packing order', sub: 'needs label, oldest' },
  { value: 'newest', label: 'Date (Newest)' },
  { value: 'oldest', label: 'Date (Oldest)' },
  { value: 'due', label: 'Due date' },
  { value: 'value', label: 'Value (Highest)' },
  { value: 'buyer', label: 'Buyer (A–Z)' },
];

const rank = (st: string) => (st === 'created' ? 0 : st === 'label_generated' ? 1 : 2);
function sorter(k: SortKey): (a: ShipmentRow, b: ShipmentRow) => number {
  const created = (r: ShipmentRow) => r.wn.createdAt ?? '';
  switch (k) {
    case 'oldest': return (a, b) => created(a).localeCompare(created(b));
    case 'packing': return (a, b) => rank(a.wn.status) - rank(b.wn.status) || created(a).localeCompare(created(b));
    case 'due': return (a, b) => (a.wn.dropoffDue ?? '9').localeCompare(b.wn.dropoffDue ?? '9') || created(a).localeCompare(created(b));
    case 'value': return (a, b) => (b.wn.value ?? -1) - (a.wn.value ?? -1);
    case 'buyer': return (a, b) => (a.wn.buyer ?? '~').localeCompare(b.wn.buyer ?? '~');
    default: return (a, b) => created(b).localeCompare(created(a)) || b.shipmentId.localeCompare(a.shipmentId);
  }
}

// Desktop columns: chevron, shipment, date, items, label status, due, label by, actions.
const COLS = 'xl:grid-cols-[44px_minmax(150px,1.2fr)_84px_minmax(120px,1fr)_minmax(120px,0.85fr)_minmax(140px,1.1fr)_minmax(150px,1fr)_minmax(190px,auto)]';

const chipBase = 'inline-flex items-center gap-2 h-11 px-4 rounded-xl border text-sm font-semibold whitespace-nowrap transition-all duration-150 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/30';
const input = 'h-10 w-full px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-[border-color,box-shadow] focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/15 disabled:opacity-50';

export default function ShipmentQueue({
  session, isManager, onRows, focus,
}: {
  session: Session; isManager: boolean;
  onRows: (rows: ShipmentRow[]) => void; focus: { id: string; n: number } | null;
}) {
  const toast = useToast();

  // ── Data ──
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [tab, setTab] = useState('');
  const tabRef = useRef('');
  const [sync, setSync] = useState<QueueSync | null>(null);
  const [whatnotOn, setWhatnotOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);

  const load = useCallback(async (t: string = tabRef.current, opts: { refresh?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (t) qs.set('tab', t);
    if (opts.refresh) qs.set('refresh', '1');
    try {
      const res = await fetch(`/api/shipments?${qs}`);
      const data = await res.json();
      if (res.ok) {
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTabs(Array.isArray(data.tabs) ? data.tabs : []);
        setSync(data.sync ?? null);
        setWhatnotOn(data.whatnot !== false);
        if (typeof data.tab === 'string') { tabRef.current = data.tab; setTab(data.tab); }
      }
    } catch { /* keep what's on screen; the next poll tries again */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // For "whose error" when reporting a problem on a label made in Whatnot.
    if (isManager) fetch('/api/shipments/people').then(r => (r.ok ? r.json() : [])).then(d => setPeople(Array.isArray(d) ? d : [])).catch(() => {});
  }, [load, isManager]);

  useEffect(() => { onRows(rows); }, [rows, onRows]);

  // Whatnot changes all day: every few seconds while a refresh is filling in, else every minute.
  const busy = Boolean(sync?.running || (sync?.pendingContents ?? 0) > 0);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, busy ? 5000 : 60000);
    return () => clearInterval(t);
  }, [busy, load]);

  // ── Filters ──
  const [view, setView] = useState<View>('all');
  const [wnFilter, setWnFilter] = useState<WnFilter | null>(null);
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const [search, setSearch] = useState('');
  // Managers browse a day newest-first; packers want the most urgent first.
  const [sort, setSort] = useState<SortKey>(isManager ? 'newest' : 'packing');
  const [compact, setCompact] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersBtn = useRef<HTMLButtonElement>(null);
  const extraCount = Object.entries(extra).filter(([k, v]) => (k === 'by' ? Boolean(v) : v)).length;

  const mine = useMemo(() => rows.filter(r => r.handler?.username === session.username), [rows, session.username]);
  const counts = useMemo(() => {
    const c = { all: rows.length, mine: mine.length, 'needs-label': 0, ready: 0, shipped: 0 };
    for (const r of view === 'mine' ? mine : rows) {
      const b = wnBucket(r);
      if (b) c[b]++;
    }
    return c;
  }, [rows, mine, view]);

  // People who made labels on this day, for the "Label made by" filter.
  const makers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.handler) m.set(r.handler.username, r.handler.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return (view === 'mine' ? mine : rows).filter(r => {
      if (wnFilter && wnBucket(r) !== wnFilter) return false;
      if (extra.cancel && !r.wn.requiredActions.includes('order_pending_cancellation')) return false;
      if (extra.overdue && !r.wn.overdue) return false;
      if (extra.hazmat && !r.wn.hazmat) return false;
      if (extra.problems && !r.problems.some(p => !p.dismissed)) return false;
      if (extra.multi && (r.wn.orderCount ?? 0) < 2) return false;
      if (extra.by === 'whatnot' && !(r.wn.hasLabel && !r.handler)) return false;
      if (extra.by && extra.by !== 'whatnot' && r.handler?.username !== extra.by) return false;
      if (!q) return true;
      const hay = [
        r.shipmentId, r.wn.buyer, r.wn.buyerName, r.handler?.name, r.wn.tracking,
        ...(r.wn.lines ?? []).flatMap(l => [l.title, l.orderId]),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).sort(sorter(sort));
  }, [rows, mine, view, wnFilter, extra, search, sort]);

  const filtered = Boolean(wnFilter || extraCount > 0 || search.trim());
  const baseCount = view === 'mine' ? mine.length : rows.length;
  function clearFilters() { setWnFilter(null); setExtra(NO_EXTRA); setSearch(''); }

  // ── Days ──
  const idx = tabs.findIndex(t => t.tab === tab);
  const prevTab = idx >= 0 && idx < tabs.length - 1 ? tabs[idx + 1].tab : null;
  const nextTab = idx > 0 ? tabs[idx - 1].tab : null;
  function goTo(t: string) {
    tabRef.current = t;
    setTab(t);
    setExpanded(new Set());
    load(t);
  }

  // ── Rows opened ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // The bell asks for a row: open it, bring it into view, and mark it briefly.
  useEffect(() => {
    if (!focus || !rows.some(x => x.shipmentId === focus.id)) return;
    setView('all');
    clearFilters();
    setExpanded(prev => new Set(prev).add(focus.id));
    setFlash(focus.id);
    requestAnimationFrame(() => document.getElementById(`ship-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Labels ──
  const [phase, setPhase] = useState<Record<string, LabelPhase>>({});
  const [labelError, setLabelError] = useState<Record<string, string>>({});
  const polls = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const stopWatching = useCallback((id: string) => {
    clearInterval(polls.current.get(id));
    polls.current.delete(id);
    setPhase(p => omit(p, id));
  }, []);

  /** Watch a parcel until its label lands — Whatnot makes it a few seconds after we ask. */
  const watch = useCallback((id: string, buyer: string | null) => {
    if (polls.current.has(id)) return;
    setPhase(p => ({ ...p, [id]: 'waiting' }));
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/shipments/label?id=${id}`);
        const d = await res.json();
        if (res.ok && d.hasLabel) {
          stopWatching(id);
          toast({ text: `Label ready${buyer ? ` for ${buyer}` : ''} — print it from the row.` });
          load();
          return;
        }
      } catch { /* keep trying */ }
      if (tries >= 24) {
        stopWatching(id);
        setLabelError(e => ({ ...e, [id]: 'Whatnot hasn\'t finished this label yet. Refresh in a minute, or check it in Whatnot.' }));
      }
    }, 2500);
    polls.current.set(id, t);
  }, [load, stopWatching, toast]);

  useEffect(() => {
    const p = polls.current;
    return () => { p.forEach(clearInterval); p.clear(); };
  }, []);
  // A request made before a reload is still worth watching.
  useEffect(() => {
    for (const r of rows) if (recentRequest(r) && !polls.current.has(r.shipmentId)) watch(r.shipmentId, r.wn.buyer);
  }, [rows, watch]);

  async function makeLabel(r: ShipmentRow) {
    const id = r.shipmentId;
    const who = r.wn.buyer ?? `#${id}`;
    setLabelError(e => omit(e, id));
    setPhase(p => ({ ...p, [id]: 'requesting' }));
    try {
      const res = await fetch('/api/shipments/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipmentId: id }),
      });
      const d = await res.json().catch(() => ({}));
      setPhase(p => omit(p, id));
      if (res.ok || d.code === 'pending') {
        watch(id, r.wn.buyer);
        if (res.ok) toast({ tone: 'info', text: `Asked Whatnot for ${who}'s label…` });
        load();
        return;
      }
      if (d.code === 'has-label') { toast({ tone: 'info', text: 'That shipment already has a label.' }); load(); return; }
      const msg = d.error || `Something went wrong (${res.status}).`;
      setLabelError(e => ({ ...e, [id]: msg }));
      toast({ tone: 'error', text: msg, action: { label: 'Open in Whatnot', href: r.wn.url } });
    } catch {
      setPhase(p => omit(p, id));
      toast({ tone: 'error', text: 'Network error — check your connection and try again.' });
    }
  }

  async function setProblem(p: Problem, dismissed: boolean) {
    await fetch('/api/shipments/problems', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, dismissed }) });
    load();
  }

  const [reportFor, setReportFor] = useState<string | null>(null);

  // ── Per-row actions ──
  const asking = (r: ShipmentRow) => Boolean(phase[r.shipmentId] || recentRequest(r));
  const printHref = (r: ShipmentRow, labelOnly = false) => `/api/shipments/label/print?id=${r.shipmentId}${labelOnly ? '&doc=label' : ''}`;

  function menuFor(r: ShipmentRow): MenuItem[] {
    const items: MenuItem[] = [];
    const wn = r.wn;
    if (needsLabel(wn)) {
      const blocked = wn.requiredActions.length > 0;
      items.push({
        label: asking(r) ? 'Making label…' : 'Generate Label', icon: <I.tag className="w-4 h-4" />, tone: 'primary',
        disabled: blocked || asking(r), onSelect: () => makeLabel(r),
        hint: blocked ? 'Whatnot needs something sorted first' : asking(r) ? 'Whatnot is working on it' : 'Your name is recorded on this shipment',
      });
    }
    if (wn.hasLabel) {
      items.push(
        { label: 'Print label + packing slip', icon: <I.printer className="w-4 h-4" />, href: printHref(r) },
        { label: 'Print label only', hint: '4×6, no packing slip', icon: <I.printer className="w-4 h-4" />, href: printHref(r, true) },
      );
    }
    items.push({ label: expanded.has(r.shipmentId) ? 'Hide details' : 'Show items & details', icon: <I.box className="w-4 h-4" />, onSelect: () => toggle(r.shipmentId) });
    items.push({ label: 'Open in Whatnot', icon: <I.external className="w-4 h-4" />, href: wn.url });
    if (isManager) items.push('separator', { label: 'Report a problem', icon: <I.flag className="w-4 h-4" />, onSelect: () => setReportFor(r.shipmentId) });
    return items;
  }

  /** The one thing to do next on this row, as a button. */
  const mainAction = (r: ShipmentRow, wide = false) => {
    const wn = r.wn;
    const w = wide ? 'w-full' : '';
    if (needsLabel(wn)) {
      const blocked = wn.requiredActions.length > 0;
      return (
        <Tip content={blocked ? 'Whatnot needs something sorted on this shipment first — see the red tag.' : 'Makes the label in Whatnot with the saved box and service. Your name is recorded on this shipment.'}>
          <button onClick={() => makeLabel(r)} disabled={blocked || asking(r)} className={`${btnPrimary} ${w}`}>
            {asking(r) ? <><Spinner />Making…</> : <><I.tag className="w-4 h-4" />Generate Label</>}
          </button>
        </Tip>
      );
    }
    if (wn.hasLabel) {
      return (
        <Tip content="Opens the label with Whatnot's packing slip. Use ⋯ for the label alone.">
          <a href={printHref(r)} target="_blank" rel="noopener noreferrer" className={`${btnDark} ${w}`}><I.printer className="w-4 h-4" />Print</a>
        </Tip>
      );
    }
    return null;
  };

  const buyerCell = (r: ShipmentRow) => (
    <div className="min-w-0">
      {r.wn.buyer ? (
        <Tip content={<>{r.wn.buyerName && <b className="block">{r.wn.buyerName}</b>}Opens this shipment in Whatnot Seller Hub.</>} align="start">
          <a href={r.wn.url} target="_blank" rel="noopener noreferrer"
            className="block truncate text-[15px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline underline-offset-2">{r.wn.buyer}</a>
        </Tip>
      ) : <span className="block text-[15px] font-semibold text-slate-800 dark:text-slate-100">Shipment</span>}
      <span className="block text-sm text-slate-500 dark:text-slate-400 select-all">#{r.shipmentId}</span>
    </div>
  );

  const chevron = (r: ShipmentRow, open: boolean) => (
    <Tip content={open ? 'Hide details' : 'Show the items, shipment details and who made the label'}>
      <button onClick={() => toggle(r.shipmentId)} aria-expanded={open} aria-controls={`panel-${r.shipmentId}`} aria-label={open ? 'Collapse' : 'Expand'}
        className={`w-9 h-9 grid place-items-center rounded-lg border transition-all duration-200 ${open ? 'bg-blue-100/70 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-white bg-white dark:bg-slate-800'}`}>
        <I.chevron className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${open ? 'rotate-90' : ''}`} />
      </button>
    </Tip>
  );

  // ── Render ──
  const wnChips: { f: WnFilter; label: string; tip: string; icon: JSX.Element; tone: string; on: string }[] = [
    { f: 'needs-label', label: 'Needs Label', tip: 'No label yet', icon: <I.tag className="w-4 h-4" />,
      tone: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200', on: 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-slate-900 bg-amber-100' },
    { f: 'ready', label: 'Ready to Ship', tip: 'Label made, not scanned by USPS yet', icon: <I.box className="w-4 h-4" />,
      tone: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200', on: 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-slate-900 bg-blue-100' },
    { f: 'shipped', label: 'Shipped', tip: 'Dropped off, in transit, or delivered', icon: <I.checkCircle className="w-4 h-4" />,
      tone: 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200', on: 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-900' },
  ];
  const reportRow = rows.find(r => r.shipmentId === reportFor);
  const byOptions: Option[] = [
    { value: '', label: 'Anyone' },
    ...makers.map(([u, n]) => ({ value: u, label: n })),
    { value: 'whatnot', label: 'Made in Whatnot' },
  ];
  const navBtn = `${chipBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed`;

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <Tip content={prevTab ? `Go to ${prevTab}` : 'No earlier day'}>
            <button onClick={() => prevTab && goTo(prevTab)} disabled={!prevTab} className={navBtn}><I.left className="w-4 h-4" />Prev</button>
          </Tip>
          <Tip content={idx >= 0 ? `${plural(tabs[idx].total, 'shipment')} this day · ${tabs[idx].needsLabel} still need a label` : 'No shipments yet'}>
            <span className={`${chipBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-base font-bold min-w-[130px] justify-center`}>
              <I.calendar className="w-[18px] h-[18px] text-slate-500" />{tab || '—'}
            </span>
          </Tip>
          <Tip content={nextTab ? `Go to ${nextTab}` : 'This is the newest day'}>
            <button onClick={() => nextTab && goTo(nextTab)} disabled={!nextTab} className={navBtn}>Next<I.chevron className="w-4 h-4" /></button>
          </Tip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([
            { v: 'all' as const, label: 'All', n: counts.all, tip: 'Every shipment on this day' },
            { v: 'mine' as const, label: 'My Labels', n: counts.mine, tip: 'Shipments you made the label for' },
          ]).map(({ v, label, n, tip }) => {
            const on = view === v;
            return (
              <Tip key={v} content={tip}>
                <button onClick={() => setView(v)} aria-pressed={on}
                  className={`${chipBase} ${on ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                  {label} <span className={on ? 'opacity-80' : 'text-slate-400'}>({n})</span>
                </button>
              </Tip>
            );
          })}
        </div>

        <span className="hidden lg:block w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1" />

        <div className="flex flex-wrap items-center gap-2">
          {wnChips.map(c => {
            const on = wnFilter === c.f;
            return (
              <Tip key={c.f} content={`${c.tip}. ${on ? 'Click again to show all.' : 'Click to show only these.'}`}>
                <button onClick={() => setWnFilter(on ? null : c.f)} aria-pressed={on} className={`${chipBase} ${c.tone} ${on ? c.on : ''}`}>
                  {c.icon}{c.label} <span className="font-medium opacity-80">({counts[c.f]})</span>
                </button>
              </Tip>
            );
          })}
        </div>

        <div className="ml-auto">
          {!whatnotOn ? (
            <span className="text-sm text-slate-500">Whatnot isn&apos;t connected (no WHATNOT_API_KEY).</span>
          ) : (
            <Tip align="end" wide content={<>
              {sync?.refreshedAt ? `Last read from Whatnot at ${new Date(sync.refreshedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.` : 'Reading from Whatnot…'}
              {(sync?.pendingContents ?? 0) > 0 && ` Still reading the items for ${plural(sync?.pendingContents ?? 0, 'shipment')}.`}
              {sync?.error && <span className="block text-red-300 mt-1">Last check failed: {sync.error}</span>}
              <span className="block text-slate-400 mt-1">Refreshes every couple of minutes while this page is open. Click to refresh now.</span>
            </>}>
              <button onClick={() => load(tabRef.current, { refresh: true })} disabled={sync?.running}
                className="inline-flex items-center gap-2 h-11 px-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:cursor-wait">
                <I.refresh className={`w-5 h-5 ${busy ? 'animate-spin [animation-duration:1.4s]' : ''} ${sync?.error ? 'text-red-500' : ''}`} />
                {sync?.running ? 'Checking Whatnot…' : `Updated ${ago(sync?.refreshedAt ?? null)}`}
              </button>
            </Tip>
          )}
        </div>
      </div>

      {/* ── List header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="inline text-xl font-bold text-slate-900 dark:text-white">
            {view === 'mine' ? 'My Labels' : 'Shipments'}{' '}
            <span className="tabular-nums">({filtered ? `${visible.length} of ${baseCount}` : visible.length})</span>
          </h2>
          <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Whoever makes the label is recorded on the shipment</span>
        </div>
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[260px] sm:max-w-[460px]">
          <I.search className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by shipment #, order #, buyer, or item..." aria-label="Search shipments"
            className={`${input} h-11 pl-10 ${search ? 'pr-9' : ''}`} />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
              <I.x className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Tip content="Narrow down: cancel requests, overdue, hazmat, problems, bundles, or who made the label">
          <button ref={filtersBtn} onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen}
            className={`${chipBase} ${extraCount ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <I.filter className="w-[18px] h-[18px]" />Filters
            {extraCount > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs grid place-items-center animate-in zoom-in-50 duration-200">{extraCount}</span>}
          </button>
        </Tip>
        <Popover open={filtersOpen} onClose={() => setFiltersOpen(false)} anchor={filtersBtn} align="end" className="w-72 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Show only</p>
          <div className="space-y-1">
            {([
              ['cancel', 'Cancel requested', 'The buyer asked to cancel'],
              ['overdue', 'Overdue', 'Past the drop-off day'],
              ['hazmat', 'Hazmat', 'Batteries and other hazardous items'],
              ['problems', 'Has problems', 'Someone reported a mistake'],
              ['multi', 'Bundles', 'More than one order in the box'],
            ] as const).map(([k, label, sub]) => (
              <label key={k} className="flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
                <input type="checkbox" checked={extra[k]} onChange={e => setExtra(x => ({ ...x, [k]: e.target.checked }))} className="mt-0.5 w-4 h-4 accent-blue-600" />
                <span><span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span><span className="block text-xs text-slate-400">{sub}</span></span>
              </label>
            ))}
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2">Label made by</p>
          <Select label="Filter by who made the label" value={extra.by} onChange={v => setExtra(x => ({ ...x, by: v }))}
            options={byOptions} icon={I.user} size="sm" />
          <div className="flex justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            <button onClick={() => setExtra(NO_EXTRA)} disabled={!extraCount} className="text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-40">Clear</button>
            <button onClick={() => setFiltersOpen(false)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Done</button>
          </div>
        </Popover>
        <div className="w-48">
          <Select label="Sort shipments" value={sort} options={SORTS} onChange={v => setSort(v as SortKey)} className="!h-11" align="end" />
        </div>
        <Tip content={compact ? 'Roomier rows' : 'Compact rows — fit more on screen'} align="end">
          <button onClick={() => setCompact(c => !c)} aria-pressed={compact} aria-label="Toggle compact rows"
            className={`w-11 h-11 grid place-items-center rounded-xl border transition-colors ${compact ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            <I.list className="w-5 h-5" />
          </button>
        </Tip>
      </div>

      {/* ── List ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className={`hidden xl:grid ${COLS} gap-x-4 items-center px-4 h-12 rounded-t-2xl bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400`}>
          <span />
          <span>Shipment</span>
          <span>Date</span>
          <span>Items</span>
          <span>Label Status</span>
          <span>Due Date</span>
          <span>Label By</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                <div className="space-y-2 flex-1"><div className="h-3.5 w-40 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /><div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /></div>
                <div className="hidden sm:block h-7 w-28 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse" />
                <div className="hidden md:block h-9 w-36 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4 animate-in fade-in duration-300">
            <span className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 grid place-items-center text-slate-400 mb-4"><I.box className="w-7 h-7" /></span>
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {whatnotOn && sync?.running && rows.length === 0 ? 'Getting shipments from Whatnot…'
                : filtered ? 'No shipments match'
                : view === 'mine' ? 'You haven\'t made any labels on this day'
                : 'No shipments found'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {filtered ? 'Try a different filter or search.'
                : view === 'mine' ? 'Labels you make here show up in this list.'
                : whatnotOn && sync?.running ? 'The first load takes a few seconds.' : 'Try a different date.'}
            </p>
            {filtered && <button onClick={clearFilters} className={`${btnGhost} mt-4`}>Clear filters</button>}
            {!filtered && view === 'mine' && rows.length > 0 && <button onClick={() => setView('all')} className={`${btnGhost} mt-4`}>See all shipments</button>}
          </div>
        ) : (
          <div key={tab} className="p-2 space-y-1 animate-in fade-in duration-300 motion-reduce:animate-none">
            {visible.map(r => {
              const id = r.shipmentId;
              const open = expanded.has(id);
              const ph = phase[id];
              const pad = compact ? 'py-2' : 'py-3.5';
              return (
                <div key={id} id={`ship-${id}`}
                  className={`rounded-xl transition-[background-color,box-shadow] duration-300
                    ${open ? 'bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-300 dark:ring-blue-800 shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}
                    ${flash === id ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800' : ''}`}>

                  {/* Desktop row */}
                  <div className={`hidden xl:grid ${COLS} gap-x-4 items-center px-2 ${pad}`}>
                    {chevron(r, open)}
                    {buyerCell(r)}
                    <div className="text-sm">
                      <span className="block text-slate-800 dark:text-slate-100">{r.tab}</span>
                      {r.wn.createdAt && <span className="block text-slate-500 dark:text-slate-400">{timeOf(r.wn.createdAt)}</span>}
                    </div>
                    <ItemsCell wn={r.wn} onOpen={() => toggle(id)} />
                    <div className="flex flex-col items-start gap-1">
                      <LabelPill row={r} phase={ph} />
                      <ProblemChip problems={r.problems} />
                      {labelError[id] && (
                        <Tip content={labelError[id]} wide>
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1"><I.alert className="w-3.5 h-3.5" />Label failed</span>
                        </Tip>
                      )}
                    </div>
                    <DueCell wn={r.wn} />
                    <LabelByCell row={r} />
                    <div className="flex items-center justify-end gap-1">
                      {mainAction(r)}
                      <Menu items={menuFor(r)} />
                    </div>
                  </div>

                  {/* Narrow screens: the same row as a card */}
                  <div className={`xl:hidden flex gap-3 px-2 ${pad}`}>
                    <div className="pt-0.5">{chevron(r, open)}</div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        {buyerCell(r)}
                        <Menu items={menuFor(r)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <span>{r.tab}{r.wn.createdAt ? ` · ${timeOf(r.wn.createdAt)}` : ''}</span>
                        <ItemsCell wn={r.wn} onOpen={() => toggle(id)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <LabelPill row={r} phase={ph} />
                        <ProblemChip problems={r.problems} />
                        <DueCell wn={r.wn} />
                      </div>
                      {(r.handler || r.wn.hasLabel) && <LabelByCell row={r} />}
                      {labelError[id] && <p className="text-sm text-red-600 dark:text-red-400">{labelError[id]}</p>}
                      {mainAction(r, true)}
                    </div>
                  </div>

                  <div id={`panel-${id}`}>
                    <Collapse open={open}>
                      <ShipmentPanel row={r} isManager={isManager} canMake
                        phase={ph} labelError={labelError[id]}
                        onReport={() => setReportFor(id)} onMakeLabel={() => makeLabel(r)} onProblem={setProblem} />
                    </Collapse>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reportRow && (
        <ReportProblemModal row={reportRow} people={people} onClose={() => setReportFor(null)}
          onSaved={text => { setReportFor(null); toast({ text }); load(); }} />
      )}
    </div>
  );
}
