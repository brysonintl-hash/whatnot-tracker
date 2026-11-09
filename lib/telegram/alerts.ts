// ─── What is worth interrupting someone for ────────────────────────────────
//
// Pure rules over data the sync already holds. Nothing here fetches or sends;
// the runner does that, so these can be tested against fixed rows.
//
// The guiding rule: an alert that fires every day stops being read. Each rule
// below has a threshold, each alert fires once per thing (not once per poll),
// and quiet hours exist because nobody needs a 3am push about a parcel.

import type { WnShipment, WnShow, WnShowAnalytics, WnOrder } from '../whatnot/types';
import { money as m } from '../whatnot/types';
import { esc } from './client';

/**
 * `cancellations` and `messages` are the customer-support streams — buyers
 * waiting on a reply. They are the only two on by default; the rest are
 * opt-in, because a parcel-by-parcel feed buries the one message that matters.
 */
export type AlertStream = 'cancellations' | 'messages' | 'support' | 'fulfillment' | 'milestones';

/**
 * What Whatnot puts in a shipment's required_actions while a buyer's
 * cancellation request waits on the seller. Observed live on 2026-11-09: every
 * "Cancellation requested" thread in the Seller Hub support inbox had it, and
 * the order itself still read pending_fulfillment — so the shipment is the
 * only place the API shows the request at all.
 */
export const PENDING_CANCELLATION = 'order_pending_cancellation';

export type Severity = 'critical' | 'warning' | 'info';

export type Alert = {
  /** Stable across polls: the same problem must not alert twice. */
  key: string;
  stream: AlertStream;
  severity: Severity;
  title: string;
  /** One line of detail; the digest shows this under the title. */
  detail: string;
  url?: string;
  at: string;
  /** Structured fields, for streams that have their own message layout. */
  card?: CancellationCard;
};

export type FulfillmentThresholds = {
  /** Hours after a shipment is created before a missing label is a problem. */
  labelOverdueHours: number;
  /** Hours before the dropoff deadline to start warning. */
  dueSoonHours: number;
};

export const DEFAULT_THRESHOLDS: FulfillmentThresholds = {
  labelOverdueHours: 6,
  dueSoonHours: 12,
};

