import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import {
  CartProvider, SiteHeader, Hero, BrandStrip, ValueProps, FlashDeals, CategoryGrid,
  ProClubBanner, SiteFooter,
} from '@/components/landing';

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  manager: '/manager',
  shipper: '/shipper',
  host: '/host',
};

export default async function Home() {
  // Staff land on their dashboard, same as before. Everyone else — the
  // storefront's actual audience — gets the public landing page.
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.role] ?? '/login');

  return (
    <CartProvider>
      <SiteHeader />
      <main className="w-full min-h-screen bg-background pt-28">
        <Hero />
        <BrandStrip />
        <ValueProps />
        <FlashDeals />
        <CategoryGrid />
        <ProClubBanner />
      </main>
      <SiteFooter />
    </CartProvider>
  );
}
