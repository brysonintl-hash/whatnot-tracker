import { NextRequest, NextResponse } from 'next/server';
import { findByUsername } from '@/lib/userStore';
import { createResetToken } from '@/lib/passwordResetStore';
import { buildRawEmail, sendGmail } from '@/lib/gmail';

export async function POST(req: NextRequest) {
  const { username } = await req.json().catch(() => ({}));

  // Always the same response, regardless of what happens below — this
  // endpoint never reveals whether a username exists or has an email on
  // file, only that "if it does, check your inbox."
  const generic = NextResponse.json({ success: true });

  if (!username?.trim()) return generic;

  const user = await findByUsername(username.trim());
  if (!user || !user.email) return generic;

  const token = createResetToken(user.id);
  const appUrl = process.env.APP_URL || new URL(req.url).origin;
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  try {
    const raw = buildRawEmail({
      to: user.email,
      from: process.env.GMAIL_USER_EMAIL || 'brysonintl@gmail.com',
      subject: 'Reset your Stack Bargains password',
      body:
        `Hi ${user.name},\n\n` +
        `Someone requested a password reset for your Stack Bargains account (${user.username}). ` +
        `If this was you, click the link below to choose a new password. This link expires in 1 hour ` +
        `and can only be used once.\n\n${resetLink}\n\n` +
        `If you didn't request this, you can safely ignore this email — your password hasn't changed.`,
    });
    await sendGmail(raw);
  } catch (e) {
    console.error('forgot-password send error:', e);
    // Still return the generic response — a delivery failure shouldn't
    // leak account existence either.
  }

  return generic;
}
