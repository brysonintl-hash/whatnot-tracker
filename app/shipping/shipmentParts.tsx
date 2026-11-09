'use client';

// Pieces of the Assign Shipments table that know about Whatnot: the status
// pill, the label buttons, and the opened-up row showing what's in the box
// and who has handled it.

import { useEffect, useState } from 'react';
import { ERROR_TYPES, type ErrorType } from '@/lib/shipmentProblems';

// ─── Shapes from /api/shipments ────────────────────────────────────────────

export type Line = {
  orderId: string | null;
  orderItemId: string | null;
  orderUrl: string | null;
  title: string;
  quantity: number;
  price: number;
  image: string | null;
  saleType: string | null;
};

export type WnView = {
  status: string;
  statusLabel: string;
  url: string;
  buyer: string | null;
  buyerName: string | null;
  createdAt: string | null;
  dropoffDue: string | null;
  overdue: boolean;
  requiredActions: string[];
  pickup: boolean;
  weight: string | null;
  dims: string | null;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  hasLabel: boolean;
  hazmat: string | null;
  lines: Line[] | null;
  itemCount: number | null;
  orderCount: number | null;
  value: number | null;
};

export type Handler = { username: string; name: string; how: 'label' | 'assigned'; at: string };
export type LedgerEvent = { shipmentId: string; kind: 'label-requested' | 'label-failed' | 'printed'; by: string; byName: string; at: string; note?: string };
export type Problem = {
  id: string; shipmentId: string; orderId: string | null; type: ErrorType; note: string;
  against: string; againstName: string; reportedBy: string; reportedAt: string;
  source: 'manual' | 'incomplete' | 'replacement';
  dismissed: { by: string; at: string } | null;
};

export type Person = { username: string; name: string; role: string };

// ─── Formatting ────────────────────────────────────────────────────────────

const TZ = 'America/Los_Angeles';
export const usd = (n: number) => `$${n.toFixed(2)}`;
export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** Whatnot sends the due date as seller-local midnight. */
function dueText(iso: string): string {
  const due = new Date(iso);
  if (dayKey(due) === dayKey(new Date())) return 'Due today';
  return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}`;
}

const SERVICE: Record<string, string> = {
  usps_ground_advantage: 'USPS Ground Advantage',
  usps_first_class_mail_letter: 'USPS First Class Letter',
  usps_priority: 'USPS Priority Mail',
  usps_priority_mail: 'USPS Priority Mail',
};
const serviceText = (wn: WnView) =>
  (wn.service && SERVICE[wn.service]) || [wn.carrier?.toUpperCase(), wn.service?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || null;

const ACTION_BADGE: Record<string, string> = {
  order_pending_cancellation: 'Cancel requested',
  country_of_origin_required: 'Needs country of origin',
  itn_required: 'Needs ITN',
  package_review_required: 'Package review',
};

// ─── Whatnot status ────────────────────────────────────────────────────────

const PILL: Record<string, string> = {
  created: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  label_generated: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  dropped_off: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  in_transit: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  delivered: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  failed: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
};
const PILL_MUTED = 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600';
const BADGE = 'text-[10px] font-bold px-1.5 py-0.5 rounded';

export function WnStatus({ wn }: { wn: WnView }) {
  const open = wn.status === 'created' || wn.status === 'label_generated';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${PILL[wn.status] ?? PILL_MUTED}`}>
        {wn.statusLabel}
      </span>
      {wn.requiredActions.map(a => (
        <span key={a} className={`${BADGE} bg-red-500 text-white`}>{ACTION_BADGE[a] ?? a.replace(/_/g, ' ')}</span>
      ))}
      {open && wn.overdue && <span className={`${BADGE} bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400`}>Overdue</span>}
      {open && !wn.overdue && wn.dropoffDue && (
        <span className={`${BADGE} text-slate-500 dark:text-slate-400`}>{dueText(wn.dropoffDue)}</span>
      )}
      {wn.hazmat && <span className={`${BADGE} bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 capitalize`}>{wn.hazmat}</span>}
      {wn.pickup && <span className={`${BADGE} bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300`}>Pickup</span>}
    </div>
  );
}

// ─── Label buttons ─────────────────────────────────────────────────────────

