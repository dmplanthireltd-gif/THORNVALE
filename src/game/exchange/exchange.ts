import { isItem, itemDef, type ItemStack } from '../inventory/items';
import { CAPES } from '../inventory/capes';
import { NPCS } from '../npc/npcs';
import { ENEMIES } from '../enemies/enemyDefs';
import { QUESTS } from '../quests/quests';

/**
 * The Gilded Exchange (Grand Thornvale, in the middle of the great fountain): a
 * buy-and-sell order book for every tradeable item, used at the Exchange clerks.
 *
 * - A player places a buy or a sell offer: item, quantity, price per piece. What it
 *   offers goes into escrow at once (sell: the items; buy: quantity × price in gold).
 * - Offers match automatically by price, then time: a new offer trades with the
 *   best older offers on the other side, always at the older offer's price; a buyer
 *   who offered more gets the difference back. Offers fill in parts.
 * - Everything a trade brings (items for a buyer, gold for a seller, refunds, and
 *   what is left of a cancelled offer) goes into the owner's collect box, also while
 *   they are offline. The owner collects it at a clerk: gold to the bank, items to
 *   the depot.
 * - The seller pays a small tax on every sale (a gold sink).
 *
 * This file is plain data and pure rules (no DOM, no three.js, no storage). Game runs
 * them through `ExchangeSystem`; the server stores every change in ONE transaction
 * together with the acting character's save (storage `commitExchange`), so a crash
 * can neither lose nor duplicate anything: either the whole change is stored, or
 * none of it (and the character's older save still holds the escrow).
 */

export type ExSide = 'buy' | 'sell';

export interface ExOrder {
  id: string;
  /** Lower-case character name. */
  owner: string;
  ownerName: string;
  side: ExSide;
  item: string;
  /** Pieces asked for when placed. */
  qty: number;
  /** Pieces not traded yet (0 = done; done orders are dropped). */
  left: number;
  /** Gold per piece: the most a buyer pays, the least a seller takes. */
  price: number;
  /** Wall-clock ms. */
  created: number;
  /** Placement order (time priority between offers placed in the same millisecond). */
  seq: number;
}

/** What waits for a character at the Exchange: bought items, gold from sales, refunds. */
export interface ExBox {
  owner: string;
  gold: number;
  items: ItemStack[];
}

export interface ExTrade {
  id: string;
  item: string;
  qty: number;
  price: number;
  at: number;
  buyer: string;
  seller: string;
}

/** One change of the Exchange, stored in one transaction with the acting character's save. */
export interface ExchangeChange {
  /** The character whose save goes in with this change (the one who acted), or null. */
  actor: number | null;
  /** Orders inserted or updated (full rows). */
  putOrders: ExOrder[];
  dropOrders: string[];
  /** Boxes written in full (an empty box is removed). */
  putBoxes: ExBox[];
  trades: ExTrade[];
}

export function emptyExchangeChange(actor: number | null): ExchangeChange {
  return { actor, putOrders: [], dropOrders: [], putBoxes: [], trades: [] };
}

/** Tax on every sale, in per cent of the sale (paid by the seller; the gold leaves the game). */
export const EXCHANGE_TAX_PCT = 2;
/** Offers a character may have open at once (premium: more). */
export const EXCHANGE_SLOTS = 8;
export const EXCHANGE_PREMIUM_SLOTS = 16;
export const EXCHANGE_MAX_PRICE = 100_000_000;
export const EXCHANGE_MAX_QTY = 100_000;
/** Trades kept per item for the price history. */
export const EXCHANGE_HISTORY = 60;
/** You must stand this close to a clerk to keep the Exchange window open. */
export const EXCHANGE_RANGE = 3;

/** Tax on a sale of `value` gold. */
export function exchangeTax(value: number): number {
  return Math.floor((value * EXCHANGE_TAX_PCT) / 100);
}

