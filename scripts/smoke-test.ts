/**
 * Headless logic test: runs the simulation without any rendering to verify the
 * world, floors, movement, combat, magic, equipment, NPC services, depots,
 * trading, saving and the multiplayer protocol.
 *   npm run test:logic
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import type { GameEvent } from '../src/game/core/events';
import { Enemy } from '../src/game/enemies/Enemy';
import { findPath } from '../src/game/movement/pathfinding';
import { applySnapshot, buildSnapshot, executeCommand } from '../src/game/net/protocol';
import { SaveSystem, type KeyValueStore } from '../src/game/save/SaveSystem';
import { ITEM_RENAMES, migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import { floodFill3D } from '../src/game/world/worldGen';
import { Obj, WorldMap } from '../src/game/world/WorldMap';
import { ITEMS } from '../src/game/inventory/items';
import { chebyshev } from '../src/game/core/types';
import { PVP_MIN_LEVEL } from '../src/game/Game';
import { NPCS } from '../src/game/npc/npcs';
import type { Vocation } from '../src/game/player/vocations';
import { expForLevel } from '../src/game/player/Player';
import { legacySkills, powerLevel, triesForNext, typicalSkill } from '../src/game/player/skills';
import { rollMelee } from '../src/game/combat/combat';
import { gatherLevelForXp, gatherXpForLevel, TREES } from '../src/game/gathering/woodcutting';
import { biteChance, FISH, FISH_ITEMS, FISH_RANGE, fishFor, isColdWater, isFishingWater } from '../src/game/gathering/fishing';
import { MARKET_OFFER_MS, type MarketChange } from '../src/game/market/market';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

function run(game: Game, seconds: number, until?: () => boolean, step = 1 / 30): number {
  let t = 0;
  while (t < seconds) {
    game.update(step);
    t += step;
    if (until && until()) break;
  }
  return t;
}

const shared = new Game();
function solo(voc: Vocation = 'knight', g = new Game()): { g: Game; s: Session; pid: number; intent: BufferedIntent } {
  const intent = new BufferedIntent();
  const s = g.addPlayer('Tester', { intent, vocation: voc });
  g.localId = s.id;
  return { g, s, pid: s.id, intent };
}

/** Puts a test enemy (taken from the roster) right next to the player. */
function enemyNear(g: Game, kind: Enemy['enemyKind'], p: { x: number; y: number; z: number }, dx: number, dy = 0): Enemy {
  const e = g.enemies.find((x) => x.enemyKind === kind)!;
  e.placeAt(p.x + dx, p.y + dy, p.z);
  // move its home here too, so it doesn't run back to its spawn
  Object.assign(e, { spawnX: p.x + dx, spawnY: p.y + dy, spawnZ: p.z });
  e.dead = false;
  e.hp = e.maxHp;
  return e;
}

/** Finds an open 9×3 strip on the surface for range tests. */
function openStrip(g: Game): { x: number; y: number; z: number } {
  const w = g.world;
  for (let y = 60; y < 140; y++) for (let x = 60; x < 120; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 9; dx++) if (!w.isWalkable(x + dx, y + dy, 0) || w.getObj(x + dx, y + dy, 0) !== Obj.None || w.isSafe(x + dx, y + dy, 0)) { ok = false; break; }
    if (ok) return { x, y, z: 0 };
  }
  throw new Error('no strip');
}

