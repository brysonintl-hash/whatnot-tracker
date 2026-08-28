'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Role } from '@/lib/types';

type Session = { username: string; role: Role; name: string };
type DirectoryUser = { username: string; name: string; role: string; online: boolean };
type DirectMessage = { id: string; from: string; to: string; text: string; at: number };
type ChannelMessage = { id: string; username: string; name: string; role: string; text: string; at: number };
type Reader = { username: string; name: string; role: string; lastReadAt: number };
type Selection = { type: 'direct'; user: DirectoryUser } | { type: 'channel' } | null;

const ROLE_DOT: Record<string, string> = {
  admin: 'bg-red-500', manager: 'bg-blue-500', shipper: 'bg-violet-500',
  host: 'bg-amber-500', employee: 'bg-emerald-500',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
  manager: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
  shipper: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30',
  host: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  employee: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MessagesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<'direct' | 'channels'>('direct');
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [channelMessages, setChannelMessages] = useState<ChannelMessage[]>([]);
  const [channelReaders, setChannelReaders] = useState<Reader[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelSinceRef = useRef(0);
  const selectionRef = useRef<Selection>(null);
  selectionRef.current = selection;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s) { router.push('/login'); return; }
      setSession(s);
    });
  }, [router]);

  const fetchDirectory = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/directory');
      if (!r.ok) return;
      const data = await r.json();
      setDirectory(data.users ?? []);
    } catch {}
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const r = await fetch('/api/messages/direct/unread');
      if (!r.ok) return;
      const data = await r.json();
      setUnreadCounts(data.counts ?? {});
    } catch {}
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchDirectory();
    fetchUnread();
    const t1 = setInterval(fetchDirectory, 10000);
    const t2 = setInterval(fetchUnread, 10000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [session, fetchDirectory, fetchUnread]);

  // Load + poll the currently selected conversation
  useEffect(() => {
    if (!session || !selection) return;

    if (selection.type === 'direct') {
      const withUser = selection.user.username;
      let cancelled = false;
      const load = async () => {
        try {
          const r = await fetch(`/api/messages/direct?with=${encodeURIComponent(withUser)}`);
          if (!r.ok || cancelled) return;
          const data = await r.json();
          const msgs: DirectMessage[] = data.messages ?? [];
          setDirectMessages(msgs);
          if (msgs.length) {
            fetch('/api/messages/direct/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ with: withUser, lastReadAt: msgs[msgs.length - 1].at }),
            }).catch(() => {});
            setUnreadCounts(prev => ({ ...prev, [withUser]: 0 }));
          }
        } catch {}
      };
      load();
      const t = setInterval(load, 2000);
      return () => { cancelled = true; clearInterval(t); };
    }

    if (selection.type === 'channel') {
      channelSinceRef.current = 0;
      setChannelMessages([]);
      let cancelled = false;
      const load = async () => {
        try {
          const r = await fetch(`/api/chat?since=${channelSinceRef.current}`);
          if (!r.ok || cancelled) return;
          const data = await r.json();
          const msgs: ChannelMessage[] = data.messages ?? [];
          if (data.readers) setChannelReaders(data.readers);
          if (msgs.length) {
            channelSinceRef.current = msgs[msgs.length - 1].at;
            setChannelMessages(prev => [...prev, ...msgs].slice(-200));
          }
        } catch {}
      };
      load();
      const t = setInterval(load, 2000);
      return () => { cancelled = true; clearInterval(t); };
    }
  }, [session, selection]);

  // Mark channel read as new messages arrive while it's open
  useEffect(() => {
    if (selection?.type !== 'channel' || !channelMessages.length) return;
    const lastAt = channelMessages[channelMessages.length - 1].at;
    fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastReadAt: lastAt }),
    }).catch(() => {});
  }, [selection, channelMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [directMessages, channelMessages, selection]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !selection) return;
    setInput('');

    if (selection.type === 'direct') {
      const withUser = selection.user.username;
      const optimistic: DirectMessage = { id: `tmp-${Date.now()}`, from: session!.username, to: withUser, text, at: Date.now() };
      setDirectMessages(prev => [...prev, optimistic]);
      try {
        await fetch('/api/messages/direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: withUser, text }),
        });
      } catch {}
    } else {
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = await r.json();
        if (data.message) {
          channelSinceRef.current = data.message.at;
          setChannelMessages(prev => [...prev, data.message]);
        }
      } catch {}
    }
  }

  if (!session) return <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  const filteredDirectory = directory.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()));
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role={session.role} userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-white">Messages</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full font-bold capitalize">{session.role}</span>
        </header>

        <main className="flex-1 flex overflow-hidden">
          {/* Left panel */}
          <div className="w-80 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
                <button
                  onClick={() => setTab('direct')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                    tab === 'direct' ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Direct
                  {totalUnread > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center leading-none">
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setTab('channels')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    tab === 'channels' ? 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Channels
                </button>
              </div>
            </div>

            {tab === 'direct' ? (
              <>
                <div className="px-4 pt-3 pb-2">
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search members..."
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2">
                  {filteredDirectory.length === 0 && (
                    <p className="text-xs text-slate-400 text-center mt-6">No teammates found.</p>
                  )}
                  {filteredDirectory.map(u => {
                    const isActive = selection?.type === 'direct' && selection.user.username === u.username;
                    const unread = unreadCounts[u.username] ?? 0;
                    return (
                      <button
                        key={u.username}
                        onClick={() => setSelection({ type: 'direct', user: u })}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-colors text-left ${
                          isActive ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border border-transparent'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black ${ROLE_DOT[u.role] ?? 'bg-slate-400'}`}>
                            {u.name[0]?.toUpperCase()}
                          </div>
                          {u.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-800" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.name}</p>
                          <p className="text-[11px] text-slate-400 capitalize">{u.online ? 'online' : 'offline'}</p>
                        </div>
                        {unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none flex-shrink-0">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-2">
                <button
                  onClick={() => setSelection({ type: 'channel' })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                    selection?.type === 'channel' ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border border-transparent'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-black flex-shrink-0">#</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">General</p>
                    <p className="text-[11px] text-slate-400">Team-wide channel</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Conversation panel */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900">
            {!selection ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Select a conversation</p>
                <p className="text-xs text-slate-400 mt-1">Choose a teammate or channel to start messaging.</p>
              </div>
            ) : (
              <>
                <div className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-6 flex-shrink-0">
                  {selection.type === 'direct' ? (
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white">{selection.user.name}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{selection.user.online ? 'online' : 'offline'}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-black text-slate-900 dark:text-white"># General</p>
                      <p className="text-[11px] text-slate-400">Everyone on the team can see this channel</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                  {selection.type === 'direct' ? (
                    directMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-xs text-slate-400">No messages yet. Say hi 👋</p>
                      </div>
                    ) : directMessages.map(m => {
                      const isMe = m.from === session.username;
                      return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[420px] px-3.5 py-2 text-sm leading-relaxed break-words ${
                            isMe ? 'bg-violet-600 text-white rounded-2xl rounded-br-sm' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-2xl rounded-bl-sm border border-slate-200 dark:border-slate-600'
                          }`}>
                            {m.text}
                          </div>
                          <span className="text-[10px] text-slate-400 mt-1">{isMe ? 'You' : selection.user.name} {fmtTime(m.at)}</span>
                        </div>
                      );
                    })
                  ) : (
                    channelMessages.length === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-xs text-slate-400">No messages yet. Say hi to the team 👋</p>
                      </div>
                    ) : channelMessages.map((m, idx) => {
                      const isMe = m.username === session.username;
                      const nextAt = channelMessages[idx + 1]?.at ?? Infinity;
                      const seenHere = channelReaders.filter(r => r.username !== session.username && r.lastReadAt >= m.at && r.lastReadAt < nextAt);
                      return (
                        <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          {!isMe && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-black ${ROLE_DOT[m.role] ?? 'bg-slate-400'}`}>{m.name[0]?.toUpperCase()}</div>
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{m.name}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[m.role] ?? ''}`}>{m.role}</span>
                            </div>
                          )}
                          <div className={`max-w-[420px] px-3.5 py-2 text-sm leading-relaxed break-words ${
                            isMe ? 'bg-violet-600 text-white rounded-2xl rounded-br-sm' : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-2xl rounded-bl-sm border border-slate-200 dark:border-slate-600'
                          }`}>
                            {m.text}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] text-slate-400">{fmtTime(m.at)}</span>
                            {seenHere.length > 0 && (
                              <span className="text-[10px] text-slate-400" title={`Seen by ${seenHere.map(r => r.name).join(', ')}`}>
                                · Seen by {seenHere.map(r => r.name).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                <form onSubmit={send} className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex gap-2 flex-shrink-0">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type your message..."
                    maxLength={selection.type === 'direct' ? 1000 : 500}
                    className="flex-1 min-w-0 text-sm px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button type="submit" disabled={!input.trim()}
                    className="w-10 h-10 flex-shrink-0 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </form>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
