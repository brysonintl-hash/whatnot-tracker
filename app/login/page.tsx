'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin', manager: '/manager', employee: '/employee', shipper: '/shipper', host: '/host',
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen flex bg-white">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[45%] bg-slate-900 flex-col justify-between p-14 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-red-500/5 rounded-full translate-y-1/2 -translate-x-1/3" />
        </div>
        <div className="relative">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg">SB</div>
            <div>
              <div className="text-white font-black text-xl tracking-tight">Stack Bargains</div>
              <div className="text-slate-500 text-xs font-medium">Enterprise Logistics Platform</div>
            </div>
          </div>

          <h1 className="text-4xl font-black text-white leading-tight mb-4">
            Operate smarter.<br />
            <span className="text-red-500">Ship faster.</span>
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm">
            Manage inventory, shipping, team performance, and live shows — unified in one powerful platform.
          </p>

          <div className="space-y-2.5">
            {[
              'Real-time inventory management',
              'Multi-carrier shipping & USPS tracking',
              'Role-based access for team members',
              'Sales analytics & live reporting',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-slate-400 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative grid grid-cols-2 gap-8 border-t border-slate-800 pt-8">
          {[{ v: '4', l: 'User Roles' }, { v: '24/7', l: 'Uptime' }].map(s => (
            <div key={s.l}>
              <div className="text-3xl font-black text-white mb-1">{s.v}</div>
              <div className="text-slate-500 text-xs font-medium">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center font-black text-white text-sm">SB</div>
            <span className="font-black text-slate-900 text-lg">Stack Bargains</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <h2 className="text-2xl font-black text-slate-900 mb-1">Welcome back</h2>
            <p className="text-slate-500 text-sm mb-8">Sign in to your account</p>

            {success && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium mb-5">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-black py-3.5 rounded-xl transition-colors text-sm shadow-sm mt-2"
              >
                {loading ? 'Signing in...' : 'Sign In →'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-5">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-red-600 font-bold hover:underline">Register</Link>
            </p>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">Stack Bargains Logistics Platform · v2.0</p>
        </div>
      </div>
    </div>
  );
}