console.log('World');
{
  const g = shared;
  const reach = floodFill3D(g.world);
  const bad = g.world.spawns.filter((s) => !reach.has(WorldMap.key(s.x, s.y, s.z)));
  check(bad.length === 0, `all ${g.world.spawns.length} monster spawns reachable${bad.length ? ` (missing: ${bad.slice(0, 5).map((b) => `${b.kind}@${b.x},${b.y},${b.z}`).join(' ')})` : ''}`);
  const npcBad = g.world.npcs.filter((n) => ![[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => reach.has(WorldMap.key(n.x + dx, n.y + dy, n.z))));
  check(npcBad.length === 0, `all ${g.world.npcs.length} NPCs reachable${npcBad.length ? ` (missing ${npcBad.map((n) => n.key).join(',')})` : ''}`);
  const chestBad = g.world.chests.filter((c) => ![[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => reach.has(WorldMap.key(c.x + dx, c.y + dy, c.z))));
  check(chestBad.length === 0, `all ${g.world.chests.length} treasure chests reachable${chestBad.length ? ` (missing ${chestBad.map((c) => c.id).join(',')})` : ''}`);
  const floors = [...g.world.floors.keys()].sort((a, b) => a - b);
  check(floors.length >= 6, `floors ${floors.join(', ')}`);
  const kinds = new Set(g.world.spawns.map((s) => s.kind));
  check(['orc_warlord', 'elf_warden', 'hydra', 'demon', 'dragon_lord', 'behemoth'].every((k) => kinds.has(k as never)), `${kinds.size} monster kinds placed`);
  const deep = g.world.spawns.filter((s) => s.kind === 'demon');
  check(deep.length > 0 && deep.every((d) => d.z === -4), 'demons live four floors down');
  const hydras = g.world.spawns.filter((s) => s.kind === 'hydra');
  check(new Set(hydras.map((h) => h.z)).size >= 3, `hydras on ${new Set(hydras.map((h) => h.z)).size} floors`);
  const names = new Set(g.world.regions.map((r) => r.name));
  check(['Grimtusk Fortress', 'Silverbough Fortress', 'Palmreach', 'Mire Caves', 'The Demon Pit', 'Greyspine Mountains', 'Cinder Isle', 'Frostfang Glacier', 'Pyramid of Kesh'].every((n) => names.has(n)), `${names.size} named areas`);
  const counts = { ladder: 0, rope: 0, stairs: 0, dig: 0 };
  for (const [k, l] of g.world.links) {
    const [x, y, z] = k.split(',').map(Number);
    const o = g.world.getObj(x, y, z);
    if (o === Obj.Ladder) counts.ladder++;
    else if (o === Obj.RopeSpot) counts.rope++;
    else if (o === Obj.StairsUp || o === Obj.StairsDown) counts.stairs++;
    else if (o === Obj.LooseStone) counts.dig++;
    void l;
  }
  check(counts.ladder >= 5 && counts.rope >= 3 && counts.stairs >= 10 && counts.dig >= 1, `floor links: ${JSON.stringify(counts)}`);
}

console.log('Corner rule & pathfinding');
{
  const m = new WorldMap(5, 5);
  m.setObj(2, 1, Obj.Wall);
  check(!m.canStep(1, 2, 0, 1, -1), 'diagonal past a blocked corner is refused');
  check(m.canStep(1, 2, 0, 1, 1), 'free diagonal allowed');
  const path = findPath(m.grid(0), { sx: 1, sy: 1, tx: 3, ty: 1 });
  check(!!path && path.every((p, i, arr) => {
    const prev = i === 0 ? { x: 1, y: 1 } : arr[i - 1];
    return m.canStep(prev.x, prev.y, 0, p.x - prev.x, p.y - prev.y);
  }), 'A* path obeys corner rule');
  m.setObj(2, 2, Obj.Wall); m.setObj(2, 3, Obj.Wall); m.setObj(2, 0, Obj.Wall); m.setObj(2, 4, Obj.Wall);
  check(!m.lineOfSight(0, 2, 4, 2, 0), 'walls block line of sight');
}

console.log('Movement & floors');
{
  const { g, s, pid, intent } = solo();
  const p = s.player;
  const sx = p.x;
  intent.dir = { dx: -1, dy: 0 };
  run(g, 1.0);
  intent.dir = { dx: 0, dy: 0 };
  run(g, 0.5);
  check(p.x < sx - 2, `held key walks several tiles (moved ${sx - p.x})`);
  // stairs: walk onto a StairsUp in the depot
  let stairs: [number, number] | null = null;
  for (const [k] of g.world.links) {
    const [x, y, z] = k.split(',').map(Number);
    if (z === 0 && g.world.getObj(x, y, 0) === Obj.StairsUp && g.world.regionAt(x, y, 0)?.safe) { stairs = [x, y]; break; }
  }
  check(!!stairs, 'found stairs in town');
  if (stairs) {
    g.teleport(p, stairs[0] - 1, stairs[1], 0);
    g.commandMoveTo(pid, stairs[0], stairs[1]);
    run(g, 3, () => p.z === 1);
    check(p.z === 1, 'walking onto stairs climbs a floor');
    const back = g.world.linkAt(p.x, p.y, 1);
    void back;
  }
  // ladder: use one from below
  let ladder: [number, number, number] | null = null;
  for (const [k, l] of g.world.links) {
    const [x, y, z] = k.split(',').map(Number);
    if (l.kind === 'use' && g.world.getObj(x, y, z) === Obj.Ladder) { ladder = [x, y, z]; break; }
  }
  if (ladder) {
    g.teleport(p, ladder[0], ladder[1] + 1, ladder[2]);
    g.commandUseTile(pid, ladder[0], ladder[1]);
    run(g, 3, () => p.z === ladder![2] + 1);
    check(p.z === ladder[2] + 1, 'using a ladder climbs up');
  }
  // rope spot needs a rope
  let rope: [number, number, number] | null = null;
  for (const [k, l] of g.world.links) {
    const [x, y, z] = k.split(',').map(Number);
    if (l.kind === 'rope') { rope = [x, y, z]; break; }
  }
  if (rope) {
    const msgs: string[] = [];
    g.events.on((e) => { if (e.type === 'message') msgs.push(e.text); });
    g.teleport(p, rope[0], rope[1], rope[2]);
    g.commandUseTile(pid, rope[0], rope[1]);
    run(g, 1);
    check(p.z === rope[2] && msgs.some((m) => m.includes('need a rope')), 'rope spot refuses without a rope');
    s.inventory.add('rope', 1);
    g.commandUseTile(pid, rope[0], rope[1]);
    run(g, 2, () => p.z === rope![2] + 1);
    check(p.z === rope[2] + 1, 'rope spot climbs with a rope');
  }
  // dig spot: shovel opens a hole, stepping in falls down
  let dig: [number, number, number] | null = null;
  for (const [k] of g.world.links) {
    const [x, y, z] = k.split(',').map(Number);
    if (g.world.getObj(x, y, z) === Obj.LooseStone) { dig = [x, y, z]; break; }
  }
  if (dig) {
    const [x, y, z] = dig;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => g.world.isWalkable(x + dx, y + dy, z))!;
    g.teleport(p, x + near[0], y + near[1], z);
    s.inventory.add('shovel', 1);
    g.commandUseTile(pid, x, y);
    run(g, 2, () => g.world.getObj(x, y, z) === Obj.Hole);
    check(g.world.getObj(x, y, z) === Obj.Hole, 'shovel digs loose stones open');
    g.commandMoveTo(pid, x, y);
    run(g, 3, () => p.z === z - 1);
    check(p.z === z - 1, 'stepping into the hole drops a floor');
  }
}

console.log('Equipment & capacity');
{
  const { g, s, pid } = solo('knight');
  const inv = s.inventory;
  const p = s.player;
  const hp0 = p.maxHp;
  inv.add('kings_edge', 1);
  g.useItem(pid, 'kings_edge');
  check(inv.equipped('weapon') === 'short_sword', 'level requirement blocks equipping');
  p.level = 90; g.refreshStats(s);
  g.useItem(pid, 'kings_edge');
  check(inv.equipped('weapon') === 'kings_edge' && p.maxHp > hp0, 'equipped legendary sword adds its hp bonus');
  inv.add('wand_of_sparks', 1);
  g.useItem(pid, 'wand_of_sparks');
  check(inv.equipped('weapon') === 'kings_edge', 'vocation restriction blocks wands for knights');
  inv.add('double_axe', 1);
  g.useItem(pid, 'double_axe');
  check(inv.equipped('weapon') === 'double_axe' && inv.equipped('shield') === null, 'two-handed weapon frees the shield hand');
  const a0 = g.armor(s);
  inv.add('plate_armor', 1); inv.add('plate_legs', 1); inv.add('iron_helmet', 1); inv.add('amulet_of_warding', 1); inv.add('ring_of_swiftness', 1);
  for (const id of ['plate_armor', 'plate_legs', 'iron_helmet', 'amulet_of_warding', 'ring_of_swiftness']) g.useItem(pid, id);
  check(g.armor(s) > a0 + 8, `armour from helmet/armour/legs (${a0} → ${g.armor(s)})`);
  check(g.resist(s, 'physical') === 6, 'amulet gives physical resistance');
  const step0 = p.stepTime;
  check(p.stepTime < 0.27, `ring of swiftness speeds you up (step ${step0.toFixed(3)}s)`);
  const size0 = inv.size();
  inv.add('explorer_pack', 1);
  g.useItem(pid, 'explorer_pack');
  check(inv.size() === 8 + 28 && inv.size() > size0, `backpack slot sets carrying slots (${size0} → ${inv.size()})`);
  check(p.capacity > 400 && inv.weight() > 0, `capacity ${p.capacity} oz, carrying ${inv.weight()} oz`);
}

console.log('Distance combat');
{
  const { g, s, pid } = solo('paladin');
  const p = s.player;
  p.level = 20; g.refreshStats(s);
  const spot = openStrip(g);
  g.teleport(p, spot.x, spot.y, 0);
  g.useItem(pid, 'hunting_bow');
  g.useItem(pid, 'arrow');
  check(s.inventory.equipped('weapon') === 'hunting_bow' && s.inventory.equipped('ammo') === 'arrow', 'bow and arrows equipped');
  const rat = enemyNear(g, 'wolf', p, 4);
  rat.state = 'idle';
  const arrows0 = s.inventory.equipment.ammo!.qty;
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  g.commandAttack(pid, rat.id);
  run(g, 1.6);
  check(events.some((e) => e.type === 'projectile' && e.effect === 'arrow'), 'arrow projectile fired at range');
  check(s.inventory.equipment.ammo!.qty < arrows0, `arrows are consumed (${arrows0} → ${s.inventory.equipment.ammo!.qty})`);
  run(g, 30, () => rat.dead);
  check(rat.dead, 'paladin kills a wolf with arrows');
}
{
  const { g, s, pid } = solo('sorcerer');
  const p = s.player;
  p.level = 15; g.refreshStats(s); p.mana = p.maxMana;
  const spot = openStrip(g);
  g.teleport(p, spot.x, spot.y, 0);
  const wolf = enemyNear(g, 'wolf', p, 3);
  const m0 = p.mana;
  g.commandAttack(pid, wolf.id);
  run(g, 30, () => wolf.dead);
  check(wolf.dead && p.mana < m0 + 40, 'sorcerer kills a wolf with a wand, spending mana');
}

console.log('Spells & runes');
{
  const { g, s, pid } = solo('sorcerer');
  const p = s.player;
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message') msgs.push(e.text); });
  p.hp = 20;
  g.say(pid, 'exura');
  check(p.hp > 20, 'exura heals');
  p.level = 60; p.exp = 2_000_000; s.skills = legacySkills('sorcerer', 60); g.refreshStats(s); p.mana = p.maxMana;
  const spot = openStrip(g);
  g.teleport(p, spot.x, spot.y, 0);
  const w = enemyNear(g, 'orc', p, 2);
  g.commandAttack(pid, w.id);
  g.say(pid, 'exori vis');
  check(msgs.some((m) => m.includes('not learned')), 'unlearned spells cannot be cast');
  s.inventory.add('gold', 20000);
  // learn at the trainer
  const elias = g.npcs.find((n) => n.key === 'elias')!;
  g.teleport(p, elias.x, elias.y + 1, elias.z);
  g.commandTalk(pid, elias.id);
  run(g, 2, () => !!s.dialogue);
  g.dialogueAction(pid, 'page:spells');
  g.dialogueAction(pid, 'learn:exori_vis');
  g.dialogueAction(pid, 'learn:exevo_gran_mas_vis');
  g.dialogueAction(pid, 'learn:utamo_vita');
  g.dialogueAction(pid, 'learn:utani_hur');
  check(s.spells.has('exori_vis') && s.spells.has('exevo_gran_mas_vis'), 'trainer teaches spells for gold');
  g.closeDialogue(pid);
  g.teleport(p, spot.x, spot.y, 0);
  const o1 = enemyNear(g, 'orc', p, 2);
  const o2 = enemyNear(g, 'orc_warrior', p, 3, 1);
  g.commandAttack(pid, o1.id);
  const h1 = o1.hp;
  g.say(pid, 'exori vis');
  check(o1.hp < h1, 'exori vis damages the target');
  g.say(pid, 'exori vis');
  check(msgs[msgs.length - 1] === 'You are exhausted.', 'attack spells share a cooldown');
  run(g, 2.1);
  const h2a = o1.hp, h2b = o2.hp;
  g.say(pid, 'exevo gran mas vis');
  check((o1.hp < h2a || o1.dead) && o2.hp < h2b, 'rage of the skies hits every enemy around you');
  const st0 = p.stepTime;
  g.say(pid, 'utani hur');
  check(p.stepTime < st0, 'utani hur makes you faster');
  run(g, 1.1);
  g.say(pid, 'utamo vita');
  p.hp = p.maxHp;
  const hpBefore = p.hp, manaBefore = p.mana;
  const orc = enemyNear(g, 'orc_berserker', p, 1);
  orc.state = 'chase'; orc.targetId = pid;
  run(g, 3);
  check(p.hp >= hpBefore && p.mana < manaBefore, `magic shield drains mana before health (hp ${hpBefore}→${p.hp}, mana ${manaBefore}→${p.mana}, shield ${p.buffs.magicShield.toFixed(0)}s)`);
  s.inventory.add('fireball_rune', 5);
  p.maxHp = 99999; p.hp = 99999; p.dead = false;
  run(g, 2.1);
  const f0 = orc.hp;
  p.targetId = orc.id;
  g.useItem(pid, 'fireball_rune');
  check(orc.hp < f0 && s.inventory.count('fireball_rune') === 4, `fireball rune damages and uses a charge (${msgs.slice(-2).join(' | ')}; orc ${orc.dead ? 'dead' : orc.hp})`);
}

console.log('Monster abilities');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  p.level = 80; g.refreshStats(s); p.maxHp = 99999; p.hp = 99999;
  const spot = openStrip(g);
  g.teleport(p, spot.x, spot.y, 0);
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  const scout = enemyNear(g, 'elf_scout', p, 4);
  scout.state = 'chase'; scout.targetId = pid;
  run(g, 4);
  check(events.some((e) => e.type === 'projectile' && e.fromId === scout.id && e.effect === 'arrow'), 'elf scout shoots arrows');
  check(Math.max(Math.abs(scout.x - p.x), Math.abs(scout.y - p.y)) >= 2, 'archers keep their distance');
  const dragon = enemyNear(g, 'dragon', p, 3, 1);
  dragon.state = 'chase'; dragon.targetId = pid; dragon.abilityTimers = dragon.abilityTimers.map(() => 0);
  run(g, 2);
  check(events.some((e) => e.type === 'damage' && e.element === 'fire' && e.targetId === pid), 'dragon fire hits the player');
  const hydra = enemyNear(g, 'hydra', p, 1, -1);
  hydra.hp = 500; hydra.state = 'chase'; hydra.targetId = pid; hydra.abilityTimers = hydra.abilityTimers.map(() => 0);
  run(g, 1);
  check(hydra.hp > 500, 'hydra heals itself when hurt');
}

console.log('Hazards');
{
  const { g, s } = solo('knight');
  const p = s.player;
  let ff: [number, number, number] | null = null;
  for (const [z, f] of g.world.floors) {
    const i = f.obj.findIndex((o) => o === Obj.FireField);
    if (i >= 0) { ff = [i % g.world.width, Math.floor(i / g.world.width), z]; break; }
  }
  check(!!ff, 'fire fields exist');
  if (ff) {
    g.teleport(p, ff[0], ff[1], ff[2]);
    p.placeAt(ff[0], ff[1], ff[2]);
    const hp0 = p.hp;
    run(g, 0.2);
    check(p.hp < hp0, 'standing in a fire field burns');
  }
}

console.log('NPC services');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  p.level = 20; g.refreshStats(s);
  const talk = (key: string) => {
    const n = g.npcs.find((x) => x.key === key)!;
    g.teleport(p, n.x, n.y + 1, n.z);
    if (Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y)) > 2) g.teleport(p, n.x + 1, n.y, n.z);
    g.commandTalk(pid, n.id);
    run(g, 3, () => !!s.dialogue && s.dialogue.npcKey === key);
    return !!s.dialogue && s.dialogue.npcKey === key;
  };
  s.inventory.add('gold', 3000);
  check(talk('brunhild'), 'talk to the smith');
  g.dialogueAction(pid, 'page:trade');
  g.dialogueAction(pid, 'buy:iron_sword:1');
  check(s.inventory.count('iron_sword') === 1, 'buy a sword');
  const gold0 = s.inventory.count('gold');
  g.dialogueAction(pid, 'sell:iron_sword:1');
  check(s.inventory.count('iron_sword') === 0 && s.inventory.count('gold') > gold0, 'sell it back');
  check(talk('garrick'), 'talk to the outfitter');
  g.dialogueAction(pid, 'page:trade');
  g.dialogueAction(pid, 'buy:arrow:50');
  check(s.inventory.count('arrow') === 50, 'buy 50 arrows at once');
  check(talk('orwin'), 'talk to the banker');
  g.dialogueAction(pid, 'page:bank');
  const carried = s.inventory.count('gold');
  g.dialogueAction(pid, 'deposit:all');
  check(s.bank === carried && s.inventory.count('gold') === 0, `deposit all (${s.bank} gold banked)`);
  g.dialogueAction(pid, 'withdraw:100');
  check(s.bank === carried - 100 && s.inventory.count('gold') === 100, 'withdraw 100');
  g.dialogueAction(pid, 'withdraw:all');
  check(talk('hask'), 'talk to the ferryman');
  g.dialogueAction(pid, 'travel:palmreach');
  check((g.world.regionAt(p.x, p.y, p.z)?.name ?? '').startsWith('Palmreach'), 'ship to Palmreach');
  check(talk('mara'), 'talk to the captain in Palmreach');
  g.dialogueAction(pid, 'travel:thornvale');
  check(g.world.regionAt(p.x, p.y, p.z)?.name === 'Thornvale Harbour', 'ship back to Thornvale');
}

