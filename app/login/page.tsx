'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  {
    id: 'admin', label: 'Admin', description: 'Full access',
    border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-500',
    username: 'admin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: 'manager', label: 'Manager', description: 'Team ops',
    border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-500',
    username: 'manager',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'shipper', label: 'Shipper', description: 'Shipments',
    border: 'border-violet-400', bg: 'bg-violet-50', text: 'text-violet-500',
    username: 'shipper',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
  {
    id: 'host', label: 'Host', description: 'Shows',
    border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-500',
    username: 'host',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
];

const ROLE_HOME: Record<string, string> = {
  admin: '/admin', manager: '/manager', shipper: '/shipper', host: '/host',
};

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function selectRole(role: typeof ROLES[0]) {
    setSelectedRole(role.id);
    setUsername(role.username);
    setError('');
  }

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

  const active = ROLES.find(r => r.id === selectedRole);

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
            <p className="text-slate-500 text-sm mb-8">Select your portal and sign in to continue</p>

            <div className="grid grid-cols-4 gap-2 mb-6">
              {ROLES.map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => selectRole(role)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    selectedRole === role.id
                      ? `${role.border} ${role.bg} ${role.text}`
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 bg-white'
                  }`}
                >
                  {role.icon}
                  <span className="text-[10px] font-bold leading-none">{role.label}</span>
                </button>
              ))}
            </div>

            {selectedRole && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${active?.bg} mb-5 text-xs font-semibold ${active?.text}`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Signing in as: <span className="font-black capitalize">{active?.label} Portal</span>
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
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">Stack Bargains Logistics Platform · v2.0</p>
        </div>
      </div>
    </div>
  );
}