/**
 * Items that never go on the Exchange: gold itself; the achievement capes (skill,
 * mastery and deed capes: earned, not bought); quest rewards nobody can get any other
 * way (no shop sells them, no monster drops them); and anything listed here by hand
 * (game-master and test items; none yet).
 */
export const EXCHANGE_BLOCKED = new Set<string>([]);

let blocked: Set<string> | null = null;
function blockedItems(): Set<string> {
  if (blocked) return blocked;
  const out = new Set<string>(['gold', ...EXCHANGE_BLOCKED]);
  for (const c of CAPES) if (c.kind === 'skill' || c.kind === 'mastery' || c.kind === 'deed') out.add(c.id);
  const sold = new Set<string>();
  for (const n of Object.values(NPCS)) for (const e of n.sells ?? []) sold.add(e.id);
  const dropped = new Set<string>();
  for (const e of Object.values(ENEMIES)) for (const l of e.loot) dropped.add(l.id);
  for (const q of QUESTS) for (const r of q.rewardItems) if (!sold.has(r.id) && !dropped.has(r.id)) out.add(r.id);
  return (blocked = out);
}

/** Can this item be bought and sold on the Exchange? */
export function isTradeable(id: string): boolean {
  return isItem(id) && itemDef(id).kind !== 'gold' && !blockedItems().has(id);
}

let seqCounter = 0;
export function exchangeId(now: number): string {
  seqCounter = (seqCounter + 1) % 1_000_000;
  return `x${now.toString(36)}-${seqCounter.toString(36)}-${Math.floor(Math.random() * 36 ** 5).toString(36)}`;
}

/** A trade between a new offer and an older one, as `match` reports it. */
export interface Fill {
  /** The older offer it traded with. */
  other: ExOrder;
  qty: number;
  /** The older offer's price. */
  price: number;
}

export class ExchangeBook {
  readonly orders = new Map<string, ExOrder>();
  readonly boxes = new Map<string, ExBox>();
  /** Recent trades per item, newest last (price history). */
  readonly history = new Map<string, ExTrade[]>();
  /** False while the server has nowhere to store the Exchange (then nothing can be placed). */
  enabled = false;
  /** Bumped on every change, so views know when to refresh. */
  version = 0;
  private nextSeq = 1;

  load(orders: unknown[], boxes: unknown[], trades: unknown[]): void {
    this.orders.clear();
    this.boxes.clear();
    this.history.clear();
    for (const o of orders) {
      const v = cleanOrder(o);
      if (v) { this.orders.set(v.id, v); this.nextSeq = Math.max(this.nextSeq, v.seq + 1); }
    }
    for (const b of boxes) {
      const v = cleanBox(b);
      if (v && (v.gold > 0 || v.items.length)) this.boxes.set(v.owner, v);
    }
    const ts = trades.map(cleanTrade).filter((t): t is ExTrade => !!t).sort((a, b) => a.at - b.at);
    for (const t of ts) this.remember(t);
    this.version++;
  }

  takeSeq(): number {
    return this.nextSeq++;
  }

  remember(t: ExTrade): void {
    let h = this.history.get(t.item);
    if (!h) this.history.set(t.item, (h = []));
    h.push(t);
    if (h.length > EXCHANGE_HISTORY) h.splice(0, h.length - EXCHANGE_HISTORY);
  }

  ordersBy(owner: string): ExOrder[] {
    return [...this.orders.values()].filter((o) => o.owner === owner).sort((a, b) => a.seq - b.seq);
  }

  box(owner: string): ExBox {
    return this.boxes.get(owner) ?? { owner, gold: 0, items: [] };
  }

  /** Older offers on the other side that a new offer at this price would trade with, best first. */
  candidates(side: ExSide, item: string, price: number, owner: string): ExOrder[] {
    const out: ExOrder[] = [];
    for (const o of this.orders.values()) {
      if (o.item !== item || o.side === side || o.left <= 0 || o.owner === owner) continue;
      if (side === 'buy' ? o.price <= price : o.price >= price) out.push(o);
    }
    // price first (cheapest sell for a buyer, highest buy for a seller), then the oldest
    out.sort((a, b) => (side === 'buy' ? a.price - b.price : b.price - a.price) || a.seq - b.seq);
    return out;
  }

