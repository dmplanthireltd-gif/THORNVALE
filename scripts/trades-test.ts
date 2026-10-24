/**
 * The trade skills of 2026-10-24 (trades/): the save migration that makes room for them, and each
 * skill's core loop — agility shortcuts and running stamina, thieving (pockets, stalls, strongboxes),
 * herblore (picking, cleaning, brewing), the new fletching recipes — plus their saves, network view,
 * capes, shops and test commands. Run as part of `npm run test:logic` (also `npx tsx scripts/trades-test.ts`).
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import { applySnapshot, buildSnapshot } from '../src/game/net/protocol';
import { NONCOMBAT_SKILLS } from '../src/game/gathering/skills';
import { gatherXpForLevel } from '../src/game/gathering/woodcutting';
import { currentActivity } from '../src/game/gathering/activity';
import { obstacleHandles, obstaclePath } from '../src/game/trades/layout';
import { STAMINA_MAX } from '../src/game/trades/agility';
import { HERB_BY_ID } from '../src/game/trades/herblore';
import { STALLS } from '../src/game/trades/thieving';
import { CAPE_BY_ID } from '../src/game/inventory/capes';
import { ITEMS } from '../src/game/inventory/items';
import { NPCS } from '../src/game/npc/npcs';
import { recipeById } from '../src/game/production/recipes';
import { runAdminCommand } from '../src/game/admin';
import { Obj } from '../src/game/world/WorldMap';
import { npcKeyword } from '../src/game/npc/keywords';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const realRandom = Math.random;
/** Runs `fn` with Math.random fixed (only around our own rolls, never a whole game update). */
function withRandom<T>(v: number, fn: () => T): T {
  Math.random = () => v;
  try { return fn(); } finally { Math.random = realRandom; }
}
const setLevel = (s: Session, id: 'agility' | 'herblore' | 'thieving' | 'fletching', lvl: number) => { s.gathering[id] = gatherXpForLevel(lvl); };
const run = (g: Game, seconds: number) => { for (let t = 0; t < seconds; t += 0.05) g.update(0.05); };

// ---------------------------------------------------------------- save migration
console.log('save migration (v16 → v17)');
{
  const v15 = {
    version: 16, savedAt: 1, player: { name: 'Old', vocation: 'druid', x: 205, y: 312, z: 0, level: 44, exp: 900000, hp: 300, mana: 900, facing: 0, appearance: { body: 'male', scar: 'none' } },
    inventory: { slots: [{ id: 'mana_potion', qty: 7 }, { id: 'vanished_item_xyz', qty: 2 }], equipment: { weapon: { id: 'rod_of_frost', qty: 1 }, cape: null } },
    quests: {}, depot: [{ id: 'logs', qty: 40 }], bank: 1234, gathering: { woodcutting: 5000, fishing: 777, mining: 1, smithing: 2, fletching: 3, crafting: 4, cooking: 5, firemaking: 6 },
    pets: { active: null, xp: {}, pouch: [] },
  };
  const m = migrateSave(v15);
  check(typeof m !== 'string' && SAVE_VERSION >= 17, 'a v16 save migrates');
  if (typeof m !== 'string') {
    const g = m.data.gathering as Record<string, number>;
    check(['agility', 'herblore', 'thieving', 'slayer', 'farming', 'hunter', 'sailing'].every((k) => g[k] === 0), 'every new trade skill starts at 0 experience');
    check(g.woodcutting === 5000 && g.fishing === 777 && g.firemaking === 6, 'every old skill keeps its experience');
    const tr = m.data.trades as Record<string, unknown>;
    check(tr && tr.run === false && tr.points === 0 && tr.slayer === null, 'an empty trades block is added (walking, no slayer task, no points)');
    check(m.data.bank === 1234 && m.data.player.level === 44 && (m.data.depot ?? [])[0]?.id === 'logs', 'level, bank and depot are kept');
    check(m.lost.some((it) => it.id === 'vanished_item_xyz'), 'unknown items are kept aside as before, never deleted');
  }
  const v1 = migrateSave({ version: 1, savedAt: 1, player: { x: 3, y: 3, level: 2, exp: 100, hp: 1, mana: 1, facing: 0 }, inventory: { slots: [], equipment: {} }, quests: {} });
  check(typeof v1 !== 'string' && v1.data.version === SAVE_VERSION && (v1.data.gathering as Record<string, number>).agility === 0, 'the oldest save still walks every step to the newest');
}