/** A request this recent with no label yet means Whatnot is still working on it. */
const PENDING_MS = 10 * 60_000;
const POLL_MS = 2500;
const POLL_TRIES = 24; // a minute

const btn = 'inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-colors whitespace-nowrap';
const Spinner = () => (
  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function LabelActions({
  shipmentId, wn, events, canMake, canPrint, onChanged,
}: {
  shipmentId: string; wn: WnView; events: LedgerEvent[];
  canMake: boolean; canPrint: boolean; onChanged: () => void;
}) {
  const needsLabel = wn.status === 'created' && !wn.pickup;
  const lastAsk = events.filter(e => e.kind === 'label-requested').sort((a, b) => b.at.localeCompare(a.at))[0];
  const asking = needsLabel && lastAsk && Date.now() - Date.parse(lastAsk.at) < PENDING_MS;
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'waiting'>(asking ? 'waiting' : 'idle');
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    setPhase('requesting');
    try {
      const res = await fetch('/api/shipments/label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || data.code === 'pending') { setPhase('waiting'); return; }
      setPhase('idle');
      if (data.code === 'has-label') { onChanged(); return; }
      setError(data.error || `Something went wrong (${res.status}).`);
    } catch {
      setPhase('idle');
      setError('Network error — check your connection and try again.');
    }
  }

  // After asking, watch the parcel until the label lands on it.
  useEffect(() => {
    if (phase !== 'waiting') return;
    let tries = 0;
    let stopped = false;
    const t = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/shipments/label?id=${shipmentId}`);
        const data = await res.json();
        if (stopped) return;
        if (res.ok && data.hasLabel) { clearInterval(t); setPhase('idle'); onChanged(); return; }
      } catch { /* keep trying */ }
      if (tries >= POLL_TRIES && !stopped) {
        clearInterval(t);
        setPhase('idle');
        setError('Whatnot hasn\'t finished this label yet. Refresh in a minute, or check it in Whatnot.');
      }
    }, POLL_MS);
    return () => { stopped = true; clearInterval(t); };
    // onChanged is a fresh closure each render; the poll only needs to start once per wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, shipmentId]);

  const blocked = wn.requiredActions.length > 0;
  const print = `/api/shipments/label/print?id=${shipmentId}`;

  return (
    <div className="flex flex-col gap-1 mt-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {wn.hasLabel && canPrint && (
          <>
            <a href={print} target="_blank" rel="noopener noreferrer" title="Label and packing slip"
              className={`${btn} bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </a>
            <a href={`${print}&doc=label`} target="_blank" rel="noopener noreferrer" title="Just the 4×6 label, no packing slip"
              className={`${btn} border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-400`}>
              Label only
            </a>
          </>
        )}
        {needsLabel && canMake && phase === 'idle' && (
          <button onClick={make} disabled={blocked}
            title={blocked ? 'Whatnot needs something sorted on this shipment first' : 'Same as Generate Label in Whatnot — your name goes on it'}
            className={`${btn} bg-red-500 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed`}>
            Generate Label
          </button>
        )}
        {phase === 'requesting' && (
          <span className={`${btn} bg-red-500/80 text-white`}><Spinner /> Asking Whatnot…</span>
        )}
        {phase === 'waiting' && (
          <span className={`${btn} bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`}><Spinner /> Making label…</span>
        )}
        <a href={wn.url} target="_blank" rel="noopener noreferrer" title="Open this shipment in Whatnot Seller Hub"
          className={`${btn} border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-400`}>
          Whatnot
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>
      {error && (
        <p className="text-[10px] leading-snug text-red-600 dark:text-red-400 max-w-[280px] animate-fade-in">
          {error}{' '}
          <a href={wn.url} target="_blank" rel="noopener noreferrer" className="underline font-bold">Open in Whatnot</a>
        </p>
      )}
    </div>
  );
}

// ─── The opened-up row ─────────────────────────────────────────────────────

const EVENT_TEXT: Record<LedgerEvent['kind'], string> = {
  'label-requested': 'made the label',
  'label-failed': 'tried to make the label',
  printed: 'printed the label',
};