  /** Best bid / ask and what is offered at them. */
  top(item: string): { bid: number; bidQty: number; ask: number; askQty: number } {
    let bid = 0, bidQty = 0, ask = 0, askQty = 0;
    for (const o of this.orders.values()) {
      if (o.item !== item || o.left <= 0) continue;
      if (o.side === 'buy') {
        if (o.price > bid) { bid = o.price; bidQty = o.left; } else if (o.price === bid) bidQty += o.left;
      } else if (!ask || o.price < ask) { ask = o.price; askQty = o.left; } else if (o.price === ask) askQty += o.left;
    }
    return { bid, bidQty, ask, askQty };
  }

  /** Price levels on each side (best first, at most `n` each). */
  depth(item: string, n = 5): { bids: Array<{ price: number; qty: number }>; asks: Array<{ price: number; qty: number }> } {
    const bids = new Map<number, number>(), asks = new Map<number, number>();
    for (const o of this.orders.values()) {
      if (o.item !== item || o.left <= 0) continue;
      const m = o.side === 'buy' ? bids : asks;
      m.set(o.price, (m.get(o.price) ?? 0) + o.left);
    }
    return {
      bids: [...bids.entries()].sort((a, b) => b[0] - a[0]).slice(0, n).map(([price, qty]) => ({ price, qty })),
      asks: [...asks.entries()].sort((a, b) => a[0] - b[0]).slice(0, n).map(([price, qty]) => ({ price, qty })),
    };
  }

  /** Last traded price (0 = never traded). */
  last(item: string): number {
    const h = this.history.get(item);
    return h && h.length ? h[h.length - 1].price : 0;
  }

  /**
   * Matches a new offer against the book (it is not in the book yet) and applies the
   * trades: both offers shrink, the boxes fill. Returns what happened, with every
   * touched order and box, for storing.
   */
  match(o: ExOrder, now: number, c: ExchangeChange): Fill[] {
    const fills: Fill[] = [];
    const touched = new Map<string, ExBox>();
    const boxOf = (owner: string) => {
      let b = touched.get(owner);
      if (!b) {
        const cur = this.box(owner);
        b = { owner, gold: cur.gold, items: cur.items.map((i) => ({ ...i })) };
        touched.set(owner, b);
      }
      return b;
    };
    for (const other of this.candidates(o.side, o.item, o.price, o.owner)) {
      if (o.left <= 0) break;
      const n = Math.min(o.left, other.left);
      const price = other.price;
      const value = price * n;
      const buyer = o.side === 'buy' ? o : other, seller = o.side === 'sell' ? o : other;
      // the buyer gets the items; a buyer whose offer was higher gets the difference back
      addItem(boxOf(buyer.owner).items, o.item, n);
      const refund = (buyer.price - price) * n;
      if (refund > 0) boxOf(buyer.owner).gold += refund;
      boxOf(seller.owner).gold += value - exchangeTax(value);
      o.left -= n;
      other.left -= n;
      const t: ExTrade = { id: exchangeId(now), item: o.item, qty: n, price, at: now, buyer: buyer.owner, seller: seller.owner };
      this.remember(t);
      c.trades.push(t);
      if (other.left <= 0) {
        this.orders.delete(other.id);
        c.dropOrders.push(other.id);
      } else c.putOrders.push({ ...other });
      fills.push({ other, qty: n, price });
    }
    for (const b of touched.values()) this.setBox(b, c);
    return fills;
  }

