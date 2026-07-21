'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin', manager: '/manager', employee: '/employee',
  shipper: '/shipper',
  host: '/host',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.get('registered')) setSuccess('Account created! Wait for an admin to assign your role, then sign in.');
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
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
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#080808' }}>

      {/* ── Ambient glow blobs ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[700px] h-[700px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #cc1111 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute -bottom-48 -right-32 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #990000 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ff3333 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* ── Grid texture overlay ── */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* ── Main content ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="w-[148px] h-[148px] rounded-2xl overflow-hidden shadow-2xl"
            style={{ boxShadow: '0 0 60px rgba(204,17,17,0.5), 0 20px 40px rgba(0,0,0,0.6)' }}>
            <img src="/logo.svg" alt="Stack Bargains" className="w-full h-full object-cover" />
          </div>
          <p className="mt-4 text-white/30 text-xs font-medium tracking-[0.2em] uppercase">Logistics Platform</p>
        </div>

        {/* Glass card */}
        <div className="w-full max-w-[420px] rounded-3xl p-8 relative"
          style={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}>

          {/* Card top shine */}
          <div className="absolute inset-x-0 top-0 h-px rounded-t-3xl"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />

          <h2 className="text-2xl font-black text-white text-center mb-1">Welcome back</h2>
          <p className="text-white/35 text-sm text-center mb-7">Sign in to your account</p>

          {success && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium mb-5"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(204,17,17,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(204,17,17,0.1)'; }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full pl-10 pr-12 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => { e.currentTarget.style.border = '1px solid rgba(204,17,17,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(204,17,17,0.1)'; }}
                  onBlur={e => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
                style={{ background: 'rgba(204,17,17,0.1)', border: '1px solid rgba(204,17,17,0.25)', color: '#f87171' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full font-black py-3.5 rounded-xl text-sm text-white transition-all mt-1 relative overflow-hidden group"
              style={{
                background: loading || !username || !password
                  ? 'rgba(204,17,17,0.4)'
                  : 'linear-gradient(135deg, #e01515 0%, #cc1111 50%, #aa0d0d 100%)',
                boxShadow: loading || !username || !password ? 'none' : '0 4px 20px rgba(204,17,17,0.4)',
              }}
            >
              <span className="relative z-10">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In →'}
              </span>
              {/* Shine sweep on hover */}
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%)' }} />
            </button>
          </form>

          <p className="text-center text-xs text-white/25 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-bold hover:text-white/50 transition-colors" style={{ color: '#f87171' }}>
              Register
            </Link>
          </p>
        </div>

        <p className="mt-6 text-white/15 text-xs text-center">Stack Bargains · v2.0</p>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
              <img src="/logo.svg" alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-white/20 text-xs">© 2025 Stack Bargains. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-5">
            <span className="text-white/15 text-xs">Powered by Railway</span>
            <span className="w-px h-3 bg-white/10" />
            <a href="#" className="text-white/20 hover:text-white/40 text-xs transition-colors">Privacy Policy</a>
            <a href="#" className="text-white/20 hover:text-white/40 text-xs transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
