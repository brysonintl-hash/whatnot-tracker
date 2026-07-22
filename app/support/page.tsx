'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type TicketStatus = 'new' | 'open' | 'pending' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

type Thread = {
  id: string;
  subject: string;
  from: string;
  firstDate: string;
  lastDate: string;
  snippet: string;
  unread: boolean;
  messageCount: number;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  noteCount: number;
};

type Message = {
  id: string;
  messageId: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
  unread: boolean;
};

type InternalNote = { id: string; author: string; text: string; createdAt: string };

type TicketMeta = {
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  notes: InternalNote[];
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; dot: string }> = {
  new:      { label: 'New',      color: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-100 dark:bg-blue-900/40',    dot: 'bg-blue-500' },
  open:     { label: 'Open',     color: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-100 dark:bg-amber-900/40',  dot: 'bg-amber-500' },
  pending:  { label: 'Pending',  color: 'text-purple-700 dark:text-purple-300',bg: 'bg-purple-100 dark:bg-purple-900/40',dot: 'bg-purple-500' },
  resolved: { label: 'Resolved', color: 'text-emerald-700 dark:text-emerald-300',bg:'bg-emerald-100 dark:bg-emerald-900/40',dot:'bg-emerald-500' },
  closed:   { label: 'Closed',   color: 'text-slate-500 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-700',     dot: 'bg-slate-400' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'text-slate-500' },
  normal: { label: 'Normal', color: 'text-slate-600 dark:text-slate-400' },
  high:   { label: 'High',   color: 'text-orange-600 dark:text-orange-400' },
  urgent: { label: 'Urgent', color: 'text-red-600 dark:text-red-400' },
};

function formatDate(raw: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseOrders(subject: string): string[] {
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

const STATUS_ORDER: TicketStatus[] = ['new', 'open', 'pending', 'resolved', 'closed'];
const PRIORITY_ORDER: TicketPriority[] = ['urgent', 'high', 'normal', 'low'];
const FILTER_TABS = ['all', 'new', 'open', 'pending', 'resolved', 'closed'] as const;

export default function SupportPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<typeof FILTER_TABS[number]>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Detail state
  const [messages, setMessages] = useState<Message[]>([]);
  const [ticket, setTicket] = useState<TicketMeta | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || !['admin', 'manager', 'host', 'shipper'].includes(s.role)) {
        router.push('/login');
        return;
      }
      setSession(s);
    });
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

  useEffect(() => { if (session) loadThreads(); }, [session]);

  const openThread = useCallback(async (id: string) => {
    setSelectedId(id);
    setMessages([]);
    setTicket(null);
    setReplyText('');
    setSendError('');
    setReplySuccess(false);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/support-emails/${id}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setTicket(data.ticket ?? { status: 'new', priority: 'normal', assignedTo: null, notes: [] });
      // Auto-open to 'open' status when first viewed
      if (!data.ticket || data.ticket.status === 'new') {
        await fetch(`/api/support-emails/${id}/ticket`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'open' }),
        });
        setTicket(prev => prev ? { ...prev, status: 'open' } : prev);
        setThreads(prev => prev.map(t => t.id === id ? { ...t, status: 'open' } : t));
      }
    } catch { setMessages([]); }
    finally { setLoadingDetail(false); }
    setTimeout(() => detailRef.current?.scrollTo({ top: 0 }), 50);
  }, []);

  const sendReply = useCallback(async () => {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Send failed'); }
      setReplyText('');
      setReplySuccess(true);
      setTicket(prev => prev ? { ...prev, status: 'pending' } : prev);
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, status: 'pending' } : t));
      setTimeout(() => setReplySuccess(false), 4000);
      // Reload thread after short delay to show sent message
      setTimeout(() => openThread(selectedId), 2000);
    } catch (e: any) { setSendError(e.message); }
    finally { setSending(false); }
  }, [selectedId, replyText, openThread]);

  const updateTicketField = useCallback(async (patch: Partial<Pick<TicketMeta, 'status' | 'priority' | 'assignedTo'>>) => {
    if (!selectedId) return;
    setUpdatingTicket(true);
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/ticket`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const updated = await res.json();
      setTicket(updated);
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, ...patch } : t));
    } finally { setUpdatingTicket(false); }
  }, [selectedId]);

  const addNote = useCallback(async () => {
    if (!selectedId || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/support-emails/${selectedId}/ticket`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText }),
      });
      const updated = await res.json();
      setTicket(updated);
      setNoteText('');
      setThreads(prev => prev.map(t => t.id === selectedId ? { ...t, noteCount: updated.notes.length } : t));
    } finally { setSavingNote(false); }
  }, [selectedId, noteText]);

  const filtered = threads.filter(t => filter === 'all' || t.status === filter);
  const counts = {
    all: threads.length,
    new: threads.filter(t => t.status === 'new').length,
    open: threads.filter(t => t.status === 'open').length,
    pending: threads.filter(t => t.status === 'pending').length,
    resolved: threads.filter(t => t.status === 'resolved').length,
    closed: threads.filter(t => t.status === 'closed').length,
  };
  const selectedThread = threads.find(t => t.id === selectedId);

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 flex-shrink-0 gap-4">
          <h1 className="text-lg font-black text-white">Support Inbox</h1>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {counts.new > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">{counts.new} new</span>}
            {counts.open > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white font-bold">{counts.open} open</span>}
          </div>
          <div className="flex-1" />
          <button onClick={() => loadThreads(true)} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </header>

        {/* Body: list + detail */}
        <div className="flex-1 flex overflow-hidden">

          {/* LEFT: Ticket list */}
          <div className={`flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${selectedId ? 'hidden lg:flex lg:w-96 xl:w-[420px]' : 'flex-1'} flex-shrink-0`}>

            {/* Filter tabs */}
            <div className="flex gap-1 px-3 pt-3 pb-2 flex-wrap flex-shrink-0">
              {FILTER_TABS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-colors ${filter === f ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  {f} {counts[f] > 0 && <span className="ml-1 opacity-70">{counts[f]}</span>}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48">
                  <svg className="w-6 h-6 text-slate-400 animate-spin mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-slate-400 text-sm">Loading from Gmail...</p>
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <p className="text-red-500 text-sm font-medium">{error}</p>
                  <button onClick={() => loadThreads()} className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm">Retry</button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <div className="text-3xl mb-2">📭</div>
                  <p className="text-slate-500 text-sm">{filter === 'all' ? 'No support emails' : `No ${filter} tickets`}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(thread => {
                    const sc = STATUS_CONFIG[thread.status];
                    const pc = PRIORITY_CONFIG[thread.priority];
                    const isSelected = selectedId === thread.id;
                    const orders = parseOrders(thread.subject);
                    return (
                      <button key={thread.id} onClick={() => openThread(thread.id)}
                        className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isSelected ? 'bg-amber-50 dark:bg-amber-900/10 border-l-2 border-amber-500' : ''}`}>
                        {/* Status dot */}
                        <div className="flex-shrink-0 mt-1.5">
                          <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <TypeTag subject={thread.subject} />
                            {thread.priority === 'urgent' && <span className="text-[9px] font-black text-red-600 uppercase">URGENT</span>}
                            {thread.priority === 'high' && <span className="text-[9px] font-black text-orange-600 uppercase">HIGH</span>}
                          </div>
                          <p className={`text-sm leading-snug line-clamp-1 ${thread.unread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>
                            {thread.subject}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{thread.snippet}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sc.bg} ${sc.color}`}>{sc.label}</span>
                            {thread.assignedTo && <span className="text-[10px] text-slate-400">→ {thread.assignedTo}</span>}
                            {thread.messageCount > 1 && <span className="text-[10px] text-slate-400">{thread.messageCount} msgs</span>}
                            {thread.noteCount > 0 && <span className="text-[10px] text-slate-400">📝 {thread.noteCount}</span>}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDate(thread.lastDate)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Ticket detail */}
          {selectedId ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Detail header */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <div className="flex items-start gap-3">
                  <button onClick={() => setSelectedId(null)} className="lg:hidden flex-shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-black text-slate-900 dark:text-white leading-tight line-clamp-2">{selectedThread?.subject}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selectedThread && <TypeTag subject={selectedThread.subject} />}
                      {parseOrders(selectedThread?.subject ?? '').map(o => (
                        <span key={o} className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">#{o}</span>
                      ))}
                    </div>
                  </div>
                  {/* Quick controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ticket && (
                      <>
                        <select value={ticket.status} onChange={e => updateTicketField({ status: e.target.value as any })} disabled={updatingTicket}
                          className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">
                          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                        </select>
                        <select value={ticket.priority} onChange={e => updateTicketField({ priority: e.target.value as any })} disabled={updatingTicket}
                          className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer">
                          {PRIORITY_ORDER.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrollable detail body */}
              <div ref={detailRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingDetail ? (
                  <div className="flex justify-center py-12">
                    <svg className="w-6 h-6 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                ) : (
                  <>
                    {/* Messages thread */}
                    {messages.map((msg, idx) => {
                      const isOutbound = msg.from.toLowerCase().includes('brysonintl') || msg.from.toLowerCase().includes('stackbargains');
                      return (
                        <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-2xl w-full rounded-xl border shadow-sm overflow-hidden ${isOutbound ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                              <div>
                                <p className={`text-xs font-bold ${isOutbound ? 'text-amber-800 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {isOutbound ? 'You (Stack Bargains)' : msg.from}
                                </p>
                                {idx === 0 && <p className="text-[10px] text-slate-400 mt-0.5">To: {msg.to}</p>}
                              </div>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">{formatDate(msg.date)}</span>
                            </div>
                            <pre className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                              {msg.body || '(no content)'}
                            </pre>
                          </div>
                        </div>
                      );
                    })}

                    {/* Reply compose */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Reply to Whatnot Support</span>
                      </div>
                      <div className="p-4">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Type your reply to Whatnot Support..."
                          rows={5}
                          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                        {sendError && <p className="text-red-500 text-xs mt-2">{sendError}</p>}
                        {replySuccess && (
                          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mt-2">
                            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">Reply sent!</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-[10px] text-slate-400">Sends from brysonintl@gmail.com</span>
                          <button onClick={sendReply} disabled={sending || !replyText.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-black text-sm rounded-lg transition-colors">
                            {sending ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            )}
                            {sending ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Internal notes */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-yellow-200 dark:border-yellow-800 flex items-center gap-2">
                        <span className="text-sm">📝</span>
                        <span className="text-xs font-black text-yellow-800 dark:text-yellow-300">Internal Notes</span>
                        <span className="text-[10px] text-yellow-600 dark:text-yellow-500">(not sent to customer)</span>
                      </div>
                      <div className="p-4 space-y-3">
                        {ticket?.notes?.length ? (
                          ticket.notes.map(note => (
                            <div key={note.id} className="bg-white dark:bg-slate-800 rounded-lg border border-yellow-200 dark:border-yellow-800 px-3 py-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{note.author}</span>
                                <span className="text-[10px] text-slate-400">{formatDate(note.createdAt)}</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{note.text}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-yellow-700 dark:text-yellow-500 text-center py-2">No notes yet</p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <textarea
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            placeholder="Add an internal note..."
                            rows={2}
                            className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                          />
                          <button onClick={addNote} disabled={savingNote || !noteText.trim()}
                            className="px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition-colors self-end">
                            {savingNote ? '...' : 'Add'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Ticket sidebar info (assignee) */}
                    {ticket && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                        <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-3">Ticket Details</h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Assigned to</span>
                            <input
                              type="text"
                              value={ticket.assignedTo ?? ''}
                              onChange={e => setTicket(prev => prev ? { ...prev, assignedTo: e.target.value || null } : prev)}
                              onBlur={e => updateTicketField({ assignedTo: e.target.value || null })}
                              placeholder="Unassigned"
                              className="text-xs font-medium text-right bg-transparent border-0 border-b border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-amber-500 w-32"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Status</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_CONFIG[ticket.status].bg} ${STATUS_CONFIG[ticket.status].color}`}>
                              {STATUS_CONFIG[ticket.status].label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Priority</span>
                            <span className={`text-xs font-bold ${PRIORITY_CONFIG[ticket.priority].color}`}>
                              {PRIORITY_CONFIG[ticket.priority].label}
                            </span>
                          </div>
                        </div>
                        {(ticket.status !== 'resolved' && ticket.status !== 'closed') && (
                          <button onClick={() => updateTicketField({ status: 'resolved' })} disabled={updatingTicket}
                            className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-xs rounded-lg transition-colors">
                            Mark Resolved
                          </button>
                        )}
                        {ticket.status === 'resolved' && (
                          <button onClick={() => updateTicketField({ status: 'closed' })} disabled={updatingTicket}
                            className="mt-4 w-full py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-40 text-white font-black text-xs rounded-lg transition-colors">
                            Close Ticket
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Empty state when nothing selected */
            <div className="hidden lg:flex flex-1 items-center justify-center text-center">
              <div>
                <div className="text-5xl mb-3">📨</div>
                <p className="text-slate-500 dark:text-slate-400 font-semibold">Select a ticket to view</p>
                <p className="text-slate-400 text-sm mt-1">Click any support email on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
