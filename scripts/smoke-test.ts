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
import { applySnapshot, buildSnapshot, executeCommand, PROTOCOL_VERSION } from '../src/game/net/protocol';
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
import { biteChance, FISH, FISH_RANGE, fishFor, isColdWater, isFishingWater, RAW_FISH_ITEMS } from '../src/game/gathering/fishing';
import { MARKET_OFFER_MS, type MarketChange } from '../src/game/market/market';
import { mineChance, ORES, oreAt, rollGem } from '../src/game/gathering/mining';
import { recipeById, recipeChance } from '../src/game/production/recipes';
import type { MirrorExtras } from '../src/game/net/protocol';
import { FISH_ITEMS } from '../src/game/gathering/fishing';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { FOODS } from '../src/game/production/cooking';
import { TOWNS } from '../src/game/world/townList';
import { appearanceFromOutfit, BEARDS, decodeAppearance, encodeAppearance, isAppearance, randomAppearance, sanitizeAppearance, SCARS, type Appearance } from '../src/game/player/appearance';
import { PALETTE } from '../src/game/player/outfits';
import {
  extendPremium, FREE_DEPOT_SLOTS, FREE_MARKET_OFFERS, FREE_TOWNS, LAUNCH_AT, NO_PERKS, PREMIUM_DEPOT_SLOTS, PREMIUM_MARKET_OFFERS, PRODUCTS,
} from '../src/game/premium/premium';
import { EQUIP_SLOTS, equipSlotFor, itemDef } from '../src/game/inventory/items';
import { stepNo, TUTORIAL_LAST, TUTORIAL_STEPS } from '../src/game/tutorial/tutorial';
import { ISLE, ISLE_CAPTAIN, ISLE_CELLAR_HOLE, ISLE_CHEST, ISLE_DEST, ISLE_GUIDE, ISLE_REST, ISLE_ROPE_SPOT, ISLE_START, ISLE_TRADER, onIsle } from '../src/game/world/tutorialIsle';

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
  {
    const t = new WorldMap(4, 4);
    t.setObj(2, 1, Obj.Tree); t.setObj(1, 2, Obj.Bush);
    check(t.canStep(1, 1, 0, 1, 1), 'diagonal between a tree and a bush is allowed (classic movement)');
    t.setObj(2, 1, Obj.Wall); t.setObj(1, 2, Obj.Wall);
    check(!t.canStep(1, 1, 0, 1, 1), 'no squeezing diagonally through the seam of two walls');
  }
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
  run(g, 2.0); // level 1 walks about 1.8 tiles a second
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
  check(p.stepTime < p.baseStep * 0.95, `ring of swiftness speeds you up (step ${step0.toFixed(3)}s, base ${p.baseStep.toFixed(3)}s)`);
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
  const look: Appearance = { body: 'female', skin: 5, hair: 'braids', hairColor: 6, beard: 'none', build: 'slim', eyes: 3, top: 10, bottom: 13, scar: 'claw' };
  check(g.setAppearance(pid, look), 'appearance set');
  check(saves.save(g, pid), 'saved');
  const t = solo('knight');
  check(saves.load(t.g, t.pid), 'loaded');
  const s2 = t.s;
  check(s2.player.vocation === 'druid' && s2.player.level === s.player.level, 'vocation and level restored');
  check(s2.inventory.count('wolf_pelt') === 3 && s2.bank === 1234, 'backpack and bank restored');
  check(s2.spells.has('exura_sio') && s2.chests.has('watchtower'), 'spells and opened chests restored');
  check(s2.player.z === s.player.z, `floor restored (z=${s2.player.z})`);
  check(JSON.stringify(s2.player.appearance) === JSON.stringify(look), 'appearance restored after save and load');
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
  check(s.skills.axe.level === 55 && s.skills.magic.level === 7 && gatherLevelForXp(s.gathering.woodcutting) === 30, '/skill sets combat skills, magic level and woodcutting');
  g.say(pid, '/help');
  check(msgs.some((t) => t.startsWith('/skill')), '/help lists /skill');

  // save, load and the snapshot (own player only)
  const data = g.serialize(pid);
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.skills.axe.level === 55 && t2.s.skills.sword.level === s.skills.sword.level && t2.s.skills.sword.tries === s.skills.sword.tries && t2.s.gathering.woodcutting === s.gathering.woodcutting, 'skills and woodcutting survive save and load');
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    applySnapshot(mirror, snap);
    const ms = mirror.session(pid)!;
    check(ms.skills.axe.level === 55 && ms.skills.magic.level === 7 && ms.gathering.woodcutting === s.gathering.woodcutting, 'skills reach the client in the snapshot');
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
  check(k1.s.skills.sword.level === 10 && k1.s.skills.magic.level === 0 && k1.s.gathering.woodcutting === 0, 'level 1: starting skills');
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
  check(s.inventory.count('logs') === 1 && s.gathering.woodcutting === TREES[Obj.Tree]!.xp, `chopping gives logs and woodcutting experience (${chops.length} chops, ${s.gathering.woodcutting} xp)`);
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
  s.gathering.woodcutting = gatherXpForLevel(15);
  executeCommand(g, pid, { c: 'useTile', x: pine.x, y: pine.y });
  run(g, 200, () => s.inventory.count('pine_logs') > 0);
  check(s.inventory.count('pine_logs') >= 1 && s.gathering.woodcutting === gatherXpForLevel(15) + TREES[Obj.Pine]!.xp, 'at level 15 pines give pine logs');
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
  const caught = () => RAW_FISH_ITEMS.reduce((n, id) => n + s.inventory.count(id), 0);
  executeCommand(g, pid, { c: 'useTile', x: sh.wx, y: sh.wy });
  run(g, 0.2);
  check(p.fish !== null && p.x === sh.x && p.y === sh.y, 'fishing starts without walking');
  run(g, 200, () => caught() > 0);
  check(s.inventory.count('raw_fish') === 1 && s.gathering.fishing >= FISH[0].xp && casts.length > 0, `fishing gives raw fish and fishing experience (${casts.length} casts, ${s.gathering.fishing} xp)`);
  check(p.fish !== null, 'you keep fishing after a catch');
  // level gate: many casts at level 1 in deep water never land anything better than small fish
  g.teleport(p, dp.x, dp.y, 0);
  clearFoes();
  s.gathering.fishing = 0;
  for (const id of RAW_FISH_ITEMS) s.inventory.removeById(id, s.inventory.count(id));
  s.inventory.removeById('old_boot', s.inventory.count('old_boot'));
  p.capacity = 1e6;
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 240, () => s.inventory.count('raw_fish') >= 6);
  check(s.inventory.count('raw_fish') >= 1 && RAW_FISH_ITEMS.slice(1).every((id) => s.inventory.count(id) === 0), `no swordfish (or any better fish) at level 1 (${s.inventory.count('raw_fish')} small fish)`);
  // at level 50 in deep water swordfish bite
  s.gathering.fishing = gatherXpForLevel(50);
  for (const id of RAW_FISH_ITEMS) s.inventory.removeById(id, s.inventory.count(id));
  g.teleport(p, dp.x, dp.y, 0);
  clearFoes();
  executeCommand(g, pid, { c: 'useTile', x: dp.wx, y: dp.wy });
  run(g, 900, () => s.inventory.count('raw_swordfish') > 0);
  check(s.inventory.count('raw_swordfish') > 0 && s.inventory.count('raw_salmon') === 0 && s.inventory.count('raw_pike') === 0, 'at level 50 deep water gives (raw) swordfish (never salmon or pike)');
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
  check(data.version === SAVE_VERSION && SAVE_VERSION >= 7 && data.gathering?.fishing === s.gathering.fishing, 'saves carry fishing experience (save v7)');
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.gathering.fishing === s.gathering.fishing && t2.s.gathering.woodcutting === s.gathering.woodcutting, 'fishing survives save and load');
  const v6 = JSON.parse(JSON.stringify({ ...data, version: 6, gathering: { woodcutting: 1234 } })) as Record<string, unknown>;
  const mig = migrateSave(v6);
  check(typeof mig !== 'string' && mig.from === 6 && mig.data.version === SAVE_VERSION && mig.data.gathering?.fishing === 0 && mig.data.gathering?.woodcutting === 1234, 'a v6 save migrates: fishing 0, woodcutting kept');
  const t3 = solo('knight');
  check(t3.g.applySave(t3.pid, v6) && t3.s.gathering.fishing === 0 && t3.s.gathering.woodcutting === 1234 && t3.s.inventory.count('fishing_rod') === s.inventory.count('fishing_rod'), 'a migrated v6 character loads with its items and woodcutting');
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    check(snap.self.gx?.fishing === Math.floor(s.gathering.fishing), 'the snapshot carries fishing (gx)');
    applySnapshot(mirror, snap);
    check(mirror.session(pid)!.gathering.fishing === Math.floor(s.gathering.fishing), 'clients get fishing experience');
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
    // (not on the tutorial island: its rat meadow is crowded)
    if (ok && !onIsle(x, y, 0)) { at = [x, y]; break; }
  }
  g.teleport(a.player, at![0], at![1], 0);
  g.teleport(b.player, at![0] + 2, at![1], 0);
  a.player.god = b.player.god = true; // monsters nearby must not end the walk
  executeCommand(g, a.id, { c: 'follow', id: b.id });
  g.teleport(b.player, at![0] + 10, at![1], 0);
  for (let i = 0; i < 260; i++) g.update(0.05); // level 1 walks ~1.8 tiles/s
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

console.log('Test mode (server ALLOW_ADMIN): everything but god mode');
{
  const { g, s, pid } = solo('sorcerer');
  s.admin = true;
  s.testOnly = true;
  g.say(pid, '/level 50');
  g.say(pid, '/spells');
  g.say(pid, '/god');
  check(s.player.level === 50 && s.spells.size > 10, 'test mode: levels and spells work');
  check(!s.player.god, 'test mode: no god mode');
  s.testOnly = false;
  g.say(pid, '/god');
  check(s.player.god, 'full admins still have god mode');
}

console.log('Game master warnings');
{
  const g = new Game();
  const gm = g.addPlayer('Keeper', { vocation: 'knight' });
  const oscar = g.addPlayer('Oscar', { vocation: 'druid' });
  gm.admin = true;
  const got: string[] = [];
  g.events.on((e) => { if (e.type === 'adminNotice' && e.to === oscar.id) got.push(e.title + ': ' + e.text); });
  gm.testOnly = true;
  g.say(gm.id, '/warn Oscar, corrupt behaviour');
  check(got.length === 0, 'test-mode players cannot send warnings');
  gm.testOnly = false;
  g.say(gm.id, '/warn Oscar, This is a warning from the Admin for corrupt behaviour.');
  check(got.length === 1 && got[0].includes('corrupt behaviour') && got[0].startsWith('Warning from the Admin'), 'a game master warning pops up for that player');
}

