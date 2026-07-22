'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type TicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type Thread = {
  id: string; subject: string; from: string; firstDate: string; lastDate: string;
  snippet: string; unread: boolean; messageCount: number;
  status: TicketStatus; priority: TicketPriority; assignedTo: string | null; noteCount: number;
};
type Message = { id: string; messageId: string; from: string; to: string; date: string; subject: string; body: string; unread: boolean; };
type InternalNote = { id: string; author: string; text: string; createdAt: string; };
type TicketMeta = { status: TicketStatus; priority: TicketPriority; assignedTo: string | null; notes: InternalNote[]; };

const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string; dot: string }> = {
  new:      { label: 'New',      dot: 'bg-blue-500',    color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  open:     { label: 'Open',     dot: 'bg-amber-500',   color: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-100 dark:bg-amber-900/40' },
  pending:  { label: 'Pending',  dot: 'bg-purple-500',  color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  resolved: { label: 'Resolved', dot: 'bg-emerald-500', color: 'text-emerald-700 dark:text-emerald-300',bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  closed:   { label: 'Closed',   dot: 'bg-slate-400',   color: 'text-slate-500',                       bg: 'bg-slate-100 dark:bg-slate-700' },
};
const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-slate-400' },
  normal: { label: 'Normal', color: 'text-slate-500 dark:text-slate-400' },
  high:   { label: 'High',   color: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-600 dark:text-red-400' },
};

function fmtDate(raw: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(from: string) {
  const name = from.replace(/<[^>]+>/, '').replace(/[()]/g, '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-cyan-500','bg-orange-500'];
function avatarColor(from: string) {
  let h = 0;
  for (let i = 0; i < from.length; i++) h = from.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function parseOrders(subject: string) {
  const nums: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\b\d{9,12}\b/g;
  while ((m = re.exec(subject)) !== null) nums.push(m[0]);
  return nums;
}

function TypeTag({ subject }: { subject: string }) {
  const s = subject.toLowerCase();
  if (s.includes('missing'))     return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Missing Item</span>;
  if (s.includes('refund'))      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Refund</span>;
  if (s.includes('cancel'))      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Cancellation</span>;
  if (s.includes('replacement') || s.includes('resend')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Replacement</span>;
  if (s.includes('claim') || s.includes('dispute'))      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Claim</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Support</span>;
}

const FILTERS = ['all','new','open','pending','resolved','closed'] as const;
const STATUS_ORDER: TicketStatus[] = ['new','open','pending','resolved','closed'];
const PRIORITY_ORDER: TicketPriority[] = ['urgent','high','normal','low'];

export default function SupportPage() {
  const router = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [threads, setThreads]       = useState<Thread[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');
  const [filter, setFilter]         = useState<typeof FILTERS[number]>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Detail
  const [messages, setMessages]     = useState<Message[]>([]);
  const [ticket, setTicket]         = useState<TicketMeta | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyTab, setReplyTab]     = useState<'reply'|'note'>('reply');
  const [replyText, setReplyText]   = useState('');
  const [sending, setSending]       = useState(false);
  const [sendErr, setSendErr]       = useState('');
  const [sendOk, setSendOk]         = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [updating, setUpdating]     = useState(false);
  // Filter settings
  const [filterEmails, setFilterEmails] = useState<string[]>([]);
  const [showFilters, setShowFilters]   = useState(false);
  const [newEmail, setNewEmail]         = useState('');
  const [addingEmail, setAddingEmail]   = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const canEditFilters = session?.role === 'admin' || session?.role === 'manager';

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || !['admin','manager','host','shipper'].includes(s.role)) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  const loadFilters = useCallback(async () => {
    const res = await fetch('/api/support-emails/filters');
    if (res.ok) setFilterEmails(await res.json());
  }, []);

  const loadThreads = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/support-emails');
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setThreads(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { if (session) { loadThreads(); loadFilters(); } }, [session]);

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id); setMessages([]); setTicket(null);
    setReplyText(''); setSendErr(''); setSendOk(false); setReplyTab('reply');
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/support-emails/${id}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setTicket(data.ticket ?? { status: 'new', priority: 'normal', assignedTo: null, notes: [] });
      if (!data.ticket || data.ticket.status === 'new') {
        await fetch(`/api/support-emails/${id}/ticket`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) });
        setTicket(prev => prev ? { ...prev, status: 'open' } : prev);
        setThreads(prev => prev.map(t => t.id === id ? { ...t, status: 'open' } : t));
      }
    } catch { setMessages([]); }
    finally { setLoadingDetail(false); }
    setTimeout(() => detailRef.current?.scrollTo({ top: 0 }), 50);
  }, []);

  const sendReply = useCallback(async () => {
    if (!selectedId || !replyText.trim()) return;
    setSending(true); setSendErr('');
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Send failed'); }
      setReplyText(''); setSendOk(true);
      setTicket(prev => prev ? { ...prev, status: 'pending' } : prev);
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, status: 'pending' } : t));
      setTimeout(() => { setSendOk(false); openThread(selectedId); }, 2500);
    } catch (e: any) { setSendErr(e.message); }
    finally { setSending(false); }
  }, [selectedId, replyText, openThread]);

  const addNote = useCallback(async () => {
    if (!selectedId || !replyText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/ticket`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: replyText }),
      });
      const updated = await res.json();
      setTicket(updated); setReplyText('');
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, noteCount: updated.notes.length } : t));
    } finally { setSavingNote(false); }
  }, [selectedId, replyText]);

  const updateField = useCallback(async (patch: Partial<Pick<TicketMeta, 'status'|'priority'|'assignedTo'>>) => {
    if (!selectedId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/ticket`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const updated = await res.json();
      setTicket(updated);
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, ...patch } : t));
    } finally { setUpdating(false); }
  }, [selectedId]);

  const addEmail = useCallback(async () => {
    if (!newEmail.includes('@')) return;
    setAddingEmail(true);
    try {
      const res = await fetch('/api/support-emails/filters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail }),
      });
      if (res.ok) { setFilterEmails(await res.json()); setNewEmail(''); }
    } finally { setAddingEmail(false); }
  }, [newEmail]);

  const removeEmail = useCallback(async (email: string) => {
    const res = await fetch('/api/support-emails/filters', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    if (res.ok) setFilterEmails(await res.json());
  }, []);

  const filtered = threads.filter(t => filter === 'all' || t.status === filter);
  const counts = Object.fromEntries(FILTERS.map(f => [f, f === 'all' ? threads.length : threads.filter(t => t.status === f).length])) as Record<typeof FILTERS[number], number>;
  const selThread = threads.find(t => t.id === selectedId);

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 flex-shrink-0 gap-3">
          <h1 className="text-lg font-black text-white">Gmail Support Inbox</h1>
          <div className="flex gap-2">
            {(counts.new > 0) && <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold">{counts.new} new</span>}
            {(counts.open > 0) && <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-xs font-bold">{counts.open} open</span>}
          </div>
          <div className="flex-1" />
          {canEditFilters && (
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-amber-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Inboxes
            </button>
          )}
          <button onClick={() => loadThreads(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </header>

        {/* Inbox filter settings panel */}
        {showFilters && canEditFilters && (
          <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4 flex-wrap flex-shrink-0">
            <span className="text-xs font-bold text-slate-400">Monitored Inboxes:</span>
            {filterEmails.map(email => (
              <span key={email} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 rounded-lg text-xs text-slate-200 font-medium">
                {email}
                <button onClick={() => removeEmail(email)} className="text-slate-400 hover:text-red-400 transition-colors ml-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEmail()}
                placeholder="add@email.com"
                className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-48"
              />
              <button onClick={addEmail} disabled={addingEmail || !newEmail.includes('@')}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition-colors">
                + Add
              </button>
            </div>
            <span className="text-[10px] text-slate-500">Refresh after adding to load new emails</span>
          </div>
        )}

        {/* Main body */}
        <div className="flex-1 flex overflow-hidden">

          {/* LEFT: ticket list */}
          <div className={`flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${selectedId ? 'hidden lg:flex lg:w-80 xl:w-96' : 'flex-1'} flex-shrink-0`}>
            {/* Tabs */}
            <div className="flex gap-1 p-2 flex-shrink-0 border-b border-slate-100 dark:border-slate-800 flex-wrap">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${filter === f ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {f}{counts[f] > 0 ? ` ${counts[f]}` : ''}
                </button>
              ))}
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <svg className="w-6 h-6 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  <p className="text-slate-400 text-xs">Loading from Gmail...</p>
                </div>
              ) : error ? (
                <div className="p-4 text-center"><p className="text-red-500 text-sm">{error}</p><button onClick={() => loadThreads()} className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs">Retry</button></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48"><div className="text-3xl mb-2">📭</div><p className="text-slate-400 text-sm">{filter === 'all' ? 'No emails' : `No ${filter} tickets`}</p></div>
              ) : filtered.map(thread => {
                const sc = STATUS_CFG[thread.status];
                const isSelected = selectedId === thread.id;
                return (
                  <button key={thread.id} onClick={() => openThread(thread.id)}
                    className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isSelected ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-l-amber-500' : ''}`}>
                    <div className="flex-shrink-0 mt-1"><div className={`w-2 h-2 rounded-full ${sc.dot}`} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex gap-1.5 mb-0.5 flex-wrap items-center">
                        <TypeTag subject={thread.subject} />
                        {thread.priority === 'urgent' && <span className="text-[9px] font-black text-red-500 uppercase tracking-wide">URGENT</span>}
                      </div>
                      <p className={`text-sm leading-snug line-clamp-1 ${thread.unread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>{thread.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{thread.snippet}</p>
                      <div className="flex gap-2 mt-1 items-center">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sc.bg} ${sc.color}`}>{sc.label}</span>
                        {thread.assignedTo && <span className="text-[10px] text-slate-400">→ {thread.assignedTo}</span>}
                        {thread.messageCount > 1 && <span className="text-[10px] text-slate-400">{thread.messageCount} msgs</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 whitespace-nowrap">{fmtDate(thread.lastDate)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: detail */}
          {selectedId ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
              {/* Detail header */}
              <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-start gap-3">
                  <button onClick={() => setSelectedId(null)} className="lg:hidden p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white line-clamp-1">{selThread?.subject}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {selThread && <TypeTag subject={selThread.subject} />}
                      {parseOrders(selThread?.subject ?? '').map(o => (
                        <span key={o} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">#{o}</span>
                      ))}
                    </div>
                  </div>
                  {ticket && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select value={ticket.status} onChange={e => updateField({ status: e.target.value as TicketStatus })} disabled={updating}
                        className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                      </select>
                      <select value={ticket.priority} onChange={e => updateField({ priority: e.target.value as TicketPriority })} disabled={updating}
                        className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">
                        {PRIORITY_ORDER.map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
                      </select>
                      {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                        <button onClick={() => updateField({ status: 'resolved' })} disabled={updating}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition-colors">
                          Resolve
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable thread */}
              <div ref={detailRef} className="flex-1 overflow-y-auto px-6 py-4">
                {loadingDetail ? (
                  <div className="flex justify-center py-12"><svg className="w-6 h-6 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div>
                ) : (
                  <div className="space-y-0">
                    {/* Messages */}
                    {messages.map((msg, idx) => {
                      const isOutbound = msg.from.toLowerCase().includes('brysonintl') || msg.from.toLowerCase().includes('stackbargains');
                      const initials = getInitials(msg.from);
                      const color = isOutbound ? 'bg-amber-500' : avatarColor(msg.from);
                      return (
                        <div key={msg.id}>
                          <div className="flex gap-3 py-4">
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white font-black text-sm flex-shrink-0 mt-0.5`}>
                              {initials}
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                  {isOutbound ? 'You (Stack Bargains)' : msg.from.replace(/<[^>]+>/, '').replace(/[()]/g, '').trim()}
                                </span>
                                <span className="text-xs text-slate-400">{fmtDate(msg.date)}</span>
                              </div>
                              <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                                {msg.body || <span className="italic text-slate-400">No content</span>}
                              </div>
                            </div>
                          </div>
                          {idx < messages.length - 1 && <div className="border-t border-slate-100 dark:border-slate-800 ml-12" />}
                        </div>
                      );
                    })}

                    {/* Internal notes as timeline */}
                    {ticket?.notes?.length ? ticket.notes.map((note, idx) => (
                      <div key={note.id}>
                        <div className="border-t border-slate-100 dark:border-slate-800 ml-12" />
                        <div className="flex gap-3 py-4">
                          <div className="w-9 h-9 rounded-full bg-yellow-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0 mt-0.5">
                            {note.author[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="text-sm font-black text-slate-900 dark:text-white">{note.author}</span>
                              <span className="text-xs text-slate-400">{fmtDate(note.createdAt)}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">Internal Note</span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{note.text}</p>
                          </div>
                        </div>
                      </div>
                    )) : null}
                  </div>
                )}
              </div>

              {/* Reply / note compose */}
              <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-700">
                  <button onClick={() => setReplyTab('reply')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${replyTab === 'reply' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    Public Reply
                  </button>
                  <button onClick={() => setReplyTab('note')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${replyTab === 'note' ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Internal Note
                  </button>
                </div>
                <div className="p-4">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={replyTab === 'reply' ? 'Type your reply to Whatnot Support...' : 'Add an internal note (not sent to customer)...'}
                    rows={4}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:border-transparent bg-slate-50 dark:bg-slate-900 ${replyTab === 'note' ? 'border-yellow-200 dark:border-yellow-800 focus:ring-yellow-400' : 'border-slate-200 dark:border-slate-600 focus:ring-amber-500'}`}
                  />
                  {sendErr && <p className="text-red-500 text-xs mt-1.5">{sendErr}</p>}
                  {sendOk && (
                    <div className="flex items-center gap-2 mt-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                      Reply sent!
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {replyTab === 'note'
                      ? <span className="text-[10px] text-yellow-600 dark:text-yellow-500">Internal only — not sent to customer</span>
                      : <span />
                    }
                    <button
                      onClick={replyTab === 'reply' ? sendReply : addNote}
                      disabled={(replyTab === 'reply' ? sending : savingNote) || !replyText.trim()}
                      className={`flex items-center gap-2 px-4 py-2 font-black text-sm rounded-lg transition-colors disabled:opacity-40 text-white ${replyTab === 'reply' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                      {(replyTab === 'reply' ? sending : savingNote) ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : replyTab === 'reply' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                      )}
                      {replyTab === 'reply' ? (sending ? 'Sending...' : 'Send Reply') : (savingNote ? 'Saving...' : 'Add Note')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center text-center bg-white dark:bg-slate-900">
              <div><div className="text-5xl mb-3">📨</div><p className="text-slate-500 font-semibold">Select a ticket to view</p><p className="text-slate-400 text-sm mt-1">Click any email on the left</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
