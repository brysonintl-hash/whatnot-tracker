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

function downloadCSV(result: ScraperResult) {
  const headers = ['Title', 'Price', 'Qty', 'URL'];
  const rows = result.listings
    .filter(l => l.title && l.title.length > 3 && !/^(filter|search|sort)/i.test(l.title))
    .map((l: Listing) => [
      String(l.title ?? '').replace(/"/g, '""'),
      l.price != null ? `$${l.price.toFixed(2)}` : '',
      l.qty != null ? String(l.qty) : '',
      l.url ?? '',
    ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\r\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${result.username}_whatnot_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BookmarkletSection({ appUrl }: { appUrl: string }) {
  // Bookmarklet: auto-scrolls page, extracts ALL products, encodes directly in URL hash
  // No server POST needed — data travels in the URL itself, bypassing all caching/routing issues
  const bm = `javascript:(function(){
var m=location.href.match(/whatnot\\.com\\/user\\/([^/?#]+)/);
if(!m){alert('Open a Whatnot seller shop page first (e.g. whatnot.com/user/USERNAME/shop)');return;}
var username=m[1].toLowerCase();
var APP='${appUrl}';
var lastH=0,stalls=0;

function getCard(a){
  // Walk up from the <a> link — stop when parent contains multiple listing links (= we've left the card)
  var el=a,prev=a;
  for(var i=0;i<10;i++){
    if(!el.parentElement)break;
    var siblings=el.parentElement.querySelectorAll('a[href*=\\"/listing/\\"]');
    if(siblings.length>1)return prev; // prev is the card-level element
    prev=el;el=el.parentElement;
  }
  return el;
}

function getTitle(card){
  var texts=[];
  var walk=function(node){
    if(node.nodeType===3){var t=node.textContent.trim();if(t)texts.push(t);}
    else if(node.nodeType===1&&node.tagName!=='SCRIPT'&&node.tagName!=='STYLE'){
      for(var i=0;i<node.childNodes.length;i++)walk(node.childNodes[i]);
    }
  };
  walk(card);
  // Priority 1: text starting with [$XX] — Whatnot MSRP format
  for(var i=0;i<texts.length;i++){
    if(/^\\[\\$[\\d,.]/.test(texts[i])&&texts[i].length>8)return texts[i];
  }
  // Priority 2: longest text that isn't price/qty/nav
  var best='';
  for(var i=0;i<texts.length;i++){
    var t=texts[i];
    var skip=/^(\\$[\\d]+|Qty\\.?\\s*\\d|Filter|Search|Sort|Shop|Browse|Sign|Home|Products|Reviews|Shows|Clips|Following|Followers|\\d+[KM]?\\s*(sold|review|follow))/i.test(t)
          ||/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(t)
          ||t.length<8||t.length>400;
    if(!skip&&t.length>best.length)best=t;
  }
  return best;
}

function extract(){
  var links=Array.from(document.querySelectorAll('a[href]')).filter(function(a){
    return/\\/listing\\/[A-Za-z0-9\\-_+=]{6,}/.test(a.href);
  });
  if(!links.length){
    alert('No listing links found on this page.\\nMake sure you are on the Shop tab.\\nTotal <a> tags: '+document.querySelectorAll('a').length);
    return null;
  }
  var seen=new Set(),out=[];
  links.forEach(function(a){
    var hm=a.href.match(/\\/listing\\/([A-Za-z0-9\\-_+=]{6,})/);
    if(!hm||seen.has(hm[1]))return;
    seen.add(hm[1]);
    var id=hm[1];
    var card=getCard(a);
    var title=getTitle(card);
    if(!title||title.length<4)return;
    var ct=card.textContent||'';
    // Price: first standalone $XX NOT inside brackets (avoid MSRP)
    var priceM=ct.replace(/\\[\\$[\\d,.]+\\]/g,'').match(/\\$([\\d]+(?:\\.[\\d]{1,2})?)/);
    var price=priceM?parseFloat(priceM[1]):null;
    var qtyM=ct.match(/Qty\\.?\\s*(\\d+)/i);
    var qty=qtyM?parseInt(qtyM[1]):null;
    out.push([id,title,price,qty]);
  });
  return out;
}

var t=setInterval(function(){
  window.scrollTo(0,document.body.scrollHeight);
  var h=document.body.scrollHeight;
  if(h===lastH){
    stalls++;
    if(stalls>=5){
      clearInterval(t);
      var data=extract();
      if(!data)return;
      if(!data.length){alert('Products found but titles could not be extracted.\\nTry clicking Debug DOM bookmark and share the result.');return;}
      // Encode all data into URL hash — no server POST needed, 100% reliable
      try{
        var payload=JSON.stringify({u:username,l:data});
        var b64=btoa(unescape(encodeURIComponent(payload)));
        var safe=b64.replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');
        var url=APP+'/scraper?u='+encodeURIComponent(username)+'#wn='+safe;
        alert('Found '+data.length+' products! Opening app...');
        window.open(url,'_blank');
      }catch(e){alert('Error encoding data: '+e);}
    }
  }else{stalls=0;lastH=h;}
},2000);
})();`.replace(/\n/g, '');

  return (
    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-800 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-black text-violet-800 dark:text-violet-300">Bookmarklet — Get ALL Products (Recommended)</p>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
            Auto-scrolls the Whatnot shop page and captures every product. Manual search only gets ~20.
          </p>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        {[
          'Drag the button below to your bookmarks bar',
          "Open the seller's Whatnot shop (Shop tab)",
          'Click the bookmark — it auto-scrolls (~30 sec) then opens this page with all products ready to download',
        ].map((text, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-violet-200 dark:bg-violet-700 flex items-center justify-center text-[10px] font-black text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">{i + 1}</div>
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <a href={bm} onClick={e => { e.preventDefault(); alert("Drag this to your bookmarks bar — don't click it here!"); }} draggable
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl cursor-grab active:cursor-grabbing select-none">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        Scrape Whatnot Shop
      </a>
      <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-2">Drag to bookmarks bar — do not click here</p>
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

  useEffect(() => { setAppUrl(window.location.origin); }, []);

  // Decode bookmarklet data from URL hash (#wn=BASE64) — no server needed
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#wn=')) return;
    try {
      const safe = hash.slice(4);
      const b64 = safe.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      const payload = JSON.parse(json) as { u: string; l: [string, string, number | null, number | null][] };
      if (!payload.u || !Array.isArray(payload.l)) return;
      const listings: Listing[] = payload.l.map(([id, title, price, qty]) => ({
        id, title: title ?? '', price, qty,
        image: '', category: '', condition: '',
        url: `https://www.whatnot.com/listing/${id}`,
      }));
      setUsername(payload.u);
      setResult({
        username: payload.u,
        displayName: payload.u,
        listings,
        totalDetected: listings.length,
        reviewScore: null,
        reviewCount: null,
        totalSold: null,
        avatar: '',
      });
      // Remove hash from URL bar without reloading
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch { /* malformed hash — ignore */ }
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
      if (data.error === 'SETUP_REQUIRED') setSetupMessage(data.message);
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
      const u = searchParams.get('u')?.trim().replace(/^@/, '');
      if (u) runSearch(u);
    });
  }, [router, searchParams, runSearch]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(username.trim().replace(/^@/, ''));
  }

  const productCount = result
    ? result.listings.filter(l => l.title && l.title.length > 3 && !/^(filter|search|sort)/i.test(l.title)).length
    : 0;

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
            <p className="text-xs text-slate-400">Scrape any Whatnot seller → download CSV</p>
          </div>
          <span className="text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">

            {/* Bookmarklet */}
            {appUrl && <BookmarkletSection appUrl={appUrl} />}

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">or search by username</span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Whatnot username"
                  className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <button type="submit" disabled={loading || !username.trim()}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2">
                {loading
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Scraping...</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Scrape</>
                }
              </button>
            </form>

            {/* Error */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-5 text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {error}
              </div>
            )}

            {/* Setup banner */}
            {setupMessage && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-5 text-xs text-blue-700 dark:text-blue-300">
                <p className="font-black text-sm mb-1">ScraperAPI Key Required</p>
                <p>Add <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded font-mono">SCRAPER_API_KEY</code> in Railway → Variables. Or just use the bookmarklet above — it requires no API key.</p>
              </div>
            )}

            {/* Result — just the download card */}
            {result && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                <div className="flex items-center gap-4 mb-5">
                  {result.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.avatar} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-slate-100 dark:border-slate-600 flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 font-black text-2xl flex-shrink-0">
                      {result.displayName[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-slate-900 dark:text-white">{result.displayName}</p>
                    <p className="text-xs text-violet-500 font-mono">@{result.username}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {result.totalSold != null && <span className="text-[10px] text-slate-400">{fmtNum(result.totalSold)} sold</span>}
                      {result.reviewScore != null && <span className="text-[10px] text-slate-400">{result.reviewScore.toFixed(1)} ★ ({fmtNum(result.reviewCount)})</span>}
                    </div>
                  </div>
                  <a href={`https://www.whatnot.com/user/${result.username}/shop`} target="_blank" rel="noreferrer"
                    className="text-[10px] font-bold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center gap-1 flex-shrink-0">
                    Shop
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>

                {/* Download block */}
                {productCount > 0 ? (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-emerald-800 dark:text-emerald-300">
                        {productCount} product{productCount !== 1 ? 's' : ''} ready
                      </p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">CSV includes Title, Price, Qty, URL</p>
                    </div>
                    <button onClick={() => downloadCSV(result)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download CSV
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                    <p className="text-sm font-black text-amber-800 dark:text-amber-300 mb-1">No products captured via search</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Whatnot loads products via JavaScript — the server can&apos;t render them.
                      Use the <span className="font-bold">bookmarklet above</span> while the seller&apos;s shop is open in your browser to capture all products.
                    </p>
                  </div>
                )}

                {productCount > 0 && result.totalDetected && result.totalDetected > productCount && (
                  <p className="text-[10px] text-slate-400 text-center mt-3">
                    For all {result.totalDetected} products, use the <span className="text-violet-500 font-bold">bookmarklet</span> above while the shop is open in your browser.
                  </p>
                )}
              </div>
            )}

            {/* Empty state */}
            {!result && !loading && !error && !setupMessage && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Search a seller or use the bookmarklet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">The bookmarklet captures all products. Manual search is limited to ~20 by Whatnot&apos;s infinite scroll.</p>
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
