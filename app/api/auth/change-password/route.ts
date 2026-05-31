import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findByUsername, updateUserPassword } from '@/lib/userStore';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (newPassword.length < 4) return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });

  const user = await findByUsername(session.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.password !== currentPassword) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  await updateUserPassword(user.id, newPassword);
  return NextResponse.json({ success: true });
}
