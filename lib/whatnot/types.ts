// ─── Whatnot Seller API response shapes ────────────────────────────────────
//
// Written from live responses on 2026-11-08, not from the published reference,
// which lists endpoints but not fields. Anything marked UNVERIFIED was never
// seen with a value in the sample and is typed optional on purpose.
//
// Base URL: https://api.whatnot.com/seller-api/rest/v2
// Auth:     Authorization: Bearer wn_pat_tk_...

/** Every money figure comes back as a decimal STRING, never a number. */
export type WnMoney = { amount: string; currency: string };

/** List endpoints are cursor-paged. `next_cursor` is null on the last page. */
export type WnPage<T> = { data: T[]; next_cursor: string | null };

export type WnImage = { id: string; url: string; alt: string | null };

export type WnUserRef = { id: string; username: string; display_name: string };

// ─── Orders ─────────────────────────────────────────────────────────────────

/** Observed: 'pending_fulfillment'. Others exist but were not sampled. */
export type WnOrderStatus = string;

export type WnOrder = {
  id: string;
  url: string;
  status: WnOrderStatus;
  /** The livestream this order came from. Present on every sampled order. */
  show_id: string | null;
  /** Observed: 'auction'. Buy-it-now and giveaway values exist but weren't sampled. */
  transaction_type: string;
  buyer: WnUserRef;
  amounts: {
    subtotal: WnMoney;
    shipping: WnMoney;
    tax: WnMoney;
    applied_discount: WnMoney | null;
    total: WnMoney;
  };
  /** ISO 8601 with milliseconds — precise enough to order a show's items. */
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

export type WnOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  /**
   * Our own identifiers, echoed back onto the sale. Null across the whole
   * catalogue today — populating them is what turns the cost lookup from a
   * fuzzy model-number match into an exact one.
   */
  product_external_id: string | null;
  variant_external_id: string | null;
  purchased_item: {
    title: string;
    description: string;
    sku: string | null;
  };
  quantity: number;
  unit_price: WnMoney;
  price_includes_tax: boolean;
  /** Links the sale straight to its parcel. */
  shipment_id: string | null;
};

// ─── Shows ──────────────────────────────────────────────────────────────────

export type WnShowStatus = 'scheduled' | 'live' | 'stopped' | 'ended' | 'cancelled';

/**
 * Note what is NOT here: a host. Everything streams under one account, so the
 * API cannot say who was on camera. That mapping lives in hostAssignments.json.
 */
export type WnShow = {
  id: string;
  title: string;
  url: string;
  description: string;
  status: WnShowStatus;
  visibility: string;
  scheduled_start_at: string | null;
  ended_at: string | null;
  thumbnail: WnImage | null;
  created_at: string;
  updated_at: string;
};

// ─── Analytics ──────────────────────────────────────────────────────────────

/**
 * One call per show. `calculation_status` is 'GENERATED' once Whatnot has
 * finished totting a show up; a show that just ended may not be ready yet.
 */
export type WnShowAnalytics = {
  show_id: string;
  title: string;
  /** When the stream actually went live, which is not scheduled_start_at. */
  start_time: string;
  calculation_status: string;
  sales: WnMoney;
  /** Takings after Whatnot's cut — the payout, not the headline. */
  estimated_earnings: WnMoney;
  orders_count: number;
  average_order_value: WnMoney;
  giveaway_orders_count: number;
  /** Comes back negative: what the giveaways cost. */
  giveaway_spend: WnMoney;
  show_impression_count: number;
  show_clickthrough_rate: number;
  buyers_count: number;
  first_time_buyers_count: number;
  returning_buyers_count: number;
  giveaway_winners_count: number;
  first_time_giveaway_winners_count: number;
  returning_giveaway_winners_count: number;
  buyer_shares_count: number;
  /** Real time on air. Beats inferring a duration from order gaps. */
  stream_minutes: number;
  max_concurrent_viewers: number;
  total_views: number;
  distinct_viewers_count: number;
  average_rating: number | null;
};

// ─── Products and variants ──────────────────────────────────────────────────

export type WnDimensionProfile = {
  id: string;
  name: string;
  weight: { value: number; unit: string } | null;
  dimensions: { length: number; width: number; height: number; unit: string } | null;
  ownership: string;
  active: boolean;
};

export type WnProduct = {
  id: string;
  title: string;
  description: string;
  /** Writable, and null on every product sampled. This is where our model # goes. */
  external_id: string | null;
  url: string;
  category: { id: string; name: string } | null;
  attributes: { id: string; name: string; value: string }[];
  options: { id: string; name: string; values?: string[] }[];
  media: WnImage[];
  dimension_profile: WnDimensionProfile | null;
  created_at: string;
  updated_at: string;
};

/** Stock and pricing live on the variant, not the product. */
export type WnVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  external_id: string | null;
  selected_options: { name: string; value: string }[];
  price: WnMoney;
  pricing: {
    buy_it_now?: { price: WnMoney };
    auction?: { start_price: WnMoney };
  };
  country_of_origin: string | null;
  inventory: { available_quantity: number };
  media: WnImage[];
};

// ─── Shipments ──────────────────────────────────────────────────────────────

/** Observed: 'created'. Later states exist but were not sampled. */
export type WnShipmentStatus = string;

export type WnShipment = {
  id: string;
  url: string;
  status: WnShipmentStatus;
  fulfillment_method: string;
  recipient: WnUserRef;
  /** Null unless the token carries read:customers and the address is released. */
  destination_address: Record<string, unknown> | null;
  weight: { value: number; unit: string } | null;
  dimensions: { length: number; width: number; height: number; unit: string } | null;
  signature_required: boolean;
  /** Observed: 'not_hazardous', 'lithium_battery'. */
  hazardous_material: string;
  tracking: {
    carrier: string | null;
    service: string | null;
    tracking_code: string | null;
    last_mile_tracking_code: string | null;
  };
  documents: {
    label_url: string | null;
    bundled_url: string | null;
    commercial_invoice_url: string | null;
  };
  insurance: unknown | null;
  seller_paid_shipping_cost: WnMoney | null;
  /** Whatnot's own exception list for this parcel. Empty when nothing is wrong. */
  required_actions: string[];
  /** The deadline. What makes "aging" and "at risk" measurable. */
  dropoff_due: string | null;
  replacement_shipment_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WnShipmentItem = {
  id: string;
  shipment_id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
};

// ─── Account ────────────────────────────────────────────────────────────────

export type WnMe = {
  id: string;
  username: string;
  display_name: string;
  image: WnImage | null;
  seller_currency: string;
  country_code: string;
  can_go_live: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Money arrives as a string; every sum in this app wants a number. */
export function money(m: WnMoney | null | undefined): number {
  if (!m) return 0;
  const n = parseFloat(m.amount);
  return Number.isFinite(n) ? n : 0;
}
