import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUsers } from '@/lib/users';
import { getPasswordOverride, setPasswordOverride } from '@/lib/passwords';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { oldPassword, newPassword } = await req.json();
  if (!oldPassword || !newPassword) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (newPassword.length < 6) return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });

  const user = getUsers().find(u => u.username === session.username);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const currentPassword = getPasswordOverride(user.username) ?? user.password;
  if (currentPassword !== oldPassword) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });

  setPasswordOverride(user.username, newPassword);
  return NextResponse.json({ success: true });
}