console.log('Depot');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  let locker: [number, number, number] | null = null;
  for (const [z, f] of g.world.floors) {
    const i = f.obj.findIndex((o) => o === Obj.Locker);
    if (i >= 0) { locker = [i % g.world.width, Math.floor(i / g.world.width), z]; break; }
  }
  check(!!locker, 'lockers exist');
  if (locker) {
    const near = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].find(([dx, dy]) => g.world.isWalkable(locker![0] + dx, locker![1] + dy, locker![2]))!;
    g.teleport(p, locker[0] + near[0], locker[1] + near[1], locker[2]);
    g.commandUseTile(pid, locker[0], locker[1]);
    run(g, 1, () => !!s.depotOpen);
    check(!!s.depotOpen, 'locker opens the depot');
    const slot = s.inventory.slots.findIndex((x) => x?.id === 'health_potion');
    const n = s.inventory.count('health_potion');
    g.depositItem(pid, slot);
    check(s.inventory.count('health_potion') === 0 && s.depot.some((x) => x?.id === 'health_potion' && x.qty === n), 'deposit potions');
    const mem = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
    new SaveSystem(store).save(g, pid);
    const t = solo('knight');
    new SaveSystem(store).load(t.g, t.pid);
    check(t.s.depot.some((x) => x?.id === 'health_potion'), 'depot contents persist in the save');
    g.withdrawItem(pid, s.depot.findIndex((x) => x?.id === 'health_potion'));
    check(s.inventory.count('health_potion') === n, 'withdraw them again');
    g.commandMoveTo(pid, p.x + 3, p.y);
    run(g, 2);
    check(!s.depotOpen, 'walking away closes the depot');
  }
}

console.log('Player trade');
{
  const g = new Game();
  const a = g.addPlayer('Alice', { vocation: 'paladin' });
  const b = g.addPlayer('Bob', { vocation: 'knight' });
  b.player.placeAt(a.player.x + 1, a.player.y, a.player.z);
  a.inventory.add('gold', 500);
  b.inventory.add('small_ruby', 1);
  executeCommand(g, a.id, { c: 'tradeRequest', id: b.id });
  check(!!g.tradeOf(a.id) && !!g.tradeOf(b.id), 'trade opened');
  const rubySlot = b.inventory.slots.findIndex((x) => x?.id === 'small_ruby');
  executeCommand(g, a.id, { c: 'tradeOffer', slots: [], gold: 300 });
  executeCommand(g, b.id, { c: 'tradeOffer', slots: [rubySlot], gold: 0 });
  executeCommand(g, a.id, { c: 'tradeAccept' });
  executeCommand(g, a.id, { c: 'tradeOffer', slots: [], gold: 250 });
  check(!g.tradeOf(a.id)!.offers[a.id].accepted, 'changing an offer clears acceptance');
  executeCommand(g, a.id, { c: 'tradeAccept' });
  check(a.inventory.count('small_ruby') === 0, 'nothing moves until both accept');
  executeCommand(g, b.id, { c: 'tradeAccept' });
  check(a.inventory.count('small_ruby') === 1 && b.inventory.count('small_ruby') === 0, 'ruby changed hands');
  check(b.inventory.count('gold') - 40 === 250, 'gold changed hands');
  check(!g.tradeOf(a.id), 'trade closed');
  executeCommand(g, a.id, { c: 'tradeRequest', id: b.id });
  b.player.placeAt(a.player.x + 6, a.player.y, a.player.z);
  run(g, 0.1);
  check(!g.tradeOf(a.id), 'walking away cancels a trade');
}

console.log('Quests & exp sharing');
{
  const g = new Game();
  const a = g.addPlayer('Alice');
  const b = g.addPlayer('Bob');
  const spot = openStrip(g);
  for (const s of [a, b]) { s.player.level = 20; g.refreshStats(s); s.player.hp = s.player.maxHp; }
  a.player.placeAt(spot.x, spot.y, 0);
  b.player.placeAt(spot.x, spot.y + 1, 0);
  const wolf = enemyNear(g, 'orc_warrior', a.player, 1, 1);
  executeCommand(g, a.id, { c: 'attack', id: wolf.id });
  executeCommand(g, b.id, { c: 'attack', id: wolf.id });
  const e0a = a.player.exp, e0b = b.player.exp;
  run(g, 30, () => wolf.dead);
  check(wolf.dead && a.player.exp > e0a && b.player.exp > e0b, `exp is shared (${a.player.exp - e0a} + ${b.player.exp - e0b})`);
  const chats: string[] = [];
  g.events.on((e) => { if (e.type === 'chat') chats.push(`${e.name}: ${e.text}`); });
  executeCommand(g, a.id, { c: 'say', text: 'hail Bob' });
  check(chats[0] === 'Alice: hail Bob', 'chat broadcast');
}

console.log('Multiplayer mirror');
{
  const g = new Game();
  const a = g.addPlayer('Alice', { vocation: 'druid' });
  const b = g.addPlayer('Bob');
  const mirror = new Game({ simulate: false });
  mirror.addPlayer('Alice', { id: a.id, starter: false });
  mirror.localId = a.id;
  const extras = { depot: null, trade: null };
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  check(mirror.getPlayer(b.id)?.name === 'Bob', 'mirror learns about other players');
  check(mirror.local.player.vocation === 'druid' && mirror.local.inventory.equipped('weapon') === 'rod_of_frost', 'mirror receives private state');
  b.player.placeAt(b.player.x, b.player.y, -1);
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  check(mirror.getPlayer(b.id)?.z === -1, 'mirror tracks floors');
  g.removePlayer(b.id);
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  check(!mirror.getPlayer(b.id), 'mirror drops players who leave');
}

console.log('Save / load');
{
  const mem = new Map<string, string>();
  const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  const saves = new SaveSystem(store);
  const { g, s, pid } = solo('druid');
  s.player.gainExp(5000);
  g.refreshStats(s);
  s.inventory.add('wolf_pelt', 3);
  s.quests.accept('vermin');
  s.bank = 1234;
  s.spells.add('exura_sio');
  s.chests.add('watchtower');
  {
    let up: [number, number] | null = null;
    for (let y = 0; y < g.world.height && !up; y++) for (let x = 0; x < g.world.width; x++) if (g.world.isWalkable(x, y, 1)) { up = [x, y]; break; }
    g.teleport(s.player, up![0], up![1], 1);
  }
  g.setOutfit(pid, { type: 'ranger', head: 7, body: 30, legs: 50, feet: 90 });
  check(saves.save(g, pid), 'saved');
  const t = solo('knight');
  check(saves.load(t.g, t.pid), 'loaded');
  const s2 = t.s;
  check(s2.player.vocation === 'druid' && s2.player.level === s.player.level, 'vocation and level restored');
  check(s2.inventory.count('wolf_pelt') === 3 && s2.bank === 1234, 'backpack and bank restored');
  check(s2.spells.has('exura_sio') && s2.chests.has('watchtower'), 'spells and opened chests restored');
  check(s2.player.z === s.player.z, `floor restored (z=${s2.player.z})`);
  check(s2.player.outfit.type === 'ranger', 'outfit restored');
  const v1 = { version: 1, savedAt: 0, player: { x: 1, y: 1, level: 5, exp: 900, hp: 100, mana: 20, facing: 0 }, inventory: { slots: [{ id: 'gold', qty: 7 }], equipment: { weapon: 'iron_sword', shield: null, armor: 'chain_armor' } }, quests: {} };
  check(t.g.applySave(t.pid, v1), 'old version-1 saves still load');
  check(s2.inventory.equipped('weapon') === 'iron_sword' && s2.inventory.equipped('armor') === 'chain_armor', 'old equipment migrates to the new slots');
  check(!t.g.applySave(t.pid, { version: 99 }), 'rejects bad save data');
}

console.log('\nAimed runes');
{
  const { g, s, pid } = solo('sorcerer');
  const spot = openStrip(g);
  s.player.level = 40;
  g.refreshStats(s);
  g.teleport(s.player, spot.x, spot.y, spot.z);
  const p = s.player;
  const pick = (kind: Enemy['enemyKind'], n: number) => g.enemies.filter((x) => x.enemyKind === kind).slice(0, n);
  const orcs = pick('orc', 3);
  orcs.forEach((e, i) => {
    e.placeAt(p.x + 4, p.y - 1 + i, p.z);
    Object.assign(e, { spawnX: e.x, spawnY: e.y, spawnZ: p.z });
    e.dead = false;
    e.hp = e.maxHp;
  });
  s.inventory.add('fireball_rune', 5);
  const slot = s.inventory.slots.findIndex((x) => x?.id === 'fireball_rune');
  executeCommand(g, pid, { c: 'useRuneAt', slot, x: p.x + 4, y: p.y });
  check(orcs.every((e) => e.hp < e.maxHp || e.dead), 'area rune thrown at a tile hits every monster in the circle');
  check(s.inventory.count('fireball_rune') === 4, 'one charge used');
  run(g, 2.1);
  executeCommand(g, pid, { c: 'useRuneAt', slot, x: p.x + 12, y: p.y });
  check(s.inventory.count('fireball_rune') === 4, 'out of range is refused');
  s.inventory.add('healing_rune', 2);
  const friend = g.addPlayer('Friend', { vocation: 'knight' }).player;
  g.teleport(friend, p.x + 1, p.y, p.z);
  friend.hp = 50;
  const hs = s.inventory.slots.findIndex((x) => x?.id === 'healing_rune');
  executeCommand(g, pid, { c: 'useRuneAt', slot: hs, x: friend.x, y: friend.y });
  check(friend.hp > 50, 'healing rune aimed at a friend heals them');
}

console.log('\nTest commands and classic look');
{
  const { g, s, pid } = solo('knight');
  check(!s.admin, 'test commands are off by default');
  g.say(pid, '/level 100');
  check(s.player.level === 1, 'refused without permission');
  s.admin = true;
  g.say(pid, '/level 100');
  check(s.player.level === 100 && s.player.hp === s.player.maxHp && s.player.maxHp > 1000, `/level sets level and refills (hp ${s.player.maxHp})`);
  g.say(pid, '/gold 25000');
  check(s.inventory.count('gold') + s.bank >= 25000, '/gold gives gold');
  g.say(pid, '/item dragon helm');
  check(s.inventory.count('dragon_helm') === 1, '/item finds items by name');
  g.say(pid, '/item great_health_potion 50');
  check(s.inventory.count('great_health_potion') === 50, '/item gives a stack');
  g.say(pid, '/spells');
  check(s.spells.has('exori_gran'), '/spells teaches every vocation spell');
  g.say(pid, '/god');
  const e = g.enemies.find((x) => x.enemyKind === 'demon')!;
  const hp = s.player.hp;
  g.meleeAttack(e, s.player);
  check(s.player.hp === hp, 'god mode takes no damage');
  g.say(pid, '/goto caldera');
  check(g.world.regionAt(s.player.x, s.player.y, s.player.z)?.name === 'The Caldera', '/goto teleports to a region');
  s.player.targetId = e.id;
  g.say(pid, '/kill');
  check(e.dead, '/kill kills the target');
  g.setShowGear(pid, false);
  check(g.serialize(pid).player.showGear === true, 'worn equipment always shows (no classic-look option)');
  const mirror = new Game({ simulate: false });
  mirror.localId = 999;
  applySnapshot(mirror, buildSnapshot(g, s) as never);
  check(mirror.getPlayer(pid)?.showGear === true, 'other players see the worn equipment');
}

