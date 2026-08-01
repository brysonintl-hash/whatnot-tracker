'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from '@/lib/useTheme';
import { useIdleLogout } from '@/lib/useIdleLogout';
import type { Role } from '@/lib/types';
import Chat from '@/components/Chat';
import FeatureRequestModal from '@/components/FeatureRequestModal';

type NavItem = { href: string; label: string; icon: React.ReactNode; children?: NavItem[] };
type Section = { title: string; items: NavItem[] };

const I = {
  grid: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  box: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  chart: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  truck: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>,
  bar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  amz: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
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
  scraper: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  hd:     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  report: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  mail: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  calc: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01" /></svg>,
  ai: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  logout: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  idea: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
};

const SHIPMENTS_NAV: NavItem = {
  href: '/shipping',
  label: 'Shipments',
  icon: I.ship,
  children: [
    { href: '/shipping', label: 'Assign Shipments', icon: I.ship },
    { href: '/shipping?tab=cancellation', label: 'Cancellations', icon: I.clip },
    { href: '/shipping?tab=replacement', label: 'Replacements', icon: I.clip },
    { href: '/shipping?tab=refund', label: 'Refunds', icon: I.clip },
    { href: '/shipping?tab=usps', label: 'USPS Claims', icon: I.clip },
  ],
};

