'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type PendingTask = {
  id: string; customerName: string; customerLink: string;
  orderId: string; description: string; trackingNumber: string;
  orderDate: string; status: 'open' | 'resolved';
  urgent: boolean; followUp: boolean;
  createdBy: string; createdByRole: string; createdAt: string; updatedAt: string;
};

type Filter = 'all' | 'open' | 'urgent' | 'followup' | 'resolved';

function fmtDate(iso: string) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function parseOrderDate(d: string): number {
  if (!d) return 0;
  try { return new Date(d).getTime(); }
  catch { return 0; }
}

const EMPTY_FORM = { name: '', link: '', order: '', desc: '', tracking: '', date: '' };

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(EMPTY_FORM);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    loadTasks();
  }, []);

  function loadTasks() {
    fetch('/api/pendings').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setTasks(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  const canManage = session?.role === 'admin' || session?.role === 'manager';

  // Sort: urgent open first (by orderDate desc), then other open (by orderDate desc), then resolved
  const filtered = useMemo(() => {
    const base = tasks.filter(t => {
      if (filter === 'open') return t.status === 'open';
      if (filter === 'urgent') return t.urgent && t.status === 'open';
      if (filter === 'followup') return t.followUp && t.status === 'open';
      if (filter === 'resolved') return t.status === 'resolved';
      return true;
    });
    return [...base].sort((a, b) => {
      // Urgent open always first
      const aUrgent = a.urgent && a.status === 'open' ? 2 : a.status === 'open' ? 1 : 0;
      const bUrgent = b.urgent && b.status === 'open' ? 2 : b.status === 'open' ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;
      // Within same group: sort by orderDate descending (newest first)
      return parseOrderDate(b.orderDate) - parseOrderDate(a.orderDate);
    });
  }, [tasks, filter]);

  const counts = {
    all: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    urgent: tasks.filter(t => t.urgent && t.status === 'open').length,
    followup: tasks.filter(t => t.followUp && t.status === 'open').length,
    resolved: tasks.filter(t => t.status === 'resolved').length,
  };

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(task: PendingTask) {
    setEditingId(task.id);
    setForm({ name: task.customerName, link: task.customerLink, order: task.orderId, desc: task.description, tracking: task.trackingNumber, date: task.orderDate });
    setShowForm(true);
    // Scroll to form and highlight it
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlighted(true);
      setTimeout(() => setHighlighted(false), 1800);
    }, 60);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    if (editingId) {
      // Edit existing task
      const res = await fetch(`/api/pendings/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: form.name, customerLink: form.link, orderId: form.order, description: form.desc, trackingNumber: form.tracking, orderDate: form.date }),
      });
      const data = await res.json();
      if (data.task) setTasks(prev => prev.map(t => t.id === editingId ? data.task : t));
    } else {
      // Create new task
      const res = await fetch('/api/pendings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: form.name, customerLink: form.link, orderId: form.order, description: form.desc, trackingNumber: form.tracking, orderDate: form.date }),
      });
      const data = await res.json();
      if (data.task) setTasks(prev => [data.task, ...prev]);
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  }

  async function patch(id: string, updates: Partial<Pick<PendingTask, 'status' | 'urgent' | 'followUp'>>) {
    setUpdatingId(id);
    const res = await fetch(`/api/pendings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.task) setTasks(prev => prev.map(t => t.id === id ? data.task : t));
    setUpdatingId(null);
  }

  async function handleResolve(task: PendingTask) {
    const toResolve = task.status === 'open';
    // Confirm for non-admin/manager when resolving
    if (toResolve && !canManage) {
      if (!confirm('Are you sure you want to resolve this task?')) return;
    }
    await patch(task.id, { status: toResolve ? 'resolved' : 'open' });
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

  const fieldCls = "w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400";

  // Find where urgents end to insert a divider
  const urgentCount = filtered.filter(t => t.urgent && t.status === 'open').length;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Pendings</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
            <button onClick={() => showForm && !editingId ? setShowForm(false) : openCreate()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors">
              {showForm && !editingId ? 'Cancel' : '+ Add Task'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Form (create or edit) */}
          {showForm && (
            <div ref={formRef} className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-6 mb-6 transition-all duration-300 ${highlighted ? 'border-blue-400 ring-2 ring-blue-300 ring-offset-2 dark:ring-offset-slate-900' : 'border-slate-200 dark:border-slate-700'}`}>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">
                {editingId ? 'Edit Task' : 'New Pending Task'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Customer Name *</label>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. John Smith" required className={fieldCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Customer Link</label>
                    <input type="url" value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://whatnot.com/user/..." className={fieldCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Order ID</label>
                    <input type="text" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} placeholder="Optional" className={fieldCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Order Date</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={fieldCls} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">USPS Tracking Number</label>
                    <input type="text" value={form.tracking} onChange={e => setForm(f => ({ ...f, tracking: e.target.value }))} placeholder="Optional" className={fieldCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="Describe the issue..." rows={3} className={`${fieldCls} resize-none`} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                    className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Cancel</button>
                  <button type="submit" disabled={saving}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Task'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  filter === f.key
                    ? f.key === 'urgent' ? 'bg-red-500 border-red-500 text-white'
                    : f.key === 'followup' ? 'bg-amber-500 border-amber-500 text-white'
                    : f.key === 'resolved' ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Task list */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className="text-4xl mb-3">ðŸ“‹</div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No tasks found</p>
              <p className="text-slate-400 text-xs mt-1">{filter === 'open' ? 'All caught up!' : `No ${filter} tasks.`}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((task, idx) => {
                // Insert "Urgent" section header before first urgent task
                const showUrgentHeader = idx === 0 && task.urgent && task.status === 'open' && (filter === 'all' || filter === 'open');
                // Insert "Other Tasks" divider after urgent section
                const showOtherHeader = urgentCount > 0 && idx === urgentCount && (filter === 'all' || filter === 'open') && task.status === 'open';

                return (
                  <div key={task.id}>
                    {showUrgentHeader && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-black text-red-500 uppercase tracking-widest">ðŸ”´ Urgent Tasks</span>
                        <div className="flex-1 h-px bg-red-200 dark:bg-red-900" />
                      </div>
                    )}
                    {showOtherHeader && (
                      <div className="flex items-center gap-2 mb-2 mt-4">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Other Tasks</span>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      </div>
                    )}
                    <div className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm p-5 transition-all ${
                      task.urgent ? 'border-red-300 dark:border-red-700 border-l-4 border-l-red-500'
                      : task.followUp ? 'border-amber-300 dark:border-amber-700'
                      : 'border-slate-200 dark:border-slate-700'
                    }`}>
                      <div className="flex items-start justify-between gap-4">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${task.status === 'resolved' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}`}>
                              {task.status === 'resolved' ? 'âœ“ Resolved' : 'Open'}
                            </span>
                            {task.urgent && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">ðŸ”´ Urgent</span>}
                            {task.followUp && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">ðŸ”” Follow-Up</span>}
                          </div>

                          <div className="flex items-center gap-2 mb-1">
                            {task.customerLink
                              ? <a href={task.customerLink} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-900 dark:text-white text-sm hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2">{task.customerName}</a>
                              : <p className="font-bold text-slate-900 dark:text-white text-sm">{task.customerName}</p>}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 mb-2">
                            {task.orderId && <span>Order: <span className="font-semibold text-slate-600 dark:text-slate-300">{task.orderId}</span></span>}
                            {task.orderDate && <span>Order Date: <span className="font-semibold text-slate-600 dark:text-slate-300">{fmtDate(task.orderDate)}</span></span>}
                            {task.trackingNumber && (
                              <a href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${task.trackingNumber}`} target="_blank" rel="noopener noreferrer" className="hover:text-red-500 transition-colors">
                                Tracking: <span className="font-semibold text-slate-600 dark:text-slate-300 hover:text-red-500">{task.trackingNumber}</span>
                              </a>
                            )}
                          </div>

                          {task.description && <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">{task.description}</p>}
                          <p className="text-[10px] text-slate-400">Added by <span className="font-semibold capitalize">{task.createdBy}</span> ({task.createdByRole}) Â· {fmtDate(task.createdAt)}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => handleResolve(task)} disabled={updatingId === task.id}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${
                              task.status === 'open'
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                                : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                            }`}>
                            {task.status === 'open' ? 'âœ“ Resolve' : 'â†© Reopen'}
                          </button>

                          {/* Edit button - admin/manager only */}
                          {canManage && (
                            <button onClick={() => openEdit(task)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                              âœï¸ Edit
                            </button>
                          )}

                          {canManage && task.status === 'open' && (
                            <button onClick={() => patch(task.id, { urgent: !task.urgent })} disabled={updatingId === task.id}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${task.urgent ? 'bg-red-500 border-red-500 text-white hover:bg-red-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'}`}>
                              ðŸ”´ Urgent
                            </button>
                          )}

                          {canManage && task.status === 'open' && (
                            <button onClick={() => patch(task.id, { followUp: !task.followUp })} disabled={updatingId === task.id}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-50 ${task.followUp ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-amber-300 hover:text-amber-600'}`}>
                              ðŸ”” Follow-Up
                            </button>
                          )}

                          {canManage && (
                            <button onClick={() => handleDelete(task.id)} disabled={deletingId === task.id}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
