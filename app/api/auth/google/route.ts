import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// Starts the Google OAuth flow. The same entry point serves both "Sign in
// with Google" and "Sign up with Google" — the callback creates an account
// automatically the first time a given Google identity shows up.
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL('/login?error=google_not_configured', req.url));
  }

  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/auth/google/callback`;
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