console.log('Mining and blacksmithing');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  const w = g.world;
  p.god = true;
  s.admin = true;
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === pid) msgs.push(e.text); });
  g.localId = pid;
  /** An object of this kind with a free tile beside it (z any). */
  const findObj = (o: Obj, zs = [0, -1, -2, -3]): { x: number; y: number; z: number; sx: number; sy: number } | null => {
    for (const z of zs) for (let y = 2; y < w.height - 2; y++) for (let x = 2; x < w.width - 2; x++) {
      if (w.getObj(x, y, z) !== o) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (w.isWalkable(x + dx, y + dy, z) && !w.linkAt(x + dx, y + dy, z) && !g.isOccupied(x + dx, y + dy, z)) return { x, y, z, sx: x + dx, sy: y + dy };
      }
    }
    return null;
  };
  const go = (t: { z: number; sx: number; sy: number }) => {
    g.teleport(p, t.sx, t.sy, t.z);
    for (const e of g.enemies) if (!e.dead && e.z === t.z && Math.abs(e.x - p.x) < 14 && Math.abs(e.y - p.y) < 14) { e.dead = true; e.respawnTimer = 1e9; }
  };
  const copper = findObj(Obj.CopperRock, [0])!;
  check(!!copper, 'copper rocks exist on the surface');
  go(copper);
  executeCommand(g, pid, { c: 'useTile', x: copper.x, y: copper.y });
  run(g, 0.5);
  check(msgs.some((m) => m.startsWith('You need a pickaxe')) && p.mine === null, 'no pickaxe, no mining');
  check(!g.isUsable(copper.x, copper.y, copper.z), 'without a pickaxe an ore rock is not usable');
  s.inventory.add('bronze_pickaxe', 1);
  check(g.isUsable(copper.x, copper.y, copper.z), 'with a pickaxe ore rocks can be used (mined)');
  const swings: GameEvent[] = [];
  g.events.on((e) => { if (e.type === 'mine' && e.id === pid) swings.push(e); });
  executeCommand(g, pid, { c: 'useTile', x: copper.x, y: copper.y });
  run(g, 120, () => s.inventory.count('copper_ore') > 0);
  const copperDef = ORES.find((o) => o.obj === Obj.CopperRock)!;
  check(s.inventory.count('copper_ore') === 1 && s.gathering.mining === copperDef.xp, `mining gives ore and mining experience (${swings.length} swings, ${s.gathering.mining} xp)`);
  check(w.getObj(copper.x, copper.y, copper.z) === Obj.DepletedRock && !w.isWalkable(copper.x, copper.y, copper.z) && g.stumpOrigin(copper.x, copper.y, copper.z) === Obj.CopperRock && p.mine === null, 'the rock is mined out (rubble) and mining stops');
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  if (snap.t === 'snap') {
    check(!!snap.st?.includes(`${copper.x},${copper.y},${copper.z}`), 'the snapshot lists mined-out rocks nearby');
    applySnapshot(mirror, snap);
    check(mirror.world.getObj(copper.x, copper.y, copper.z) === Obj.DepletedRock && mirror.stumpOrigin(copper.x, copper.y, copper.z) === Obj.CopperRock, 'clients show the rubble');
    check(snap.self.gx?.mining === Math.floor(s.gathering.mining) && mirror.session(pid)!.gathering.mining === Math.floor(s.gathering.mining), 'clients get mining experience (gx)');
  }
  executeCommand(g, pid, { c: 'useTile', x: copper.x, y: copper.y });
  run(g, 0.3);
  check(msgs.some((m) => m.startsWith('There is no ore left')), 'rubble cannot be mined');
  run(g, copperDef.respawn[1] + 1, () => w.getObj(copper.x, copper.y, copper.z) === Obj.CopperRock);
  check(w.getObj(copper.x, copper.y, copper.z) === Obj.CopperRock, 'the rock fills with ore again');
  const snap2 = buildSnapshot(g, s);
  if (snap2.t === 'snap') {
    applySnapshot(mirror, snap2);
    check(mirror.world.getObj(copper.x, copper.y, copper.z) === Obj.CopperRock, 'clients see it refill');
  }
  // walking stops mining
  executeCommand(g, pid, { c: 'useTile', x: copper.x, y: copper.y });
  run(g, 0.3);
  check(p.mine !== null, 'mining again');
  executeCommand(g, pid, { c: 'moveTo', x: p.x + (p.x - copper.x || 1) * 3, y: p.y + (p.y - copper.y) * 3 });
  run(g, 0.3);
  check(p.mine === null, 'walking away stops mining');
  // level gates
  const iron = findObj(Obj.IronRock)!;
  go(iron);
  msgs.length = 0;
  executeCommand(g, pid, { c: 'useTile', x: iron.x, y: iron.y });
  run(g, 0.5);
  check(msgs.includes('You need mining level 15 to mine a iron rock.') || msgs.some((m) => m.startsWith('You need mining level 15')), 'iron needs mining level 15');
  check(p.mine === null, 'and nothing is mined below it');
  g.say(pid, '/mining 15');
  check(g.miningLevel(s) === 15, '/mining N sets mining');
  executeCommand(g, pid, { c: 'useTile', x: iron.x, y: iron.y });
  run(g, 200, () => s.inventory.count('iron_ore') > 0);
  check(s.inventory.count('iron_ore') >= 1, 'at mining 15 iron rocks give iron ore');
  // pickaxes have their own level
  s.inventory.removeById('bronze_pickaxe', 9);
  s.inventory.add('starsteel_pickaxe', 1);
  g.say(pid, '/skill mining 1');
  check(g.miningLevel(s) === 1 && g.bestPickaxe(s) === null, '/skill mining N works; a starsteel pickaxe needs mining 45');
  s.inventory.add('bronze_pickaxe', 1);
  g.say(pid, '/skill mining 45');
  check(g.bestPickaxe(s)?.item === 'starsteel_pickaxe', 'the best usable pickaxe is used');
  check(mineChance(30, ORES[2], 4) > mineChance(30, ORES[2], 1) && mineChance(60, ORES[2], 1) > mineChance(20, ORES[2], 1), 'better pickaxes and higher levels mine faster');
  check(ORES.map((o) => o.level).join() === '1,1,15,30,40,50,60,75', 'ore levels 1, 1, 15, 30, 40, 50, 60, 75');
  check(rollGem(() => 0) === 'small_sapphire' && rollGem(() => 0.999) === 'small_diamond', 'gems can come out of rocks');
  check(oreAt(Obj.DarkstoneRock)?.ore === 'darkstone_ore' && oreAt(Obj.Rock) === null, 'plain boulders hold no ore');

  // ---- smelting at a furnace
  const furnace = findObj(Obj.Furnace, [0])!;
  check(!!furnace, 'furnaces exist in smithies');
  go(furnace);
  executeCommand(g, pid, { c: 'useTile', x: furnace.x, y: furnace.y });
  run(g, 0.5);
  const fv = g.craftView(pid);
  check(fv?.station === 'furnace' && fv.recipes.some((r) => r.id === 'smelt:bronze_bar'), 'using a furnace opens the smelting window');
  const extras: MirrorExtras = { depot: null, trade: null, market: null, craft: null };
  const snap3 = buildSnapshot(g, s);
  if (snap3.t === 'snap') {
    check(snap3.self.cw?.station === 'furnace', 'the snapshot carries the station window (cw)');
    const m2 = new Game({ simulate: false });
    applySnapshot(m2, snap3, extras);
    check(extras.craft?.station === 'furnace' && extras.craft.recipes.length > 5, 'clients get the station window');
    const again = buildSnapshot(g, s);
    check(again.t === 'snap' && again.self.cw === undefined, 'an unchanged window is not sent again');
  }
  s.inventory.removeById('copper_ore', 99);
  s.inventory.add('copper_ore', 3);
  s.inventory.add('tin_ore', 3);
  const smithXp0 = s.gathering.smithing;
  executeCommand(g, pid, { c: 'craft', recipe: 'smelt:bronze_bar', count: 3 });
  check(p.craft?.left === 3, 'Make 3 starts a batch');
  run(g, 20, () => p.craft === null);
  check(s.inventory.count('bronze_bar') === 3 && s.inventory.count('copper_ore') === 0 && s.inventory.count('tin_ore') === 0, 'smelting uses copper and tin and gives bronze bars');
  check(s.gathering.smithing === smithXp0 + 3 * recipeById('smelt:bronze_bar')!.xp, 'smelting gives blacksmithing experience');
  s.inventory.add('iron_ore', 2);
  s.inventory.add('coal', 4);
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'smelt:steel_bar', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need blacksmithing level 30')), 'steel needs blacksmithing level 30');
  check(recipeChance(recipeById('smelt:iron_bar')!, 15) === 0.5 && recipeChance(recipeById('smelt:iron_bar')!, 40) === 1, 'iron smelting can fail at low level');
  executeCommand(g, pid, { c: 'craftClose' });
  check(g.craftView(pid) === null, 'the window closes');

  // ---- smithing at an anvil
  const anvil = findObj(Obj.Anvil, [0])!;
  check(!!anvil && chebyshev(anvil.x, anvil.y, furnace.x, furnace.y) <= 6, 'every furnace has an anvil nearby');
  go(anvil);
  msgs.length = 0;
  executeCommand(g, pid, { c: 'useTile', x: anvil.x, y: anvil.y });
  run(g, 0.5);
  check(g.craftView(pid)?.station === 'anvil' && msgs.some((m) => m.includes("smith's hammer")), 'the anvil opens and asks for a hammer');
  executeCommand(g, pid, { c: 'craft', recipe: 'smith:short_sword', count: 1 });
  check(p.craft === null, 'no hammer, no smithing');
  s.inventory.add('smithing_hammer', 1);
  const swords0 = s.inventory.count('short_sword');
  const xp1 = s.gathering.smithing;
  g.say(pid, '/smithing 10');
  check(g.skillLevel(s, 'smithing') === 10, '/smithing N sets blacksmithing');
  const xp10 = s.gathering.smithing;
  executeCommand(g, pid, { c: 'craft', recipe: 'smith:short_sword', count: 1 });
  run(g, 10, () => p.craft === null);
  check(s.inventory.count('short_sword') === swords0 + 1 && s.inventory.count('bronze_bar') === 1, 'smithing two bronze bars makes a short sword');
  check(s.gathering.smithing === xp10 + recipeById('smith:short_sword')!.xp && xp10 > xp1, 'smithing gives blacksmithing experience');
  s.inventory.add('iron_bar', 4);
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'smith:iron_sword', count: 1 });
  check(p.craft === null && s.inventory.count('iron_bar') === 4 && msgs.some((m) => m.startsWith('You need blacksmithing level 21')), 'iron swords need blacksmithing 21');
  // making many, interrupted by walking
  s.inventory.add('bronze_bar', 4);
  executeCommand(g, pid, { c: 'craft', recipe: 'smith:bronze_dagger', count: 5 });
  run(g, 3, () => s.inventory.count('bronze_dagger') >= 1);
  check(s.inventory.count('bronze_dagger') === 1 && p.craft?.left === 4, 'Make X goes on one item at a time');
  executeCommand(g, pid, { c: 'moveTo', x: p.x + (p.x - anvil.x || 1) * 3, y: p.y + (p.y - anvil.y) * 3 });
  run(g, 3);
  check(p.craft === null && g.craftView(pid) === null && s.inventory.count('bronze_dagger') === 1, 'walking away stops the work and closes the window');

  // ---- save, load and migration
  const data = g.serialize(pid);
  check(SAVE_VERSION >= 8 && data.version === SAVE_VERSION && data.gathering?.mining === s.gathering.mining && data.gathering?.smithing === s.gathering.smithing, 'saves carry mining and blacksmithing (save v8)');
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.gathering.mining === s.gathering.mining && t2.s.gathering.smithing === s.gathering.smithing && t2.s.inventory.count('bronze_dagger') === 1, 'mining and blacksmithing survive save and load');
  const v7 = JSON.parse(JSON.stringify({ ...data, version: 7, gathering: { woodcutting: 4321, fishing: 777 } })) as Record<string, unknown>;
  const mig = migrateSave(v7);
  check(typeof mig !== 'string' && mig.from === 7 && mig.data.version === SAVE_VERSION && mig.data.gathering?.mining === 0 && mig.data.gathering?.smithing === 0 && mig.data.gathering?.woodcutting === 4321 && mig.data.gathering?.fishing === 777, 'a v7 save migrates: mining and blacksmithing 0, woodcutting and fishing kept');
  const t3 = solo('knight');
  check(t3.g.applySave(t3.pid, v7) && t3.s.gathering.mining === 0 && t3.s.gathering.woodcutting === 4321 && t3.s.inventory.count('starsteel_pickaxe') === 1, 'a migrated v7 character loads with its items and skills');
}

