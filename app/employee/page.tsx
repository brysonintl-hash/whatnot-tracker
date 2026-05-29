'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

type Session = { username: string; role: string; name: string };

const TASKS = [
  { id: 1, label: 'Sort incoming shipments — Aisle 3', priority: 'High', done: false },
  { id: 2, label: 'Update inventory count — Electronics shelf', priority: 'Medium', done: true },
  { id: 3, label: 'Pack 12 WhatNot orders for today\'s show', priority: 'High', done: false },
  { id: 4, label: 'Label items for FBM queue', priority: 'Low', done: false },
  { id: 5, label: 'Submit end-of-day report', priority: 'Medium', done: false },
];

const ATTENDANCE = [
  { day: 'Mon', in: '8:02 AM', out: '5:01 PM', hrs: '8h 59m', status: 'On Time' },
  { day: 'Tue', in: '8:15 AM', out: '5:00 PM', hrs: '8h 45m', status: 'On Time' },
  { day: 'Wed', in: '9:02 AM', out: '6:00 PM', hrs: '8h 58m', status: 'Late' },
  { day: 'Thu', in: '7:58 AM', out: '5:03 PM', hrs: '9h 05m', status: 'On Time' },
  { day: 'Fri', in: '--', out: '--', hrs: '--', status: 'Today' },
];

export default function EmployeePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockTime, setClockTime] = useState('');
  const [tasks, setTasks] = useState(TASKS);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(s => {
      if (!s || s.role !== 'employee') { router.push('/login'); return; }
      setSession(s);
    });
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function toggleClock() {
    if (!clockedIn) setClockTime(now.toLocaleTimeString());
    setClockedIn(v => !v);
  }

  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const completed = tasks.filter(t => t.done).length;

  if (!session) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="text-slate-400 text-sm">Loading...</div></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <Sidebar role="employee" userName={session.name} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900">My Dashboard</h1>
            <p className="text-xs text-slate-400">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">Employee</span>
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-black text-sm">{session.name[0]}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Welcome */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 mb-6 flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'},</p>
              <h2 className="text-white text-2xl font-black">{session.name} 👋</h2>
              <p className="text-slate-400 text-xs mt-1">{completed} of {tasks.length} tasks completed today</p>
            </div>
            <div className="text-right">
              <div className="text-amber-400 text-3xl font-black font-mono">{timeStr}</div>
              <div className={`text-xs font-bold mt-1 ${clockedIn ? 'text-emerald-400' : 'text-slate-500'}`}>
                {clockedIn ? `● Clocked in at ${clockTime}` : '○ Not clocked in'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Time Clock */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: clockedIn ? '#d1fae5' : '#f1f5f9' }}>
                <svg className="w-7 h-7" style={{ color: clockedIn ? '#10b981' : '#94a3b8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">{clockedIn ? 'Currently Clocked In' : 'Not Clocked In'}</p>
              {clockedIn && <p className="text-xs text-slate-400 mb-4">Since {clockTime}</p>}
              <button
                onClick={toggleClock}
                className={`w-full py-3 rounded-xl font-black text-sm transition-colors ${
                  clockedIn
                    ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                    : 'bg-emerald-400 text-white hover:bg-emerald-500'
                }`}
              >
                {clockedIn ? 'Clock Out' : 'Clock In'}
              </button>
            </div>

            {/* Stats */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {[
                { label: 'Hours This Week', value: '35h 47m', icon: '⏱', color: 'text-blue-500', bg: 'bg-blue-50' },
                { label: 'Tasks Completed', value: `${completed}/${tasks.length}`, icon: '✅', color: 'text-emerald-500', bg: 'bg-emerald-50' },
                { label: 'Attendance Rate', value: '96%', icon: '📅', color: 'text-amber-500', bg: 'bg-amber-50' },
                { label: 'Performance Score', value: '94/100', icon: '⭐', color: 'text-violet-500', bg: 'bg-violet-50' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center text-base mb-3`}>{s.icon}</div>
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tasks */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900 text-sm">Today's Tasks</h2>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-bold">{completed}/{tasks.length}</span>
              </div>
              <div className="space-y-2">
                {tasks.map(task => (
                  <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${task.done ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'}`}>
                    <button
                      onClick={() => setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done: !t.done } : t))}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${task.done ? 'bg-emerald-400 border-emerald-400' : 'border-slate-300 hover:border-emerald-400'}`}
                    >
                      {task.done && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </button>
                    <span className={`text-sm flex-1 ${task.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{task.label}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${task.priority === 'High' ? 'bg-red-50 text-red-600' : task.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>{task.priority}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Attendance */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="font-bold text-slate-900 text-sm mb-4">This Week's Attendance</h2>
              <div className="space-y-2">
                {ATTENDANCE.map(a => (
                  <div key={a.day} className={`flex items-center gap-3 p-3 rounded-lg ${a.status === 'Today' ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${a.status === 'Today' ? 'bg-amber-400 text-slate-900' : 'bg-white border border-slate-200 text-slate-500'}`}>{a.day}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">{a.in} → {a.out}</span>
                        <span className="text-xs font-bold text-slate-500">{a.hrs}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status === 'On Time' ? 'bg-emerald-50 text-emerald-600' : a.status === 'Late' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
