import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByUsername, findByCredentials, deleteUser } from '@/lib/userStore';

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.role === 'admin') {
    return NextResponse.json({ error: 'Admin accounts cannot be deleted.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { password } = body;

  if (!password) {
    return NextResponse.json({ error: 'Password is required to delete your account.' }, { status: 400 });
  }

  const verified = findByCredentials(session.username, password);
  if (!verified) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 400 });
  }

  const user = findByUsername(session.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  deleteUser(user.id);

  const res = NextResponse.json({ success: true });
  res.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
  return res;
}
