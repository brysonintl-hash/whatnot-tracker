import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';
import { findByGoogleId, findByEmail, createGoogleUser, linkGoogleId } from '@/lib/userStore';

type GoogleProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const savedState = req.cookies.get('oauth_state')?.value;
  const appUrl = process.env.APP_URL || new URL(req.url).origin;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/login?error=google_auth_failed`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/login?error=google_not_configured`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${await tokenRes.text()}`);
    const tokens: { access_token: string } = await tokenRes.json();

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) throw new Error('userinfo fetch failed');
    const profile: GoogleProfile = await profileRes.json();

    if (!profile.email || !profile.email_verified) {
      return NextResponse.redirect(`${appUrl}/login?error=google_email_unverified`);
    }

    let user = await findByGoogleId(profile.sub);
    if (!user) {
      const existing = await findByEmail(profile.email);
      if (existing) {
        await linkGoogleId(existing.id, profile.sub);
        user = { ...existing, googleId: profile.sub };
      }
    }
    if (!user) {
      user = await createGoogleUser({ email: profile.email, name: profile.name || profile.email, googleId: profile.sub });
    }

    // Customers land back on the storefront, not a role-named dashboard
    // route (there isn't one — the storefront at "/" is their home).
    const dest =
      user.status === 'pending' ? '/login?registered=1'
      : user.role === 'customer' ? '/'
      : `/${user.role}`;
    const res = NextResponse.redirect(`${appUrl}${dest}`);
    res.cookies.delete('oauth_state');

    if (user.status !== 'pending') {
      const token = await signToken({ username: user.username, role: user.role, name: user.name });
      res.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    }
    return res;
  } catch (e) {
    console.error('Google OAuth error:', e);
    return NextResponse.redirect(`${appUrl}/login?error=google_auth_failed`);
  }
}
