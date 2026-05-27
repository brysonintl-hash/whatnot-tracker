import { NextRequest, NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

type Host = { id: string; name: string; color: string };

const DEFAULT_HOSTS: Host[] = [
  { id: '1', name: 'Jason', color: '#F59E0B' },
];

export async function GET() {
  const hosts = readData<Host[]>('hosts.json', DEFAULT_HOSTS);
  return NextResponse.json(hosts);
}

export async function POST(req: NextRequest) {
  const { name, color } = await req.json();
  const hosts = readData<Host[]>('hosts.json', DEFAULT_HOSTS);
  const colors = ['#F59E0B', '#DC2626', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899'];
  const newHost: Host = {
    id: Date.now().toString(),
    name,
    color: color || colors[hosts.length % colors.length],
  };
  hosts.push(newHost);
  writeData('hosts.json', hosts);
  return NextResponse.json(newHost);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const hosts = readData<Host[]>('hosts.json', DEFAULT_HOSTS);
  writeData('hosts.json', hosts.filter(h => h.id !== id));
  return NextResponse.json({ success: true });
}
