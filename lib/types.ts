export type Role = 'admin' | 'manager' | 'employee' | 'shipper' | 'host' | 'customer';

export type StoredUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  status: 'active' | 'pending';
  createdAt: string;
  email?: string;
  authProvider?: 'local' | 'google';
  googleId?: string;
};
