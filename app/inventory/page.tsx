'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';

type Item = {
  rowIndex: number; imageUrl: string; upc: string; modelNum: string; asin: string;
  description: string; jz: number; old: number; newStock: number; amz: number;
  ws: number; wn: number; fbm: number; qty: number; retail: number; total: number;
};

const emptyItem: Omit<Item, 'rowIndex'> = {
  imageUrl: '', upc: '', modelNum: '', asin: '', description: '',
  jz: 0, old: 0, newStock: 0, amz: 0, ws: 0, wn: 0, fbm: 0, qty: 0, retail: 0, total: 0,
};

function QtyBadge({ qty }: { qty: number }) {
  if (qty <= 0) return <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-xs font-bold">Out of Stock</span>;
  if (qty <= 5) return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-xs font-bold">Low ({qty})</span>;
  return <span className="bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-xs font-bold">In Stock ({qty})</span>;
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, 'rowIndex'>>(emptyItem);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/inventory');
    setItems(Array.isArray(await res.json()) ? await fetch('/api/inventory').then(r => r.json()) : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(item => {
    const s = search.toLowerCase();
    const matchSearch = !search || item.modelNum.toLowerCase().includes(s) || item.description.toLowerCase().includes(s) || item.upc.includes(search) || item.asin.toLowerCase().includes(s);
    const matchFilter = filter === 'all' || (filter === 'low' && item.qty > 0 && item.qty <= 5) || (filter === 'out' && item.qty <= 0);
    return matchSearch && matchFilter;
  });

  const outOfStock = items.filter(i => i.qty <= 0).length;
  const lowStock = items.filter(i => i.qty > 0 && i.qty <= 5).length;
  const totalValue = items.reduce((s, i) => s + i.total, 0);

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
        <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
        <input type={type} value={String(form[field])}
          onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          className="w-full text-sm" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Inventory</h1>
            <p className="text-gray-500 text-sm">{items.length} items tracked</p>
          </div>
          <button onClick={() => { setForm(emptyItem); setEditing(null); setModal('add'); }} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Item
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card p-4"><p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Items</p><p className="text-2xl font-black text-gray-900">{items.length}</p></div>
          <div className="card p-4 border-l-4 border-red-500"><p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Out of Stock</p><p className="text-2xl font-black text-red-600">{outOfStock}</p></div>
          <div className="card p-4 border-l-4 border-amber-400"><p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Low Stock (≤5)</p><p className="text-2xl font-black text-amber-600">{lowStock}</p></div>
          <div className="card p-4 border-l-4 border-green-500"><p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Value</p><p className="text-2xl font-black text-green-600">${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p></div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input type="text" placeholder="Search model, description, UPC, ASIN..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-48 max-w-sm text-sm" />
          <div className="flex gap-1">
            {(['all', 'low', 'out'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${filter === f ? 'bg-amber-400 border-amber-400 text-gray-900' : 'bg-white border-gray-300 text-gray-600 hover:border-amber-400'}`}>
                {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? <div className="p-12 text-center text-gray-400">Loading inventory...</div> : (
              <table>
                <thead><tr>
                  <th>Model #</th><th>Description</th><th>UPC</th><th>ASIN</th>
                  <th className="text-center">Available Qty</th>
                  <th>Stock Status</th><th className="text-right">Retail</th><th className="text-right">Total Value</th><th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.rowIndex}>
                      <td className="font-mono text-xs text-blue-600 font-bold">{item.modelNum}</td>
                      <td className="max-w-xs"><span className="text-xs text-gray-600 line-clamp-2 block">{item.description}</span></td>
                      <td className="font-mono text-xs text-gray-400">{item.upc}</td>
                      <td className="font-mono text-xs text-gray-400">{item.asin}</td>
                      <td className="text-center font-black text-lg text-gray-900">{item.qty}</td>
                      <td><QtyBadge qty={item.qty} /></td>
                      <td className="text-right font-semibold">${item.retail.toFixed(2)}</td>
                      <td className="text-right font-black text-green-600">${item.total.toFixed(2)}</td>
                      <td>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(item)} className="text-gray-400 hover:text-amber-600 p-1.5 rounded hover:bg-amber-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(item)} className="text-gray-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-12">No items found</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="font-black text-gray-900">{modal === 'add' ? 'Add New Item' : 'Edit Item'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
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
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
              <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : modal === 'add' ? 'Add Item' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
