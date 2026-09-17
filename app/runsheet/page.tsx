'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import type { RunItem } from '@/lib/runSheet';
import type { RunEntry } from '@/lib/runSheetStore';

type Session = { username: string; role: Role; name: string };

const MARGIN_PRESETS = [0.2, 0.25, 0.3, 0.4];

/** Local calendar date — "today's livestream" means the host's today, not the server's. */
function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Starting bid that targets a profit margin: margin is profit over revenue,
 * so price = cost / (1 - margin). Rounded DOWN to the nearest 50¢ — a
 * starting bid is a floor for a live auction, not the final sale price, so
 * it's kept on the friendly side rather than rounded up past the target.
 */
function startingBid(cost: number, margin: number): number {
  if (!cost || margin <= 0 || margin >= 1) return 0;
  return Math.floor((cost / (1 - margin)) * 2) / 2;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function searchScore(item: RunItem, q: string): number {
  const model = item.modelNum.toLowerCase();
  const desc = item.description.toLowerCase();
  const loose = (s: string) => s.replace(/[^a-z0-9]/g, '');
  if (model === q) return 100;
  if (model.startsWith(q)) return 90;
  if (loose(model).includes(loose(q))) return 80;
  if (desc.startsWith(q)) return 70;
  if (desc.includes(q)) return 60;
  if (item.upc.toLowerCase().includes(q) || item.asin.toLowerCase().includes(q)) return 50;
  return 0;
}

export default function RunSheetPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<RunItem[]>([]);
  const [entries, setEntries] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetInfo, setSheetInfo] = useState<{ tab: string; demo: boolean; error?: string; hint?: string; serviceAccount?: string } | null>(null);

  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [margin, setMargin] = useState(0.3);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Record<string, number>>({});
  const date = useMemo(localDate, []);

  useEffect(() => {
    fetch('/api/me').then(r => (r.ok ? r.json() : null)).then((s: Session | null) => {
      if (!s || !['host', 'admin', 'manager'].includes(s.role)) { router.push('/login'); return; }
      setSession(s);
    });

    const savedMargin = typeof window !== 'undefined' ? localStorage.getItem('runsheet-margin') : null;
    if (savedMargin) setMargin(parseFloat(savedMargin) || 0.3);

    fetch(`/api/runsheet?date=${localDate()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setItems(Array.isArray(data.items) ? data.items : []);
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          setSheetInfo({ tab: data.tab, demo: !!data.demo, error: data.error, hint: data.hint, serviceAccount: data.serviceAccount });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function changeMargin(m: number) {
    setMargin(m);
    localStorage.setItem('runsheet-margin', String(m));
  }

  const byModel = useMemo(() => {
    const map = new Map<string, RunItem>();
    items.forEach(i => map.set(i.modelNum, i));
    return map;
  }, [items]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .map(item => ({ item, score: searchScore(item, q) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || b.item.remaining - a.item.remaining)
      .slice(0, 7)
      .map(r => r.item);
  }, [items, query]);

  useEffect(() => { setHighlight(0); }, [query]);

  // Optimistic local update, with the write debounced so holding the stepper
  // doesn't fire a request per click.
  function persist(modelNum: string, ran: number, item?: RunItem) {
    window.clearTimeout(saveTimers.current[modelNum]);
    saveTimers.current[modelNum] = window.setTimeout(() => {
      fetch('/api/runsheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: ran <= 0 ? 'remove' : 'set',
          date, modelNum, ran,
          description: item?.description ?? '',
          cost: item?.cost ?? 0,
          retail: item?.retail ?? 0,
        }),
      })
        // Deliberately not adopting the response body: a slower earlier save
        // can land after a newer local edit, and echoing its entries back
        // would snap the host's number backwards mid-stream. What's on screen
        // wins for the session; the load fetch is the authoritative read.
        .then(r => setSaveFailed(!r.ok))
        .catch(() => setSaveFailed(true));
    }, 400);
  }

  function setRan(modelNum: string, ran: number) {
    const item = byModel.get(modelNum);
    const next = Math.max(0, Math.floor(ran));
    setEntries(prev => {
      if (next <= 0) return prev.filter(e => e.modelNum !== modelNum);
      const existing = prev.find(e => e.modelNum === modelNum);
      if (existing) return prev.map(e => (e.modelNum === modelNum ? { ...e, ran: next } : e));
      return [...prev, {
        modelNum, ran: next,
        description: item?.description ?? '',
        cost: item?.cost ?? 0,
        retail: item?.retail ?? 0,
        updatedAt: new Date().toISOString(),
      }];
    });
    persist(modelNum, next, item);
  }

  function addItem(item: RunItem) {
    const current = entries.find(e => e.modelNum === item.modelNum)?.ran ?? 0;
    setRan(item.modelNum, current + 1);
    setQuery('');
    setJustAdded(item.modelNum);
    window.setTimeout(() => setJustAdded(null), 1200);
    searchRef.current?.focus();
  }

  function clearSheet() {
    if (!confirm('Clear the whole run sheet for today? This only clears this list — inventory is never changed.')) return;
    setEntries([]);
    fetch('/api/runsheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', date }),
    }).catch(() => {});
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); addItem(results[highlight]); }
    else if (e.key === 'Escape') { setQuery(''); }
  }

  // Rows the host is actually running, joined against live sheet numbers.
  const rows = useMemo(() => entries.map(entry => {
    const item = byModel.get(entry.modelNum);
    const inStock = item?.remaining ?? 0;
    const cost = item?.cost ?? entry.cost;
    return {
      entry,
      item,
      missing: !item,
      description: item?.description || entry.description,
      inStock,
      left: inStock - entry.ran,
      cost,
      bid: startingBid(cost, margin),
      sheetStart: item?.startPrice ?? 0,
      retail: item?.retail ?? entry.retail,
    };
  }), [entries, byModel, margin]);

  const totals = useMemo(() => ({
    lines: rows.length,
    units: rows.reduce((s, r) => s + r.entry.ran, 0),
    projected: rows.reduce((s, r) => s + r.bid * r.entry.ran, 0),
    oversold: rows.filter(r => r.left < 0).length,
  }), [rows]);

  function copySummary() {
    const lines = rows.map(r =>
      `${r.entry.modelNum} — ran ${r.entry.ran} of ${r.inStock}${r.bid ? ` · start ${money(r.bid)}` : ''}${r.description ? ` · ${r.description}` : ''}`);
    const text = [
      `Run Sheet — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`,
      ...lines,
      '',
      `${totals.lines} items · ${totals.units} units · ${money(totals.projected)} projected at start bids`,
    ].join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }

  useEffect(() => {
    if (!exportOpen) return;
    function onClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [exportOpen]);

  function downloadFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Model #', 'Description', 'In Stock', 'Run This Stream', 'Left', 'Cost', 'Start Bid', 'Margin'];
    const body = rows.map(r => [
      r.entry.modelNum, r.description, r.inStock, r.entry.ran, r.left,
      r.cost.toFixed(2), r.bid.toFixed(2), `${Math.round(margin * 100)}%`,
    ]);
    // Leading BOM so Excel opens the UTF-8 file (₤, ×, etc. in descriptions) without mangling it.
    const csv = '﻿' + [header, ...body].map(row => row.map(esc).join(',')).join('\r\n');
    downloadFile(`run-sheet-${date}.csv`, csv, 'text/csv;charset=utf-8;');
    setExportOpen(false);
  }

  function exportPDF() {
    setExportOpen(false);
    // The print stylesheet (print: classes below) hides everything except
    // the run list and a print-only header — the browser's own "Save as
    // PDF" destination in the print dialog produces the actual PDF, so
    // there's no PDF library to load or maintain here.
    window.setTimeout(() => window.print(), 50);
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden contents">
        <Sidebar role={session.role} userName={session.name} />
      </div>
      <div className="flex-1 flex flex-col min-w-0 print:block">
        {/* pl-16 on mobile clears the Sidebar's floating hamburger button. */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between pl-16 pr-4 md:px-6 flex-shrink-0 shadow-sm gap-4 print:hidden">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white leading-none">Run Sheet</h1>
            <p className="text-xs text-slate-400 mt-1 truncate">{today} · {session.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportOpen(v => !v)}
                disabled={!rows.length}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export
                <svg className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden z-30 animate-slide-up">
                  <button onClick={exportCSV} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                    <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span>CSV <span className="text-slate-400 font-normal">(Excel, Sheets)</span></span>
                  </button>
                  <button onClick={exportPDF} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left border-t border-slate-100 dark:border-slate-700">
                    <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span>PDF <span className="text-slate-400 font-normal">(print)</span></span>
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={copySummary}
              disabled={!rows.length}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? 'Copied!' : 'Copy Summary'}
            </button>
            <button
              onClick={clearSheet}
              disabled={!rows.length}
              className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              New Stream
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:h-auto print:p-0 print:block">
          <div className="mx-auto max-w-5xl space-y-6 print:max-w-none print:space-y-0">

            {/* Print-only heading — screen shows this in the header bar instead */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-black text-black">Run Sheet — {today}</h1>
              <p className="text-sm text-slate-600 mt-1">
                {session.name} · {totals.lines} items · {totals.units} units · {money(totals.projected)} projected at start bids · {Math.round(margin * 100)}% margin
              </p>
            </div>

            {sheetInfo?.error && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5 print:hidden">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{sheetInfo.error}</p>
                {sheetInfo.hint && <p className="text-xs text-amber-700 dark:text-amber-400/80 mt-1.5">{sheetInfo.hint}</p>}
                {sheetInfo.serviceAccount && (
                  <p className="mt-2 font-mono text-xs bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 break-all">
                    {sheetInfo.serviceAccount}
                  </p>
                )}
              </div>
            )}

            {sheetInfo?.demo && (
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 print:hidden">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Sample data — Google Sheets isn’t connected in this environment. Live numbers appear once the sheet is linked.
                </p>
              </div>
            )}

            {/* Search */}
            <div className="relative print:hidden">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-2 focus-within:ring-2 focus-within:ring-red-400 focus-within:border-red-400 transition-shadow">
                <div className="flex items-center gap-3 px-3">
                  <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={onSearchKey}
                    placeholder={loading ? 'Loading inventory…' : 'Type a model # or description, then press Enter'}
                    disabled={loading || !items.length}
                    className="flex-1 bg-transparent py-4 text-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none disabled:cursor-not-allowed"
                  />
                  {query && (
                    <button onClick={() => { setQuery(''); searchRef.current?.focus(); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  {!loading && items.length > 0 && (
                    <span className="hidden md:block text-[11px] font-bold text-slate-400 whitespace-nowrap">{items.length.toLocaleString()} items</span>
                  )}
                </div>
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-slide-up">
                  {results.map((item, i) => {
                    const bid = startingBid(item.cost, margin);
                    const already = entries.find(e => e.modelNum === item.modelNum)?.ran ?? 0;
                    return (
                      <button
                        key={item.modelNum}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => addItem(item)}
                        className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors border-b border-slate-50 dark:border-slate-700/50 last:border-0 ${
                          i === highlight ? 'bg-red-50 dark:bg-red-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{item.modelNum}</span>
                            {already > 0 && <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">{already} on sheet</span>}
                          </div>
                          {item.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.description}</p>}
                        </div>
                        <StockPill qty={item.remaining} />
                        <div className="text-right w-20 flex-shrink-0">
                          <div className="text-sm font-black text-slate-900 dark:text-white">{bid ? money(bid) : '—'}</div>
                          <div className="text-[10px] text-slate-400 uppercase font-bold">start bid</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {query.trim() && !results.length && !loading && (
                <div className="absolute z-20 left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl px-5 py-4 text-sm text-slate-500">
                  No item matches “{query.trim()}”.
                </div>
              )}
            </div>

            {/* Summary + margin */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
              <Stat label="Items" value={String(totals.lines)} />
              <Stat label="Units to run" value={String(totals.units)} />
              <Stat label="Projected at start" value={money(totals.projected)} accent />
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-2">Target margin</p>
                <div className="flex flex-wrap gap-1">
                  {MARGIN_PRESETS.map(m => (
                    <button
                      key={m}
                      onClick={() => changeMargin(m)}
                      className={`px-2 py-1 rounded-md text-xs font-bold border transition-colors ${
                        Math.abs(margin - m) < 0.001
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-red-400'
                      }`}
                    >
                      {Math.round(m * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {saveFailed && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-3 print:hidden">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  Couldn’t save your last change. What’s on screen is still correct — refresh once you’re back online to re-sync.
                </p>
              </div>
            )}

            {totals.oversold > 0 && (
              <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-3 flex items-center gap-2 print:hidden">
                <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <p className="text-sm font-bold text-red-700 dark:text-red-400">
                  {totals.oversold} item{totals.oversold > 1 ? 's are' : ' is'} set to run more than you have in stock.
                </p>
              </div>
            )}

            {/* Run list */}
            {rows.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl py-16 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-6 4h6" /></svg>
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-200">Nothing on today’s sheet yet</p>
                <p className="text-sm text-slate-400 mt-1">Search a model # above and press Enter to add it.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-1 text-center">In stock</div>
                  <div className="col-span-3 text-center">Run this stream</div>
                  <div className="col-span-1 text-center">Left</div>
                  <div className="col-span-2 text-right">Start bid</div>
                </div>

                {rows.map(row => (
                  <div
                    key={row.entry.modelNum}
                    className={`grid grid-cols-2 md:grid-cols-12 gap-4 px-5 py-4 items-center border-b border-slate-50 dark:border-slate-700/50 last:border-0 transition-colors print:break-inside-avoid ${
                      justAdded === row.entry.modelNum ? 'bg-red-50/70 dark:bg-red-500/10' : row.left < 0 ? 'bg-red-50/40 dark:bg-red-900/10' : ''
                    }`}
                  >
                    {/* Item */}
                    <div className="col-span-2 md:col-span-5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{row.entry.modelNum}</span>
                        {row.missing && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full">not in sheet</span>}
                      </div>
                      {row.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{row.description}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">
                        Cost {row.cost ? money(row.cost) : '—'}
                        {row.retail ? ` · Retail ${money(row.retail)}` : ''}
                        {row.sheetStart ? ` · Sheet start ${money(row.sheetStart)}` : ''}
                      </p>
                    </div>

                    {/* In stock */}
                    <div className="md:col-span-1 flex md:justify-center">
                      <span className="md:hidden text-[10px] font-bold uppercase text-slate-400 w-20">In stock</span>
                      <span className="text-lg font-black text-slate-700 dark:text-slate-200 tabular-nums">{row.inStock}</span>
                    </div>

                    {/* Stepper */}
                    <div className="col-span-2 md:col-span-3 flex items-center md:justify-center gap-2 print:justify-center">
                      <span className="md:hidden text-[10px] font-bold uppercase text-slate-400 w-20 print:hidden">Run</span>
                      <span className="hidden print:inline text-lg font-black tabular-nums text-black">{row.entry.ran}</span>
                      <button
                        onClick={() => setRan(row.entry.modelNum, row.entry.ran - 1)}
                        aria-label={`Run one fewer ${row.entry.modelNum}`}
                        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-black hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors print:hidden"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={row.entry.ran}
                        onChange={e => setRan(row.entry.modelNum, parseInt(e.target.value) || 0)}
                        aria-label={`Quantity of ${row.entry.modelNum} run this stream`}
                        className="print:hidden w-16 h-9 text-center text-lg font-black tabular-nums rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => setRan(row.entry.modelNum, row.entry.ran + 1)}
                        aria-label={`Run one more ${row.entry.modelNum}`}
                        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-black hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors print:hidden"
                      >
                        +
                      </button>
                    </div>

                    {/* Left after */}
                    <div className="md:col-span-1 flex md:justify-center items-center">
                      <span className="md:hidden text-[10px] font-bold uppercase text-slate-400 w-20">Left</span>
                      <span className={`text-xl font-black tabular-nums ${
                        row.left < 0 ? 'text-red-600' : row.left === 0 ? 'text-amber-500' : 'text-emerald-600'
                      }`}>
                        {row.left}
                      </span>
                    </div>

                    {/* Start bid */}
                    <div className="col-span-2 md:col-span-2 flex items-center justify-between md:justify-end gap-3">
                      <span className="md:hidden text-[10px] font-bold uppercase text-slate-400">Start bid</span>
                      <div className="text-right">
                        <div className="text-xl font-black text-red-500 tabular-nums leading-none">{row.bid ? money(row.bid) : '—'}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">{Math.round(margin * 100)}% margin</div>
                      </div>
                      <button
                        onClick={() => setRan(row.entry.modelNum, 0)}
                        aria-label={`Remove ${row.entry.modelNum} from the sheet`}
                        className="text-slate-300 hover:text-red-500 p-1.5 rounded transition-colors print:hidden"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center pb-4">
              This sheet is yours for today only and never changes the inventory in Google Sheets.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums ${accent ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

function StockPill({ qty }: { qty: number }) {
  const tone = qty <= 0
    ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
    : qty <= 5
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
  return (
    <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-1 rounded-full border tabular-nums ${tone}`}>
      {qty <= 0 ? 'Out' : `${qty} left`}
    </span>
  );
}
