'use client';

// The pieces of a shipment row: its pills and cells (each explaining itself
// on hover), and the opened-up panel showing what's in the box, the parcel's
// details, and who has it.

import { useEffect, useState } from 'react';
import { ERROR_TYPES, type ErrorType } from '@/lib/shipmentProblems';
import { I, Select, Spinner, Tip, type Option } from './ui';

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

export type Assignment = {
  shipmentId: string; tab: string;
  assignedTo: string; assignedToName: string; assignedToRole: string;
  assignedBy: string; assignedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
  notes: string;
  pinged: boolean; pingMessage: string; pingAt: string;
};

export type Handler = { username: string; name: string; how: 'label' | 'assigned'; at: string };
export type LedgerEvent = { shipmentId: string; kind: 'label-requested' | 'label-failed' | 'printed'; by: string; byName: string; at: string; note?: string };
export type Problem = {
  id: string; shipmentId: string; orderId: string | null; type: ErrorType; note: string;
  against: string; againstName: string; reportedBy: string; reportedAt: string;
  source: 'manual' | 'incomplete' | 'replacement';
  dismissed: { by: string; at: string } | null;
};

export type ShipmentRow = {
  shipmentId: string; tab: string; assignment: Assignment | null;
  /** The parcel as Whatnot has it; null for a sheet row Whatnot hasn't listed. */
  wn: WnView | null;
  handler: Handler | null;
  events: LedgerEvent[];
  problems: Problem[];
};

export type Person = { username: string; name: string; role: string };
export type LabelPhase = 'requesting' | 'waiting';

// ─── Formatting ────────────────────────────────────────────────────────────

