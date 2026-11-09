import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getRunInventory } from '@/lib/runSheet';
import {
  getCatalog, getOrders, getOrderItems, getBundles, putBundle, deleteBundle,
  getSyncState, storeStats,
} from '@/lib/whatnot/store';
import { buildCatalog, type SheetRow } from '@/lib/whatnot/catalog';
import { allocateKitCost, validateBundle, type Bundle, type AllocationMethod } from '@/lib/whatnot/bundles';
import { hasToken } from '@/lib/whatnot/client';

export const dynamic = 'force-dynamic';

const READ_ROLES = ['admin', 'manager', 'host'];
const WRITE_ROLES = ['admin', 'manager'];

const METHODS: AllocationMethod[] = ['by-retail', 'equal', 'manual'];

/** Cap on rows returned; the page browses and filters, it never totals. */
const CAP = 1000;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !READ_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = new URL(req.url).searchParams;
  const tolerance = Math.max(0, Number(q.get('tolerance')) || 0);

  try {
    const inventory = await getRunInventory();
    const sheet: SheetRow[] = inventory.items.map(i => ({
      modelNum: i.modelNum,
      description: i.description,
      cost: i.cost,
      retail: i.retail,
      startPrice: i.startPrice,
      remaining: i.remaining,
    }));

    const orders = getOrders();
    const orderDates: Record<string, string> = {};
    for (const o of orders) orderDates[o.id] = o.created_at;

    const bundles = getBundles();
    const report = buildCatalog({
      sheet,
      catalog: getCatalog(),
      items: getOrderItems(),
      orderDates,
      bundles,
      stockTolerance: tolerance,
    });

    // Each kit's own breakdown, so the page can show where a piece's cost came
    // from rather than just asserting a number.
    const retailOf = (m: string) => {
      const row = sheet.find(r => r.modelNum.toUpperCase() === m.toUpperCase());
      return row && row.retail > 0 ? row.retail : null;
    };
    const allocations = bundles.map(b => allocateKitCost(b, retailOf));

    return NextResponse.json({
      configured: hasToken(),
      skus: report.skus.slice(0, CAP),
      skuCount: report.skus.length,
      counts: report.counts,
      issues: report.issues,
      bundles,
      allocations,
      inventory: {
        tab: inventory.tab, demo: inventory.demo,
        rows: inventory.items.length, error: inventory.error,
      },
      sync: { ...getSyncState(), stats: storeStats() },
    });
  } catch (e) {
    console.error('whatnot catalog error:', e);
    return NextResponse.json({ error: 'Failed to build the catalog' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !WRITE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === 'delete') {
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    return NextResponse.json({ bundles: deleteBundle(String(body.id)) });
  }

  const now = new Date().toISOString();
  const method: AllocationMethod = METHODS.includes(body.method) ? body.method : 'by-retail';

  const draft: Bundle = {
    id: String(body.id || `kit_${Date.now().toString(36)}`),
    modelNum: String(body.modelNum ?? '').trim(),
    description: String(body.description ?? '').trim(),
    purchaseCost: Number(body.purchaseCost),
    components: Array.isArray(body.components)
      ? body.components
          .map((c: Record<string, unknown>) => ({
            modelNum: String(c.modelNum ?? '').trim(),
            qty: Number(c.qty),
            weight: c.weight === undefined || c.weight === '' ? undefined : Number(c.weight),
          }))
          .filter((c: { modelNum: string }) => c.modelNum)
      : [],
    method,
    createdBy: String(body.createdBy || session.username),
    createdAt: String(body.createdAt || now),
    updatedAt: now,
  };

  const errors = validateBundle(draft);
  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

  const bundles = putBundle(draft);
  return NextResponse.json({ bundle: draft, bundles });
}