const NAV: Record<Role, Section[]> = {
  admin: [
    { title: 'Overview', items: [
      { href: '/admin', label: 'Dashboard', icon: I.grid },
      { href: '/reports', label: 'Reports', icon: I.report },
      { href: '/ai', label: 'AI Assistant', icon: I.ai },
    ]},
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales Analytics', icon: I.chart },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      SHIPMENTS_NAV,
      { href: '/amazon', label: 'Amazon Analyzer', icon: I.amz },
      { href: '/support', label: 'Gmail Support', icon: I.mail },
    ]},
    { title: 'Team', items: [
      { href: '/performance', label: 'Performance', icon: I.bar },
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
      { href: '/calculator', label: 'Pay Calculator', icon: I.calc },
      { href: '/users', label: 'User Management', icon: I.users },
    ]},
    { title: 'System', items: [
      { href: '/knowledge', label: 'Knowledge Base', icon: I.check },
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  manager: [
    { title: 'Overview', items: [
      { href: '/manager', label: 'Dashboard', icon: I.grid },
      { href: '/reports', label: 'Reports', icon: I.report },
      { href: '/ai', label: 'AI Assistant', icon: I.ai },
    ]},
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales Analytics', icon: I.chart },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      SHIPMENTS_NAV,
      { href: '/amazon', label: 'Amazon Analyzer', icon: I.amz },
      { href: '/support', label: 'Gmail Support', icon: I.mail },
    ]},
    { title: 'Team', items: [
      { href: '/performance', label: 'Performance', icon: I.bar },
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
      { href: '/calculator', label: 'Pay Calculator', icon: I.calc },
    ]},
    { title: 'System', items: [
      { href: '/knowledge', label: 'Knowledge Base', icon: I.check },
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  employee: [],
  shipper: [
    { title: 'Overview', items: [
      { href: '/shipper', label: 'Dashboard', icon: I.grid },
    ]},
    { title: 'Tasks', items: [
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      SHIPMENTS_NAV,
    ]},
    { title: 'Time', items: [
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
    ]},
    { title: 'Account', items: [
      { href: '/settings', label: 'Settings', icon: I.settings },
    ]},
  ],
  host: [
    { title: 'Overview', items: [
      { href: '/host', label: 'Dashboard', icon: I.grid },
    ]},
    { title: 'Operations', items: [
      { href: '/inventory', label: 'Inventory', icon: I.box },
      { href: '/sales', label: 'Sales', icon: I.chart },
      { href: '/performance', label: 'My Performance', icon: I.bar },
      { href: '/pendings', label: 'Pendings', icon: I.clip },
      SHIPMENTS_NAV,
    ]},
    { title: 'Time', items: [
      { href: '/timekeeping', label: 'Timekeeping', icon: I.clock },
      { href: '/calculator', label: 'Pay Calculator', icon: I.calc },
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
  useIdleLogout(60);
  const sections = NAV[role] ?? [];
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [shipmentCount, setShipmentCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [featureOpen, setFeatureOpen] = useState(false);

  // Whether the sidebar is fully open (hover on desktop, or mobileOpen)
  const open = expanded || mobileOpen;

  useEffect(() => {
    if (pathname.startsWith('/shipping')) setExpandedItems(new Set(['/shipping']));
  }, [pathname]);

  function toggleExpanded(href: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href); else next.add(href);
      return next;
    });
  }

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
    <>
      {/* Desktop space placeholder — reserves 64px so main content doesn't shift */}
      <div className="hidden md:block w-16 flex-shrink-0 flex-none" />

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-slate-900 rounded-lg text-white shadow-lg"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen bg-slate-900 flex flex-col border-r border-slate-800
          transition-all duration-200 ease-in-out overflow-hidden
          ${open ? 'w-64' : 'w-16'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-slate-800 flex-shrink-0 ${open ? 'px-5' : 'justify-center'}`}>
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center font-black text-white text-xs shadow flex-shrink-0">SB</div>
          {open && (
            <div className="ml-3 flex-1 min-w-0">
              <div className="text-white font-black text-sm leading-none whitespace-nowrap">Stack Bargains</div>
              <div className="text-slate-500 text-[10px] capitalize mt-0.5">{role} Portal</div>
            </div>
          )}
          {mobileOpen && (
            <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {sections.map(section => (
            <div key={section.title}>
              {open && (
                <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest px-3 mb-2 whitespace-nowrap">{section.title}</p>
              )}
              {!open && <div className="h-px bg-slate-800 mx-2 mb-2" />}

              {section.items.map(item => {
                const active = pathname === item.href || (item.href !== '/admin' && item.href !== '/manager' && item.href !== '/employee' && item.href !== '/shipper' && item.href !== '/host' && pathname.startsWith(item.href));
                const isUsers = item.href === '/users';
                const isPendings = item.href === '/pendings';
                const isShipments = item.href === '/shipping';
                const usersBadge = isUsers && pendingUserCount > 0;
                const pendingsBadge = isPendings && pendingTaskCount > 0;
                const shipmentsBadge = isShipments && (role === 'host' || role === 'shipper') && shipmentCount > 0;
                const hasBadge = usersBadge || pendingsBadge || shipmentsBadge;

                if (item.children) {
                  const isChildExpanded = expandedItems.has(item.href);
                  const parentActive = pathname.startsWith(item.href);
                  return (
                    <div key={item.href}>
                      <button
                        onClick={() => open ? toggleExpanded(item.href) : null}
                        className={`flex items-center w-full py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${open ? 'gap-3 px-3' : 'justify-center px-0'} ${
                          parentActive
                            ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                        }`}
                      >
                        <span className="relative flex-shrink-0">
                          {item.icon}
                          {!open && shipmentsBadge && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                          )}
                        </span>
                        {open && (
                          <>
                            <span className="whitespace-nowrap">{item.label}</span>
                            {shipmentsBadge && (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                                {shipmentCount}
                              </span>
                            )}
                            <svg className={`w-3.5 h-3.5 ml-auto flex-shrink-0 transition-transform duration-150 ${isChildExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        )}
                      </button>
                      {open && isChildExpanded && (
                        <div className="ml-3 pl-3 border-l border-slate-700 mt-0.5 mb-1 space-y-0.5">
                          {item.children.map(child => (
                            <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}
                              className="flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all text-slate-500 hover:text-slate-200 hover:bg-slate-800">
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${open ? 'gap-3 px-3' : 'justify-center px-0'} ${
                      active
                        ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <span className="relative flex-shrink-0">
                      {item.icon}
                      {!open && hasBadge && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                      )}
                    </span>
                    {open && (
                      <>
                        <span className="whitespace-nowrap">{item.label}</span>
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
                        {active && !hasBadge && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-slate-800 flex-shrink-0">
          <div className={`flex items-center py-2.5 rounded-lg bg-slate-800 mb-1 ${open ? 'gap-3 px-3' : 'justify-center'}`}>
            <div className={`w-8 h-8 rounded-full ${ROLE_COLOR[role]} flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
              {userName[0]?.toUpperCase()}
            </div>
            {open && (
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-semibold truncate">{userName}</div>
                <div className="text-slate-400 text-[10px] capitalize font-medium">{role}</div>
              </div>
            )}
          </div>

          {open ? (
            <>
              <button onClick={() => setFeatureOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 text-sm font-medium transition-colors">
                {I.idea}
                <span className="whitespace-nowrap">Request a Feature</span>
              </button>
              <button onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 text-sm font-medium transition-colors">
                {I.logout}
                <span className="whitespace-nowrap">Sign out</span>
              </button>
            </>
          ) : (
            <button onClick={logout}
              className="w-full flex items-center justify-center py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors">
              {I.logout}
            </button>
          )}
        </div>
      </aside>

      <Chat />
      {featureOpen && <FeatureRequestModal userName={userName} onClose={() => setFeatureOpen(false)} />}
    </>
  );
}