const g = new Game();
const lay = g.world.trades!;
check(!!lay && lay.obstacles.length >= 40 && lay.stalls.length >= 20 && lay.boxes.length >= 15 && lay.herbs.length >= 100, `the world has trade spots (${lay.obstacles.length} shortcuts, ${lay.stalls.length} stalls, ${lay.boxes.length} strongboxes, ${lay.herbs.length} herbs)`);
for (const k of ['balance', 'climb', 'swim', 'squeeze'] as const) check(lay.obstacles.some((o) => o.kind === k), `there are ${k} shortcuts`);
check(lay.obstacles.every((o) => g.world.isWalkable(o.ax, o.ay, o.z) && g.world.isWalkable(o.bx, o.by, o.z)), 'both ends of every shortcut are walkable');
check(lay.obstacles.every((o) => obstaclePath(o).slice(1, -1).every((t) => !g.world.isWalkable(t.x, t.y, o.z))), 'every shortcut crosses ground you cannot walk (river, cliff, rock)');
check(lay.obstacles.some((o) => o.level <= 5) && lay.obstacles.some((o) => o.level >= 60), 'shortcuts range from beginners to veterans');
check(lay.stalls.every((s) => g.world.getObj(s.x, s.y, s.z) === Obj.TradeStall) && lay.boxes.every((b) => g.world.getObj(b.x, b.y, b.z) === Obj.StrongBox), 'stalls and strongboxes stand on the map');

// ---------------------------------------------------------------- registry, capes, shops
console.log('skills, capes and shops');
for (const id of ['agility', 'herblore', 'thieving'] as const) {
  const d = NONCOMBAT_SKILLS.find((x) => x.id === id);
  check(!!d && !!ITEMS[d.icon], `${id} is in the Skills panel with an icon`);
}
check(NONCOMBAT_SKILLS.find((d) => d.id === 'agility')?.kind === 'adventure' && NONCOMBAT_SKILLS.find((d) => d.id === 'herblore')?.kind === 'production', 'agility and thieving are adventure skills, herblore a production skill');
for (const [cape, skill, seller] of [['windstride_cape', 'agility', 'agility_master'], ['apothecary_cape', 'herblore', 'herb_master'], ['shadowpurse_cape', 'thieving', 'thief_master']] as const) {
  const c = CAPE_BY_ID[cape];
  check(c?.skill === skill && c.level === 99 && NPCS[seller]?.sells?.some((e) => e.id === cape), `${cape} asks for ${skill} 99 and is sold by its master`);
}
check(Object.values(NPCS).filter((n) => n.sells?.some((e) => e.id === 'mana_potion')).every((n) => n.sells!.some((e) => e.id === 'empty_vial')), 'every potion seller also sells empty vials');
check(Object.values(NPCS).filter((n) => n.thieve).length >= 15, 'there are townsfolk whose pockets can be picked');
check(npcKeyword('porada') === 'advice' && npcKeyword('conselho') === 'advice' && npcKeyword('ukradnij') === 'steal' && npcKeyword('roubar') === 'steal', 'NPC keywords work in Polish and Portuguese');

