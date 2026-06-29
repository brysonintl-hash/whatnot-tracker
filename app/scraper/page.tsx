'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';
import type { ScraperResult, Listing } from '@/app/api/scraper/route';

type Session = { username: string; role: Role; name: string };

function fmtPrice(p: number | null) {
  if (p == null) return '—';
  return `$${p.toFixed(2)}`;
}

function StatChip({ label, value }: { label: string; value: string | number | null }) {
  if (value == null) return null;
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-4 py-3 text-center">
      <p className="text-lg font-black text-slate-900 dark:text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold mt-0.5">{label}</p>
    </div>
  );
}

export default function ScraperPage() {
  useTheme();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScraperResult | null>(null);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setResult(null);
    setError('');
    setCategoryFilter('');
    try {
      const r = await fetch(`/api/scraper?username=${encodeURIComponent(username.trim())}`);
      const data = await r.json();
      if (!r.ok || data.error) { setError(data.error || 'Failed to load seller.'); }
      else setResult(data as ScraperResult);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filteredListings: Listing[] = result?.listings.filter(l =>
    !categoryFilter || l.category === categoryFilter
  ) ?? [];

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
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Seller Scraper</h1>
            <p className="text-xs text-slate-400">Look up any Whatnot seller&apos;s shop and listings</p>
          </div>
          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto">
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter Whatnot username (e.g. stackbargains)"
                className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
            >
              {loading ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Scraping...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Search</>
              )}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-5">
              {/* Profile card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                <div className="flex items-start gap-4">
                  {result.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.avatar} alt={result.displayName} className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-slate-100 dark:border-slate-600" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-black text-xl flex-shrink-0">
                      {result.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-black text-slate-900 dark:text-white">{result.displayName}</h2>
                      {result.verified && (
                        <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full font-bold">Verified</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">@{result.username}</p>
                    {result.bio && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{result.bio}</p>}
                  </div>
                  <a
                    href={`https://www.whatnot.com/user/${result.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center gap-1 flex-shrink-0"
                  >
                    View on Whatnot
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>

                {/* Stats row */}
                {(result.followers != null || result.reviewCount != null || result.reviewScore != null) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <StatChip label="Followers" value={result.followers} />
                    <StatChip label="Following" value={result.following} />
                    <StatChip label="Reviews" value={result.reviewCount} />
                    <StatChip label="Rating" value={result.reviewScore != null ? `${result.reviewScore.toFixed(1)} ★` : null} />
                  </div>
                )}
              </div>

              {/* Listings */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">Listings</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {result.listings.length} item{result.listings.length !== 1 ? 's' : ''} found
                      {categoryFilter && ` · filtered to "${categoryFilter}"`}
                    </p>
                  </div>
                  {result.categories.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setCategoryFilter('')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${!categoryFilter ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-violet-400'}`}
                      >All</button>
                      {result.categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === cat ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-violet-400'}`}
                        >{cat}</button>
                      ))}
                    </div>
                  )}
                </div>

                {filteredListings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                    </div>
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No listings found</p>
                    <p className="text-xs text-slate-400 mt-1">This seller may have no active items, or data wasn&apos;t available on the page.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          {['Item', 'Category', 'Condition', 'Price', ''].map(h => (
                            <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 ${h === 'Price' || h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map((l, i) => (
                          <tr key={i} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                {l.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={l.image} alt={l.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-100 dark:border-slate-700" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                  </div>
                                )}
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[220px]">{l.title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {l.category ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 whitespace-nowrap">{l.category}</span>
                              ) : <span className="text-xs text-slate-400">—</span>}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{l.condition || '—'}</td>
                            <td className="py-3 px-4 text-right">
                              <span className="text-xs font-black text-slate-900 dark:text-white">{fmtPrice(l.price)}</span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {l.id && (
                                <a href={l.url} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline">View</a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Search a Whatnot Seller</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Enter their Whatnot username above to view their shop, listings, and stats.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