console.log('Premium accounts and founder packs');
{
  const DAY = 86_400_000;
  let clock = Date.UTC(2027, 2, 1);
  const g = new Game({ premium: true, now: () => clock });
  const w = g.world;
  const town = (k: string) => TOWNS.find((t) => t.key === k)!;
  check(FREE_TOWNS.every((k) => !g.premiumLand(town(k).x, town(k).y)), 'the six heartland towns are free land');
  check(TOWNS.filter((t) => !(FREE_TOWNS as readonly string[]).includes(t.key)).every((t) => g.premiumLand(t.x, t.y)), 'the other eight towns are premium land');
  const fern = w.destinations.fernwick, cyc = w.destinations.cyclops_isle, gull = w.destinations.gull_isle;
  check(!g.premiumLand(fern.x, fern.y) && !g.premiumLand(cyc.x, cyc.y) && g.premiumLand(gull.x, gull.y), 'islands reached by a free town\'s ferry are free, a premium town\'s ferry island is premium');
  let crossing = 0;
  for (const [k, l] of w.links) {
    const [x, y] = k.split(',').map(Number);
    if (g.premiumLand(x, y) !== g.premiumLand(l.to.x, l.to.y)) crossing++;
  }
  check(crossing === 0, `no stairs, ladder or hole leads from free to premium land (${crossing} found)`);

  const a = g.addPlayer('Freebie', { intent: new BufferedIntent() });
  const b = g.addPlayer('Patron', { intent: new BufferedIntent() });
  g.setPerks(b.id, { ...NO_PERKS, premiumUntil: clock + 30 * DAY }, true);
  check(!g.isPremium(a) && g.isPremium(b), 'premium follows the account perks when the server enforces it');
  check(g.depotCap(a) === FREE_DEPOT_SLOTS && g.depotCap(b) === PREMIUM_DEPOT_SLOTS && g.offerCap(a) === FREE_MARKET_OFFERS && g.offerCap(b) === PREMIUM_MARKET_OFFERS, 'free: 60 depot slots and 20 offers, premium: 120 and 40');
  check(new Game().isPremium(solo().s) && new Game().depotCap(solo().s) === PREMIUM_DEPOT_SLOTS, 'offline (premium not enforced) everything is open');

  // depot: free accounts fill 60 slots; extra items from premium times stay
  a.depotOpen = { x: a.player.x, y: a.player.y, z: a.player.z };
  for (let i = 0; i < 60; i++) a.depot[i] = { id: 'short_sword', qty: 1 };
  a.inventory.add('iron_helmet', 1);
  const helmSlot = a.inventory.slots.findIndex((x) => x?.id === 'iron_helmet');
  g.depositItem(a.id, helmSlot);
  check(a.inventory.count('iron_helmet') === 1 && a.depot.filter(Boolean).length === 60, 'a free depot holds 60 slots');
  g.setPerks(a.id, { ...NO_PERKS, premiumUntil: clock + DAY });
  g.depositItem(a.id, a.inventory.slots.findIndex((x) => x?.id === 'iron_helmet'));
  check(a.inventory.count('iron_helmet') === 0 && a.depot.filter(Boolean).length === 61 && a.depot.length === 120, 'with premium the same depot takes more');
  clock += 2 * DAY;
  run(g, 1.2);
  check(!g.isPremium(a) && a.depot.filter(Boolean).length === 61, 'when premium ends every depot item stays');
  g.withdrawItem(a.id, 0);
  a.inventory.add('iron_helmet', 1);
  g.depositItem(a.id, a.inventory.slots.findIndex((x) => x?.id === 'iron_helmet'));
  check(a.depot.filter(Boolean).length === 60 && a.inventory.count('iron_helmet') === 1, 'taking out works, new items wait until the depot is under 60');
  a.depotOpen = null;

  // ships: premium needed to sail beyond the heartland
  const hask = g.npcs.find((n) => n.key === 'hask')!;
  const ask = (s: Session, dest: string) => {
    s.player.placeAt(hask.x + 1, hask.y, hask.z);
    s.inventory.add('gold', 1000);
    s.dialogue = { npcId: hask.id, npcKey: hask.key, npcName: hask.name, page: 'root', text: '' };
    g.dialogueAction(s.id, `travel:${dest}`);
  };
  ask(a, 'valdrheim');
  check(!g.premiumLand(a.player.x, a.player.y) && /premium/i.test(a.dialogue?.text ?? ''), 'a free player cannot sail to Valdrheim');
  ask(a, 'westmarch');
  check(chebyshev(a.player.x, a.player.y, w.destinations.westmarch.x, w.destinations.westmarch.y) <= 3, 'a free player can sail between heartland ports');
  ask(b, 'valdrheim');
  check(g.premiumLand(b.player.x, b.player.y), 'a premium player sails to Valdrheim');

  // standing on premium land without premium: brought to a free temple, nothing lost
  a.player.placeAt(b.player.x + 2, b.player.y, b.player.z);
  const carried = a.inventory.count('gold');
  run(g, 1.5);
  check(!g.premiumLand(a.player.x, a.player.y) && a.inventory.count('gold') === carried, 'a free player on premium land is brought to a free temple with everything');
  const msgs: string[] = [];
  g.events.on((e: GameEvent) => { if (e.type === 'message' && e.to === b.id) msgs.push(e.text); });
  clock = b.perks.premiumUntil + 1000;
  run(g, 1.5);
  check(!g.premiumLand(b.player.x, b.player.y) && msgs.some((m) => m.includes('premium time has ended')), 'when premium runs out abroad, the player is told and walked home');

  // regeneration out of combat
  g.setPerks(b.id, { ...NO_PERKS, premiumUntil: clock + 10 * DAY });
  for (const s of [a, b]) {
    s.player.level = 100;
    g.refreshStats(s);
    s.player.hp = 1;
    s.player.sinceCombat = 100;
    s.player.regenAcc = 0;
  }
  run(g, 3.01);
  check(b.player.hp > a.player.hp * 1.3, `premium regenerates faster out of combat (${Math.round(a.player.hp)} vs ${Math.round(b.player.hp)})`);

  // appearance is free for everyone (outfits and their premium/founder locks are gone, save v11)
  check(g.setAppearance(a.id, { ...a.player.appearance, hair: 'mohawk', build: 'broad' }) && a.player.appearance.hair === 'mohawk', 'a free account may pick any appearance');
  clock = b.perks.premiumUntil + 1000;
  run(g, 1.2);

  // founder looks
  g.setPerks(b.id, { ...NO_PERKS, premiumUntil: clock + 365 * DAY, founderTier: 'legend', founderNo: 27 });
  check(b.player.title === 'Legend #027' && b.player.cloak === 'crimson' && b.player.premium, 'a Legend founder gets the numbered title, the crimson cloak and the crown');
  executeCommand(g, b.id, { c: 'cosmetics', cloak: false });
  check(b.player.cloak === '' && b.player.title === 'Legend #027', 'the cloak can be hidden');
  // Pioneers: free title for accounts made before the opening; a founder title wins
  const perksA = { ...g.session(a.id)!.perks };
  g.setPerks(a.id, { ...NO_PERKS, pioneer: true });
  check(a.player.title === 'Pioneer' && a.player.cloak === '', 'an account made before the opening is a Pioneer (title only, no cloak)');
  g.setPerks(b.id, { ...NO_PERKS, premiumUntil: clock + 365 * DAY, founderTier: 'legend', founderNo: 27, pioneer: true });
  check(b.player.title === 'Legend #027', 'a founder who is also a Pioneer shows the founder title');
  executeCommand(g, a.id, { c: 'cosmetics', title: false });
  check(a.player.title === '', 'the Pioneer title can be hidden');
  executeCommand(g, a.id, { c: 'cosmetics', title: true });
  check(a.player.title === 'Pioneer', 'and shown again');
  g.setPerks(a.id, perksA);
  const saved = g.serialize(b.id);
  check(saved.version === SAVE_VERSION && SAVE_VERSION >= 10 && saved.cosmetics?.hideCloak === true, 'the save keeps the cloak switch');
  const g2 = new Game({ premium: true, now: () => clock });
  const c2 = g2.addPlayer('Patron', { intent: new BufferedIntent() });
  g2.setPerks(c2.id, { ...NO_PERKS, premiumUntil: clock + DAY, founderTier: 'legend', founderNo: 27 }, true);
  check(g2.applySave(c2.id, saved) && c2.player.cloak === '' && c2.player.title === 'Legend #027', 'perks set before loading keep the founder switches');
  const v8 = { ...JSON.parse(JSON.stringify(saved)), version: 8 } as Record<string, unknown>;
  delete v8.cosmetics;
  const m8 = migrateSave(v8);
  check(typeof m8 !== 'string' && m8.data.version === SAVE_VERSION && m8.data.cosmetics?.hideCloak === false && m8.data.cosmetics?.hideTitle === false, 'an older save migrates with the founder looks shown');

  // online: other players see the looks, you see your premium state
  const mirror = new Game({ simulate: false });
  mirror.localId = a.id;
  applySnapshot(mirror, buildSnapshot(g, a) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>, { depot: null, trade: null } as unknown as MirrorExtras);
  const mb = mirror.getPlayer(b.id)!;
  const ma = mirror.session(a.id)!;
  check(mb.title === 'Legend #027' && mb.premium && mb.cloak === '', 'snapshots carry title, crown and cloak to other players');
  check(ma.premiumNet?.enforced === true && ma.premiumNet.on === false && mirror.premiumView(a.id)?.depotCap === FREE_DEPOT_SLOTS, 'your own client knows your premium state and depot size');

  // the Founders' Stone
  const stoneAt = (() => { for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) if (w.getObj(w.temple.x + dx, w.temple.y + dy, 0) === Obj.FoundersStone) return { x: w.temple.x + dx, y: w.temple.y + dy }; return null; })();
  check(!!stoneAt && w.isSafe(stoneAt.x, stoneAt.y, 0), 'the Founders\' Stone stands on the Thornvale temple plaza');
  g.foundersStone = [{ no: 1, name: 'Ouriolis' }];
  const seen: string[] = [];
  g.events.on((e: GameEvent) => { if (e.type === 'message' && e.to === a.id) seen.push(e.text); });
  a.player.placeAt(stoneAt!.x, stoneAt!.y + 1, 0);
  executeCommand(g, a.id, { c: 'useTile', x: stoneAt!.x, y: stoneAt!.y });
  run(g, 1);
  check(seen.some((t) => t.includes('#001 Ouriolis')), 'using the stone reads out the Legend names');

  // premium time maths
  const pre = Date.UTC(2026, 11, 5);
  check(extendPremium(0, PRODUCTS.founder_warden, pre) === LAUNCH_AT + 180 * DAY, 'founder premium bought in December starts on opening day');
  check(extendPremium(0, PRODUCTS.premium_30, LAUNCH_AT + DAY) === LAUNCH_AT + 31 * DAY, 'premium bought after opening starts at once');
  check(extendPremium(LAUNCH_AT + 60 * DAY, PRODUCTS.premium_90, LAUNCH_AT + DAY) === LAUNCH_AT + 150 * DAY, 'more premium adds on top of what is left');
}

