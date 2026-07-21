'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Item = {
  rowIndex: number; imageUrl: string; upc: string; modelNum: string; asin: string;
  description: string; jz: number; old: number; newStock: number; amz: number;
  ws: number; wn: number; fbm: number; qty: number; retail: number; total: number;
};

type Session = { username: string; role: Role; name: string };

const emptyItem: Omit<Item, 'rowIndex'> = {
  imageUrl: '', upc: '', modelNum: '', asin: '', description: '',
  jz: 0, old: 0, newStock: 0, amz: 0, ws: 0, wn: 0, fbm: 0, qty: 0, retail: 0, total: 0,
};

function QtyBadge({ qty }: { qty: number }) {
  if (qty <= 0) return <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-bold">Out of Stock</span>;
  if (qty <= 5) return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">Low</span>;
  return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">In Stock</span>;
}

const PAGE_SIZE = 30;

export default function InventoryPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, 'rowIndex'>>(emptyItem);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);

  async function load() {
    const res = await fetch('/api/inventory');
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    load();
  }, []);

  useEffect(() => { setPage(1); }, [search, filter]);

  const filtered = items.filter(item => {
    const s = search.toLowerCase();
    const matchSearch = !search || item.modelNum.toLowerCase().includes(s) || item.description.toLowerCase().includes(s) || item.upc.includes(search) || item.asin.toLowerCase().includes(s);
    const matchFilter = filter === 'all' || (filter === 'low' && item.qty > 0 && item.qty <= 5) || (filter === 'out' && item.qty <= 0);
    return matchSearch && matchFilter;
  });

  const outOfStock = items.filter(i => i.qty <= 0).length;
  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5).length;
  const totalValue = items.reduce((s, i) => s + i.total, 0);
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openEdit(item: Item) { setForm({ ...item }); setEditing(item); setModal('edit'); }

  async function handleSave() {
    setSaving(true);
    if (modal === 'add') {
      await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    } else if (editing) {
      await fetch(`/api/inventory/${editing.rowIndex}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    }
    setModal(null); setSaving(false); load();
  }

  async function handleDelete(item: Item) {
    if (!confirm(`Delete "${item.modelNum || item.description}"?`)) return;
    await fetch(`/api/inventory/${item.rowIndex}`, { method: 'DELETE' });
    load();
  }

  function FF({ label, field, type = 'text' }: { label: string; field: keyof typeof form; type?: string }) {
    return (
      <div>
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">{label}</label>
        <input type={type} value={String(form[field])}
          onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Inventory</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          {session.role !== 'host' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setForm(emptyItem); setEditing(null); setModal('add'); }}
                className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Item
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-5">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Total Items</p>
              <p className="text-2xl font-black text-white">{items.length.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-red-500 rounded-xl shadow-sm p-5">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Out of Stock</p>
              <p className="text-2xl font-black text-red-500">{outOfStock.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-amber-400 rounded-xl shadow-sm p-5">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Low Stock (â‰¤5)</p>
              <p className="text-2xl font-black text-amber-500">{lowStock.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-4 border-l-emerald-500 rounded-xl shadow-sm p-5">
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Total Value</p>
              <p className="text-2xl font-black text-emerald-600">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input
              type="text" placeholder="Search model, description, UPC, ASIN..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 max-w-sm px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-slate-400"
            />
            <div className="flex gap-1">
              {(['all', 'low', 'out'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${filter === f ? 'bg-amber-400 border-amber-400 text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400'}`}>
                  {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {loading ? <div className="p-12 text-center text-slate-400">Loading inventory...</div> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      {['Model #', 'Description', 'UPC', 'ASIN', 'Avail. Qty', 'Status', 'Retail', 'Total Value', ''].map(h => (
                        <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 bg-slate-50 dark:bg-slate-900/50">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(item => (
                      <tr key={item.rowIndex} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-blue-500 font-bold">{item.modelNum}</td>
                        <td className="py-3 px-4 max-w-xs"><span className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 block">{item.description}</span></td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">{item.upc}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">{item.asin}</td>
                        <td className="py-3 px-4 text-center font-black text-lg text-white">{item.qty.toLocaleString()}</td>
                        <td className="py-3 px-4"><QtyBadge qty={item.qty} /></td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">${item.retail.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-black text-sm text-emerald-600">${item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="py-3 px-4">
                          {session.role !== 'host' && (
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-400/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDelete(item)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-12">No items found</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Showing {(page - 1) * PAGE_SIZE + 1}â€“{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} items
              </p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">
                  â† Prev
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === pageCount || Math.abs(n - page) <= 2)
                  .reduce<(number | string)[]>((acc, n, i, arr) => {
                    if (i > 0 && (n as number) - (arr[i - 1] as number) > 1) acc.push('...');
                    acc.push(n); return acc;
                  }, [])
                  .map((n, i) => n === '...' ? (
                    <span key={`e${i}`} className="px-2 py-1.5 text-slate-400 text-xs">â€¦</span>
                  ) : (
                    <button key={n} onClick={() => setPage(n as number)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${page === n ? 'bg-amber-400 border-amber-400 text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400'}`}>
                      {n}
                    </button>
                  ))}
                <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40">
                  Next â†’
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-black text-white">{modal === 'add' ? 'Add New Item' : 'Edit Item'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><FF label="Description" field="description" /></div>
              <FF label="Model #" field="modelNum" /><FF label="UPC" field="upc" />
              <FF label="ASIN" field="asin" /><FF label="Retail Price ($)" field="retail" type="number" />
              <FF label="Qty" field="qty" type="number" /><FF label="WhatNot (WN)" field="wn" type="number" />
              <FF label="WhatNot Shop (WS)" field="ws" type="number" /><FF label="Amazon (AMZ)" field="amz" type="number" />
              <FF label="FBM" field="fbm" type="number" /><FF label="JZ" field="jz" type="number" />
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold rounded-lg text-sm transition-colors disabled:opacity-50">{saving ? 'Saving...' : modal === 'add' ? 'Add Item' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
