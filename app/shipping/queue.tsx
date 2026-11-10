'use client';

// Assign Shipments: one day's Whatnot parcels (or, for a shipper, the ones
// handed to them) — filter, search, assign, make labels, and open any row to
// see what's in the box.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, I, Menu, Popover, Select, Spinner, Tip, useToast, type MenuItem, type Option } from './ui';
import {
  DueCell, ItemsCell, LabelPill, ProblemChip, ReportProblemModal, ShipmentPanel, StatusPill,
  btnGhost, btnPrimary, plural, recentRequest, timeOf, STATUS_LABEL,
  type Assignment, type LabelPhase, type Person, type Problem, type ShipmentRow,
} from './shipmentParts';

type Session = { username: string; role: string; name: string };
type TabInfo = { tab: string; total: number; unassigned: number; needsLabel: number };
type QueueSync = { refreshedAt: string | null; running: boolean; error: string | null; pendingContents: number };
type AssignFilter = 'all' | 'unassigned' | 'pending' | 'in-progress' | 'resolved';
type WnFilter = 'needs-label' | 'ready' | 'shipped';
type SortKey = 'newest' | 'oldest' | 'due' | 'packing' | 'value' | 'buyer';
type Extra = { cancel: boolean; overdue: boolean; hazmat: boolean; problems: boolean; multi: boolean; assignee: string };

const NO_EXTRA: Extra = { cancel: false, overdue: false, hazmat: false, problems: false, multi: false, assignee: '' };
const key = (r: ShipmentRow) => `${r.shipmentId}|${r.tab}`;
const omit = <T,>(o: Record<string, T>, k: string) => { const n = { ...o }; delete n[k]; return n; };

function wnBucket(r: ShipmentRow): WnFilter | null {
  const st = r.wn?.status;
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
  { value: 'newest', label: 'Date (Newest)' },
  { value: 'oldest', label: 'Date (Oldest)' },
  { value: 'packing', label: 'Packing order', sub: 'needs label, oldest' },
  { value: 'due', label: 'Due date' },
  { value: 'value', label: 'Value (Highest)' },
  { value: 'buyer', label: 'Buyer (A–Z)' },
];

const rank = (st?: string) => (st === 'created' ? 0 : st === 'label_generated' ? 1 : st ? 2 : 3);
function sorter(k: SortKey): (a: ShipmentRow, b: ShipmentRow) => number {
  const created = (r: ShipmentRow) => r.wn?.createdAt ?? '';
  switch (k) {
    case 'oldest': return (a, b) => created(a).localeCompare(created(b));
    case 'packing': return (a, b) => rank(a.wn?.status) - rank(b.wn?.status) || created(a).localeCompare(created(b));
    case 'due': return (a, b) => (a.wn?.dropoffDue ?? '9').localeCompare(b.wn?.dropoffDue ?? '9') || created(a).localeCompare(created(b));
    case 'value': return (a, b) => (b.wn?.value ?? -1) - (a.wn?.value ?? -1);
    case 'buyer': return (a, b) => (a.wn?.buyer ?? '~').localeCompare(b.wn?.buyer ?? '~');
    default: return (a, b) => created(b).localeCompare(created(a)) || b.shipmentId.localeCompare(a.shipmentId);
  }
}

// Desktop columns, as in the design: chevron, shipment, date, items, label,
// due, status, assigned to, actions. Edit mode adds a checkbox in front.
const COLS = 'xl:grid-cols-[44px_minmax(140px,1.15fr)_84px_minmax(118px,0.95fr)_minmax(118px,0.8fr)_minmax(130px,1fr)_minmax(108px,0.75fr)_minmax(260px,2.1fr)_44px]';
const COLS_EDIT = 'xl:grid-cols-[28px_44px_minmax(140px,1.15fr)_84px_minmax(118px,0.95fr)_minmax(118px,0.8fr)_minmax(130px,1fr)_minmax(108px,0.75fr)_minmax(260px,2.1fr)_44px]';

const chipBase = 'inline-flex items-center gap-2 h-11 px-4 rounded-xl border text-sm font-semibold whitespace-nowrap transition-all duration-150 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-blue-500/30';
const input = 'h-10 w-full px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-[border-color,box-shadow] focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/15 disabled:opacity-50';

