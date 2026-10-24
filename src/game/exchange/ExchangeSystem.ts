import { chebyshev } from '../core/types';
import { describeStack, type Game, type Session } from '../Game';
import { isItem, itemDef, type ItemStack } from '../inventory/items';
import { addToCapped } from '../inventory/Inventory';
import {
  addItem, emptyExchangeChange, EXCHANGE_MAX_PRICE, EXCHANGE_MAX_QTY, EXCHANGE_PREMIUM_SLOTS, EXCHANGE_RANGE, EXCHANGE_SLOTS, EXCHANGE_TAX_PCT,
  ExchangeBook, exchangeId, isTradeable, type ExchangeChange, type ExchangeView, type ExItemView, type ExOrder, type ExSide,
} from './exchange';

/**
 * Game's side of the Gilded Exchange (rules in exchange.ts). Every action checks
 * everything first and only then changes anything, inside one game tick, so two
 * players can never spend the same escrow and an offer can never fill twice. Each
 * action ends in one `ExchangeChange` (the acting character + every order, box and
 * trade it touched), which the server stores in one transaction (`sink`).
 *
 * Opened by talking to an Exchange clerk (NpcDef.exchange) and choosing "Trade on the
 * Exchange"; it closes when you walk away from the clerk. Offline (single player) the
 * Exchange stays closed: there is nobody to trade with and nowhere to keep the escrow.
 */
interface ExSession {
  /** The clerk the window was opened at (NPC id), or null when closed. */
  npc: number | null;
  /** The item the window is looking at. */
  item: string | null;
}

export class ExchangeSystem {
  readonly book = new ExchangeBook();
  /** Called with every change that must be stored (the server: storage, one transaction). */
  sink: ((c: ExchangeChange) => void) | null = null;
  private readonly state = new WeakMap<Session, ExSession>();

  constructor(private readonly game: Game) {}

  private st(s: Session): ExSession {
    let v = this.state.get(s);
    if (!v) this.state.set(s, (v = { npc: null, item: null }));
    return v;
  }

  private key(s: Session): string {
    return s.player.name.toLowerCase();
  }

  private sessionByKey(key: string): Session | null {
    for (const o of this.game.sessions.values()) if (o.player.name.toLowerCase() === key) return o;
    return null;
  }

  isOpen(pid: number): boolean {
    const s = this.game.sessions.get(pid);
    return !!s && this.st(s).npc !== null;
  }

  slotsFor(s: Session): number {
    return this.game.isPremium(s) ? EXCHANGE_PREMIUM_SLOTS : EXCHANGE_SLOTS;
  }

  /** A clerk's "Trade on the Exchange". */
  open(pid: number, npcId: number): void {
    const s = this.game.sessions.get(pid);
    if (!s) return;
    if (!this.book.enabled) {
      this.game.msg(pid, this.game.simulate && this.game.sessions.size <= 1 && !this.sink
        ? 'The Exchange trades only on the online realm.'
        : 'The Exchange is closed for now. Your offers and your collect box are safe.', 'warn');
      return;
    }
    this.st(s).npc = npcId;
    this.changed(s);
  }

  close(pid: number): void {
    const s = this.game.sessions.get(pid);
    if (!s) return;
    const v = this.st(s);
    if (v.npc === null) return;
    v.npc = null;
    this.changed(s);
  }

  /** Once a tick or so: closes windows of players who walked away from the clerk or died. */
  tick(): void {
    for (const s of this.game.sessions.values()) {
      const v = this.state.get(s);
      if (!v || v.npc === null) continue;
      const n = this.game.npcs.find((q) => q.id === v.npc);
      if (!n || s.player.dead || n.z !== s.player.z || chebyshev(n.x, n.y, s.player.x, s.player.y) > EXCHANGE_RANGE) this.close(s.id);
    }
  }

  /** Which item the window looks at (search / pick). */
  query(pid: number, item: string): void {
    const s = this.game.sessions.get(pid);
    if (!s) return;
    const v = this.st(s);
    v.item = isTradeable(item) ? item : null;
    this.changed(s);
  }

  private changed(s: Session): void {
    this.game.events.emit({ type: 'exchangeChanged', to: s.id });
  }

  /** Stores a change and refreshes every open window. */
  private commit(c: ExchangeChange): void {
    this.book.version++;
    this.sink?.(c);
    for (const o of this.game.sessions.values()) if (this.state.get(o)?.npc != null) this.changed(o);
  }

  // ---------------------------------------------------------------- actions

