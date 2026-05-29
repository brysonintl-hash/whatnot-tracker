import type { Role } from './types';
import { getPasswordOverride } from './passwords';

export type { Role };

export type User = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
};

export function getUsers(): User[] {
  return [
    { id: '1', username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123', name: 'Administrator', role: 'admin' },
    { id: '2', username: process.env.MANAGER_USERNAME || 'manager', password: process.env.MANAGER_PASSWORD || 'manager123', name: 'Manager', role: 'manager' },
    { id: '3', username: process.env.SHIPPER_USERNAME || 'shipper', password: process.env.SHIPPER_PASSWORD || 'shipper123', name: 'Shipper', role: 'shipper' },
    { id: '4', username: process.env.HOST_USERNAME || 'host', password: process.env.HOST_PASSWORD || 'host123', name: 'Host', role: 'host' },
  ];
}

export function findUser(username: string, password: string): User | null {
  return getUsers().find(u => {
    const pw = getPasswordOverride(u.username) ?? u.password;
    return u.username === username && pw === password;
  }) ?? null;
}