export default function ShipmentQueue({
  session, isManager, editMode, onExitEdit, onRows, focus,
}: {
  session: Session; isManager: boolean; editMode: boolean; onExitEdit: () => void;
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
  const [statusFilter, setStatusFilter] = useState<AssignFilter>('all');
  const [wnFilter, setWnFilter] = useState<WnFilter | null>(null);
  const [extra, setExtra] = useState<Extra>(NO_EXTRA);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [compact, setCompact] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersBtn = useRef<HTMLButtonElement>(null);
  const extraCount = Object.entries(extra).filter(([k, v]) => (k === 'assignee' ? Boolean(v) : v)).length;

  const counts = useMemo(() => {
    const c = { all: rows.length, unassigned: 0, pending: 0, 'in-progress': 0, resolved: 0, 'needs-label': 0, ready: 0, shipped: 0 };
    for (const r of rows) {
      if (!r.assignment) c.unassigned++; else c[r.assignment.status]++;
      const b = wnBucket(r);
      if (b) c[b]++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, '');
    return rows.filter(r => {
      if (statusFilter === 'unassigned' && r.assignment) return false;
      if (statusFilter !== 'all' && statusFilter !== 'unassigned' && r.assignment?.status !== statusFilter) return false;
      if (wnFilter && wnBucket(r) !== wnFilter) return false;
      if (extra.cancel && !r.wn?.requiredActions.includes('order_pending_cancellation')) return false;
      if (extra.overdue && !r.wn?.overdue) return false;
      if (extra.hazmat && !r.wn?.hazmat) return false;
      if (extra.problems && !r.problems.some(p => !p.dismissed)) return false;
      if (extra.multi && (r.wn?.orderCount ?? 0) < 2) return false;
      if (extra.assignee && r.assignment?.assignedTo !== extra.assignee) return false;
      if (!q) return true;
      const hay = [
        r.shipmentId, r.wn?.buyer, r.wn?.buyerName, r.assignment?.assignedToName, r.assignment?.notes, r.wn?.tracking,
        ...(r.wn?.lines ?? []).flatMap(l => [l.title, l.orderId]),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).sort(sorter(sort));
  }, [rows, statusFilter, wnFilter, extra, search, sort]);

  const filtered = statusFilter !== 'all' || wnFilter || extraCount > 0 || search.trim();
  function clearFilters() { setStatusFilter('all'); setWnFilter(null); setExtra(NO_EXTRA); setSearch(''); }

  // ── Days ──
  const idx = tabs.findIndex(t => t.tab === tab);
  const prevTab = idx >= 0 && idx < tabs.length - 1 ? tabs[idx + 1].tab : null;
  const nextTab = idx > 0 ? tabs[idx - 1].tab : null;
  function goTo(t: string) {
    tabRef.current = t;
    setTab(t);
    setExpanded(new Set());
    setSelected(new Set());
    load(t);
  }

  // ── Rows opened ──
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const toggle = (k: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // The bell asks for a row: open it, bring it into view, and mark it briefly.
  useEffect(() => {
    if (!focus) return;
    const r = rows.find(x => x.shipmentId === focus.id);
    if (!r) return;
    const k = key(r);
    clearFilters();
    setExpanded(prev => new Set(prev).add(k));
    setFlash(k);
    requestAnimationFrame(() => document.getElementById(`ship-${r.shipmentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
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
    for (const r of rows) if (recentRequest(r) && !polls.current.has(r.shipmentId)) watch(r.shipmentId, r.wn?.buyer ?? null);
  }, [rows, watch]);

  async function makeLabel(r: ShipmentRow) {
    const id = r.shipmentId;
    const who = r.wn?.buyer ?? `#${id}`;
    setLabelError(e => omit(e, id));
    setPhase(p => ({ ...p, [id]: 'requesting' }));
    try {
      const res = await fetch('/api/shipments/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipmentId: id }),
      });
      const d = await res.json().catch(() => ({}));
      setPhase(p => omit(p, id));
      if (res.ok || d.code === 'pending') {
        watch(id, r.wn?.buyer ?? null);
        if (res.ok) toast({ tone: 'info', text: `Asked Whatnot for ${who}'s label…` });
        load();
        return;
      }
      if (d.code === 'has-label') { toast({ tone: 'info', text: 'That shipment already has a label.' }); load(); return; }
      const msg = d.error || `Something went wrong (${res.status}).`;
      setLabelError(e => ({ ...e, [id]: msg }));
      toast({ tone: 'error', text: msg, action: r.wn ? { label: 'Open in Whatnot', href: r.wn.url } : undefined });
    } catch {
      setPhase(p => omit(p, id));
      toast({ tone: 'error', text: 'Network error — check your connection and try again.' });
    }
  }

  // ── Assigning ──
  const [assigning, setAssigning] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesState, setNotesState] = useState<Record<string, 'saving' | 'saved'>>({});
  const notesOf = (r: ShipmentRow) => notes[key(r)] ?? r.assignment?.notes ?? '';
  const patchRow = (k: string, f: (r: ShipmentRow) => ShipmentRow) => setRows(rs => rs.map(r => (key(r) === k ? f(r) : r)));

  async function post(body: object, method = 'POST') {
    const res = await fetch('/api/shipments/assign', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ tone: 'error', text: d.error || `Couldn't save (${res.status}).` });
    }
    return res.ok;
  }

  async function assign(r: ShipmentRow, username: string) {
    const p = people.find(x => x.username === username);
    if (!p) return;
    const k = key(r);
    const draft = notesOf(r);
    setAssigning(k);
    const now = new Date().toISOString();
    patchRow(k, x => ({
      ...x, assignment: {
        shipmentId: x.shipmentId, tab: x.tab, assignedTo: p.username, assignedToName: p.name, assignedToRole: p.role,
        assignedBy: session.username, assignedAt: now, status: 'pending', notes: draft, pinged: false, pingMessage: '', pingAt: '',
      },
    }));
    const ok = await post({ shipmentId: r.shipmentId, tab: r.tab, assignedTo: p.username, assignedToName: p.name, assignedToRole: p.role, notes: draft });
    setAssigning(null);
    if (ok) { toast({ text: `${r.wn?.buyer ?? `#${r.shipmentId}`} assigned to ${p.name}` }); setNotes(n => omit(n, k)); }
    load();
  }

  async function commitNotes(r: ShipmentRow) {
    const k = key(r);
    const draft = notes[k];
    if (draft === undefined || !r.assignment || draft === r.assignment.notes) return;
    setNotesState(s => ({ ...s, [k]: 'saving' }));
    const ok = await post({ action: 'notes', shipmentId: r.shipmentId, tab: r.tab, notes: draft });
    if (!ok) { setNotesState(s => omit(s, k)); return; }
    patchRow(k, x => (x.assignment ? { ...x, assignment: { ...x.assignment, notes: draft } } : x));
    setNotes(n => omit(n, k));
    setNotesState(s => ({ ...s, [k]: 'saved' }));
    setTimeout(() => setNotesState(s => omit(s, k)), 1800);
  }

  async function setStatus(r: ShipmentRow, status: Assignment['status']) {
    const k = key(r);
    patchRow(k, x => (x.assignment ? { ...x, assignment: { ...x.assignment, status } } : x));
    if (await post({ shipmentId: r.shipmentId, tab: r.tab, status }, 'PATCH')) toast({ text: `Marked ${STATUS_LABEL[status].toLowerCase()}` });
    load();
  }

  async function unassign(r: ShipmentRow) {
    patchRow(key(r), x => ({ ...x, assignment: null }));
    if (await post({ shipmentId: r.shipmentId, tab: r.tab, remove: true })) toast({ text: 'Assignment removed' });
    load();
  }

  async function acknowledge(r: ShipmentRow) {
    if (await post({ action: 'acknowledge', shipmentId: r.shipmentId, tab: r.tab })) toast({ text: 'Follow-up acknowledged' });
    load();
  }

  async function setProblem(p: Problem, dismissed: boolean) {
    await fetch('/api/shipments/problems', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, dismissed }) });
    load();
  }

  // ── Auto-assign ──
  const [autoCount, setAutoCount] = useState('');
  const [autoUser, setAutoUser] = useState('');
  const [autoNotes, setAutoNotes] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);
  async function autoAssign() {
    const n = parseInt(autoCount, 10);
    const p = people.find(x => x.username === autoUser);
    if (!p || !n || n <= 0) return;
    // Closest to their deadline first: still needing a label, oldest first.
    const pool = rows.filter(r => !r.assignment).sort(sorter('packing')).slice(0, n);
    if (!pool.length) { toast({ tone: 'info', text: 'No unassigned shipments on this day.' }); return; }
    setAutoSaving(true);
    const ok = await post({
      action: 'auto-assign', items: pool.map(r => ({ shipmentId: r.shipmentId, tab: r.tab })),
      assignedTo: p.username, assignedToName: p.name, assignedToRole: p.role, notes: autoNotes,
    });
    setAutoSaving(false);
    if (ok) { toast({ text: `${plural(pool.length, 'shipment')} assigned to ${p.name}` }); setAutoCount(''); setAutoNotes(''); }
    load();
  }

  // ── Bulk edit ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  useEffect(() => { if (!editMode) setSelected(new Set()); }, [editMode]);
  const toggleSelect = (k: string) => setSelected(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allSelected = visible.length > 0 && visible.every(r => selected.has(key(r)));
  async function bulk(action: 'bulk-resolve' | 'bulk-unassign') {
    const items = rows.filter(r => selected.has(key(r))).map(r => ({ shipmentId: r.shipmentId, tab: r.tab }));
    setBulkSaving(true);
    const ok = await post({ action, items });
    setBulkSaving(false);
    if (ok) toast({ text: `${plural(items.length, 'shipment')} ${action === 'bulk-resolve' ? 'resolved' : 'unassigned'}` });
    setSelected(new Set());
    onExitEdit();
    load();
  }

  // ── Modals ──
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [pingFor, setPingFor] = useState<string | null>(null);
  const [pingMsg, setPingMsg] = useState('');
  const [pingSaving, setPingSaving] = useState(false);
  async function sendPing() {
    const r = rows.find(x => key(x) === pingFor);
    if (!r) return;
    setPingSaving(true);
    const ok = await post({ action: 'ping', shipmentId: r.shipmentId, tab: r.tab, pingMessage: pingMsg });
    setPingSaving(false);
    setPingFor(null);
    setPingMsg('');
    if (ok) toast({ text: `Follow-up sent to ${r.assignment?.assignedToName ?? 'them'}` });
    load();
  }

  // ── Per-row permissions and menu ──
  const canMake = (r: ShipmentRow) => isManager || r.assignment?.assignedTo === session.username;
  const canPrint = (r: ShipmentRow) => canMake(r) || r.events.some(e => e.kind === 'label-requested' && e.by === session.username);
  const peopleOptions: Option[] = people.map(p => ({ value: p.username, label: `${p.name} (${p.role})` }));

  function menuFor(r: ShipmentRow): MenuItem[] {
    const k = key(r);
    const items: MenuItem[] = [];
    const wn = r.wn;
    const asking = Boolean(phase[r.shipmentId] || recentRequest(r));
    if (wn && wn.status === 'created' && !wn.pickup && canMake(r)) {
      const blocked = wn.requiredActions.length > 0;
      items.push({
        label: asking ? 'Making label…' : 'Generate Label', icon: <I.tag className="w-4 h-4" />, tone: 'primary',
        disabled: blocked || asking, onSelect: () => makeLabel(r),
        hint: blocked ? 'Whatnot needs something sorted first' : asking ? 'Whatnot is working on it' : 'Uses the saved box and service; your name goes on it',
      });
    }
    if (wn?.hasLabel && canPrint(r)) {
      items.push(
        { label: 'Print label + packing slip', icon: <I.printer className="w-4 h-4" />, href: `/api/shipments/label/print?id=${r.shipmentId}` },
        { label: 'Print label only', hint: '4×6, no packing slip', icon: <I.printer className="w-4 h-4" />, href: `/api/shipments/label/print?id=${r.shipmentId}&doc=label` },
      );
    }
    items.push({ label: expanded.has(k) ? 'Hide details' : 'Show items & details', icon: <I.box className="w-4 h-4" />, onSelect: () => toggle(k) });
    if (wn) items.push({ label: 'Open in Whatnot', icon: <I.external className="w-4 h-4" />, href: wn.url });

    const a = r.assignment;
    if (isManager) {
      if (a) {
        items.push('separator');
        for (const s of ['pending', 'in-progress', 'resolved'] as const) {
          if (s !== a.status) items.push({ label: `Mark ${STATUS_LABEL[s].toLowerCase()}`, icon: <I.checkCircle className="w-4 h-4" />, onSelect: () => setStatus(r, s) });
        }
        if (a.status !== 'resolved') items.push({ label: a.pinged ? 'Send another follow-up' : 'Send a follow-up', icon: <I.megaphone className="w-4 h-4" />, hint: `Pings ${a.assignedToName} on their list`, onSelect: () => { setPingFor(k); setPingMsg(''); } });
      }
      items.push({ label: 'Report a problem', icon: <I.flag className="w-4 h-4" />, onSelect: () => setReportFor(k) });
      if (a) items.push('separator', { label: 'Remove assignment', icon: <I.trash className="w-4 h-4" />, tone: 'danger', onSelect: () => unassign(r) });
    } else if (a && a.assignedTo === session.username) {
      items.push('separator');
      if (a.status === 'pending') items.push({ label: 'Start', icon: <I.play className="w-4 h-4" />, onSelect: () => setStatus(r, 'in-progress') });
      if (a.status !== 'resolved') items.push({ label: 'Mark resolved', icon: <I.checkCircle className="w-4 h-4" />, onSelect: () => setStatus(r, 'resolved') });
      if (a.pinged) items.push({ label: 'Acknowledge follow-up', icon: <I.megaphone className="w-4 h-4" />, hint: a.pingMessage || undefined, onSelect: () => acknowledge(r) });
    }
    return items;
  }

  // ── Pieces ──
  const assignedCell = (r: ShipmentRow) => {
    const k = key(r);
    const a = r.assignment;
    const notesInput = (
      <Tip content={a ? (isManager || canMake(r) ? 'Notes for whoever packs it. Saved when you click away.' : null) : 'Saved when the shipment is assigned.'} className="w-full">
        <div className="relative w-full">
          <I.chat className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={notesOf(r)} placeholder="Notes" aria-label="Notes"
            disabled={!isManager && !canMake(r)}
            onChange={e => setNotes(n => ({ ...n, [k]: e.target.value }))}
            onBlur={() => commitNotes(r)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className={`${input} pl-9 pr-7`} />
          {notesState[k] && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-in fade-in zoom-in-50 duration-200">
              {notesState[k] === 'saving' ? <Spinner className="w-3.5 h-3.5 text-slate-400" /> : <I.check className="w-3.5 h-3.5 text-emerald-500" />}
            </span>
          )}
        </div>
      </Tip>
    );
    if (!isManager) {
      return <div className="w-full">{notesInput}</div>;
    }
    return (
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-2 w-full">
        <Select label={`Assign shipment ${r.shipmentId}`} value={a?.assignedTo ?? ''} options={peopleOptions}
          onChange={u => assign(r, u)} placeholder="— Assign to —" icon={I.user} busy={assigning === k}
          disabled={a?.status === 'resolved'} />
        {notesInput}
      </div>
    );
  };

  const buyerCell = (r: ShipmentRow) => (
    <div className="min-w-0">
      {r.wn?.buyer ? (
        <Tip content={<>{r.wn.buyerName && <b className="block">{r.wn.buyerName}</b>}Opens this shipment in Whatnot Seller Hub.</>} align="start">
          <a href={r.wn.url} target="_blank" rel="noopener noreferrer"
            className="block truncate text-[15px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline underline-offset-2">{r.wn.buyer}</a>
        </Tip>
      ) : <span className="block text-[15px] font-semibold text-slate-800 dark:text-slate-100">Shipment</span>}
      <span className="block text-sm text-slate-500 dark:text-slate-400 select-all">#{r.shipmentId}</span>
    </div>
  );

  const chevron = (r: ShipmentRow, open: boolean) => (
    <Tip content={open ? 'Hide details' : 'Show items, shipment details and assignment'}>
      <button onClick={() => toggle(key(r))} aria-expanded={open} aria-controls={`panel-${r.shipmentId}`} aria-label={open ? 'Collapse' : 'Expand'}
        className={`w-9 h-9 grid place-items-center rounded-lg border transition-all duration-200 ${open ? 'bg-blue-100/70 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:hover:text-white bg-white dark:bg-slate-800'}`}>
        <I.chevron className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${open ? 'rotate-90' : ''}`} />
      </button>
    </Tip>
  );

  const checkbox = (k: string) => (
    <input type="checkbox" checked={selected.has(k)} onChange={() => toggleSelect(k)} aria-label="Select shipment"
      className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
  );

  // ── Render ──
  const assignChips: { f: AssignFilter; label: string; tip: string }[] = [
    { f: 'all', label: 'All', tip: isManager ? 'Every shipment on this day' : 'Everything assigned to you' },
    { f: 'unassigned', label: 'Unassigned', tip: 'Not given to anyone yet' },
    { f: 'pending', label: 'Pending', tip: 'Assigned, not started' },
    { f: 'in-progress', label: 'In Progress', tip: 'Someone is working on it — making a label counts as starting' },
    { f: 'resolved', label: 'Resolved', tip: 'Marked done' },
  ];
  const wnChips: { f: WnFilter; label: string; tip: string; icon: JSX.Element; tone: string; on: string }[] = [
    { f: 'needs-label', label: 'Needs Label', tip: 'Whatnot hasn\'t made the label yet', icon: <I.tag className="w-4 h-4" />,
      tone: 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200', on: 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-slate-900 bg-amber-100' },
    { f: 'ready', label: 'Ready to Ship', tip: 'Label made, not scanned by USPS yet', icon: <I.box className="w-4 h-4" />,
      tone: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200', on: 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-slate-900 bg-blue-100' },
    { f: 'shipped', label: 'Shipped', tip: 'Dropped off, in transit, or delivered', icon: <I.checkCircle className="w-4 h-4" />,
      tone: 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200', on: 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-900' },
  ];
  const unassigned = counts.unassigned;
  const reportRow = rows.find(r => key(r) === reportFor);
  const pingRow = rows.find(r => key(r) === pingFor);

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {isManager && (
          <div className="flex items-center gap-2">
            <Tip content={prevTab ? `Go to ${prevTab}` : 'No earlier day'}>
              <button onClick={() => prevTab && goTo(prevTab)} disabled={!prevTab} className={`${chipBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed`}>
                <I.left className="w-4 h-4" />Prev
              </button>
            </Tip>
            <Tip content={tabs.find(t => t.tab === tab) ? `${plural(tabs[idx].total, 'shipment')} this day · ${tabs[idx].needsLabel} still need a label` : 'No shipments yet'}>
              <span className={`${chipBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white text-base font-bold min-w-[130px] justify-center`}>
                <I.calendar className="w-[18px] h-[18px] text-slate-500" />{tab || '—'}
              </span>
            </Tip>
            <Tip content={nextTab ? `Go to ${nextTab}` : 'This is the newest day'}>
              <button onClick={() => nextTab && goTo(nextTab)} disabled={!nextTab} className={`${chipBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed`}>
                Next<I.chevron className="w-4 h-4" />
              </button>
            </Tip>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {assignChips.filter(c => isManager || c.f !== 'unassigned').map(({ f, label, tip }) => {
            const n = f === 'all' ? counts.all : counts[f];
            const on = statusFilter === f;
            return (
              <Tip key={f} content={tip}>
                <button onClick={() => setStatusFilter(f)} aria-pressed={on}
                  className={`${chipBase} ${on ? 'bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900 shadow-sm' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                  {label}
                  {(f === 'all' || f === 'unassigned' || n > 0) && <span className={on ? 'opacity-80' : 'text-slate-400'}>({n})</span>}
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
            <span className="text-sm text-slate-500">Whatnot isn&apos;t connected — showing the shipment sheet only.</span>
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

      {/* ── Auto-assign ── */}
      {isManager && unassigned > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-4 sm:p-5 flex flex-wrap lg:flex-nowrap items-end lg:items-center gap-4 lg:gap-6 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex items-center gap-4 lg:pr-6 lg:border-r border-slate-200 dark:border-slate-700 basis-full lg:basis-auto">
            <span className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 grid place-items-center flex-shrink-0"><I.bolt className="w-7 h-7" /></span>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Auto-Assign</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{plural(unassigned, 'unassigned shipment')}</p>
            </div>
          </div>
          <label className="w-28">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Qty</span>
            <input type="number" min={1} max={unassigned} value={autoCount} onChange={e => setAutoCount(e.target.value)} placeholder="Qty" className={`${input} h-11`} />
          </label>
          <div className="w-full sm:w-64">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">To</span>
            <Select label="Assign to" value={autoUser} options={peopleOptions} onChange={setAutoUser} placeholder="— Select assignee —" icon={I.user} className="!h-11" />
          </div>
          <label className="flex-1 min-w-[200px]">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Notes <span className="normal-case font-medium tracking-normal text-slate-400">(Optional)</span></span>
            <input value={autoNotes} onChange={e => setAutoNotes(e.target.value)} placeholder="Add a note (e.g., priority, item type, etc.)" className={`${input} h-11`} />
          </label>
          <Tip content={!autoUser || !autoCount ? 'Pick how many and who first.' : `Gives ${autoCount} of the unassigned shipments to them — the ones that still need a label, oldest first.`}>
            <button onClick={autoAssign} disabled={!autoUser || !autoCount || autoSaving} className={`${btnPrimary} !h-12 !px-6 !text-base !rounded-xl`}>
              {autoSaving ? <Spinner className="w-5 h-5" /> : <I.bolt className="w-5 h-5" />}Assign Shipments
            </button>
          </Tip>
        </section>
      )}

      {/* ── List header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="inline text-xl font-bold text-slate-900 dark:text-white">
            {isManager ? 'Shipments' : 'My Shipments'}{' '}
            <span className="tabular-nums">({filtered ? `${visible.length} of ${rows.length}` : rows.length})</span>
          </h2>
          <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">
            {isManager ? 'Assign, label, and process shipments' : 'Make the label here so it\'s recorded as yours'}
          </span>
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
        <Tip content="Narrow down: cancel requests, overdue, hazmat, problems, bundles, or one person's shipments">
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
          {isManager && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2">Assigned to</p>
              <Select label="Filter by person" value={extra.assignee} onChange={v => setExtra(x => ({ ...x, assignee: v }))}
                options={[{ value: '', label: 'Anyone' }, ...peopleOptions]} icon={I.user} size="sm" />
            </>
          )}
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

      {/* ── Bulk bar ── */}
      {editMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <label className="flex items-center gap-2 text-sm font-semibold text-white cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map(key)))} className="w-4 h-4 accent-blue-500" />
            {selected.size ? `${selected.size} selected` : 'Select all shown'}
          </label>
          <div className="ml-auto flex gap-2">
            {isManager && (
              <button onClick={() => bulk('bulk-unassign')} disabled={!selected.size || bulkSaving} className="h-9 px-3.5 rounded-lg bg-slate-700 dark:bg-slate-600 hover:bg-slate-600 text-white text-sm font-semibold disabled:opacity-40">Unassign</button>
            )}
            <button onClick={() => bulk('bulk-resolve')} disabled={!selected.size || bulkSaving} className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40">Mark resolved</button>
            <button onClick={onExitEdit} className="h-9 px-3 rounded-lg text-slate-300 hover:text-white text-sm font-semibold">Done</button>
          </div>
        </div>
      )}

      {/* ── List ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className={`hidden xl:grid ${editMode ? COLS_EDIT : COLS} gap-x-4 items-center px-4 h-12 rounded-t-2xl bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400`}>
          {editMode && <span />}
          <span />
          <span>Shipment</span>
          <span>Date</span>
          <span>Items</span>
          <span>Label Status</span>
          <span>Due Date</span>
          <span>Status</span>
          <span>{isManager ? 'Assigned To' : 'Notes'}</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
                <div className="space-y-2 flex-1"><div className="h-3.5 w-40 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /><div className="h-3 w-24 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" /></div>
                <div className="hidden sm:block h-7 w-28 rounded-full bg-slate-100 dark:bg-slate-700 animate-pulse" />
                <div className="hidden md:block h-10 w-64 rounded-lg bg-slate-100 dark:bg-slate-700 animate-pulse" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4 animate-in fade-in duration-300">
            <span className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 grid place-items-center text-slate-400 mb-4"><I.box className="w-7 h-7" /></span>
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {whatnotOn && sync?.running && rows.length === 0 ? 'Getting shipments from Whatnot…' : filtered ? 'No shipments match' : 'No shipments found'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {filtered ? 'Try a different filter or search.' : !isManager ? 'Nothing is assigned to you yet.' : whatnotOn && sync?.running ? 'The first load takes a few seconds.' : 'Try a different date.'}
            </p>
            {filtered && <button onClick={clearFilters} className={`${btnGhost} mt-4`}>Clear filters</button>}
          </div>
        ) : (
          <div key={tab} className="p-2 space-y-1 animate-in fade-in duration-300 motion-reduce:animate-none">
            {visible.map(r => {
              const k = key(r);
              const open = expanded.has(k);
              const ph = phase[r.shipmentId];
              const pad = compact ? 'py-2' : 'py-3.5';
              return (
                <div key={k} id={`ship-${r.shipmentId}`}
                  className={`rounded-xl transition-[background-color,box-shadow] duration-300
                    ${open ? 'bg-blue-50/60 dark:bg-blue-950/30 ring-1 ring-blue-300 dark:ring-blue-800 shadow-sm' : selected.has(k) ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}
                    ${flash === k ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800' : ''}`}>

                  {/* Desktop row */}
                  <div className={`hidden xl:grid ${editMode ? COLS_EDIT : COLS} gap-x-4 items-center px-2 ${pad}`}>
                    {editMode && checkbox(k)}
                    {chevron(r, open)}
                    {buyerCell(r)}
                    <div className="text-sm">
                      <span className="block text-slate-800 dark:text-slate-100">{r.tab}</span>
                      {r.wn?.createdAt && <span className="block text-slate-500 dark:text-slate-400">{timeOf(r.wn.createdAt)}</span>}
                    </div>
                    <ItemsCell wn={r.wn} onOpen={() => toggle(k)} />
                    <div className="flex flex-col items-start gap-1">
                      <LabelPill row={r} phase={ph} />
                      {labelError[r.shipmentId] && (
                        <Tip content={labelError[r.shipmentId]} wide>
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1"><I.alert className="w-3.5 h-3.5" />Label failed</span>
                        </Tip>
                      )}
                    </div>
                    <DueCell wn={r.wn} />
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill a={r.assignment} />
                      <ProblemChip problems={r.problems} />
                    </div>
                    {assignedCell(r)}
                    <div className="flex justify-end"><Menu items={menuFor(r)} /></div>
                  </div>

                  {/* Narrow screens: the same row as a card */}
                  <div className={`xl:hidden flex gap-3 px-2 ${pad}`}>
                    <div className="flex flex-col items-center gap-2 pt-0.5">
                      {editMode && checkbox(k)}
                      {chevron(r, open)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        {buyerCell(r)}
                        <Menu items={menuFor(r)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                        <span>{r.tab}{r.wn?.createdAt ? ` · ${timeOf(r.wn.createdAt)}` : ''}</span>
                        <ItemsCell wn={r.wn} onOpen={() => toggle(k)} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <LabelPill row={r} phase={ph} />
                        <StatusPill a={r.assignment} />
                        <ProblemChip problems={r.problems} />
                        <DueCell wn={r.wn} />
                      </div>
                      {labelError[r.shipmentId] && <p className="text-sm text-red-600 dark:text-red-400">{labelError[r.shipmentId]}</p>}
                      {assignedCell(r)}
                    </div>
                  </div>

                  <div id={`panel-${r.shipmentId}`}>
                    <Collapse open={open}>
                      <ShipmentPanel
                        row={r} isManager={isManager} canMake={canMake(r)} canPrint={canPrint(r)}
                        phase={ph} labelError={labelError[r.shipmentId]} people={peopleOptions}
                        notes={notesOf(r)} onNotes={v => setNotes(n => ({ ...n, [k]: v }))} onNotesCommit={() => commitNotes(r)} notesState={notesState[k]}
                        onAssign={u => assign(r, u)} assigning={assigning === k}
                        onStatus={s => setStatus(r, s)} onReport={() => setReportFor(k)} onMakeLabel={() => makeLabel(r)}
                        onProblem={setProblem} />
                    </Collapse>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {reportRow && (
        <ReportProblemModal row={reportRow} people={people} onClose={() => setReportFor(null)}
          onSaved={text => { setReportFor(null); toast({ text }); load(); }} />
      )}
      {pingRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4 animate-in fade-in duration-150" onClick={() => setPingFor(null)}>
          <div role="dialog" aria-modal="true" aria-label="Send a follow-up" onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 grid place-items-center text-amber-500 flex-shrink-0"><I.megaphone className="w-5 h-5" /></span>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Send a follow-up</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Shows on {pingRow.assignment?.assignedToName ?? 'their'}&apos;s list until they acknowledge it.</p>
              </div>
            </div>
            <textarea value={pingMsg} onChange={e => setPingMsg(e.target.value)} rows={3} autoFocus placeholder="e.g. This one ships today please"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-white resize-none mb-4 focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/15" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPingFor(null)} className={btnGhost}>Cancel</button>
              <button onClick={sendPing} disabled={pingSaving} className={btnPrimary}>{pingSaving ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
