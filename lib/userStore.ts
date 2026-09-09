import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import type { Role, StoredUser } from './types';
import { readUsersFromSheet, writeUsersToSheet } from './sheetsUsers';

export type { StoredUser };

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'users.json');

// In-memory cache — shared across all requests in the same Node.js process
let cache: StoredUser[] | null = null;
let loadPromise: Promise<StoredUser[]> | null = null;

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

function readFromFile(): StoredUser[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return [defaultAdmin()];
}

function writeToFile(users: StoredUser[]): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('userStore file write error:', e);
  }
}

function ensureAdmin(users: StoredUser[]): StoredUser[] {
  const admin = defaultAdmin();
  const idx = users.findIndex(u => u.id === '1');
  if (idx === -1) return [admin, ...users];
  users[idx] = { ...users[idx], username: admin.username, password: admin.password };
  return users;
}

async function loadUsers(): Promise<StoredUser[]> {
  const sheetsUsers = await readUsersFromSheet();
  if (sheetsUsers !== null) {
    const users = ensureAdmin(sheetsUsers);
    // If admin was missing, write it back to Sheets
    if (!sheetsUsers.some(u => u.id === '1')) {
      writeUsersToSheet(users).catch(() => {});
    }
    // Also keep file in sync as backup
    writeToFile(users);
    return users;
  }
  // Sheets unavailable — use local file
  return ensureAdmin(readFromFile());
}

async function getCache(): Promise<StoredUser[]> {
  if (cache !== null) return cache;
  if (!loadPromise) {
    loadPromise = loadUsers().then(users => {
      cache = users;
      loadPromise = null;
      return users;
    });
  }
  return loadPromise;
}

async function save(users: StoredUser[]): Promise<void> {
  cache = users;
  writeToFile(users); // fast local backup
  await writeUsersToSheet(users); // primary Sheets store
}

export async function getAllUsers(): Promise<StoredUser[]> {
  return getCache();
}

export async function findByCredentials(username: string, password: string): Promise<StoredUser | null> {
  const users = await getCache();
  return users.find(u => u.username === username && u.password === password) ?? null;
}

export async function findByUsername(username: string): Promise<StoredUser | null> {
  const users = await getCache();
  return users.find(u => u.username === username) ?? null;
}

export async function findById(id: string): Promise<StoredUser | null> {
  const users = await getCache();
  return users.find(u => u.id === id) ?? null;
}

export async function findByGoogleId(googleId: string): Promise<StoredUser | null> {
  const users = await getCache();
  return users.find(u => u.googleId === googleId) ?? null;
}

export async function findByEmail(email: string): Promise<StoredUser | null> {
  const users = await getCache();
  return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

// Google-authenticated users never use their password (login bypasses
// findByCredentials entirely), so a random value just satisfies the field.
//
// New sign-ups are customers by default — instant access to shop, no
// admin approval needed, since a customer role has zero internal access
// anyway. An admin promotes someone to a staff role afterward (Users
// page) if they turn out to be an employee.
export async function createGoogleUser(data: { email: string; name: string; googleId: string }): Promise<StoredUser> {
  const users = await getCache();
  const user: StoredUser = {
    id: Date.now().toString(),
    username: data.email,
    password: randomBytes(32).toString('hex'),
    name: data.name,
    email: data.email,
    role: 'customer',
    status: 'active',
    authProvider: 'google',
    googleId: data.googleId,
    createdAt: new Date().toISOString(),
  };
  await save([...users, user]);
  return user;
}

export async function linkGoogleId(id: string, googleId: string): Promise<boolean> {
  const users = await getCache();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  const updated = [...users];
  updated[idx] = { ...updated[idx], googleId };
  await save(updated);
  return true;
}

// Same instant-access reasoning as createGoogleUser — see the comment above it.
export async function createUser(data: { username: string; password: string; name: string; role: Role }): Promise<StoredUser> {
  const users = await getCache();
  const user: StoredUser = { ...data, status: 'active', id: Date.now().toString(), createdAt: new Date().toISOString() };
  await save([...users, user]);
  return user;
}

export async function activateUser(id: string, role: Role): Promise<boolean> {
  const users = await getCache();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  const updated = [...users];
  updated[idx] = { ...updated[idx], role, status: 'active' };
  await save(updated);
  return true;
}

export async function updateUserRole(id: string, role: Role): Promise<boolean> {
  const users = await getCache();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  const updated = [...users];
  updated[idx] = { ...updated[idx], role };
  await save(updated);
  return true;
}

export async function updateUserPassword(id: string, password: string): Promise<boolean> {
  const users = await getCache();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return false;
  const updated = [...users];
  updated[idx] = { ...updated[idx], password };
  await save(updated);
  return true;
}

export async function deleteUser(id: string): Promise<boolean> {
  const users = await getCache();
  const filtered = users.filter(u => u.id !== id);
  if (filtered.length === users.length) return false;
  await save(filtered);
  return true;
}

export function invalidateCache(): void {
  cache = null;
}
