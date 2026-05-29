import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Role } from './types';

export type StoredUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  status: 'active' | 'pending';
  createdAt: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'users.json');

function defaultAdmin(): StoredUser {
  return {
    id: '1',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name: 'Administrator',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

function readFile(): StoredUser[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return [defaultAdmin()];
}

function writeFile(users: StoredUser[]): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('userStore write error:', e);
  }
}

function ensureAdmin(users: StoredUser[]): StoredUser[] {
  const admin = defaultAdmin();
  const idx = users.findIndex(u => u.id === '1');
  if (idx === -1) return [admin, ...users];
  users[idx] = { ...users[idx], username: admin.username, password: admin.password };
  return users;
}

export function getAllUsers(): StoredUser[] {
  const users = ensureAdmin(readFile());
  return users;
}

export function findByCredentials(username: string, password: string): StoredUser | null {
  return getAllUsers().find(u => u.username === username && u.password === password) ?? null;
}

export function findByUsername(username: string): StoredUser | null {
  return getAllUsers().find(u => u.username === username) ?? null;
}

export function findById(id: string): StoredUser | null {
  return getAllUsers().find(u => u.id === id) ?? null;
}

export function createUser(data: { username: string; password: string; name: string; role: Role }): StoredUser {
  const users = getAllUsers();
  const user: StoredUser = { ...data, status: 'pending', id: Date.now().toString(), createdAt: new Date().toISOString() };
  writeFile([...users, user]);
  return user;
}

export function activateUser(id: string, role: Role): boolean {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  users[idx] = { ...users[idx], role, status: 'active' };
  writeFile(users);
  return true;
}

export function updateUserRole(id: string, role: Role): boolean {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  users[idx] = { ...users[idx], role };
  writeFile(users);
  return true;
}

export function updateUserPassword(id: string, password: string): boolean {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  users[idx] = { ...users[idx], password };
  writeFile(users);
  return true;
}

export function deleteUser(id: string): boolean {
  const users = getAllUsers();
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  writeFile(filtered);
  return true;
}
