'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type Link = { id: string; title: string; url: string; category: string; addedBy: string; createdAt: string };

const CATEGORIES = ['Google Sheets', 'Google Docs', 'USPS', 'WhatNot', 'Other'];

const CAT_STYLE: Record<string, string> = {
  'Google Sheets': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  'Google Docs': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'USPS': 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  'WhatNot': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'Other': 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
};

const CAT_ICON: Record<string, string> = {
  ‘Google Sheets’: ‘📊’,
  ‘Google Docs’: ‘📄’,
  ‘USPS’: ‘📦’,
  ‘WhatNot’: ‘🛒’,
  ‘Other’: ‘🔗’,
};

export default function KnowledgePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Other');
  const [filter, setFilter] = useState('All');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || (s.role !== 'admin' && s.role !== 'manager')) { router.push('/login'); return; }
      setSession(s);
    });
    fetch('/api/knowledge').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setLinks(d);
      setLoading(false);
    });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), url: url.trim(), category }),
    });
    const data = await res.json();
    if (data.link) { setLinks(prev => [...prev, data.link]); setTitle(''); setUrl(''); setCategory('Other'); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this link?')) return;
    setDeletingId(id);
    await fetch('/api/knowledge', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setLinks(prev => prev.filter(l => l.id !== id));
    setDeletingId(null);
  }

  const allCats = ['All', ...CATEGORIES.filter(c => links.some(l => l.category === c))];
  const searchLower = search.toLowerCase();
  const displayed = links
    .filter(l => filter === 'All' || l.category === filter)
    .filter(l => !search || l.title.toLowerCase().includes(searchLower) || l.url.toLowerCase().includes(searchLower));

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Knowledge Base</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Add link */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
            <h2 className="font-bold text-slate-900 dark:text-white text-sm mb-4">Add New Link</h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Sales Sheet May"
                  required
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://docs.google.com/..."
                  required
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="md:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Adding...' : '+ Add Link'}
                </button>
              </div>
            </form>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search links..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          {/* Filter tabs */}
          {links.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {allCats.map(c => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    filter === c
                      ? 'bg-red-500 border-red-500 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-600'
                  }`}
                >
                  {c === 'All' ? `All (${links.length})` : `${CAT_ICON[c] || '🔗'} ${c}`}
                </button>
              ))}
            </div>
          )}

          {/* Links grid */}
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">Loading...</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <div className=”text-4xl mb-3”>📚</div>
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm">No links yet</p>
              <p className="text-slate-400 text-xs mt-1">Add Google Docs, Sheets, or any useful links above</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayed.map(link => (
                <div key={link.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col gap-3 group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CAT_STYLE[link.category] ?? CAT_STYLE['Other']}`}>
                          {CAT_ICON[link.category] || '🔗'} {link.category}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{link.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{link.url}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(link.id)}
                      disabled={deletingId === link.id}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0 disabled:opacity-30"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-red-600 transition-colors group/link"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    Open Link
                    <span className="ml-auto text-[9px] text-slate-400">Added by {link.addedBy}</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
