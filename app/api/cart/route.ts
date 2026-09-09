import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCart, addToCart, setQty, removeFromCart } from '@/lib/cartStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ items: getCart(session.username) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sku, name, price } = await req.json();
  if (!sku || !name || typeof price !== 'number') {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  const items = addToCart(session.username, { sku, name, price });
  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sku, qty } = await req.json();
  if (!sku || typeof qty !== 'number') return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const items = setQty(session.username, sku, qty);
  return NextResponse.json({ items });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sku } = await req.json();
  if (!sku) return NextResponse.json({ error: 'Missing sku' }, { status: 400 });
  const items = removeFromCart(session.username, sku);
  return NextResponse.json({ items });
}