console.log("Tutorial: Wayfarer's Isle (save v11)");
{
  const g = new Game();
  const w = g.world;
  // ---- the island
  check(w.destinations[ISLE_DEST]?.x === ISLE_START.x && w.isWalkable(ISLE_START.x, ISLE_START.y, 0) && w.isSafe(ISLE_START.x, ISLE_START.y, 0), 'the island shrine exists, is walkable and is a protection zone');
  check(w.regions.some((r) => r.name === ISLE_REST.name && r.temple && r.safe), 'the shrine is a respawn temple');
  const reach = floodFill3D(w);
  const isleNpcs = g.npcs.filter((n) => onIsle(n.x, n.y, n.z));
  check(isleNpcs.length === 3 && [ISLE_GUIDE, ISLE_TRADER, ISLE_CAPTAIN].every((k) => isleNpcs.some((n) => n.key === k)), 'guide, trader and captain stand on the island');
  check(isleNpcs.every((n) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.at(n.x + dx, n.y + dy, n.z))), 'every island NPC can be reached');
  const isleRats = g.enemies.filter((e) => onIsle(e.x, e.y, e.z));
  check(isleRats.length >= 10 && isleRats.every((e) => (e.enemyKind === 'rat' || e.enemyKind === 'snake') && w.isWalkable(e.x, e.y, e.z) && reach.at(e.x, e.y, e.z)), `island monsters are rats and a snake, all reachable (${isleRats.length})`);
  check(w.getObj(ISLE_CHEST.x, ISLE_CHEST.y, 0) === Obj.Chest && w.getObj(ISLE_ROPE_SPOT.x, ISLE_ROPE_SPOT.y, -1) === Obj.RopeSpot && w.getObj(ISLE_CELLAR_HOLE.x, ISLE_CELLAR_HOLE.y, 0) === Obj.Hole, 'chest, cellar hole and rope spot are in place');
  // the island is cut off from the mainland: only the arrival point (new characters) and the ship lead off it
  const fromTemple = (() => { const c = w.clone(); for (const k of Object.keys(c.destinations)) if (k === ISLE_DEST) delete c.destinations[k]; return floodFill3D(c); })();
  check(!fromTemple.at(ISLE_START.x, ISLE_START.y, 0), 'the island cannot be walked to from the mainland');
  check(TUTORIAL_STEPS.length === 12 && TUTORIAL_LAST === 12, 'twelve tutorial steps');
  check(!new Game({ premium: true }).premiumLand(ISLE_START.x, ISLE_START.y), 'the tutorial island is free land (no premium needed)');

  // ---- a new character walks the whole island
  const intent = new BufferedIntent();
  const s = g.addPlayer('Newcomer', { intent, vocation: 'knight' });
  const pid = s.id;
  g.localId = pid;
  const p = s.player;
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  check(s.tutorial.state === 'done', 'players added the old way (bots, old saves) are not on the tutorial');
  g.beginTutorial(pid);
  check(s.tutorial.state === 'active' && s.tutorial.step === 1 && onIsle(p.x, p.y, p.z) && p.home === ISLE_REST.name, 'beginTutorial puts the character on the island at step 1');
  check(!s.inventory.equipment.weapon && !s.inventory.equipment.armor && s.inventory.count('cheese') === 2 && s.inventory.count('gold') === 0, 'they arrive with a bag and some food, nothing else');
  // captain refuses before the lessons
  const captain = g.npcs.find((n) => n.key === ISLE_CAPTAIN)!;
  const guide = g.npcs.find((n) => n.key === ISLE_GUIDE)!;
  const trader = g.npcs.find((n) => n.key === ISLE_TRADER)!;
  // 1 + 2: walk to the guide and talk
  executeCommand(g, pid, { c: 'talk', id: guide.id });
  run(g, 15, () => s.tutorial.step >= 3);
  check(s.tutorial.step === 3, 'walking to the guide and talking to her finishes steps 1 and 2');
  executeCommand(g, pid, { c: 'dialogue', action: 'tutorial:hint' });
  check(!!s.dialogue && s.dialogue.text.includes('chest'), 'the guide explains the current step');
  // 3: the chest
  executeCommand(g, pid, { c: 'useTile', x: ISLE_CHEST.x, y: ISLE_CHEST.y });
  run(g, 15, () => s.tutorial.step >= 4);
  check(s.tutorial.step === 4 && s.inventory.count('short_sword') === 1 && s.inventory.count('gold') === 40, 'the supply chest holds the knight starter kit');
  executeCommand(g, pid, { c: 'useTile', x: ISLE_CHEST.x, y: ISLE_CHEST.y });
  run(g, 3);
  check(s.inventory.count('short_sword') === 1, 'the chest opens only once');
  // 4: gear up
  for (let i = 0; i < s.inventory.slots.length; i++) {
    const st = s.inventory.slots[i];
    if (st && equipSlotFor(itemDef(st.id)) && st.id !== 'cheese') { executeCommand(g, pid, { c: 'useSlot', slot: i }); i = -1; }
  }
  run(g, 1);
  check(s.tutorial.step === 5 && s.inventory.equipment.weapon?.id === 'short_sword' && s.inventory.equipment.armor?.id === 'leather_armor', 'putting on weapon and armour finishes step 4');
  // 5: three rats (looting and eating on the way count for step 6)
  const rats = g.enemies.filter((e) => e.enemyKind === 'rat' && onIsle(e.x, e.y, e.z) && e.z === 0).slice(0, 3);
  p.god = true;
  g.teleport(p, 89, 341, 0);
  for (const r of rats) {
    r.placeAt(p.x + 1, p.y, p.z);
    Object.assign(r, { spawnX: p.x + 1, spawnY: p.y, spawnZ: p.z });
    executeCommand(g, pid, { c: 'attack', id: r.id });
    run(g, 40, () => r.dead);
  }
  check(s.tutorial.step === 6 && rats.every((r) => r.dead), `slaying three rats finishes step 5 (step ${s.tutorial.step}, count ${s.tutorial.count}, dead ${rats.map((r) => r.dead)})`);
  // 6: loot a bag and eat
  const cheeseSlot = s.inventory.slots.findIndex((x) => x?.id === 'cheese');
  executeCommand(g, pid, { c: 'throw', from: cheeseSlot, x: p.x + 1, y: p.y + 1 });
  run(g, 1);
  const bag = g.bags.find((b) => b.x === p.x + 1 && b.y === p.y + 1 && b.z === p.z);
  if (bag) executeCommand(g, pid, { c: 'pickup', id: bag.id });
  run(g, 5, () => (s.tutorial.flags & 1) === 1 || s.tutorial.step > 6);
  p.hp = Math.max(1, p.hp - 30);
  executeCommand(g, pid, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === 'cheese') });
  run(g, 1);
  check(!!bag && s.tutorial.step === 7 && s.inventory.count('gold') >= 65, 'picking up loot and eating finishes step 6 (25 gold reward)');
  // 7: cast exura
  p.hp = Math.max(1, p.hp - 30);
  executeCommand(g, pid, { c: 'say', text: 'exura' });
  run(g, 1);
  check(s.tutorial.step === 8 && s.inventory.count('mana_potion') >= 3 && s.inventory.count('rope') === 1, 'casting exura finishes step 7 (mana potion), step 8 hands out a rope');
  // 8: into the cellar and out again by rope
  executeCommand(g, pid, { c: 'moveTo', x: ISLE_CELLAR_HOLE.x, y: ISLE_CELLAR_HOLE.y });
  run(g, 40, () => p.z === -1);
  check(p.z === -1 && (s.tutorial.flags & 1) === 1, 'dropping into the cellar hole');
  executeCommand(g, pid, { c: 'useTile', x: ISLE_ROPE_SPOT.x, y: ISLE_ROPE_SPOT.y });
  run(g, 40, () => p.z === 0);
  run(g, 0.5);
  check(p.z === 0 && s.tutorial.step === 9, 'climbing out by rope finishes step 8');
  // 9: buy from Tobin
  executeCommand(g, pid, { c: 'talk', id: trader.id });
  run(g, 40, () => !!s.dialogue);
  executeCommand(g, pid, { c: 'dialogue', action: 'sellLoot' });
  executeCommand(g, pid, { c: 'dialogue', action: 'buy:health_potion:1' });
  check(s.tutorial.step === 10, 'buying from Tobin finishes step 9');
  // 10: depot and bank
  executeCommand(g, pid, { c: 'dialogue', action: 'deposit:all' });
  check(s.bank > 0 && (s.tutorial.flags & 2) === 2, 'banking gold counts');
  const locker = (() => { for (let y = ISLE.y0; y <= ISLE.y1; y++) for (let x = ISLE.x0; x <= ISLE.x1; x++) if (w.getObj(x, y, 0) === Obj.Locker) return { x, y }; return null; })()!;
  executeCommand(g, pid, { c: 'useTile', x: locker.x, y: locker.y });
  run(g, 20, () => !!s.depotOpen);
  executeCommand(g, pid, { c: 'deposit', slot: s.inventory.slots.findIndex((x) => x?.id === 'health_potion') });
  run(g, 0.5);
  check(s.tutorial.step === 11 && s.inventory.count('fishing_rod') === 1, 'using the depot finishes step 10; step 11 hands out a fishing rod');
  // save mid-way and load: the step is kept
  const mid = g.serialize(pid);
  check(mid.version === SAVE_VERSION && mid.tutorial?.state === 'active' && mid.tutorial.step === 11, 'saves carry the tutorial step');
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, mid) && t2.s.tutorial.state === 'active' && t2.s.tutorial.step === 11 && onIsle(t2.s.player.x, t2.s.player.y, t2.s.player.z), 'a character loaded mid-tutorial resumes on the island');
  // 11 is optional; 12: the captain sails
  events.length = 0;
  executeCommand(g, pid, { c: 'talk', id: captain.id });
  run(g, 60, () => !!s.dialogue);
  executeCommand(g, pid, { c: 'dialogue', action: 'travel:thornvale' });
  check(s.tutorial.state === 'done' && !onIsle(p.x, p.y, p.z) && chebyshev(p.x, p.y, w.temple.x, w.temple.y) <= 5 && p.home === 'Thornvale', 'Captain Wren sails to the Thornvale temple and the tutorial is done');
  check(events.some((e) => e.type === 'tutorialDone' && !e.skipped && e.to === pid), 'finishing emits tutorialDone (not skipped) for the account flag');
  const after = g.serialize(pid);
  check(after.tutorial?.state === 'done', 'a graduate is saved as done');
  p.god = false;

  // ---- the captain refuses early, and the island spares beginners
  {
    const q = solo('sorcerer', g);
    g.beginTutorial(q.pid);
    q.s.player.placeAt(captain.x - 1, captain.y, 0);
    executeCommand(g, q.pid, { c: 'talk', id: captain.id });
    run(g, 5, () => !!q.s.dialogue);
    executeCommand(g, q.pid, { c: 'dialogue', action: 'travel:thornvale' });
    check(q.s.tutorial.state === 'active' && onIsle(q.s.player.x, q.s.player.y, q.s.player.z) && /Not yet/.test(q.s.dialogue?.text ?? ''), 'the captain will not sail before the lessons that matter');
    q.s.player.exp = 500;
    q.s.inventory.add('cheese', 3);
    const cheeseBefore = q.s.inventory.count('cheese');
    q.s.player.level = 3;
    g.refreshStats(q.s);
    q.s.player.placeAt(ISLE_CELLAR_HOLE.x - 2, ISLE_CELLAR_HOLE.y + 3, 0);
    (g as unknown as { killPlayer(p: unknown, k: unknown): void }).killPlayer(q.s.player, null);
    check(q.s.player.exp === 500 && q.s.inventory.count('cheese') === cheeseBefore, 'dying on the island costs no experience and no belongings');
    run(g, 6, () => !q.s.player.dead);
    check(onIsle(q.s.player.x, q.s.player.y, q.s.player.z) && w.isSafe(q.s.player.x, q.s.player.y, 0), 'and you wake at the island shrine');
    // no PvP on the island
    const r2 = solo('knight', g);
    g.beginTutorial(r2.pid);
    g.pvp = true;
    q.s.player.level = 10; r2.s.player.level = 10;
    check(!!g.pvpProblem(q.s.player, r2.s.player, false), 'nobody fights other players on the island');
    g.pvp = false;
  }

  // ---- skipping
  {
    const k = solo('paladin', g);
    g.beginTutorial(k.pid);
    check(!g.skipTutorial(k.pid) && k.s.tutorial.state === 'active', 'an account that never finished the island cannot skip it');
    k.s.tutorial.canSkip = true;
    executeCommand(g, k.pid, { c: 'tutorialSkip' });
    const inv = k.s.inventory;
    check(k.s.tutorial.state === 'skipped' && !onIsle(k.s.player.x, k.s.player.y, k.s.player.z), 'an eligible account skips straight to Thornvale');
    check(inv.equipment.weapon?.id === 'spear' && inv.equipment.armor?.id === 'leather_armor' && inv.count('hunting_bow') === 1 && inv.count('rope') === 1 && inv.count('fishing_rod') === 1 && inv.count('health_potion') === 5 && inv.count('gold') === 65,
      'skippers get the starter kit, worn, plus what graduates earn (rope, rod, potions, gold)');
    // a brand-new character that skips at creation
    const f = solo('druid', g);
    f.s.tutorial.canSkip = true;
    g.startSkipped(f.pid);
    check(f.s.tutorial.state === 'skipped' && f.s.inventory.count('rope') === 1 && f.s.inventory.count('fishing_rod') === 1 && f.s.inventory.count('cheese') === 2 && f.s.inventory.count('gold') === 65 && f.s.inventory.equipment.weapon?.id === 'rod_of_frost', 'skipping at creation: the starter kit plus the graduate extras');
    check(g.serialize(f.pid).tutorial?.state === 'skipped', 'skipped is saved');
  }

  // ---- review fixes: no rope farming, spare gear once, chest and test commands guarded
  {
    const r = solo('knight', g);
    g.beginTutorial(r.pid);
    r.s.tutorial.step = stepNo('rats');
    r.s.player.placeAt(ISLE_CELLAR_HOLE.x, ISLE_CELLAR_HOLE.y + 1, -1);
    run(g, 0.5);
    check(r.s.inventory.count('rope') === 0, 'no free rope in the cellar outside the cellar step');
    r.s.tutorial.step = stepNo('cellar');
    r.s.tutorial.flags = 1;
    run(g, 0.5);
    const rs = r.s.inventory.slots.findIndex((x) => x?.id === 'rope');
    check(rs >= 0, 'a spare rope turns up once in the cellar step');
    r.s.inventory.slots[rs] = null;
    run(g, 0.5);
    check(r.s.inventory.count('rope') === 0, 'but only once (no rope farming)');
    // gear lost before the gear step is done: one spare per piece
    const q = solo('knight', g);
    g.beginTutorial(q.pid);
    q.s.tutorial.step = stepNo('gear');
    run(g, 0.5);
    check(q.s.inventory.count('short_sword') === 1 && q.s.inventory.count('leather_armor') === 1, 'a player who lost the chest gear gets one spare of each');
    for (let i = 0; i < q.s.inventory.slots.length; i++) if (q.s.inventory.slots[i]?.id === 'short_sword') q.s.inventory.slots[i] = null;
    run(g, 0.5);
    check(q.s.inventory.count('short_sword') === 0, 'but only once');
    // the supply chest is for newcomers only
    const v = solo('knight', g);
    v.s.player.placeAt(ISLE_CHEST.x + 1, ISLE_CHEST.y, 0);
    const before = v.s.inventory.count('short_sword');
    executeCommand(g, v.pid, { c: 'useTile', x: ISLE_CHEST.x, y: ISLE_CHEST.y });
    run(g, 2);
    check(v.s.inventory.count('short_sword') === before, 'characters who finished the tutorial cannot loot the supply chest');
    // test mode players cannot finish, skip or jump tutorial steps
    const tm = solo('knight', g);
    g.beginTutorial(tm.pid);
    tm.s.admin = true;
    tm.s.testOnly = true;
    g.say(tm.pid, '/tutorial done');
    g.say(tm.pid, '/tutorial step 9');
    check(tm.s.tutorial.state === 'active' && tm.s.tutorial.step === 1, 'test mode cannot change tutorial progress');
    // skipping mid-island at step 1 does not hand out the start food twice
    const sk = solo('knight', g);
    g.beginTutorial(sk.pid);
    sk.s.tutorial.canSkip = true;
    g.skipTutorial(sk.pid);
    check(sk.s.inventory.count('cheese') === 2, 'skipping at step 1 keeps the two cheeses (no extra)');
  }

  // ---- migration v10 → v11 and loading
  {
    const old = solo('knight');
    old.s.inventory.add('iron_sword', 1);
    old.s.bank = 777;
    const v9 = JSON.parse(JSON.stringify({ ...old.g.serialize(old.pid), version: 10 })) as Record<string, unknown>;
    delete v9.tutorial;
    const m = migrateSave(v9);
    check(typeof m !== 'string' && m.from === 10 && m.data.version === SAVE_VERSION && SAVE_VERSION >= 11 && m.data.tutorial?.state === 'done', 'a v10 save migrates as tutorial done');
    const t3 = solo('knight');
    const x0 = old.s.player.x, y0 = old.s.player.y;
    check(t3.g.applySave(t3.pid, v9) && t3.s.tutorial.state === 'done' && t3.s.player.x === x0 && t3.s.player.y === y0 && t3.s.bank === 777 && t3.s.inventory.count('iron_sword') === 1, 'a migrated v10 character keeps its place, items and bank');
    // a finished character saved on the island (e.g. by a test command) is moved off it
    const odd = { ...old.g.serialize(old.pid), player: { ...old.g.serialize(old.pid).player, x: ISLE_START.x, y: ISLE_START.y, z: 0 } };
    const t4 = solo('knight');
    check(t4.g.applySave(t4.pid, odd) && !onIsle(t4.s.player.x, t4.s.player.y, t4.s.player.z), 'a finished character never stays on the island');
    // broken or missing tutorial data never traps anyone on the island
    const broken = { ...old.g.serialize(old.pid), tutorial: { state: 'nonsense', step: 99 } };
    const t5 = solo('knight');
    check(t5.g.applySave(t5.pid, broken) && t5.s.tutorial.state === 'done', 'unreadable tutorial data counts as done');
    check(stepNo('gather') === 11 && stepNo('sail') === 12, 'step numbers');
  }

  // ---- the mirror (online client) learns the tutorial state from snapshots
  {
    const srv = new Game();
    const a = srv.addPlayer('Islander', { vocation: 'knight' });
    srv.beginTutorial(a.id);
    const mirror = new Game({ simulate: false });
    mirror.localId = a.id;
    const extras: MirrorExtras = { depot: null, trade: null };
    const changed: GameEvent[] = [];
    mirror.events.on((e) => { if (e.type === 'tutorialChanged') changed.push(e); });
    applySnapshot(mirror, buildSnapshot(srv, a) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>, extras);
    const ms = mirror.session(a.id)!;
    check(ms.tutorial.state === 'active' && ms.tutorial.step === 1 && changed.length === 1, 'snapshots carry the tutorial step (tu)');
    const snap2 = buildSnapshot(srv, a) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>;
    check(snap2.self.tu === undefined, 'the tutorial part is only resent when it changes');
    check(NPCS[ISLE_CAPTAIN].travel?.[0]?.price === 0 && NPCS[ISLE_GUIDE].tutor === true, 'island NPC definitions');
  }
}

