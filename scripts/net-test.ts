/**
 * Online test: start the server (npm run server), then run
 *   npx tsx scripts/net-test.ts [ws://localhost:8080/ws]
 * Two headless clients join, see each other, chat, and trade an item.
 */
import { NetController } from '../src/client/Controller';
import { DEFAULT_APPEARANCE, type Appearance } from '../src/game/player/appearance';

const ANN_LOOK: Appearance = { body: 'female', skin: 4, hair: 'braids', hairColor: 5, beard: 'none', build: 'slim', eyes: 2, top: 10, bottom: 13, scar: 'cheek' };

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
  const a = await NetController.connect({ url, name: `Ann ${tag}`, password: 'secret1', vocation: 'paladin', appearance: ANN_LOOK });
  const b = await NetController.connect({ url, name: `Ben ${tag}`, password: 'secret2', vocation: 'sorcerer', appearance: DEFAULT_APPEARANCE });
  await pump([a, b], 1);
  check(a.game.players().length >= 2 && b.game.players().length >= 2, 'both clients see each other');
  // new characters start on the tutorial island (a new name + password is a new account: it cannot skip)
  const tu = a.game.session(a.pid)!.tutorial;
  check(tu.state === 'active' && tu.step >= 1 && !tu.canSkip, 'new characters start on the tutorial island');
  check(a.game.pvp && a.game.getPlayer(a.pid)!.secure, 'server reports PvP on, secure mode starts on');
  check(a.game.stages.name === (process.argv[3] ?? 'season') && a.game.stages.exp.length > 0, `client knows the server's exp stages (${a.game.stages.name})`);
  a.send({ c: 'secureMode', on: false });
  await pump([a, b], 0.4);
  check(!a.game.getPlayer(a.pid)!.secure, 'secure mode toggles over the network');
  a.send({ c: 'secureMode', on: true });
  const chats: string[] = [];
  b.game.events.on((e) => { if (e.type === 'chat') chats.push(e.text); });
  a.send({ c: 'say', text: 'hi there' });
  await pump([a, b], 0.6);
  check(chats.includes('hi there'), 'chat reaches the other client');
  check(JSON.stringify(b.game.getPlayer(a.pid)?.appearance) === JSON.stringify(ANN_LOOK), 'the look chosen at creation reaches other players');
  a.send({ c: 'appearance', ap: [0, 6, 10, 0, 5, 2, 0, 3, 7] });
  await pump([a, b], 0.6);
  check(b.game.getPlayer(a.pid)?.appearance.hair === 'mohawk' && b.game.getPlayer(a.pid)?.appearance.beard === 'full', 'an appearance change reaches other players');
  a.send({ c: 'appearance', ap: [0, 6, 10, 0, 10, 2, 0, 3, 7, 7] });
  await pump([a, b], 0.6);
  check(b.game.getPlayer(a.pid)?.appearance.beard === 'braided' && b.game.getPlayer(a.pid)?.appearance.scar === 'claw', 'new beards and scars reach other players');
  a.send({ c: 'appearance', ap: [1, 0, 0, 0, 3, 0, 0, 0, 0] });
  await pump([a, b], 0.4);
  check(a.game.getPlayer(a.pid)?.appearance.hair === 'mohawk', 'the server refuses an impossible appearance (female with a beard)');

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
  const qty = inv.slots[slot]!.qty;
  const before = b.game.session(b.pid)!.inventory.count(item);
  // (characters on the tutorial island carry no gold yet)
  const offerGold = Math.min(5, inv.count('gold'));
  a.send({ c: 'tradeOffer', slots: [slot], gold: offerGold });
  await pump([a, b], 0.6);
  check(b.trade()?.theirs.items[0]?.id === item && b.trade()?.theirs.gold === offerGold, 'offer visible to partner');
  b.send({ c: 'tradeAccept' });
  await pump([a, b], 0.4);
  check(!!a.trade()?.theirs.accepted, 'acceptance visible to partner');
  a.send({ c: 'tradeAccept' });
  await pump([a, b], 0.8);
  check(a.trade() === null && b.trade() === null, 'trade closed on both clients');
  check(b.game.session(b.pid)!.inventory.count(item) === before + qty, `partner received ${item} ×${qty}`);
  check(bp.vocation === 'sorcerer', 'vocation chosen at login');
  let rejected = '';
  try {
    const bad = await NetController.connect({ url, name: `Ben ${tag}`, password: 'wrong-pass', vocation: 'knight', appearance: DEFAULT_APPEARANCE });
    bad.close();
  } catch (e) {
    rejected = e instanceof Error ? e.message : String(e);
  }
  check(/wrong password|already online/i.test(rejected), `someone else cannot take a name (${rejected || 'accepted!'})`);
  // world bosses: a tester wakes one (test mode), everyone hears it, the map marks it, and a client next to it sees it
  const heard: string[] = [];
  b.game.events.on((e) => { if (e.type === 'announce') heard.push(e.text); });
  a.send({ c: 'say', text: '/worldboss gorrumvald' });
  await pump([a, b], 0.8);
  const mark = b.game.worldMarks().find((m) => m.kind === 'worldboss');
  check(!!mark, `the world map marks the world boss on every client (${mark?.name ?? 'none'})`);
  check(heard.some((t) => /has awakened near/.test(t)) || !!mark, 'the awakening is broadcast');
  if (mark) {
    b.send({ c: 'say', text: `/goto ${mark.x + 3} ${mark.y} ${mark.z}` });
    await pump([a, b], 1.2);
    const seen = b.game.enemies.find((e) => e.def.boss === 'world' && !e.dead);
    check(!!seen && !!seen.def.title, `a client near it sees the world boss (${seen ? `${seen.name}, ${seen.def.title}` : 'nothing'})`);
  }
  const aGold = a.game.session(a.pid)!.inventory.count('gold');
  const aItem = a.game.session(a.pid)!.inventory.count(item);
  a.close();
  await pump([b], 0.8);
  check(!b.game.players().some((p) => p.id === a.pid), 'leaving player disappears');
  // log back in: the character must come back exactly as it was left
  const a2 = await NetController.connect({ url, name: `Ann ${tag}`, password: 'secret1', vocation: 'druid', appearance: DEFAULT_APPEARANCE });
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
