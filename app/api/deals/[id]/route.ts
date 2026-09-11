import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateDeal, deleteDeal } from '@/lib/dealsStore';

const MAX_IMAGE_LENGTH = 4_000_000;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  if (typeof body.price === 'number' && body.price < 0) return NextResponse.json({ error: 'Enter a valid price' }, { status: 400 });
  if (typeof body.wasPrice === 'number' && body.wasPrice < 0) return NextResponse.json({ error: 'Enter a valid original price' }, { status: 400 });
  if (typeof body.image === 'string' && body.image) {
    if (body.image.length > MAX_IMAGE_LENGTH) return NextResponse.json({ error: 'That image is too large — try a smaller photo' }, { status: 400 });
    const isDataUrl = body.image.startsWith('data:image/');
    const isHttpUrl = /^https?:\/\//i.test(body.image);
    if (!isDataUrl && !isHttpUrl) return NextResponse.json({ error: 'Enter a valid image link, or upload a file' }, { status: 400 });
  }
  if (body.specs && Array.isArray(body.specs)) {
    body.specs = body.specs.filter((s: unknown) => typeof s === 'string' && s.trim());
  }

  const updated = updateDeal(params.id, body);
  if (!updated) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const removed = deleteDeal(params.id);
  if (!removed) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
