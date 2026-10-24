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
  /**
   * Which name in the WN sheet's host column this account owns, set by an
   * admin in User Management.
   *
   * Account names and sheet host names don't match — "Evon Bantegui" signs in,
   * but the sheet says "Evon" — and guessing the link by name is unsafe: two
   * Williams would both match "William", and a host called "Ann" substring-
   * matches "Joanna". This makes the link explicit, so a host sees their own
   * shows and nobody else's.
   */
  hostName?: string;
};
