export type Role = 'admin' | 'manager' | 'employee' | 'shipper' | 'host';

export type StoredUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  status: 'active' | 'pending';
  createdAt: string;
};