console.log('\nAnti-spam cooldowns');
{
  const { g, s, pid } = solo('sorcerer');
  s.inventory.add('mana_potion', 5);
  s.inventory.add('health_potion', 5);
  const slotOf = (id: string) => s.inventory.slots.findIndex((x) => x?.id === id);
  s.player.mana = 1;
  s.player.hp = 10;
  const before = s.inventory.count('mana_potion');
  g.useSlot(pid, slotOf('mana_potion'));
  g.useSlot(pid, slotOf('mana_potion'));
  check(s.inventory.count('mana_potion') === before - 1, 'second mana potion right away is refused');
  const hpBefore = s.inventory.count('health_potion');
  g.useSlot(pid, slotOf('health_potion'));
  check(s.inventory.count('health_potion') === hpBefore, 'potions share one cooldown');
  run(g, 1.05);
  g.useSlot(pid, slotOf('health_potion'));
  check(s.inventory.count('health_potion') === hpBefore - 1, 'after 1 s you may drink again');
  s.player.hp = 10;
  s.player.mana = 500;
  s.player.maxMana = 500;
  g.castSpell(pid, 'exura');
  const hp1 = s.player.hp;
  g.castSpell(pid, 'exura');
  check(s.player.hp === hp1, 'healing spells cannot be spammed');
  check(s.player.groupCooldowns.potion >= 0 && s.player.groupCooldowns.heal > 0, 'cooldowns tracked per group');
}

console.log('\nSave migration (big updates must not lose progress)');
{
  const { g, s, pid } = solo('paladin');
  s.player.level = 30;
  s.player.exp = 200000;
  s.inventory.add('gold', 500);
  const gold = s.inventory.count('gold');
  s.bank = 777;
  const data = g.serialize(pid) as unknown as Record<string, unknown>;
  check(data.version === SAVE_VERSION, `saves carry the format version (${SAVE_VERSION})`);
  // pretend an update removed one item and an old save still has it
  const inv = data.inventory as { slots: Array<{ id: string; qty: number } | null> };
  inv.slots[7] = { id: 'removed_relic', qty: 2 };
  const t = solo('knight');
  check(t.g.applySave(t.pid, data), 'save with a removed item still loads');
  check(t.s.player.level === 30 && t.s.inventory.count('gold') === gold && t.s.bank === 777, 'level, gold and bank survive');
  check(t.s.lostItems.some((x) => x.id === 'removed_relic' && x.qty === 2), 'the removed item is kept aside, not deleted');
  const again = t.g.serialize(t.pid);
  check(again.lostItems?.some((x) => x.id === 'removed_relic'), 'kept-aside items stay in later saves');
  // a later update brings it back under a new name
  ITEM_RENAMES.removed_relic = 'demon_horn';
  const u = solo('knight');
  check(u.g.applySave(u.pid, again), 'loads after the item returns');
  check(u.s.depot.some((x) => x?.id === 'demon_horn' && x.qty === 2) && u.s.lostItems.length === 0, 'returned items are given back in the depot');
  delete ITEM_RENAMES.removed_relic;
  const future = { ...again, version: SAVE_VERSION + 1 };
  check(migrateSave(future) === 'newer' && !u.g.applySave(u.pid, future), 'a save from a newer version is never overwritten by an older server');
}

console.log('Ground items, depot tops and battle-list runes');
{
  const { g, s, pid } = solo('sorcerer');
  const p = s.player;
  const w = g.world;
  // a free spot with free tiles around it, away from towns
  let at: [number, number] | null = null;
  for (let y = 300; y < 500 && !at; y++) for (let x = 100; x < 500; x++) {
    let ok = !w.isSafe(x, y, 0);
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!w.isWalkable(x + dx, y + dy, 0) || w.getObj(x + dx, y + dy, 0) !== 0) { ok = false; break; }
    if (ok) { at = [x, y]; break; }
  }
  g.teleport(p, at![0], at![1], 0);
  s.inventory.add('wolf_pelt', 2);
  const slot = s.inventory.slots.findIndex((x) => x?.id === 'wolf_pelt');
  executeCommand(g, pid, { c: 'throw', from: slot, x: p.x + 1, y: p.y });
  const bag = g.bags.find((b) => b.x === p.x + 1 && b.y === p.y);
  check(!!bag && bag.items.some((i) => i.id === 'wolf_pelt'), 'throw an item onto the ground');
  executeCommand(g, pid, { c: 'moveBag', id: bag!.id, x: p.x + 3, y: p.y + 1 });
  check(!g.bags.some((b) => b.id === bag!.id) && g.bags.some((b) => b.x === p.x + 3 && b.y === p.y + 1), 'move an item lying on the ground to another tile');
  // depot locker top
  const lk = (() => { for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) if (w.getObj(x, y, 0) === Obj.Locker && w.isWalkable(x, y + 1, 0)) return [x, y]; return null; })()!;
  g.teleport(p, lk[0], lk[1] + 1, 0);
  s.inventory.add('wolf_pelt', 1);
  executeCommand(g, pid, { c: 'throw', from: s.inventory.slots.findIndex((x) => x?.id === 'wolf_pelt'), x: lk[0], y: lk[1] });
  check(g.bags.some((b) => b.x === lk[0] && b.y === lk[1]), 'put an item on top of a depot locker');
  check(w.getObj(lk[0] + 1, lk[1], 0) !== Obj.Locker && w.getObj(lk[0] - 1, lk[1], 0) !== Obj.Locker, 'depot lockers have a gap between them');
  // rune dropped on a battle-list row
  g.teleport(p, at![0], at![1], 0);
  const Ctor = g.enemies[0].constructor as new (id: number, kind: string, x: number, y: number, z: number) => (typeof g.enemies)[number];
  const foe = new Ctor(999001, 'rat', p.x + 2, p.y, 0);
  g.enemies.push(foe);
  const runeId = Object.keys(ITEMS).find((k) => ITEMS[k].rune?.type === 'damage' && !ITEMS[k].rune?.radius && (!ITEMS[k].level || ITEMS[k].level! <= 1))!;
  s.inventory.add(runeId, 3);
  p.groupCooldowns.attack = 0;
  const hp0 = foe.hp;
  executeCommand(g, pid, { c: 'useRuneOn', slot: s.inventory.slots.findIndex((x) => x?.id === runeId), id: foe.id });
  check(foe.hp < hp0 || foe.dead, `rune from the backpack hits a creature picked on the battle list (${runeId})`);
}

console.log('Trading items, fight stance, luring');
{
  const g = new Game();
  const a = g.addPlayer('Alice', { vocation: 'paladin' });
  const b = g.addPlayer('Bob', { vocation: 'knight' });
  g.teleport(b.player, a.player.x + 1, a.player.y, a.player.z);
  a.inventory.add('wolf_pelt', 2);
  const slot = a.inventory.slots.findIndex((x) => x?.id === 'wolf_pelt');
  executeCommand(g, a.id, { c: 'tradeItem', id: b.id, slot });
  check(g.tradeView(a.id)?.mine.items.some((i) => i.id === 'wolf_pelt') === true && !!g.tradeView(b.id), 'dragging an item onto a player opens a trade with it offered');
  executeCommand(g, a.id, { c: 'tradeAccept' });
  executeCommand(g, b.id, { c: 'tradeAccept' });
  check(b.inventory.count('wolf_pelt') === 2 && a.inventory.count('wolf_pelt') === 0, 'items change hands when both accept');

  executeCommand(g, a.id, { c: 'fightMode', mode: 'defensive', chase: false });
  check(a.player.fightMode === 'defensive' && a.player.chase === false, 'fight stance and stand mode are set');

  // a monster follows its target far from home and does not run back or heal
  const { g: g2, s, pid } = solo('knight');
  const p = s.player;
  p.god = true;
  const w = g2.world;
  let at: [number, number] | null = null;
  for (let y = 300; y < 500 && !at; y++) for (let x = 100; x < 500; x++) {
    let ok = !w.isSafe(x, y, 0);
    for (let dx = -1; dx <= 30 && ok; dx++) if (!w.isWalkable(x + dx, y, 0) || w.getObj(x + dx, y, 0) !== 0 || w.isSafe(x + dx, y, 0)) ok = false;
    if (ok) { at = [x, y]; break; }
  }
  g2.teleport(p, at![0] + 2, at![1], 0);
  const Ctor = g2.enemies[0].constructor as new (id: number, kind: string, x: number, y: number, z: number) => (typeof g2.enemies)[number];
  const foe = new Ctor(999101, 'wolf', at![0], at![1], 0);
  g2.enemies.push(foe);
  foe.hp = Math.floor(foe.maxHp / 2);
  for (let step = 0; step < 24; step++) {
    g2.teleport(p, Math.min(at![0] + 2 + step, at![0] + 28), at![1], 0);
    for (let k = 0; k < 20; k++) g2.update(0.05);
  }
  check(foe.distFromSpawn() >= 15 && !foe.dead, `a lured monster follows far from its spawn (${foe.distFromSpawn()} tiles)`);
  check(foe.hp <= Math.floor(foe.maxHp / 2), 'a lured monster does not heal by running home');
  void pid;
}

