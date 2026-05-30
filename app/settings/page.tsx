'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useTheme } from '@/lib/useTheme';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };

const TIMEZONES = [
  { label: 'Eastern Time (ET)', value: 'America/New_York' },
  { label: 'Central Time (CT)', value: 'America/Chicago' },
  { label: 'Mountain Time (MT)', value: 'America/Denver' },
  { label: 'Pacific Time (PT)', value: 'America/Los_Angeles' },
  { label: 'Alaska Time (AKT)', value: 'America/Anchorage' },
  { label: 'Hawaii Time (HT)', value: 'Pacific/Honolulu' },
  { label: 'UTC', value: 'UTC' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const isDark = useTheme();

  // Change password
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  // Timezone
  const [timezone, setTimezone] = useState('America/New_York');

  // Delete account
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
    const saved = localStorage.getItem('timezone');
    if (saved) setTimezone(saved);
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  }

  function saveTimezone(tz: string) {
    setTimezone(tz);
    localStorage.setItem('timezone', tz);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ type: 'err', text: 'New passwords do not match.' }); return; }
    if (newPw.length < 4) { setPwMsg({ type: 'err', text: 'Password must be at least 4 characters.' }); return; }
    setPwSaving(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: oldPw, newPassword: newPw }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwMsg({ type: 'ok', text: 'Password changed successfully.' });
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } else {
      setPwMsg({ type: 'err', text: data.error || 'Failed to change password.' });
    }
    setPwSaving(false);
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError('');
    if (!deletePassword) { setDeleteError('Please enter your password.'); return; }
    if (!confirm('This is permanent. Your account and all data will be removed. Continue?')) return;
    setDeleting(true);
    const res = await fetch('/api/auth/delete-account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deletePassword }),
    });
    if (res.ok) {
      router.push('/login');
    } else {
      const data = await res.json();
      setDeleteError(data.error || 'Failed to delete account.');
      setDeleting(false);
    }
  }

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Settings</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6 max-w-2xl">
          {/* Appearance */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Appearance</h2>
            </div>
            <div className="p-6 space-y-5">
              {/* Theme toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dark Mode</p>
                  <p className="text-xs text-slate-400 mt-0.5">Toggle between light and dark theme</p>
                </div>
                <button
                  onClick={toggleTheme}
                  className={`relative w-12 h-6 rounded-full transition-colors ${isDark ? 'bg-red-500' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isDark ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Timezone */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Timezone</p>
                  <p className="text-xs text-slate-400 mt-0.5">Used for displaying dates and times</p>
                </div>
                <select
                  value={timezone}
                  onChange={e => saveTimezone(e.target.value)}
                  className="text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                >
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Change Password</h2>
            </div>
            <form onSubmit={changePassword} className="p-6 space-y-4">
              {pwMsg && (
                <div className={`px-4 py-3 rounded-lg text-sm font-medium ${pwMsg.type === 'ok' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                  {pwMsg.text}
                </div>
              )}
              {[
                { label: 'Current Password', value: oldPw, set: setOldPw },
                { label: 'New Password', value: newPw, set: setNewPw },
                { label: 'Confirm New Password', value: confirmPw, set: setConfirmPw },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{f.label}</label>
                  <input
                    type="password"
                    value={f.value}
                    onChange={e => f.set(e.target.value)}
                    required
                    className="w-full text-sm px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              ))}
              <div className="flex justify-end">
                <button type="submit" disabled={pwSaving} className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
                  {pwSaving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Danger Zone */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-900 shadow-sm">
            <div className="px-6 py-4 border-b border-red-100 dark:border-red-900">
              <h2 className="font-bold text-red-600 text-sm">Danger Zone</h2>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Delete My Account</p>
              <p className="text-xs text-slate-400 mb-4">
                {session.role === 'admin'
                  ? 'Admin accounts cannot be deleted for security.'
                  : 'Permanently removes your account and all your data. Enter your password to confirm.'}
              </p>
              {session.role !== 'admin' && (
                <form onSubmit={deleteAccount} className="space-y-3">
                  {deleteError && (
                    <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                      {deleteError}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      placeholder="Enter your password"
                      className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <button
                      type="submit"
                      disabled={deleting || !deletePassword}
                      className="px-4 py-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      {deleting ? 'Deleting...' : 'Delete Account'}
                    </button>
                  </div>
                </form>
              )}
              {session.role === 'admin' && (
                <button disabled className="px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-400 text-sm font-bold rounded-lg opacity-40 cursor-not-allowed">
                  Delete Account
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
