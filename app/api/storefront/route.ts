import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getStorefrontSettings, setHeroImage } from '@/lib/storefrontStore';

// Well above what a resized/compressed upload from the admin page should
// ever produce — just a backstop so one huge photo can't bloat the JSON
// store or trip a proxy body-size limit.
const MAX_IMAGE_LENGTH = 4_000_000;

// Public — the storefront itself needs this with nobody signed in.
export async function GET() {
  return NextResponse.json(getStorefrontSettings());
}

// Admin-only — change or clear the hero banner image.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { heroImage } = await req.json();

  if (heroImage === null) {
    setHeroImage(null);
    return NextResponse.json({ success: true });
  }

  if (typeof heroImage !== 'string' || heroImage.length === 0) {
    return NextResponse.json({ error: 'Provide an image or a link' }, { status: 400 });
  }
  if (heroImage.length > MAX_IMAGE_LENGTH) {
    return NextResponse.json({ error: 'That image is too large — try a smaller photo' }, { status: 400 });
  }
  const isDataUrl = heroImage.startsWith('data:image/');
  const isHttpUrl = /^https?:\/\//i.test(heroImage);
  if (!isDataUrl && !isHttpUrl) {
    return NextResponse.json({ error: 'Enter a valid image link, or upload a file' }, { status: 400 });
  }

  setHeroImage(heroImage);
  return NextResponse.json({ success: true });
}
