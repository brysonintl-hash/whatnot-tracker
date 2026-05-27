'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/sales', label: 'Sales Analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <nav className="bg-[#161b22] border-b border-[#30363d] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14">
        <Link href="/dashboard" className="flex items-center gap-2 mr-8">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <span className="font-semibold text-white text-sm">WhatNot Tracker</span>
        </Link>

        <div className="flex items-center gap-1 flex-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(link.href)
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={link.icon} />
              </svg>
              {link.label}
            </Link>
          ))}
        </div>

        <button
          onClick={logout}
          className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </nav>
  );
}
