import { NextResponse } from 'next/server';
import { findByUsername, createUser } from '@/lib/userStore';
import { signToken } from '@/lib/auth';

export async function POST(req: Request) {
  const { name, username, email, password } = await req.json();

  if (!name || !username || !email || !password) return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });

  const existing = await findByUsername(username);
  if (existing) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

  // Everyone signs up as a customer and gets in immediately — staff roles
  // are assigned afterward by an admin on the Users page, not chosen here.
  // Email is required so "Forgot Password" has somewhere to send a reset
  // link — without it, the account would be permanently unrecoverable.
  const user = await createUser({ name, username, email, password, role: 'customer' });

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
