'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';
import { resizeImage } from '@/lib/clientImage';

type Session = { username: string; role: Role; name: string };

export default function StorefrontSettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [savedImage, setSavedImage] = useState<string | null>(null); // what's live right now
  const [pendingImage, setPendingImage] = useState<string | null>(null); // picked/pasted, not saved yet
  const [linkInput, setLinkInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || s.role !== 'admin') { router.push('/login'); return; }
      setSession(s);
    });
    fetch('/api/storefront').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.heroImage) setSavedImage(data.heroImage);
    });
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg({ type: 'err', text: 'Please choose an image file.' }); return; }
    setMsg(null);
    setProcessing(true);
    try {
      const dataUrl = await resizeImage(file, 1600);
      setPendingImage(dataUrl);
      setLinkInput('');
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not process that image.' });
    }
    setProcessing(false);
  }

  function useLink() {
    if (!/^https?:\/\/.+/i.test(linkInput.trim())) {
      setMsg({ type: 'err', text: 'Enter a full image link starting with http:// or https://' });
      return;
    }
    setMsg(null);
    setPendingImage(linkInput.trim());
  }

  async function save(image: string | null) {
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/storefront', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ heroImage: image }),
    });
    const data = await res.json();
    if (res.ok) {
      setSavedImage(image);
      setPendingImage(null);
      setLinkInput('');
      setMsg({ type: 'ok', text: image ? 'Banner image updated — live on the homepage now.' : 'Reverted to the default banner design.' });
    } else {
      setMsg({ type: 'err', text: data.error || 'Failed to save.' });
    }
    setSaving(false);
  }

  const preview = pendingImage ?? savedImage;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Storefront Banner</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Homepage Hero Image</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Replaces the placeholder graphic in the featured-stock banner on the storefront homepage. Changes go live immediately — no developer or deploy needed.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {msg && (
                <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                  {msg.text}
                </div>
              )}

              {/* Preview */}
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Preview</p>
                <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="Hero banner preview" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400 px-4 text-center">No custom image set — the homepage is showing its default design.</span>
                  )}
                  {pendingImage && (
                    <span className="absolute left-2 top-2 rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow">Not saved yet</span>
                  )}
                </div>
              </div>

              {/* Upload */}
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Upload a photo</p>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={processing}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing…' : 'Choose Image…'}
                </button>
                <p className="text-xs text-slate-400 mt-2">
                  Works with a file from your computer, phone, or a folder synced from Google Drive — anywhere you can pick a file from. It’s resized automatically.
                </p>
              </div>

              {/* Or a link */}
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Or paste an image link</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linkInput}
                    onChange={e => setLinkInput(e.target.value)}
                    placeholder="https://…"
                    className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <button
                    type="button"
                    onClick={useLink}
                    disabled={!linkInput.trim()}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Use Link
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Any public image URL works — for example a Google Drive file shared as "Anyone with the link" using its direct-view link.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => save(null)}
                  disabled={saving || !savedImage}
                  className="px-4 py-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Remove Custom Image
                </button>
                <button
                  type="button"
                  onClick={() => pendingImage && save(pendingImage)}
                  disabled={saving || !pendingImage}
                  className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Banner Image'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
