'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';

type Todo = {
  id: string; text: string; completed: boolean; completedBy: string;
  priority: 'high' | 'medium' | 'low'; createdAt: string;
};

const PRIORITY_STYLES = {
  high: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', label: 'HIGH' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', label: 'MED' },
  low: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', label: 'LOW' },
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [name, setName] = useState('');
  const [nameSet, setNameSet] = useState(false);
  const [adding, setAdding] = useState(false);

  async function load() {
    const res = await fetch('/api/todos');
    setTodos(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const saved = localStorage.getItem('sb_name');
    if (saved) { setName(saved); setNameSet(true); }
  }, []);

  function saveName() {
    if (!name.trim()) return;
    localStorage.setItem('sb_name', name.trim());
    setNameSet(true);
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setAdding(true);
    await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), priority }),
    });
    setText('');
    await load();
    setAdding(false);
  }

  async function toggleTodo(todo: Todo) {
    await fetch('/api/todos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: todo.id, completed: !todo.completed, completedBy: name || 'Team' }),
    });
    await load();
  }

  async function deleteTodo(id: string) {
    await fetch('/api/todos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const pending = todos.filter(t => !t.completed);
  const done = todos.filter(t => t.completed);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0d1117]">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Daily To-Do</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{pending.length} tasks remaining</p>
          </div>
          {/* Name badge */}
          {nameSet ? (
            <div className="flex items-center gap-2">
              <div className="bg-amber-400 text-gray-900 font-black text-sm px-3 py-1.5 rounded-lg">
                {name}
              </div>
              <button onClick={() => { setNameSet(false); setName(''); localStorage.removeItem('sb_name'); }}
                className="text-gray-400 hover:text-gray-600 text-xs">change</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name..." className="text-sm w-32"
                onKeyDown={e => e.key === 'Enter' && saveName()}
              />
              <button onClick={saveName} className="btn-primary text-sm py-1.5 px-3">Set</button>
            </div>
          )}
        </div>

        {/* Add task form */}
        <div className="card p-5 mb-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">Add New Task</h2>
          <form onSubmit={addTodo} className="space-y-3">
            <input
              type="text" value={text} onChange={e => setText(e.target.value)}
              placeholder="What needs to be done today?" className="w-full"
              required
            />
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Priority:</span>
              {(['high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p} type="button" onClick={() => setPriority(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    priority === p
                      ? `${PRIORITY_STYLES[p].bg} ${PRIORITY_STYLES[p].text} ${PRIORITY_STYLES[p].border}`
                      : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400 dark:bg-[#21262d] dark:border-[#30363d] dark:text-gray-400'
                  }`}
                >
                  {PRIORITY_STYLES[p].label}
                </button>
              ))}
              <button type="submit" disabled={adding} className="btn-primary ml-auto text-sm py-1.5">
                {adding ? 'Adding...' : '+ Add Task'}
              </button>
            </div>
          </form>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading tasks...</div>
        ) : (
          <>
            {/* Pending tasks */}
            {pending.length === 0 && (
              <div className="card p-8 text-center mb-4">
                <div className="text-4xl mb-2">🎉</div>
                <p className="font-bold text-gray-700 dark:text-gray-300">All tasks done! Great work!</p>
              </div>
            )}
            <div className="space-y-2 mb-6">
              {['high', 'medium', 'low'].map(pri =>
                pending.filter(t => t.priority === pri).map(todo => (
                  <div key={todo.id}
                    className={`card p-4 border-l-4 ${
                      todo.priority === 'high' ? 'border-l-red-500' :
                      todo.priority === 'medium' ? 'border-l-amber-400' : 'border-l-gray-400'
                    }`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleTodo(todo)}
                        className="mt-0.5 w-5 h-5 rounded border-2 border-gray-400 flex items-center justify-center shrink-0 hover:border-amber-400 transition-colors">
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{todo.text}</p>
                        <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_STYLES[todo.priority].bg} ${PRIORITY_STYLES[todo.priority].text}`}>
                          {PRIORITY_STYLES[todo.priority].label} PRIORITY
                        </span>
                      </div>
                      <button onClick={() => deleteTodo(todo.id)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Completed */}
            {done.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-500 text-sm uppercase tracking-wide mb-2">Completed ({done.length})</h2>
                <div className="space-y-2">
                  {done.map(todo => (
                    <div key={todo.id} className="card p-4 opacity-60">
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleTodo(todo)}
                          className="mt-0.5 w-5 h-5 rounded border-2 border-amber-400 bg-amber-400 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-500 line-through text-sm">{todo.text}</p>
                          {todo.completedBy && <p className="text-xs text-gray-400 mt-0.5">Done by {todo.completedBy}</p>}
                        </div>
                        <button onClick={() => deleteTodo(todo.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
