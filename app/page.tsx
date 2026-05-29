import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  manager: '/manager',
  employee: '/employee',
  shipper: '/shipper',
  host: '/host',
};

export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect(ROLE_HOME[session.role] ?? '/login');
}
