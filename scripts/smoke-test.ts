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
import type { Vocation } from '../src/game/player/vocations';

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
  p.level = 60; p.exp = 2_000_000; g.refreshStats(s); p.mana = p.maxMana;
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
  check(g.serialize(pid).player.showGear === false, 'classic look is saved');
  const mirror = new Game({ simulate: false });
  mirror.localId = 999;
  applySnapshot(mirror, buildSnapshot(g, s) as never);
  check(mirror.getPlayer(pid)?.showGear === false, 'classic look reaches other players');
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

console.log(failures === 0 ? '\nAll logic checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
