'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';
import type { ScraperResult, Listing } from '@/app/api/scraper/route';

type Session = { username: string; role: Role; name: string };

function fmtNum(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPrice(p: number | null): string {
  if (p == null) return '—';
  return `$${p.toFixed(2)}`;
}

function downloadCSV(result: ScraperResult) {
  const profileRows = [
    ['=== SELLER PROFILE ==='],
    ['Username', result.username],
    ['Display Name', result.displayName],
    ['Bio', result.bio || ''],
    ['Followers', result.followers != null ? String(result.followers) : ''],
    ['Following', result.following != null ? String(result.following) : ''],
    ['Reviews', result.reviewCount != null ? String(result.reviewCount) : ''],
    ['Rating', result.reviewScore != null ? String(result.reviewScore) : ''],
    ['Total Sold', result.totalSold != null ? String(result.totalSold) : ''],
    ['Verified', result.verified ? 'Yes' : 'No'],
    ['Profile URL', `https://www.whatnot.com/user/${result.username}`],
    [''],
    ['=== LISTINGS ==='],
    ['Title', 'Price', 'Category', 'Condition', 'Qty', 'Listing URL'],
  ];

  const listingRows: string[][] = result.listings.map(l => [
    l.title,
    l.price != null ? String(l.price) : '',
    l.category,
    l.condition,
    l.qty != null ? String(l.qty) : '',
    l.url,
  ]);

  const allRows = [...profileRows, ...listingRows];
  const csv = allRows.map(row =>
    row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const bom = '﻿'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.username}_whatnot_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  if (value == null || value === '—') return null;
  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl px-4 py-3 text-center">
      <p className="text-lg font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
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
  const [setupMessage, setSetupMessage] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = username.trim().replace(/^@/, '');
    if (!q) return;
    setLoading(true);
    setResult(null);
    setError('');
    setSetupMessage('');
    setCategoryFilter('');
    try {
      const r = await fetch(`/api/scraper?username=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (data.error === 'SETUP_REQUIRED') { setSetupMessage(data.message); }
      else if (!r.ok || data.error) setError(data.error || 'Failed to scrape seller.');
      else setResult(data as ScraperResult);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filteredListings: Listing[] = (result?.listings ?? []).filter(l =>
    !categoryFilter || l.category === categoryFilter
  );

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
            <p className="text-xs text-slate-400">Look up any Whatnot seller — profile + listings → CSV</p>
          </div>
          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">

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
                  placeholder="Whatnot username (e.g. toolsforlifee)"
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button type="submit" disabled={loading || !username.trim()}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                {loading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Scraping...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Scrape</>
                )}
              </button>
              {result && (
                <button type="button" onClick={() => downloadCSV(result)}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download CSV
                </button>
              )}
            </form>

            {/* Setup required banner */}
            {setupMessage && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 mb-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-blue-800 dark:text-blue-300">One-Time Setup Required</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Whatnot is protected by Cloudflare. A free proxy key is needed to bypass it.</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { n: 1, text: 'Go to', link: 'https://www.scraperapi.com', linkLabel: 'scraperapi.com', after: 'and create a free account (no credit card — 1,000 free requests/month)' },
                    { n: 2, text: 'Copy your API key from the ScraperAPI dashboard', link: '', linkLabel: '', after: '' },
                    { n: 3, text: 'In Railway → your service → Variables, add:', link: '', linkLabel: '', after: '', code: 'SCRAPER_API_KEY = paste_your_key_here' },
                    { n: 4, text: 'Redeploy the service and search again', link: '', linkLabel: '', after: '' },
                  ].map(step => (
                    <div key={step.n} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-700 flex items-center justify-center text-[10px] font-black text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5">{step.n}</div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                        {step.text}{' '}
                        {step.link && <a href={step.link} target="_blank" rel="noreferrer" className="font-bold underline">{step.linkLabel}</a>}
                        {step.after && ` ${step.after}`}
                        {step.code && <><br /><code className="mt-1 block bg-blue-100 dark:bg-blue-800/50 px-2 py-1 rounded font-mono text-[11px]">{step.code}</code></>}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-5">

                {/* Note banner */}
                {result.note && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-3">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {result.note}
                  </div>
                )}

                {/* Profile card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                  <div className="flex items-start gap-4 mb-4">
                    {result.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.avatar} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-slate-100 dark:border-slate-600" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-black text-2xl flex-shrink-0">
                        {result.displayName[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-black text-slate-900 dark:text-white">{result.displayName}</h2>
                        {result.verified && (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full font-bold">✓ Verified</span>
                        )}
                      </div>
                      <p className="text-xs text-violet-500 font-mono mt-0.5">@{result.username}</p>
                      {result.bio && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{result.bio}</p>}
                    </div>
                    <a href={`https://www.whatnot.com/user/${result.username}/shop`} target="_blank" rel="noreferrer"
                      className="text-[10px] font-bold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center gap-1 flex-shrink-0">
                      Open Shop
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <StatCard label="Followers" value={fmtNum(result.followers)} />
                    <StatCard label="Following" value={fmtNum(result.following)} />
                    <StatCard label="Total Sold" value={fmtNum(result.totalSold)} />
                    <StatCard label="Reviews" value={fmtNum(result.reviewCount)} />
                    <StatCard label="Rating" value={result.reviewScore != null ? `${result.reviewScore.toFixed(1)} ★` : null} />
                  </div>
                </div>

                {/* Listings table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        Shop Listings
                        <span className="ml-2 text-[10px] font-bold text-slate-400">({result.listings.length} found)</span>
                      </p>
                      {categoryFilter && <p className="text-[10px] text-slate-400 mt-0.5">Filtered: &quot;{categoryFilter}&quot;</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {result.categories.length > 0 && (
                        <>
                          <button onClick={() => setCategoryFilter('')}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${!categoryFilter ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-violet-400'}`}>
                            All
                          </button>
                          {result.categories.map(cat => (
                            <button key={cat} onClick={() => setCategoryFilter(cat)}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${categoryFilter === cat ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-violet-400'}`}>
                              {cat}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {filteredListings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No listings captured</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">
                        Whatnot loads shop products via JavaScript after the page renders. Server-side scraping can&apos;t execute JavaScript,
                        so listings aren&apos;t available — but the <strong>CSV still includes all profile data</strong> that was captured.
                      </p>
                      <button onClick={() => downloadCSV(result)} className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download Profile CSV Anyway
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-700">
                            {['Item', 'Category', 'Condition', 'Qty', 'Price', ''].map(h => (
                              <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 ${h === 'Price' || h === 'Qty' ? 'text-right' : h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
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
                                    <img src={l.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-100 dark:border-slate-700" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                      <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    </div>
                                  )}
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[200px]">{l.title}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {l.category ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 whitespace-nowrap">{l.category}</span>
                                ) : <span className="text-xs text-slate-400">—</span>}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{l.condition || '—'}</td>
                              <td className="py-3 px-4 text-right text-xs text-slate-500 dark:text-slate-400">{l.qty != null ? l.qty : '—'}</td>
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
                <p className="text-xs text-slate-400 mt-1 max-w-xs">Enter their username above to scrape their profile, stats, and shop listings — then download as CSV.</p>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
