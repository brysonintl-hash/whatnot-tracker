'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type Assignment = {
  shipmentId: string; tab: string;
  assignedTo: string; assignedToName: string; assignedToRole: string;
  assignedBy: string; assignedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
  notes: string;
  pinged: boolean; pingMessage: string; pingAt: string;
};

type ShipmentRow = { shipmentId: string; tab: string; assignment: Assignment | null };
type User = { username: string; name: string; role: Role };

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'in-progress': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  resolved: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
};
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved' };

export default function ShippingPage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'pending' | 'in-progress' | 'resolved'>('all');

  // Auto-assign state
  const [autoUser, setAutoUser] = useState('');
  const [autoCount, setAutoCount] = useState('');
  const [autoNotes, setAutoNotes] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);

  // Single-assign state per row
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState<Record<string, { username: string; name: string; role: string; notes: string }>>({});

  // Ping state
  const [pingTarget, setPingTarget] = useState<string | null>(null);
  const [pingMsg, setPingMsg] = useState('');
  const [pingSaving, setPingSaving] = useState(false);

  // Bulk edit state
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  function downloadCSV() {
    const myShipments = shipments.filter(s =>
      s.assignment?.assignedTo === session?.username && s.assignment?.status !== 'resolved'
    );
    const rows = [
      ['Shipment #', 'Date', 'Status', 'Notes', 'Assigned By', 'Assigned At'],
      ...myShipments.map(s => [
        s.shipmentId, s.tab,
        s.assignment?.status || '',
        (s.assignment?.notes || '').replace(/,/g, ' '),
        s.assignment?.assignedBy || '',
        s.assignment?.assignedAt ? new Date(s.assignment.assignedAt).toLocaleDateString() : '',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `my-shipments-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function load() {
    const [sRes, uRes] = await Promise.all([fetch('/api/shipments'), fetch('/api/users')]);
    const [sData, uData] = await Promise.all([sRes.json(), uRes.json()]);
    setShipments(Array.isArray(sData) ? sData : []);
    setUsers(Array.isArray(uData) ? uData.filter((u: User) => u.role === 'host' || u.role === 'shipper') : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    load();
  }, []);

  const allTabs = useMemo(() => {
    const tabs = Array.from(new Set(shipments.map(s => s.tab))).sort((a, b) => {
      const parse = (t: string) => { const [m, d, y] = t.split('/').map(Number); return new Date(2000 + y, m - 1, d).getTime(); };
      return parse(b) - parse(a);
    });
    return tabs;
  }, [shipments]);

  useEffect(() => {
    if (allTabs.length > 0 && !selectedTab) setSelectedTab(allTabs[0]);
  }, [allTabs]);

  // allTabs is sorted newest→oldest; prevTab = older, nextTab = newer
  const currentTabIdx = allTabs.indexOf(selectedTab);
  const prevTab = currentTabIdx < allTabs.length - 1 ? allTabs[currentTabIdx + 1] : null;
  const nextTab = currentTabIdx > 0 ? allTabs[currentTabIdx - 1] : null;

  const isAdminOrManager = session?.role === 'admin' || session?.role === 'manager';

  const tabShipments = useMemo(() =>
    selectedTab ? shipments.filter(s => s.tab === selectedTab) : [],
    [shipments, selectedTab]);

  const unassignedInTab = useMemo(() => tabShipments.filter(s => !s.assignment), [tabShipments]);

  const displayed = useMemo(() => {
    if (!session) return [];
    if (isAdminOrManager) {
      return tabShipments.filter(s => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'unassigned') return !s.assignment;
        return s.assignment?.status === statusFilter;
      });
    }
    return shipments.filter(s => s.assignment?.assignedTo === session.username);
  }, [shipments, tabShipments, session, statusFilter, isAdminOrManager]);

  function key(s: ShipmentRow) { return `${s.shipmentId}|${s.tab}`; }

  function getForm(s: ShipmentRow) {
    const k = key(s);
    if (assignForm[k]) return assignForm[k];
    if (s.assignment) return { username: s.assignment.assignedTo, name: s.assignment.assignedToName, role: s.assignment.assignedToRole, notes: s.assignment.notes };
    return { username: '', name: '', role: '', notes: '' };
  }

  async function autoAssign() {
    const count = parseInt(autoCount);
    if (!autoUser || !count || count <= 0) return;
    const user = users.find(u => u.username === autoUser);
    if (!user) return;
    const pool = unassignedInTab.slice(0, count);
    if (!pool.length) { alert('No unassigned shipments available.'); return; }
    setAutoSaving(true);
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'auto-assign',
        items: pool.map(s => ({ shipmentId: s.shipmentId, tab: s.tab })),
        assignedTo: user.username,
        assignedToName: user.name,
        assignedToRole: user.role,
        notes: autoNotes,
      }),
    });
    setAutoSaving(false);
    setAutoCount('');
    setAutoNotes('');
    load();
  }

  async function saveAssignment(s: ShipmentRow) {
    const k = key(s);
    const form = assignForm[k];
    if (!form?.username) return;
    setAssigning(k);
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: s.shipmentId, tab: s.tab, assignedTo: form.username, assignedToName: form.name, assignedToRole: form.role, notes: form.notes }),
    });
    setAssigning(null);
    setAssignForm(f => { const n = { ...f }; delete n[k]; return n; });
    load();
  }

  async function unassign(s: ShipmentRow) {
    if (!confirm('Remove assignment?')) return;
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: s.shipmentId, tab: s.tab, remove: true }),
    });
    load();
  }

  async function updateStatus(s: ShipmentRow, status: string) {
    await fetch('/api/shipments/assign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId: s.shipmentId, tab: s.tab, status }),
    });
    load();
  }

  async function sendPing(s: ShipmentRow) {
    const k = key(s);
    setPingSaving(true);
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping', shipmentId: s.shipmentId, tab: s.tab, pingMessage: pingMsg }),
    });
    setPingSaving(false);
    setPingTarget(null);
    setPingMsg('');
    load();
  }

  async function acknowledge(s: ShipmentRow) {
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge', shipmentId: s.shipmentId, tab: s.tab }),
    });
    load();
  }

  function toggleSelect(k: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    const all = displayed.map(s => key(s));
    if (selected.size === all.length) setSelected(new Set());
    else setSelected(new Set(all));
  }

  function keyToItem(k: string) {
    const idx = k.indexOf('|');
    return { shipmentId: k.slice(0, idx), tab: k.slice(idx + 1) };
  }

  async function bulkAction(action: 'bulk-resolve' | 'bulk-unassign') {
    const items = Array.from(selected).map(keyToItem);
    setBulkSaving(true);
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, items }),
    });
    setBulkSaving(false);
    setSelected(new Set());
    setEditMode(false);
    load();
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Shipments</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isAdminOrManager && (
              <button onClick={downloadCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download CSV
              </button>
            )}
            <button
              onClick={() => { setEditMode(m => !m); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${editMode ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              {editMode ? 'Cancel Edit' : 'Edit'}
            </button>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading shipments...</div>
          ) : (
            <>
              {isAdminOrManager && (
                <>
                  {/* Date + filter bar */}
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {/* Prev / Next date navigation */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => prevTab && setSelectedTab(prevTab)}
                        disabled={!prevTab}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        Prev
                      </button>
                      <div className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-black text-slate-900 dark:text-white min-w-[90px] text-center">
                        {selectedTab || '—'}
                      </div>
                      <button
                        onClick={() => nextTab && setSelectedTab(nextTab)}
                        disabled={!nextTab}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(['all', 'unassigned', 'pending', 'in-progress', 'resolved'] as const).map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${statusFilter === f ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
                          {f === 'all' ? `All (${tabShipments.length})` : f === 'unassigned' ? `Unassigned (${unassignedInTab.length})` : STATUS_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Auto-assign panel */}
                  {unassignedInTab.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-4">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Auto-Assign
                        <span className="text-xs font-normal text-slate-400">{unassignedInTab.length} unassigned shipments available</span>
                      </h3>
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Assign</label>
                          <input
                            type="number" min="1" max={unassignedInTab.length}
                            value={autoCount}
                            onChange={e => setAutoCount(e.target.value)}
                            placeholder="qty"
                            className="w-20 text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">To</label>
                          <select value={autoUser} onChange={e => setAutoUser(e.target.value)}
                            className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400">
                            <option value="">— select person —</option>
                            {users.map(u => <option key={u.username} value={u.username}>{u.name} ({u.role})</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notes (optional)</label>
                          <input type="text" value={autoNotes} onChange={e => setAutoNotes(e.target.value)} placeholder="e.g. handle asap"
                            className="w-full text-sm px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400" />
                        </div>
                        <button
                          onClick={autoAssign}
                          disabled={!autoUser || !autoCount || autoSaving}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
                        >
                          {autoSaving ? 'Assigning...' : `Assign ${autoCount || '?'} shipments`}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Non-admin/manager header */}
              {!isAdminOrManager && (
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">My Assigned Shipments</h2>
                  <p className="text-xs text-slate-400">Shipments assigned to you</p>
                </div>
              )}

              {/* Ping modal */}
              {pingTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPingTarget(null)}>
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                    <h3 className="font-black text-slate-900 dark:text-white mb-1">Follow Up / Ping</h3>
                    <p className="text-xs text-slate-400 mb-4">Send a follow-up message to the assigned person</p>
                    <textarea
                      value={pingMsg}
                      onChange={e => setPingMsg(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="w-full text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setPingTarget(null)} className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                      <button
                        onClick={() => {
                          const s = displayed.find(s => key(s) === pingTarget);
                          if (s) sendPing(s);
                        }}
                        disabled={pingSaving}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {pingSaving ? 'Sending...' : 'Send Ping'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk action bar */}
              {editMode && (
                <div className="flex items-center gap-3 mb-4 bg-slate-900 dark:bg-slate-700 rounded-xl px-4 py-3 flex-wrap">
                  <span className="text-white text-xs font-bold">
                    {selected.size} selected
                  </span>
                  <div className="flex gap-2 ml-auto">
                    {isAdminOrManager && selected.size > 0 && (
                      <button onClick={() => bulkAction('bulk-unassign')} disabled={bulkSaving}
                        className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                        {bulkSaving ? '...' : `Unassign (${selected.size})`}
                      </button>
                    )}
                    {selected.size > 0 && (
                      <button onClick={() => bulkAction('bulk-resolve')} disabled={bulkSaving}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                        {bulkSaving ? '...' : `Resolve (${selected.size})`}
                      </button>
                    )}
                    <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-colors">
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <svg className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No shipments found</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {isAdminOrManager ? 'Try selecting a different date or filter' : 'No shipments have been assigned to you yet'}
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        {editMode && (
                          <th className="py-3 pl-4 pr-2 w-10">
                            <input type="checkbox"
                              checked={selected.size === displayed.length && displayed.length > 0}
                              onChange={toggleAll}
                              className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer" />
                          </th>
                        )}
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Shipment #</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Date</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Status</th>
                        {isAdminOrManager
                          ? <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Assigned To / Assign</th>
                          : <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Notes</th>
                        }
                        <th className="py-3 px-4 text-right text-[10px] text-slate-400 font-bold uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(s => {
                        const k = key(s);
                        const form = getForm(s);
                        const isSaving = assigning === k;
                        const isPinged = s.assignment?.pinged;
                        const isResolved = s.assignment?.status === 'resolved';
                        const isMyShipment = !isAdminOrManager && s.assignment?.assignedTo === session?.username;

                        return (
                          <tr key={k}
                            className={`border-b border-slate-50 dark:border-slate-700/50 transition-colors ${isPinged ? 'bg-amber-50/60 dark:bg-amber-900/10' : selected.has(k) ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>

                            {/* Checkbox */}
                            {editMode && (
                              <td className="py-3 pl-4 pr-2">
                                <input type="checkbox"
                                  checked={selected.has(k)}
                                  onChange={() => toggleSelect(k)}
                                  className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer" />
                              </td>
                            )}

                            {/* Shipment ID (plain text, no link) */}
                            <td className="py-3 px-5">
                              <span className="font-mono text-xs text-slate-800 dark:text-slate-200 font-bold select-all">{s.shipmentId}</span>
                            </td>

                            {/* Date */}
                            <td className="py-3 px-4 text-xs text-slate-400">{s.tab}</td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              {s.assignment ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[s.assignment.status]}`}>
                                  {STATUS_LABEL[s.assignment.status]}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 dark:bg-slate-700 text-slate-400 border-slate-200 dark:border-slate-600">
                                  Unassigned
                                </span>
                              )}
                            </td>

                            {/* Admin: assign controls */}
                            {isAdminOrManager && (
                              <td className="py-3 px-4">
                                {s.assignment && (
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    {s.assignment.assignedToName}
                                    <span className="ml-1 text-[10px] font-normal text-slate-400">({s.assignment.assignedToRole})</span>
                                    {s.assignment.notes && <span className="ml-1 text-[10px] text-slate-400">· {s.assignment.notes}</span>}
                                  </p>
                                )}
                                {isPinged && !isResolved && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mb-1">
                                    📣 Ping sent: {s.assignment?.pingMessage || 'Follow up'}
                                  </p>
                                )}
                                {/* Editable controls only when NOT resolved */}
                                {!isResolved && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <select
                                      value={form.username}
                                      onChange={e => {
                                        const sel = users.find(u => u.username === e.target.value);
                                        setAssignForm(f => ({ ...f, [k]: { username: e.target.value, name: sel?.name || '', role: sel?.role || '', notes: form.notes } }));
                                      }}
                                      className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    >
                                      <option value="">— assign —</option>
                                      {users.map(u => <option key={u.username} value={u.username}>{u.name} ({u.role})</option>)}
                                    </select>
                                    <input type="text" placeholder="Notes" value={form.notes}
                                      onChange={e => setAssignForm(f => ({ ...f, [k]: { ...form, notes: e.target.value } }))}
                                      className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-28" />
                                  </div>
                                )}
                              </td>
                            )}

                            {/* Host/Shipper: notes + ping indicator */}
                            {!isAdminOrManager && (
                              <td className="py-3 px-4">
                                {isPinged && (
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                      {s.assignment?.pingMessage || 'Follow-up requested'}
                                    </span>
                                  </div>
                                )}
                                <span className="text-xs text-slate-500 dark:text-slate-400">{s.assignment?.notes || '—'}</span>
                              </td>
                            )}

                            {/* Actions */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                                {isResolved ? (
                                  /* Resolved: only show Remove for admin/manager */
                                  <>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Resolved</span>
                                    {isAdminOrManager && (
                                      <button onClick={() => unassign(s)}
                                        className="px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent">
                                        Remove
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {/* Admin: save assignment */}
                                    {isAdminOrManager && assignForm[k]?.username && (
                                      <button onClick={() => saveAssignment(s)} disabled={isSaving}
                                        className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50">
                                        {isSaving ? '...' : s.assignment ? 'Update' : 'Assign'}
                                      </button>
                                    )}
                                    {/* Admin: status select */}
                                    {isAdminOrManager && s.assignment && (
                                      <select value={s.assignment.status} onChange={e => updateStatus(s, e.target.value)}
                                        className="text-[10px] border border-slate-200 dark:border-slate-600 rounded-lg px-1.5 py-1 bg-white dark:bg-slate-700 dark:text-slate-300 focus:outline-none">
                                        <option value="pending">Pending</option>
                                        <option value="in-progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                      </select>
                                    )}
                                    {/* Admin: follow up / ping (not shown when resolved) */}
                                    {isAdminOrManager && s.assignment && (
                                      <button onClick={() => { setPingTarget(k); setPingMsg(''); }}
                                        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-colors ${isPinged ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600'}`}>
                                        {isPinged ? '📣 Pinged' : 'Follow Up'}
                                      </button>
                                    )}
                                    {/* Admin: remove */}
                                    {isAdminOrManager && s.assignment && (
                                      <button onClick={() => unassign(s)}
                                        className="px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent">
                                        Remove
                                      </button>
                                    )}
                                    {/* Host/Shipper: status + acknowledge */}
                                    {isMyShipment && (
                                      <>
                                        {s.assignment?.status === 'pending' && (
                                          <button onClick={() => updateStatus(s, 'in-progress')}
                                            className="px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold rounded-lg transition-colors">
                                            Start
                                          </button>
                                        )}
                                        <button onClick={() => updateStatus(s, 'resolved')}
                                          className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-colors">
                                          Resolve
                                        </button>
                                        {isPinged && (
                                          <button onClick={() => acknowledge(s)}
                                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-colors">
                                            Acknowledge
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
