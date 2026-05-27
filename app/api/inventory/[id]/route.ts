import { NextRequest, NextResponse } from 'next/server';
import { updateInventoryItem, deleteInventoryRow } from '@/lib/sheets';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rowIndex = parseInt(params.id);
    const updates = await req.json();
    await updateInventoryItem(rowIndex, updates);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rowIndex = parseInt(params.id);
    await deleteInventoryRow(rowIndex);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