console.log('Walking speed grows with level');
{
  const { g, s } = solo('knight');
  const t1 = s.player.baseStep;
  s.player.level = 100;
  g.refreshStats(s);
  const t100 = s.player.baseStep;
  s.player.level = 500;
  g.refreshStats(s);
  const t500 = s.player.baseStep;
  check(t1 > 0.5 && t100 < 0.4 && t100 > 0.35 && t500 >= 0.25, `level 1 takes ${t1.toFixed(2)} s per tile, level 100 ${t100.toFixed(2)} s, level 500 ${t500.toFixed(2)} s (never under 0.25)`);
}

console.log('Fletching, crafting, cooking and firemaking');
{
  const { g, s, pid } = solo('paladin');
  const p = s.player;
  const w = g.world;
  p.god = true;
  s.admin = true;
  p.capacity = 1e6;
  s.inventory.equipment.backpack = { id: 'dragonhide_pack', qty: 1 };
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === pid) msgs.push(e.text); });
  g.localId = pid;
  const findObj = (o: Obj): { x: number; y: number; z: number; sx: number; sy: number } | null => {
    for (let y = 2; y < w.height - 2; y++) for (let x = 2; x < w.width - 2; x++) {
      if (w.getObj(x, y, 0) !== o) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (w.isWalkable(x + dx, y + dy, 0) && !w.linkAt(x + dx, y + dy, 0) && !g.isOccupied(x + dx, y + dy, 0)) return { x, y, z: 0, sx: x + dx, sy: y + dy };
    }
    return null;
  };
  const clearFoes = () => { for (const e of g.enemies) if (!e.dead && e.z === p.z && Math.abs(e.x - p.x) < 16 && Math.abs(e.y - p.y) < 16) { e.dead = true; e.respawnTimer = 1e9; } };
  const strip = openStrip(g);
  const goStrip = () => { g.teleport(p, strip.x + 8, strip.y, 0); clearFoes(); };

  // ---- registry, admin, levels
  for (const k of ['fletching', 'crafting', 'cooking', 'firemaking'] as const) check(s.gathering[k] === 0 && g.skillLevel(s, k) === 1, `${k} starts at level 1`);
  g.say(pid, '/fletching 30');
  g.say(pid, '/skill crafting 20');
  g.say(pid, '/cooking 12');
  g.say(pid, '/firemaking 7');
  check(g.skillLevel(s, 'fletching') === 30 && g.skillLevel(s, 'crafting') === 20 && g.skillLevel(s, 'cooking') === 12 && g.skillLevel(s, 'firemaking') === 7, '/fletching, /skill crafting, /cooking, /firemaking N set the new skills');
  for (const k of ['fletching', 'crafting', 'cooking', 'firemaking']) g.say(pid, `/skill ${k} 1`);

  // ---- firemaking
  goStrip();
  s.inventory.add('logs', 3);
  s.inventory.add('pine_logs', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'logs' });
  check(g.craftView(pid) === null, 'logs alone open nothing');
  s.inventory.add('tinderbox', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'tinderbox' });
  const fw = g.craftView(pid);
  check(fw?.station === 'tinderbox' && fw.recipes.length === 4 && fw.recipes.find((r) => r.id === 'fire:pine_logs')?.locked === true, 'a tinderbox opens the firemaking window (pine locked at level 1)');
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'fire:pine_logs', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need firemaking level 15')), 'pine logs need firemaking 15');
  const x0 = p.x, y0 = p.y;
  executeCommand(g, pid, { c: 'craft', recipe: 'fire:logs', count: 2 });
  check(p.craft?.left === 2, 'Make 2 fires starts a batch');
  run(g, 12, () => p.craft === null);
  check(w.getObj(x0, y0, 0) === Obj.Campfire && g.isLitFire(x0, y0, 0) && w.getObj(x0 - 1, y0, 0) === Obj.Campfire, 'two campfires lit in a line');
  check(p.x === x0 - 2 && p.y === y0 && s.inventory.count('logs') === 1 && s.gathering.firemaking === 80, `you step aside after each fire; logs used, 2 × 40 xp (${s.gathering.firemaking})`);
  check(!w.isWalkable(x0, y0, 0), 'a campfire blocks the tile');
  const snapF = buildSnapshot(g, s);
  const mirF = new Game({ simulate: false });
  if (snapF.t === 'snap') {
    check(!!snapF.fi?.includes(`${x0},${y0},0`), 'the snapshot lists lit fires nearby (fi)');
    applySnapshot(mirF, snapF);
    check(mirF.world.getObj(x0, y0, 0) === Obj.Campfire && mirF.isLitFire(x0, y0, 0), 'clients see the campfire');
    const again = buildSnapshot(g, s);
    check(again.t === 'snap' && again.fi === undefined, 'an unchanged fire list is not sent again');
  }
  // protection zones: no fires
  const temple = g.world.playerSpawn;
  g.teleport(p, temple.x, temple.y, temple.z);
  msgs.length = 0;
  executeCommand(g, pid, { c: 'useItem', item: 'tinderbox' });
  executeCommand(g, pid, { c: 'craft', recipe: 'fire:logs', count: 1 });
  check(p.craft === null && msgs.some((m) => m.includes('protection zone')) && s.inventory.count('logs') === 1, 'no fires in a protection zone');

  // ---- cooking on the campfire
  g.teleport(p, x0, y0 + 1, 0);
  clearFoes();
  check(g.isUsable(x0, y0, 0), 'a campfire is usable (cook)');
  executeCommand(g, pid, { c: 'useTile', x: x0, y: y0 });
  run(g, 0.5);
  check(g.craftView(pid)?.station === 'campfire', 'using a campfire opens the cooking window');
  s.inventory.add('raw_meat', 12);
  const cookXp0 = s.gathering.cooking;
  executeCommand(g, pid, { c: 'craft', recipe: 'cook:campfire:meat', count: 12 });
  run(g, 40, () => p.craft === null);
  const meat = s.inventory.count('meat'), burnt = s.inventory.count('burnt_food');
  check(s.inventory.count('raw_meat') === 0 && meat + burnt === 12 && burnt > 0 && meat > 0, `raw meat cooks into meat, some burns at level 1 (${meat} cooked, ${burnt} burnt)`);
  check(s.gathering.cooking >= cookXp0 + meat * 30 && s.gathering.cooking < cookXp0 + 12 * 30, 'only cooked food gives cooking experience');
  msgs.length = 0;
  s.inventory.add('raw_swordfish', 1);
  executeCommand(g, pid, { c: 'craft', recipe: 'cook:campfire:swordfish', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need cooking level 50')), 'swordfish needs cooking 50');
  const meatR = recipeById('cook:campfire:meat')!, stoveR = recipeById('cook:stove:meat')!;
  check(recipeChance(meatR, 1) === 0.55 && recipeChance(meatR, 24) === 1 && recipeChance(stoveR, 1) > recipeChance(meatR, 1) && recipeChance(stoveR, 19) === 1, 'burning falls with level and a stove burns less');
  check(FOODS.every((f) => (ITEMS[f.cooked].heal ?? 0) > 0 && ITEMS[f.raw].kind === 'material') && FISH.every((f) => FOODS.some((x) => x.raw === f.raw && x.cooked === f.item)), 'raw food cannot be eaten; every caught fish cooks into the old fish item');
  g.useItem(pid, 'raw_swordfish');
  check(s.inventory.count('raw_swordfish') === 1, 'eating raw fish does nothing');
  // the fire burns out (and a cook at it stops)
  check(g.craftView(pid)?.station === 'campfire', 'using raw food beside a fire opens it');
  executeCommand(g, pid, { c: 'useTile', x: x0, y: y0 });
  run(g, 0.3);
  g.say(pid, '/cooking 1');
  s.inventory.add('raw_meat', 50);
  executeCommand(g, pid, { c: 'craft', recipe: 'cook:campfire:meat', count: 50 });
  run(g, 130, () => w.getObj(x0, y0, 0) !== Obj.Campfire);
  run(g, 3);
  check(w.getObj(x0, y0, 0) === Obj.None && !g.isLitFire(x0, y0, 0) && p.craft === null && g.craftView(pid) === null, 'a campfire burns out (60–80 s) and the cooking stops');
  const snapF2 = buildSnapshot(g, s);
  if (snapF2.t === 'snap') {
    applySnapshot(mirF, snapF2);
    check(mirF.world.getObj(x0, y0, 0) === Obj.None && !mirF.isLitFire(x0, y0, 0), 'clients see it go out');
  }
  // ---- cooking on a stove
  const stove = findObj(Obj.Stove)!;
  check(!!stove, 'stoves exist');
  g.teleport(p, stove.sx, stove.sy, 0);
  executeCommand(g, pid, { c: 'useTile', x: stove.x, y: stove.y });
  run(g, 0.5);
  check(g.craftView(pid)?.station === 'stove', 'using a stove opens the cooking window');
  g.say(pid, '/cooking 30');
  s.inventory.add('raw_trout', 3);
  const trout0 = s.inventory.count('trout');
  executeCommand(g, pid, { c: 'craft', recipe: 'cook:stove:trout', count: 3 });
  run(g, 12, () => p.craft === null);
  check(s.inventory.count('trout') === trout0 + 3 && s.inventory.count('raw_trout') === 0, 'at cooking 30 trout never burns on a stove');
  executeCommand(g, pid, { c: 'craftClose' });
  // raw food next to a stove opens it
  s.inventory.add('raw_fish', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'raw_fish' });
  check(g.craftView(pid)?.station === 'stove', 'using raw food beside a stove opens the stove');
  executeCommand(g, pid, { c: 'craftClose' });

  // ---- fletching
  goStrip();
  s.inventory.removeById('logs', s.inventory.count('logs'));
  s.inventory.add('logs', 6);
  executeCommand(g, pid, { c: 'useItem', item: 'feather' });
  check(g.craftView(pid) === null, 'no feathers, nothing to use');
  s.inventory.add('arrow_shaft', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'arrow_shaft' });
  check(g.craftView(pid)?.station === 'knife', 'arrow shafts open the fletching window');
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:shafts:logs', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need a knife')), 'carving needs a knife');
  s.inventory.removeById('arrow_shaft', 1);
  s.inventory.add('knife', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'knife' });
  const kv = g.craftView(pid);
  check(kv?.station === 'knife' && ['Shafts', 'Bows', 'Crossbows', 'Arrows'].every((gr) => kv.recipes.some((r) => r.group === gr)), 'a knife opens fletching: shafts, bows, crossbows, arrows');
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:shafts:logs', count: 2 });
  run(g, 6, () => p.craft === null);
  check(s.inventory.count('arrow_shaft') === 30 && s.inventory.count('logs') === 4 && s.gathering.fletching === 10, 'logs carve into 15 arrow shafts each (5 xp)');
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:longbow', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need fletching level 10')), 'a longbow needs fletching 10');
  g.say(pid, '/fletching 10');
  const bows0 = s.inventory.count('hunting_bow');
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:hunting_bow', count: 1 });
  run(g, 4, () => p.craft === null);
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:longbow', count: 1 });
  run(g, 4, () => p.craft === null);
  check(s.inventory.count('hunting_bow') === bows0 + 1 && s.inventory.count('longbow') === 1 && s.inventory.count('logs') === 1, 'logs make a hunting bow (short) and a longbow (2 logs)');
  s.inventory.add('feather', 20);
  s.inventory.add('bronze_arrowheads', 20);
  const arrows0 = s.inventory.count('arrow') + (s.inventory.equipment.ammo?.id === 'arrow' ? 0 : 0);
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:arrow', count: 2 });
  run(g, 6, () => p.craft === null);
  check(s.inventory.count('arrow') === arrows0 + 20 && s.inventory.count('arrow_shaft') === 10 && s.inventory.count('feather') === 0, 'shafts + feathers + bronze arrowheads make arrows, ten at a time');
  msgs.length = 0;
  s.inventory.add('iron_arrowheads', 10);
  s.inventory.add('feather', 10);
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:onyx_arrow', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need fletching level 15')), 'iron-tipped (onyx) arrows need fletching 15');
  // moving stops the work, the hand-tool window stays open
  s.inventory.add('logs', 5);
  executeCommand(g, pid, { c: 'craft', recipe: 'fletch:shafts:logs', count: 5 });
  run(g, 0.3);
  check(p.craft !== null, 'carving again');
  executeCommand(g, pid, { c: 'moveTo', x: p.x + 3, y: p.y });
  run(g, 0.5);
  check(p.craft === null && g.craftView(pid)?.station === 'knife', 'walking stops carving; the knife window stays open');
  executeCommand(g, pid, { c: 'craftClose' });

  // ---- crafting: tanning, sewing, gems, jewellery
  const rack = findObj(Obj.TanningRack)!;
  check(!!rack, 'tanning racks exist');
  g.teleport(p, rack.sx, rack.sy, 0);
  executeCommand(g, pid, { c: 'useTile', x: rack.x, y: rack.y });
  run(g, 0.5);
  check(g.craftView(pid)?.station === 'tanning', 'using a tanning rack opens tanning');
  s.inventory.add('wolf_pelt', 4);
  executeCommand(g, pid, { c: 'craft', recipe: 'tan:wolf_pelt', count: 4 });
  run(g, 10, () => p.craft === null);
  check(s.inventory.count('leather') === 4 && s.inventory.count('wolf_pelt') === 0 && s.gathering.crafting === 40, 'wolf pelts tan into leather (10 xp each)');
  msgs.length = 0;
  s.inventory.add('polar_bear_fur', 1);
  executeCommand(g, pid, { c: 'craft', recipe: 'tan:polar_bear_fur', count: 1 });
  check(p.craft === null && msgs.some((m) => m.startsWith('You need crafting level 30')), 'polar bear fur needs crafting 30');
  executeCommand(g, pid, { c: 'craftClose' });
  s.inventory.add('needle', 1);
  executeCommand(g, pid, { c: 'useItem', item: 'needle' });
  check(g.craftView(pid)?.station === 'needle', 'a needle opens leatherwork');
  msgs.length = 0;
  executeCommand(g, pid, { c: 'craft', recipe: 'sew:leather_helmet', count: 1 });
  check(p.craft === null && msgs.some((m) => m.includes('thread')), 'sewing needs thread');
  s.inventory.add('thread', 5);
  const caps0 = s.inventory.count('leather_helmet');
  executeCommand(g, pid, { c: 'craft', recipe: 'sew:leather_helmet', count: 1 });
  run(g, 4, () => p.craft === null);
  check(s.inventory.count('leather_helmet') === caps0 + 1 && s.inventory.count('leather') === 3 && s.inventory.count('thread') === 4, 'leather + thread make a leather cap');
  g.say(pid, '/crafting 20');
  s.inventory.add('chisel', 1);
  s.inventory.add('small_sapphire', 2);
  executeCommand(g, pid, { c: 'useItem', item: 'chisel' });
  executeCommand(g, pid, { c: 'craft', recipe: 'cut:small_sapphire', count: 2 });
  run(g, 6, () => p.craft === null);
  check(s.inventory.count('cut_sapphire') === 2 && s.inventory.count('small_sapphire') === 0, 'a chisel cuts sapphires (crafting 20)');
  const furnace = findObj(Obj.Furnace)!;
  g.teleport(p, furnace.sx, furnace.sy, 0);
  executeCommand(g, pid, { c: 'useTile', x: furnace.x, y: furnace.y });
  run(g, 0.5);
  const jv = g.craftView(pid);
  const ringRow = jv?.recipes.find((r) => r.id === 'jewel:sapphire_ring');
  check(jv?.station === 'furnace' && jv.skill === 'smithing' && ringRow?.skill === 'crafting' && ringRow.locked === true, 'the furnace lists jewellery, trained by crafting (sapphire ring locked at crafting 20)');
  g.say(pid, '/crafting 25');
  s.inventory.add('silver_bar', 1);
  executeCommand(g, pid, { c: 'craft', recipe: 'jewel:sapphire_ring', count: 1 });
  run(g, 4, () => p.craft === null);
  check(s.inventory.count('sapphire_ring') >= 1 && s.inventory.count('cut_sapphire') === 1 && s.inventory.count('silver_bar') === 0, 'a silver bar and a cut sapphire make a sapphire ring');
  executeCommand(g, pid, { c: 'craftClose' });

  // ---- loot
  check(['wolf', 'deer', 'bear', 'winter_wolf', 'polar_bear', 'silver_rabbit'].every((k) => ENEMIES[k as Enemy['enemyKind']].loot.some((l) => l.id === 'raw_meat')), 'wolves, deer, bears and rabbits drop raw meat');
  check(ENEMIES.dire_penguin.loot.some((l) => l.id === 'feather') && ENEMIES.bear.loot.some((l) => l.id === 'bear_hide'), 'penguins drop feathers, bears drop hides');
  check(FISH_ITEMS.every((id) => FOODS.some((f) => f.cooked === id)), 'every old fish item is a cooking result');

  // ---- save, load and migration
  const data = g.serialize(pid);
  check(SAVE_VERSION >= 9 && data.version === SAVE_VERSION && (['fletching', 'crafting', 'cooking', 'firemaking'] as const).every((k) => data.gathering?.[k] === s.gathering[k]), 'saves carry fletching, crafting, cooking and firemaking (save v9)');
  const t2 = solo('knight');
  check(t2.g.applySave(t2.pid, data) && t2.s.gathering.crafting === s.gathering.crafting && t2.s.gathering.fletching === s.gathering.fletching && t2.s.inventory.count('longbow') === 1, 'the new skills survive save and load');
  const v8 = JSON.parse(JSON.stringify({ ...data, version: 8, gathering: { woodcutting: 4321, fishing: 777, mining: 55, smithing: 99 } })) as Record<string, unknown>;
  const mig = migrateSave(v8);
  check(typeof mig !== 'string' && mig.from === 8 && mig.data.version === SAVE_VERSION && mig.data.gathering?.fletching === 0 && mig.data.gathering?.crafting === 0 && mig.data.gathering?.cooking === 0 && mig.data.gathering?.firemaking === 0
    && mig.data.gathering?.woodcutting === 4321 && mig.data.gathering?.fishing === 777 && mig.data.gathering?.mining === 55 && mig.data.gathering?.smithing === 99, 'a v8 save migrates: the four new skills 0, every other skill kept');
  const t3 = solo('knight');
  check(t3.g.applySave(t3.pid, v8) && t3.s.gathering.cooking === 0 && t3.s.gathering.smithing === 99 && t3.s.inventory.count('longbow') === 1, 'a migrated v8 character loads with its items and skills');
  const snapS = buildSnapshot(g, s);
  if (snapS.t === 'snap') check(snapS.self.gx?.cooking === Math.floor(s.gathering.cooking) && snapS.self.gx?.firemaking === Math.floor(s.gathering.firemaking), 'the snapshot carries the new skills (gx)');
}

