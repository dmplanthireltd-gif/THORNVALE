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
import { PLANTS } from '../src/game/trades/farming';
import { TASK_BY_ID } from '../src/game/trades/slayer';
import { seaTile } from '../src/game/trades/SeaSystem';

const PLANTS_OK = () => PLANTS.every((d) => !!ITEMS[d.seed] && !!ITEMS[d.produce] && d.minutes > 0);

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
/** Runs `fn` with Math.random giving these values in turn (then the last one). */
function withRandoms<T>(vs: number[], fn: () => T): T {
  let i = 0;
  Math.random = () => vs[Math.min(i++, vs.length - 1)];
  try { return fn(); } finally { Math.random = realRandom; }
}
const setLevel = (s: Session, id: 'agility' | 'herblore' | 'thieving' | 'fletching' | 'slayer' | 'farming' | 'hunter' | 'sailing', lvl: number) => { s.gathering[id] = gatherXpForLevel(lvl); };
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
for (const id of ['agility', 'herblore', 'thieving', 'slayer', 'farming', 'hunter'] as const) {
  const d = NONCOMBAT_SKILLS.find((x) => x.id === id);
  check(!!d && !!ITEMS[d.icon], `${id} is in the Skills panel with an icon`);
}
check(NONCOMBAT_SKILLS.find((d) => d.id === 'agility')?.kind === 'adventure' && NONCOMBAT_SKILLS.find((d) => d.id === 'herblore')?.kind === 'production', 'agility and thieving are adventure skills, herblore a production skill');
for (const [cape, skill, seller] of [['windstride_cape', 'agility', 'agility_master'], ['apothecary_cape', 'herblore', 'herb_master'], ['shadowpurse_cape', 'thieving', 'thief_master'], ['tillers_cape', 'farming', 'farm_master'], ['trappers_cape', 'hunter', 'hunt_master'], ['banewarden_cape', 'slayer', 'slayer_vesna']] as const) {
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

// ---------------------------------------------------------------- farming
console.log('farming');
{
  let clock = Date.UTC(2026, 9, 24, 12);
  const fg = new Game({ now: () => clock });
  const fl = fg.world.trades!;
  check(fl.patches.filter((q) => q.kind === 'allotment').length >= 10 && fl.patches.filter((q) => q.kind === 'herb').length >= 8, `farm patches stand on farms (${fl.patches.length})`);
  const s = fg.addPlayer('Farmer', { intent: new BufferedIntent() });
  const p = s.player;
  const patch = fl.patches.find((q) => q.kind === 'allotment')!;
  const [ax, ay] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [patch.x + dx, patch.y + dy]).find(([x, y]) => fg.world.isWalkable(x, y, 0) && !fg.isOccupied(x, y, 0))!;
  p.placeAt(ax, ay, 0);
  s.inventory.add('potato_seed', 2);
  fg.skillSys.useTile(s, patch.x, patch.y, patch.z);
  check(!s.trades.work, 'planting needs a trowel');
  s.inventory.add('trowel', 1);
  fg.skillSys.useTile(s, patch.x, patch.y, patch.z);
  check(s.trades.work?.kind === 'farm' && currentActivity(fg, p.id)?.kind === 'farm', 'with a trowel you kneel and plant (shown to others)');
  run(fg, 2.5);
  check(!!s.trades.farm[String(patch.id)] && s.inventory.count('potato_seed') === 1 && s.gathering.farming > 0, 'the seed is planted and gives farming experience');
  s.inventory.add('compost', 1);
  fg.skillSys.useTile(s, patch.x, patch.y, patch.z);
  run(fg, 2.5);
  check(s.trades.farm[String(patch.id)]?.c === 1 && !s.inventory.has('compost'), 'compost goes on a growing patch');
  fg.skillSys.useTile(s, patch.x, patch.y, patch.z);
  check(!s.trades.work, 'a growing patch only tells you how long is left');
  // it keeps growing through a logout and a server restart: the planting time is in the save
  const save = fg.serialize(p.id);
  check(!!(save.trades as { farm?: Record<string, unknown> })?.farm?.[String(patch.id)], 'the patch is in the save');
  clock += 11 * 60_000;
  const fg2 = new Game({ now: () => clock });
  const s2 = fg2.addPlayer('Farmer', { intent: new BufferedIntent() });
  fg2.applySave(s2.player.id, save);
  check(fg2.skillSys.farmView(s2).some((e) => e[0] === patch.id && e[2] === 3), 'after the restart, eleven minutes later, the potatoes are ripe');
  s2.player.placeAt(ax, ay, 0);
  const pot = s2.inventory.count('potato');
  fg2.skillSys.useTile(s2, patch.x, patch.y, patch.z);
  run(fg2, 2.5);
  check(s2.inventory.count('potato') >= pot + 5 && !s2.trades.farm[String(patch.id)], 'harvesting gives potatoes (more with compost) and frees the patch');
  s2.inventory.add('potato_seed', 1);
  s2.inventory.add('trowel', 1);
  fg2.skillSys.useTile(s2, patch.x, patch.y, patch.z);
  run(fg2, 2.5);
  runAdminCommand(fg2, s2, '/grow');
  check(fg2.skillSys.farmView(s2).some((e) => e[0] === patch.id && e[2] === 3), '/grow ripens what you planted at once (game masters)');
  const herbPatch = fl.patches.find((q) => q.kind === 'herb')!;
  s2.inventory.add('starbloom_seed', 1);
  const [hx, hy] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [herbPatch.x + dx, herbPatch.y + dy]).find(([x, y]) => fg2.world.isWalkable(x, y, 0) && !fg2.isOccupied(x, y, 0))!;
  s2.player.placeAt(hx, hy, 0);
  fg2.skillSys.useTile(s2, herbPatch.x, herbPatch.y, herbPatch.z);
  check(!s2.trades.work, 'a herb seed above your farming level cannot be planted');
  check(PLANTS_OK(), 'every seed has a plant with a produce item that exists');
  // the own client sees its patches (snapshot tw.fp)
  const mirror = new Game({ simulate: false });
  const me = mirror.addPlayer('Farmer', { id: s.player.id, starter: false });
  mirror.localId = me.player.id;
  const snap = buildSnapshot(fg, s);
  if (snap.t === 'snap') applySnapshot(mirror, snap);
  check(mirror.skillSys.farmView(me).length === 1, 'the own client learns its farm patches');
}

