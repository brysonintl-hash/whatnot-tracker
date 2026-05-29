'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type User = { id: string; username: string; name: string; role: Role; status: 'active' | 'pending'; createdAt: string };

const ROLES: Role[] = ['admin', 'manager', 'shipper', 'host'];

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-red-50 text-red-700 border-red-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  shipper: 'bg-violet-50 text-violet-700 border-violet-200',
  host: 'bg-amber-50 text-amber-700 border-amber-200',
  employee: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
    setUsers(us => us.map(u => u.id === id ? { ...u, role } : u));
    setSaving(null);
  }

  async function removeUser(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    setUsers(us => us.filter(u => u.id !== id));
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!session) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role="admin" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">User Management</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold">Admin</span>
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Total Accounts</p>
              <p className="text-2xl font-black text-slate-900">{users.length}</p>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-5">
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-2">Pending Approval</p>
              <p className="text-2xl font-black text-amber-600">{users.filter(u => u.status === 'pending').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Active Users</p>
              <p className="text-2xl font-black text-slate-900">{users.filter(u => u.status === 'active').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Roles Assigned</p>
              <p className="text-2xl font-black text-slate-900">{ROLES.length}</p>
            </div>
          </div>

          {/* Users table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm">All Accounts</h2>
              <span className="text-xs text-slate-400">{users.length} total</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-5">Name</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Username</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Current Role</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Change Role</th>
                      <th className="text-left text-[10px] text-slate-400 font-bold uppercase tracking-wide py-3 px-4">Joined</th>
                      <th className="py-3 px-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${
                              u.role === 'admin' ? 'bg-red-500' : u.role === 'manager' ? 'bg-blue-500' : u.role === 'shipper' ? 'bg-violet-500' : 'bg-amber-500'
                            }`}>{u.name[0]}</div>
                            <span className="text-xs font-semibold text-slate-700">{u.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 font-mono">{u.username}</td>
                        <td className="py-3 px-4">
                          {u.status === 'pending' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Pending</span>
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
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                              >
                                {u.status === 'pending' && <option value="" disabled>Assign role...</option>}
                                {ROLES.map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                              </select>
                              {u.status === 'pending' && <span className="text-[10px] text-amber-600 font-bold">↑ Activate</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="py-3 px-5">
                          {u.username !== session.username && (
                            <button onClick={() => removeUser(u.id)}
                              className="text-[10px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
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
