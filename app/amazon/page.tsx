'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Opportunity = { label: string; color: string; score: number };
type FBAInfo = { fee: number; tier: string } | null;

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
  weight: string | null;
  weightLbs: number | null;
  fba: FBAInfo;
  estimatedMonthlySales: number | null;
  yourCost: number | null;
  whatnotPrice: number | null;
  error?: string;
  loading?: boolean;
};

const AMAZON_FEE_PCT   = 0.15;
const FBM_SHIP_LIGHT   = 10.31; // ≤5 lbs
const WN_COMMISSION    = 0.08;
const WN_TRANSACTION   = 0.30;

function calcProfits(r: AsinResult) {
  const { price, yourCost, whatnotPrice, weightLbs, fba } = r;
  if (yourCost == null) return null;

  // FBM
  const fbmOverweight = weightLbs != null && weightLbs > 5;
  const fbmShip = fbmOverweight ? null : FBM_SHIP_LIGHT;
  const fbmProfit = price != null && fbmShip != null
    ? price * (1 - AMAZON_FEE_PCT) - fbmShip - yourCost
    : null;

  // FBA
  const fbaProfit = price != null && fba != null
    ? price * (1 - AMAZON_FEE_PCT) - fba.fee - yourCost
    : null;

  // Whatnot
  const wnProfit = whatnotPrice != null
    ? whatnotPrice * (1 - WN_COMMISSION) - WN_TRANSACTION - yourCost
    : null;

  // Find best option
  const options: { key: string; profit: number }[] = [];
  if (fbmProfit != null) options.push({ key: 'fbm', profit: fbmProfit });
  if (fbaProfit != null) options.push({ key: 'fba', profit: fbaProfit });
  if (wnProfit  != null) options.push({ key: 'wn',  profit: wnProfit  });
  const best = options.length ? options.reduce((a, b) => a.profit > b.profit ? a : b).key : null;

  return { fbmProfit, fbaProfit, wnProfit, fbmOverweight, fbmShip, best };
}