  /**
   * Places an offer. Sell: the pieces come out of your backpack, then your depot.
   * Buy: quantity × price comes out of your bank, then your backpack. Then the offer
   * trades with what is already on the book; whatever is left waits there.
   */
  place(pid: number, side: ExSide, item: string, qty: number, priceEach: number): void {
    const s = this.game.sessions.get(pid);
    if (!s || s.player.dead || !this.isOpen(pid)) return;
    const fail = (t: string) => this.game.msg(pid, t, 'warn');
    if (!this.book.enabled) return fail('The Exchange is closed for now.');
    if (side !== 'buy' && side !== 'sell') return;
    if (!isTradeable(item)) return fail('That cannot be traded on the Exchange.');
    const n = Math.floor(qty), each = Math.floor(priceEach);
    const maxQty = EXCHANGE_MAX_QTY.toLocaleString('en'), maxPrice = EXCHANGE_MAX_PRICE.toLocaleString('en');
    if (!(n >= 1) || n > EXCHANGE_MAX_QTY) return fail(`Offers go from 1 to ${maxQty} pieces.`);
    if (!(each >= 1) || each > EXCHANGE_MAX_PRICE) return fail(`Prices go from 1 to ${maxPrice} gold a piece.`);
    const me = this.key(s);
    const mine = this.book.ordersBy(me);
    const cap = this.slotsFor(s);
    const premium = EXCHANGE_PREMIUM_SLOTS;
    if (mine.length >= cap) return fail(cap < premium ? `You can have at most ${cap} offers at once (premium: ${premium}).` : `You can have at most ${cap} offers at once.`);
    // never trade with yourself: an offer that would meet one of your own is refused
    const own = mine.find((o) => o.item === item && o.side !== side && (side === 'buy' ? o.price <= each : o.price >= each));
    if (own) {
      const ownPrice = own.price.toLocaleString('en');
      return fail(own.side === 'sell' ? `You already sell this for ${ownPrice} gold. Cancel that offer first.` : `You already buy this for ${ownPrice} gold. Cancel that offer first.`);
    }
    // escrow: check everything, then take it
    if (side === 'sell') {
      const have = s.inventory.count(item) + depotCount(s, item);
      if (have < n) return fail(`You only have ${have} of those in your backpack and depot.`);
      const fromBag = s.inventory.removeById(item, n);
      if (fromBag < n) takeFromDepot(s, item, n - fromBag);
      this.game.events.emit({ type: 'inventoryChanged', to: pid });
      if (s.depotOpen) this.game.events.emit({ type: 'depotChanged', to: pid });
    } else {
      const cost = n * each;
      const total = cost.toLocaleString('en');
      if (s.bank + s.inventory.count('gold') < cost) return fail(`That offer holds ${total} gold, more than you have in the bank and your backpack.`);
      const fromBank = Math.min(s.bank, cost);
      s.bank -= fromBank;
      if (cost > fromBank) {
        s.inventory.removeById('gold', cost - fromBank);
        this.game.events.emit({ type: 'inventoryChanged', to: pid });
      }
    }
    const now = this.game.now();
    const o: ExOrder = { id: exchangeId(now), owner: me, ownerName: s.player.name, side, item, qty: n, left: n, price: each, created: now, seq: this.book.takeSeq() };
    const c = emptyExchangeChange(pid);
    const fills = this.book.match(o, now, c);
    if (o.left > 0) {
      this.book.orders.set(o.id, o);
      c.putOrders.push({ ...o });
    }
    const what = describeStack({ id: item, qty: n });
    const price = each.toLocaleString('en');
    const left = o.left;
    if (!fills.length) this.game.msg(pid, side === 'buy' ? `Exchange: you offer to buy ${what} for ${price} gold each.` : `Exchange: you offer to sell ${what} for ${price} gold each.`, 'trade');
    else {
      const got = describeStack({ id: item, qty: n - o.left });
      if (side === 'buy') this.game.msg(pid, left > 0 ? `Exchange: you bought ${got}; ${left} more wait on the book. Collect it from your box.` : `Exchange: you bought ${got}. Collect it from your box.`, 'trade');
      else this.game.msg(pid, left > 0 ? `Exchange: you sold ${got}; ${left} more wait on the book. Collect it from your box.` : `Exchange: you sold ${got}. Collect it from your box.`, 'trade');
    }
    // tell the other side (online ones; offline ones find it in their box)
    for (const f of fills) {
      const other = this.sessionByKey(f.other.owner);
      const name = itemDef(item).name, qty = f.qty, at = f.price.toLocaleString('en');
      if (other) this.game.msg(other.id, `Exchange: your offer for ${name} traded ${qty} at ${at} gold each. Collect it at a clerk.`, 'trade');
    }
    this.commit(c);
  }

  /** Withdraws one of your offers: what is left of it goes to your collect box. */
  cancel(pid: number, id: string): void {
    const s = this.game.sessions.get(pid);
    if (!s || !this.isOpen(pid)) return;
    const fail = (t: string) => this.game.msg(pid, t, 'warn');
    if (!this.book.enabled) return fail('The Exchange is closed for now.');
    const o = this.book.orders.get(id);
    if (!o || o.owner !== this.key(s)) return fail('That offer is gone.');
    const c = emptyExchangeChange(pid);
    this.book.orders.delete(o.id);
    c.dropOrders.push(o.id);
    const b = this.book.box(o.owner);
    const box = { owner: b.owner, gold: b.gold, items: b.items.map((i) => ({ ...i })) };
    if (o.side === 'sell') addItem(box.items, o.item, o.left);
    else box.gold += o.left * o.price;
    this.book.setBox(box, c);
    if (o.side === 'sell') {
      const what = describeStack({ id: o.item, qty: o.left });
      this.game.msg(pid, `Exchange: offer withdrawn. ${what} went to your collect box.`, 'trade');
    } else {
      const gold = (o.left * o.price).toLocaleString('en');
      this.game.msg(pid, `Exchange: offer withdrawn. ${gold} gold went to your collect box.`, 'trade');
    }
    this.commit(c);
  }

