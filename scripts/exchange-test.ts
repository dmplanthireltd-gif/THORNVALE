/**
 * The Gilded Exchange (exchange/exchange.ts, exchange/ExchangeSystem.ts, server storage):
 * buy and sell offers with escrow, price-time matching at the older offer's price with
 * refunds, partial fills, the collect box, cancelling, slot limits, the tax, price history,
 * tradeable items only, the window at the clerks, offline counterparts, and — the part
 * that keeps gold and items safe — dupe and race cases (a fuzz run that counts every
 * piece and every coin), restart persistence through the file storage, the journal that
 * keeps a character's save and the book in one write, and a crash before storing.
 *   tsx scripts/exchange-test.ts
 */
declare const process: { exit(code: number): never };
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import { Rng } from '../src/game/core/rng';
import {
  EXCHANGE_PREMIUM_SLOTS, EXCHANGE_SLOTS, exchangeTax, isTradeable, type ExchangeChange,
} from '../src/game/exchange/exchange';
import { executeCommand } from '../src/game/net/protocol';
import { NPCS } from '../src/game/npc/npcs';
import { EXCHANGE_CLERKS } from '../src/game/world/grandCity';
import { FileStorage } from '../server/storage';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

async function main(): Promise<void> {
const ORE = 'iron_ore';
const changes: ExchangeChange[] = [];
let clock = 1_800_000_000_000;
const g = new Game({ premium: true, now: () => clock });
const ex = g.exchange;
ex.book.enabled = true;
ex.sink = (c) => changes.push(JSON.parse(JSON.stringify(c)));
const clerk = g.npcs.find((n) => n.key === EXCHANGE_CLERKS[0].key)!;

function player(name: string, gold: number, ore: number): Session {
  const s = g.addPlayer(name, { intent: new BufferedIntent(), vocation: 'knight' });
  s.bank = gold;
  if (ore) s.inventory.add(ORE, ore);
  stand(s);
  ex.open(s.id, clerk.id);
  return s;
}
function stand(s: Session): void {
  g.teleport(s.player, clerk.x, clerk.y - 2, 0);
}
const box = (s: Session) => ex.book.box(s.player.name.toLowerCase());
const boxOre = (s: Session) => box(s).items.find((i) => i.id === ORE)?.qty ?? 0;
const depotOre = (s: Session) => s.depot.reduce((n, x) => n + (x && x.id === ORE ? x.qty : 0), 0);
const orders = (s: Session) => ex.book.ordersBy(s.player.name.toLowerCase());

console.log('What can be traded');
{
  check(!isTradeable('gold') && isTradeable(ORE) && isTradeable('health_potion'), 'gold no, ore and potions yes');
  const capes = Object.values(NPCS).flatMap((n) => n.sells ?? []).map((e) => e.id).filter((id) => /cape|mantle/.test(id));
  check(capes.length > 0, `shops sell capes (${capes.length})`);
  check(!isTradeable('grandmaster_mantle') && !isTradeable('tyrantbane_cape'), 'achievement capes (mastery, deeds) stay with their owner');
  check(!isTradeable('no_such_item'), 'unknown items are refused');
}

console.log('The window at the clerks');
const A = player('Ama', 50_000, 100);
const B = player('Bors', 50_000, 0);
const C = player('Cira', 50_000, 40);
{
  check(EXCHANGE_CLERKS.every((c) => NPCS[c.key]?.exchange), 'every clerk is an Exchange clerk');
  const D = g.addPlayer('Dagny', { intent: new BufferedIntent(), vocation: 'druid' });
  D.inventory.add(ORE, 5);
  ex.place(D.id, 'sell', ORE, 5, 10);
  check(!orders(D).length && D.inventory.count(ORE) === 5, 'nothing can be placed without a clerk');
  // the dialogue option opens it
  stand(D);
  executeCommand(g, D.id, { c: 'talk', id: clerk.id });
  for (let i = 0; i < 40 && !D.dialogue; i++) g.update(0.05);
  executeCommand(g, D.id, { c: 'dialogue', action: 'exchange' });
  check(ex.isOpen(D.id) && !!ex.view(D.id), 'the clerk\'s "Trade on the Exchange" opens the window');
  g.teleport(D.player, clerk.x + 12, clerk.y - 12, 0);
  g.update(0.05);
  check(!ex.isOpen(D.id), 'walking away closes it');
  g.removePlayer(D.id);
}

console.log('Selling, buying, the older price, refunds, tax');
{
  ex.place(A.id, 'sell', ORE, 10, 100);
  check(A.inventory.count(ORE) === 90 && orders(A).length === 1 && orders(A)[0].left === 10, 'a sell offer takes its pieces into escrow');
  const bank0 = B.bank;
  ex.place(B.id, 'buy', ORE, 4, 120);
  check(B.bank === bank0 - 480, 'a buy offer takes quantity × price into escrow');
  check(boxOre(B) === 4 && box(B).gold === 80, 'it trades at the older offer\'s price (100) and refunds the difference (4 × 20)');
  check(box(A).gold === 400 - exchangeTax(400) && exchangeTax(400) === 8, 'the seller gets the price less a 2% tax');
  check(orders(A)[0].left === 6 && !orders(B).length, 'partial fill: 6 left on the sell offer, the buy offer is done');
  check(ex.book.last(ORE) === 100 && ex.book.history.get(ORE)?.length === 1, 'the trade is in the price history');
}
{
  // price, then time: C's cheaper offer first, then A's older offer before C's later one at the same price
  ex.place(C.id, 'sell', ORE, 5, 100);
  ex.place(C.id, 'sell', ORE, 3, 95);
  const t = ex.book.top(ORE);
  check(t.ask === 95 && t.askQty === 3, 'best ask is the cheapest offer');
  ex.place(B.id, 'buy', ORE, 11, 100);
  const cOrders = orders(C);
  check(!orders(A).length && cOrders.length === 1 && cOrders[0].price === 100 && cOrders[0].left === 3, 'cheapest first (3 @ 95), then the older of two equal prices (A\'s 6 before C\'s)');
  check(boxOre(B) === 15 && box(B).gold === 80 + 3 * 5, 'B got 11 more and 5 gold back on the cheaper pieces');
}
{
  // a resting buy is the older offer: a lower sell trades at the buy's price
  ex.place(B.id, 'buy', ORE, 10, 90);
  const before = box(A).gold;
  ex.place(A.id, 'sell', ORE, 3, 80);
  check(box(A).gold - before === 270 - exchangeTax(270), 'a sell below an older buy trades at the buy\'s price (90)');
  check(orders(B).find((o) => o.price === 90)?.left === 7, 'the buy offer fills in part (7 left)');
}

console.log('Cancelling and collecting');
{
  const id = orders(B).find((o) => o.price === 90)!.id;
  const gold0 = box(B).gold;
  ex.cancel(B.id, id);
  check(box(B).gold === gold0 + 7 * 90 && !orders(B).length, 'cancelling a buy puts what is left of its gold in the box');
  ex.cancel(B.id, id);
  check(box(B).gold === gold0 + 7 * 90, 'cancelling twice gives nothing more');
  const cid = orders(C)[0].id;
  ex.cancel(A.id, cid);
  check(orders(C).length === 1, 'nobody can cancel someone else\'s offer');
  const bank0 = B.bank, g0 = box(B).gold, o0 = boxOre(B);
  ex.collect(B.id);
  check(B.bank === bank0 + g0 && depotOre(B) === o0 && !ex.book.boxes.has('bors'), 'collecting: gold to the bank, items to the depot, box empty');
  ex.collect(B.id);
  check(B.bank === bank0 + g0 && depotOre(B) === o0, 'collecting twice gives nothing more');
}

console.log('Limits and refusals');
{
  const E = player('Edda', 1_000_000, 0);
  for (let i = 0; i < EXCHANGE_SLOTS + 2; i++) ex.place(E.id, 'buy', 'health_potion', 1, 10 + i);
  check(orders(E).length === EXCHANGE_SLOTS && ex.slotsFor(E) === EXCHANGE_SLOTS && EXCHANGE_PREMIUM_SLOTS > EXCHANGE_SLOTS, `${EXCHANGE_SLOTS} offers at once (premium ${EXCHANGE_PREMIUM_SLOTS})`);
  for (const o of orders(E)) ex.cancel(E.id, o.id);
  ex.place(E.id, 'buy', ORE, 1, 2_000_000);
  check(!orders(E).length && E.bank + box(E).gold === 1_000_000, 'a buy you cannot pay for is refused (and nothing is taken)');
  ex.place(E.id, 'sell', ORE, 1, 10);
  check(!orders(E).length, 'a sell of what you do not have is refused');
  ex.place(E.id, 'sell', 'gold', 1, 10);
  ex.place(E.id, 'buy', 'grandmaster_mantle', 1, 10);
  check(!orders(E).length, 'gold and achievement capes are refused');
  ex.place(E.id, 'buy', ORE, 0, 10);
  ex.place(E.id, 'buy', ORE, 1, 0);
  ex.place(E.id, 'buy', ORE, 1.5 as unknown as number, 10);
  check(orders(E).length <= 1, 'zero or broken quantities and prices are refused');
  for (const o of orders(E)) ex.cancel(E.id, o.id);
  // never trade with yourself
  E.inventory.add(ORE, 5);
  ex.place(E.id, 'sell', ORE, 5, 50);
  ex.place(E.id, 'buy', ORE, 5, 60);
  check(orders(E).length === 1 && orders(E)[0].side === 'sell', 'an offer that would meet your own is refused');
  for (const o of orders(E)) ex.cancel(E.id, o.id);
  ex.collect(E.id);
}

console.log('Offline sellers and buyers');
{
  const F = player('Fenna', 0, 20);
  ex.place(F.id, 'sell', ORE, 20, 70);
  const saveF = g.serialize(F.id);
  g.removePlayer(F.id);
  ex.place(B.id, 'buy', ORE, 20, 70);
  check(ex.book.box('fenna').gold === 1400 - exchangeTax(1400), 'an offline seller\'s offer fills; the gold waits in their box');
  const F2 = g.addPlayer('Fenna', { intent: new BufferedIntent(), vocation: 'knight' });
  g.applySave(F2.id, saveF);
  stand(F2);
  ex.open(F2.id, clerk.id);
  const v = ex.view(F2.id)!;
  check(v.box.gold === 1400 - exchangeTax(1400), 'back online, the box shows it');
  ex.collect(F2.id);
  check(F2.bank === 1400 - exchangeTax(1400), 'and it can be collected');
}

console.log('No dupes: same tick, many players, every piece and coin counted');
{
  // two buyers race for one small sell offer in the same tick
  const S = player('Sela', 0, 5);
  ex.place(S.id, 'sell', ORE, 5, 30);
  ex.place(A.id, 'buy', ORE, 5, 30);
  ex.place(B.id, 'buy', ORE, 5, 30);
  check(boxOre(A) === 5 && orders(B).length === 1 && orders(B)[0].left === 5, 'two buyers in one tick: the first gets the 5, the second waits on the book');
  for (const o of orders(B)) ex.cancel(B.id, o.id);
  // fuzz: random offers, cancels and collects; nothing appears or vanishes
  const people = [A, B, C, S, player('Tove', 200_000, 300), player('Ulf', 300_000, 0), player('Vala', 0, 500)];
  const rng = new Rng(77);
  const ITEMS = [ORE, 'health_potion', 'coal'];
  for (const p of people) { p.inventory.add('health_potion', 20); p.inventory.add('coal', 50); }
  const tax = () => changes.flatMap((c) => c.trades).reduce((n, t) => n + exchangeTax(t.price * t.qty), 0);
  const count = (id: string) => {
    let n = 0;
    for (const s of g.sessions.values()) n += s.inventory.count(id) + s.depot.reduce((k, x) => k + (x && x.id === id ? x.qty : 0), 0);
    for (const b of ex.book.boxes.values()) n += b.items.find((i) => i.id === id)?.qty ?? 0;
    for (const o of ex.book.orders.values()) if (o.side === 'sell' && o.item === id) n += o.left;
    return n;
  };
  const gold = () => {
    let n = 0;
    for (const s of g.sessions.values()) n += s.bank + s.inventory.count('gold');
    for (const b of ex.book.boxes.values()) n += b.gold;
    for (const o of ex.book.orders.values()) if (o.side === 'buy') n += o.left * o.price;
    return n + tax();
  };
  const before = { gold: gold(), items: ITEMS.map(count) };
  let trades0 = changes.flatMap((c) => c.trades).length;
  for (let step = 0; step < 1500; step++) {
    const p = people[rng.int(0, people.length - 1)];
    const r = rng.next();
    const item = ITEMS[rng.int(0, ITEMS.length - 1)];
    if (r < 0.55) ex.place(p.id, rng.chance(0.5) ? 'buy' : 'sell', item, rng.int(1, 12), rng.int(20, 60));
    else if (r < 0.8) { const os = orders(p); if (os.length) ex.cancel(p.id, os[rng.int(0, os.length - 1)].id); }
    else ex.collect(p.id);
    if (rng.chance(0.1)) { clock += 1000; g.update(0.05); }
  }
  const after = { gold: gold(), items: ITEMS.map(count) };
  const traded = changes.flatMap((c) => c.trades).length - trades0;
  trades0 = traded;
  check(traded > 50, `the fuzz run traded (${traded} trades)`);
  check(after.gold === before.gold, `every coin accounted for (${before.gold} → ${after.gold}, tax included)`);
  check(after.items.every((n, i) => n === before.items[i]), `every piece accounted for (${before.items.join('/')} → ${after.items.join('/')})`);
  let crossed = 0;
  for (const it of ITEMS) {
    const t = ex.book.top(it);
    if (t.bid && t.ask && t.bid >= t.ask) {
      // only possible between offers of one owner, which are never matched (and never placed)
      crossed++;
    }
  }
  check(crossed === 0, 'the book is never left crossed (best bid below best ask)');
  check([...ex.book.orders.values()].every((o) => o.left > 0 && o.left <= o.qty), 'no empty or overfilled offers');
}

console.log('Stored, restarted, crashed');
{
  const dir = mkdtempSync(join(tmpdir(), 'thornvale-exchange-'));
  try {
    const file = join(dir, 'characters.json');
    const st = new FileStorage(file);
    // replay every change into storage the way the server does (with the actor's save)
    const g2 = new Game({ premium: true, now: () => clock });
    g2.exchange.book.enabled = true;
    const pending: Array<Promise<void>> = [];
    g2.exchange.sink = (c) => {
      const s = c.actor !== null ? g2.sessions.get(c.actor) : null;
      pending.push(st.commitExchange({
        putOrders: c.putOrders, dropOrders: c.dropOrders, putBoxes: c.putBoxes, trades: c.trades,
        character: s ? { key: s.player.name.toLowerCase(), name: s.player.name, data: g2.serialize(s.id), owner: null } : null,
      }));
    };
    const ck = g2.npcs.find((n) => n.key === EXCHANGE_CLERKS[1].key)!;
    const mk = (name: string, gold: number, ore: number) => {
      const s = g2.addPlayer(name, { intent: new BufferedIntent(), vocation: 'paladin' });
      s.bank = gold;
      s.inventory.add(ORE, ore);
      g2.teleport(s.player, ck.x + 2, ck.y, 0);
      g2.exchange.open(s.id, ck.id);
      return s;
    };
    const P = mk('Pell', 10_000, 30), Q = mk('Quin', 10_000, 0);
    g2.exchange.place(P.id, 'sell', ORE, 30, 50);
    g2.exchange.place(Q.id, 'buy', ORE, 12, 55);
    g2.exchange.place(Q.id, 'buy', 'coal', 3, 7);
    await Promise.all(pending);
    // restart: a new storage reads the files; the book comes back exactly
    const st2 = new FileStorage(file);
    const loaded = await st2.loadExchange();
    const g3 = new Game({ premium: true });
    g3.exchange.book.load(loaded.orders, loaded.boxes, loaded.trades);
    const same = JSON.stringify([...g3.exchange.book.orders.values()].sort((a, b) => a.seq - b.seq)) === JSON.stringify([...g2.exchange.book.orders.values()].sort((a, b) => a.seq - b.seq));
    check(same && g3.exchange.book.orders.size === 2, 'after a restart every open offer is back, filled parts included');
    check(JSON.stringify(g3.exchange.book.box('quin')) === JSON.stringify(g2.exchange.book.box('quin')) && JSON.stringify(g3.exchange.book.box('pell')) === JSON.stringify(g2.exchange.book.box('pell')), 'and every collect box');
    check(g3.exchange.book.last(ORE) === 50, 'and the price history');
    // the character file was never flushed: the journal in the Exchange file holds the saves that went with the changes
    const pell = await st2.getCharacter('pell');
    check(!!pell && pell.data.inventory && JSON.stringify(pell.data).includes(ORE) === false, 'the seller\'s save stored with the change (ore gone into escrow) even though the character file was not written');
    const quin = await st2.getCharacter('quin');
    check(!!quin && quin.data.bank === 10_000 - 12 * 55 - 21, 'the buyer\'s save stored with the change (escrow taken from the bank)');
    // once the character file is flushed the journal empties, and loading still agrees
    await st2.flush();
    const st3 = new FileStorage(file);
    check((await st3.getCharacter('quin'))?.data.bank === quin!.data.bank && (await st3.loadExchange()).orders.length === 2, 'after the character file is written the journal is emptied and nothing changes');
    // a crash before storing: the change is simply not there, and the older save still holds the escrow
    const st4 = new FileStorage(file);
    const quin0 = (await st4.getCharacter('quin'))!.data;
    const lost = g2.exchange.sink;
    g2.exchange.sink = () => { /* the server stopped before this reached the database */ };
    g2.exchange.place(Q.id, 'buy', ORE, 5, 60);
    g2.exchange.sink = lost;
    const st5 = new FileStorage(file);
    const quin1 = (await st5.getCharacter('quin'))!.data;
    const ex5 = await st5.loadExchange();
    check(quin1.bank === quin0.bank && !ex5.orders.some((o) => o.owner === 'quin' && o.price === 60), 'a crash before storing loses the change as a whole: no new offer and the gold still in the save');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('Over the wire');
{
  const W = player('Wira', 5_000, 10);
  executeCommand(g, W.id, { c: 'exPlace', side: 'sell', item: ORE, qty: 4, price: 33 });
  check(orders(W).length === 1 && orders(W)[0].left === 4 && W.inventory.count(ORE) === 6, 'exPlace places an offer');
  executeCommand(g, W.id, { c: 'exPlace', side: 'steal' as 'buy', item: ORE, qty: 4, price: 33 });
  executeCommand(g, W.id, { c: 'exPlace', side: 'buy', item: ORE, qty: Number.NaN, price: 33 });
  check(orders(W).length === 1, 'broken messages are ignored');
  executeCommand(g, W.id, { c: 'exQuery', item: ORE });
  const v = ex.view(W.id)!;
  check(!!v.item && v.item.id === ORE && v.item.asks.length > 0 && v.orders.length === 1 && v.have.some((h) => h.id === ORE) && !v.have.some((h) => h.id === 'gold'), 'the view shows the item\'s book, your offers and what you can sell');
  executeCommand(g, W.id, { c: 'exCancel', id: orders(W)[0].id });
  executeCommand(g, W.id, { c: 'exCollect' });
  check(!orders(W).length && W.depot.some((x) => x?.id === ORE), 'exCancel and exCollect');
  executeCommand(g, W.id, { c: 'exClose' });
  check(!ex.isOpen(W.id) && ex.view(W.id) === null, 'exClose closes it');
}

}

main().then(() => {
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Exchange checks passed.');
  if (failures) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });
