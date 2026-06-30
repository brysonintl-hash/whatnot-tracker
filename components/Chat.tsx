'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ChatMessage {
  id: string;
  username: string;
  name: string;
  role: string;
  text: string;
  at: number;
}

interface OnlineUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface Toast {
  id: string;
  name: string;
  role: string;
}

const ROLE_DOT: Record<string, string> = {
  admin: 'bg-red-500',
  manager: 'bg-blue-500',
  shipper: 'bg-violet-500',
  host: 'bg-amber-500',
  employee: 'bg-emerald-500',
};

const ROLE_BADGE: Record<string, string> = {
  admin: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
  manager: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
  shipper: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30',
  host: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  employee: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
};

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [myUsername, setMyUsername] = useState('');
  const sinceRef = useRef(0);
  const prevOnlineIds = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  openRef.current = open;

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (s?.username) setMyUsername(s.username);
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat?since=${sinceRef.current}`);
      if (!r.ok) return;
      const data = await r.json();
      const msgs: ChatMessage[] = data.messages ?? [];
      if (msgs.length === 0) return;
      sinceRef.current = msgs[msgs.length - 1].at;
      setMessages(prev => [...prev, ...msgs].slice(-100));
      if (!openRef.current) setUnread(u => u + msgs.length);
    } catch {}
  }, []);

  const fetchOnline = useCallback(async () => {
    try {
      const r = await fetch('/api/presence/online');
      if (!r.ok) return;
      const data = await r.json();
      const users: OnlineUser[] = data.users ?? [];
      setOnlineUsers(users);

      // Toast for newly online users
      users.forEach(u => {
        if (!prevOnlineIds.current.has(u.id)) {
          const tid = Math.random().toString(36).slice(2);
          setToasts(prev => [...prev, { id: tid, name: u.name, role: u.role }]);
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 4500);
        }
      });
      prevOnlineIds.current = new Set(users.map(u => u.id));
    } catch {}
  }, []);

  useEffect(() => {
    if (!myUsername) return;
    // Initial load — no since filter to get recent messages
    fetch('/api/chat?since=0').then(r => r.json()).then(data => {
      const msgs: ChatMessage[] = data.messages ?? [];
      if (msgs.length) {
        sinceRef.current = msgs[msgs.length - 1].at;
        setMessages(msgs.slice(-100));
      }
    }).catch(() => {});

    fetchOnline();
    const msgTimer = setInterval(fetchMessages, 2000);
    const onlineTimer = setInterval(fetchOnline, 10000);
    return () => { clearInterval(msgTimer); clearInterval(onlineTimer); };
  }, [myUsername, fetchMessages, fetchOnline]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {}
  }

  return (
    <>
      {/* Online toasts — stack above the chat button */}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none" style={{ maxWidth: 260 }}>
        {toasts.map(t => (
          <div key={t.id}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3"
            style={{ animation: 'slideInRight 0.3s ease' }}>
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse ${ROLE_DOT[t.role] ?? 'bg-slate-400'}`} />
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{t.name} is online</p>
              <p className="text-[10px] text-slate-400 capitalize mt-0.5">{t.role}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-[9998] w-80 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-hidden"
          style={{ height: 460 }}>

          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0 bg-white dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Team Chat</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {onlineUsers.map(u => (
                    <div key={u.id} title={`${u.name} (${u.role})`}
                      className={`w-2 h-2 rounded-full ${ROLE_DOT[u.role] ?? 'bg-slate-400'}`} />
                  ))}
                  <span className="text-[10px] text-slate-400">{onlineUsers.length} online now</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-slate-400 text-center">No messages yet.<br />Say hi to the team! 👋</p>
              </div>
            )}
            {messages.map(msg => {
              const isMe = msg.username === myUsername;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-black flex-shrink-0 ${ROLE_DOT[msg.role] ?? 'bg-slate-400'}`}>
                        {msg.name[0]?.toUpperCase()}
                      </div>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{msg.name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[msg.role] ?? ''}`}>{msg.role}</span>
                    </div>
                  )}
                  <div className={`max-w-[210px] px-3 py-2 text-xs leading-relaxed break-words ${
                    isMe
                      ? 'bg-violet-600 text-white rounded-2xl rounded-br-sm'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white rounded-2xl rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-0.5">{fmt(msg.at)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={send} className="px-3 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2 flex-shrink-0 bg-white dark:bg-slate-800">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message the team..."
              maxLength={500}
              className="flex-1 min-w-0 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button type="submit" disabled={!input.trim()}
              className="w-8 h-8 flex-shrink-0 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Floating chat button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-[9998] w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/50 flex items-center justify-center transition-all hover:scale-105 active:scale-95">
        {open ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <style jsx global>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
