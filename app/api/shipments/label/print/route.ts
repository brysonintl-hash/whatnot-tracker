import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { whatnot } from '@/lib/whatnot/client';
import * as wnStore from '@/lib/whatnot/store';
import { recordEvent } from '@/lib/shipmentLedger';
import { canHandle, validShipmentId } from '@/lib/shipmentAccess';

export const dynamic = 'force-dynamic';

function page(message: string, status: number) {
  const body = `<!doctype html><meta charset="utf-8"><title>Label</title>
<body style="font-family:system-ui,sans-serif;padding:32px;color:#0f172a">
<p style="font-size:15px">${message}</p><p style="font-size:13px;color:#64748b">You can close this tab.</p></body>`;
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/**
 * Open the label to print. The links Whatnot gives out are signed and expire
 * (the label-plus-packing-slip one within the hour), so the parcel is read
 * fresh each time rather than handing out a stored link.
 *
 * `?doc=label` gives the label alone, for a 4×6 printer; the default adds
 * Whatnot's packing slip so the packer can check the box against it.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return page('Please sign in again, then print from the Shipments page.', 401);
  const id = req.nextUrl.searchParams.get('id');
  if (!validShipmentId(id)) return page('That isn\'t a Whatnot shipment.', 400);
  if (!canHandle(session, id, { print: true })) return page('Only the person this shipment is assigned to, or a manager, can print its label.', 403);

  let fresh;
  try {
    fresh = await whatnot.getShipment(id);
  } catch (e) {
    return page(`Couldn't read the shipment from Whatnot: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
  wnStore.putShipments([fresh]);

  const labelOnly = req.nextUrl.searchParams.get('doc') === 'label';
  const url = labelOnly
    ? fresh.documents?.label_url ?? null
    : fresh.documents?.bundled_url ?? fresh.documents?.label_url ?? null;
  if (!url) return page('This shipment has no label yet. Make the label first, then print it.', 404);

  recordEvent({ shipmentId: id, kind: 'printed', by: session.username, byName: session.name, at: new Date().toISOString(), note: labelOnly ? 'label only' : undefined });
  return NextResponse.redirect(url, 302);
}
