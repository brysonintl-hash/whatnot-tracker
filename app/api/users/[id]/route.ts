import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { activateUser, updateUserRole, updateUserHostName, deleteUser, findById, getAllUsers } from '@/lib/userStore';
import type { Role } from '@/lib/types';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { role, hostName } = await req.json();
  const user = await findById(params.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Linking an account to a sheet host name — separate from role changes, and
  // allowed on your own account since it grants no extra access.
  if (typeof hostName === 'string') {
    const trimmed = hostName.trim();
    if (trimmed) {
      // One sheet host belongs to one account. Without this, two people could
      // claim "William" and both would see the same shows — exactly the
      // ambiguity this field exists to remove.
      const clash = (await getAllUsers()).find(
        u => u.id !== params.id && (u.hostName ?? '').toLowerCase() === trimmed.toLowerCase(),
      );
      if (clash) {
        return NextResponse.json(
          { error: `"${trimmed}" is already linked to ${clash.name} (${clash.username}). Unlink it there first.` },
          { status: 409 },
        );
      }
    }
    await updateUserHostName(params.id, trimmed);
    return NextResponse.json({ success: true });
  }

  if (user.username === session.username) return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });

  if (user.status === 'pending') {
    await activateUser(params.id, role as Role);
  } else {
    await updateUserRole(params.id, role as Role);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const user = await findById(params.id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.username === session.username) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });

  await deleteUser(params.id);
  return NextResponse.json({ success: true });
}
