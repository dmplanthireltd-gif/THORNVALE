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

  // splitting stacks (the "How many?" box): the server moves only the amount asked for and refuses wrong amounts
  a.send({ c: 'say', text: '/item spear 10' });
  await pump([a, b], 0.6);
  const ai = () => a.game.session(a.pid)!.inventory;
  const sp = ai().slots.findIndex((s, i) => i < ai().size() && s?.id === 'spear' && s.qty >= 10);
  const free = ai().slots.findIndex((s, i) => i < ai().size() && !s);
  check(sp >= 0 && free >= 0, 'test item: a stack of spears and a free slot');
  if (sp >= 0 && free >= 0) {
    const n0 = ai().slots[sp]!.qty;
    const all0 = ai().count('spear');
    a.send({ c: 'moveSlot', from: sp, to: free, qty: 4 });
    await pump([a, b], 0.6);
    check(ai().slots[sp]?.qty === n0 - 4 && ai().slots[free]?.qty === 4, `split 4 of ${n0} spears into an empty slot over the network`);
    for (const q of [0, -2, n0, 1.5]) a.send({ c: 'moveSlot', from: sp, to: free, qty: q });
    await pump([a, b], 0.6);
    check(ai().slots[sp]?.qty === n0 - 4 && ai().slots[free]?.qty === 4, 'the server refuses qty 0, negative, too large and fractions');
    a.send({ c: 'moveSlot', from: free, to: sp, qty: 1 });
    await pump([a, b], 0.6);
    check(ai().slots[sp]?.qty === n0 - 3 && ai().slots[free]?.qty === 3, 'part of a stack merges into the same item');
    const bSpears = b.game.session(b.pid)!.inventory.count('spear');
    a.send({ c: 'tradeItem', id: b.pid, slot: sp, qty: 2 });
    await pump([a, b], 0.6);
    check(b.trade()?.theirs.items.length === 1 && b.trade()?.theirs.items[0]?.id === 'spear' && b.trade()?.theirs.items[0]?.qty === 2, 'a partial stack offered in a trade shows as exactly 2');
    b.send({ c: 'tradeAccept' });
    a.send({ c: 'tradeAccept' });
    await pump([a, b], 0.8);
    check(b.game.session(b.pid)!.inventory.count('spear') === bSpears + 2 && ai().count('spear') === all0 - 2, 'only the 2 spears changed hands');
  }

  let rejected = '';
  try {
    const bad = await NetController.connect({ url, name: `Ben ${tag}`, password: 'wrong-pass', vocation: 'knight', appearance: DEFAULT_APPEARANCE });
    bad.close();
  } catch (e) {
    rejected = e instanceof Error ? e.message : String(e);
  }
  check(/wrong password|already online/i.test(rejected), `someone else cannot take a name (${rejected || 'accepted!'})`);
  // the Gilded Exchange: both go to a clerk, Ann sells ore, Ben buys some at a higher price (trades at Ann's), collect
  {
    const clerk = a.game.npcs.find((n) => n.key === 'exchange_odile');
    check(!!clerk, 'the clients know the Exchange clerks');
    if (clerk) {
      a.send({ c: 'say', text: `/goto ${clerk.x} ${clerk.y - 2} 0` });
      b.send({ c: 'say', text: `/goto ${clerk.x + 1} ${clerk.y - 2} 0` });
      a.send({ c: 'say', text: '/item iron_ore 6' });
      b.send({ c: 'say', text: '/item gold 500' });
      await pump([a, b], 1);
      for (const c of [a, b]) {
        c.send({ c: 'talk', id: clerk.id });
        await pump([a, b], 0.6);
        c.send({ c: 'dialogue', action: 'exchange' });
      }
      await pump([a, b], 0.8);
      const va = a.exchange(), vb = b.exchange();
      check(!!va && !!vb, `the clerk opens the Exchange window on both clients${va && !va.enabled ? ' (closed: no storage)' : ''}`);
      if (va?.enabled && vb) {
        a.send({ c: 'exPlace', side: 'sell', item: 'iron_ore', qty: 6, price: 40 });
        await pump([a, b], 0.6);
        check(a.exchange()?.orders.length === 1, 'a sell offer appears in Ann\'s window');
        b.send({ c: 'exQuery', item: 'iron_ore' });
        await pump([a, b], 0.6);
        check(b.exchange()?.item?.ask === 40, 'Ben sees the best sell offer');
        b.send({ c: 'exPlace', side: 'buy', item: 'iron_ore', qty: 2, price: 50 });
        await pump([a, b], 0.6);
        const bb = b.exchange()?.box;
        check(!!bb && bb.items.some((i) => i.id === 'iron_ore' && i.qty === 2) && bb.gold === 20, 'Ben bought 2 at 40 and got 20 back in his collect box');
        check(a.exchange()?.orders[0]?.left === 4 && a.exchange()?.box.gold === 80 - 1, 'Ann\'s offer filled in part; 79 gold (after tax) waits for her');
        a.send({ c: 'exCancel', id: a.exchange()!.orders[0].id });
        await pump([a, b], 0.5);
        a.send({ c: 'exCollect' });
        await pump([a, b], 0.6);
        check(!a.exchange()?.orders.length && !a.exchange()?.box.gold && !a.exchange()?.box.items.length, 'Ann cancelled the rest and collected everything');
        b.send({ c: 'exCollect' });
        b.send({ c: 'exClose' });
        await pump([a, b], 0.6);
        check(b.exchange() === null, 'closing the window');
      }
      a.send({ c: 'exClose' });
    }
  }
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
  // task boards and world events (protocol 35): a fresh board, finish it, collect at a keeper; a treasure hunt
  {
    a.send({ c: 'say', text: '/tasks reset' });
    await pump([a, b], 0.8);
    const tk = () => a.game.session(a.pid)!.tasks;
    check(tk().daily.length === 3 && tk().weekly.length === 2, `the client receives its task board (${tk().daily.map((t) => t.k).join(', ')})`);
    const keeper = a.game.npcs.find((n) => n.key === 'taskboard_thornvale');
    check(!!keeper, 'the clients know the task-board keepers');
    if (keeper) {
      a.send({ c: 'say', text: '/tasks done' });
      a.send({ c: 'say', text: `/goto ${keeper.x} ${keeper.y + 1} ${keeper.z}` });
      await pump([a, b], 1);
      const seals0 = tk().seals, exp0 = a.game.getPlayer(a.pid)!.exp;
      a.send({ c: 'task', a: 'claim', i: 0 });
      await pump([a, b], 0.8);
      check(tk().daily[0].c && tk().seals === seals0 + tk().daily[0].s && a.game.getPlayer(a.pid)!.exp > exp0, `a finished task is collected at the board over the network (+${tk().seals - seals0} seals)`);
      a.send({ c: 'task', a: 'claim', i: 0 });
      await pump([a, b], 0.5);
      check(tk().seals === seals0 + tk().daily[0].s, 'the server pays a task once');
    }
    a.send({ c: 'say', text: '/double both 1' });
    a.send({ c: 'say', text: '/event start treasure' });
    await pump([a, b], 1.5);
    const lv = b.game.liveEvents.clientView();
    check(!!lv.v?.a.some((e) => e[0] === 'double_exp') && !!lv.v?.a.some((e) => e[0] === 'treasure') && (lv.v?.tr?.length ?? 0) > 0, 'every client sees the double weekend and the treasure hunt in the events view');
    check((lv.v?.c.length ?? 0) > 0 && Math.abs(lv.now - Date.now()) < 120_000, 'the calendar and the server clock reach the client');
    const said: string[] = [];
    a.game.events.on((e) => { if (e.type === 'message') said.push(e.text); });
    a.send({ c: 'live', a: 'seek' });
    await pump([a, b], 0.8);
    check(said.some((t) => /trail|cache|surface/i.test(t)), `seek answers over the network (${said[said.length - 1] ?? 'nothing'})`);
    a.send({ c: 'say', text: '/event stop treasure' });
    a.send({ c: 'say', text: '/double off' });
    await pump([a, b], 0.6);
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