console.log('\nPvP');
{
  let clock = 1_000_000;
  const g = new Game({ pvp: true, now: () => clock });
  const a = g.addPlayer('Attacker', { vocation: 'knight' });
  const b = g.addPlayer('Defender', { vocation: 'knight' });
  const w = g.world;
  const free = (x: number, y: number) => w.isWalkable(x, y, 0) && w.getObj(x, y, 0) === Obj.None && !w.linkAt(x, y, 0) && !g.isOccupied(x, y, 0);
  const find = (ok: (x: number, y: number) => boolean): [number, number] => {
    for (let y = 1; y < w.height - 1; y++) for (let x = 1; x < w.width - 1; x++) if (ok(x, y)) return [x, y];
    throw new Error('no such tile');
  };
  const spot = openStrip(g);
  a.player.placeAt(spot.x, spot.y, 0);
  b.player.placeAt(spot.x + 1, spot.y, 0);
  check(!g.tryStep(a.player, 1, 0), 'players block each other outside protection zones');
  const pathAround = g.pathTo(a.player, spot.x + 2, spot.y, false, 2000);
  check(!!pathAround && !pathAround.some((t) => t.x === spot.x + 1 && t.y === spot.y), 'click-to-move paths around a player');
  const [sx, sy] = find((x, y) => w.isSafe(x, y, 0) && w.isSafe(x + 1, y, 0) && free(x, y) && free(x + 1, y));
  a.player.placeAt(sx, sy, 0);
  b.player.placeAt(sx + 1, sy, 0);
  check(g.tryStep(a.player, 1, 0), 'players walk through each other inside a protection zone');
  run(g, 0.5);

  a.player.placeAt(spot.x, spot.y, 0);
  b.player.placeAt(spot.x + 1, spot.y, 0);
  executeCommand(g, a.id, { c: 'secureMode', on: false });
  check(PVP_MIN_LEVEL === 1, 'PvP is open from level 1');
  // real experience, so the 6% death penalty keeps them well above level 8
  for (const s of [a, b]) { s.player.level = 20; s.player.exp = expForLevel(20); g.refreshStats(s); s.player.hp = s.player.maxHp; }
  executeCommand(g, a.id, { c: 'secureMode', on: true });
  executeCommand(g, a.id, { c: 'attack', id: b.id });
  check(a.player.targetId === null, 'secure mode refuses attacking an unmarked player');
  executeCommand(g, a.id, { c: 'secureMode', on: false });
  executeCommand(g, a.id, { c: 'attack', id: b.id });
  check(a.player.targetId === b.id, 'secure mode off: the attack starts');
  run(g, 10, () => b.player.hp < b.player.maxHp);
  check(b.player.hp < b.player.maxHp, `melee damages a player (${b.player.maxHp - b.player.hp})`);
  check(g.skullOf(a.player) === 1 && g.skullOf(b.player) === 0, 'the attacker gets a white skull');
  check(a.player.pzLock > 0, 'attacking a player gives a PZ lock');
  executeCommand(g, b.id, { c: 'attack', id: a.id });
  check(b.player.targetId === a.id, 'the victim may hit back even with secure mode on (attacker is marked)');
  const aHp = a.player.hp;
  run(g, 10, () => a.player.hp < aHp);
  check(a.player.hp < aHp && g.skullOf(b.player) === 0, 'self-defence gives no skull');
  executeCommand(g, a.id, { c: 'clearTarget' });
  executeCommand(g, b.id, { c: 'clearTarget' });
  check(buildSnapshot(g, b).t === 'snap' && (buildSnapshot(g, b) as { c: Array<{ id: number; sk?: number }> }).c.find((c) => c.id === a.id)?.sk === 1, 'snapshots carry the skull');

  // PZ lock: no stepping from outside into a protection zone
  const [ex, ey] = find((x, y) => !w.isSafe(x, y, 0) && w.isSafe(x + 1, y, 0) && free(x, y) && free(x + 1, y) && w.canStep(x, y, 0, 1, 0));
  a.player.placeAt(ex, ey, 0);
  a.player.pzLock = 30;
  check(!g.tryStep(a.player, 1, 0), 'a PZ-locked player cannot enter a protection zone');
  a.player.pzLock = 0;
  check(g.tryStep(a.player, 1, 0), 'without the lock the protection zone is open');
  run(g, 0.5);
  b.player.placeAt(spot.x + 1, spot.y, 0);
  executeCommand(g, a.id, { c: 'attack', id: b.id });
  check(a.player.targetId === null, 'no attacking a player from inside a protection zone');
  a.player.placeAt(ex - 1, ey, 0);
  b.player.placeAt(ex + 1, ey, 0);
  executeCommand(g, a.id, { c: 'attack', id: b.id });
  check(a.player.targetId === null, 'no attacking a player standing in a protection zone');

  // unjustified kills → red skull
  clock += 20 * 60 * 1000; // the old fight is forgotten: both unmarked again
  check(g.skullOf(a.player) === 0, 'the white skull wears off');
  for (let k = 0; k < 3; k++) {
    run(g, 6, () => !b.player.dead);
    b.player.attackedBy.clear();
    a.player.placeAt(spot.x, spot.y, 0);
    b.player.placeAt(spot.x + 1, spot.y, 0);
    b.player.hp = 1;
    a.player.attackTimer = 0;
    executeCommand(g, a.id, { c: 'attack', id: b.id });
    run(g, 10, () => b.player.dead);
  }
  check(b.player.dead && a.player.unjustKills.length === 3, `three unjustified kills recorded (${a.player.unjustKills.length})`);
  check(g.skullOf(a.player) === 2, 'three unjustified kills give a red skull');
  run(g, 6, () => !b.player.dead);

  // skulls survive save/load
  const save = JSON.parse(JSON.stringify(g.serialize(a.id)));
  const g2 = new Game({ pvp: true, now: () => clock });
  const a2 = g2.addPlayer('Attacker');
  check(g2.applySave(a2.id, save) && g2.skullOf(a2.player) === 2 && a2.player.unjustKills.length === 3 && !a2.player.secure, 'skulls, kills and secure mode survive save/load');
  const v3 = { ...save, version: 3 };
  delete v3.pvp;
  check(g2.applySave(a2.id, v3) && g2.skullOf(a2.player) === 0 && a2.player.secure, 'a v3 save loads unmarked with secure mode on');

  // a red skull loses the whole backpack on death
  s0: {
    a.inventory.add('wolf_pelt', 2);
    const carried = a.inventory.slots.filter(Boolean).length;
    a.player.placeAt(spot.x, spot.y, 0);
    b.player.placeAt(spot.x + 1, spot.y, 0);
    a.player.hp = 1;
    executeCommand(g, b.id, { c: 'attack', id: a.id });
    check(b.player.targetId === a.id, 'a red-skulled player can be attacked in secure mode');
    const msgs: string[] = [];
    g.events.on((e) => { if (e.type === 'message' && e.to === a.id) msgs.push(e.text); });
    run(g, 10, () => a.player.dead);
    if (!a.player.dead) { check(false, 'red skull dies'); break s0; }
    check(msgs.some((m) => m.startsWith('You were killed by Defender')), 'death message names the killer');
    check(a.inventory.slots.every((x) => !x) && g.bags.some((bg) => bg.items.some((i) => i.id === 'wolf_pelt')) && carried > 0, 'a red skull drops the whole backpack');
  }

  // PvP off
  const off = new Game();
  const c1 = off.addPlayer('One'), c2 = off.addPlayer('Two');
  const os = openStrip(off);
  for (const s of [c1, c2]) { s.player.level = 20; off.refreshStats(s); }
  c1.player.placeAt(os.x, os.y, 0);
  c2.player.placeAt(os.x + 1, os.y, 0);
  executeCommand(off, c1.id, { c: 'secureMode', on: false });
  executeCommand(off, c1.id, { c: 'attack', id: c2.id });
  check(c1.player.targetId === null && !off.pvp, 'with PvP off, attacking players is refused');
}

console.log('Party and shared experience');
{
  const g = new Game();
  const a = g.addPlayer('Leader', { vocation: 'knight' });
  const b = g.addPlayer('Healer', { vocation: 'druid' });
  const c = g.addPlayer('Stranger', { vocation: 'sorcerer' });
  const w = g.world;
  let at: [number, number] | null = null;
  for (let y = 300; y < 500 && !at; y++) for (let x = 100; x < 500; x++) {
    let ok = !w.isSafe(x, y, 0);
    for (let dx = -2; dx <= 4 && ok; dx++) if (!w.isWalkable(x + dx, y, 0) || w.isSafe(x + dx, y, 0)) ok = false;
    if (ok) { at = [x, y]; break; }
  }
  g.teleport(a.player, at![0], at![1], 0);
  g.teleport(b.player, at![0] + 2, at![1], 0);
  g.teleport(c.player, at![0] + 4, at![1], 0);
  executeCommand(g, a.id, { c: 'partyInvite', id: b.id });
  check(g.partyFlag(b.id, a.id) === 2 && g.partyFlag(a.id, b.id) === 3, 'invitation shows on both sides');
  executeCommand(g, b.id, { c: 'partyJoin', id: a.id });
  check(g.sameParty(a.id, b.id) && g.partyView(b.id)?.members.length === 2, 'invited player joins the party');
  executeCommand(g, c.id, { c: 'partyJoin', id: a.id });
  check(!g.sameParty(a.id, c.id), 'cannot join without an invitation');
  // party members cannot hurt each other
  executeCommand(g, a.id, { c: 'secureMode', on: false });
  check(g.pvpProblem(a.player, b.player, false) !== null, 'no attacking party members');
  // shared experience
  const Ctor = g.enemies[0].constructor as new (id: number, kind: string, x: number, y: number, z: number) => (typeof g.enemies)[number];
  const kill = () => {
    const foe = new Ctor(999200 + Math.floor(Math.random() * 1000), 'wolf', at![0] + 1, at![1] + 1, 0);
    g.enemies.push(foe);
    foe.damageBy.set(a.id, foe.maxHp);
    g.meleeAttack(a.player, foe);
    (g as unknown as { killEnemy(e: unknown): void }).killEnemy(foe);
    return foe.def.exp;
  };
  let ea = a.player.exp, eb = b.player.exp;
  const base = kill();
  check(a.player.exp - ea === base && b.player.exp === eb, 'without sharing only the killer gets experience');
  executeCommand(g, b.id, { c: 'partyShare', on: true });
  check(!g.partyView(a.id)?.shared, 'only the leader switches shared experience');
  executeCommand(g, a.id, { c: 'partyShare', on: true });
  check(!!g.partyView(a.id)?.sharedActive, 'shared experience is active for nearby members of similar level');
  ea = a.player.exp; eb = b.player.exp;
  kill();
  const each = Math.max(1, Math.round(base * 1.2 / 2));
  check(a.player.exp - ea === each && b.player.exp - eb === each, `shared experience is split evenly with a bonus (${each} each)`);
  g.teleport(b.player, at![0] + 2, at![1] + 2, 0);
  b.player.level = 100;
  check(!g.partyView(a.id)?.sharedActive, 'sharing pauses when levels are too far apart');
  executeCommand(g, b.id, { c: 'partyLeave' });
  check(!g.partyOf(a.id) && !g.partyOf(b.id), 'a party of one disbands');
}

