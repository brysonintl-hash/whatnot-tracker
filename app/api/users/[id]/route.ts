import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { activateUser, updateUserRole, deleteUser, findById } from '@/lib/userStore';
import type { Role } from '@/lib/types';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { role } = await req.json();
  const user = findById(params.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.username === session.username) return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });

  if (user.status === 'pending') {
    activateUser(params.id, role as Role);
  } else {
    updateUserRole(params.id, role as Role);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = findById(params.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.username === session.username) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });

  deleteUser(params.id);
  return NextResponse.json({ success: true });
}