  /** Writes a box into the book and the change (an empty box is removed). */
  setBox(b: ExBox, c: ExchangeChange): void {
    b.items = b.items.filter((i) => i.qty > 0);
    if (b.gold <= 0 && !b.items.length) this.boxes.delete(b.owner);
    else this.boxes.set(b.owner, b);
    const i = c.putBoxes.findIndex((x) => x.owner === b.owner);
    const copy = { owner: b.owner, gold: Math.max(0, b.gold), items: b.items.map((x) => ({ ...x })) };
    if (i >= 0) c.putBoxes[i] = copy;
    else c.putBoxes.push(copy);
  }

  toJSON(): { orders: ExOrder[]; boxes: ExBox[]; trades: ExTrade[] } {
    const trades: ExTrade[] = [];
    for (const h of this.history.values()) trades.push(...h);
    return { orders: [...this.orders.values()].map((o) => ({ ...o })), boxes: [...this.boxes.values()].map((b) => ({ ...b, items: b.items.map((i) => ({ ...i })) })), trades };
  }
}

/** Adds pieces to a list of stacks (boxes keep one stack per item). */
export function addItem(list: ItemStack[], id: string, qty: number): void {
  const s = list.find((x) => x.id === id);
  if (s) s.qty += qty;
  else list.push({ id, qty });
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanOrder(raw: unknown): ExOrder | null {
  const o = raw as Partial<ExOrder> | null;
  if (!o || typeof o.id !== 'string' || typeof o.owner !== 'string' || typeof o.item !== 'string') return null;
  if (o.side !== 'buy' && o.side !== 'sell') return null;
  const qty = Math.floor(Number(o.qty)), left = Math.floor(Number(o.left)), price = Math.floor(Number(o.price));
  if (!(qty > 0) || !(left > 0) || left > qty || !(price > 0)) return null;
  return {
    id: o.id, owner: o.owner.toLowerCase(), ownerName: typeof o.ownerName === 'string' ? o.ownerName : o.owner, side: o.side, item: o.item, qty, left, price,
    created: finite(o.created) ? o.created : 0, seq: finite(o.seq) ? Math.floor(o.seq) : 0,
  };
}

export function cleanBox(raw: unknown): ExBox | null {
  const b = raw as Partial<ExBox> | null;
  if (!b || typeof b.owner !== 'string') return null;
  const items: ItemStack[] = [];
  if (Array.isArray(b.items)) for (const i of b.items) if (i && typeof i.id === 'string' && Number(i.qty) > 0) addItem(items, i.id, Math.floor(Number(i.qty)));
  return { owner: b.owner.toLowerCase(), gold: Math.max(0, Math.floor(Number(b.gold) || 0)), items };
}

export function cleanTrade(raw: unknown): ExTrade | null {
  const t = raw as Partial<ExTrade> | null;
  if (!t || typeof t.id !== 'string' || typeof t.item !== 'string') return null;
  const qty = Math.floor(Number(t.qty)), price = Math.floor(Number(t.price));
  if (!(qty > 0) || !(price > 0)) return null;
  return { id: t.id, item: t.item, qty, price, at: finite(t.at) ? t.at : 0, buyer: String(t.buyer ?? ''), seller: String(t.seller ?? '') };
}

// ------------------------------------------------------------------ what the window shows

export interface ExOrderView {
  id: string;
  side: ExSide;
  item: string;
  qty: number;
  left: number;
  price: number;
  created: number;
}

export interface ExItemView {
  id: string;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  last: number;
  /** Recent trades, oldest first: price, pieces, wall-clock ms. */
  history: Array<{ p: number; q: number; t: number }>;
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
}

export interface ExchangeView {
  enabled: boolean;
  /** Offers you may have open at once, and whether more come with premium. */
  slots: number;
  premiumSlots: number;
  taxPct: number;
  orders: ExOrderView[];
  box: { gold: number; items: ItemStack[] };
  bank: number;
  carried: number;
  /** Tradeable things you own (backpack and depot together), to sell. */
  have: ItemStack[];
  /** The item you are looking at (search / pick), with its market. */
  item: ExItemView | null;
}
