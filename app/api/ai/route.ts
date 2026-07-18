import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession } from '@/lib/auth';
import { getSalesData, getInventoryData } from '@/lib/sheets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const question: string = (body.question ?? '').trim();
  const history: { role: 'user' | 'assistant'; content: string }[] = body.history ?? [];

  if (!question) return NextResponse.json({ error: 'Empty question' }, { status: 400 });

  const [sales, inventory] = await Promise.all([
    getSalesData().catch(() => []),
    getInventoryData().catch(() => []),
  ]);

  const totalRevenue = sales.reduce((s, o) => s + o.sold, 0);
  const totalProfit = sales.reduce((s, o) => s + o.profit, 0);
  const dates = Array.from(new Set(sales.map(o => o.tab))).sort();

  const byProduct: Record<string, { revenue: number; profit: number; count: number }> = {};
  sales.forEach(o => {
    const k = o.productName || o.modelNum || 'Unknown';
    if (!byProduct[k]) byProduct[k] = { revenue: 0, profit: 0, count: 0 };
    byProduct[k].revenue += o.sold;
    byProduct[k].profit += o.profit;
    byProduct[k].count++;
  });
  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 20)
    .map(([name, d]) => `${name}: revenue=$${d.revenue.toFixed(2)}, profit=$${d.profit.toFixed(2)}, orders=${d.count}`);

  const byHost: Record<string, { revenue: number; profit: number; count: number }> = {};
  sales.forEach(o => {
    const k = o.host || 'Unknown';
    if (!byHost[k]) byHost[k] = { revenue: 0, profit: 0, count: 0 };
    byHost[k].revenue += o.sold;
    byHost[k].profit += o.profit;
    byHost[k].count++;
  });
  const topHosts = Object.entries(byHost)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10)
    .map(([name, d]) => `${name}: revenue=$${d.revenue.toFixed(2)}, profit=$${d.profit.toFixed(2)}, orders=${d.count}`);

  const recentOrders = sales.slice(-30).map(o =>
    `[${o.tab}] ${o.productName || o.modelNum} | sold=$${o.sold.toFixed(2)} | profit=$${o.profit.toFixed(2)} | host=${o.host || 'N/A'} | buyer=${o.buyer}`
  );

  const inventoryLines = inventory.slice(0, 150).map(i =>
    `${i.modelNum || i.description}: qty=${i.qty}, retail=$${i.retail}`
  );

  const systemPrompt = `You are the AI business assistant for Stack Bargains, an online reseller on Whatnot. You ONLY answer questions based on the business data provided below. You do not answer general knowledge questions or topics unrelated to this business.

If asked about something not in this data, respond: "I don't have that information in the business records."

Keep answers concise and business-focused. Use dollar signs and numbers when referencing financial data.

=== BUSINESS SUMMARY ===
Total orders on record: ${sales.length}
Total revenue: $${totalRevenue.toFixed(2)}
Total profit: $${totalProfit.toFixed(2)}
Overall profit margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
Date range: ${dates[0] ?? 'N/A'} to ${dates[dates.length - 1] ?? 'N/A'}
Total active dates: ${dates.length}

=== TOP 20 PRODUCTS BY REVENUE ===
${topProducts.join('\n')}

=== TOP 10 HOSTS BY REVENUE ===
${topHosts.join('\n')}

=== RECENT 30 ORDERS ===
${recentOrders.join('\n')}

=== INVENTORY (${inventory.length} total items, showing first 150) ===
${inventoryLines.join('\n')}`;

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history.slice(-10),
      { role: 'user', content: question },
    ],
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