  /** Empties your collect box: gold into the bank, items into the depot (what does not fit stays). */
  collect(pid: number): void {
    const s = this.game.sessions.get(pid);
    if (!s || s.player.dead || !this.isOpen(pid)) return;
    const fail = (t: string) => this.game.msg(pid, t, 'warn');
    if (!this.book.enabled) return fail('The Exchange is closed for now.');
    const me = this.key(s);
    const b = this.book.boxes.get(me);
    if (!b || (!b.gold && !b.items.length)) return fail('Your collect box is empty.');
    const c = emptyExchangeChange(pid);
    const gold = b.gold;
    s.bank += gold;
    const left: ItemStack[] = [];
    const got: ItemStack[] = [];
    for (const it of b.items) {
      if (!isItem(it.id)) { left.push({ ...it }); continue; }
      const rest = addToCapped(s.depot, it.id, it.qty, this.game.depotCap(s));
      if (it.qty - rest > 0) got.push({ id: it.id, qty: it.qty - rest });
      if (rest > 0) left.push({ id: it.id, qty: rest });
    }
    this.book.setBox({ owner: me, gold: 0, items: left }, c);
    const amount = gold.toLocaleString('en');
    if (gold) this.game.msg(pid, `Exchange: ${amount} gold went into your bank account.`, 'trade');
    const items = got.map(describeStack).join(', ');
    if (got.length) this.game.msg(pid, `Exchange: now in your depot: ${items}.`, 'trade');
    if (left.length) this.game.msg(pid, 'Exchange: your depot is full; the rest stays in your collect box.', 'warn');
    if (s.depotOpen) this.game.events.emit({ type: 'depotChanged', to: pid });
    this.commit(c);
  }

  // ---------------------------------------------------------------- the window

  view(pid: number): ExchangeView | null {
    const s = this.game.sessions.get(pid);
    if (!s) return null;
    const v = this.st(s);
    if (v.npc === null) return null;
    const me = this.key(s);
    const box = this.book.box(me);
    const have = new Map<string, number>();
    for (const x of [...s.inventory.slots, ...s.depot]) if (x && isTradeable(x.id)) have.set(x.id, (have.get(x.id) ?? 0) + x.qty);
    return {
      enabled: this.book.enabled,
      slots: this.slotsFor(s),
      premiumSlots: EXCHANGE_PREMIUM_SLOTS,
      taxPct: EXCHANGE_TAX_PCT,
      orders: this.book.ordersBy(me).map((o) => ({ id: o.id, side: o.side, item: o.item, qty: o.qty, left: o.left, price: o.price, created: o.created })),
      box: { gold: box.gold, items: box.items.map((i) => ({ ...i })) },
      bank: s.bank,
      carried: s.inventory.count('gold'),
      have: [...have.entries()].map(([id, qty]) => ({ id, qty })).sort((a, b) => itemDef(a.id).name.localeCompare(itemDef(b.id).name)),
      item: v.item ? this.itemView(v.item) : null,
    };
  }

  /** A key that changes whenever this player's window would show something new. */
  viewKey(pid: number): string {
    const s = this.game.sessions.get(pid);
    if (!s) return 'none';
    const v = this.st(s);
    if (v.npc === null) return 'closed';
    let inv = 0;
    for (const x of [...s.inventory.slots, ...s.depot]) if (x) inv = (inv * 31 + x.qty * 7 + x.id.length) | 0;
    return `${this.book.version}|${v.item ?? ''}|${s.bank}|${inv}|${this.slotsFor(s)}`;
  }

  itemView(id: string): ExItemView {
    const t = this.book.top(id);
    const d = this.book.depth(id);
    return {
      id, ...t, last: this.book.last(id),
      history: (this.book.history.get(id) ?? []).map((x) => ({ p: x.price, q: x.qty, t: x.at })),
      bids: d.bids, asks: d.asks,
    };
  }
}

function depotCount(s: Session, id: string): number {
  let n = 0;
  for (const x of s.depot) if (x && x.id === id) n += x.qty;
  return n;
}

function takeFromDepot(s: Session, id: string, qty: number): void {
  let left = qty;
  for (let i = s.depot.length - 1; i >= 0 && left > 0; i--) {
    const x = s.depot[i];
    if (!x || x.id !== id) continue;
    const take = Math.min(x.qty, left);
    x.qty -= take;
    left -= take;
    if (x.qty <= 0) s.depot[i] = null;
  }
}
