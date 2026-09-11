'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import type { HeroSlide } from '@/lib/storefrontStore';
import type { Deal } from '@/lib/dealsStore';
import { resizeImage } from '@/lib/clientImage';

type Session = { username: string; role: Role; name: string };

const emptyDeal: Omit<Deal, 'id'> = {
  sku: '', brand: '', line: '', name: '', image: '', specs: [], rating: 5, reviews: 0, price: 0, wasPrice: 0, description: '',
};

function discountOf(deal: { price: number; wasPrice: number }): number {
  return deal.wasPrice > deal.price ? Math.round(((deal.wasPrice - deal.price) / deal.wasPrice) * 100) : 0;
}

export default function StorefrontPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || s.role !== 'admin') { router.push('/login'); return; }
      setSession(s);
    });
  }, []);

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Storefront</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
          <BannerSection />
          <DealsSection />
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Homepage banner — one editable slide per carousel position.
// ---------------------------------------------------------------------

function BannerSection() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch('/api/storefront').then(r => r.ok ? r.json() : null).then(data => {
      if (Array.isArray(data?.heroSlides)) setSlides(data.heroSlides);
      setLoading(false);
    });
  }, []);

  function updateSlide(i: number, patch: Partial<HeroSlide>) {
    setSlides(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleFile(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg({ type: 'err', text: 'Please choose an image file.' }); return; }
    setMsg(null);
    setProcessingIndex(i);
    try {
      const dataUrl = await resizeImage(file, 1600);
      updateSlide(i, { image: dataUrl });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not process that image.' });
    }
    setProcessingIndex(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/storefront', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heroSlides: slides }),
    });
    const data = await res.json();
    setMsg(res.ok ? { type: 'ok', text: 'Banner slides updated — live on the homepage now.' } : { type: 'err', text: data.error || 'Failed to save.' });
    setSaving(false);
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="font-bold text-slate-900 dark:text-white text-sm">Homepage Banner</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          The 4-slide carousel at the top of the homepage. Set a photo, caption, and status tag for each slide — changes go live immediately, no deploy needed.
        </p>
      </div>

      <div className="p-6 space-y-5">
        {msg && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
            {msg.text}
          </div>
        )}

        {loading ? (
          <div className="text-center text-slate-400 py-8">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {slides.map((slide, i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Slide {i + 1}</p>
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-3">
                  {slide.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400 px-4 text-center">Default placeholder art</span>
                  )}
                </div>
                <input ref={el => { fileRefs.current[i] = el; }} type="file" accept="image/*" onChange={e => handleFile(i, e)} className="hidden" />
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => fileRefs.current[i]?.click()}
                    disabled={processingIndex === i}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {processingIndex === i ? 'Processing…' : 'Choose Image…'}
                  </button>
                  {slide.image && (
                    <button
                      type="button"
                      onClick={() => updateSlide(i, { image: null })}
                      className="px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="...or paste an image link"
                  value={slide.image?.startsWith('data:') ? '' : slide.image ?? ''}
                  onChange={e => updateSlide(i, { image: e.target.value || null })}
                  className="w-full mb-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <input
                  type="text"
                  placeholder="Caption, e.g. Verified Pro Stock: Pallet #409B"
                  value={slide.label}
                  onChange={e => updateSlide(i, { label: e.target.value })}
                  className="w-full mb-2 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <input
                  type="text"
                  placeholder="Status tag, e.g. In Stock"
                  value={slide.status}
                  onChange={e => updateSlide(i, { status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Banner Slides'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hot Deals — the product grid shown in "Hot Deals Ending Soon".
// ---------------------------------------------------------------------

function DealsSection() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState<Omit<Deal, 'id'>>(emptyDeal);
  const [specsText, setSpecsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch('/api/deals');
    const data = await res.json();
    setDeals(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setForm(emptyDeal); setSpecsText(''); setEditing(null); setError(''); setModal('add'); }
  function openEdit(deal: Deal) { setForm({ ...deal }); setSpecsText(deal.specs.join(', ')); setEditing(deal); setError(''); setModal('edit'); }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    setError('');
    setProcessingImage(true);
    try {
      const dataUrl = await resizeImage(file, 1000);
      setForm(f => ({ ...f, image: dataUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process that image.');
    }
    setProcessingImage(false);
  }

  async function handleSave() {
    setError('');
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    if (!form.sku.trim()) { setError('SKU is required.'); return; }
    if (form.price < 0 || form.wasPrice < 0) { setError('Prices can’t be negative.'); return; }

    setSaving(true);
    const payload = { ...form, specs: specsText.split(',').map(s => s.trim()).filter(Boolean) };
    const res = modal === 'add'
      ? await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch(`/api/deals/${editing!.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    if (res.ok) {
      setModal(null);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to save.');
    }
    setSaving(false);
  }

  async function handleDelete(deal: Deal) {
    if (!confirm(`Remove "${deal.name}" from Hot Deals?`)) return;
    await fetch(`/api/deals/${deal.id}`, { method: 'DELETE' });
    load();
  }

  function FF({ label, field, type = 'text', span = false }: { label: string; field: keyof typeof form; type?: string; span?: boolean }) {
    return (
      <div className={span ? 'col-span-2' : ''}>
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">{label}</label>
        <input
          type={type}
          value={String(form[field] ?? '')}
          onChange={e => setForm(f => ({ ...f, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))}
          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white text-sm">Hot Deals</h2>
          <p className="text-xs text-slate-400 mt-0.5">The products shown in "Hot Deals Ending Soon" on the homepage.</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors shadow-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Deal
        </button>
      </div>

      <div className="overflow-x-auto">
        {loading ? <div className="p-12 text-center text-slate-400">Loading deals...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                {['Photo', 'Product', 'Price', 'Discount', 'Rating', ''].map(h => (
                  <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4 bg-slate-50 dark:bg-slate-900/50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => (
                <tr key={deal.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="py-3 px-4">
                    {deal.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={deal.image} alt="" className="h-12 w-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-700" />
                    )}
                  </td>
                  <td className="py-3 px-4 max-w-sm">
                    <span className="block font-mono text-[10px] uppercase text-slate-400">{deal.brand}{deal.brand && deal.line ? ' · ' : ''}{deal.line}</span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{deal.name}</span>
                    <span className="block font-mono text-[10px] text-slate-400">SKU {deal.sku}</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-black text-slate-900 dark:text-white">${deal.price.toFixed(2)}</span>
                    {deal.wasPrice > deal.price && (
                      <span className="ml-1.5 text-xs text-slate-400 line-through">${deal.wasPrice.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {discountOf(deal) > 0 ? (
                      <span className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full text-[10px] font-bold">-{discountOf(deal)}%</span>
                    ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">{deal.rating}★ ({deal.reviews})</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(deal)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(deal)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-400/10 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {deals.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-12">No deals yet — click "Add Deal" to add your first product.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="font-black text-slate-900 dark:text-white">{modal === 'add' ? 'Add New Deal' : 'Edit Deal'}</h2>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                  {error}
                </div>
              )}

              {/* Photo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">Photo</label>
                <div className="flex items-center gap-3">
                  {form.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.image} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={processingImage}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {processingImage ? 'Processing…' : 'Choose Image…'}
                  </button>
                  <input
                    type="text"
                    placeholder="...or paste an image link"
                    value={form.image.startsWith('data:') ? '' : form.image}
                    onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                    className="flex-1 min-w-0 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><FF label="Product Name" field="name" span /></div>
                <FF label="Brand" field="brand" />
                <FF label="Line / Subtitle" field="line" />
                <FF label="SKU" field="sku" />
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">Spec Badges</label>
                  <input
                    type="text"
                    placeholder="e.g. 2,000 RPM, 820 UWO, 2× Batt"
                    value={specsText}
                    onChange={e => setSpecsText(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Comma-separated, shown as small tags on the card.</p>
                </div>
                <FF label="Price ($)" field="price" type="number" />
                <FF label="Original Price ($)" field="wasPrice" type="number" />
                <FF label="Rating (0–5)" field="rating" type="number" />
                <FF label="Review Count" field="reviews" type="number" />
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-1.5">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50">{saving ? 'Saving...' : modal === 'add' ? 'Add Deal' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
