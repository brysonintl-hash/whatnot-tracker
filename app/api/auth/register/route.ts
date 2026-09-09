import { NextResponse } from 'next/server';
import { findByUsername, createUser } from '@/lib/userStore';
import { signToken } from '@/lib/auth';

export async function POST(req: Request) {
  const { name, username, password } = await req.json();

  if (!name || !username || !password) return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });

  const existing = await findByUsername(username);
  if (existing) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

  // Everyone signs up as a customer and gets in immediately — staff roles
  // are assigned afterward by an admin on the Users page, not chosen here.
  const user = await createUser({ name, username, password, role: 'customer' });

  const token = await signToken({ username: user.username, role: user.role, name: user.name });
  const res = NextResponse.json({ success: true, role: user.role });
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
