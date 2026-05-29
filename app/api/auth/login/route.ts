import { NextRequest, NextResponse } from 'next/server';
import { findByCredentials } from '@/lib/userStore';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const user = findByCredentials(username, password);

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signToken({ username: user.username, role: user.role, name: user.name });
  const res = NextResponse.json({ success: true, role: user.role });
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
