import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getStorefrontSettings, setHeroSlides, type HeroSlide } from '@/lib/storefrontStore';

// Well above what a resized/compressed upload from the admin page should
// ever produce — just a backstop so one huge photo can't bloat the JSON
// store or trip a proxy body-size limit.
const MAX_IMAGE_LENGTH = 4_000_000;

function validateSlides(slides: unknown): string | null {
  if (!Array.isArray(slides) || slides.length === 0) return 'Provide at least one slide';
  for (const s of slides) {
    if (!s || typeof s !== 'object') return 'Malformed slide data';
    const slide = s as Partial<HeroSlide>;
    if (slide.image != null) {
      if (typeof slide.image !== 'string') return 'Malformed slide image';
      if (slide.image.length > MAX_IMAGE_LENGTH) return 'One of those images is too large — try a smaller photo';
      const isDataUrl = slide.image.startsWith('data:image/');
      const isHttpUrl = /^https?:\/\//i.test(slide.image);
      if (!isDataUrl && !isHttpUrl) return 'Enter a valid image link, or upload a file';
    }
    if (typeof slide.label !== 'string' || typeof slide.status !== 'string') return 'Each slide needs a label and status';
  }
  return null;
}

// Public — the storefront itself needs this with nobody signed in.
export async function GET() {
  return NextResponse.json(getStorefrontSettings());
}

// Admin-only — replace the hero carousel's slides.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { heroSlides } = await req.json();
  const error = validateSlides(heroSlides);
  if (error) return NextResponse.json({ error }, { status: 400 });

  setHeroSlides(heroSlides);
  return NextResponse.json({ success: true });
}
