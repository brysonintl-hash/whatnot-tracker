import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLinks, addLink, deleteLink } from '@/lib/knowledgeStore';

function isAllowed(role: string) {
  return role === 'admin' || role === 'manager';
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAllowed(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(getLinks());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !isAllowed(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { title, url, category } = await req.json();
  if (!title || !url) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const link = addLink({ title, url, category: category || 'Other', addedBy: session.name || session.username });
  return NextResponse.json({ success: true, link });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || !isAllowed(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await req.json();
  const deleted = deleteLink(id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
