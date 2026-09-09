'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandPanel } from '@/components/auth/brand-panel';

const field =
  'w-full rounded-full bg-slate-100 px-6 py-4 text-[15px] text-slate-900 placeholder:text-slate-400 ' +
  'border border-transparent outline-none transition-all ' +
  'focus:border-[#DC2626] focus:bg-white focus:ring-4 focus:ring-[#DC2626]/12';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setDone(true);
    else setError(data.error || 'Something went wrong');
  }

  if (!token) {
    return (
      <>
        <h1 className="mb-3 text-center text-[30px] font-black tracking-tight text-slate-900">Invalid link</h1>
        <p className="mb-9 text-center text-[15px] text-slate-500">
          This password reset link is missing its token. Request a new one to try again.
        </p>
        <Link
          href="/forgot-password"
          className="block w-full rounded-full bg-[#DC2626] py-4 text-center text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl active:translate-y-0"
        >
          Request a New Link
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="mb-3 text-center text-[30px] font-black tracking-tight text-slate-900">Password updated</h1>
        <p className="mb-9 text-center text-[15px] text-slate-500">
          Your password has been changed. Sign in with your new password.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="w-full rounded-full bg-[#DC2626] py-4 text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl active:translate-y-0"
        >
          Go to Sign In
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-[30px] font-black tracking-tight text-slate-900">Choose a new password</h1>
      <p className="mb-9 text-center text-[15px] text-slate-500">Make it at least 6 characters.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password"
          aria-label="New password"
          autoComplete="new-password"
          required
          className={field}
        />
        <input
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          aria-label="Confirm new password"
          autoComplete="new-password"
          required
          className={field}
        />

        {error && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50 px-5 py-3.5 text-[14px] font-medium text-rose-700">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="w-full rounded-full bg-[#DC2626] py-4 text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl hover:shadow-[#DC2626]/30 active:translate-y-0 active:shadow-md disabled:pointer-events-none disabled:opacity-45"
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Stack Bargains" className="h-10 w-10 rounded-xl object-cover" />
          <span className="text-xl font-black tracking-tight text-slate-900">Stack Bargains</span>
        </div>
        <div className="mx-auto w-full max-w-[420px]">
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