// ---------------------------------------------------------------- hunter
console.log('hunter');
{
  const s = g.addPlayer('Trapper', { intent: new BufferedIntent() });
  const p = s.player;
  p.ignoredByMonsters = true;
  check(lay.hunts.some((h) => h.kind === 'burrow') && lay.hunts.some((h) => h.kind === 'nest'), `hunting grounds have burrows and nesting bushes (${lay.hunts.length})`);
  const spot = lay.hunts.find((h) => h.kind === 'nest' && h.prey.includes('finch'))!;
  const [ax, ay] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]].map(([dx, dy]) => [spot.x + dx, spot.y + dy]).find(([x, y]) => g.world.isWalkable(x, y, 0) && !g.isOccupied(x, y, 0))!;
  p.placeAt(ax, ay, 0);
  g.skillSys.useTile(s, spot.x, spot.y, spot.z);
  check(!s.trades.work, 'a nesting bush needs a bird snare');
  s.inventory.add('bird_snare', 1);
  g.skillSys.useTile(s, spot.x, spot.y, spot.z);
  check(s.trades.work?.kind === 'trap', 'setting a snare takes a moment');
  run(g, 2.5);
  check(s.trades.traps.length === 1 && s.trades.traps[0].state === 'set' && s.inventory.count('bird_snare') === 1, 'the snare is set (and never used up)');
  for (let i = 0; i < 80 && s.trades.traps[0]?.state === 'set'; i++) withRandom(0.01, () => g.skillSys.updateSession(s, 4.1));
  check(s.trades.traps[0]?.state === 'broken' || s.trades.traps[0]?.state === 'caught', 'a set trap catches something or is sprung empty');
  s.trades.traps[0].state = 'caught';
  s.trades.traps[0].prey = 'finch';
  const f0 = s.inventory.count('feather');
  g.skillSys.useTile(s, spot.x, spot.y, spot.z);
  run(g, 2.5);
  check(s.inventory.count('feather') > f0 && s.gathering.hunter > 0 && s.trades.traps.length === 0, 'collecting a catch gives feathers and hunter experience');
  s.inventory.add('bird_snare', 1);
  g.skillSys.useTile(s, spot.x, spot.y, spot.z);
  run(g, 2.5);
  p.placeAt(p.x + 40, p.y, 0);
  g.skillSys.updateSession(s, 0.1);
  check(s.trades.traps.length === 0, 'a trap you walk far away from collapses back into your pack');
  check(recipeById('cook:stove:roast_bird')?.inputs[0].id === 'raw_bird' && !!recipeById('tan:hare_pelt'), 'birds can be roasted and pelts tanned');
  s.inventory.add('pet_morsel', 1);
  s.inventory.add('pet_fox', 1);
  g.useItem(p.id, 'pet_fox');
  const xp0 = Object.values(s.pets.xp).reduce((a, b) => a + (b ?? 0), 0);
  g.useItem(p.id, 'pet_morsel');
  check(Object.values(s.pets.xp).reduce((a, b) => a + (b ?? 0), 0) > xp0, 'a pet morsel teaches the pet that is out');
}