// ---------------------------------------------------------------- agility
console.log('agility');
{
  const s = g.addPlayer('Climber', { intent: new BufferedIntent() });
  const p = s.player;
  // monsters leave the climber alone (one standing at the far end would only make the test wait)
  p.ignoredByMonsters = true;
  const ob = lay.obstacles.find((o) => o.kind === 'balance' && o.z === 0) ?? lay.obstacles[0];
  setLevel(s, 'agility', Math.max(1, ob.level - 1));
  p.placeAt(ob.ax, ob.ay, ob.z);
  const h = obstacleHandles(ob)[0];
  g.skillSys.useTile(s, h.x, h.y, ob.z);
  check(!s.trades.cross, 'a shortcut above your level refuses you');
  setLevel(s, 'agility', ob.level);
  const xp0 = s.gathering.agility;
  withRandom(0.99, () => g.skillSys.useTile(s, h.x, h.y, ob.z));
  check(!!s.trades.cross, 'at the level it can be crossed');
  check(g.isUsable(h.x, h.y, ob.z), 'the shortcut tile shows as usable');
  check(currentActivity(g, p.id)?.kind === ob.kind, 'other players see the crossing (activity)');
  run(g, (ob.len + 3) * 2);
  check(p.x === ob.bx && p.y === ob.by && !s.trades.cross, `the crossing ends on the far side (${ob.kind}, ${ob.len} tiles)`);
  check(s.gathering.agility > xp0, 'crossing gives agility experience');
  // the other way, and a slip
  const hp0 = p.hp;
  withRandom(0.0, () => g.skillSys.useTile(s, h.x, h.y, ob.z));
  check(!!s.trades.cross && s.trades.cross.failAt >= 0, 'a bad roll means a slip on the way');
  for (let i = 0; i < 400 && s.trades.cross; i++) g.update(0.05);
  check(p.x === ob.bx && p.y === ob.by && p.hp < hp0, 'a slip sends you back where you started, hurt');
  // with a fishing rod in the pack, clicking the shortcut's water still crosses (it is not fished)
  s.inventory.add('fishing_rod', 1);
  const hb = obstacleHandles(ob)[1];
  g.commandUseTile(p.id, hb.x, hb.y);
  withRandom(0.99, () => g.update(0.05));
  check(!!s.trades.cross && !p.fish, 'clicking a shortcut over water crosses it even with a fishing rod');
  for (let i = 0; i < 400 && s.trades.cross; i++) g.update(0.05);
  // saves never put you on the water
  const start = { x: p.x, y: p.y };
  withRandom(0.99, () => g.skillSys.useTile(s, h.x, h.y, ob.z));
  g.update(0.05);
  g.update(0.05);
  const saved = g.serialize(p.id);
  check((p.x !== start.x || p.y !== start.y) && saved.player.x === start.x && saved.player.y === start.y, 'a save halfway across puts you at the start of the shortcut');
  run(g, (ob.len + 3) * 2);
}
{
  // running stamina
  const s = g.addPlayer('Runner', { intent: new BufferedIntent() });
  const p = s.player;
  g.skillSys.setRunning(s, true);
  check(s.trades.run, 'running can be switched on');
  const walk = p.stepTime;
  let moved = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!moved && g.tryStep(p, dx, dy)) moved = true;
  check(moved && p.moveDur < walk * 0.8 && s.trades.stamina < STAMINA_MAX, 'a running step is quicker and uses stamina');
  s.trades.stamina = 0.5;
  run(g, 0.6);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.tryStep(p, dx, dy)) break;
  check(Math.abs(p.moveDur - walk) < 0.2 || p.moveDur >= walk * 0.9, 'out of breath, you walk');
  const st0 = s.trades.stamina;
  run(g, 5);
  check(s.trades.stamina > st0, 'stamina comes back over time');
  const lo = g.addPlayer('Slowpoke', { intent: new BufferedIntent() });
  setLevel(s, 'agility', 90);
  s.trades.stamina = 10;
  lo.trades.stamina = 10;
  g.skillSys.updateSession(s, 5);
  g.skillSys.updateSession(lo, 5);
  check(s.trades.stamina > lo.trades.stamina, 'a higher agility level gives stamina back faster');
  s.inventory.add('vigour_potion', 1);
  s.trades.stamina = 10;
  p.groupCooldowns.potion = 0;
  g.useItem(p.id, 'vigour_potion');
  check(s.trades.stamina >= 59 && !s.inventory.has('vigour_potion'), 'a Draught of Vigour gives 50 stamina back');
  const save = g.serialize(p.id);
  const again = g.addPlayer('Runner2', { intent: new BufferedIntent() });
  g.applySave(again.id, save);
  check(again.trades.run === true, 'running on/off is saved');
}

