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

export type AlertStream = 'fulfillment' | 'support' | 'messages' | 'milestones';

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

/** A show that has finished and been totted up. */
export function milestoneAlerts(
  shows: WnShow[],
  analytics: Record<string, WnShowAnalytics>,
  hostOf: (showId: string) => string | null,
  now: string,
): Alert[] {
  const out: Alert[] = [];

  for (const s of shows) {
    if (s.status !== 'ended') continue;
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
  fulfillment: 'Fulfillment',
  support: 'Support',
  messages: 'Messages',
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

  const order: AlertStream[] = ['fulfillment', 'support', 'messages', 'milestones'];
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
