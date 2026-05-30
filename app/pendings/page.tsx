'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type PendingTask = {
  id: string;
  customerName: string;
  customerLink: string;
  orderId: string;
  description: string;
  trackingNumber: string;
  orderDate: string;
  status: 'open' | 'resolved';
  urgent: boolean;
  followUp: boolean;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
};

type Filter = 'all' | 'open' | 'urgent' | 'followup' | 'resolved';

function fmtDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export default function PendingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form fields
  const [fName, setFName] = useState('');
  const [fLink, setFLink] = useState('');
  const [fOrder, setFOrder] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fTracking, setFTracking] = useState('');
  const [fDate, setFDate] = useState('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    fetch('/api/pendings').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTasks(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const canManage = session?.role === 'admin' || session?.role === 'manager';

  const filtered = tasks.filter(t => {
    if (filter === 'open') return t.status === 'open';
    if (filter === 'urgent') return t.urgent && t.status === 'open';
    if (filter === 'followup') return t.followUp && t.status === 'open';
    if (filter === 'resolved') return t.status === 'resolved';
    return true;
  });

  const counts = {
    all: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    urgent: tasks.filter(t => t.urgent && t.status === 'open').length,
    followup: tasks.filter(t => t.followUp && t.status === 'open').length,
    resolved: tasks.filter(t => t.status === 'resolved').length,
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/pendings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: fName,
        customerLink: fLink,
        orderId: fOrder,
        description: fDesc,
        trackingNumber: fTracking,
        orderDate: fDate,
      }),
    });
    const data = await res.json();
    if (data.task) {
      setTasks(prev => [data.task, ...prev]);
      setFName(''); setFLink(''); setFOrder(''); setFDesc(''); setFTracking(''); setFDate('');
      setShowForm(false);
    }
    setSaving(false);
  }

  async function patch(id: string, updates: Partial<Pick<PendingTask, 'status' | 'urgent' | 'followUp'>>) {
    setUpdatingId(id);
    const res = await fetch(`/api/pendings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.task) {
      setTasks(prev => prev.map(t => t.id === id ? data.task : t));
    }
    setUpdatingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this pending task?')) return;
    setDeletingId(id);
    await fetch(`/api/pendings/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  }

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'open', label: `Open (${counts.open})` },
    { key: 'urgent', label: `Urgent (${counts.urgent})` },
    { key: 'followup', label: `Follow-Up (${counts.followup})` },
    { key: 'resolved', label: `Resolved (${counts.resolved})` },
  ];

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Pendings</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
            <button
              onClick={() => setShowForm(v => !v)}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Task'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Add Task Form */}
          {showForm && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">New Pending Task</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Customer Name *</label>
                    <input
                      type="text"
                      value={fName}
                      onChange={e => setFName(e.target.value)}
                      placeholder="e.g. John Smith"
                      required
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Customer Link</label>
                    <input
                      type="url"
                      value={fLink}
                      onChange={e => setFLink(e.target.value)}
                      placeholder="https://whatnot.com/user/..."
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Order ID</label>
                    <input
                      type="text"
                      value={fOrder}
                      onChange={e => setFOrder(e.target.value)}
                      placeholder="Optional"
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Order Date</label>
                    <input
                      type="date"
                      value={fDate}
                      onChange={e => setFDate(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">USPS Tracking Number</label>
                    <input
                      type="text"
                      value={fTracking}
                      onChange={e => setFTracking(e.target.value)}
                      placeholder="Optional"
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea
                      value={fDesc}
                      onChange={e => setFDesc(e.target.value)}
                      placeholder="Describe the issue or what needs to be done..."
                      rows={3}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : 'Create Task'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  filter === f.key
                    ? f.key === 'urgent' ? 'bg-red-500 border-red-500 text-white'
                    : f.key === 'followup' ? 'bg-amber-500 border-amber-500 text-white'
                    : f.key === 'resolved' ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Task list */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No tasks found</p>
              <p className="text-slate-400 text-xs mt-1">
                {filter === 'open' ? 'All caught up! No open tasks.' : `No ${filter} tasks.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(task => (
                <div
                  key={task.id}
                  className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-5 transition-all ${
                    task.urgent
                      ? 'border-red-300 dark:border-red-700'
                      : task.followUp
                      ? 'border-amber-300 dark:border-amber-700'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {/* Status */}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          task.status === 'resolved'
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                        }`}>
                          {task.status === 'resolved' ? '✓ Resolved' : 'Open'}
                        </span>
                        {task.urgent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
                            🔴 Urgent
                          </span>
                        )}
                        {task.followUp && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                            🔔 Follow-Up
                          </span>
                        )}
                      </div>

                      {/* Customer */}
                      <div className="flex items-center gap-2 mb-1">
                        {task.customerLink ? (
                          <a
                            href={task.customerLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-slate-900 dark:text-white text-sm hover:text-red-600 dark:hover:text-red-400 transition-colors underline underline-offset-2"
                          >
                            {task.customerName}
                          </a>
                        ) : (
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{task.customerName}</p>
                        )}
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 mb-2">
                        {task.orderId && (
                          <span>Order: <span className="font-semibold text-slate-600 dark:text-slate-300">{task.orderId}</span></span>
                        )}
                        {task.orderDate && (
                          <span>Date: <span className="font-semibold text-slate-600 dark:text-slate-300">{fmtDate(task.orderDate)}</span></span>
                        )}
                        {task.trackingNumber && (
                          <a
                            href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${task.trackingNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-red-500 transition-colors"
                          >
                            Tracking: <span className="font-semibold text-slate-600 dark:text-slate-300 hover:text-red-500">{task.trackingNumber}</span>
                          </a>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{task.description}</p>
                      )}

                      <p className="text-[10px] text-slate-400">
                        Added by <span className="font-semibold capitalize">{task.createdBy}</span> ({task.createdByRole}) · {fmtDate(task.createdAt)}
                      </p>
                    </div>

                    {/* Right: actions */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {/* Resolve / Reopen */}
                      <button
                        onClick={() => patch(task.id, { status: task.status === 'open' ? 'resolved' : 'open' })}
                        disabled={updatingId === task.id}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                          task.status === 'open'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                            : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {task.status === 'open' ? '✓ Resolve' : '↩ Reopen'}
                      </button>

                      {/* Admin/Manager: Urgent toggle */}
                      {canManage && task.status === 'open' && (
                        <button
                          onClick={() => patch(task.id, { urgent: !task.urgent })}
                          disabled={updatingId === task.id}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                            task.urgent
                              ? 'bg-red-500 border-red-500 text-white hover:bg-red-600'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'
                          }`}
                        >
                          🔴 Urgent
                        </button>
                      )}

                      {/* Admin/Manager: Follow-Up toggle */}
                      {canManage && task.status === 'open' && (
                        <button
                          onClick={() => patch(task.id, { followUp: !task.followUp })}
                          disabled={updatingId === task.id}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                            task.followUp
                              ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-600'
                          }`}
                        >
                          🔔 Follow-Up
                        </button>
                      )}

                      {/* Admin/Manager: Delete */}
                      {canManage && (
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={deletingId === task.id}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
