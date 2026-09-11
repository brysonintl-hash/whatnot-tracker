import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDeals, createDeal } from '@/lib/dealsStore';

// Well above what a resized/compressed upload should ever produce — just a
// backstop so one huge photo can't bloat the JSON store.
const MAX_IMAGE_LENGTH = 4_000_000;

function validate(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Missing product details';
  if (!body.name || typeof body.name !== 'string') return 'Product name is required';
  if (!body.sku || typeof body.sku !== 'string') return 'SKU is required';
  if (typeof body.price !== 'number' || body.price < 0) return 'Enter a valid price';
  if (typeof body.wasPrice !== 'number' || body.wasPrice < 0) return 'Enter a valid original price';
  if (body.image && typeof body.image === 'string') {
    if (body.image.length > MAX_IMAGE_LENGTH) return 'That image is too large — try a smaller photo';
    const isDataUrl = body.image.startsWith('data:image/');
    const isHttpUrl = /^https?:\/\//i.test(body.image);
    if (!isDataUrl && !isHttpUrl) return 'Enter a valid image link, or upload a file';
  }
  return null;
}

// Public — the storefront's Hot Deals section needs this for every shopper,
// signed in or not.
export async function GET() {
  return NextResponse.json(getDeals());
}

// Admin-only — add a new deal.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const error = validate(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const deal = createDeal({
    sku: body.sku,
    brand: body.brand || '',
    line: body.line || '',
    name: body.name,
    image: body.image || '',
    specs: Array.isArray(body.specs) ? body.specs.filter((s: unknown) => typeof s === 'string' && s.trim()) : [],
    rating: typeof body.rating === 'number' ? body.rating : 5,
    reviews: typeof body.reviews === 'number' ? body.reviews : 0,
    price: body.price,
    wasPrice: body.wasPrice,
    description: body.description || '',
  });
  return NextResponse.json(deal);
}