console.log('\nSkills (classic: trained by use)');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  check(s.skills.sword.level === 10 && s.skills.axe.level === 10 && s.skills.fist.level === 10 && s.skills.magic.level === 0 && s.skills.shielding.level === 10, 'new characters start with skills 10 and magic level 0');
  check(g.weaponPower(s) === 1 && g.magicPower(s) === 1, 'a fresh level-1 character fights exactly as before (power level = level)');
  check(triesForNext('sword', 10, 'knight') === 50 && triesForNext('sword', 11, 'knight') === 55 && triesForNext('magic', 0, 'sorcerer') === 1600, 'tries per level grow exponentially');
  check(triesForNext('sword', 30, 'knight') < triesForNext('sword', 30, 'paladin') && triesForNext('sword', 30, 'paladin') < triesForNext('sword', 30, 'sorcerer'), 'knights train melee fastest, mages slowest');
  check(triesForNext('distance', 30, 'paladin') < triesForNext('distance', 30, 'knight'), 'paladins train distance fastest');
  check(triesForNext('magic', 10, 'druid') < triesForNext('magic', 10, 'paladin') && triesForNext('magic', 10, 'paladin') < triesForNext('magic', 10, 'knight'), 'mages train magic level fastest');

  // swings train the weapon skill
  const spot = openStrip(g);
  g.teleport(p, spot.x, spot.y, 0);
  p.god = true;
  const foe = enemyNear(g, 'orc_warrior', p, 1);
  foe.hp = foe.maxHp = 1e9;
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === pid) msgs.push(e.text); });
  s.skills.sword.tries = 49;
  g.commandAttack(pid, foe.id);
  run(g, 2.5);
  check(s.skills.sword.level >= 11 && msgs.some((m) => m === 'You advanced to sword fighting level 11.'), `attacking with a sword trains sword fighting (now ${s.skills.sword.level})`);
  check(s.skills.shielding.tries > 0 || s.skills.shielding.level > 10, 'being attacked while holding a shield trains shielding');
  const noShield = solo('knight');
  noShield.s.inventory.equipment.shield = null;
  g.teleport(noShield.s.player, spot.x, spot.y + 1, 0);
  {
    const ng = noShield.g;
    const np = noShield.s.player;
    ng.teleport(np, spot.x, spot.y, 0);
    np.god = true;
    const f2 = enemyNear(ng, 'orc_warrior', np, 1);
    f2.hp = f2.maxHp = 1e9;
    f2.targetId = np.id;
    run(ng, 4);
    check(noShield.s.skills.shielding.tries === 0, 'no shield, no shielding training');
  }
  g.commandClearTarget(pid);
  p.god = false;

  // higher skill → more damage at the same level (and the same weapon)
  const avg = (power: number, skill: number) => {
    let t = 0;
    for (let i = 0; i < 4000; i++) {
      const r = rollMelee(power, 20, 1, 0, 0);
      t += r.amount;
    }
    void skill;
    return t / 4000;
  };
  const lowP = powerLevel(40, 'sword', 20, 'knight');
  const highP = powerLevel(40, 'sword', 60, 'knight');
  check(avg(highP, 60) > avg(lowP, 20) * 1.15, `sword 60 hits harder than sword 20 at level 40 (power ${lowP.toFixed(1)} → ${highP.toFixed(1)})`);
  const typ = typicalSkill('sword', 40, 'knight');
  check(Math.abs(powerLevel(40, 'sword', typ, 'knight') - 40) < 1e-9, `at the typical skill (${typ.toFixed(1)}) a level-40 knight deals the old damage`);
  // real game: damage goes up once the skill is raised
  {
    const kk = solo('knight');
    kk.s.player.level = 40;
    kk.g.refreshStats(kk.s);
    const ks = openStrip(kk.g);
    kk.g.teleport(kk.s.player, ks.x, ks.y, 0);
    const dummy = enemyNear(kk.g, 'orc', kk.s.player, 1);
    const swingAvg = () => {
      let t = 0;
      for (let i = 0; i < 1500; i++) {
        dummy.dead = false; dummy.hp = 1e9;
        kk.g.meleeAttack(kk.s.player, dummy);
        t += 1e9 - dummy.hp;
      }
      return t / 1500;
    };
    kk.s.skills.sword = { level: 15, tries: 0 };
    const d15 = swingAvg();
    kk.s.skills.sword = { level: 70, tries: 0 };
    const d70 = swingAvg();
    check(d70 > d15 * 1.2, `in game, sword 70 deals more than sword 15 (${d15.toFixed(1)} → ${d70.toFixed(1)} per swing)`);
    kk.s.skills.shielding = { level: 10, tries: 0 };
    const def10 = kk.g.defense(kk.s);
    kk.s.skills.shielding = { level: 60, tries: 0 };
    check(kk.g.defense(kk.s) > def10, `shielding raises defence (${def10} → ${kk.g.defense(kk.s)})`);
  }

  // magic level from mana spent
  const m = solo('sorcerer');
  m.s.player.mana = m.s.player.maxMana;
  m.s.player.hp = 10;
  const before = m.s.skills.magic.tries;
  m.g.say(m.pid, 'exura');
  check(m.s.skills.magic.tries - before === 20 || m.s.skills.magic.tries - before > 0, `casting spends mana and trains magic level (+${m.s.skills.magic.tries - before})`);
  m.s.skills.magic.tries = 1599;
  m.s.player.hp = 10;
  m.s.player.groupCooldowns.heal = 0;
  m.s.player.spellCooldowns = {};
  m.g.say(m.pid, 'exura');
  check(m.s.skills.magic.level === 1, 'enough mana spent: magic level 1');
  const healAt = (ml: number) => {
    m.s.skills.magic.level = ml;
    return m.g.magicPower(m.s);
  };
  check(healAt(30) > healAt(0), 'magic level raises the power of spells, runes and healing');
  // wands: every shot spends mana and trains magic level
  {
    const ws = openStrip(m.g);
    m.g.teleport(m.s.player, ws.x, ws.y, 0);
    m.s.skills.magic = { level: 0, tries: 0 };
    m.s.player.mana = m.s.player.maxMana;
    m.s.player.god = true;
    const t = enemyNear(m.g, 'orc_warrior', m.s.player, 2);
    t.hp = t.maxHp = 1e9;
    m.g.commandAttack(m.pid, t.id);
    run(m.g, 3.2);
    check(m.s.skills.magic.tries > 0, 'wand shots train magic level');
  }

  // admin command and help
  s.admin = true;
  g.say(pid, '/skill axe 55');
  g.say(pid, '/skill ml 7');
  g.say(pid, '/skill wc 30');
  check(s.skills.axe.level === 55 && s.skills.magic.level === 7 && gatherLevelForXp(s.woodcutting) === 30, '/skill sets combat skills, magic level and woodcutting');
  g.say(pid, '/help');
  check(msgs.some((t) => t.startsWith('/skill')), '/help lists /skill');

  // save, load and the snapshot (own player only)
  const data = g.serialize(pid);
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.skills.axe.level === 55 && t2.s.skills.sword.level === s.skills.sword.level && t2.s.skills.sword.tries === s.skills.sword.tries && t2.s.woodcutting === s.woodcutting, 'skills and woodcutting survive save and load');
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    applySnapshot(mirror, snap);
    const ms = mirror.session(pid)!;
    check(ms.skills.axe.level === 55 && ms.skills.magic.level === 7 && ms.woodcutting === s.woodcutting, 'skills reach the client in the snapshot');
    const other = snap.c.find((c) => c.id === pid) as unknown as Record<string, unknown>;
    check(other && !('skills' in other), 'skills are only sent for your own character');
  }
}

console.log('Skills migration (save v4 → v5)');
{
  const old = (voc: Vocation, level: number) => {
    const { g, pid, s } = solo(voc);
    s.player.level = level;
    s.player.exp = expForLevel(level);
    const d = g.serialize(pid) as unknown as Record<string, unknown>;
    delete d.skills;
    delete d.gathering;
    delete d.market;
    d.version = 4;
    return d;
  };
  const m1 = migrateSave(old('knight', 1));
  check(typeof m1 !== 'string' && m1.from === 4 && m1.data.version === SAVE_VERSION, 'a v4 save migrates');
  const k1 = solo('knight');
  k1.g.applySave(k1.pid, old('knight', 1));
  check(k1.s.skills.sword.level === 10 && k1.s.skills.magic.level === 0 && k1.s.woodcutting === 0, 'level 1: starting skills');
  for (const [voc, lvl] of [['knight', 100], ['paladin', 80], ['sorcerer', 60], ['druid', 120], ['knight', 8]] as Array<[Vocation, number]>) {
    const t = solo(voc);
    t.g.applySave(t.pid, old(voc, lvl));
    const sk = t.s.skills;
    const wp = t.g.weaponPower(t.s, 'sword'), dp = t.g.weaponPower(t.s, 'distance'), mp = t.g.magicPower(t.s);
    const ok = wp >= lvl && wp < lvl + 1.5 && dp >= lvl && dp < lvl + 2 && mp >= lvl && mp < lvl + 3;
    check(ok, `${voc} ${lvl}: damage and healing stay where they were (sword ${sk.sword.level}, distance ${sk.distance.level}, magic ${sk.magic.level}, shielding ${sk.shielding.level}; power ${wp.toFixed(1)}/${dp.toFixed(1)}/${mp.toFixed(1)})`);
  }
  const k = legacySkills('knight', 100), so = legacySkills('sorcerer', 100), pa = legacySkills('paladin', 100);
  check(k.sword.level > pa.sword.level && pa.sword.level > so.sword.level && so.magic.level > pa.magic.level && pa.magic.level > k.magic.level && pa.distance.level > k.distance.level, 'migrated skills follow the vocation (knights melee, paladins distance, mages magic)');
  check(k.shielding.level > so.shielding.level, 'knights get more shielding than mages');
}

console.log('Woodcutting');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  const w = g.world;
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === pid) msgs.push(e.text); });
  const findTree = (o: Obj): { x: number; y: number; sx: number; sy: number } | null => {
    for (let y = 40; y < w.height - 40; y++) for (let x = 40; x < w.width - 40; x++) {
      if (w.getObj(x, y, 0) !== o || w.isSafe(x, y, 0)) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (w.isWalkable(x + dx, y + dy, 0) && !w.linkAt(x + dx, y + dy, 0) && !g.isOccupied(x + dx, y + dy, 0)) return { x, y, sx: x + dx, sy: y + dy };
      }
    }
    return null;
  };
  check(gatherXpForLevel(2) === 83 && gatherXpForLevel(99) === 13034431 && gatherLevelForXp(0) === 1, 'woodcutting uses the 1–99 curve (83 xp for level 2, 13,034,431 for 99)');
  const t = findTree(Obj.Tree)!;
  g.teleport(p, t.sx, t.sy, 0);
  p.god = true;
  for (const e of g.enemies) if (!e.dead && Math.abs(e.x - p.x) < 12 && Math.abs(e.y - p.y) < 12) { e.dead = true; e.respawnTimer = 1e9; }
  s.inventory.equipment.weapon = { id: 'short_sword', qty: 1 };
  executeCommand(g, pid, { c: 'useTile', x: t.x, y: t.y });
  run(g, 0.5);
  check(msgs.some((m) => m.startsWith('You need an axe')), 'no axe, no chopping');
  s.inventory.add('hatchet', 1);
  g.localId = pid;
  check(g.isUsable(t.x, t.y, 0), 'with an axe, trees can be used (chopped)');
  const chops: boolean[] = [];
  g.events.on((e) => { if (e.type === 'chop' && e.id === pid) chops.push(e.got); });
  executeCommand(g, pid, { c: 'useTile', x: t.x, y: t.y });
  run(g, 120, () => s.inventory.count('logs') > 0);
  check(s.inventory.count('logs') === 1 && s.woodcutting === TREES[Obj.Tree]!.xp, `chopping gives logs and woodcutting experience (${chops.length} chops, ${s.woodcutting} xp)`);
  check(w.getObj(t.x, t.y, 0) === Obj.Stump && !w.isWalkable(t.x, t.y, 0) && g.stumpOrigin(t.x, t.y, 0) === Obj.Tree && p.chop === null, 'the tree falls and leaves a stump');
  // the stump is synced to clients near it
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    check(!!snap.st?.includes(`${t.x},${t.y},0`), 'the snapshot lists stumps nearby');
    applySnapshot(mirror, snap);
    check(mirror.world.getObj(t.x, t.y, 0) === Obj.Stump && mirror.stumpOrigin(t.x, t.y, 0) === Obj.Tree, 'clients show the stump');
  }
  run(g, 50, () => w.getObj(t.x, t.y, 0) === Obj.Tree);
  check(w.getObj(t.x, t.y, 0) === Obj.Tree, 'the stump grows back into a tree');
  const snap2 = buildSnapshot(g, s);
  if (snap2.t === 'snap') {
    applySnapshot(mirror, snap2);
    check(mirror.world.getObj(t.x, t.y, 0) === Obj.Tree, 'clients see it grow back');
  }
  // moving stops chopping
  executeCommand(g, pid, { c: 'useTile', x: t.x, y: t.y });
  run(g, 0.3);
  check(p.chop !== null, 'chopping again');
  executeCommand(g, pid, { c: 'moveTo', x: p.x + (p.x - t.x || 1) * 3, y: p.y + (p.y - t.y) * 3 });
  run(g, 0.3);
  check(p.chop === null, 'walking away stops chopping');
  // the level gate
  const pine = findTree(Obj.Pine)!;
  g.teleport(p, pine.sx, pine.sy, 0);
  for (const e of g.enemies) if (!e.dead && Math.abs(e.x - p.x) < 12 && Math.abs(e.y - p.y) < 12) { e.dead = true; e.respawnTimer = 1e9; }
  msgs.length = 0;
  executeCommand(g, pid, { c: 'useTile', x: pine.x, y: pine.y });
  run(g, 0.5);
  check(msgs.some((m) => m === 'You need woodcutting level 15 to chop a pine.') && p.chop === null, 'pines need woodcutting level 15');
  s.woodcutting = gatherXpForLevel(15);
  executeCommand(g, pid, { c: 'useTile', x: pine.x, y: pine.y });
  run(g, 200, () => s.inventory.count('pine_logs') > 0);
  check(s.inventory.count('pine_logs') >= 1 && s.woodcutting === gatherXpForLevel(15) + TREES[Obj.Pine]!.xp, 'at level 15 pines give pine logs');
  check(TREES[Obj.JungleTree]!.level === 35 && TREES[Obj.Palm]!.level === 25 && TREES[Obj.JungleTree]!.log === 'teak_logs', 'teak (35) and palm (25) tiers');
  // attacking stops chopping
  executeCommand(g, pid, { c: 'useTile', x: pine.x, y: pine.y });
  run(g, 0.3);
  if (w.getObj(pine.x, pine.y, 0) === Obj.Pine) {
    const foe = enemyNear(g, 'rat', p, -1, 0);
    executeCommand(g, pid, { c: 'attack', id: foe.id });
    run(g, 0.2);
    check(p.chop === null, 'attacking stops chopping');
  } else check(true, 'attacking stops chopping (tree fell first, skipped)');
  // selling logs to a trader
  const aldric = g.npcs.find((n) => n.key === 'aldric')!;
  g.teleport(p, aldric.x, aldric.y + 1, aldric.z);
  s.inventory.removeById('logs', s.inventory.count('logs'));
  s.inventory.add('logs', 10);
  g.commandTalk(pid, aldric.id);
  run(g, 2, () => !!s.dialogue);
  const gold0 = s.inventory.count('gold');
  g.dialogueAction(pid, 'sell:logs:10');
  check(!!NPCS.aldric.buys?.includes('logs'), 'general traders list logs among what they buy');
  check(s.inventory.count('logs') === 0 && s.inventory.count('gold') === gold0 + 10 * ITEMS.logs.value, `traders buy logs (${10 * ITEMS.logs.value} gold for 10)`);
}

