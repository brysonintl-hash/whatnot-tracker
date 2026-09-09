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
  // Staff land on their dashboard, same as before. Customers (and anyone
  // signed out) see the storefront itself — this is their home page, not
  // a waypoint to redirect away from.
  const session = await getSession();
  if (session && ROLE_HOME[session.role]) redirect(ROLE_HOME[session.role]);

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