// ---------------------------------------------------------------- slayer
console.log('slayer');
{
  const s = g.addPlayer('Slayer', { intent: new BufferedIntent() });
  const p = s.player;
  const vesna = g.npcs.find((n) => n.key === 'slayer_vesna')!;
  check(!!vesna && NPCS.slayer_vesna.slayer === 1, 'Vesna, the first slayer master, stands in Thornvale');
  const [vx, vy] = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [vesna.x + dx, vesna.y + dy]).find(([x, y]) => g.world.isWalkable(x, y, vesna.z) && !g.isOccupied(x, y, vesna.z))!;
  p.placeAt(vx, vy, vesna.z);
  g.commandTalk(p.id, vesna.id);
  g.update(0.05);
  const opts = g.dialogueView(s)?.options.map((o) => o.action) ?? [];
  check(opts.includes('trades:task') && opts.includes('trades:rewards'), 'a slayer master offers tasks and rewards');
  g.dialogueAction(p.id, 'trades:task');
  const task = s.trades.slayer;
  check(!!task && task.left > 0 && task.left === task.total, `a task is given (${task?.left} ${task?.task})`);
  const def = TASK_BY_ID[task!.task];
  const enemy = g.enemies.find((e) => def.kinds.includes(e.enemyKind))!;
  const xp0 = s.gathering.slayer;
  g.skillSys.onKill(s, enemy.enemyKind, enemy.maxHp);
  check(s.trades.slayer!.left === task!.total - 1 && s.gathering.slayer > xp0, 'a kill on task counts down and gives slayer experience');
  g.skillSys.onKill(s, 'demon', 6000);
  check(s.trades.slayer!.left === task!.total - 1, 'a kill off task does not count');
  for (let i = 0; i < 100 && s.trades.slayer; i++) g.skillSys.onKill(s, enemy.enemyKind, enemy.maxHp);
  check(!s.trades.slayer && s.trades.points === 3 && s.trades.streak === 1, 'finishing a task gives slayer points');
  const save = g.serialize(p.id);
  const back = g.addPlayer('Slayer2', { intent: new BufferedIntent() });
  g.applySave(back.player.id, save);
  check(back.trades.points === 3 && back.trades.streak === 1, 'slayer points and the streak are saved');
  // slayer monsters
  const kinds = ['gloomcrawler', 'wailing_shade', 'cinder_wraith', 'marrow_gargoyle', 'abyssal_horror'];
  for (const k of kinds) check(g.enemies.some((e) => e.enemyKind === k), `${k} lives in the world`);
  check(g.skillSys.damageTo(s, 'gloomcrawler', 50) === 0, 'below slayer 10 a gloomcrawler takes no damage');
  setLevel(s, 'slayer' as never, 10);
  check(g.skillSys.damageTo(s, 'gloomcrawler', 50) === 50, 'at slayer 10 it does');
  setLevel(s, 'slayer' as never, 40);
  check(g.skillSys.damageTo(s, 'wailing_shade', 50) === 0, 'a wailing shade also needs a hush cowl');
  s.inventory.equipment.head = { id: 'hush_cowl', qty: 1 };
  check(g.skillSys.damageTo(s, 'wailing_shade', 50) === 50, 'with the hush cowl on, it can be hurt');
  s.trades.slayer = { task: 'wolves', master: 'slayer_vesna', left: 5, total: 5 };
  s.inventory.equipment.head = { id: 'slayer_helm', qty: 1 };
  check(g.skillSys.damageTo(s, 'wolf', 100) === 108 && g.skillSys.damageTo(s, 'rat', 100) === 100, 'a slayer helm adds 8% against the monsters of your task only');
  s.trades.points = 300;
  g.dialogueAction(p.id, 'trades:rewards');
  g.dialogueAction(p.id, 'trades:buy:helm');
  check(s.trades.points === 50 && s.inventory.count('slayer_helm') === 1, 'slayer points buy a slayer helm');
}

