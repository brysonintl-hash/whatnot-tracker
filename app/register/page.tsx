'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push('/login?registered=1');
    } else {
      setError(data.error || 'Registration failed');
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex w-[45%] bg-slate-900 flex-col justify-center p-14 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-red-600/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-red-500/5 rounded-full translate-y-1/2 -translate-x-1/3" />
        </div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-lg">SB</div>
            <div>
              <div className="text-white font-black text-xl tracking-tight">Stack Bargains</div>
              <div className="text-slate-500 text-xs font-medium">Enterprise Logistics Platform</div>
            </div>
          </div>
          <h1 className="text-4xl font-black text-white leading-tight mb-4">
            Join the team.<br />
            <span className="text-red-500">Get started today.</span>
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
            Create your account and wait for an admin to assign your role. You'll be able to log in once your access is configured.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center font-black text-white text-sm">SB</div>
            <span className="font-black text-slate-900 text-lg">Stack Bargains</span>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <h2 className="text-2xl font-black text-slate-900 mb-1">Create Account</h2>
            <p className="text-slate-500 text-sm mb-8">Fill in your details to register</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose a username" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Confirm Password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-slate-400" />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-black py-3.5 rounded-xl transition-colors text-sm shadow-sm">
                {loading ? 'Creating account...' : 'Create Account →'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-400 mt-5">
              Already have an account?{' '}
              <Link href="/login" className="text-red-600 font-bold hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
