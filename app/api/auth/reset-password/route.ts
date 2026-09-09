import { NextResponse } from 'next/server';
import { consumeResetToken } from '@/lib/passwordResetStore';
import { findById, updateUserPassword } from '@/lib/userStore';

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));

  if (!token || !password) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

  // Consuming deletes the token whether or not it turns out to be valid,
  // so a token can never be replayed after a failed attempt either.
  const userId = consumeResetToken(token);
  if (!userId) return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });

  const user = await findById(userId);
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  await updateUserPassword(userId, password);
  return NextResponse.json({ success: true });
}
