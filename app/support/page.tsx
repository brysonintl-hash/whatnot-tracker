'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type Email = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  unread: boolean;
};

function formatDate(raw: string) {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function parseOrderNumbers(subject: string): string[] {
  const nums: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\b\d{9,12}\b/g;
  while ((m = re.exec(subject)) !== null) nums.push(m[0]);
  return nums;
}

function EmailTypeTag({ subject }: { subject: string }) {
  const s = subject.toLowerCase();
  if (s.includes('missing')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">Missing Item</span>;
  if (s.includes('refund')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Refund</span>;
  if (s.includes('cancel')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">Cancellation</span>;
  if (s.includes('replacement') || s.includes('resend')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Replacement</span>;
  if (s.includes('claim') || s.includes('dispute')) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Claim</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Support</span>;
}

export default function SupportPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [loadingBody, setLoadingBody] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || !['admin', 'manager', 'host', 'shipper'].includes(s.role)) {
        router.push('/login');
        return;
      }
      setSession(s);
    });
  }, []);

  const loadEmails = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/support-emails');
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to load emails');
      }
      const data = await res.json();
      setEmails(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (session) loadEmails(); }, [session]);

  async function toggleEmail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (bodies[id]) return;
    setLoadingBody(id);
    try {
      const res = await fetch(`/api/support-emails/${id}`);
      const data = await res.json();
      setBodies(prev => ({ ...prev, [id]: data.body || '(no content)' }));
    } catch {
      setBodies(prev => ({ ...prev, [id]: '(failed to load)' }));
    } finally {
      setLoadingBody(null);
    }
  }

  const unreadCount = emails.filter(e => e.unread).length;

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center px-6 flex-shrink-0 gap-3">
          <div className="flex-1 flex items-center gap-3">
            <h1 className="text-lg font-black text-white">Whatnot Support</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                {unreadCount} new
              </span>
            )}
          </div>
          <button
            onClick={() => loadEmails(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64">
                <svg className="w-8 h-8 text-slate-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-slate-500 text-sm">Loading emails from Gmail...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
                <p className="text-red-600 dark:text-red-400 font-semibold mb-1">Could not load emails</p>
                <p className="text-red-500 text-sm">{error}</p>
                <button onClick={() => loadEmails()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                  Try again
                </button>
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="text-5xl mb-3">📬</div>
                <p className="text-slate-600 dark:text-slate-400 font-semibold">No support emails found</p>
                <p className="text-slate-400 text-sm mt-1">Emails from support@whatnot.zendesk.com will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-4">{emails.length} email{emails.length !== 1 ? 's' : ''} from Whatnot Support</p>
                {emails.map(email => {
                  const orders = parseOrderNumbers(email.subject);
                  const isExpanded = expandedId === email.id;
                  return (
                    <div
                      key={email.id}
                      className={`bg-white dark:bg-slate-800 rounded-xl border shadow-sm overflow-hidden transition-all ${
                        email.unread
                          ? 'border-blue-200 dark:border-blue-700'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Email row */}
                      <button
                        onClick={() => toggleEmail(email.id)}
                        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        {/* Unread dot */}
                        <div className="flex-shrink-0 mt-1.5">
                          {email.unread
                            ? <div className="w-2 h-2 rounded-full bg-blue-500" />
                            : <div className="w-2 h-2 rounded-full bg-transparent" />
                          }
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <EmailTypeTag subject={email.subject} />
                            {orders.map(o => (
                              <span key={o} className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                #{o}
                              </span>
                            ))}
                          </div>
                          <p className={`text-sm leading-snug truncate ${email.unread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-300'}`}>
                            {email.subject}
                          </p>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{email.snippet}</p>
                        </div>

                        {/* Date + chevron */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-2">
                          <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(email.date)}</span>
                          <svg
                            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-4">
                          <div className="text-xs text-slate-400 mb-3">
                            <span className="font-medium text-slate-600 dark:text-slate-300">From:</span> {email.from}
                            <span className="mx-2">·</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300">Date:</span> {new Date(email.date).toLocaleString()}
                          </div>
                          {loadingBody === email.id ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Loading message...
                            </div>
                          ) : (
                            <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 overflow-x-auto">
                              {bodies[email.id] ?? ''}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
