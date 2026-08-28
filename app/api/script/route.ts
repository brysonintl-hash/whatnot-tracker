import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';
import { getInventoryData } from '@/lib/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function canUse(role: string) {
  return role === 'admin' || role === 'manager' || role === 'host';
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canUse(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured. Please add it in your Railway environment variables.' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const modelNum: string = (body.modelNum ?? '').trim();
  if (!modelNum) return NextResponse.json({ error: 'Enter a model number' }, { status: 400 });

  const inventory = await getInventoryData();
  const q = modelNum.toLowerCase();
  const item =
    inventory.find(i => i.modelNum.toLowerCase() === q) ||
    inventory.find(i => i.modelNum.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));

  if (!item) {
    return NextResponse.json({ error: `No inventory item found for model number "${modelNum}"` }, { status: 404 });
  }

  const systemPrompt = `You write short spoken sales scripts for a live host selling items on Whatnot (a live-auction shopping platform) for a reseller called Stack Bargains.

Given one product, write a natural, energetic pitch the host can read out loud in about 20 seconds (roughly 55-75 words). It must sound like a real person hyping an item live on camera, not a commercial voiceover or an ad.

Include, woven naturally into the flow (not as labeled sections):
- A punchy opener that names the item
- One or two concrete, believable selling points based on the product name/category
- At least one natural adlib/hype line (things like "guys, you have to grab this", "trust me on this one", "I'm not playing with y'all right now")
- The price, mentioned casually, if given
- A clear call to action to bid/buy right now

If stock is low (3 or fewer left), you can naturally work in urgency about limited stock.

Output ONLY the spoken script text. No headers, no stage directions, no markdown, no quotation marks, no word count, no preamble.`;

  const priceLine = item.retail ? `Price: $${item.retail.toFixed(2)}` : '';
  const stockLine = item.qty ? `In stock: ${item.qty}` : '';
  const userPrompt = [
    `Item: ${item.description || item.modelNum}`,
    `Model #: ${item.modelNum}`,
    priceLine,
    stockLine,
    'Write the 20-second live sales script now.',
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const script = textBlock?.text?.trim() ?? '';

    if (!script) {
      return NextResponse.json({ error: 'Model did not return a script. Try again.' }, { status: 502 });
    }

    return NextResponse.json({
      item: {
        modelNum: item.modelNum,
        description: item.description,
        retail: item.retail,
        imageUrl: item.imageUrl,
        qty: item.qty,
      },
      script,
    });
  } catch (e) {
    console.error('script generation error:', e);
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY is invalid or expired. Please check it in your Railway environment variables.' }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'The AI service is rate limited right now — try again in a moment.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Failed to generate script. Please try again.' }, { status: 500 });
  }
}
