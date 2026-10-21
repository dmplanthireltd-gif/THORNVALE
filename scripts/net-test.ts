/**
 * Online test: start the server (npm run server), then run
 *   npx tsx scripts/net-test.ts [ws://localhost:8080/ws]
 * Two headless clients join, see each other, chat, and trade an item.
 */
import { NetController } from '../src/client/Controller';
import { DEFAULT_OUTFIT } from '../src/game/player/outfits';

const process = (globalThis as unknown as { process: { argv: string[]; exit(code: number): never } }).process;
const url = process.argv[2] ?? 'ws://localhost:8080/ws';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}`);
  if (!ok) failed++;
};

async function pump(clients: NetController[], secs: number): Promise<void> {
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    for (const c of clients) c.update(0.05);
    await sleep(50);
  }
}

async function main(): Promise<void> {
  const tag = Array.from({ length: 4 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const a = await NetController.connect({ url, name: `Ann ${tag}`, password: 'secret1', vocation: 'paladin', outfit: DEFAULT_OUTFIT });
  const b = await NetController.connect({ url, name: `Ben ${tag}`, password: 'secret2', vocation: 'sorcerer', outfit: DEFAULT_OUTFIT });
  await pump([a, b], 1);
  check(a.game.players().length >= 2 && b.game.players().length >= 2, 'both clients see each other');
  const chats: string[] = [];
  b.game.events.on((e) => { if (e.type === 'chat') chats.push(e.text); });
  a.send({ c: 'say', text: 'hi there' });
  await pump([a, b], 0.6);
  check(chats.includes('hi there'), 'chat reaches the other client');

  const bp = b.game.getPlayer(b.pid)!;
  const ap = a.game.getPlayer(a.pid)!;
  b.send({ c: 'moveTo', x: ap.x + 1, y: ap.y });
  await pump([a, b], 3);
  a.send({ c: 'tradeRequest', id: b.pid });
  await pump([a, b], 0.6);
  check(!!a.trade() && !!b.trade(), 'trade opened on both clients');
  const inv = a.game.session(a.pid)!.inventory;
  const slot = inv.slots.findIndex((s) => s && s.id !== 'gold');
  const item = inv.slots[slot]!.id;
  const before = b.game.session(b.pid)!.inventory.count(item);
  a.send({ c: 'tradeOffer', slots: [slot], gold: 5 });
  await pump([a, b], 0.6);
  check(b.trade()?.theirs.items[0]?.id === item && b.trade()?.theirs.gold === 5, 'offer visible to partner');
  b.send({ c: 'tradeAccept' });
  await pump([a, b], 0.4);
  check(!!a.trade()?.theirs.accepted, 'acceptance visible to partner');
  a.send({ c: 'tradeAccept' });
  await pump([a, b], 0.8);
  check(a.trade() === null && b.trade() === null, 'trade closed on both clients');
  check(b.game.session(b.pid)!.inventory.count(item) === before + 1, `partner received ${item}`);
  check(bp.vocation === 'sorcerer', 'vocation chosen at login');
  let rejected = '';
  try {
    const bad = await NetController.connect({ url, name: `Ben ${tag}`, password: 'wrong-pass', vocation: 'knight', outfit: DEFAULT_OUTFIT });
    bad.close();
  } catch (e) {
    rejected = e instanceof Error ? e.message : String(e);
  }
  check(/wrong password|already online/i.test(rejected), `someone else cannot take a name (${rejected || 'accepted!'})`);
  const aGold = a.game.session(a.pid)!.inventory.count('gold');
  const aItem = a.game.session(a.pid)!.inventory.count(item);
  a.close();
  await pump([b], 0.8);
  check(!b.game.players().some((p) => p.id === a.pid), 'leaving player disappears');
  // log back in: the character must come back exactly as it was left
  const a2 = await NetController.connect({ url, name: `Ann ${tag}`, password: 'secret1', vocation: 'druid', outfit: DEFAULT_OUTFIT });
  await pump([a2, b], 0.6);
  const s2 = a2.game.session(a2.pid)!;
  check(s2.player.vocation === 'paladin', 'relogin keeps the vocation (not the one picked at login)');
  check(s2.inventory.count('gold') === aGold && s2.inventory.count(item) === aItem, 'relogin keeps the traded-away item gone and the gold');
  a2.close();
  b.close();
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll online checks passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
