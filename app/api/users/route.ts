import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllUsers } from '@/lib/userStore';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = (await getAllUsers()).map(({ password: _pw, ...u }) => u);
  return NextResponse.json(users);
}
