import { NextRequest, NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  completedBy: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
};

export async function GET() {
  const todos = readData<Todo[]>('todos.json', []);
  return NextResponse.json(todos);
}

export async function POST(req: NextRequest) {
  const { text, priority } = await req.json();
  const todos = readData<Todo[]>('todos.json', []);
  const newTodo: Todo = {
    id: Date.now().toString(),
    text,
    completed: false,
    completedBy: '',
    priority: priority || 'medium',
    createdAt: new Date().toISOString(),
  };
  todos.unshift(newTodo);
  writeData('todos.json', todos);
  return NextResponse.json(newTodo);
}

export async function PUT(req: NextRequest) {
  const { id, completed, completedBy, text, priority } = await req.json();
  const todos = readData<Todo[]>('todos.json', []);
  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  todos[idx] = { ...todos[idx], ...(text !== undefined && { text }), ...(priority !== undefined && { priority }), ...(completed !== undefined && { completed, completedBy: completed ? completedBy : '' }) };
  writeData('todos.json', todos);
  return NextResponse.json(todos[idx]);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const todos = readData<Todo[]>('todos.json', []);
  writeData('todos.json', todos.filter(t => t.id !== id));
  return NextResponse.json({ success: true });
}
