import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './lib/auth';

// Everything a customer account is allowed to reach — the storefront, their
// cart, and the legal pages. Every internal route (dashboards, inventory,
// sales, messages, etc.) is off-limits. This is enforced once, here, rather
// than per-page, because several pages only ever checked "is someone logged
// in" and not "is this person staff" — which was harmless when every role
// was internal, but not once customer became a real, self-service signup.
const CUSTOMER_ALLOWED = ['/', '/cart', '/privacy', '/terms', '/api/cart'];

function isCustomerAllowed(pathname: string): boolean {
  return CUSTOMER_ALLOWED.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The public storefront landing page, its legal pages (linked from the
  // Google OAuth consent screen), and auth — everyone reaches these,
  // logged in or not.
  if (
    pathname === '/' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('auth_token')?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (session.role === 'customer' && !isCustomerAllowed(pathname)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|json)).*)'],
};