// ---------------------------------------------------------------- thieving
console.log('thieving');
{
  const s = g.addPlayer('Cutpurse', { intent: new BufferedIntent() });
  const p = s.player;
  const mark = g.npcs.find((n) => NPCS[n.key]?.thieve === 'farmhand')!;
  check(!!mark, 'a farmhand stands in a town');
  setLevel(s, 'thieving', 1);
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: mark.x + dx, y: mark.y + dy })).find((t) => g.world.isWalkable(t.x, t.y, mark.z) && !g.isOccupied(t.x, t.y, mark.z))!;
  p.placeAt(spot.x, spot.y, mark.z);
  const gold0 = s.inventory.count('gold');
  g.skillSys.pickpocket(s, mark.id);
  check(s.trades.work?.kind === 'pickpocket' && currentActivity(g, p.id)?.kind === 'pickpocket', 'picking a pocket takes a moment (and shows)');
  s.trades.work!.timer = 0.001;
  withRandom(0.0, () => g.skillSys.updateSession(s, 0.01));
  check(s.inventory.count('gold') > gold0 && s.gathering.thieving > 0, 'a picked pocket gives gold and thieving experience');
  g.skillSys.pickpocket(s, mark.id);
  s.trades.work!.timer = 0.001;
  const hp0 = p.hp;
  withRandom(0.99, () => g.skillSys.updateSession(s, 0.01));
  check(p.buffs.rooted > 0 && p.hp < hp0, 'caught: you are stunned and hit');
  const other = g.addPlayer('Victim', { intent: new BufferedIntent() });
  check(typeof (g.skillSys as unknown as Record<string, unknown>).pickpocketPlayer === 'undefined' && !g.skillSys.dialogueOptions(s, 'aldric').some((o) => o.action === 'trades:pocket'), 'there is no way to rob players, and not every NPC can be robbed');
  void other;
  // stalls
  const st = lay.stalls.find((x) => STALLS[x.kind].level === 1)!;
  p.buffs.rooted = 0;
  const adj = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: st.x + dx, y: st.y + dy })).find((t) => g.world.isWalkable(t.x, t.y, st.z) && !g.isOccupied(t.x, t.y, st.z))!;
  p.placeAt(adj.x, adj.y, st.z);
  g.skillSys.useTile(s, st.x, st.y, st.z);
  check(s.trades.work?.kind === 'steal', 'stealing from a stall takes a moment');
  s.trades.work!.timer = 0.001;
  const items0 = s.inventory.slots.filter(Boolean).length;
  withRandom(0.0, () => g.skillSys.updateSession(s, 0.01));
  check(g.world.getObj(st.x, st.y, st.z) === Obj.TradeStallEmpty && s.inventory.slots.filter(Boolean).length >= items0, 'a robbed stall is bare for a while');
  run(g, STALLS[st.kind].restock[1] + 1);
  check(g.world.getObj(st.x, st.y, st.z) === Obj.TradeStall, 'and is stocked again later');
  // strongboxes
  const bx = lay.boxes.reduce((a, b) => (b.level < a.level ? b : a));
  setLevel(s, 'thieving', bx.level);
  const badj = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => ({ x: bx.x + dx, y: bx.y + dy })).find((t) => g.world.isWalkable(t.x, t.y, bx.z) && !g.isOccupied(t.x, t.y, bx.z))!;
  p.placeAt(badj.x, badj.y, bx.z);
  g.skillSys.useTile(s, bx.x, bx.y, bx.z);
  check(!s.trades.work, 'a strongbox needs a lockpick');
  s.inventory.add('lockpick', 3);
  g.skillSys.useTile(s, bx.x, bx.y, bx.z);
  check(s.trades.work?.kind === 'lockpick' && currentActivity(g, p.id)?.tool === 'lockpick', 'with a lockpick you work the lock');
  s.trades.work!.timer = 0.001;
  const g0 = s.inventory.count('gold');
  withRandom(0.0, () => g.skillSys.updateSession(s, 0.01));
  check(g.world.getObj(bx.x, bx.y, bx.z) === Obj.StrongBoxOpen && s.inventory.count('gold') > g0, 'an opened strongbox pays out and hangs open');
}

