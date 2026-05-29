import { NextResponse } from 'next/server';
import { findByUsername, createUser } from '@/lib/userStore';

export async function POST(req: Request) {
  const { name, username, password } = await req.json();

  if (!name || !username || !password) return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });

  const existing = findByUsername(username);
  if (existing) return NextResponse.json({ error: 'Username already taken' }, { status: 409 });

  createUser({ name, username, password, role: 'host' });
  return NextResponse.json({ success: true });
}
