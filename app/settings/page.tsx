'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';

type Host = { id: string; name: string; color: string };

const COLORS = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];

export default function SettingsPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch('/api/hosts');
    setHosts(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addHost(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    await fetch('/api/hosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    setName('');
    await load();
    setAdding(false);
  }

  async function deleteHost(id: string) {
    if (!confirm('Remove this host?')) return;
    await fetch('/api/hosts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Host Management</h1>
          <p className="text-gray-500 text-sm">Add your show hosts — their stats will appear on the dashboard</p>
        </div>

        {/* Add host form */}
        <div className="card p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">Add New Host</h2>
          <form onSubmit={addHost} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Host Name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Jason, Devon..." className="w-full" required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Color</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <button type="submit" disabled={adding} className="btn-primary">
              {adding ? 'Adding...' : '+ Add Host'}
            </button>
          </form>
        </div>

        {/* Hosts list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-900">Your Hosts</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : hosts.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No hosts added yet</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {hosts.map(host => (
                <div key={host.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg shrink-0"
                    style={{ backgroundColor: host.color }}>
                    {host.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{host.name}</p>
                    <p className="text-xs text-gray-400">Host · Stats appear on Dashboard & Sales pages</p>
                  </div>
                  <button onClick={() => deleteHost(host.id)} className="btn-danger">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 card p-5">
          <h2 className="font-bold text-gray-900 mb-2">How Hosts Work</h2>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
            <li>When connected to Google Sheets, host names are pulled from column M of each show tab</li>
            <li>Make sure the name in your spreadsheet matches exactly what you add here</li>
            <li>Host stats (sales, profit, margin) are calculated automatically from your orders</li>
            <li>In Demo Mode, only Jason appears as a sample host</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