// ---------------------------------------------------------------- herblore
console.log('herblore');
{
  const s = g.addPlayer('Herbalist', { intent: new BufferedIntent() });
  const p = s.player;
  const hs = lay.herbs.find((h) => h.herb === 'marshwort')!;
  const h = HERB_BY_ID[hs.herb];
  p.placeAt(hs.x, hs.y, hs.z);
  g.skillSys.useTile(s, hs.x, hs.y, hs.z);
  check(s.trades.work?.kind === 'herbs', 'wild herbs can be picked');
  for (let i = 0; i < 40 && !s.inventory.has(`grimy_${h.id}`); i++) withRandom(0.0, () => { s.trades.work && (s.trades.work.timer = 0.001); g.skillSys.updateSession(s, 0.01); });
  check(s.inventory.has(`grimy_${h.id}`) && s.gathering.herblore > 0, 'picking gives a grimy herb and herblore experience');
  check(!!recipeById(`herb:clean:${h.id}`) && !!recipeById(`herb:brew:${h.potion}`), 'cleaning and brewing are recipes of the Herblore window');
  s.inventory.add('pestle', 1);
  s.inventory.add('empty_vial', 2);
  g.useItem(p.id, 'pestle');
  check(g.craftView(s.id)?.station === 'pestle', 'a pestle and mortar opens the Herblore window');
  g.commandCraft(p.id, `herb:clean:${h.id}`, 1);
  run(g, 3);
  check(s.inventory.has(h.id), 'cleaning turns a grimy herb into a clean one');
  const hp = s.inventory.count('health_potion');
  g.commandCraft(p.id, `herb:brew:${h.potion}`, 1);
  run(g, 3);
  check(s.inventory.count('health_potion') === hp + 1 && s.inventory.count('empty_vial') === 1, 'a clean herb and a vial brew the potion the shops sell');
  check(recipeById('herb:brew:great_mana_potion')?.inputs.length === 3, 'the stronger brews want a monster part too');
}

// ---------------------------------------------------------------- fletching
console.log('fletching (bolts and throwing weapons)');
for (const id of ['fletch:bolt', 'fletch:piercing_bolt', 'fletch:frost_bolt', 'fletch:infernal_bolt', 'fletch:spear', 'fletch:royal_javelin']) {
  const r = recipeById(id);
  check(!!r && r.skill === 'fletching' && ITEMS[r.output.id], `${id} makes ${r ? ITEMS[r.output.id]?.name : '?'}`);
}
{
  const s = g.addPlayer('Fletcher', { intent: new BufferedIntent() });
  setLevel(s, 'fletching', 10);
  s.inventory.add('knife', 1);
  s.inventory.add('arrow_shaft', 10);
  s.inventory.add('bronze_arrowheads', 10);
  g.useItem(s.player.id, 'knife');
  const b0 = s.inventory.count('bolt');
  g.commandCraft(s.player.id, 'fletch:bolt', 1);
  run(g, 3);
  check(s.inventory.count('bolt') === b0 + 10, 'shafts and arrowheads make ten bolts');
}

// ---------------------------------------------------------------- test commands, network view
console.log('test commands and the network');
{
  const s = g.addPlayer('Gamemaster', { intent: new BufferedIntent() });
  s.admin = true;
  runAdminCommand(g, s, '/maxskills');
  check(['agility', 'herblore', 'thieving'].every((k) => g.skillLevel(s, k as 'agility') === 99), '/maxskills raises the new skills to 99 too');
  runAdminCommand(g, s, '/skill thieving 40');
  check(g.skillLevel(s, 'thieving') === 40, '/skill works for the new skills');
  const mirror = new Game({ simulate: false });
  const me = mirror.addPlayer('Gamemaster', { id: s.player.id, starter: false });
  mirror.localId = me.player.id;
  s.trades.stamina = 42;
  s.trades.run = true;
  const snap = buildSnapshot(g, s);
  if (snap.t === 'snap') applySnapshot(mirror, snap);
  check(me.trades.stamina === 42 && me.trades.run, 'the own client learns stamina and running (snapshot tw)');
  check(mirror.isUsable(lay.stalls[0].x, lay.stalls[0].y, lay.stalls[0].z), 'stalls are usable on the client too');
}

console.log(failures === 0 ? '\nAll trade-skill checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
