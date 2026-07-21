'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type TrackEvent = { event: string; date: string; time: string; city: string; state: string };
type TrackResult = {
  trackingNumber: string;
  configured: boolean;
  error?: string;
  latest?: TrackEvent;
  events?: TrackEvent[];
  loading?: boolean;
};

function statusColor(event: string) {
  const e = event.toUpperCase();
  if (e.includes('DELIVERED')) return { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-700' };
  if (e.includes('OUT FOR DELIVERY')) return { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-700' };
  if (e.includes('IN TRANSIT') || e.includes('DEPARTED') || e.includes('ARRIVED')) return { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-700' };
  if (e.includes('ACCEPTED') || e.includes('PICKED UP') || e.includes('USPS IN POSSESSION')) return { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-700' };
  return { bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-600' };
}

export default function TrackingPage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<TrackResult[]>([]);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingNumbers, setPendingNumbers] = useState<string[]>([]);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    // Pull tracking numbers from pendings
    fetch('/api/pendings').then(r => r.json()).then((tasks: { trackingNumber?: string }[]) => {
      if (!Array.isArray(tasks)) return;
      const nums = Array.from(new Set(
        tasks.map(t => (t.trackingNumber || '').trim()).filter(n => n.length > 0)
      ));
      setPendingNumbers(nums);
    }).catch(() => {});
  }, []);

  async function trackNumber(tn: string) {
    const num = tn.trim().replace(/\s/g, '').toUpperCase();
    if (!num) return;
    // Check if already tracking
    if (results.find(r => r.trackingNumber === num)) return;

    setResults(prev => [{ trackingNumber: num, configured: true, loading: true }, ...prev]);
    try {
      const res = await fetch(`/api/tracking/${encodeURIComponent(num)}`);
      const data = await res.json();
      setResults(prev => prev.map(r => r.trackingNumber === num ? { ...data, trackingNumber: num, loading: false } : r));
    } catch {
      setResults(prev => prev.map(r => r.trackingNumber === num ? { trackingNumber: num, configured: true, error: 'Failed to fetch', loading: false } : r));
    }
  }

  async function trackAll() {
    for (const n of pendingNumbers) await trackNumber(n);
  }

  function toggleExpand(tn: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(tn)) next.delete(tn); else next.add(tn);
      return next;
    });
  }

  function removeResult(tn: string) {
    setResults(prev => prev.filter(r => r.trackingNumber !== tn));
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
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">USPS Tracking</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-3xl">
          {/* Search bar */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 mb-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Track a Shipment</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { trackNumber(input); setInput(''); } }}
                placeholder="Enter USPS tracking number..."
                className="flex-1 text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={() => { trackNumber(input); setInput(''); }}
                disabled={!input.trim()}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
              >
                Track
              </button>
            </div>

            {/* Pending tracking numbers from Pendings tab */}
            {pendingNumbers.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    From Pendings ({pendingNumbers.length})
                  </p>
                  <button onClick={trackAll} className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors">
                    Track All
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pendingNumbers.map(n => (
                    <button
                      key={n}
                      onClick={() => trackNumber(n)}
                      className="text-xs font-mono px-2.5 py-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-600 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              {results.map(r => {
                const color = r.latest?.event ? statusColor(r.latest.event) : statusColor('');
                const isExpanded = expanded.has(r.trackingNumber);
                return (
                  <div key={r.trackingNumber} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 flex items-start gap-3">
                      {/* Status icon */}
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${r.loading ? 'bg-slate-300 animate-pulse' : r.error ? 'bg-red-500' : r.latest?.event?.toUpperCase().includes('DELIVERED') ? 'bg-emerald-500' : 'bg-amber-400'}`} />

                      <div className="flex-1 min-w-0">
                        {/* Tracking number */}
                        <p className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 select-all">{r.trackingNumber}</p>

                        {r.loading && <p className="text-sm text-slate-400">Fetching status...</p>}

                        {r.error && !r.loading && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.configured && <p className="text-sm text-red-500 font-semibold">{r.error}</p>}
                            <a
                              href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${r.trackingNumber}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              Track on USPS ↗
                            </a>
                          </div>
                        )}

                        {!r.loading && !r.error && r.latest && (
                          <>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
                                {r.latest.event || 'Unknown Status'}
                              </span>
                              <span className="text-xs text-slate-400">
                                {[r.latest.date, r.latest.time].filter(Boolean).join(' · ')}
                              </span>
                            </div>
                            {(r.latest.city || r.latest.state) && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {[r.latest.city, r.latest.state].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!r.loading && !r.error && r.events && r.events.length > 0 && (
                          <button
                            onClick={() => toggleExpand(r.trackingNumber)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                          >
                            {isExpanded ? 'Hide' : `History (${r.events.length})`}
                          </button>
                        )}
                        <a
                          href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${r.trackingNumber}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          USPS ↗
                        </a>
                        <button onClick={() => removeResult(r.trackingNumber)} className="text-xs text-slate-300 dark:text-slate-600 hover:text-red-400 transition-colors">âœ•</button>
                      </div>
                    </div>

                    {/* Expanded event history */}
                    {isExpanded && r.events && r.events.length > 0 && (
                      <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-2 bg-slate-50 dark:bg-slate-900/40">
                        {r.events.map((ev, i) => (
                          <div key={i} className="flex items-start gap-3 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{ev.event}</span>
                              <span className="text-slate-400 ml-2">{[ev.date, ev.time].filter(Boolean).join(' · ')}</span>
                              {(ev.city || ev.state) && (
                                <span className="text-slate-400 ml-2">{[ev.city, ev.state].filter(Boolean).join(', ')}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {results.length === 0 && pendingNumbers.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <svg className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No tracking numbers yet</p>
              <p className="text-slate-400 text-xs mt-1">Enter a USPS tracking number above or add tracking numbers to Pendings tasks</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
