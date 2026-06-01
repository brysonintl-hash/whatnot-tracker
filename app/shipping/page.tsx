'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type Assignment = {
  shipmentId: string;
  tab: string;
  assignedTo: string;
  assignedToName: string;
  assignedToRole: string;
  assignedBy: string;
  assignedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
  notes: string;
};

type ShipmentRow = {
  shipmentId: string;
  tab: string;
  assignment: Assignment | null;
};

type User = { username: string; name: string; role: Role };

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'in-progress': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  resolved: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
};

export default function ShippingPage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | 'pending' | 'in-progress' | 'resolved'>('all');
  const [assigning, setAssigning] = useState<string | null>(null); // "shipmentId|tab" being saved
  const [assignForm, setAssignForm] = useState<Record<string, { username: string; name: string; role: string; notes: string }>>({});
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  async function load() {
    const [sRes, uRes] = await Promise.all([
      fetch('/api/shipments'),
      fetch('/api/users'),
    ]);
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

  // All tabs from shipments
  const allTabs = useMemo(() => {
    const tabs = Array.from(new Set(shipments.map(s => s.tab))).sort((a, b) => {
      const parse = (t: string) => { const [m, d, y] = t.split('/').map(Number); return new Date(2000 + y, m - 1, d).getTime(); };
      return parse(b) - parse(a);
    });
    return tabs;
  }, [shipments]);

  // Auto-select latest tab
  useEffect(() => {
    if (allTabs.length > 0 && !selectedTab) setSelectedTab(allTabs[0]);
  }, [allTabs]);

  const isAdminOrManager = session?.role === 'admin' || session?.role === 'manager';

  // For admin/manager: filter by tab. For host/shipper: show only their assignments
  const displayed = useMemo(() => {
    if (!session) return [];
    if (isAdminOrManager) {
      const tabFiltered = selectedTab ? shipments.filter(s => s.tab === selectedTab) : shipments;
      return tabFiltered.filter(s => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'unassigned') return !s.assignment;
        return s.assignment?.status === statusFilter;
      });
    }
    return shipments.filter(s => s.assignment?.assignedTo === session.username);
  }, [shipments, session, selectedTab, statusFilter, isAdminOrManager]);

  function getFormKey(shipmentId: string, tab: string) { return `${shipmentId}|${tab}`; }

  function getAssignForm(shipmentId: string, tab: string, assignment: Assignment | null) {
    const key = getFormKey(shipmentId, tab);
    if (assignForm[key]) return assignForm[key];
    if (assignment) return { username: assignment.assignedTo, name: assignment.assignedToName, role: assignment.assignedToRole, notes: assignment.notes };
    return { username: '', name: '', role: '', notes: '' };
  }

  async function saveAssignment(shipmentId: string, tab: string) {
    const key = getFormKey(shipmentId, tab);
    const form = assignForm[key];
    if (!form?.username) return;
    setAssigning(key);
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, tab, assignedTo: form.username, assignedToName: form.name, assignedToRole: form.role, notes: form.notes }),
    });
    setAssigning(null);
    setAssignForm(f => { const n = { ...f }; delete n[key]; return n; });
    load();
  }

  async function unassign(shipmentId: string, tab: string) {
    if (!confirm('Remove assignment?')) return;
    await fetch('/api/shipments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, tab, remove: true }),
    });
    load();
  }

  async function updateStatus(shipmentId: string, tab: string, status: string) {
    await fetch('/api/shipments/assign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipmentId, tab, status }),
    });
    load();
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const unassignedCount = isAdminOrManager && selectedTab ? shipments.filter(s => s.tab === selectedTab && !s.assignment).length : 0;
  const totalForTab = isAdminOrManager && selectedTab ? shipments.filter(s => s.tab === selectedTab).length : 0;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Shipments</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading shipments...</div>
          ) : (
            <>
              {/* Admin/Manager controls */}
              {isAdminOrManager && (
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  {/* Date tab selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Date:</span>
                    <select
                      value={selectedTab}
                      onChange={e => setSelectedTab(e.target.value)}
                      className="text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                    >
                      {allTabs.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Status filter */}
                  <div className="flex gap-1">
                    {(['all', 'unassigned', 'pending', 'in-progress', 'resolved'] as const).map(f => (
                      <button key={f} onClick={() => setStatusFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${statusFilter === f ? 'bg-red-500 border-red-500 text-white' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-400'}`}>
                        {f === 'all' ? 'All' : f === 'unassigned' ? `Unassigned (${unassignedCount})` : STATUS_LABEL[f]}
                      </button>
                    ))}
                  </div>

                  {selectedTab && (
                    <span className="text-xs text-slate-400 ml-auto">{totalForTab} shipments on {selectedTab}</span>
                  )}
                </div>
              )}

              {/* Non-admin header */}
              {!isAdminOrManager && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">My Assigned Shipments</h2>
                  <p className="text-xs text-slate-400">Shipments assigned to you by admin or manager</p>
                </div>
              )}

              {displayed.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <svg className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
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
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Shipment #</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Date</th>
                        <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Status</th>
                        {isAdminOrManager && <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Assign To</th>}
                        {!isAdminOrManager && <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Notes</th>}
                        <th className="py-3 px-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(s => {
                        const key = getFormKey(s.shipmentId, s.tab);
                        const form = getAssignForm(s.shipmentId, s.tab, s.assignment);
                        const isSaving = assigning === key;
                        const isMyShipment = !isAdminOrManager && s.assignment?.assignedTo === session.username;

                        return (
                          <tr key={key} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            {/* Shipment ID — links to USPS */}
                            <td className="py-3 px-5">
                              <a
                                href={`https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${s.shipmentId}`}
                                target="_blank" rel="noopener noreferrer"
                                className="font-mono text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                              >
                                {s.shipmentId}
                              </a>
                            </td>

                            {/* Date tab */}
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

                            {/* Admin/Manager: assign dropdown */}
                            {isAdminOrManager && (
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <select
                                    value={form.username}
                                    onChange={e => {
                                      const selected = users.find(u => u.username === e.target.value);
                                      setAssignForm(f => ({ ...f, [key]: { username: e.target.value, name: selected?.name || '', role: selected?.role || '', notes: form.notes } }));
                                    }}
                                    className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                                  >
                                    <option value="">— assign to —</option>
                                    {users.map(u => (
                                      <option key={u.username} value={u.username}>{u.name} ({u.role})</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    placeholder="Notes..."
                                    value={form.notes}
                                    onChange={e => setAssignForm(f => ({ ...f, [key]: { ...form, notes: e.target.value } }))}
                                    className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 w-32"
                                  />
                                </div>
                                {s.assignment && (
                                  <p className="text-[10px] text-slate-400 mt-1">
                                    Assigned to: <span className="font-bold">{s.assignment.assignedToName}</span>
                                    {s.assignment.notes && <> · {s.assignment.notes}</>}
                                  </p>
                                )}
                              </td>
                            )}

                            {/* Host/Shipper: notes */}
                            {!isAdminOrManager && (
                              <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{s.assignment?.notes || '—'}</td>
                            )}

                            {/* Actions */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 justify-end flex-wrap">
                                {isAdminOrManager && form.username && (
                                  <button
                                    onClick={() => saveAssignment(s.shipmentId, s.tab)}
                                    disabled={isSaving}
                                    className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {isSaving ? 'Saving...' : s.assignment ? 'Update' : 'Assign'}
                                  </button>
                                )}
                                {isAdminOrManager && s.assignment && (
                                  <button
                                    onClick={() => unassign(s.shipmentId, s.tab)}
                                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-lg transition-colors"
                                  >
                                    Unassign
                                  </button>
                                )}
                                {/* Status buttons for host/shipper */}
                                {isMyShipment && s.assignment?.status !== 'resolved' && (
                                  <>
                                    {s.assignment?.status === 'pending' && (
                                      <button
                                        onClick={() => updateStatus(s.shipmentId, s.tab, 'in-progress')}
                                        className="px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold rounded-lg transition-colors"
                                      >
                                        Start
                                      </button>
                                    )}
                                    <button
                                      onClick={() => updateStatus(s.shipmentId, s.tab, 'resolved')}
                                      className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold rounded-lg transition-colors"
                                    >
                                      Resolve
                                    </button>
                                  </>
                                )}
                                {/* Admin can also update status */}
                                {isAdminOrManager && s.assignment && (
                                  <select
                                    value={s.assignment.status}
                                    onChange={e => updateStatus(s.shipmentId, s.tab, e.target.value)}
                                    className="text-[10px] border border-slate-200 dark:border-slate-600 rounded-lg px-1.5 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="resolved">Resolved</option>
                                  </select>
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
