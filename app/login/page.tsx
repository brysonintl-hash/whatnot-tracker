'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin', manager: '/manager', employee: '/employee',
  shipper: '/shipper', host: '/host',
};

const inputBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
};
const inputFocus: React.CSSProperties = {
  border: '1px solid rgba(204,17,17,0.55)',
  boxShadow: '0 0 0 3px rgba(204,17,17,0.10)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest mb-2">{label}</label>
      {children}
    </div>
  );
}

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
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (params.get('registered')) setSuccess('Account created! Wait for an admin to assign your role, then sign in.');
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

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#05050a' }}>

      {/* ── Background: unblurred tools photo + dark gradient ── */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0" style={{
          backgroundImage: 'url(/bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }} />
        {/* gradient: lighter left so tools are visible, very dark right so form pops */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(105deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.60) 45%, rgba(0,0,0,0.88) 100%)',
        }} />
        {/* overall subtle dark veil */}
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)' }} />
      </div>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-6 lg:px-12 py-10 flex flex-col lg:flex-row items-center justify-between gap-12">

          {/* ── Left: branding ── */}
          <div className="flex-1 max-w-lg">
            {/* Logo row */}
            <div className="flex items-center gap-5 mb-12">
              <div className="w-[90px] h-[90px] rounded-2xl overflow-hidden flex-shrink-0"
                style={{ boxShadow: '0 0 40px rgba(204,17,17,0.35), 0 8px 32px rgba(0,0,0,0.6)' }}>
                <img src="/logo.png" alt="Stack Bargains" className="w-full h-full object-cover" />
              </div>
              <span className="text-amber-400 text-sm font-bold tracking-[0.22em] uppercase">Logistics Platform</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[1.08] mb-5">
              Run your logistics<br />
              <span style={{ color: '#e01515' }}>with confidence.</span>
            </h1>
            <p className="text-white/45 text-lg leading-relaxed mb-12">
              Powering smarter operations, better visibility,<br className="hidden sm:block" />
              and faster delivery—every time.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-3">
              {[
                { icon: (
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  ), label: 'Streamlined Operations' },
                { icon: (
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  ), label: 'Real-time Visibility' },
                { icon: (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  ), label: 'Secure & Reliable' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  {f.icon}
                  <span className="text-white/65 text-sm font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: glass form card ── */}
          <div
            className="w-full max-w-[460px] rounded-2xl p-8 flex-shrink-0 transition-all duration-300"
            style={{
              background: 'rgba(8,8,12,0.78)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              border: hovered ? '1px solid rgba(200,200,210,0.38)' : '1px solid rgba(255,255,255,0.10)',
              boxShadow: hovered
                ? '0 0 0 3px rgba(180,180,195,0.10), 0 24px 64px rgba(0,0,0,0.60)'
                : '0 24px 64px rgba(0,0,0,0.45)',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {/* Card top shine */}
            <div className="absolute inset-x-8 top-0 h-px rounded-t-2xl"
              style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)' }} />

            <h2 className="text-[1.75rem] font-black text-white mb-1.5">Welcome back</h2>
            <p className="text-white/35 text-sm mb-7">Sign in to access your account</p>

            {success && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium mb-5"
                style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#34d399' }}>
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Username">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </span>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username" required
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none transition-all"
                    style={inputBase}
                    onFocus={e => Object.assign(e.currentTarget.style, inputFocus)}
                    onBlur={e => Object.assign(e.currentTarget.style, inputBase)} />
                </div>
              </Field>

              <Field label="Password">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </span>
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password" required
                    className="w-full pl-10 pr-12 py-3 rounded-xl text-white text-sm placeholder-white/20 outline-none transition-all"
                    style={inputBase}
                    onFocus={e => Object.assign(e.currentTarget.style, inputFocus)}
                    onBlur={e => Object.assign(e.currentTarget.style, inputBase)} />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors">
                    {showPass
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </Field>

              {/* Remember me + Forgot password */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-red-600" />
                  <span className="text-white/50 text-sm">Remember me</span>
                </label>
                <button type="button" className="text-sm font-semibold transition-colors"
                  style={{ color: '#e01515' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ff4444'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#e01515'; }}>
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
                  style={{ background: 'rgba(204,17,17,0.10)', border: '1px solid rgba(204,17,17,0.25)', color: '#f87171' }}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !username || !password}
                className="w-full font-black py-3.5 rounded-xl text-sm text-white transition-all mt-1 relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(135deg,#e51515 0%,#cc1010 100%)',
                  boxShadow: '0 4px 24px rgba(204,17,17,0.35)',
                  opacity: (loading || !username || !password) ? 0.5 : 1,
                }}>
                <span className="relative z-10">
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Signing in...</span>
                    : 'Sign In →'
                  }
                </span>
                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.08) 0%,transparent 60%)' }} />
              </button>
            </form>

            {/* OR divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
              <span className="text-white/25 text-xs font-semibold tracking-widest">OR</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.10)' }} />
            </div>

            <p className="text-center text-sm text-white/35">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-bold transition-colors" style={{ color: '#e01515' }}>Register</Link>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 shrink-0" style={{ background: 'rgba(0,0,0,0.65)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
              <img src="/logo.png" alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-white/25 text-sm">© 2025 Stack Bargains. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            {['Privacy Policy', 'Terms of Service', 'Contact Support'].map((t, i, a) => (
              <span key={t} className="flex items-center gap-5">
                <a href="#" className="text-white/25 hover:text-white/50 transition-colors">{t}</a>
                {i < a.length - 1 && <span className="text-white/15">|</span>}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
