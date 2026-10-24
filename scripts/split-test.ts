/**
 * Splitting item stacks (the "How many?" box, owner request 2026-10-24): part of a stack moves to an
 * empty slot, merges into the same item, drops on the ground, goes into a trade; wrong amounts
 * (0, negative, fractions, more than the stack) are refused and nothing changes. Runs in test:logic.
 *   npx tsx scripts/split-test.ts
 */
declare const process: { exit(code: number): never };
import { Game } from '../src/game/Game';
import { executeCommand, PROTOCOL_VERSION } from '../src/game/net/protocol';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const g = new Game();
const a = g.addPlayer('Alice', { vocation: 'paladin' });
const b = g.addPlayer('Bob', { vocation: 'knight' });
b.player.placeAt(a.player.x + 1, a.player.y, a.player.z);
const inv = a.inventory;
const size = inv.size();
inv.slots.fill(null);
const total = () => inv.count('spear') + g.bags.filter((x) => x.z === a.player.z).reduce((n, bag) => n + bag.items.filter((i) => i.id === 'spear').reduce((m, i) => m + i.qty, 0), 0);
const snapshot = () => JSON.stringify(inv.slots.slice(0, size));

console.log('Protocol');
check(PROTOCOL_VERSION >= 30, 'protocol 30: amounts on moveSlot / tradeItem, tradeAdd');

console.log('Split into an empty slot');
inv.slots[0] = { id: 'spear', qty: 10 };
executeCommand(g, a.id, { c: 'moveSlot', from: 0, to: 3, qty: 4 });
check(inv.slots[0]?.qty === 6 && inv.slots[3]?.id === 'spear' && inv.slots[3]?.qty === 4, '10 spears → 6 stay, 4 in the empty slot');

console.log('Merge part of a stack into the same item');
executeCommand(g, a.id, { c: 'moveSlot', from: 0, to: 3, qty: 2 });
check(inv.slots[0]?.qty === 4 && inv.slots[3]?.qty === 6, '2 more onto the other spears (4 + 6)');
executeCommand(g, a.id, { c: 'moveSlot', from: 0, to: 3 });
check(!inv.slots[0] && inv.slots[3]?.qty === 10, 'no amount: the whole stack moves and merges');

console.log('Part of a stack onto a different item is refused');
inv.slots[1] = { id: 'health_potion', qty: 3 };
let before = snapshot();
executeCommand(g, a.id, { c: 'moveSlot', from: 3, to: 1, qty: 5 });
check(snapshot() === before, 'spears onto potions with an amount: nothing changes');

console.log('Wrong amounts are refused');
for (const q of [0, -3, 11, 2.5, Number.NaN, 1e9]) {
  before = snapshot();
  executeCommand(g, a.id, { c: 'moveSlot', from: 3, to: 5, qty: q });
  check(snapshot() === before, `moveSlot qty ${q}: nothing changes`);
}
const t0 = total();
for (const q of [0, -1, 11, 1.5]) {
  executeCommand(g, a.id, { c: 'throw', from: 3, x: a.player.x, y: a.player.y + 1, qty: q });
  check(inv.slots[3]?.qty === 10 && total() === t0, `throw qty ${q}: refused`);
}

console.log('Drop part of a stack on the ground');
const gx = a.player.x, gy = a.player.y - 1;
executeCommand(g, a.id, { c: 'throw', from: 3, x: gx, y: gy, qty: 3 });
const pile = g.bags.find((x) => x.x === gx && x.y === gy && x.z === a.player.z && x.items.some((i) => i.id === 'spear'));
check(inv.slots[3]?.qty === 7 && pile?.items.some((i) => i.id === 'spear' && i.qty === 3), '3 of 10 spears on the ground, 7 kept');
check(total() === t0, 'no spears made or lost');
if (pile) {
  executeCommand(g, a.id, { c: 'moveBag', id: pile.id, x: gx + 1, y: gy, qty: 0 });
  check(pile.items.some((i) => i.id === 'spear' && i.qty === 3), 'moveBag qty 0: refused');
  executeCommand(g, a.id, { c: 'moveBag', id: pile.id, x: gx + 1, y: gy, qty: 2 });
  const moved = g.bags.find((x) => x.x === gx + 1 && x.y === gy && x.z === a.player.z && x.items.some((i) => i.id === 'spear'));
  check(moved?.items.some((i) => i.id === 'spear' && i.qty === 2) && pile.items.some((i) => i.id === 'spear' && i.qty === 1), '2 of the 3 moved to the next tile');
  check(total() === t0, 'still no spears made or lost');
}

console.log('Part of a stack in a trade');
inv.slots[1] = null;
inv.slots[2] = { id: 'gold', qty: 500 };
executeCommand(g, a.id, { c: 'tradeItem', id: b.id, slot: 3, qty: 0 });
check(!g.tradeOf(a.id), 'tradeItem qty 0: refused (no trade opened)');
executeCommand(g, a.id, { c: 'tradeItem', id: b.id, slot: 3, qty: 4 });
const tr = g.tradeOf(a.id);
const offered = tr ? tr.offers[a.id].slots.map((i) => inv.slots[i]) : [];
check(!!tr && offered.length === 1 && offered[0]?.id === 'spear' && offered[0]?.qty === 4, 'dropping 4 of 7 spears on Bob offers exactly 4');
check(inv.slots[3]?.qty === 3, 'the other 3 stay out of the trade');
executeCommand(g, a.id, { c: 'tradeAdd', slot: 2, qty: 120 });
check(tr?.offers[a.id].gold === 120, 'gold from the trade window: 120 of 500 offered');
executeCommand(g, a.id, { c: 'tradeAdd', slot: 2, qty: 501 });
check(tr?.offers[a.id].gold === 120, 'tradeAdd more gold than the stack: refused');
executeCommand(g, a.id, { c: 'tradeAdd', slot: 3, qty: -2 });
check(tr?.offers[a.id].slots.length === 1, 'tradeAdd negative: refused');
executeCommand(g, a.id, { c: 'tradeAccept' });
executeCommand(g, b.id, { c: 'tradeAccept' });
check(b.inventory.count('spear') === 4 && inv.count('spear') === 3, 'Bob got 4 spears, Alice kept 3');
check(b.inventory.count('gold') >= 120 && inv.count('gold') === 380, '120 gold changed hands');

console.log('No free slot to split into');
for (let i = 0; i < size; i++) inv.slots[i] = { id: 'arrow', qty: 5 };
executeCommand(g, a.id, { c: 'tradeRequest', id: b.id });
before = snapshot();
executeCommand(g, a.id, { c: 'tradeAdd', slot: 0, qty: 2 });
check(snapshot() === before && (g.tradeOf(a.id)?.offers[a.id].slots.length ?? 0) === 0, 'a full backpack cannot split: nothing offered, nothing changed');

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall split checks passed');
