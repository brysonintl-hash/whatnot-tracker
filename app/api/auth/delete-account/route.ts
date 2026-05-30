import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByUsername, deleteUser } from '@/lib/userStore';

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.role === 'admin') {
    return NextResponse.json({ error: 'Admin accounts cannot be deleted.' }, { status: 403 });
  }

  const user = findByUsername(session.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  deleteUser(user.id);

  const res = NextResponse.json({ success: true });
  res.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
  return res;
}
