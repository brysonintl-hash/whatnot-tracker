'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type NavItem = { href: string; label: string; icon: React.ReactNode };
type Section = { title: string; items: NavItem[] };

const I = {
  grid: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  box: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  chart: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  truck: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  bar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  clock: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  users: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  settings: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  check: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  cal: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  pkg: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
  map: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  tv: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  clip: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6m-3-3v6" /></svg>,
  ship: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>,
};

const NAV: Record<Role, Section[]> = {
  admin: [
    { title: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: I.grid }] },
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales Analytics', icon: I.chart },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      { href: '/shipping', label: 'Shipments', icon: I.ship },
    ]},
    { title: 'Team', items: [
      { href: '/performance', label: 'Performance', icon: I.bar },
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
      { href: '/users', label: 'User Management', icon: I.users },
    ]},
    { title: 'System', items: [
      { href: '/knowledge', label: 'Knowledge Base', icon: I.check },
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  manager: [
    { title: 'Overview', items: [{ href: '/manager', label: 'Dashboard', icon: I.grid }] },
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales Analytics', icon: I.chart },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      { href: '/shipping', label: 'Shipments', icon: I.ship },
    ]},
    { title: 'Team', items: [
      { href: '/performance', label: 'Performance', icon: I.bar },
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
    ]},
    { title: 'System', items: [
      { href: '/knowledge', label: 'Knowledge Base', icon: I.check },
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  employee: [],
  shipper: [
    { title: 'Tasks', items: [
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      { href: '/shipping', label: 'Shipments', icon: I.ship },
    ]},
    { title: 'Time', items: [
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
    ]},
    { title: 'Account', items: [
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  host: [
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales', icon: I.chart },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      { href: '/shipping', label: 'Shipments', icon: I.ship },
    ]},
    { title: 'Time', items: [
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
    ]},
    { title: 'Account', items: [
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
};

const ROLE_COLOR: Record<Role, string> = {
  admin: 'bg-red-500', manager: 'bg-blue-500', employee: 'bg-emerald-500',
  shipper: 'bg-violet-500', host: 'bg-amber-500',
};

export default function Sidebar({ role, userName }: { role: Role; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useTheme();
  const sections = NAV[role] ?? [];
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [shipmentCount, setShipmentCount] = useState(0);

  useEffect(() => {
    if (role !== 'admin') return;
    fetch('/api/users')
      .then(r => r.json())
      .then((users: { status: string }[]) => {
        setPendingUserCount(users.filter(u => u.status === 'pending').length);
      })
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/pendings')
        .then(r => r.json())
        .then((tasks: { status: string; urgent: boolean; followUp: boolean }[]) => {
          if (!Array.isArray(tasks)) return;
          if (role === 'admin' || role === 'manager') {
            setPendingTaskCount(tasks.filter(t => t.status === 'open').length);
          } else {
            setPendingTaskCount(tasks.filter(t => t.status === 'open' && (t.urgent || t.followUp)).length);
          }
        })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [role]);

  useEffect(() => {
    if (role !== 'host' && role !== 'shipper') return;
    const fetchCount = () => {
      fetch('/api/shipments/mycount')
        .then(r => r.json())
        .then(d => setShipmentCount(d.count || 0))
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, [role]);

  useEffect(() => {
    const ping = () => fetch('/api/presence', { method: 'POST' }).catch(() => {});
    ping();
    const t = setInterval(ping, 10000);
    return () => clearInterval(t);
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="w-64 h-screen bg-slate-900 flex flex-col flex-shrink-0 border-r border-slate-800">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center font-black text-white text-xs shadow">SB</div>
          <div>
            <div className="text-white font-black text-sm leading-none">Stack Bargains</div>
            <div className="text-slate-500 text-[10px] capitalize mt-0.5">{role} Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6">
        {sections.map(section => (
          <div key={section.title}>
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest px-3 mb-2">{section.title}</p>
            {section.items.map(item => {
              const active = pathname === item.href || (item.href !== '/admin' && item.href !== '/manager' && item.href !== '/employee' && item.href !== '/shipper' && item.href !== '/host' && pathname.startsWith(item.href));
              const isUsers = item.href === '/users';
              const isPendings = item.href === '/pendings';
              const isShipments = item.href === '/shipping';
              const usersBadge = isUsers && pendingUserCount > 0;
              const pendingsBadge = isPendings && pendingTaskCount > 0;
              const shipmentsBadge = isShipments && (role === 'host' || role === 'shipper') && shipmentCount > 0;
              const hasBadge = usersBadge || pendingsBadge || shipmentsBadge;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {item.label}
                  {usersBadge && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {pendingUserCount}
                    </span>
                  )}
                  {pendingsBadge && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {pendingTaskCount}
                    </span>
                  )}
                  {shipmentsBadge && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {shipmentCount}
                    </span>
                  )}
                  {active && !hasBadge && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800 mb-1">
          <div className={`w-8 h-8 rounded-full ${ROLE_COLOR[role]} flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
            {userName[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate">{userName}</div>
            <div className="text-slate-400 text-[10px] capitalize font-medium">{role}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