const hoursBetween = (a: string, b: string) =>
  (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;

/** Shipments that still need a human. */
export function fulfillmentAlerts(
  shipments: WnShipment[],
  now: string,
  th: FulfillmentThresholds = DEFAULT_THRESHOLDS,
): Alert[] {
  const out: Alert[] = [];

  for (const s of shipments) {
    // Anything already on its way, cancelled or replaced is somebody else's
    // problem now. Only open parcels can still be acted on.
    const status = (s.status || '').toLowerCase();
    if (status.includes('cancel') || status.includes('deliver') || status.includes('replac')) continue;

    const shipped = Boolean(s.tracking?.tracking_code);
    const labelled = Boolean(s.documents?.label_url);
    const who = s.recipient?.username ? `@${s.recipient.username}` : 'a buyer';

    // A parcel the buyer has asked to cancel is a support question, not a
    // shipping one — cancellationAlerts reports it. Chasing its label or its
    // deadline here would push someone to ship an order that may be called off.
    if (s.required_actions?.includes(PENDING_CANCELLATION)) continue;

    // Whatnot's own exception list. Whatever it says, it wants attention.
    if (s.required_actions?.length) {
      out.push({
        key: `ship:action:${s.id}:${s.required_actions.join(',')}`,
        stream: 'fulfillment', severity: 'critical',
        title: `Shipment needs action — ${s.required_actions.join(', ')}`,
        detail: `${who} · shipment ${s.id}`,
        url: s.url, at: now,
      });
    }

    if (s.dropoff_due && !shipped) {
      const hoursLeft = hoursBetween(s.dropoff_due, now);
      if (hoursLeft < 0) {
        out.push({
          key: `ship:overdue:${s.id}`,
          stream: 'fulfillment', severity: 'critical',
          title: `Past its drop-off deadline by ${Math.abs(Math.round(hoursLeft))}h`,
          detail: `${who} · shipment ${s.id}${labelled ? '' : ' · no label yet'}`,
          url: s.url, at: now,
        });
      } else if (hoursLeft <= th.dueSoonHours) {
        out.push({
          key: `ship:duesoon:${s.id}`,
          stream: 'fulfillment', severity: 'warning',
          title: `Due for drop-off in ${Math.round(hoursLeft)}h`,
          detail: `${who} · shipment ${s.id}${labelled ? '' : ' · no label yet'}`,
          url: s.url, at: now,
        });
      }
    }

    // A label that never got bought is the most common way a parcel stalls.
    // Only worth saying once the order has had a fair run at it.
    if (!labelled && !shipped && s.created_at) {
      const age = hoursBetween(now, s.created_at);
      if (age >= th.labelOverdueHours) {
        out.push({
          key: `ship:nolabel:${s.id}`,
          stream: 'fulfillment', severity: 'warning',
          title: `No shipping label after ${Math.round(age)}h`,
          detail: `${who} · shipment ${s.id}`,
          url: s.url, at: now,
        });
      }
    }
  }

  return out;
}

/** What the runner could find out about a cancellation's order, for the message. */
export type CancellationDetail = {
  orderId?: string;
  orderUrl?: string;
  items?: string[];
  /** What the buyer bid for the item(s) — not the order total, which adds shipping and tax. */
  price?: number;
};

/** Everything the cancellation message shows for one request. */
export type CancellationCard = {
  buyer: string | null;
  orderId: string | null;
  shipmentId: string;
  item: string | null;
  price: number | null;
  url: string;
};

/**
 * Titles carry two things that are noise in an alert: a "[$169.00]" retail tag
 * in front, which reads like the price paid, and a trailing "#6" lot number.
 */
export function cleanTitle(t: string): string {
  return t.replace(/^\s*\[\$[\d,.]+\]\s*/, '').replace(/\s+#\d+\s*$/, '').trim();
}

/**
 * Buyers waiting on a yes or no to a cancellation.
 *
 * One alert per request: the key is the shipment, so it fires when the
 * request appears and never again while it sits there. Once the seller
 * answers, Whatnot drops the flag and the shipment simply stops matching.
 */
export function cancellationAlerts(
  shipments: WnShipment[],
  details: Record<string, CancellationDetail>,
  now: string,
): Alert[] {
  const out: Alert[] = [];
  for (const s of shipments) {
    if (!s.required_actions?.includes(PENDING_CANCELLATION)) continue;
    const d = details[s.id] ?? {};
    const who = s.recipient?.username ? `@${s.recipient.username}` : 'A buyer';
    const titles = (d.items ?? []).map(cleanTitle).filter(Boolean);
    const what = titles.length
      ? titles.length === 1 ? titles[0] : `${titles[0]} +${titles.length - 1} more`
      : null;

    out.push({
      key: `cancel:${s.id}`,
      stream: 'cancellations',
      severity: 'warning',
      title: `${who} wants to cancel`,
      detail: [
        what,
        d.price != null ? money(d.price) : null,
        d.orderId ? `order ${d.orderId}` : `shipment ${s.id}`,
      ].filter(Boolean).join(' · '),
      // The order page is where the request is approved or declined.
      url: d.orderUrl ?? s.url,
      at: now,
      card: {
        buyer: s.recipient?.username ?? null,
        orderId: d.orderId ?? null,
        shipmentId: s.id,
        item: what,
        price: d.price ?? null,
        url: d.orderUrl ?? s.url,
      },
    });
  }
  return out;
}

/** A show that has finished and been totted up. */
/** A show that ended longer ago than this is history, not news. */
export const MILESTONE_MAX_AGE_HOURS = 48;

export function milestoneAlerts(
  shows: WnShow[],
  analytics: Record<string, WnShowAnalytics>,
  hostOf: (showId: string) => string | null,
  now: string,
  maxAgeHours: number = MILESTONE_MAX_AGE_HOURS,
): Alert[] {
  const out: Alert[] = [];

  for (const s of shows) {
    if (s.status !== 'ended') continue;
    // Without this the first poll announced every show ever held — 324 of them
    // on the first live run — because none had been said before.
    if (maxAgeHours > 0) {
      const ended = s.ended_at ?? s.updated_at;
      if (!ended || hoursBetween(now, ended) > maxAgeHours) continue;
    }
    const a = analytics[s.id];
    // Figures before Whatnot has finished calculating would only have to be
    // corrected later, so the alert waits.
    if (!a || a.calculation_status !== 'GENERATED') continue;

    const host = hostOf(s.id);
    const mins = a.stream_minutes || 0;
    const sales = m(a.sales);
    const perHour = mins > 0 ? (sales / (mins / 60)) : null;
    const give = Math.abs(m(a.giveaway_spend));

    out.push({
      key: `show:ended:${s.id}`,
      stream: 'milestones', severity: 'info',
      title: `Show finished — ${money(sales)} in ${formatMins(mins)}`,
      detail: [
        host ? `Host ${host}` : 'Host not set',
        perHour !== null ? `${money(perHour)}/hr` : null,
        `${a.orders_count} orders`,
        `AOV ${money(m(a.average_order_value))}`,
        `payout ${money(m(a.estimated_earnings))}`,
        give > 0 ? `giveaways ${money(give)}` : null,
      ].filter(Boolean).join(' · '),
      url: s.url, at: now,
    });
  }

  return out;
}

/** A single order large enough to be worth knowing about as it happens. */
export function bigSaleAlerts(orders: WnOrder[], minTotal: number, now: string): Alert[] {
  return orders
    .filter(o => !o.cancelled_at && m(o.amounts?.total) >= minTotal)
    .map(o => ({
      key: `order:big:${o.id}`,
      stream: 'milestones' as AlertStream,
      severity: 'info' as Severity,
      title: `${money(m(o.amounts.total))} order`,
      detail: `@${o.buyer?.username ?? 'buyer'} · order ${o.id}`,
      url: o.url,
      at: now,
    }));
}

/** An email thread the team hasn't seen yet. */
export type MailThread = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
};

export function mailAlerts(threads: MailThread[], stream: AlertStream, now: string): Alert[] {
  return threads.map(t => ({
    key: `mail:${stream}:${t.id}`,
    stream,
    severity: 'warning' as Severity,
    title: t.subject || '(no subject)',
    detail: `${t.from} — ${t.snippet.slice(0, 180)}`,
    at: now,
  }));
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—'
    : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function formatMins(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const r = Math.round(mins % 60);
  return h ? `${h}h ${r}m` : `${r}m`;
}

const ICON: Record<Severity, string> = {
  critical: '🔴',
  warning: '🟠',
  info: '🟢',
};

const STREAM_TITLE: Record<AlertStream, string> = {
  cancellations: 'Cancellation requests',
  messages: 'Buyer messages',
  support: 'Whatnot support',
  fulfillment: 'Fulfillment',
  milestones: 'Shows & sales',
};

/**
 * One digest per poll rather than one message per alert.
 *
 * Telegram allows 20 messages a minute to a group; a backlog of stalled
 * parcels can exceed that on its own, and twenty separate pings would be
 * ignored anyway. Grouping by stream keeps it skimmable.
 */
export function renderDigest(alerts: Alert[], opts: { heading?: string } = {}): string {
  if (!alerts.length) return '';

  // Buyers waiting on a reply first; everything else after.
  const order: AlertStream[] = ['cancellations', 'messages', 'support', 'fulfillment', 'milestones'];
  const sev: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

  const lines: string[] = [];
  if (opts.heading) lines.push(`<b>${esc(opts.heading)}</b>`);

  for (const stream of order) {
    const group = alerts
      .filter(a => a.stream === stream)
      .sort((a, b) => sev[a.severity] - sev[b.severity]);
    if (!group.length) continue;

    lines.push('');
    lines.push(`<b>${esc(STREAM_TITLE[stream])}</b>`);
    for (const a of group) {
      const title = a.url
        ? `<a href="${esc(a.url)}">${esc(a.title)}</a>`
        : esc(a.title);
      lines.push(`${ICON[a.severity]} ${title}`);
      if (a.detail) lines.push(`   <i>${esc(a.detail)}</i>`);
    }
  }

  return lines.join('\n').trim();
}

const dollars = (n: number) =>
  Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Cancellation requests, one block each under a single header.
 *
 *   🚨 STACK BARGAINS | CANCELLATIONS
 *   📋 Pending Requests: 4
 *
 *   🟠 @buyer | #order
 *   📦 Item | $20
 *   🔗 View Order: Open in Whatnot
 *
 * `totalPending` is everything waiting on the seller right now; the blocks are
 * only the ones not announced before, so the header says how many are new when
 * the two differ rather than leaving the numbers to disagree.
 */
export function renderCancellations(alerts: Alert[], totalPending: number): string {
  const cards = alerts.filter(a => a.card);
  if (!cards.length) return '';
  const total = Math.max(totalPending, cards.length);

  const lines = [
    '🚨 <b>STACK BARGAINS | CANCELLATIONS</b>',
    `📋 Pending Requests: <b>${total}</b>${cards.length < total ? ` (${cards.length} new)` : ''}`,
  ];

  for (const a of cards) {
    const c = a.card!;
    lines.push('');
    lines.push(`🟠 ${c.buyer ? `@${esc(c.buyer)}` : 'A buyer'} | ${c.orderId ? `#${esc(c.orderId)}` : `shipment ${esc(c.shipmentId)}`}`);
    if (c.item || c.price != null) {
      lines.push(`📦 ${esc(c.item ?? 'Item unknown')}${c.price != null ? ` | <b>${dollars(c.price)}</b>` : ''}`);
    }
    lines.push(`🔗 <b>View Order:</b> <a href="${esc(c.url)}">Open in Whatnot</a>`);
  }
  return lines.join('\n');
}

/** Alerts outside quiet hours, plus whatever is critical enough to override them. */
export function applyQuietHours(
  alerts: Alert[],
  now: Date,
  quiet: { from: number; to: number } | null,
  timeZone: string,
): { send: Alert[]; held: Alert[] } {
  if (!quiet) return { send: alerts, held: [] };

  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', hourCycle: 'h23',
  }).format(now));

  // from 22 to 7 wraps midnight; from 1 to 5 does not.
  const inQuiet = quiet.from <= quiet.to
    ? hour >= quiet.from && hour < quiet.to
    : hour >= quiet.from || hour < quiet.to;

  if (!inQuiet) return { send: alerts, held: [] };
  // Nothing is urgent enough at 3am: everything waits for morning rather than
  // being dropped, so a parcel that went critical overnight still gets said.
  return { send: [], held: alerts };
}
