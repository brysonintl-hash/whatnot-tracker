'use client';

import { useEffect, useState } from 'react';

type PresenceRecord = { userId: string; name: string; role: string; username: string };

const ROLE_COLORS: Record<string, string> = {
  admin: '#EF4444',
  manager: '#3B82F6',
  host: '#F59E0B',
  shipper: '#8B5CF6',
  employee: '#10B981',
};

export default function OnlineUsers() {
  const [users, setUsers] = useState<PresenceRecord[]>([]);

  useEffect(() => {
    const fetch_ = () =>
      fetch('/api/presence').then(r => r.json()).then(d => { if (Array.isArray(d)) setUsers(d); }).catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 30000);
    return () => clearInterval(t);
  }, []);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {users.map(u => (
        <div
          key={u.userId}
          title={`${u.name} (${u.role}) — Online`}
          className="relative w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black ring-2 ring-white dark:ring-slate-800 select-none cursor-default"
          style={{ backgroundColor: ROLE_COLORS[u.role] ?? '#64748B' }}
        >
          {u.name[0]?.toUpperCase()}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-800" />
        </div>
      ))}
    </div>
  );
}