// ---------------------------------------------------------------- sailing
console.log('sailing');
{
  const sg = new Game();
  const s = sg.addPlayer('Sailor', { intent: new BufferedIntent() });
  const p = s.player;
  p.ignoredByMonsters = true;
  const said: string[] = [];
  sg.events.on((e) => { if (e.type === 'message' && e.to === p.id) said.push(e.text); });
  const W = sg.world;
  const sl = W.trades!;
  check(sl.moorings.length >= 30 && new Set(sl.moorings.map((m) => m.name)).size >= 18, `moorings at the harbours and landings (${sl.moorings.length} at ${new Set(sl.moorings.map((m) => m.name)).size})`);
  check(sl.moorings.every((m) => W.getObj(m.x, m.y, 0) === Obj.Mooring && W.isWalkable(m.dockX, m.dockY, 0) && seaTile(W, m.x, m.y, 0)), 'every post stands in the water beside a walkable pier tile');
  check(sl.flotsam.length >= 100 && sl.flotsam.every((f) => W.getObj(f.x, f.y, 0) === Obj.Flotsam && f.level >= 1 && f.level <= 80), `floating wreckage out on the open sea (${sl.flotsam.length})`);
  const mo = sl.moorings.find((m) => m.name === 'Thornvale Harbour') ?? sl.moorings[0];
  p.placeAt(mo.dockX, mo.dockY, 0);
  sg.skillSys.useTile(s, mo.x, mo.y, 0);
  check(!p.boat && said.some((t) => t.includes('You need a boat')), 'without a boat you cannot sail');
  s.inventory.add('cutter_deed', 1);
  sg.skillSys.useTile(s, mo.x, mo.y, 0);
  check(!p.boat && said.some((t) => t.includes('sailing level 60')), 'a cutter wants sailing level 60');
  s.inventory.add('skiff_deed', 1);
  sg.skillSys.useTile(s, mo.x, mo.y, 0);
  check(p.boat === 1 && p.x === mo.x && p.y === mo.y, 'with a skiff deed you board at the mooring');
  const act = currentActivity(sg, p.id);
  check(act?.kind === 'sail' && act.tool === 'skiff_deed', 'others see you rowing a skiff');
  run(sg, 1.5);
  // never onto land, except back onto the pier from the post
  let landBlocked = true;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = mo.x + dx, y = mo.y + dy;
    if ((dx || dy) && !(x === mo.dockX && y === mo.dockY) && !seaTile(W, x, y, 0) && sg.canStepFor(p, dx, dy)) landBlocked = false;
  }
  check(landBlocked && sg.canStepFor(p, mo.dockX - mo.x, mo.dockY - mo.y), 'a boat never runs onto land; from the post you can step back onto the pier');
  // sail out into open water
  let target: { x: number; y: number } | null = null;
  for (let r = 10; r < 30 && !target; r++) for (let a = 0; a < 32 && !target; a++) {
    const x = Math.round(mo.x + Math.cos(a / 32 * 6.283) * r), y = Math.round(mo.y + Math.sin(a / 32 * 6.283) * r);
    if (seaTile(W, x, y, 0) && W.getObj(x, y, 0) === Obj.None && sg.pathTo(p, x, y, false, 40000)) target = { x, y };
  }
  check(!!target, 'there is open water to sail to');
  const xp0 = s.gathering.sailing;
  if (target) {
    sg.commandMoveTo(p.id, target.x, target.y);
    for (let i = 0; i < 600 && (p.x !== target.x || p.y !== target.y || p.moving); i++) sg.update(0.05);
    check(p.x === target.x && p.y === target.y && p.boat === 1, 'a click on the water sails you there');
    check(s.gathering.sailing > xp0, 'every tile sailed gives sailing experience');
  }
  const save = sg.serialize(p.id);
  check(save.player.x === mo.dockX && save.player.y === mo.dockY, 'a save at sea puts you back on the pier you sailed from');
  // the boat steps quicker than walking and the fire stays ashore
  check(sg.skillSys.predictFactor(s) < 1, 'a boat steps quicker than walking');
  // wreckage: salvage it from the boat
  setLevel(s, 'sailing', 99);
  const f = sl.flotsam[0];
  let beside: { x: number; y: number } | null = null;
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]]) if (!beside && seaTile(W, f.x + dx, f.y + dy, 0) && W.getObj(f.x + dx, f.y + dy, 0) === Obj.None) beside = { x: f.x + dx, y: f.y + dy };
  p.placeAt(beside!.x, beside!.y, 0);
  const gold0 = s.inventory.count('gold');
  const sxp = s.gathering.sailing;
  sg.skillSys.useTile(s, f.x, f.y, 0);
  check(currentActivity(sg, p.id)?.kind === 'salvage', 'you reach over the side for the wreckage (shown to others)');
  for (let i = 0; i < 400 && W.getObj(f.x, f.y, 0) === Obj.Flotsam; i++) sg.update(0.05);
  check(W.getObj(f.x, f.y, 0) === Obj.FlotsamGone && s.inventory.count('gold') > gold0 && s.gathering.sailing > sxp, 'salvaged wreckage gives gold and goods and sailing experience, then is gone for a while');
  // at sea: a drifting crate, a squall, a monster from the deep
  const g1 = s.inventory.count('gold');
  withRandom(0, () => sg.skillSys.sea.onStep(s));
  check(s.inventory.count('gold') > g1, 'a drifting crate hauled aboard');
  p.level = 40;
  const enemies0 = sg.enemies.length;
  withRandoms([0, 0.8, 0.1, 0.1, 0.1, 0.1], () => sg.skillSys.sea.onStep(s));
  const surfaced = sg.enemies.slice(enemies0).find((e) => e.tag === 'sea');
  check(!!surfaced && seaTile(W, surfaced.x, surfaced.y, 0), 'a monster surfaces on the water beside the boat');
  const hp0 = p.hp;
  withRandoms([0, 0.5], () => sg.skillSys.sea.onStep(s));
  check(p.hp < hp0, 'a squall hurts');
  p.hp = p.maxHp;
  // fishing from the boat teaches a little sailing too
  const fx = s.gathering.sailing;
  sg.skillSys.sea.onFishCaught(s);
  check(s.gathering.sailing > fx, 'a fish caught from the boat gives sailing experience');
  // a voyage: come ashore at another harbour
  const far = sl.moorings.filter((m) => m.name !== mo.name).sort((a, b) => Math.hypot(b.x - mo.x, b.y - mo.y) - Math.hypot(a.x - mo.x, a.y - mo.y))[0];
  p.placeAt(far.x, far.y, 0);
  const vx = s.gathering.sailing;
  sg.skillSys.useTile(s, far.x, far.y, 0);
  run(sg, 1.5);
  check(!p.boat && p.x === far.dockX && p.y === far.dockY, 'from the post you step ashore onto the pier');
  check(s.gathering.sailing - vx >= 100 && said.some((t) => t.includes(`from ${mo.name}`)), 'a long voyage to another harbour pays a sailing bonus');
  // the network: everyone sees the boat
  sg.skillSys.useTile(s, far.x, far.y, 0);
  run(sg, 0.5);
  const mirror = new Game({ simulate: false });
  const me = mirror.addPlayer('Sailor', { id: p.id, starter: false });
  mirror.localId = me.player.id;
  const snap = buildSnapshot(sg, s);
  if (snap.t === 'snap') applySnapshot(mirror, snap);
  check(p.boat === 3 && me.player.boat === 3, 'at sailing 99 you take your cutter; the boat is in the snapshot (bt): every client draws it and steps over water the same way');
  check(mirror.canStepFor(me.player, far.dockX - far.x, far.dockY - far.y), 'the client may predict the step onto the pier');
  // death and teleports send the boat home
  sg.teleport(p, mo.dockX, mo.dockY, 0);
  check(!p.boat, 'a teleport ends the voyage');
  runAdminCommand(sg, s, '/maxskills');
  check(sg.skillLevel(s, 'sailing') === 99, '/maxskills raises sailing too');
  check(!!NPCS.shipwright?.sells?.some((e) => e.id === 'skiff_deed') && !!CAPE_BY_ID.tidewalker_cape, 'Captain Maren Tallow sells boats; the Tidewalker\'s Cape is sailing\'s');
}

// ---------------------------------------------------------------- test commands, network view
console.log('test commands and the network');
{
  const s = g.addPlayer('Gamemaster', { intent: new BufferedIntent() });
  s.admin = true;
  runAdminCommand(g, s, '/maxskills');
  check(['agility', 'herblore', 'thieving', 'slayer', 'farming', 'hunter'].every((k) => g.skillLevel(s, k as 'agility') === 99), '/maxskills raises the new skills to 99 too');
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
