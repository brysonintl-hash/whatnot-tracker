import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTasks, createTask } from '@/lib/pendingStore';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getTasks());
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { customerName, customerLink, orderId, description, trackingNumber, orderDate } = body;

  if (!customerName?.trim()) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
  }

  const task = createTask({
    customerName: customerName.trim(),
    customerLink: (customerLink ?? '').trim(),
    orderId: (orderId ?? '').trim(),
    description: (description ?? '').trim(),
    trackingNumber: (trackingNumber ?? '').trim(),
    orderDate: (orderDate ?? '').trim(),
    createdBy: session.name || session.username,
    createdByRole: session.role,
  });

  return NextResponse.json({ task });
}
