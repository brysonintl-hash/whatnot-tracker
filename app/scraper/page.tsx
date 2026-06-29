'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const headers = ['Title', 'Price', 'Qty', 'URL'];
  const rows = result.listings.map(l => [
    String(l.title ?? '').replace(/"/g, '""'),
    l.price != null ? `$${l.price.toFixed(2)}` : '',
    l.qty != null ? String(l.qty) : '',
    l.url ?? '',
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\r\n');

  const bom = '﻿';
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

function BookmarkletSection({ appUrl }: { appUrl: string }) {
  const bm = `javascript:(function(){var m=location.href.match(/whatnot\\.com\\/user\\/([^/?#]+)/);if(!m){alert('Go to a Whatnot seller shop page first (e.g. whatnot.com/user/toolsforlifee/shop)');return;}var username=m[1].toLowerCase();var seen=new Set();var listings=[];document.querySelectorAll('a[href*="/listing/"]').forEach(function(a){var hm=(a.href||'').match(/\\/listing\\/([a-zA-Z0-9_=+\\-]{6,})/);if(!hm||seen.has(hm[1]))return;seen.add(hm[1]);var id=hm[1];var card=a;for(var i=0;i<8;i++){if(card.parentElement)card=card.parentElement;else break;}var titleEl=card.querySelector('[data-testid*="title"],[data-testid*="name"]');var title=titleEl?titleEl.textContent.trim():'';if(!title){var img=a.querySelector('img');title=img?img.alt.trim():'';}if(!title||title.length<4)return;var priceM=(card.textContent||'').match(/\\$(\\d+(?:\\.\\d{1,2})?)/);var price=priceM?parseFloat(priceM[1]):null;var qtyM=(card.textContent||'').match(/Qty[.:\\s]+(\\d+)|(\\d+)\\s+Available/i);var qty=qtyM?parseInt(qtyM[1]||qtyM[2]):null;listings.push({id:id,title:title,price:price,image:'',category:'',condition:'',qty:qty,url:'https://www.whatnot.com/listing/'+id});});if(!listings.length){alert('No listings found. Scroll down to load all products, then try again.');return;}alert('Found '+listings.length+' products! Sending to app...');fetch('${appUrl}/api/scraper/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username,listings:listings}),mode:'cors'}).then(function(){window.open('${appUrl}/scraper?u='+username,'_blank');}).catch(function(e){alert('Error: '+e+'. Make sure you are logged in to the app.');});})();`;

  return (
    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-800 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-black text-violet-800 dark:text-violet-300">Bookmarklet — Get ALL Products Instantly</p>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
            Since you have the seller shop open in your browser, this reads all products directly — no Cloudflare blocking, no API limits.
          </p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {[
          { n: 1, text: 'Drag the button below to your bookmarks bar' },
          { n: 2, text: 'Open the seller\'s Whatnot shop in your browser (scroll to the bottom to load all products)' },
          { n: 3, text: 'Click the bookmark — it will read all listings and open this page with results' },
        ].map(step => (
          <div key={step.n} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-violet-200 dark:bg-violet-700 flex items-center justify-center text-[10px] font-black text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">{step.n}</div>
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{step.text}</p>
          </div>
        ))}
      </div>

      <a
        href={bm}
        onClick={e => { e.preventDefault(); alert('Drag this button to your bookmarks bar — don\'t click it here!'); }}
        draggable
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl cursor-grab active:cursor-grabbing select-none"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        Scrape Whatnot Shop
      </a>
      <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-2">Drag this to your bookmarks bar — do not click it here</p>
    </div>
  );
}

function ScraperPageInner() {
  useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScraperResult | null>(null);
  const [error, setError] = useState('');
  const [setupMessage, setSetupMessage] = useState('');
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q) return;
    setLoading(true);
    setResult(null);
    setError('');
    setSetupMessage('');
    setUsername(q);
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
  }, []);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
      // Auto-search if bookmarklet sent us here with ?u=username
      const u = searchParams.get('u')?.trim().replace(/^@/, '');
      if (u) runSearch(u);
    });
  }, [router, searchParams, runSearch]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(username.trim().replace(/^@/, ''));
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
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Seller Scraper</h1>
            <p className="text-xs text-slate-400">Scrape any Whatnot seller — profile + listings → CSV</p>
          </div>
          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">

            {/* Bookmarklet */}
            {appUrl && <BookmarkletSection appUrl={appUrl} />}

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
                  placeholder="Whatnot username"
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
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Whatnot is protected by Cloudflare. Use the bookmarklet above (recommended) or add a ScraperAPI key below.</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { n: 1, text: 'Go to', link: 'https://www.scraperapi.com', linkLabel: 'scraperapi.com', after: 'and create a free account (5,000 credits/month on trial)' },
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
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-3">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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

                  {/* Stats — no followers/following */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Total Sold" value={fmtNum(result.totalSold)} />
                    <StatCard label="Reviews" value={fmtNum(result.reviewCount)} />
                    <StatCard label="Rating" value={result.reviewScore != null ? `${result.reviewScore.toFixed(1)} ★` : null} />
                  </div>
                </div>

                {/* Listings table */}
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      Shop Listings
                      <span className="ml-2 text-[10px] font-bold text-slate-400">
                        ({result.listings.length} scraped{result.totalDetected && result.totalDetected > result.listings.length ? ` of ${result.totalDetected} total` : ''})
                      </span>
                    </p>
                  </div>

                  {result.listings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No listings captured</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">Use the bookmarklet above while the seller&apos;s shop is open in your browser to capture all listings.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-700">
                            {['Item', 'Qty', 'Price', ''].map(h => (
                              <th key={h} className={`text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 ${h === 'Price' || h === 'Qty' ? 'text-right' : h === '' ? 'text-right' : 'text-left'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(result.listings as Listing[]).map((l, i) => (
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
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 line-clamp-2 max-w-[280px]">{l.title}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right text-xs text-slate-500 dark:text-slate-400">{l.qty != null ? l.qty : '—'}</td>
                              <td className="py-3 px-4 text-right">
                                <span className="text-xs font-black text-slate-900 dark:text-white">{fmtPrice(l.price)}</span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {l.url && (
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
            {!result && !loading && !error && !setupMessage && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Use the bookmarklet or search by username</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">The bookmarklet gets all products instantly from your browser. Manual search uses the API but may hit limits.</p>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

export default function ScraperPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading...</div>
      </div>
    }>
      <ScraperPageInner />
    </Suspense>
  );
}
