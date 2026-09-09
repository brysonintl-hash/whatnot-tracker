'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandPanel } from '@/components/auth/brand-panel';

const field =
  'w-full rounded-full bg-slate-100 px-6 py-4 text-[15px] text-slate-900 placeholder:text-slate-400 ' +
  'border border-transparent outline-none transition-all ' +
  'focus:border-[#DC2626] focus:bg-white focus:ring-4 focus:ring-[#DC2626]/12';

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // The endpoint always returns success — it never reveals whether a
    // username exists, so there's nothing to branch on here either.
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

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
          {sent ? (
            <>
              <h1 className="mb-3 text-center text-[30px] font-black tracking-tight text-slate-900">Check your email</h1>
              <p className="mb-9 text-center text-[15px] leading-relaxed text-slate-500">
                If an account with that username has an email on file, we've sent a link to reset the password.
                It expires in 1 hour.
              </p>
              <Link
                href="/login"
                className="block w-full rounded-full bg-[#DC2626] py-4 text-center text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl active:translate-y-0"
              >
                Back to Sign In
              </Link>
            </>
          ) : (
            <>
              <h1 className="mb-2 text-center text-[30px] font-black tracking-tight text-slate-900">Forgot your password?</h1>
              <p className="mb-9 text-center text-[15px] text-slate-500">
                Enter your username and we'll email you a link to reset it.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="username"
                  required
                  className={field}
                />
                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="w-full rounded-full bg-[#DC2626] py-4 text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl hover:shadow-[#DC2626]/30 active:translate-y-0 active:shadow-md disabled:pointer-events-none disabled:opacity-45"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>

              <p className="mt-8 text-center text-[14px] text-slate-500">
                Remembered it after all?{' '}
                <Link href="/login" className="font-bold text-[#DC2626] hover:underline">Back to Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
