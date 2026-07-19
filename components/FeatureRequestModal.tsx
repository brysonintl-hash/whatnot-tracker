'use client';

import { useState } from 'react';

interface Props {
  userName: string;
  onClose: () => void;
}

const CATEGORIES = ['New Feature', 'Improvement', 'Bug Fix', 'Other'] as const;
const PRIORITIES = [
  { label: 'Nice to have', sel: 'bg-slate-600 border-slate-600 text-white', unsel: 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800' },
  { label: 'Important',    sel: 'bg-amber-500 border-amber-500 text-white', unsel: 'border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-800' },
  { label: 'Critical',     sel: 'bg-red-500 border-red-500 text-white',     unsel: 'border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 bg-white dark:bg-slate-800' },
] as const;

export default function FeatureRequestModal({ userName, onClose }: Props) {
  const [title, setTitle]       = useState('');
  const [category, setCategory] = useState('New Feature');
  const [description, setDesc]  = useState('');
  const [priority, setPriority] = useState('Important');
  const [status, setStatus]     = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errMsg, setErrMsg]     = useState('');

  async function submit() {
    if (!title.trim() || !description.trim()) { setErrMsg('Please fill in the title and description.'); return; }
    setErrMsg('');
    setStatus('submitting');
    try {
      const res = await fetch('/api/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description, priority }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Submission failed'); }
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-black text-lg leading-tight">Request a Feature</h2>
                <p className="text-amber-100 text-xs mt-0.5">Help us build a better app</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {status === 'success' ? (
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">Request Submitted!</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Thanks {userName.split(' ')[0]}! Your request has been logged and we&apos;ll review it soon.
            </p>
            <button onClick={onClose} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors">
              Done
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">

            {/* Feature title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Feature Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Export orders to QuickBooks"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      category === c
                        ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
                    }`}
                  >{c}</button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                placeholder="Describe the feature and how it would help your workflow..."
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button key={p.label} onClick={() => setPriority(p.label)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${priority === p.label ? p.sel : p.unsel}`}
                  >{p.label}</button>
                ))}
              </div>
            </div>

            {/* Error */}
            {errMsg && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{errMsg}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1 pb-2">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors bg-white dark:bg-transparent"
              >Cancel</button>
              <button onClick={submit} disabled={status === 'submitting'}
                className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white transition-colors flex items-center justify-center gap-2"
              >
                {status === 'submitting' ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Submitting...</>
                ) : 'Submit Request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
