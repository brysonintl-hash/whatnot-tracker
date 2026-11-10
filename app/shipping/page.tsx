'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';
import ShipmentQueue from './queue';
import Accountability from './accountability';
import { I, Popover, Tip, Toasts } from './ui';
import { ACTION_TEXT, type ShipmentRow } from './shipmentParts';

type Session = { username: string; role: Role; name: string };

type ClaimRecord = {
  rowIndex: number;
  // General claim fields (cancellation / replacement / refund)
  orderNumber?: string;
  dateOrder?: string;
  modelNumber?: string;
  itemName?: string;
  // Incomplete-order fields
  qtyOrdered?: number;
  qtyReceived?: number;
  note?: string;
  // USPS claim fields
  amountRequested?: number;
  amountApproved?: number;
  dateSubmitted?: string;
  trackingNumber?: string;
  // Common
  username: string;
  status: string;
};

type SectionType = 'shipments' | 'cancellation' | 'incomplete' | 'replacement' | 'refund' | 'usps' | 'accountability';

const SECTION_LABELS: Record<SectionType, string> = {
  shipments: 'Assign Shipments',
  cancellation: 'Cancellations',
  incomplete: 'Incomplete Orders',
  replacement: 'Replacements',
  refund: 'Refunds',
  usps: 'USPS Claims',
  accountability: 'Accountability',
};

const USPS_STATUSES = ['Under Review', 'Approved'];
const CLAIM_STATUSES = ['Open', 'In Progress', 'Resolved'];
const INCOMPLETE_STATUSES = ['Reported', 'Sending Missing Items', 'Shipped', 'Resolved'];

const emptyClaimForm = {
  orderNumber: '', dateOrder: '', modelNumber: '', itemName: '',
  username: '', status: '',
  qtyOrdered: '', qtyReceived: '', note: '',
  amountRequested: '', amountApproved: '', dateSubmitted: '', trackingNumber: '',
};

// â"€â"€â"€ Claims Section Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type TrackResult = { status: string; description: string; city: string; state: string; date: string; time: string };