console.log('Death loot, dead bodies and the Hearthward Amulet');
{
  const { g, s, pid } = solo('knight');
  const p = s.player;
  const kill = () => (g as unknown as { killPlayer(p: unknown, k: null): void }).killPlayer(p, null);
  const spot = g.world.temple;
  // walk out of town so the body lies on open ground
  s.inventory.equipment.backpack = { id: 'backpack', qty: 1 };
  s.inventory.add('wolf_pelt', 3);
  s.inventory.equipment.armor = { id: 'plate_armor', qty: 1 };
  s.inventory.equipment.head = { id: 'iron_helmet', qty: 1 };
  s.inventory.equipment.amulet = { id: 'hearthward_amulet', qty: 1 };
  p.placeAt(spot.x, spot.y, spot.z ?? 0);
  kill();
  const body1 = g.bags.find((b) => b.corpse === p.name);
  check(!!body1 && body1.items.length === 0 && s.inventory.equipment.amulet === null && s.inventory.count('wolf_pelt') === 3 && s.inventory.equipment.backpack?.id === 'backpack'
    && s.inventory.equipment.armor?.id === 'plate_armor', 'the Hearthward Amulet crumbles and keeps every item; an empty body is left');
  run(g, 6, () => !p.dead);
  let lostWorn = 0;
  for (let k = 0; k < 40; k++) {
    s.inventory.equipment.backpack = { id: 'backpack', qty: 1 };
    s.inventory.add('wolf_pelt', 1);
    s.inventory.equipment.armor = { id: 'plate_armor', qty: 1 };
    p.dead = false;
    kill();
    if (!s.inventory.equipment.armor) lostWorn++;
    if (k === 0) {
      const body = g.bags.filter((b) => b.corpse === p.name).pop()!;
      check(s.inventory.equipment.backpack === null && s.inventory.slots.every((x) => !x) && body.items.some((i) => i.id === 'backpack') && body.items.some((i) => i.id === 'wolf_pelt'),
        'without the amulet the backpack and everything in it stay in the dead body');
    }
  }
  check(lostWorn >= 3 && lostWorn <= 20, `each worn item drops about a quarter of the time (${lostWorn}/40)`);
  // looting the body: walking over it does not pick it up, the window takes one item or all
  p.dead = false;
  const body = g.bags.filter((b) => b.corpse === p.name && b.items.length > 1).pop()!;
  const n0 = body.items.length;
  p.placeAt(body.x, body.y, body.z);
  run(g, 0.2);
  check(body.items.length === n0 && g.bags.includes(body), 'standing on a dead body does not loot it');
  executeCommand(g, pid, { c: 'pickup', id: body.id, take: 0 });
  run(g, 0.5);
  check(body.items.length === n0 - 1, 'the loot window takes a single item');
  executeCommand(g, pid, { c: 'pickup', id: body.id, take: -1 });
  run(g, 0.5);
  check(body.items.length === 0 && g.bags.includes(body), 'take all empties the body, which stays until it decays');
  const snap = buildSnapshot(g, s);
  check(snap.t === 'snap' && (snap.b as Array<{ id: number; cp?: string }>).some((b) => b.cp === p.name), 'snapshots mark dead bodies with the name');
  check(PROTOCOL_VERSION >= 19, 'protocol 19: dead bodies in snapshots');
}

