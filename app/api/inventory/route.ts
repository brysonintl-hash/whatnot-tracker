import { NextRequest, NextResponse } from 'next/server';
import { getInventoryData, addInventoryItem } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getInventoryData();
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const item = await req.json();
    await addInventoryItem(item);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }
}
