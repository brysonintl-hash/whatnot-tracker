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

const store = new Map<string, StoredUser>();

function seed() {
  if (store.size > 0) return;
  const defaults: StoredUser[] = [
    { id: '1', username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123', name: 'Administrator', role: 'admin', status: 'active', createdAt: new Date().toISOString() },
    { id: '2', username: process.env.MANAGER_USERNAME || 'manager', password: process.env.MANAGER_PASSWORD || 'manager123', name: 'Manager', role: 'manager', status: 'active', createdAt: new Date().toISOString() },
    { id: '3', username: process.env.SHIPPER_USERNAME || 'shipper', password: process.env.SHIPPER_PASSWORD || 'shipper123', name: 'Shipper', role: 'shipper', status: 'active', createdAt: new Date().toISOString() },
    { id: '4', username: process.env.HOST_USERNAME || 'host', password: process.env.HOST_PASSWORD || 'host123', name: 'Host', role: 'host', status: 'active', createdAt: new Date().toISOString() },
  ];
  defaults.forEach(u => store.set(u.id, u));
}

export function getAllUsers(): StoredUser[] {
  seed();
  return Array.from(store.values());
}

export function findByCredentials(username: string, password: string): StoredUser | null {
  seed();
  return getAllUsers().find(u => u.username === username && u.password === password) ?? null;
}

export function findByUsername(username: string): StoredUser | null {
  seed();
  return getAllUsers().find(u => u.username === username) ?? null;
}

export function findById(id: string): StoredUser | null {
  seed();
  return store.get(id) ?? null;
}

export function createUser(data: { username: string; password: string; name: string; role: Role }): StoredUser {
  seed();
  const user: StoredUser = { ...data, status: 'pending', id: Date.now().toString(), createdAt: new Date().toISOString() };
  store.set(user.id, user);
  return user;
}

export function activateUser(id: string, role: Role): boolean {
  seed();
  const user = store.get(id);
  if (!user) return false;
  store.set(id, { ...user, role, status: 'active' });
  return true;
}

export function updateUserRole(id: string, role: Role): boolean {
  seed();
  const user = store.get(id);
  if (!user) return false;
  store.set(id, { ...user, role });
  return true;
}

export function updateUserPassword(id: string, password: string): boolean {
  seed();
  const user = store.get(id);
  if (!user) return false;
  store.set(id, { ...user, password });
  return true;
}

export function deleteUser(id: string): boolean {
  seed();
  return store.delete(id);
}
