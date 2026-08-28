'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

type ScriptItem = {
  modelNum: string;
  description: string;
  retail: number;
  imageUrl: string;
  qty: number;
};

type HistoryEntry = { item: ScriptItem; script: string; at: number };

export default function ScriptReaderPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [modelNum, setModelNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<HistoryEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [presenter, setPresenter] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager' && s.role !== 'host')) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  async function generate(numOverride?: string) {
    const num = (numOverride ?? modelNum).trim();
    if (!num || loading) return;
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch('/api/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelNum: num }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      const entry: HistoryEntry = { item: data.item, script: data.script, at: Date.now() };
      setCurrent(entry);
      setModelNum(data.item.modelNum);
      setHistory(prev => [entry, ...prev.filter(h => h.item.modelNum !== data.item.modelNum)].slice(0, 8));
    } catch {
      setError('Failed to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function loadFromHistory(entry: HistoryEntry) {
    setCurrent(entry);
    setModelNum(entry.item.modelNum);
    setError(null);
    setCopied(false);
  }

  async function copyScript() {
    if (!current) return;
    await navigator.clipboard.writeText(current.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Script Reader</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Lookup */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-1">What are you showing right now?</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Enter the model number and get a natural ~20 second script to read live.</p>
                <form onSubmit={e => { e.preventDefault(); generate(); }} className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={modelNum}
                    onChange={e => setModelNum(e.target.value)}
                    placeholder="e.g. DCE530B"
                    autoFocus
                    className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <button
                    type="submit"
                    disabled={loading || !modelNum.trim()}
                    className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors flex-shrink-0"
                  >
                    {loading ? 'Writing…' : 'Generate Script'}
                  </button>
                </form>
                {error && (
                  <div className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}
              </div>

              {/* Item + script */}
              {current && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                  <div className="flex items-start gap-4 mb-5">
                    {current.item.imageUrl ? (
                      <img src={current.item.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-600 flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-xs flex-shrink-0">No image</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white text-sm leading-snug">{current.item.description || current.item.modelNum}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[11px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{current.item.modelNum}</span>
                        {current.item.retail > 0 && (
                          <span className="text-[11px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">${current.item.retail.toFixed(2)}</span>
                        )}
                        {current.item.qty > 0 && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">{current.item.qty} in stock</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 p-5">
                    <p className="text-slate-800 dark:text-amber-50 text-lg leading-relaxed font-medium whitespace-pre-wrap">{current.script}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => generate(current.item.modelNum)}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Writing…' : 'Regenerate'}
                    </button>
                    <button
                      onClick={copyScript}
                      className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold transition-colors"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => setPresenter(true)}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors"
                    >
                      Presenter Mode
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Recent */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 h-fit">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Recent Items</h2>
              {history.length === 0 ? (
                <p className="text-xs text-slate-400">Scripts you generate this session will show up here for quick access.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <button
                      key={h.item.modelNum}
                      onClick={() => loadFromHistory(h)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        current?.item.modelNum === h.item.modelNum
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{h.item.description || h.item.modelNum}</div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">{h.item.modelNum}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Presenter mode overlay */}
      {presenter && current && (
        <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col p-8 md:p-16">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="text-amber-400 text-sm font-bold uppercase tracking-wide">{current.item.modelNum}</div>
              <div className="text-slate-300 text-lg font-bold mt-1">{current.item.description}</div>
              {current.item.retail > 0 && <div className="text-slate-500 text-sm mt-1">${current.item.retail.toFixed(2)}</div>}
            </div>
            <button
              onClick={() => setPresenter(false)}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
              aria-label="Exit presenter mode"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 flex items-center overflow-y-auto">
            <p className="text-white text-3xl md:text-5xl leading-snug font-bold whitespace-pre-wrap">{current.script}</p>
          </div>
          <div className="flex gap-3 mt-8">
            <button
              onClick={() => generate(current.item.modelNum)}
              disabled={loading}
              className="px-5 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {loading ? 'Writing…' : 'Regenerate'}
            </button>
            <button
              onClick={() => { setPresenter(false); setModelNum(''); inputRef.current?.focus(); }}
              className="px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-colors"
            >
              Next Item
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
