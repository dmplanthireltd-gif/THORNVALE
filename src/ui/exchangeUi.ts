import type { Controller } from '../client/Controller';
import { ITEMS, itemDef } from '../game/inventory/items';
import {
  EXCHANGE_MAX_PRICE, EXCHANGE_MAX_QTY, exchangeTax, isTradeable, type ExchangeView, type ExItemView, type ExSide,
} from '../game/exchange/exchange';
import { fmtNum, onLangChange, t } from '../i18n/i18n';
import { trName } from '../i18n/gameText';
import { button, el, paintSlot } from './dom';
import './exchange.css';

/**
 * The Gilded Exchange window (opened by an Exchange clerk; rules in game/exchange/).
 * Self-contained: built here, refreshed from `ctl.exchange()`, every action is an `ex*`
 * command through the controller. The HUD only hosts it (main.ts creates it like the pet
 * window), so the HUD layout can change without touching this file.
 *
 *   left   search every tradeable item (or show what you own), pick one
 *   right  the item's market: last price, best buy and sell offers, price history,
 *          the five best price levels each side, and the offer form (buy / sell,
 *          quantity, price each, what goes into escrow, what you get after tax)
 *   below  your offers (filled so far, cancel) and your collect box (collect all)
 */
export class ExchangeUi {
  private readonly win: HTMLElement;
  private readonly body: HTMLElement;
  private view: ExchangeView | null = null;
  private key = '';
  private timer = 0;
  private search = '';
  private mineOnly = false;
  private side: ExSide = 'buy';
  private qty = 1;
  private price = 0;
  /** Item the form was last filled for (a new pick resets quantity and price). */
  private formItem = '';
  private redrawWhenIdle = false;
  /** Every tradeable item, sorted by name (worked out once). */
  private all: string[] = [];

  constructor(private readonly ctl: Controller, hudRoot: HTMLElement) {
    this.win = el('div', 'window exchange-win', hudRoot);
    this.win.hidden = true;
    const head = el('div', 'win-head', this.win);
    el('span', 'win-title', head, t('The Gilded Exchange'));
    button(head, '✕', () => this.ctl.send({ c: 'exClose' }), 'btn tiny').setAttribute('aria-label', t('Close'));
    this.body = el('div', 'win-body ex-body', this.win);
    this.win.addEventListener('mousedown', () => { this.win.style.zIndex = '60'; });
    this.win.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.ctl.send({ c: 'exClose' });
      e.stopPropagation();
    });
    onLangChange(() => { if (this.view) this.draw(); });
  }

  /** Called every frame; redraws only when the server sent something new. */
  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    const v = this.ctl.exchange();
    const key = v ? JSON.stringify(v) : '';
    if (key === this.key) return;
    this.key = key;
    this.view = v;
    if (!v) {
      this.win.hidden = true;
      return;
    }
    if (this.win.hidden) {
      this.win.hidden = false;
      this.win.style.zIndex = '60';
      if (!this.all.length) this.all = Object.keys(ITEMS).filter(isTradeable).sort((a, b) => trName(itemDef(a).name).localeCompare(trName(itemDef(b).name)));
    }
    // don't pull the rug from under someone typing a price
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && this.win.contains(a) && a.classList.contains('num-input')) {
      if (!this.redrawWhenIdle) {
        this.redrawWhenIdle = true;
        a.addEventListener('blur', () => { this.redrawWhenIdle = false; this.draw(); }, { once: true });
      }
      return;
    }
    this.draw();
  }

  private draw(): void {
    const v = this.view;
    if (!v) return;
    const b = this.body;
    b.replaceChildren();
    const top = el('div', 'ex-top', b);
    el('span', 'ex-chip', top, t('Bank {bank} gold', { bank: fmtNum(v.bank, 0) }));
    el('span', 'ex-chip', top, t('Carrying {gold} gold', { gold: fmtNum(v.carried, 0) }));
    el('span', 'ex-chip', top, v.slots < v.premiumSlots ? t('Offers {n}/{max} (premium {p})', { n: v.orders.length, max: v.slots, p: v.premiumSlots }) : t('Offers {n}/{max}', { n: v.orders.length, max: v.slots }));
    el('span', 'ex-chip', top, t('Tax on sales {n}%', { n: v.taxPct }));
    if (!v.enabled) el('p', 'hint warn', b, t('The Exchange is closed for now. Your offers and your collect box are safe.'));

    const cols = el('div', 'ex-cols', b);
    this.drawSearch(el('div', 'ex-col ex-left', cols), v);
    this.drawItem(el('div', 'ex-col ex-right', cols), v);
    const low = el('div', 'ex-cols', b);
    this.drawOrders(el('div', 'ex-col ex-orders', low), v);
    this.drawBox(el('div', 'ex-col ex-box', low), v);
  }

  // ---------------------------------------------------------------- search

  private drawSearch(c: HTMLElement, v: ExchangeView): void {
    el('div', 'panel-title', c, t('Find an item'));
    const row = el('div', 'ex-row', c);
    const q = el('input', 'text-input', row);
    q.placeholder = t('Search items…');
    q.value = this.search;
    q.setAttribute('aria-label', t('Search items…'));
    const mine = button(row, t('Mine'), () => { this.mineOnly = !this.mineOnly; this.draw(); }, `btn small${this.mineOnly ? ' on' : ''}`);
    mine.title = t('Only what you have in your backpack and depot');
    const list = el('div', 'ex-list', c);
    const have = new Map(v.have.map((h) => [h.id, h.qty]));
    const fill = () => {
      list.replaceChildren();
      const needle = this.search.trim().toLowerCase();
      const ids = (this.mineOnly ? v.have.map((h) => h.id) : this.all)
        .filter((id) => !needle || itemDef(id).name.toLowerCase().includes(needle) || trName(itemDef(id).name).toLowerCase().includes(needle));
      if (!ids.length) el('div', 'shop-empty', list, t(this.mineOnly ? 'You have nothing that can be traded here.' : 'No items match.'));
      for (const id of ids.slice(0, 80)) {
        const r = el('button', `ex-item${v.item?.id === id ? ' on' : ''}`, list);
        r.type = 'button';
        const s = el('div', 'slot mini', r);
        paintSlot(s, { id, qty: 1 });
        el('span', 'ex-item-name', r, trName(itemDef(id).name));
        const n = have.get(id);
        if (n) el('span', 'ex-item-have', r, `×${fmtNum(n, 0)}`);
        r.addEventListener('click', () => {
          this.ctl.send({ c: 'exQuery', item: id });
        });
      }
      if (ids.length > 80) el('div', 'shop-empty', list, t('{n} more — type to narrow the list.', { n: ids.length - 80 }));
    };
    q.addEventListener('input', () => { this.search = q.value; fill(); });
    fill();
  }

  // ---------------------------------------------------------------- the item's market and the offer form

  private drawItem(c: HTMLElement, v: ExchangeView): void {
    const it = v.item;
    if (!it) {
      el('div', 'panel-title', c, t('Market'));
      el('p', 'hint', c, t('Pick an item on the left to see its price, its buy and sell offers, and to place an offer of your own. Offers trade automatically, also while you are away; what you get waits in your collect box.'));
      return;
    }
    const d = itemDef(it.id);
    const head = el('div', 'ex-head', c);
    const s = el('div', 'slot', head);
    paintSlot(s, { id: it.id, qty: 1 });
    const hi = el('div', 'ex-head-info', head);
    el('div', 'ex-name', hi, trName(d.name));
    el('div', 'shop-desc', hi, t('Traders pay {value} gold each', { value: fmtNum(d.value, 0) }));
    const stats = el('div', 'ex-stats', c);
    const stat = (label: string, value: string, cls = '') => {
      const e = el('div', `ex-stat ${cls}`, stats);
      el('span', 'ex-stat-label', e, label);
      el('span', 'ex-stat-value', e, value);
    };
    const g = (n: number) => (n ? t('{n} gold', { n: fmtNum(n, 0) }) : '—');
    stat(t('Last price'), g(it.last));
    stat(t('Best buy offer'), it.bid ? `${g(it.bid)} · ×${fmtNum(it.bidQty, 0)}` : '—', 'bid');
    stat(t('Best sell offer'), it.ask ? `${g(it.ask)} · ×${fmtNum(it.askQty, 0)}` : '—', 'ask');
    this.drawHistory(c, it);
    this.drawDepth(c, it);
    this.drawForm(c, v, it);
  }

  private drawHistory(c: HTMLElement, it: ExItemView): void {
    const box = el('div', 'ex-chart', c);
    if (it.history.length < 2) {
      el('div', 'shop-empty', box, it.history.length ? t('One trade so far.') : t('Not traded yet.'));
      return;
    }
    const W = 300, H = 64;
    const ps = it.history.map((h) => h.p);
    const lo = Math.min(...ps), hi = Math.max(...ps);
    const span = Math.max(1, hi - lo);
    const pts = ps.map((p, i) => `${((i / (ps.length - 1)) * (W - 8) + 4).toFixed(1)},${(H - 6 - ((p - lo) / span) * (H - 14)).toFixed(1)}`);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'ex-spark');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('Price of the last {n} trades, from {lo} to {hi} gold', { n: ps.length, lo: fmtNum(lo, 0), hi: fmtNum(hi, 0) }));
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.join(' '));
    svg.appendChild(line);
    const last = pts[pts.length - 1].split(',');
    const dot = document.createElementNS(NS, 'rect');
    dot.setAttribute('x', String(Number(last[0]) - 3));
    dot.setAttribute('y', String(Number(last[1]) - 3));
    dot.setAttribute('width', '6');
    dot.setAttribute('height', '6');
    dot.setAttribute('transform', `rotate(45 ${last[0]} ${last[1]})`);
    svg.appendChild(dot);
    box.appendChild(svg);
    el('div', 'ex-chart-legend', box, t('Last {n} trades · low {lo} · high {hi}', { n: ps.length, lo: fmtNum(lo, 0), hi: fmtNum(hi, 0) }));
  }

  private drawDepth(c: HTMLElement, it: ExItemView): void {
    const t2 = el('div', 'ex-depth', c);
    const side = (title: string, rows: Array<{ price: number; qty: number }>, cls: string) => {
      const col = el('div', `ex-depth-col ${cls}`, t2);
      el('div', 'ex-depth-title', col, title);
      if (!rows.length) el('div', 'shop-empty', col, t('none'));
      for (const r of rows) {
        const e = el('div', 'ex-depth-row', col);
        el('span', '', e, fmtNum(r.price, 0));
        el('span', 'muted', e, `×${fmtNum(r.qty, 0)}`);
      }
    };
    side(t('Buy offers'), it.bids, 'bid');
    side(t('Sell offers'), it.asks, 'ask');
  }

  private drawForm(c: HTMLElement, v: ExchangeView, it: ExItemView): void {
    const d = itemDef(it.id);
    if (this.formItem !== it.id) {
      this.formItem = it.id;
      this.qty = 1;
      this.price = it.last || it.ask || it.bid || Math.max(1, d.value);
    }
    const owned = v.have.find((h) => h.id === it.id)?.qty ?? 0;
    const form = el('div', 'ex-form', c);
    const tabs = el('div', 'market-tabs', form);
    for (const [s, label] of [['buy', t('Buy')], ['sell', t('Sell')]] as const) {
      button(tabs, label, () => { this.side = s; this.draw(); }, `btn small${this.side === s ? ' on' : ''}`);
    }
    const row = el('div', 'ex-row', form);
    const maxQty = this.side === 'sell' ? Math.max(1, Math.min(owned, EXCHANGE_MAX_QTY)) : EXCHANGE_MAX_QTY;
    this.qty = Math.max(1, Math.min(maxQty, this.qty));
    el('label', 'dev-label', row, t('Amount'));
    const qi = this.num(row, this.qty, 1, maxQty, (n) => { this.qty = n; update(); });
    qi.setAttribute('aria-label', t('Amount'));
    el('label', 'dev-label', row, t('Price each'));
    const pi = this.num(row, this.price, 1, EXCHANGE_MAX_PRICE, (n) => { this.price = n; update(); });
    pi.setAttribute('aria-label', t('Price each'));
    const quick = el('div', 'ex-row', form);
    const set = (p: number) => { if (p > 0) { this.price = p; pi.value = String(p); update(); } };
    if (it.ask) button(quick, t('Best sell {n}', { n: fmtNum(it.ask, 0) }), () => set(it.ask), 'btn small');
    if (it.bid) button(quick, t('Best buy {n}', { n: fmtNum(it.bid, 0) }), () => set(it.bid), 'btn small');
    if (it.last) button(quick, t('Last {n}', { n: fmtNum(it.last, 0) }), () => set(it.last), 'btn small');
    button(quick, '−5%', () => set(Math.max(1, Math.floor(this.price * 0.95))), 'btn small');
    button(quick, '+5%', () => set(Math.min(EXCHANGE_MAX_PRICE, Math.ceil(this.price * 1.05))), 'btn small');
    if (this.side === 'sell') button(quick, t('All ({n})', { n: fmtNum(owned, 0) }), () => { this.qty = Math.max(1, owned); qi.value = String(this.qty); update(); }, 'btn small');
    const summary = el('div', 'shop-desc ex-summary', form);
    const go = button(form, '', () => this.ctl.send({ c: 'exPlace', side: this.side, item: it.id, qty: this.qty, price: this.price }), 'btn big ex-go');
    const update = () => {
      const total = this.qty * this.price;
      const name = trName(d.name);
      if (this.side === 'buy') {
        summary.textContent = t('You offer to buy {qty}× {item} at up to {price} gold each. {total} gold goes into escrow now (bank first, then backpack); if you buy cheaper, the difference comes back to your collect box.', { qty: fmtNum(this.qty, 0), item: name, price: fmtNum(this.price, 0), total: fmtNum(total, 0) });
        go.textContent = t('Place buy offer · {total} gold', { total: fmtNum(total, 0) });
        go.disabled = !v.enabled || total > v.bank + v.carried || v.orders.length >= v.slots;
      } else {
        const net = total - exchangeTax(total);
        summary.textContent = t('You offer to sell {qty}× {item} at {price} gold each or more. The pieces go into escrow now (backpack first, then depot); sold at this price you get {net} gold after tax.', { qty: fmtNum(this.qty, 0), item: name, price: fmtNum(this.price, 0), net: fmtNum(net, 0) });
        go.textContent = t('Place sell offer · {total} gold', { total: fmtNum(total, 0) });
        go.disabled = !v.enabled || owned < this.qty || v.orders.length >= v.slots;
      }
    };
    update();
  }

  private num(parent: HTMLElement, value: number, min: number, max: number, onInput: (n: number) => void): HTMLInputElement {
    const i = el('input', 'num-input', parent);
    i.type = 'number';
    i.min = String(min);
    i.max = String(max);
    i.value = String(value);
    i.addEventListener('keydown', (e) => e.stopPropagation());
    i.addEventListener('input', () => onInput(Math.max(min, Math.min(max, Math.floor(Number(i.value) || min)))));
    return i;
  }

  // ---------------------------------------------------------------- your offers and the collect box

  private drawOrders(c: HTMLElement, v: ExchangeView): void {
    el('div', 'panel-title', c, t('Your offers'));
    const list = el('div', 'ex-list ex-mine', c);
    if (!v.orders.length) el('div', 'shop-empty', list, t('You have no offers on the Exchange.'));
    for (const o of v.orders) {
      const r = el('div', 'ex-order', list);
      el('span', `ex-side ${o.side}`, r, o.side === 'buy' ? t('BUY') : t('SELL'));
      const s = el('div', 'slot mini', r);
      paintSlot(s, { id: o.item, qty: 1 });
      const info = el('div', 'ex-order-info', r);
      el('div', 'shop-name', info, `${trName(itemDef(o.item).name)} · ${t('{price} gold each', { price: fmtNum(o.price, 0) })}`);
      const done = o.qty - o.left;
      el('div', 'shop-desc', info, t('{done} of {qty} done', { done: fmtNum(done, 0), qty: fmtNum(o.qty, 0) }));
      const bar = el('div', 'ex-bar', info);
      el('div', 'ex-bar-fill', bar).style.width = `${Math.round((done / o.qty) * 100)}%`;
      const x = button(r, t('Cancel'), () => this.ctl.send({ c: 'exCancel', id: o.id }), 'btn small');
      x.disabled = !v.enabled;
      x.title = t('What is left goes to your collect box');
    }
  }

  private drawBox(c: HTMLElement, v: ExchangeView): void {
    el('div', 'panel-title', c, t('Collect box'));
    const empty = !v.box.gold && !v.box.items.length;
    if (empty) el('div', 'shop-empty', c, t('Nothing waiting. Bought items, gold from sales and refunds arrive here.'));
    else {
      if (v.box.gold) el('div', 'ex-box-gold', c, t('{n} gold', { n: fmtNum(v.box.gold, 0) }));
      const grid = el('div', 'bag-grid ex-box-grid', c);
      for (const it of v.box.items) paintSlot(el('div', 'slot', grid), it);
    }
    const go = button(c, t('Collect all'), () => this.ctl.send({ c: 'exCollect' }), 'btn');
    go.disabled = !v.enabled || empty;
    el('div', 'hint', c, t('Gold goes to your bank, items to your depot.'));
  }
}
