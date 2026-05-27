import { NextResponse } from 'next/server';
import { getSalesData } from '@/lib/sheets';

export async function GET() {
  try {
    const data = await getSalesData();
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 });
  }
}