function ClaimsSection({ type, isAdminOrManager }: { type: Exclude<SectionType, 'shipments' | 'accountability'>; isAdminOrManager: boolean }) {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyClaimForm);
  const [saving, setSaving] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [savingStatusIdx, setSavingStatusIdx] = useState<number | null>(null);
  const [trackingData, setTrackingData] = useState<Record<number, TrackResult | { error: string }>>({});
  const [trackingLoading, setTrackingLoading] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyClaimForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isUsps = type === 'usps';
  const isIncomplete = type === 'incomplete';
  const statusOptions = isUsps ? USPS_STATUSES : isIncomplete ? INCOMPLETE_STATUSES : CLAIM_STATUSES;

  function openEdit(c: ClaimRecord) {
    setEditingIdx(c.rowIndex);
    setEditForm({
      orderNumber: c.orderNumber || '',
      dateOrder: c.dateOrder || '',
      modelNumber: c.modelNumber || '',
      itemName: c.itemName || '',
      username: c.username || '',
      status: c.status || '',
      qtyOrdered: c.qtyOrdered != null ? String(c.qtyOrdered) : '',
      qtyReceived: c.qtyReceived != null ? String(c.qtyReceived) : '',
      note: c.note || '',
      amountRequested: c.amountRequested != null ? String(c.amountRequested) : '',
      amountApproved: c.amountApproved != null ? String(c.amountApproved) : '',
      dateSubmitted: c.dateSubmitted || '',
      trackingNumber: c.trackingNumber || '',
    });
  }

  async function saveEdit(c: ClaimRecord) {
    setSavingEdit(true);
    await fetch('/api/claims', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        rowIndex: c.rowIndex,
        username: editForm.username,
        status: editForm.status,
        ...(isUsps ? {
          amountRequested: parseFloat(editForm.amountRequested) || 0,
          amountApproved: editForm.amountApproved ? parseFloat(editForm.amountApproved) : undefined,
          dateSubmitted: editForm.dateSubmitted,
          trackingNumber: editForm.trackingNumber,
        } : {
          orderNumber: editForm.orderNumber,
          dateOrder: editForm.dateOrder,
          modelNumber: editForm.modelNumber,
          itemName: editForm.itemName,
          ...(isIncomplete ? {
            qtyOrdered: editForm.qtyOrdered === '' ? undefined : parseInt(editForm.qtyOrdered, 10),
            qtyReceived: editForm.qtyReceived === '' ? undefined : parseInt(editForm.qtyReceived, 10),
            note: editForm.note,
          } : {}),
        }),
      }),
    });
    setSavingEdit(false);
    setEditingIdx(null);
    load();
  }

  async function trackShipment(c: ClaimRecord) {
    if (!c.trackingNumber) return;
    setTrackingLoading(c.rowIndex);
    try {
      const res = await fetch(`/api/usps?tracking=${encodeURIComponent(c.trackingNumber)}`);
      const data = await res.json();
      setTrackingData(prev => ({ ...prev, [c.rowIndex]: data }));
    } catch {
      setTrackingData(prev => ({ ...prev, [c.rowIndex]: { error: 'Failed to fetch' } }));
    }
    setTrackingLoading(null);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/claims?type=${type}`);
      const data = await res.json();
      setClaims(Array.isArray(data) ? data : []);
    } catch {
      setClaims([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [type]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isUsps ? (!form.username || !form.amountRequested || !form.status) : (!form.orderNumber || !form.status)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isUsps ? {
          type,
          username: form.username,
          amountRequested: parseFloat(form.amountRequested) || 0,
          amountApproved: form.amountApproved ? parseFloat(form.amountApproved) : undefined,
          dateSubmitted: form.dateSubmitted,
          trackingNumber: form.trackingNumber,
          status: form.status,
        } : {
          type,
          orderNumber: form.orderNumber,
          dateOrder: form.dateOrder,
          modelNumber: form.modelNumber,
          itemName: form.itemName,
          username: form.username,
          status: form.status,
          ...(isIncomplete ? {
            qtyOrdered: form.qtyOrdered === '' ? undefined : parseInt(form.qtyOrdered, 10),
            qtyReceived: form.qtyReceived === '' ? undefined : parseInt(form.qtyReceived, 10),
            note: form.note,
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save. Check Railway logs.');
        setSaving(false);
        return;
      }
      setForm(emptyClaimForm);
      load();
    } catch {
      setSaveError('Network error. Please try again.');
    }
    setSaving(false);
  }

  async function handleDelete(c: ClaimRecord) {
    if (!confirm(`Delete this ${SECTION_LABELS[type].slice(0, -1).toLowerCase()} record?`)) return;
    setDeletingIdx(c.rowIndex);
    await fetch('/api/claims', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, rowIndex: c.rowIndex }),
    });
    setDeletingIdx(null);
    load();
  }

  async function handleStatusChange(c: ClaimRecord, status: string) {
    setSavingStatusIdx(c.rowIndex);
    await fetch('/api/claims', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, rowIndex: c.rowIndex, status }),
    });
    setSavingStatusIdx(null);
    setClaims(prev => prev.map(r => r.rowIndex === c.rowIndex ? { ...r, status } : r));
  }

  function statusColor(s: string) {
    if (s === 'Approved' || s === 'Resolved') return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700';
    if (s === 'Under Review' || s === 'In Progress' || s === 'Sending Missing Items' || s === 'Shipped') return 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700';
    return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700';
  }

  // How many units never arrived. Only meaningful once both counts are in —
  // a blank Received is "not reported", not "received zero", so it stays a dash
  // rather than silently reading as the whole order missing.
  function missingPill(c: ClaimRecord) {
    if (c.qtyOrdered == null || c.qtyReceived == null) return <span className="text-xs text-slate-400">—</span>;
    const missing = c.qtyOrdered - c.qtyReceived;
    if (missing <= 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700">Complete</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700">{missing} short</span>;
  }

  const inputCls = 'text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400';

  return (
    <div>
      {/* Add form — admin/manager only */}
      {isAdminOrManager && <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Add {SECTION_LABELS[type].slice(0, -1)}</h3>
        {isUsps ? (
          <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Username *</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Whatnot username" required className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Amount Requested ($) *</label>
              <input type="number" step="0.01" min="0" value={form.amountRequested} onChange={e => setForm(f => ({ ...f, amountRequested: e.target.value }))} placeholder="0.00" required className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Amount Approved ($)</label>
              <input type="number" step="0.01" min="0" value={form.amountApproved} onChange={e => setForm(f => ({ ...f, amountApproved: e.target.value }))} placeholder="0.00 (optional)" className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Date Submitted</label>
              <input type="date" value={form.dateSubmitted} onChange={e => setForm(f => ({ ...f, dateSubmitted: e.target.value }))} className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Tracking Number</label>
              <input value={form.trackingNumber} onChange={e => setForm(f => ({ ...f, trackingNumber: e.target.value }))} placeholder="Tracking #" className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Status *</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} required className={`w-full ${inputCls}`}>
                <option value="">— select —</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-3 flex flex-col gap-2 items-end">
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 w-full">
                  {saveError}
                </p>
              )}
              <button type="submit" disabled={saving} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40">
                {saving ? 'Adding...' : 'Add USPS Claim'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Order Number *</label>
              <input value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="Order #" required className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Date Order</label>
              <input type="date" value={form.dateOrder} onChange={e => setForm(f => ({ ...f, dateOrder: e.target.value }))} className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Model #</label>
              <input value={form.modelNumber} onChange={e => setForm(f => ({ ...f, modelNumber: e.target.value }))} placeholder="Model #" className={`w-full ${inputCls}`} />
            </div>
            <div className={isIncomplete ? 'col-span-2 md:col-span-1' : 'col-span-2'}>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Item Name</label>
              <input value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} placeholder={isIncomplete ? 'e.g. 6 pack of Empire pipe levels' : 'Item name'} className={`w-full ${inputCls}`} />
            </div>
            {isIncomplete && <>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Qty Ordered</label>
                <input type="number" min="0" step="1" value={form.qtyOrdered} onChange={e => setForm(f => ({ ...f, qtyOrdered: e.target.value }))} placeholder="6" className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Qty Received</label>
                <input type="number" min="0" step="1" value={form.qtyReceived} onChange={e => setForm(f => ({ ...f, qtyReceived: e.target.value }))} placeholder="1" className={`w-full ${inputCls}`} />
              </div>
            </>}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Username</label>
              <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Username" className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Status *</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} required className={`w-full ${inputCls}`}>
                <option value="">— select —</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {isIncomplete && (
              <div className="col-span-2 md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Note</label>
                <textarea rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="What the buyer said, what was sent, tracking — anything the next person needs"
                  className={`w-full resize-y ${inputCls}`} />
              </div>
            )}
            <div className="col-span-2 md:col-span-3 flex flex-col gap-2 items-end">
              {saveError && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-3 py-2 w-full">
                  {saveError}
                </p>
              )}
              <button type="submit" disabled={saving} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40">
                {saving ? 'Adding...' : `Add ${SECTION_LABELS[type].slice(0, -1)}`}
              </button>
            </div>
          </form>
        )}
      </div>}

      {/* Records table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : claims.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No {SECTION_LABELS[type].toLowerCase()} yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  {isUsps ? (
                    <>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Username</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Amt Requested</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Amt Approved</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Date Submitted</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Tracking #</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Order #</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Date</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Model #</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Item Name</th>
                      {isIncomplete && <>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Ordered</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Received</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Missing</th>
                      </>}
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Username</th>
                    </>
                  )}
                  <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Status</th>
                  {isIncomplete && <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Note</th>}
                  {isAdminOrManager && <th className="py-3 px-4 w-16" />}
                </tr>
              </thead>
              <tbody>
                {claims.map(c => {
                  const isEditing = editingIdx === c.rowIndex;
                  const inCls = 'text-xs px-2 py-1 border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
                  return (
                  <tr key={c.rowIndex} className={`border-b border-slate-50 dark:border-slate-700/50 ${isEditing ? 'bg-blue-50/40 dark:bg-blue-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                    {isUsps ? (
                      <>
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} className={inCls} placeholder="username" />
                          ) : (
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                              {c.username ? (
                                <a href={`https://www.whatnot.com/user/${c.username}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.username}</a>
                              ) : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input type="number" step="0.01" min="0" value={editForm.amountRequested} onChange={e => setEditForm(f => ({ ...f, amountRequested: e.target.value }))} className={inCls} placeholder="0.00" />
                          ) : (
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.amountRequested != null ? `$${c.amountRequested.toFixed(2)}` : '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input type="number" step="0.01" min="0" value={editForm.amountApproved} onChange={e => setEditForm(f => ({ ...f, amountApproved: e.target.value }))} className={inCls} placeholder="0.00" />
                          ) : (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{c.amountApproved != null ? `$${c.amountApproved.toFixed(2)}` : <span className="text-slate-400 font-normal">—</span>}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input type="date" value={editForm.dateSubmitted} onChange={e => setEditForm(f => ({ ...f, dateSubmitted: e.target.value }))} className={inCls} />
                          ) : (
                            <span className="text-xs text-slate-400">{c.dateSubmitted || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {isEditing ? (
                            <input value={editForm.trackingNumber} onChange={e => setEditForm(f => ({ ...f, trackingNumber: e.target.value }))} className={inCls} placeholder="Tracking #" />
                          ) : (
                            <>
                              <div className="font-mono text-xs text-slate-600 dark:text-slate-300 mb-1">{c.trackingNumber || '—'}</div>
                              {c.trackingNumber && (
                                <a
                                  href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(c.trackingNumber)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                                >
                                  Track on USPS ↗
                                </a>
                              )}
                            </>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 px-4 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                          {isEditing ? <input value={editForm.orderNumber} onChange={e => setEditForm(f => ({ ...f, orderNumber: e.target.value }))} className={inCls} placeholder="Order #" /> : (c.orderNumber || '—')}
                        </td>
                        <td className="py-2 px-4 text-xs text-slate-400">
                          {isEditing ? <input type="date" value={editForm.dateOrder} onChange={e => setEditForm(f => ({ ...f, dateOrder: e.target.value }))} className={inCls} /> : (c.dateOrder || '—')}
                        </td>
                        <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
                          {isEditing ? <input value={editForm.modelNumber} onChange={e => setEditForm(f => ({ ...f, modelNumber: e.target.value }))} className={inCls} placeholder="Model #" /> : (c.modelNumber || '—')}
                        </td>
                        <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                          {isEditing ? <input value={editForm.itemName} onChange={e => setEditForm(f => ({ ...f, itemName: e.target.value }))} className={inCls} placeholder="Item name" /> : (c.itemName || '—')}
                        </td>
                        {isIncomplete && <>
                          <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
                            {isEditing ? <input type="number" min="0" step="1" value={editForm.qtyOrdered} onChange={e => setEditForm(f => ({ ...f, qtyOrdered: e.target.value }))} className={`${inCls} w-16`} /> : (c.qtyOrdered ?? '—')}
                          </td>
                          <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
                            {isEditing ? <input type="number" min="0" step="1" value={editForm.qtyReceived} onChange={e => setEditForm(f => ({ ...f, qtyReceived: e.target.value }))} className={`${inCls} w-16`} /> : (c.qtyReceived ?? '—')}
                          </td>
                          <td className="py-2 px-4">{missingPill(c)}</td>
                        </>}
                        <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300">
                          {isEditing ? <input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} className={inCls} placeholder="Username" />
                            : c.username ? <a href={`https://www.whatnot.com/user/${c.username}`} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">{c.username}</a>
                            : '—'}
                        </td>
                      </>
                    )}
                    <td className="py-2 px-4">
                      {isEditing ? (
                        <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={`text-[10px] font-bold border rounded-full px-2 py-0.5 focus:outline-none ${statusColor(editForm.status)}`}>
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : isAdminOrManager ? (
                        <select
                          value={c.status}
                          onChange={e => handleStatusChange(c, e.target.value)}
                          disabled={savingStatusIdx === c.rowIndex}
                          className={`text-[10px] font-bold border rounded-full px-2 py-0.5 focus:outline-none ${statusColor(c.status)}`}
                        >
                          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(c.status)}`}>{c.status || '—'}</span>
                      )}
                    </td>
                    {isIncomplete && (
                      <td className="py-2 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[240px]">
                        {isEditing ? (
                          <textarea rows={2} value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} className={`${inCls} resize-y`} placeholder="Note" />
                        ) : c.note ? (
                          // The full note stays reachable on hover rather than
                          // stretching the row to whatever the longest one is.
                          <span className="block truncate" title={c.note}>{c.note}</span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    )}
                    {isAdminOrManager && (
                      <td className="py-2 px-4">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(c)} disabled={savingEdit}
                              className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50">
                              {savingEdit ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingIdx(null)}
                              className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600 rounded transition-colors">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {(isUsps || isIncomplete) && (
                              <button onClick={() => openEdit(c)}
                                className="text-slate-400 hover:text-blue-500 transition-colors p-1 rounded"
                                title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(c)}
                              disabled={deletingIdx === c.rowIndex}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded disabled:opacity-40"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// â"€â"€â"€ Main Shipping Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ─── Needs attention ───────────────────────────────────────────────────────

type Attention = { id: string; buyer: string; why: string; urgent: boolean };

/** What the bell lists: parcels Whatnot is holding up, late ones, and follow-ups. */
function attentionOf(rows: ShipmentRow[], me: string, isManager: boolean): Attention[] {
  const out: Attention[] = [];
  for (const r of rows) {
    // A shipper's list also holds work nobody has taken; their bell is about theirs.
    if (!isManager && r.assignment?.assignedTo !== me) continue;
    const buyer = r.wn?.buyer ?? `#${r.shipmentId}`;
    for (const a of r.wn?.requiredActions ?? []) out.push({ id: r.shipmentId, buyer, why: ACTION_TEXT[a]?.label ?? a.replace(/_/g, ' '), urgent: true });
    if (r.wn?.overdue) out.push({ id: r.shipmentId, buyer, why: 'Overdue — past its drop-off day', urgent: true });
    const a = r.assignment;
    if (a?.pinged && a.status !== 'resolved' && (isManager || a.assignedTo === me)) {
      out.push({ id: r.shipmentId, buyer, why: `Follow-up${isManager ? ` to ${a.assignedToName}` : ''}: ${a.pingMessage || 'please check this one'}`, urgent: false });
    }
  }
  return out;
}

function ShippingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [activeSection, setActiveSection] = useState<SectionType>('shipments');
  const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
  const [editMode, setEditMode] = useState(false);
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Sync active section with ?tab= URL param whenever it changes
  useEffect(() => {
    const tab = searchParams.get('tab') as SectionType;
    if (tab && ['cancellation', 'incomplete', 'replacement', 'refund', 'usps', 'accountability'].includes(tab)) {
      setActiveSection(tab);
    } else {
      setActiveSection('shipments');
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    // Prefetch unresolved counts for badge display
    (['cancellation', 'incomplete', 'replacement', 'refund', 'usps'] as const).forEach(t => {
      fetch(`/api/claims?type=${t}`)
        .then(r => r.json())
        .then((data: ClaimRecord[]) => {
          if (!Array.isArray(data)) return;
          const count = data.filter(c => t === 'usps' ? c.status !== 'Approved' : c.status !== 'Resolved').length;
          setSectionCounts(prev => ({ ...prev, [t]: count }));
        })
        .catch(() => {});
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onRows = useCallback((r: ShipmentRow[]) => setRows(r), []);
  const isAdminOrManager = session?.role === 'admin' || session?.role === 'manager';
  const sections: SectionType[] = ['shipments', 'cancellation', 'incomplete', 'replacement', 'refund', 'usps',
    ...(isAdminOrManager ? ['accountability' as const] : [])];

  // The underline slides between tabs rather than jumping.
  const tabRefs = useRef<Partial<Record<SectionType, HTMLButtonElement | null>>>({});
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeSection];
      if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeSection, session]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const attention = session ? attentionOf(rows, session.username, isAdminOrManager) : [];

  function downloadCSV() {
    const mine = rows.filter(s => s.assignment?.assignedTo === session?.username && s.assignment?.status !== 'resolved');
    const csvRows = [
      ['Shipment #', 'Buyer', 'Date', 'Items', 'Whatnot', 'Status', 'Notes', 'Assigned By', 'Assigned At'],
      ...mine.map(s => [
        s.shipmentId, s.wn?.buyer ?? '', s.tab, String(s.wn?.itemCount ?? ''), s.wn?.statusLabel ?? '',
        s.assignment?.status || '',
        (s.assignment?.notes || '').replace(/,/g, ' '),
        s.assignment?.assignedBy || '',
        s.assignment?.assignedAt ? new Date(s.assignment.assignedAt).toLocaleDateString() : '',
      ]),
    ];
    const csv = csvRows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `my-shipments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const onShipments = activeSection === 'shipments';
  const headerBtn = 'inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors';

  return (
    <Toasts>
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 lg:h-[72px] bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight truncate">Shipments</h1>
            <span className="hidden sm:block w-px h-7 bg-slate-700" />
            <span className="hidden sm:flex items-center gap-2 text-sm text-slate-300 truncate">
              <I.calendar className="w-[18px] h-[18px] text-slate-400" />{today}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            {onShipments && (
              <>
                <Tip content={attention.length ? `${attention.length} thing${attention.length === 1 ? '' : 's'} need attention on this list` : 'Nothing needs attention right now'} align="end">
                  <button ref={bellRef} onClick={() => setBellOpen(o => !o)} aria-label="Needs attention" aria-expanded={bellOpen}
                    className={`relative w-10 h-10 grid place-items-center rounded-xl transition-colors ${bellOpen ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
                    <I.bell className="w-[22px] h-[22px]" />
                    {attention.length > 0 && <span className="absolute top-2 right-2.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-slate-900 animate-in zoom-in-50 duration-200" />}
                  </button>
                </Tip>
                <Popover open={bellOpen} onClose={() => setBellOpen(false)} anchor={bellRef} align="end" className="w-80 p-2">
                  <p className="px-2 pt-1 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Needs attention</p>
                  {attention.length === 0 && <p className="px-2 pb-2 text-sm text-slate-500">All clear on this list.</p>}
                  <ul className="max-h-80 overflow-y-auto">
                    {attention.map((a, i) => (
                      <li key={`${a.id}-${i}`}>
                        <button onClick={() => { setFocus({ id: a.id, n: Date.now() }); setBellOpen(false); }}
                          className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors">
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.urgent ? 'bg-red-500' : 'bg-amber-500'}`} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">{a.buyer}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">{a.why}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover>
              </>
            )}
            {!isAdminOrManager && onShipments && (
              <Tip content="Your unresolved shipments as a spreadsheet" align="end">
                <button onClick={downloadCSV} className={`${headerBtn} bg-white/10 text-white hover:bg-white/20`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  <span className="hidden sm:inline">CSV</span>
                </button>
              </Tip>
            )}
            {onShipments && (
              <Tip content={editMode ? 'Leave select mode' : 'Select several shipments to resolve or unassign at once'} align="end">
                <button onClick={() => setEditMode(m => !m)} aria-pressed={editMode}
                  className={`${headerBtn} ${editMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-slate-900 hover:bg-slate-100'}`}>
                  <I.edit className="w-4 h-4" />{editMode ? 'Done' : 'Edit'}
                </button>
              </Tip>
            )}
            <span className="hidden sm:grid h-10 px-4 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 text-sm font-semibold capitalize place-items-center">{session.role}</span>
          </div>
        </header>

        {/* Section tabs */}
        <nav role="tablist" aria-label="Shipments sections" className="relative bg-slate-900 border-b border-slate-800 px-2 sm:px-4 flex gap-1 overflow-x-auto flex-shrink-0">
          {sections.map(s => {
            const on = activeSection === s;
            return (
              <button key={s} ref={el => { tabRefs.current[s] = el; }} role="tab" aria-selected={on}
                onClick={() => setActiveSection(s)}
                className={`relative flex items-center gap-2 px-4 h-14 text-[15px] font-semibold whitespace-nowrap transition-colors duration-200 ${on ? 'text-white' : 'text-slate-400 hover:text-slate-100'}`}>
                {s === 'shipments' && !isAdminOrManager ? 'Assigned Shipments' : SECTION_LABELS[s]}
                {s !== 'shipments' && s !== 'accountability' && (sectionCounts[s] ?? 0) > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-xs font-bold grid place-items-center">{sectionCounts[s]}</span>
                )}
              </button>
            );
          })}
          {underline && (
            <span aria-hidden="true" className="absolute bottom-0 h-[3px] rounded-t-full bg-blue-500 transition-[left,width] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
              style={{ left: underline.left, width: underline.width }} />
          )}
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* Kept mounted while hidden, so filters and open rows survive a trip to another tab. */}
          <div hidden={!onShipments} className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
            <ShipmentQueue session={session} isManager={isAdminOrManager} editMode={editMode}
              onExitEdit={() => setEditMode(false)} onRows={onRows} focus={focus} />
          </div>
          {!onShipments && (
            <div key={activeSection} className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
              {activeSection === 'accountability'
                ? isAdminOrManager && <Accountability />
                : <ClaimsSection type={activeSection} isAdminOrManager={isAdminOrManager} />}
            </div>
          )}
        </main>
      </div>
    </div>
    </Toasts>
  );
}

export default function ShippingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    }>
      <ShippingPageInner />
    </Suspense>
  );
}
