'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BrandPanel } from '@/components/auth/brand-panel';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin', manager: '/manager', employee: '/employee',
  shipper: '/shipper', host: '/host',
};

/* ─────────────────────────────────────────────────────────────
   Sign-in form
   ───────────────────────────────────────────────────────────── */

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.get('registered')) setSuccess('Account created! Wait for an admin to assign your role, then sign in.');
    const err = params.get('error');
    if (err === 'google_not_configured') setError('Google sign-in is not set up yet.');
    else if (err === 'google_email_unverified') setError('That Google account’s email is not verified. Please sign in another way.');
    else if (err === 'google_auth_failed') setError('Google sign-in failed. Please try again.');
    try {
      const saved = localStorage.getItem('sb_username');
      if (saved) { setUsername(saved); setRememberMe(true); }
    } catch {}
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (rememberMe) localStorage.setItem('sb_username', username);
      else localStorage.removeItem('sb_username');
    } catch {}
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (res.ok) {
      router.push(ROLE_HOME[data.role] ?? '/');
    } else {
      setError(data.error || 'Invalid credentials');
      setPassword(''); // auto-clear on wrong credentials
      setLoading(false);
    }
  }

  const field =
    'w-full rounded-full bg-slate-100 px-6 py-4 text-[15px] text-slate-900 placeholder:text-slate-400 ' +
    'border border-transparent outline-none transition-all ' +
    'focus:border-[#DC2626] focus:bg-white focus:ring-4 focus:ring-[#DC2626]/12';

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />

      {/* Right: form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        {/* Logo — only shown where the brand panel is hidden */}
        <div className="mb-10 flex items-center gap-3 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Stack Bargains" className="h-10 w-10 rounded-xl object-cover" />
          <span className="text-xl font-black tracking-tight text-slate-900">Stack Bargains</span>
        </div>

        <div className="mx-auto w-full max-w-[420px]">
          <h1 className="mb-9 text-center text-[34px] font-black tracking-tight text-slate-900">
            Sign in to Stack Bargains
          </h1>

          {success && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-emerald-50 px-5 py-3.5 text-[14px] font-medium text-emerald-700">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-rose-50 px-5 py-3.5 text-[14px] font-medium text-rose-700">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

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

            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
                required
                className={`${field} pr-14`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
              >
                {showPass
                  ? <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  : <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                }
              </button>
            </div>

            <div className="flex items-center justify-between px-1 pt-1">
              <label className="flex cursor-pointer select-none items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="h-[18px] w-[18px] cursor-pointer rounded-full border-slate-300 accent-[#DC2626]"
                />
                <span className="text-[14px] text-slate-600">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-[14px] font-medium text-slate-600 underline underline-offset-2 transition-colors hover:text-[#DC2626]">
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="mt-2 w-full rounded-full bg-[#DC2626] py-4 text-[15px] font-bold text-white shadow-lg shadow-[#DC2626]/25 transition-all hover:-translate-y-0.5 hover:bg-[#c01f1f] hover:shadow-xl hover:shadow-[#DC2626]/30 active:translate-y-0 active:shadow-md disabled:pointer-events-none disabled:opacity-45"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[14px] text-slate-400">Or login with</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <a
            href="/api/auth/google"
            className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white py-4 text-[15px] font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md active:translate-y-0"
          >
            <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            Google
          </a>

          <p className="mt-8 text-center text-[14px] text-slate-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-bold text-[#DC2626] hover:underline">Sign Up now</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