console.log('Fishing');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  const w = g.world;
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === pid) msgs.push(e.text); });
  const casts: boolean[] = [];
  g.events.on((e) => { if (e.type === 'fish' && e.id === pid) casts.push(e.got); });
  /** A free shore tile next to water that matches `want`. */
  const findShore = (want: (x: number, y: number) => boolean): { x: number; y: number; wx: number; wy: number } | null => {
    for (let y = 40; y < w.height - 40; y++) for (let x = 40; x < w.width - 40; x++) {
      if (!isFishingWater(w, x, y, 0) || !want(x, y)) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (w.isWalkable(x + dx, y + dy, 0) && !w.linkAt(x + dx, y + dy, 0) && !g.isOccupied(x + dx, y + dy, 0)) return { x: x + dx, y: y + dy, wx: x, wy: y };
      }
    }
    return null;
  };
  const clearFoes = () => { for (const e of g.enemies) if (!e.dead && Math.abs(e.x - p.x) < 14 && Math.abs(e.y - p.y) < 14) { e.dead = true; e.respawnTimer = 1e9; } };
  const deep = (x: number, y: number) => w.getGround(x, y, 0) === 16;
  const sh = findShore((x, y) => !deep(x, y) && !isColdWater(w, x, y, 0))!;
  const dp = findShore((x, y) => deep(x, y) && !isColdWater(w, x, y, 0))!;
  const cold = findShore((x, y) => isColdWater(w, x, y, 0))!;
  check(!!sh && !!dp && !!cold, 'the world has shallow, deep and icy water by the shore');
  check(gatherXpForLevel(2) === 83 && FISH.map((f) => f.level).join() === '1,10,20,30,40,50', 'fishing tiers at levels 1, 10, 20, 30, 40, 50 on the 1–99 curve');
  // which fish live where
  const names = (x: number, y: number, lvl: number) => fishFor(w, x, y, 0, lvl).map((f) => f.item);
  check(names(dp.wx, dp.wy, 1).join() === 'fish', 'at level 1 only small fish bite');
  check(names(dp.wx, dp.wy, 99).includes('swordfish') && !names(sh.wx, sh.wy, 99).includes('swordfish'), 'swordfish only in deep water');
  check(names(sh.wx, sh.wy, 99).includes('salmon') && !names(dp.wx, dp.wy, 99).includes('salmon'), 'salmon only in shallow water');
  check(names(cold.wx, cold.wy, 99).includes('ice_fish') && !names(sh.wx, sh.wy, 99).includes('ice_fish'), 'ice fish only near snow and ice');
  check(names(sh.wx, sh.wy, 25).join() === 'pike,trout,fish', 'level 25 in shallow water: pike, trout, small fish');
  check(biteChance(30, 12) < biteChance(30, 0), 'a fished-out spot bites less');

  g.teleport(p, sh.x, sh.y, 0);
  p.god = true;
  clearFoes();
  check(!g.isUsable(sh.wx, sh.wy, 0), 'without a rod water is not usable');
  executeCommand(g, pid, { c: 'useTile', x: sh.wx, y: sh.wy });
  run(g, 0.5);
  check(msgs.some((m) => m.startsWith('You need a fishing rod')) && p.fish === null, 'no rod, no fishing');
  s.inventory.add('fishing_rod', 1);
  check(g.isUsable(sh.wx, sh.wy, 0), 'with a rod, nearby water can be used (fished)');
  const caught = () => FISH_ITEMS.reduce((n, id) => n + s.inventory.count(id), 0);
  executeCommand(g, pid, { c: 'useTile', x: sh.wx, y: sh.wy });
  run(g, 0.2);
  check(p.fish !== null && p.x === sh.x && p.y === sh.y, 'fishing starts without walking');
  run(g, 200, () => caught() > 0);
  check(s.inventory.count('fish') === 1 && s.fishing >= FISH[0].xp && casts.length > 0, `fishing gives fish and fishing experience (${casts.length} casts, ${s.fishing} xp)`);
  check(p.fish !== null, 'you keep fishing after a catch');
  // level gate: many casts at level 1 in deep water never land anything better than small fish
  g.teleport(p, dp.x, dp.y, 0);
  clearFoes();
  s.fishing = 0;
  for (const id of FISH_ITEMS) s.inventory.removeById(id, s.inventory.count(id));
  s.inventory.removeById('old_boot', s.inventory.count('old_boot'));
  p.capacity = 1e6;
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 240, () => s.inventory.count('fish') >= 6);
  check(s.inventory.count('fish') >= 1 && FISH_ITEMS.slice(1).every((id) => s.inventory.count(id) === 0), `no swordfish (or any better fish) at level 1 (${s.inventory.count('fish')} small fish)`);
  // at level 50 in deep water swordfish bite
  s.fishing = gatherXpForLevel(50);
  for (const id of FISH_ITEMS) s.inventory.removeById(id, s.inventory.count(id));
  g.teleport(p, dp.x, dp.y, 0);
  clearFoes();
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 900, () => s.inventory.count('swordfish') > 0);
  check(s.inventory.count('swordfish') > 0 && s.inventory.count('salmon') === 0 && s.inventory.count('pike') === 0, 'at level 50 deep water gives swordfish (never salmon or pike)');
  // range: water further than 3 tiles is refused
  msgs.length = 0;
  const far = (() => { for (let r = FISH_RANGE + 1; r < 12; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (isFishingWater(w, p.x + dx, p.y + dy, 0)) return { x: p.x + dx, y: p.y + dy }; return null; })();
  if (far) {
    executeCommand(g, pid, { c: 'useTile', x: far.x, y: far.y });
    run(g, 0.3);
    check(msgs.some((m) => m.startsWith('The water is too far away')) && !g.isUsable(far.x, far.y, 0), 'water more than 3 tiles away cannot be fished');
  } else check(true, 'far water check skipped (none in a straight line)');
  // moving stops fishing
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 0.3);
  check(p.fish !== null, 'fishing again');
  const away = [[dp.x - dp.wx, dp.y - dp.wy]].map(([dx, dy]) => ({ x: dp.x + dx * 3, y: dp.y + dy * 3 }))[0];
  executeCommand(g, pid, { c: 'moveTo', x: away.x, y: away.y });
  run(g, 0.4);
  check(p.fish === null, 'walking away stops fishing');
  // attacking stops fishing
  g.teleport(p, dp.x, dp.y, 0);
  clearFoes();
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 0.3);
  const foe = enemyNear(g, 'rat', p, dp.x === dp.wx ? 1 : 0, dp.x === dp.wx ? 0 : 1);
  executeCommand(g, pid, { c: 'attack', id: foe.id });
  run(g, 0.2);
  check(p.fish === null, 'attacking stops fishing');
  foe.dead = true;
  foe.respawnTimer = 1e9;
  // fish are food
  const hp0 = (p.hp = 50);
  s.inventory.removeById('trout', s.inventory.count('trout'));
  s.inventory.add('trout', 1);
  msgs.length = 0;
  g.useItem(pid, 'trout');
  check(p.hp > hp0 && s.inventory.count('trout') === 0, `fish can be eaten${msgs.length ? ` (${msgs.join(' | ')})` : ''}`);
  // admin, save, migration, snapshot
  s.admin = true;
  g.say(pid, '/skill fishing 30');
  check(g.fishingLevel(s) === 30, '/skill fishing sets fishing');
  g.say(pid, '/fishing 42');
  check(g.fishingLevel(s) === 42, '/fishing N sets fishing');
  const data = g.serialize(pid);
  check(data.version === SAVE_VERSION && SAVE_VERSION === 7 && data.gathering?.fishing === s.fishing, 'saves carry fishing experience (save v7)');
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.fishing === s.fishing && t2.s.woodcutting === s.woodcutting, 'fishing survives save and load');
  const v6 = JSON.parse(JSON.stringify({ ...data, version: 6, gathering: { woodcutting: 1234 } })) as Record<string, unknown>;
  const mig = migrateSave(v6);
  check(typeof mig !== 'string' && mig.from === 6 && mig.data.version === 7 && mig.data.gathering?.fishing === 0 && mig.data.gathering?.woodcutting === 1234, 'a v6 save migrates: fishing 0, woodcutting kept');
  const t3 = solo('knight');
  check(t3.g.applySave(t3.pid, v6) && t3.s.fishing === 0 && t3.s.woodcutting === 1234 && t3.s.inventory.count('fishing_rod') === s.inventory.count('fishing_rod'), 'a migrated v6 character loads with its items and woodcutting');
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    check(snap.self.fx === Math.floor(s.fishing), 'the snapshot carries fishing (fx)');
    applySnapshot(mirror, snap);
    check(mirror.session(pid)!.fishing === Math.floor(s.fishing), 'clients get fishing experience');
  }
  // harbour captains buy the catch
  const captain = g.npcs.find((n) => NPCS[n.key]?.role === 'Ship captain')!;
  g.teleport(p, captain.x, captain.y + 1, captain.z);
  s.inventory.add('salmon', 5);
  const gold0 = s.inventory.count('gold');
  g.commandTalk(pid, captain.id);
  run(g, 2, () => !!s.dialogue);
  g.dialogueAction(pid, 'sell:salmon:5');
  check(s.inventory.count('salmon') === 0 && s.inventory.count('gold') === gold0 + 5 * ITEMS.salmon.value, `harbour captains buy fish (${5 * ITEMS.salmon.value} gold for 5 salmon)`);
}