console.log('Appearance and the character designer (save v11 → v12)');
{
  const { g, s, pid } = solo('paladin');
  // an old v11 save with an outfit migrates to an appearance that keeps its colours
  const v11 = JSON.parse(JSON.stringify({ ...g.serialize(pid), version: 11 })) as Record<string, unknown>;
  const pl = v11.player as Record<string, unknown>;
  delete pl.appearance;
  pl.outfit = { type: 'barbarian', head: 3 * 19 + 1, body: 4 * 19 + 12, legs: 5 * 19 + 13, feet: 5 * 19 + 3 };
  const mig = migrateSave(v11);
  check(typeof mig !== 'string' && mig.from === 11 && mig.data.version === SAVE_VERSION && isAppearance(mig.data.player.appearance), 'a v11 save with an outfit migrates to a valid appearance');
  const ap = typeof mig !== 'string' ? mig.data.player.appearance! : null;
  check(ap?.hair === 'braids' && ap.beard === 'full' && ap.build === 'broad', 'the old outfit type picks hair, beard and build (barbarian → braids, full beard, broad)');
  check(ap?.top !== ap?.bottom && JSON.stringify(mig !== 'newer' && mig !== 'invalid' && mig.data.player.outfit) === JSON.stringify(pl.outfit), 'shirt and trousers keep their colours; the old outfit stays in the save untouched');
  const t = solo('knight');
  check(t.g.applySave(t.pid, v11) && JSON.stringify(t.s.player.appearance) === JSON.stringify(ap), 'the migrated character loads with that appearance');
  check(JSON.stringify(t.g.serialize(t.pid).player.outfit) === JSON.stringify(pl.outfit), 'saving again keeps the old outfit data');
  // odd or missing outfit data never crashes a migration
  for (const bad of [undefined, null, 'knight', { type: 'nope', head: -4, body: 9999 }]) {
    const raw = JSON.parse(JSON.stringify({ ...g.serialize(pid), version: 11 })) as Record<string, unknown>;
    (raw.player as Record<string, unknown>).outfit = bad;
    delete (raw.player as Record<string, unknown>).appearance;
    const m = migrateSave(raw);
    check(typeof m !== 'string' && isAppearance(m.data.player.appearance), `an old save with outfit ${JSON.stringify(bad)} still migrates`);
  }
  check(isAppearance(appearanceFromOutfit({ type: 'warden', head: 0, body: 0, legs: 0, feet: 0 }, PALETTE)), 'founder and premium outfit types map too');

  // round trip: save and load, wire encoding
  const look: Appearance = { body: 'male', skin: 7, hair: 'topknot', hairColor: 11, beard: 'braided', build: 'broad', eyes: 5, top: 15, bottom: 0, scar: 'eye' };
  check(g.setAppearance(pid, look) && JSON.stringify(g.serialize(pid).player.appearance) === JSON.stringify(look), 'appearance goes into the save');
  const t2 = solo('druid');
  check(t2.g.applySave(t2.pid, g.serialize(pid)) && JSON.stringify(t2.s.player.appearance) === JSON.stringify(look), 'appearance round-trips save and load');
  check(JSON.stringify(decodeAppearance(encodeAppearance(look))) === JSON.stringify(look) && encodeAppearance(look).length === 10, 'the wire form is ten small numbers and decodes back');
  for (let i = 0; i < 200; i++) if (!isAppearance(randomAppearance())) { check(false, 'random appearances are valid'); break; }

  // the command validates every value
  const before = JSON.stringify(s.player.appearance);
  const bad: number[][] = [[2, 0, 0, 0, 0, 0, 0, 0, 0], [0, 8, 0, 0, 0, 0, 0, 0, 0], [0, 0, 12, 0, 0, 0, 0, 0, 0], [0, 0, 0, 12, 0, 0, 0, 0, 0], [0, 0, 0, 0, BEARDS.length, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, SCARS.length], [0, 0, 0, 0, 0, 0, 0, 0, 0, -1],
    [0, 0, 0, 0, 0, 3, 0, 0, 0], [0, 0, 0, 0, 0, 0, 6, 0, 0], [0, 0, 0, 0, 0, 0, 0, 16, 0], [0, 0, 0, 0, 0, 0, 0, 0, -1], [1, 0, 0, 0, 2, 0, 0, 0, 0], [0, 0.5, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0]];
  for (const ap2 of bad) executeCommand(g, pid, { c: 'appearance', ap: ap2 });
  executeCommand(g, pid, { c: 'appearance', ap: 'junk' as unknown as number[] });
  check(JSON.stringify(s.player.appearance) === before, 'out-of-range, female-with-beard and malformed appearances are refused');
  check(!g.setAppearance(pid, { ...look, skin: 99 }) && !g.setAppearance(pid, { ...look, hair: 'afro' }), 'setAppearance refuses unknown values');
  executeCommand(g, pid, { c: 'appearance', ap: [1, 3, 7, 4, 0, 0, 2, 6, 9] });
  check(s.player.appearance.body === 'female' && s.player.appearance.hair === 'ponytail' && s.player.appearance.top === 6, 'a valid appearance command changes the look');
  check(s.player.appearance.scar === 'none', 'an old nine-number appearance (no scar) still works: no scar');

  // more beards and battle scars (2026-10-23, save v15)
  for (const b of BEARDS) check(g.setAppearance(pid, { ...look, body: 'male', beard: b.id, scar: 'none' }) && s.player.appearance.beard === b.id, `beard "${b.name}" can be chosen`);
  check(BEARDS.length >= 13 && SCARS.length >= 10, 'at least 13 beards and 10 scars to choose from');
  for (const c of SCARS) {
    check(g.setAppearance(pid, { ...look, body: 'male', scar: c.id }) && s.player.appearance.scar === c.id, `scar "${c.name}" can be chosen (male)`);
    check(g.setAppearance(pid, { ...look, body: 'female', beard: 'none', scar: c.id }) && s.player.appearance.scar === c.id, `scar "${c.name}" can be chosen (female)`);
  }
  const before2 = JSON.stringify(s.player.appearance);
  check(!g.setAppearance(pid, { ...look, scar: 'eyepatch' }) && !g.setAppearance(pid, { ...look, beard: 'tentacles' }) && !g.setAppearance(pid, { ...look, body: 'female', beard: 'wild' }), 'unknown scars and beards, and beards on a female body, are refused');
  check(!g.setAppearance(pid, { ...look, scar: undefined as unknown as string }), 'an appearance without a scar field is refused by the command');
  check(JSON.stringify(s.player.appearance) === before2, 'refused appearances change nothing');
  executeCommand(g, pid, { c: 'appearance', ap: [0, 1, 2, 3, BEARDS.findIndex((b) => b.id === 'forked'), 2, 1, 4, 5, SCARS.findIndex((c) => c.id === 'burn')] });
  check(s.player.appearance.beard === 'forked' && s.player.appearance.scar === 'burn', 'the appearance command carries the new beards and scars');
  for (const b of BEARDS) for (const c of SCARS) {
    const x: Appearance = { ...look, body: 'male', beard: b.id, scar: c.id };
    if (JSON.stringify(decodeAppearance(encodeAppearance(x))) !== JSON.stringify(x)) { check(false, `wire round trip ${b.id}/${c.id}`); break; }
  }
  // a v14 save gets "no scar" and keeps every other look field
  const v14 = JSON.parse(JSON.stringify({ ...g.serialize(pid), version: 14 })) as Record<string, unknown>;
  const ap14 = (v14.player as Record<string, unknown>).appearance as Record<string, unknown>;
  delete ap14.scar;
  const m14 = migrateSave(v14);
  check(typeof m14 !== 'string' && m14.from === 14 && m14.data.player.appearance?.scar === 'none' && m14.data.player.appearance?.beard === 'forked' && isAppearance(m14.data.player.appearance), 'save v14 → v15: no scar, every other look field kept');
  check(sanitizeAppearance({ ...look, scar: 'nope' }).scar === 'none' && sanitizeAppearance({ ...look, scar: 'jaw' }).scar === 'jaw', 'stored looks with an unknown scar fall back to none');

  // other players see it (online snapshot → mirror)
  const other = g.addPlayer('Watcher', { intent: new BufferedIntent() });
  other.player.placeAt(s.player.x + 1, s.player.y, s.player.z);
  const mirror = new Game({ simulate: false });
  mirror.localId = other.id;
  const looks: number[] = [];
  mirror.events.on((e: GameEvent) => { if (e.type === 'lookChanged' && e.id === pid) looks.push(e.id); });
  applySnapshot(mirror, buildSnapshot(g, other) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>, { depot: null, trade: null } as unknown as MirrorExtras);
  check(JSON.stringify(mirror.getPlayer(pid)?.appearance) === JSON.stringify(s.player.appearance), 'other players receive the appearance');
  executeCommand(g, pid, { c: 'appearance', ap: [0, 0, 10, 10, 5, 2, 0, 3, 3] });
  const snap2 = buildSnapshot(g, other) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>;
  check(snap2.c.find((c) => c.id === pid)?.ap?.join(',') === '0,0,10,10,5,2,0,3,3,0', 'a change goes out in the next snapshot (ten numbers, scar last)');
  applySnapshot(mirror, snap2, { depot: null, trade: null } as unknown as MirrorExtras);
  check(mirror.getPlayer(pid)?.appearance.hair === 'mohawk' && looks.length >= 2, 'the mirror updates the look and tells the renderer');
  const snap3 = buildSnapshot(g, other) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>;
  check(snap3.c.find((c) => c.id === pid)?.ap === undefined, 'an unchanged look is not sent again');
}

