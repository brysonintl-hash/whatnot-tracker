'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type Opportunity = { label: string; color: string; score: number };

type AsinResult = {
  asin: string;
  title: string;
  brand: string;
  image: string;
  price: number | null;
  currency: string;
  rating: number | null;
  reviews: number | null;
  bsr: number | null;
  bsrCategory: string | null;
  category: string;
  bullets: string[];
  url: string;
  opportunity: Opportunity;
  error?: string;
  loading?: boolean;
};

const OPPORTUNITY_STYLES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Hot:    { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-700', badge: 'bg-emerald-500' },
  Good:   { bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-700',       badge: 'bg-blue-500' },
  Okay:   { bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-400',     border: 'border-amber-200 dark:border-amber-700',     badge: 'bg-amber-500' },
  Risky:  { bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400',         border: 'border-red-200 dark:border-red-700',         badge: 'bg-red-500' },
  'No BSR': { bg: 'bg-slate-50 dark:bg-slate-700',      text: 'text-slate-600 dark:text-slate-300',     border: 'border-slate-200 dark:border-slate-600',     badge: 'bg-slate-400' },
};

export default function AmazonPage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const [results, setResults] = useState<AsinResult[]>([]);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  async function analyze(raw: string) {
    const asin = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!asin || results.find(r => r.asin === asin)) return;
    setInput('');
    setResults(prev => [{ asin, title: '', brand: '', image: '', price: null, currency: 'USD', rating: null, reviews: null, bsr: null, bsrCategory: null, category: '', bullets: [], url: '', opportunity: { label: '', color: 'slate', score: 0 }, loading: true }, ...prev]);
    try {
      const res = await fetch(`/api/amazon?asin=${asin}`);
      const data = await res.json();
      setResults(prev => prev.map(r => r.asin === asin ? { ...data, loading: false } : r));
    } catch {
      setResults(prev => prev.map(r => r.asin === asin ? { ...r, error: 'Failed to fetch', loading: false } : r));
    }
  }

  function remove(asin: string) {
    setResults(prev => prev.filter(r => r.asin !== asin));
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
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between pl-14 pr-4 sm:pl-6 sm:pr-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Amazon Analyzer</h1>
            <p className="text-xs text-slate-400 hidden sm:block">{today}</p>
          </div>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Search */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 mb-6 max-w-2xl">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">ASIN Opportunity Analyzer</h2>
            <p className="text-xs text-slate-400 mb-3">Enter an Amazon ASIN to check BSR, price, reviews and get a selling opportunity score.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') analyze(input); }}
                placeholder="e.g. B08N5WRWNW"
                className="flex-1 text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
              />
              <button
                onClick={() => analyze(input)}
                disabled={!input.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
              >
                Analyze
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4 max-w-4xl">
            {results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <svg className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No ASINs analyzed yet</p>
                <p className="text-slate-400 text-xs mt-1">Enter an ASIN above to check its selling potential</p>
              </div>
            )}

            {results.map(r => {
              const opp = OPPORTUNITY_STYLES[r.opportunity?.label] ?? OPPORTUNITY_STYLES['No BSR'];
              return (
                <div key={r.asin} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                  {r.loading ? (
                    <div className="p-6 flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      <div>
                        <p className="text-xs font-mono text-slate-400">{r.asin}</p>
                        <p className="text-sm text-slate-500">Fetching from Amazon...</p>
                      </div>
                    </div>
                  ) : r.error ? (
                    <div className="p-6 flex items-start justify-between">
                      <div>
                        <p className="text-xs font-mono text-slate-400 mb-1">{r.asin}</p>
                        <p className="text-sm text-red-500 font-semibold">{r.error}</p>
                      </div>
                      <button onClick={() => remove(r.asin)} className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none">✕</button>
                    </div>
                  ) : (
                    <div className="p-5">
                      <div className="flex gap-4">
                        {/* Product image */}
                        {r.image && (
                          <img src={r.image} alt={r.title} className="w-20 h-20 object-contain rounded-lg border border-slate-100 dark:border-slate-700 flex-shrink-0 bg-white" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-slate-400 mb-0.5">{r.asin}</p>
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-900 dark:text-white hover:text-orange-500 transition-colors line-clamp-2 leading-snug">
                                {r.title}
                              </a>
                              {r.brand && <p className="text-xs text-slate-400 mt-0.5">by {r.brand}</p>}
                            </div>
                            <button onClick={() => remove(r.asin)} className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0">✕</button>
                          </div>

                          {/* Opportunity badge */}
                          {r.opportunity?.label && (
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black mt-1 mb-3 ${opp.bg} ${opp.text} ${opp.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${opp.badge}`} />
                              {r.opportunity.label} Opportunity
                              <span className="opacity-60 font-normal">· Score {r.opportunity.score}/100</span>
                            </div>
                          )}

                          {/* Stats grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Price</p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {r.price != null ? `$${r.price.toFixed(2)}` : '—'}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">BSR</p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {r.bsr != null ? `#${r.bsr.toLocaleString()}` : '—'}
                              </p>
                              {r.bsrCategory && <p className="text-[10px] text-slate-400 truncate">{r.bsrCategory}</p>}
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Rating</p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {r.rating != null ? `⭐ ${r.rating}` : '—'}
                              </p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Reviews</p>
                              <p className="text-sm font-black text-slate-900 dark:text-white">
                                {r.reviews != null ? r.reviews.toLocaleString() : '—'}
                              </p>
                            </div>
                          </div>

                          {/* Bullets */}
                          {r.bullets?.length > 0 && (
                            <ul className="mt-3 space-y-1">
                              {r.bullets.map((b, i) => (
                                <li key={i} className="text-xs text-slate-500 dark:text-slate-400 flex gap-2">
                                  <span className="text-orange-400 flex-shrink-0">›</span>
                                  <span className="line-clamp-1">{b}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors">
                            View on Amazon ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