console.log('Player market');
{
  const g = new Game();
  const changes: MarketChange[] = [];
  g.marketSink = (c) => changes.push(JSON.parse(JSON.stringify(c)) as MarketChange);
  const w = g.world;
  const board = (() => { for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) if (w.getObj(x, y, 0) === Obj.MarketBoard) return { x, y }; return null; })()!;
  check(!!board, 'there is a market board');
  const stand = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: board.x + dx, y: board.y + dy })).filter((t) => w.isWalkable(t.x, t.y, 0));
  const a = g.addPlayer('Seller', { vocation: 'knight' });
  const b = g.addPlayer('Buyer', { vocation: 'druid' });
  g.teleport(a.player, stand[0].x, stand[0].y, 0);
  g.teleport(b.player, stand[1 % stand.length].x, stand[1 % stand.length].y, 0);
  const am: string[] = [], bm: string[] = [];
  g.events.on((e) => { if (e.type === 'message') (e.to === a.id ? am : e.to === b.id ? bm : []).push(e.text); });
  executeCommand(g, a.id, { c: 'useTile', x: board.x, y: board.y });
  executeCommand(g, b.id, { c: 'useTile', x: board.x, y: board.y });
  run(g, 1.5, () => !!a.marketOpen && !!b.marketOpen);
  check(!!a.marketOpen && !!b.marketOpen && !!g.marketView(a.id), 'using the board opens the market');
  a.bank = 1000;
  a.depot[0] = { id: 'wolf_pelt', qty: 5 };
  a.inventory.add('rat_tail', 3);
  executeCommand(g, a.id, { c: 'marketSell', from: 'depot', index: 0, qty: 5, price: 100 });
  const offer = [...g.market.offers.values()][0];
  check(!!offer && offer.qty === 5 && offer.price === 100 && offer.seller === 'seller' && a.depot[0] === null, 'listing moves the items from the depot into escrow');
  check(a.bank === 995, `the fee is 1% of the total, from the bank (bank ${a.bank})`);
  check(changes.length === 1 && changes[0].putOffers.length === 1 && changes[0].save.includes(a.id), 'the new offer is stored before the seller is saved');
  const ratSlot = a.inventory.slots.findIndex((x) => x?.id === 'rat_tail');
  executeCommand(g, a.id, { c: 'marketSell', from: 'inv', index: ratSlot, qty: 1, price: 3 });
  check(a.bank === 994 && a.inventory.count('rat_tail') === 2, 'small sales still cost 1 gold, from the backpack too');
  executeCommand(g, a.id, { c: 'marketBuy', id: offer.id, qty: 1 });
  check(am.some((m) => m.startsWith('That is your own offer')) && offer.qty === 5, 'you cannot buy your own offer');
  // buyer pays from the bank, items go to the depot, seller (online) gets gold in the bank
  b.bank = 300;
  executeCommand(g, b.id, { c: 'marketBuy', id: offer.id, qty: 3 });
  check(b.bank === 0 && b.depot.some((x) => x?.id === 'wolf_pelt' && x.qty === 3) && offer.qty === 2 && a.bank === 1294, `buying: gold from the bank, items into the depot, gold to the seller's bank (seller bank ${a.bank})`);
  check(changes[changes.length - 1].shrinkOffers.length === 1 && changes[changes.length - 1].save.includes(b.id) && changes[changes.length - 1].save.includes(a.id), 'a partly bought offer is stored after both characters');
  executeCommand(g, b.id, { c: 'marketBuy', id: offer.id, qty: 2 });
  check(offer.qty === 2 && bm.some((m) => m.startsWith('That costs')), 'no gold, no purchase');
  // cancel returns the items
  const rat = [...g.market.offers.values()].find((o) => o.item === 'rat_tail')!;
  executeCommand(g, a.id, { c: 'marketCancel', id: rat.id });
  check(!g.market.offers.has(rat.id) && a.depot.some((x) => x?.id === 'rat_tail' && x.qty === 1), 'cancelling returns the items to the depot');
  executeCommand(g, b.id, { c: 'marketCancel', id: offer.id });
  check(g.market.offers.has(offer.id), 'only the seller can cancel');
  // the market list reaches the client only when it changes
  const s1 = buildSnapshot(g, b), s2 = buildSnapshot(g, b);
  if (s1.t === 'snap' && s2.t === 'snap') {
    check(!!s1.self.mk?.offers.some((o) => o.id === offer.id && !o.mine) && s2.self.mk === undefined, 'market view is sent once, then only on changes');
    const mirror = new Game({ simulate: false });
    const extras = { depot: null, trade: null, market: null as unknown };
    applySnapshot(mirror, buildSnapshot(g, b) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>, extras as never);
  }
  // the seller goes offline; a sale is paid out at the next login
  const saved = g.serialize(a.id);
  g.removePlayer(a.id);
  b.inventory.add('gold', 200);
  const carriedBefore = b.inventory.count('gold');
  executeCommand(g, b.id, { c: 'marketBuy', id: offer.id, qty: 2 });
  const del = [...g.market.deliveries.values()][0];
  check(!g.market.offers.has(offer.id) && b.inventory.count('gold') === carriedBefore - 200 && !!del && del.to === 'seller' && del.gold === 200, 'an offline seller is owed the gold as a delivery (carried gold used when the bank is short)');
  const last = changes[changes.length - 1];
  check(last.putDeliveries.length === 1 && last.dropOffers.includes(offer.id), 'the delivery is stored, and the sold-out offer removed after saving');
  const a2 = g.addPlayer('Seller', { vocation: 'knight' });
  g.applySave(a2.id, saved);
  check(a2.bank === 1294 + 200 && a2.marketClaimed.includes(del.id) && !g.market.deliveries.has(del.id), `the seller gets the gold at login (bank ${a2.bank})`);
  check(changes[changes.length - 1].dropDeliveries.includes(del.id) && changes[changes.length - 1].save.includes(a2.id), 'the delivery is removed only after the seller is saved');
  // a delivery that survived a crash is never paid twice
  g.market.deliveries.set(del.id, { ...del });
  g.claimMarketDeliveries(a2.id);
  check(a2.bank === 1494 && !g.market.deliveries.has(del.id), 'a delivery already received is not paid out twice');
  const after = g.serialize(a2.id);
  check(!!after.market?.claimed?.includes(del.id), 'received deliveries are remembered in the save');
  // expired offers come back (offline: as a delivery to the depot)
  let clock = Date.now();
  g.now = () => clock;
  b.depot[5] = { id: 'bone', qty: 4 };
  b.bank = 50;
  executeCommand(g, b.id, { c: 'marketSell', from: 'depot', index: 5, qty: 4, price: 10 });
  const bone = [...g.market.offers.values()].find((o) => o.item === 'bone')!;
  const bSave = g.serialize(b.id);
  g.removePlayer(b.id);
  clock += MARKET_OFFER_MS + 1000;
  run(g, 11);
  const back = [...g.market.deliveries.values()].find((d) => d.to === 'buyer');
  check(!g.market.offers.has(bone.id) && !!back && back.items[0]?.id === 'bone' && back.items[0].qty === 4, 'expired offers turn into a delivery for an offline seller');
  const b2 = g.addPlayer('Buyer', { vocation: 'druid' });
  g.applySave(b2.id, bSave);
  check(b2.depot.some((x) => x?.id === 'bone' && x.qty === 4), 'the items arrive in the depot at the next login');
  // closed market
  g.market.enabled = false;
  g.teleport(b2.player, stand[0].x, stand[0].y, 0);
  executeCommand(g, b2.id, { c: 'useTile', x: board.x, y: board.y });
  run(g, 1);
  b2.depot[6] = { id: 'bone', qty: 1 };
  executeCommand(g, b2.id, { c: 'marketSell', from: 'depot', index: 6, qty: 1, price: 10 });
  check(b2.depot[6]?.qty === 1, 'while the market is closed nothing can be listed');
  // walking away closes it
  g.market.enabled = true;
  g.teleport(b2.player, stand[0].x + 6, stand[0].y + 6, 0);
  check(!b2.marketOpen, 'moving away closes the market');
}

console.log('Follow and friends');
{
  const g = new Game();
  const a = g.addPlayer('Walker', { vocation: 'knight' });
  const b = g.addPlayer('Guide', { vocation: 'paladin' });
  const w = g.world;
  let at: [number, number] | null = null;
  for (let y = 300; y < 500 && !at; y++) for (let x = 100; x < 500; x++) {
    let ok = true;
    for (let dx = -1; dx <= 12 && ok; dx++) if (!w.isWalkable(x + dx, y, 0) || w.getObj(x + dx, y, 0) !== 0) ok = false;
    if (ok) { at = [x, y]; break; }
  }
  g.teleport(a.player, at![0], at![1], 0);
  g.teleport(b.player, at![0] + 2, at![1], 0);
  executeCommand(g, a.id, { c: 'follow', id: b.id });
  g.teleport(b.player, at![0] + 10, at![1], 0);
  for (let i = 0; i < 120; i++) g.update(0.05);
  check(chebyshev(a.player.x, a.player.y, b.player.x, b.player.y) <= 1, 'follow walks after the other player');
  executeCommand(g, a.id, { c: 'friendRequest', id: b.id });
  check(g.friendsView(b.id).requests.some((r) => r.id === a.id), 'friend request arrives');
  executeCommand(g, b.id, { c: 'friendAccept', id: a.id });
  check(g.friendsView(a.id).friends.some((f) => f.name === 'Guide' && f.online) && g.friendsView(b.id).friends.some((f) => f.name === 'Walker'), 'accepted friends see each other online');
  const save = g.serialize(a.id);
  check(save.friends?.includes('Guide') === true && save.version === SAVE_VERSION, 'friends are saved');
  const old = { ...save, version: 5 } as Record<string, unknown>;
  delete old.friends;
  const mig = migrateSave(old);
  check(typeof mig !== 'string' && Array.isArray(mig.data.friends) && mig.data.friends.length === 0, 'older saves get an empty friends list');
  executeCommand(g, a.id, { c: 'friendRemove', name: 'guide' });
  check(g.friendsView(a.id).friends.length === 0, 'remove a friend');
}

console.log(failures === 0 ? '\nAll logic checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
