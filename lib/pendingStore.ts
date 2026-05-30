import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type PendingTask = {
  id: string;
  customerName: string;
  customerLink: string;
  orderId: string;
  description: string;
  trackingNumber: string;
  orderDate: string;
  status: 'open' | 'resolved';
  urgent: boolean;
  followUp: boolean;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'pendings.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function getTasks(): PendingTask[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return [];
}

export function createTask(data: Omit<PendingTask, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'urgent' | 'followUp'>): PendingTask {
  const tasks = getTasks();
  const task: PendingTask = {
    ...data,
    id: Date.now().toString(),
    status: 'open',
    urgent: false,
    followUp: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureDir();
  writeFileSync(FILE, JSON.stringify([task, ...tasks], null, 2));
  return task;
}

export function updateTask(id: string, updates: Partial<Pick<PendingTask, 'status' | 'urgent' | 'followUp' | 'customerName' | 'customerLink' | 'orderId' | 'description' | 'trackingNumber' | 'orderDate'>>): PendingTask | null {
  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() };
  ensureDir();
  writeFileSync(FILE, JSON.stringify(tasks, null, 2));
  return tasks[idx];
}

export function deleteTask(id: string): boolean {
  const tasks = getTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length === tasks.length) return false;
  ensureDir();
  writeFileSync(FILE, JSON.stringify(filtered, null, 2));
  return true;
}