export function ShipmentDetails({
  shipmentId, wn, handler, events, problems, isManager, onReport, onChanged,
}: {
  shipmentId: string; wn: WnView | null; handler: Handler | null;
  events: LedgerEvent[]; problems: Problem[]; isManager: boolean;
  onReport: () => void; onChanged: () => void;
}) {
  const [lines, setLines] = useState<Line[] | null>(wn?.lines ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wn || wn.lines) { setLines(wn?.lines ?? null); return; }
    let live = true;
    fetch(`/api/shipments/contents?id=${shipmentId}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setLines(d.lines); else setError(d.error || 'Couldn\'t load the items.');
      })
      .catch(() => live && setError('Couldn\'t load the items.'));
    return () => { live = false; };
    // Re-run when the contents arrive from a poll, not on every new row object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId, wn?.lines, Boolean(wn)]);

  async function setDismissed(p: Problem, dismissed: boolean) {
    await fetch('/api/shipments/problems', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, dismissed }),
    });
    onChanged();
  }

  if (!wn) {
    return (
      <p className="text-xs text-slate-400 py-1">
        This shipment is on the shipment sheet but not in the recent Whatnot list, so there are no item details for it.
      </p>
    );
  }

  const orders = lines ? new Set(lines.map(l => l.orderId).filter(Boolean)).size : 0;
  const units = lines ? lines.reduce((n, l) => n + l.quantity, 0) : 0;
  const service = serviceText(wn);
  const timeline = [...events].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] animate-slide-up">
      {/* What's in the box */}
      <div className="min-w-0">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
          {lines ? <>Items in this shipment <span className="font-normal text-slate-400">· {units} {units === 1 ? 'item' : 'items'} from {orders} {orders === 1 ? 'order' : 'orders'}</span></> : 'Items in this shipment'}
        </h4>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!lines && !error && (
          <div className="space-y-2">
            {[0, 1].map(i => <div key={i} className="h-14 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />)}
          </div>
        )}
        {lines && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {lines.map((l, i) => (
              <div key={l.orderItemId ?? i} className="flex items-center gap-3 p-2.5">
                {l.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={l.image} alt="" className="w-12 h-12 rounded-md object-cover bg-slate-100 flex-shrink-0" loading="lazy" />
                  : <div className="w-12 h-12 rounded-md bg-slate-100 dark:bg-slate-700 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug">{l.title}</p>
                  {l.orderId && (
                    l.orderUrl
                      ? <a href={l.orderUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">Order #{l.orderId}</a>
                      : <span className="text-[11px] text-slate-400">Order #{l.orderId}</span>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">{usd(l.price)}</p>
                  <p className="text-[10px] text-slate-400">
                    Qty {l.quantity}{l.saleType ? ` · ${l.saleType.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parcel facts and who touched it */}
      <div className="space-y-4 text-xs">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {wn.buyerName && <><dt className="text-slate-400">Buyer</dt><dd className="text-slate-700 dark:text-slate-200">{wn.buyerName}</dd></>}
          {wn.weight && <><dt className="text-slate-400">Weight</dt><dd className="text-slate-700 dark:text-slate-200">{wn.weight}</dd></>}
          {wn.dims && <><dt className="text-slate-400">Box</dt><dd className="text-slate-700 dark:text-slate-200">{wn.dims}</dd></>}
          {service && <><dt className="text-slate-400">Service</dt><dd className="text-slate-700 dark:text-slate-200">{service}</dd></>}
          {wn.tracking && <><dt className="text-slate-400">Tracking</dt><dd className="font-mono text-slate-700 dark:text-slate-200 break-all select-all">{wn.tracking}</dd></>}
          <dt className="text-slate-400">Shipment</dt><dd className="font-mono text-slate-500 select-all">#{shipmentId}</dd>
        </dl>

        <div>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Handled by</h4>
          {handler ? (
            <p className="text-slate-700 dark:text-slate-200">
              <span className="font-bold">{handler.name}</span>
              <span className="text-slate-400"> · {handler.how === 'label' ? 'made the label here' : 'assigned (label not made on this site)'}</span>
            </p>
          ) : (
            <p className="text-slate-400">Nobody yet — assign it, or make the label here.</p>
          )}
          {timeline.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {timeline.map((e, i) => (
                <li key={i} className={e.kind === 'label-failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
                  {e.byName} {EVENT_TEXT[e.kind]}{e.note && e.kind === 'printed' ? ` (${e.note})` : ''} · {dayTime(e.at)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Problems</h4>
            {isManager && (
              <button onClick={onReport} className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:underline">Report a problem</button>
            )}
          </div>
          {problems.length === 0 && <p className="text-slate-400">None reported.</p>}
          <ul className="space-y-1.5">
            {problems.map(p => (
              <li key={p.id} className={`rounded-md border px-2 py-1.5 ${p.dismissed ? 'border-slate-200 dark:border-slate-700 opacity-60' : 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-900/10'}`}>
                <p className="font-bold text-slate-800 dark:text-slate-100">
                  {ERROR_TYPES[p.type]} <span className="font-normal text-slate-500">· against {p.againstName}</span>
                </p>
                {p.note && <p className="text-slate-600 dark:text-slate-300">{p.note}</p>}
                <p className="text-[10px] text-slate-400">
                  {dayTime(p.reportedAt)}{p.dismissed ? ' · ruled out' : ''}
                  {isManager && (
                    <button onClick={() => setDismissed(p, !p.dismissed)} className="ml-2 font-bold hover:underline">
                      {p.dismissed ? 'Count it again' : 'Not their fault'}
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Reporting a problem ───────────────────────────────────────────────────

export function ReportProblemModal({
  shipmentId, buyer, handler, assignee, lines, people, onClose, onSaved,
}: {
  shipmentId: string; buyer: string | null; handler: Handler | null;
  assignee: { username: string; name: string } | null;
  lines: Line[] | null; people: Person[];
  onClose: () => void; onSaved: () => void;
}) {
  const [type, setType] = useState<ErrorType | ''>('');
  const [note, setNote] = useState('');
  const [orderId, setOrderId] = useState('');
  // Whose error: the handler by default, but the packer may be someone else.
  const choices = new Map<string, string>();
  if (handler) choices.set(handler.username, handler.name);
  if (assignee) choices.set(assignee.username, assignee.name);
  for (const p of people) if (!choices.has(p.username)) choices.set(p.username, p.name);
  const [against, setAgainst] = useState(handler?.username ?? assignee?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orders = Array.from(new Set((lines ?? []).map(l => l.orderId).filter((x): x is string => Boolean(x))));

  async function save() {
    if (!type || !against) return;
    setSaving(true);
    setError(null);
    const res = await fetch('/api/shipments/problems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, type, note, orderId, against, againstName: choices.get(against) ?? against }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Couldn\'t save.'); return; }
    onSaved();
  }

  const field = 'w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-slate-900 dark:text-white">Report a problem</h3>
        <p className="text-xs text-slate-400 mb-4">Shipment #{shipmentId}{buyer ? ` to ${buyer}` : ''}. It counts on the Accountability tab.</p>

        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">What went wrong</label>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {(Object.keys(ERROR_TYPES) as ErrorType[]).map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`text-xs font-bold px-2.5 py-2 rounded-lg border text-left transition-colors ${type === t ? 'bg-red-500 border-red-500 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
              {ERROR_TYPES[t]}
            </button>
          ))}
        </div>

        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Whose error</label>
        <select value={against} onChange={e => setAgainst(e.target.value)} className={`${field} mb-1`}>
          <option value="">— choose —</option>
          {Array.from(choices.entries()).map(([u, n]) => (
            <option key={u} value={u}>{n}{handler?.username === u ? ' (handled it)' : assignee?.username === u ? ' (assigned)' : ''}</option>
          ))}
        </select>
        <p className="text-[10px] text-slate-400 mb-4">Defaults to whoever handled the shipment.</p>

        {orders.length > 1 && (
          <>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Which order (optional)</label>
            <select value={orderId} onChange={e => setOrderId(e.target.value)} className={`${field} mb-4`}>
              <option value="">Whole shipment</option>
              {orders.map(o => <option key={o} value={o}>Order #{o}</option>)}
            </select>
          </>
        )}

        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Note</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened (optional)"
          className={`${field} resize-none mb-4`} />

        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
          <button onClick={save} disabled={!type || !against || saving}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