console.log('Capes: the cape slot');
{
  const { g, s, pid } = solo('knight');
  const eq = s.inventory.equipment;
  check(EQUIP_SLOTS.includes('cape') && eq.cape === null, 'a new character has an empty cape slot');
  // a town cape has no requirement: equip from the backpack, take it off again
  s.inventory.add('thornvale_cape', 1);
  executeCommand(g, pid, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === 'thornvale_cape') });
  check(eq.cape?.id === 'thornvale_cape' && s.inventory.count('thornvale_cape') === 0, 'using a cape puts it on the back');
  executeCommand(g, pid, { c: 'unequip', slot: 'cape' });
  check(eq.cape === null && s.inventory.count('thornvale_cape') === 1, 'unequip puts it back in the backpack');
  // drag and drop onto the slot; a wrong item never goes in it
  executeCommand(g, pid, { c: 'equipTo', from: s.inventory.slots.findIndex((x) => x?.id === 'thornvale_cape'), slot: 'cape' });
  check(eq.cape?.id === 'thornvale_cape', 'dropping a cape on the cape slot wears it');
  s.inventory.add('iron_sword', 1);
  executeCommand(g, pid, { c: 'equipTo', from: s.inventory.slots.findIndex((x) => x?.id === 'iron_sword'), slot: 'cape' });
  check(eq.cape?.id === 'thornvale_cape', 'a sword cannot go in the cape slot');
  // a skill cape asks for its skill
  s.inventory.add('bladesworn_cape', 1);
  executeCommand(g, pid, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === 'bladesworn_cape') });
  check(eq.cape?.id === 'thornvale_cape' && s.inventory.count('bladesworn_cape') === 1, 'the Bladesworn Cape is refused below sword 80');
  s.skills.sword.level = 80;
  executeCommand(g, pid, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === 'bladesworn_cape') });
  check(eq.cape?.id === 'bladesworn_cape' && s.inventory.count('thornvale_cape') === 1, 'at sword 80 it swaps with the worn cape');

  // save v13: migration from v12 (no cape slot), round trip
  const v12 = JSON.parse(JSON.stringify({ ...g.serialize(pid), version: 12 })) as Record<string, unknown>;
  delete ((v12.inventory as Record<string, unknown>).equipment as Record<string, unknown>).cape;
  delete v12.feats;
  const m = migrateSave(v12);
  check(typeof m !== 'string' && m.from === 12 && m.data.version === SAVE_VERSION && SAVE_VERSION >= 13 && m.data.inventory.equipment.cape === null && m.lost.length === 0,
    'a v12 save migrates with an empty cape slot and nothing lost');
  const t = solo('druid');
  check(t.g.applySave(t.pid, v12) && t.s.inventory.equipment.cape === null && t.s.inventory.equipment.armor?.id === eq.armor?.id && t.s.bossKills.length === 0, 'the migrated character loads with its gear');
  s.bossKills = ['boss_ironjaw'];
  const t2 = solo('druid');
  check(t2.g.applySave(t2.pid, JSON.parse(JSON.stringify(g.serialize(pid)))) && t2.s.inventory.equipment.cape?.id === 'bladesworn_cape' && t2.s.bossKills[0] === 'boss_ironjaw', 'a worn cape and boss deeds round-trip save and load');

  // others see it (look delta), and the cloak switch hides it from them too
  const other = g.addPlayer('Watcher', { intent: new BufferedIntent() });
  other.player.placeAt(s.player.x + 1, s.player.y, s.player.z);
  const mirror = new Game({ simulate: false });
  mirror.localId = other.id;
  const snapOf = () => buildSnapshot(g, other) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>;
  const ex = { depot: null, trade: null } as unknown as MirrorExtras;
  applySnapshot(mirror, snapOf(), ex);
  check(mirror.sessions.get(pid)?.inventory.equipment.cape?.id === 'bladesworn_cape', 'other players receive the worn cape');
  check(snapOf().c.find((c) => c.id === pid)?.eq === undefined, 'an unchanged cape is not sent again');
  executeCommand(g, pid, { c: 'unequip', slot: 'cape' });
  const sn = snapOf();
  check(sn.c.find((c) => c.id === pid)?.eq?.cape === null, 'taking it off goes out in the next snapshot');
  applySnapshot(mirror, sn, ex);
  check(mirror.sessions.get(pid)?.inventory.equipment.cape === null, 'the mirror takes the cape off');
  s.inventory.removeById('bladesworn_cape', 1);
  eq.cape = { id: 'bladesworn_cape', qty: 1 };
  check(snapOf().c.find((c) => c.id === pid)?.eq?.cape === 'bladesworn_cape', 'putting it on again goes out too');
  executeCommand(g, pid, { c: 'cosmetics', cloak: false });
  check(s.cosmetics.hideCloak && eq.cape?.id === 'bladesworn_cape', 'the cloak switch hides the cape but it stays worn');
  check(snapOf().c.find((c) => c.id === pid)?.eq?.cape === null, 'hiding the cloak hides the cape from others');
  executeCommand(g, pid, { c: 'cosmetics', cloak: true });
  check(snapOf().c.find((c) => c.id === pid)?.eq?.cape === 'bladesworn_cape', 'showing it again sends the cape');

  // death: a worn cape drops like any worn item (about a quarter of the time)
  const kill = () => (g as unknown as { killPlayer(p: unknown, k: null): void }).killPlayer(s.player, null);
  let lost = 0;
  for (let k = 0; k < 60; k++) {
    eq.cape = { id: 'thornvale_cape', qty: 1 };
    s.player.dead = false;
    kill();
    if (!eq.cape) lost++;
  }
  check(lost >= 5 && lost <= 30, `a worn cape drops on death about a quarter of the time (${lost}/60)`);
  const body = g.bags.filter((b) => b.corpse === s.player.name).find((b) => b.items.some((i) => i.id === 'thornvale_cape'));
  check(!!body, 'the dropped cape lies in the dead body');
}

console.log('Test commands for capes, pets and skills');
{
  const { g, s, pid } = solo('knight');
  s.admin = true;
  s.inventory.equipment.backpack = { id: 'backpack', qty: 1 };
  g.say(pid, '/maxskills');
  check(s.skills.sword.level === 100 && s.skills.magic.level === 100 && s.gathering.mining >= 0 && Object.values(s.gathering).every((x) => x > 0), '/maxskills raises every skill');
  g.say(pid, '/pets');
  check(s.inventory.slots.filter((x) => x && /pet/.test(x.id) || false).length >= 1, '/pets gives pet items');
  g.say(pid, '/petlevel 10');
  check(Object.values(s.pets.xp).every((x) => (x ?? 0) > 0) && Object.keys(s.pets.xp).length === 8, '/petlevel sets every pet');
  g.say(pid, '/capes');
  check(s.bossKills.length >= 13, '/capes counts every boss as slain');
}

console.log(failures === 0 ? '\nAll logic checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
