import type { ItemStack } from '../inventory/items';

/**
 * The player market: sell offers that every town's market board shows.
 *
 * Offers hold their items in escrow (taken out of the seller's depot or
 * backpack when listed). Gold for sales, and items of expired offers, reach a
 * seller who is offline through "deliveries": records kept with the market
 * and handed out the next time that character logs in. A save remembers the
 * ids of the deliveries it already received, so handing one out twice is
 * impossible even if the server stops halfway.
 *
 * The book itself is plain data; Game runs the rules and the server stores the
 * changes (see MarketChange and server/storage.ts).
 */

export interface MarketOffer {
  id: string;
  /** Lower-case character name of the seller. */
  seller: string;
  sellerName: string;
  item: string;
  qty: number;
  /** Gold per piece. */
  price: number;
  /** Wall-clock ms. */
  created: number;
  expires: number;
}

export interface MarketDelivery {
  id: string;
  /** Lower-case character name it belongs to. */
  to: string;
  gold: number;
  items: ItemStack[];
  /** Shown to the player when it arrives. */
  reason: string;
  created: number;
}

/**
 * What changed, in the order a server must store it so a crash can never lose
 * anything (at worst something is handed out twice):
 *   1. `put` offers and deliveries (new escrow, gold owed to sellers),
 *   2. `save` these characters,
 *   3. `drop` offers and deliveries (escrow released, deliveries handed out) and
 *      `shrink` offers that were partly bought.
 */
export interface MarketChange {
  putOffers: MarketOffer[];
  putDeliveries: MarketDelivery[];
  save: number[];
  shrinkOffers: MarketOffer[];
  dropOffers: string[];
  dropDeliveries: string[];
}

export function emptyChange(): MarketChange {
  return { putOffers: [], putDeliveries: [], save: [], shrinkOffers: [], dropOffers: [], dropDeliveries: [] };
}

/** Listing fee: 1% of the total value, at least 1 gold. */
export function marketFee(total: number): number {
  return Math.max(1, Math.floor(total / 100));
}

export const MARKET_MAX_OFFERS = 20;
export const MARKET_MAX_PRICE = 100_000_000;
export const MARKET_OFFER_DAYS = 30;
export const MARKET_OFFER_MS = MARKET_OFFER_DAYS * 24 * 60 * 60 * 1000;
/** How many delivery ids a save remembers (older ones can no longer be pending). */
export const MARKET_CLAIMS_KEPT = 200;

/** One offer as the market window shows it. */
export interface OfferView {
  id: string;
  item: string;
  qty: number;
  price: number;
  seller: string;
  mine: boolean;
  expires: number;
}

export interface MarketView {
  offers: OfferView[];
  /** The viewer's depot (things they can list) and bank balance. */
  depot: (ItemStack | null)[];
  bank: number;
  enabled: boolean;
}

let counter = 0;
export function marketId(now: number): string {
  counter = (counter + 1) % 1_000_000;
  return `${now.toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 36 ** 6).toString(36)}`;
}

export class MarketBook {
  readonly offers = new Map<string, MarketOffer>();
  readonly deliveries = new Map<string, MarketDelivery>();
  /** False while the server has no place to store offers (then nothing can be listed or bought). */
  enabled = true;
  /** Bumped on every change, so views know when to refresh. */
  version = 0;

  load(offers: unknown[], deliveries: unknown[]): void {
    this.offers.clear();
    this.deliveries.clear();
    for (const o of offers) {
      const v = cleanOffer(o);
      if (v) this.offers.set(v.id, v);
    }
    for (const d of deliveries) {
      const v = cleanDelivery(d);
      if (v) this.deliveries.set(v.id, v);
    }
    this.version++;
  }

  toJSON(): { offers: MarketOffer[]; deliveries: MarketDelivery[] } {
    return { offers: [...this.offers.values()], deliveries: [...this.deliveries.values()] };
  }

  offersBy(seller: string): MarketOffer[] {
    return [...this.offers.values()].filter((o) => o.seller === seller);
  }

  deliveriesFor(to: string): MarketDelivery[] {
    return [...this.deliveries.values()].filter((d) => d.to === to).sort((a, b) => a.created - b.created);
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanOffer(raw: unknown): MarketOffer | null {
  const o = raw as Partial<MarketOffer> | null;
  if (!o || typeof o.id !== 'string' || typeof o.seller !== 'string' || typeof o.item !== 'string') return null;
  const qty = Math.floor(Number(o.qty));
  const price = Math.floor(Number(o.price));
  if (!(qty > 0) || !(price > 0)) return null;
  // an item that no longer exists stays listed (it is still the seller's); it just cannot be bought
  return {
    id: o.id, seller: o.seller.toLowerCase(), sellerName: typeof o.sellerName === 'string' ? o.sellerName : o.seller, item: o.item, qty, price,
    created: finite(o.created) ? o.created : 0, expires: finite(o.expires) ? o.expires : Number.MAX_SAFE_INTEGER,
  };
}

export function cleanDelivery(raw: unknown): MarketDelivery | null {
  const d = raw as Partial<MarketDelivery> | null;
  if (!d || typeof d.id !== 'string' || typeof d.to !== 'string') return null;
  const items = Array.isArray(d.items)
    ? d.items.filter((i) => i && typeof i.id === 'string' && Number(i.qty) > 0).map((i) => ({ id: i.id, qty: Math.floor(Number(i.qty)) }))
    : [];
  return {
    id: d.id, to: d.to.toLowerCase(), gold: Math.max(0, Math.floor(Number(d.gold) || 0)), items,
    reason: typeof d.reason === 'string' ? d.reason : 'Market', created: finite(d.created) ? d.created : 0,
  };
}
