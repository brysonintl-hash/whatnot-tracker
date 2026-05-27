import { NextRequest, NextResponse } from 'next/server';
import { checkCredentials, signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!checkCredentials(username, password)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await signToken({ username });

  const res = NextResponse.json({ success: true });
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  return res;
}