const OPP_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Hot:      { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-700', dot: 'bg-emerald-500' },
  Good:     { bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-700',       dot: 'bg-blue-500'   },
  Okay:     { bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-400',     border: 'border-amber-200 dark:border-amber-700',     dot: 'bg-amber-500'  },
  Risky:    { bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400',         border: 'border-red-200 dark:border-red-700',         dot: 'bg-red-500'    },
  'No BSR': { bg: 'bg-slate-50 dark:bg-slate-700',        text: 'text-slate-600 dark:text-slate-300',     border: 'border-slate-200 dark:border-slate-600',     dot: 'bg-slate-400'  },
};

const inputCls = 'text-sm px-3 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400';

function fmt(n: number) { return `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`; }

export default function AmazonPage() {
  const router = useRouter();
  useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [asinInput, setAsinInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [wnInput, setWnInput]   = useState('');
  const [results, setResults]   = useState<AsinResult[]>([]);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  async function analyze() {
    const asin = asinInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!asin) return;
    if (results.find(r => r.asin === asin)) return;
    const yourCost    = costInput ? parseFloat(costInput) : null;
    const whatnotPrice = wnInput  ? parseFloat(wnInput)   : null;
    setAsinInput('');
    setResults(prev => [{
      asin, title: '', brand: '', image: '', price: null, currency: 'USD',
      rating: null, reviews: null, bsr: null, bsrCategory: null, category: '',
      bullets: [], url: '', opportunity: { label: '', color: 'slate', score: 0 },
      weight: null, weightLbs: null, fba: null, estimatedMonthlySales: null,
      yourCost, whatnotPrice, loading: true,
    }, ...prev]);
    try {
      const res  = await fetch(`/api/amazon?asin=${asin}`);
      const data = await res.json();
      setResults(prev => prev.map(r => r.asin === asin
        ? { ...data, yourCost, whatnotPrice, loading: false }
        : r));
    } catch {
      setResults(prev => prev.map(r => r.asin === asin
        ? { ...r, error: 'Failed to fetch', loading: false }
        : r));
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
          {/* Search panel */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5 mb-6 max-w-2xl">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5">Amazon vs Whatnot Profit Analyzer</h2>
            <p className="text-xs text-slate-400 mb-4">Compares Amazon FBM · FBA · Whatnot to find the most profitable channel.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">ASIN *</label>
                <input value={asinInput} onChange={e => setAsinInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') analyze(); }}
                  placeholder="B08N5WRWNW" className={`w-full ${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Your Cost ($)</label>
                <input type="number" step="0.01" min="0" value={costInput}
                  onChange={e => setCostInput(e.target.value)}
                  placeholder="e.g. 12.00" className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Whatnot Price ($)</label>
                <input type="number" step="0.01" min="0" value={wnInput}
                  onChange={e => setWnInput(e.target.value)}
                  placeholder="e.g. 25.00" className={`w-full ${inputCls}`} />
              </div>
            </div>
            <button onClick={analyze} disabled={!asinInput.trim()}
              className="w-full sm:w-auto px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40">
              Analyze
            </button>
          </div>

          {/* Results */}
          <div className="space-y-4 max-w-5xl">
            {results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <svg className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No items analyzed yet</p>
                <p className="text-slate-400 text-xs mt-1">Enter an ASIN with your cost to compare FBM · FBA · Whatnot</p>
              </div>
            )}

            {results.map(r => {
              const opp = OPP_STYLE[r.opportunity?.label] ?? OPP_STYLE['No BSR'];
              const calc = calcProfits(r);
              const fbmProfit   = calc?.fbmProfit   ?? null;
              const fbaProfit   = calc?.fbaProfit   ?? null;
              const wnProfit    = calc?.wnProfit    ?? null;
              const fbmOverweight = calc?.fbmOverweight ?? false;
              const best        = calc?.best        ?? null;

              const fbmMargin = fbmProfit != null && r.price       ? (fbmProfit / r.price)        * 100 : null;
              const fbaMargin = fbaProfit != null && r.price       ? (fbaProfit / r.price)        * 100 : null;
              const wnMargin  = wnProfit  != null && r.whatnotPrice ? (wnProfit  / r.whatnotPrice) * 100 : null;

              const verdictMap: Record<string, { icon: string; msg: string; cls: string }> = {
                fbm: { icon: '📦', msg: `Amazon FBM wins — ship it yourself, keep more margin`, cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
                fba: { icon: '🏭', msg: `Amazon FBA wins — let Amazon fulfill, Prime eligible`, cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
                wn:  { icon: '🎯', msg: `Whatnot wins — sell live, lower fees overall`,         cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
              };
              const verdict = best ? verdictMap[best] : null;

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
                      <button onClick={() => remove(r.asin)} className="text-slate-300 hover:text-red-400 text-lg leading-none">✕</button>
                    </div>
                  ) : (
                    <div className="p-5">
                      {/* Product header */}
                      <div className="flex gap-4 mb-4">
                        {r.image && (
                          <img src={r.image} alt={r.title} className="w-16 h-16 object-contain rounded-lg border border-slate-100 dark:border-slate-700 bg-white flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-mono text-slate-400">{r.asin}</p>
                              <a href={r.url} target="_blank" rel="noopener noreferrer"
                                className="text-sm font-bold text-slate-900 dark:text-white hover:text-orange-500 transition-colors line-clamp-2 leading-snug">
                                {r.title}
                              </a>
                              <div className="flex items-center gap-2 flex-wrap">
                                {r.brand && <p className="text-xs text-slate-400">{r.brand}</p>}
                                {r.weight && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                                    {r.weight}
                                  </span>
                                )}
                                {r.fba && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                    FBA {r.fba.tier} · ${r.fba.fee.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => remove(r.asin)} className="text-slate-300 hover:text-red-400 text-lg leading-none flex-shrink-0">✕</button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {r.bsr != null && (
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                BSR #{r.bsr.toLocaleString()} {r.bsrCategory ? `· ${r.bsrCategory}` : ''}
                              </span>
                            )}
                            {r.estimatedMonthlySales != null && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                ~{r.estimatedMonthlySales.toLocaleString()} sold/mo
                              </span>
                            )}
                            {r.opportunity?.label && (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${opp.bg} ${opp.text} ${opp.border}`}>
                                <span className={`w-1 h-1 rounded-full ${opp.dot}`} />
                                {r.opportunity.label} demand · {r.reviews?.toLocaleString()} reviews · ⭐{r.rating}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── 3-column profit comparison ── */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                        {/* Amazon FBM */}
                        <div className={`rounded-xl border p-3.5 ${fbmOverweight ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' : best === 'fbm' ? 'border-orange-400 dark:border-orange-600 bg-orange-100 dark:bg-orange-900/30 ring-2 ring-orange-300 dark:ring-orange-700' : 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10'}`}>
                          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">Amazon FBM</span>
                            {best === 'fbm' && !fbmOverweight && <span className="text-[10px] font-black px-1.5 py-0.5 bg-orange-500 text-white rounded-full">BEST</span>}
                            {fbmOverweight && <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-500 text-white rounded-full">OVER 5 LBS</span>}
                          </div>
                          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                              <span>Sale price</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Amazon fee (15%)</span>
                              <span className="text-red-500">{r.price != null ? `−$${(r.price * AMAZON_FEE_PCT).toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>FBM shipping{fbmOverweight ? ` (${r.weightLbs!.toFixed(1)} lbs)` : ' (≤5 lbs)'}</span>
                              {fbmOverweight
                                ? <span className="text-amber-500 font-bold">Unknown</span>
                                : <span className="text-red-500">−${FBM_SHIP_LIGHT.toFixed(2)}</span>}
                            </div>
                            {r.yourCost != null && (
                              <div className="flex justify-between">
                                <span>Your cost</span>
                                <span className="text-red-500">−${r.yourCost.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                              <span className="font-bold">Net profit</span>
                              <span className={`font-black text-sm ${fbmOverweight ? 'text-amber-500' : fbmProfit != null ? fbmProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' : 'text-slate-400'}`}>
                                {fbmOverweight ? 'Unknown' : fbmProfit != null ? fmt(fbmProfit) : r.yourCost == null ? 'Add cost' : '—'}
                              </span>
                            </div>
                            {fbmMargin != null && !fbmOverweight && (
                              <div className="flex justify-between text-[10px]">
                                <span>Margin</span>
                                <span className={fbmMargin >= 0 ? 'text-emerald-500' : 'text-red-400'}>{fbmMargin.toFixed(1)}%</span>
                              </div>
                            )}
                            {!fbmOverweight && fbmProfit != null && fbmProfit > 0 && r.estimatedMonthlySales != null && (
                              <div className="flex justify-between text-[10px] border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                                <span className="font-bold text-violet-600 dark:text-violet-400">Est. mo. profit</span>
                                <span className="font-black text-violet-600 dark:text-violet-400">~${(fbmProfit * r.estimatedMonthlySales).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Amazon FBA */}
                        <div className={`rounded-xl border p-3.5 ${best === 'fba' ? 'border-blue-400 dark:border-blue-600 bg-blue-100 dark:bg-blue-900/30 ring-2 ring-blue-300 dark:ring-blue-700' : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10'}`}>
                          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">Amazon FBA</span>
                            {best === 'fba' && <span className="text-[10px] font-black px-1.5 py-0.5 bg-blue-500 text-white rounded-full">BEST</span>}
                            {r.fba && <span className="text-[10px] text-slate-400 dark:text-slate-500">{r.fba.tier}</span>}
                          </div>
                          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                              <span>Sale price</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Amazon fee (15%)</span>
                              <span className="text-red-500">{r.price != null ? `−$${(r.price * AMAZON_FEE_PCT).toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>FBA fulfillment</span>
                              {r.fba
                                ? <span className="text-red-500">−${r.fba.fee.toFixed(2)}</span>
                                : <span className="text-slate-400">No weight found</span>}
                            </div>
                            <div className="flex justify-between text-slate-300 dark:text-slate-600">
                              <span>Shipping (Amazon ships)</span>
                              <span>$0.00</span>
                            </div>
                            {r.yourCost != null && (
                              <div className="flex justify-between">
                                <span>Your cost</span>
                                <span className="text-red-500">−${r.yourCost.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                              <span className="font-bold">Net profit</span>
                              <span className={`font-black text-sm ${fbaProfit != null ? fbaProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' : 'text-slate-400'}`}>
                                {fbaProfit != null ? fmt(fbaProfit) : r.yourCost == null ? 'Add cost' : r.fba == null ? 'No weight' : '—'}
                              </span>
                            </div>
                            {fbaMargin != null && (
                              <div className="flex justify-between text-[10px]">
                                <span>Margin</span>
                                <span className={fbaMargin >= 0 ? 'text-emerald-500' : 'text-red-400'}>{fbaMargin.toFixed(1)}%</span>
                              </div>
                            )}
                            {fbaProfit != null && fbaProfit > 0 && r.estimatedMonthlySales != null && (
                              <div className="flex justify-between text-[10px] border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                                <span className="font-bold text-violet-600 dark:text-violet-400">Est. mo. profit</span>
                                <span className="font-black text-violet-600 dark:text-violet-400">~${(fbaProfit * r.estimatedMonthlySales).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </div>
                            )}
                          </div>
                          {r.fba && (
                            <p className="text-[10px] text-slate-400 mt-2 leading-tight">⚠ Tier estimated from weight. Verify in Seller Central if dimensions are large.</p>
                          )}
                        </div>

                        {/* Whatnot */}
                        <div className={`rounded-xl border p-3.5 ${best === 'wn' ? 'border-yellow-400 dark:border-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 ring-2 ring-yellow-300 dark:ring-yellow-700' : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10'}`}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">Whatnot</span>
                            {best === 'wn' && <span className="text-[10px] font-black px-1.5 py-0.5 bg-yellow-500 text-white rounded-full">BEST</span>}
                          </div>
                          <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex justify-between">
                              <span>Sale price</span>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{r.whatnotPrice != null ? `$${r.whatnotPrice.toFixed(2)}` : 'Add WN price'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Commission (8%)</span>
                              <span className="text-red-500">{r.whatnotPrice != null ? `−$${(r.whatnotPrice * WN_COMMISSION).toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Transaction fee</span>
                              <span className="text-red-500">−$0.30</span>
                            </div>
                            <div className="flex justify-between text-slate-300 dark:text-slate-600">
                              <span>Shipping (buyer pays)</span>
                              <span>$0.00</span>
                            </div>
                            {r.yourCost != null && (
                              <div className="flex justify-between">
                                <span>Your cost</span>
                                <span className="text-red-500">−${r.yourCost.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                              <span className="font-bold">Net profit</span>
                              <span className={`font-black text-sm ${wnProfit != null ? wnProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' : 'text-slate-400'}`}>
                                {wnProfit != null ? fmt(wnProfit) : r.yourCost == null ? 'Add cost' : 'Add WN price'}
                              </span>
                            </div>
                            {wnMargin != null && (
                              <div className="flex justify-between text-[10px]">
                                <span>Margin</span>
                                <span className={wnMargin >= 0 ? 'text-emerald-500' : 'text-red-400'}>{wnMargin.toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Verdict */}
                      {verdict && (
                        <div className={`mt-3 rounded-lg px-4 py-2.5 text-xs font-bold flex items-center gap-2 ${verdict.cls}`}>
                          <span>{verdict.icon}</span>
                          {verdict.msg}
                          {fbmProfit != null && fbaProfit != null && wnProfit != null && (() => {
                            const profits = { fbm: fbmProfit, fba: fbaProfit, wn: wnProfit };
                            const vals = Object.values(profits);
                            const max = Math.max(...vals);
                            const second = vals.sort((a,b) => b-a)[1];
                            return ` — $${(max - second).toFixed(2)} more per unit`;
                          })()}
                        </div>
                      )}
                      {fbmOverweight && !r.fba && (
                        <div className="mt-3 rounded-lg px-4 py-2.5 text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center gap-2">
                          ⚠️ FBM rate unknown — item exceeds 5 lbs. FBA may be a better option since Amazon handles fulfillment.
                        </div>
                      )}
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
