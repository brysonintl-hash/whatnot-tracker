'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';
import type { HDProduct } from '@/app/api/homedepot/route';

type Session = { username: string; role: Role; name: string };

const ALLOWED: Role[] = ['admin', 'manager', 'host'];

function PriceTag({ price, originalPrice }: { price: number | null; originalPrice: number | null }) {
  const onSale = originalPrice != null && price != null && originalPrice > price;
  if (price == null) return <span className="text-sm text-slate-400">—</span>;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-black text-orange-500">${price.toFixed(2)}</span>
      {onSale && (
        <span className="text-sm text-slate-400 line-through">${originalPrice!.toFixed(2)}</span>
      )}
      {onSale && (
        <span className="text-[10px] font-black px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
          SALE
        </span>
      )}
    </div>
  );
}

function ProductCard({ p }: { p: HDProduct }) {
  const onSale = p.originalPrice != null && p.price != null && p.originalPrice > p.price;
  const savings = onSale ? p.originalPrice! - p.price! : 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
      {/* Image */}
      <div className="relative bg-slate-50 dark:bg-slate-700 flex items-center justify-center h-48">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image}
            alt={p.name}
            className="max-h-44 max-w-full object-contain p-3"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="text-4xl opacity-20">🏠</div>
        )}
        {onSale && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
            SAVE ${savings.toFixed(2)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Brand + Model */}
        <div className="flex items-center gap-2 flex-wrap">
          {p.brand && (
            <span className="text-[10px] font-black uppercase tracking-wide text-orange-500">{p.brand}</span>
          )}
          {p.model && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              {p.model}
            </span>
          )}
        </div>

        {/* Name */}
        <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-3 flex-1">
          {p.name}
        </p>

        {/* Price */}
        <PriceTag price={p.price} originalPrice={p.originalPrice} />

        {/* View on HD button */}
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-black text-sm rounded-xl py-2.5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View on Home Depot
        </a>
      </div>
    </div>
  );
}

export default function HomeDepotPage() {
  useTheme();
  const router = useRouter();
  const [session, setSession]   = useState<Session | null>(null);
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [products, setProducts] = useState<HDProduct[]>([]);
  const [error, setError]       = useState('');
  const [searched, setSearched] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(s => {
      if (!s?.role) { router.replace('/login'); return; }
      if (!ALLOWED.includes(s.role)) { router.replace('/dashboard'); return; }
      setSession(s);
    });
  }, [router]);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setProducts([]);
    setSearched(q);
    try {
      const res  = await fetch(`/api/homedepot?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error && !data.products?.length) {
        setError(data.error);
      } else {
        setProducts(data.products ?? []);
        if ((data.products ?? []).length === 0) {
          setError(`No products found for "${q}". Try a different model number or keyword.`);
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div>
            <h1 className="font-black text-slate-900 dark:text-white text-base leading-tight">Home Depot Search</h1>
            <p className="text-[11px] text-slate-400">Search by model number or product name</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Search bar */}
          <form onSubmit={search} className="max-w-2xl mx-auto mb-8">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Enter model # or product name… e.g. DCB609"
                  className="w-full pl-12 pr-4 py-4 text-base bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:border-orange-400 dark:focus:border-orange-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors shadow-sm"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-7 py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white font-black rounded-2xl transition-colors shadow-sm disabled:cursor-not-allowed text-base"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : 'Search'}
              </button>
            </div>

            {/* Quick tip */}
            {!searched && (
              <p className="text-center text-xs text-slate-400 mt-3">
                Tip: Search by model number (e.g. <button type="button" onClick={() => { setQuery('DCB609'); }} className="text-orange-500 font-bold hover:underline">DCB609</button>) for the most accurate results
              </p>
            )}
          </form>

          {/* Loading state */}
          {loading && (
            <div className="text-center py-16">
              <div className="w-16 h-16 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 font-semibold">Searching Home Depot…</p>
              <p className="text-xs text-slate-400 mt-1">This may take a few seconds</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex gap-4">
                <span className="text-2xl flex-shrink-0">⚠️</span>
                <div>
                  <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">No results</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && products.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {products.length} result{products.length !== 1 ? 's' : ''} for
                  <span className="ml-1 text-orange-500">&quot;{searched}&quot;</span>
                </p>
                <a
                  href={`https://www.homedepot.com/s/${encodeURIComponent(searched)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-orange-500 hover:text-orange-600 font-bold flex items-center gap-1"
                >
                  See all on HD.com
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {products.map(p => (
                  <ProductCard key={p.itemId || p.model || p.name} p={p} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && products.length === 0 && !searched && (
            <div className="text-center py-20">
              <div className="text-7xl mb-6">🏠</div>
              <h2 className="text-xl font-black text-slate-700 dark:text-slate-300 mb-2">Home Depot Product Search</h2>
              <p className="text-slate-400 text-sm max-w-xs mx-auto">
                Type a model number above to see price, sale price, and product image from Home Depot.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