const TZ = 'America/Los_Angeles';
export const usd = (n: number) => `$${n.toFixed(2)}`;
export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const SERVICE: Record<string, string> = {
  usps_ground_advantage: 'USPS Ground Advantage',
  usps_first_class_mail_letter: 'USPS First Class Letter',
  usps_priority: 'USPS Priority Mail',
  usps_priority_mail: 'USPS Priority Mail',
};
export const serviceText = (wn: WnView) =>
  (wn.service && SERVICE[wn.service]) || [wn.carrier?.toUpperCase(), wn.service?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || null;

export const ACTION_TEXT: Record<string, { label: string; tip: string }> = {
  order_pending_cancellation: { label: 'Cancel requested', tip: 'The buyer asked to cancel. Answer the request in Whatnot before packing — don\'t make a label yet.' },
  country_of_origin_required: { label: 'Needs country of origin', tip: 'Whatnot needs the country of origin for an item before it will make a label. Add it in Whatnot.' },
  itn_required: { label: 'Needs ITN', tip: 'Whatnot needs an export filing number (ITN) before it will make a label. Add it in Whatnot.' },
  package_review_required: { label: 'Package review', tip: 'Whatnot wants the package weight or size checked before it will make a label.' },
};

export const STATUS_LABEL: Record<Assignment['status'], string> = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' };

/** The latest request still within the window Whatnot usually takes. */
export function recentRequest(row: ShipmentRow): LedgerEvent | null {
  if (row.wn?.status !== 'created') return null;
  const e = row.events.filter(x => x.kind === 'label-requested').sort((a, b) => b.at.localeCompare(a.at))[0];
  return e && Date.now() - Date.parse(e.at) < 10 * 60_000 ? e : null;
}

// ─── Pills ─────────────────────────────────────────────────────────────────

const pill = 'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors';

const LABEL_TONE: Record<string, string> = {
  created: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  label_generated: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  dropped_off: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  in_transit: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

export function LabelPill({ row, phase }: { row: ShipmentRow; phase?: LabelPhase }) {
  const wn = row.wn;
  if (!wn) {
    return (
      <Tip content="This shipment is on the shipment sheet but isn't in the recent Whatnot list, so its label status is unknown.">
        <span className={`${pill} bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300`}>Not in Whatnot</span>
      </Tip>
    );
  }
  const asked = recentRequest(row);
  if (phase || asked) {
    return (
      <Tip content={asked ? `${asked.byName} asked Whatnot for this label at ${timeOf(asked.at)}. It usually appears within a minute.` : 'Asking Whatnot for the label…'}>
        <span className={`${pill} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200`}><Spinner className="w-3 h-3" />Making label</span>
      </Tip>
    );
  }
  const labelBy = row.handler?.how === 'label' ? row.handler.name : null;
  const tips: Record<string, string> = {
    created: wn.pickup
      ? 'Local pickup — no shipping label needed.'
      : 'Whatnot hasn\'t made a shipping label yet. Open the row or use ⋯ → Generate Label. Whatnot may still add more of this buyer\'s wins until the label is made.',
    label_generated: `Label made${labelBy ? ` by ${labelBy}` : ''}. Not scanned by USPS yet.${wn.tracking ? ` Tracking ${wn.tracking}.` : ''} Print it from ⋯.`,
    dropped_off: `Dropped off.${wn.tracking ? ` Tracking ${wn.tracking}.` : ''}`,
    in_transit: `On its way to the buyer.${wn.tracking ? ` Tracking ${wn.tracking}.` : ''}`,
    delivered: 'Delivered to the buyer.',
    failed: 'Whatnot marked this shipment as failed. Check it in Whatnot.',
  };
  const cancelled = wn.status.startsWith('cancelled');
  return (
    <Tip content={cancelled ? 'Cancelled in Whatnot — don\'t ship it.' : tips[wn.status] ?? wn.statusLabel}>
      <span className={`${pill} ${LABEL_TONE[wn.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
        {wn.pickup && wn.status === 'created' ? 'Pickup' : wn.statusLabel}
      </span>
    </Tip>
  );
}

const STATUS_TONE: Record<string, string> = {
  none: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-800',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800',
  'in-progress': 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800',
  resolved: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800',
};

export function StatusPill({ a }: { a: Assignment | null }) {
  if (!a) {
    return (
      <Tip content="Nobody has this shipment yet. Pick someone under Assigned To, or make the label yourself and it's yours.">
        <span className={`${pill} ${STATUS_TONE.none}`}>Unassigned</span>
      </Tip>
    );
  }
  const self = a.assignedBy === a.assignedTo;
  const tip = {
    pending: self
      ? `${a.assignedToName} took it on ${dayTime(a.assignedAt)}. Not started yet.`
      : `Given to ${a.assignedToName}${a.assignedBy ? ` by ${a.assignedBy}` : ''} on ${dayTime(a.assignedAt)}. Not started yet.`,
    'in-progress': `${a.assignedToName} is working on it.`,
    resolved: `${a.assignedToName} marked it done.`,
  }[a.status];
  return (
    <Tip content={a.pinged && a.status !== 'resolved' ? `${tip} Follow-up sent: “${a.pingMessage || 'Follow up'}”` : tip}>
      <span className={`${pill} ${STATUS_TONE[a.status]}`}>
        {a.pinged && a.status !== 'resolved' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
        {STATUS_LABEL[a.status]}
      </span>
    </Tip>
  );
}

const chip = 'inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-semibold whitespace-nowrap';

/** Due date plus anything about the parcel that changes how it's handled. */
export function DueCell({ wn }: { wn: WnView | null }) {
  if (!wn) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const open = wn.status === 'created' || wn.status === 'label_generated';
  const today = wn.dropoffDue && dayKey(new Date(wn.dropoffDue)) === dayKey(new Date());
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {open && wn.dropoffDue ? (
        <Tip content={wn.overdue
          ? `This was due to be dropped off on ${shortDate(wn.dropoffDue)} and still hasn't left. Ship it first.`
          : `Whatnot wants it dropped off by the end of ${today ? 'today' : shortDate(wn.dropoffDue)} (Pacific time).`}>
          <span className={`inline-flex items-center gap-1.5 text-sm whitespace-nowrap ${wn.overdue ? 'text-red-600 dark:text-red-400 font-semibold' : today ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
            <I.calendar className="w-4 h-4 opacity-70" />
            {wn.overdue ? 'Overdue' : today ? 'Due today' : `Due ${shortDate(wn.dropoffDue)}`}
          </span>
        </Tip>
      ) : (
        <span className="text-sm text-slate-400">—</span>
      )}
      {wn.requiredActions.map(a => (
        <Tip key={a} content={ACTION_TEXT[a]?.tip ?? `Whatnot needs "${a.replace(/_/g, ' ')}" sorted first.`}>
          <span className={`${chip} bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800`}>
            <I.alert className="w-3.5 h-3.5" />{ACTION_TEXT[a]?.label ?? a.replace(/_/g, ' ')}
          </span>
        </Tip>
      ))}
      {wn.hazmat && (
        <Tip content={`Contains a ${wn.hazmat}. It has to go by ground and the box needs the hazmat marking — Whatnot puts it on the label.`}>
          <span className={`${chip} bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 capitalize`}>{wn.hazmat}</span>
        </Tip>
      )}
    </div>
  );
}

/** "2 items · 2 orders · $39.00", with the item list on hover. */
export function ItemsCell({ wn, onOpen }: { wn: WnView | null; onOpen: () => void }) {
  if (!wn) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  if (!wn.lines || wn.itemCount == null) {
    return (
      <Tip content="Still reading the items from Whatnot — they'll show up in a moment.">
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><Spinner className="w-3 h-3" />Loading</span>
      </Tip>
    );
  }
  const preview = (
    <div className="space-y-1.5">
      {wn.lines.slice(0, 6).map((l, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-slate-400 tabular-nums">{l.quantity}×</span>
          <span className="flex-1">{l.title}</span>
          <span className="tabular-nums text-slate-300">{usd(l.price)}</span>
        </div>
      ))}
      {wn.lines.length > 6 && <div className="text-slate-400">+{wn.lines.length - 6} more</div>}
      <div className="pt-1 text-slate-400">Click to see photos and orders.</div>
    </div>
  );
  const multi = (wn.orderCount ?? 0) > 1;
  return (
    <Tip content={preview} wide align="start">
      <button onClick={onOpen} className="text-left group">
        {multi ? (
          <>
            <span className="block text-[15px] font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{plural(wn.itemCount, 'item')}</span>
            <span className="block text-[13px] text-slate-500 dark:text-slate-400">{plural(wn.orderCount ?? 0, 'order')} • {usd(wn.value ?? 0)}</span>
          </>
        ) : (
          <span className="text-[15px] whitespace-nowrap">
            <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{plural(wn.itemCount, 'item')}</span>
            <span className="text-slate-500 dark:text-slate-400 text-[13px]"> • {usd(wn.value ?? 0)}</span>
          </span>
        )}
      </button>
    </Tip>
  );
}

export function ProblemChip({ problems }: { problems: Problem[] }) {
  const live = problems.filter(p => !p.dismissed);
  if (!live.length) return null;
  return (
    <Tip content={
      <div className="space-y-1">
        {live.map(p => <div key={p.id}><b>{ERROR_TYPES[p.type]}</b> · {p.againstName}{p.note ? ` — ${p.note}` : ''}</div>)}
      </div>
    } wide>
      <span className={`${chip} bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300`}>
        <I.alert className="w-3.5 h-3.5" />{plural(live.length, 'problem')}
      </span>
    </Tip>
  );
}

// ─── The opened-up row ─────────────────────────────────────────────────────

const EVENT_TEXT: Record<LedgerEvent['kind'], string> = {
  'label-requested': 'made the label',
  'label-failed': 'tried to make the label',
  printed: 'printed the label',
};

const card = 'rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5';
const cardTitle = 'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-bold text-slate-900 dark:text-white';
const btnBase = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const btnPrimary = `${btnBase} bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20`;
export const btnGhost = `${btnBase} border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700`;

export function ShipmentPanel({
  row, isManager, canMake, canPrint, phase, labelError, people, notes, onNotes, onNotesCommit, notesState,
  onAssign, assigning, onStatus, onReport, onMakeLabel, onProblem, onTake,
}: {
  row: ShipmentRow; isManager: boolean; canMake: boolean; canPrint: boolean;
  phase?: LabelPhase; labelError?: string; people: Option[];
  notes: string; onNotes: (v: string) => void; onNotesCommit: () => void; notesState?: 'saving' | 'saved';
  onAssign: (username: string) => void; assigning: boolean;
  onStatus: (s: Assignment['status']) => void;
  onReport: () => void; onMakeLabel: () => void;
  onProblem: (p: Problem, dismissed: boolean) => void;
  /** Set when a shipper can take this parcel themselves. */
  onTake?: () => void;
}) {
  const { wn, assignment: a } = row;
  const [lines, setLines] = useState<Line[] | null>(wn?.lines ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wn || wn.lines) { setLines(wn?.lines ?? null); return; }
    let live = true;
    fetch(`/api/shipments/contents?id=${row.shipmentId}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) setLines(d.lines); else setError(d.error || 'Couldn\'t load the items.');
      })
      .catch(() => live && setError('Couldn\'t load the items.'));
    return () => { live = false; };
    // Re-run when the contents arrive from a poll, not on every new row object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.shipmentId, wn?.lines, Boolean(wn)]);

  const units = lines?.reduce((n, l) => n + l.quantity, 0) ?? 0;
  const orders = lines ? new Set(lines.map(l => l.orderId).filter(Boolean)).size : 0;
  const service = wn ? serviceText(wn) : null;
  const needsLabel = wn?.status === 'created' && !wn.pickup;
  const blocked = Boolean(wn?.requiredActions.length);
  const asking = Boolean(phase || recentRequest(row));
  const timeline = [...row.events].sort((x, y) => x.at.localeCompare(y.at));
  const canEditNotes = isManager || Boolean(a && canMake);

  const detail = (Icon: (p: { className?: string }) => JSX.Element, k: string, v: React.ReactNode, mono = false) => (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <Icon className="w-[18px] h-[18px] text-slate-400 flex-shrink-0" />
      <span className="w-24 flex-shrink-0 text-sm text-slate-500 dark:text-slate-400">{k}</span>
      <span className={`text-sm text-slate-800 dark:text-slate-100 min-w-0 break-words ${mono ? 'font-mono select-all' : ''}`}>{v}</span>
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(0,1.35fr)] px-3 pb-3 sm:px-4 sm:pb-4">
      {/* Items */}
      <section className={card}>
        <h4 className={cardTitle}>
          <I.box className="w-5 h-5 text-slate-500" />Items in this shipment
          {lines && <span className="font-normal text-slate-500 dark:text-slate-400 text-sm">({plural(units, 'item')} from {plural(orders, 'order')})</span>}
        </h4>
        <div className="mt-3">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!wn && <p className="text-sm text-slate-400">This shipment is on the shipment sheet but not in the recent Whatnot list, so there are no item details for it.</p>}
          {wn && !lines && !error && (
            <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />)}</div>
          )}
          {lines && (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {lines.map((l, i) => (
                <li key={l.orderItemId ?? i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  {l.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <Tip content={<img src={l.image} alt="" className="w-48 h-48 object-contain rounded-md bg-white" />} align="start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.image} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-contain bg-slate-50 dark:bg-slate-700 ring-1 ring-slate-100 dark:ring-slate-700 flex-shrink-0" />
                    </Tip>
                  ) : <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 grid place-items-center flex-shrink-0"><I.box className="w-6 h-6 text-slate-300" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{l.title}</p>
                    {l.orderId && (l.orderUrl
                      ? <Tip content="Open this order in Whatnot Seller Hub"><a href={l.orderUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline underline-offset-2 decoration-blue-300 hover:decoration-blue-600">Order #{l.orderId}</a></Tip>
                      : <span className="text-sm text-slate-400">Order #{l.orderId}</span>)}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white tabular-nums">{usd(l.price)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">Qty {l.quantity}{l.saleType ? ` • ${l.saleType.replace(/_/g, ' ')}` : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Parcel */}
      <section className={`${card} flex flex-col`}>
        <h4 className={cardTitle}><I.box className="w-5 h-5 text-slate-500" />Shipment Details</h4>
        <div className="mt-2 flex-1">
          {wn?.buyerName && detail(I.user, 'Buyer', wn.buyerName)}
          {wn?.weight && detail(I.weight, 'Weight', wn.weight)}
          {wn?.dims && detail(I.box, 'Box', wn.dims)}
          {service && detail(I.truck, 'Shipping', service)}
          {wn?.tracking && detail(I.tag, 'Tracking', wn.tracking, true)}
          {detail(I.hash, 'Shipment #', `#${row.shipmentId}`, true)}
        </div>
        {wn && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60 flex flex-wrap gap-2">
            {needsLabel && canMake && (
              <Tip content={blocked ? 'Whatnot needs something sorted on this shipment first — see the red tag.' : 'Same as Generate Label in Whatnot, using the shipment\'s saved box and service. Your name goes on it.'}>
                <button onClick={onMakeLabel} disabled={blocked || asking} className={btnPrimary}>
                  {asking ? <><Spinner />Making label…</> : <><I.tag className="w-4 h-4" />Generate Label</>}
                </button>
              </Tip>
            )}
            {wn.hasLabel && canPrint && (
              <>
                <Tip content="Opens the label with Whatnot's packing slip, so you can check the box against it.">
                  <a href={`/api/shipments/label/print?id=${row.shipmentId}`} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
                    <I.printer className="w-4 h-4" />Print label
                  </a>
                </Tip>
                <Tip content="Just the 4×6 label, for a thermal printer.">
                  <a href={`/api/shipments/label/print?id=${row.shipmentId}&doc=label`} target="_blank" rel="noopener noreferrer" className={btnGhost}>Label only</a>
                </Tip>
              </>
            )}
            <Tip content="Open this shipment in Whatnot Seller Hub">
              <a href={wn.url} target="_blank" rel="noopener noreferrer" className={btnGhost}><I.external className="w-4 h-4" />Whatnot</a>
            </Tip>
            {labelError && <p className="basis-full text-sm text-red-600 dark:text-red-400 leading-snug animate-in fade-in duration-200">{labelError}</p>}
          </div>
        )}
      </section>

      {/* Who has it */}
      <section className={card}>
        <h4 className={cardTitle}><I.user className="w-5 h-5 text-slate-500" />Assignment</h4>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="space-y-4 min-w-0">
            {isManager ? (
              <Select label="Assign to" value={a?.assignedTo ?? ''} options={people} onChange={onAssign}
                placeholder="— Assign to —" icon={I.user} busy={assigning} />
            ) : onTake ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">Nobody has this shipment yet.</p>
                <Tip content="Assigns it to you. You can give it back until you start it.">
                  <button onClick={onTake} className={btnPrimary}><I.user className="w-4 h-4" />Take it</button>
                </Tip>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-200"><span className="text-slate-400">Assigned to </span><b>{a?.assignedToName ?? '—'}</b></p>
            )}
            {a && (isManager || canMake) && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Status</p>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-semibold">
                  {(['pending', 'in-progress', 'resolved'] as const).map(s => (
                    <button key={s} onClick={() => s !== a.status && onStatus(s)} aria-pressed={a.status === s}
                      className={`px-2.5 py-1.5 rounded-md transition-all duration-200 ${a.status === s ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Handled by</p>
              {row.handler ? (
                <Tip content={row.handler.how === 'label'
                  ? 'Made the label on this site, so problems with this shipment count against them.'
                  : 'The label wasn\'t made on this site, so problems count against whoever it was assigned to.'}>
                  <p className="text-sm text-slate-800 dark:text-slate-100">
                    <b>{row.handler.name}</b>
                    <span className="text-slate-400"> · {row.handler.how === 'label' ? 'made the label here' : 'assigned'}</span>
                  </p>
                </Tip>
              ) : <p className="text-sm text-slate-400">Nobody yet</p>}
              {timeline.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {timeline.map((e, i) => (
                    <li key={i} className={`text-xs ${e.kind === 'label-failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {e.byName} {EVENT_TEXT[e.kind]}{e.note && e.kind === 'printed' ? ` (${e.note})` : ''} · {dayTime(e.at)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-4 min-w-0">
            <div className="relative">
              <textarea value={notes} onChange={e => onNotes(e.target.value)} onBlur={onNotesCommit} rows={3}
                disabled={!canEditNotes} aria-label="Notes" placeholder={a ? 'Notes for this shipment' : 'Notes (saved when assigned)'}
                className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 resize-none transition-[border-color,box-shadow] focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/15 disabled:opacity-60" />
              {notesState && (
                <span className="absolute right-2.5 bottom-2.5 text-[11px] text-slate-400 flex items-center gap-1 animate-in fade-in duration-200">
                  {notesState === 'saving' ? <><Spinner className="w-3 h-3" />Saving</> : <><I.check className="w-3 h-3 text-emerald-500" />Saved</>}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <I.alert className="w-[18px] h-[18px] text-red-500" />Problems
                </span>
                {isManager && (
                  <Tip content="Log a mistake on this shipment. It counts on the Accountability tab.">
                    <button onClick={onReport} className="whitespace-nowrap text-sm font-semibold text-red-600 dark:text-red-400 underline underline-offset-2 decoration-red-300 hover:decoration-red-600">Report a problem</button>
                  </Tip>
                )}
              </div>
              {row.problems.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None reported.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {row.problems.map(p => (
                    <li key={p.id} className={`text-sm rounded-lg px-2.5 py-2 transition-opacity ${p.dismissed ? 'bg-slate-50 dark:bg-slate-900/50 opacity-60' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <p className="font-semibold text-slate-900 dark:text-white">{ERROR_TYPES[p.type]} <span className="font-normal text-slate-500">· {p.againstName}</span></p>
                      {p.note && <p className="text-slate-600 dark:text-slate-300">{p.note}</p>}
                      <p className="text-xs text-slate-400 mt-0.5">
                        {dayTime(p.reportedAt)}{p.dismissed ? ' · ruled out' : ''}
                        {isManager && (
                          <button onClick={() => onProblem(p, !p.dismissed)} className="ml-2 font-semibold hover:text-slate-700 dark:hover:text-slate-200">
                            {p.dismissed ? 'Count it again' : 'Not their fault'}
                          </button>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Reporting a problem ───────────────────────────────────────────────────

export function ReportProblemModal({
  row, people, onClose, onSaved,
}: {
  row: ShipmentRow; people: Person[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  const { handler, assignment: a } = row;
  const [type, setType] = useState<ErrorType | ''>('');
  const [note, setNote] = useState('');
  const [orderId, setOrderId] = useState('');
  // Whose error: the handler by default, but the packer may be someone else.
  const choices = new Map<string, string>();
  if (handler) choices.set(handler.username, handler.name);
  if (a) choices.set(a.assignedTo, a.assignedToName);
  for (const p of people) if (!choices.has(p.username)) choices.set(p.username, p.name);
  const [against, setAgainst] = useState(handler?.username ?? a?.assignedTo ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orders = Array.from(new Set((row.wn?.lines ?? []).map(l => l.orderId).filter((x): x is string => Boolean(x))));

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="listbox"]')) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  async function save() {
    if (!type || !against) return;
    setSaving(true);
    setError(null);
    const res = await fetch('/api/shipments/problems', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: row.shipmentId, type, note, orderId, against, againstName: choices.get(against) ?? against }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Couldn\'t save.'); return; }
    onSaved(`${ERROR_TYPES[type]} logged against ${choices.get(against) ?? against}`);
  }

  const label = 'block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5';
  const field = 'w-full text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/15';
  const whoOptions: Option[] = Array.from(choices.entries()).map(([u, n]) => ({
    value: u, label: n, sub: handler?.username === u ? 'handled it' : a?.assignedTo === u ? 'assigned' : undefined,
  }));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Report a problem"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <span className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 grid place-items-center text-red-500 flex-shrink-0"><I.alert className="w-5 h-5" /></span>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Report a problem</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">#{row.shipmentId}{row.wn?.buyer ? ` to ${row.wn.buyer}` : ''}. It counts on the Accountability tab.</p>
          </div>
        </div>

        <span className={label}>What went wrong</span>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(Object.keys(ERROR_TYPES) as ErrorType[]).map(t => (
            <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
              className={`text-sm font-semibold px-3 py-2.5 rounded-lg border text-left transition-all duration-150 ${type === t ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/30' : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20'}`}>
              {ERROR_TYPES[t]}
            </button>
          ))}
        </div>

        <span className={label}>Whose error</span>
        <Select label="Whose error" value={against} options={whoOptions} onChange={setAgainst} placeholder="— Choose —" icon={I.user} />
        <p className="text-xs text-slate-400 mt-1.5 mb-5">Defaults to whoever handled the shipment.</p>

        {orders.length > 1 && (
          <>
            <span className={label}>Which order (optional)</span>
            <div className="mb-5">
              <Select label="Which order" value={orderId}
                options={[{ value: '', label: 'Whole shipment' }, ...orders.map(o => ({ value: o, label: `Order #${o}` }))]}
                onChange={setOrderId} />
            </div>
          </>
        )}

        <label className={label} htmlFor="problem-note">Note</label>
        <textarea id="problem-note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What happened (optional)"
          className={`${field} resize-none mb-5`} />

        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={save} disabled={!type || !against || saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
