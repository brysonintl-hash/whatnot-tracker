'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type User = { id: string; username: string; name: string; role: Role; status: 'active' | 'pending'; createdAt: string; lastSeen: string | null };

function fmtLastSeen(iso: string | null): { label: string; online: boolean } {
  if (!iso) return { label: 'Never', online: false };
  const diff = Date.now() - new Date(iso).getTime();
  const online = diff < 30_000;
  if (online) return { label: 'Online now', online: true };
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return { label: `${mins}m ago`, online: false };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ago`, online: false };
  const days = Math.floor(hrs / 24);
  if (days < 7) return { label: `${days}d ago`, online: false };
  return { label: new Date(iso).toLocaleDateString(), online: false };
}

const ROLES: Role[] = ['admin', 'manager', 'shipper', 'host'];

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  manager: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  shipper: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
  host: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  employee: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
};

export default function UsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || s.role !== 'admin') { router.push('/login'); return; }
      setSession(s);
    });
    fetchUsers();
  }, []);

  function fetchUsers() {
    fetch('/api/users').then(r => r.json()).then(data => {
      setUsers(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }

  async function changeRole(id: string, role: Role) {
    setSaving(id);
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    setUsers(us => us.map(u => u.id === id ? { ...u, role, status: 'active' as const } : u));
    setSaving(null);
  }

  async function removeUser(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    setUsers(us => us.filter(u => u.id !== id));
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role="admin" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">User Management</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-full font-bold">Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Accounts', value: users.length, cls: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700', textCls: 'text-slate-900 dark:text-white', labelCls: 'text-slate-500 dark:text-slate-400' },
              { label: 'Pending Approval', value: users.filter(u => u.status === 'pending').length, cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', textCls: 'text-amber-600 dark:text-amber-400', labelCls: 'text-amber-600 dark:text-amber-400' },
              { label: 'Active Users', value: users.filter(u => u.status === 'active').length, cls: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700', textCls: 'text-slate-900 dark:text-white', labelCls: 'text-slate-500 dark:text-slate-400' },
              { label: 'Roles Assigned', value: ROLES.length, cls: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700', textCls: 'text-slate-900 dark:text-white', labelCls: 'text-slate-500 dark:text-slate-400' },
            ].map(k => (
              <div key={k.label} className={`${k.cls} rounded-xl border shadow-sm p-5`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${k.labelCls}`}>{k.label}</p>
                <p className={`text-2xl font-black ${k.textCls}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Users table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">All Accounts</h2>
              <span className="text-xs text-slate-400">{users.length} total</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-700">
                      {['Name', 'Username', 'Current Role', 'Change Role', 'Last Online', 'Joined', ''].map(h => (
                        <th key={h} className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${
                              u.role === 'admin' ? 'bg-red-500' : u.role === 'manager' ? 'bg-blue-500' : u.role === 'shipper' ? 'bg-violet-500' : 'bg-amber-500'
                            }`}>{u.name[0]}</div>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{u.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-mono">{u.username}</td>
                        <td className="py-3 px-4">
                          {u.status === 'pending' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">Pending</span>
                          ) : (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${ROLE_STYLE[u.role] ?? ''}`}>{u.role}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {u.username === session.username ? (
                            <span className="text-[10px] text-slate-400">— your account</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={u.status === 'pending' ? '' : u.role}
                                disabled={saving === u.id}
                                onChange={e => changeRole(u.id, e.target.value as Role)}
                                className="text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                              >
                                {u.status === 'pending' && <option value="" disabled>Assign role...</option>}
                                {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                              </select>
                              {u.status === 'pending' && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">↑ Activate</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {(() => { const ls = fmtLastSeen(u.lastSeen); return (
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${ls.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ls.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
                              {ls.label}
                            </span>
                          ); })()}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-5">
                          {u.username !== session.username && (
                            <button onClick={() => removeUser(u.id)}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors">
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
