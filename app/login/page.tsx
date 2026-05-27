'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      setError('Invalid username or password');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-[#0d1117]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-red-600 px-6 py-3 rounded-xl shadow-lg mb-3">
            <div className="text-white font-black text-3xl tracking-tight leading-none">STACK</div>
            <div className="text-amber-400 font-black text-3xl tracking-tight leading-none">BARGAINS</div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Sales & Inventory Dashboard</p>
        </div>

        <div className="bg-white dark:bg-[#161b22] rounded-2xl shadow-md border border-gray-200 dark:border-[#30363d] p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full"
                placeholder="Enter username"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full"
                placeholder="Enter password"
                required
              />
            </div>
            {error && (
              <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
