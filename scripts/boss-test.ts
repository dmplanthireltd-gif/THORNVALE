/**
 * Headless test for bosses, world bosses and raids: dungeon bosses on the map
 * with their abilities and loot, a world boss on a fast-forwarded schedule
 * (broadcast, loot by contribution, despawn), raids with waves that never
 * enter protection zones, and the game-master commands.
 *   tsx scripts/boss-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import type { GameEvent } from '../src/game/core/events';
import { Enemy } from '../src/game/enemies/Enemy';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { BOSS_UNIQUES, ITEMS } from '../src/game/inventory/items';
import { applySnapshot, buildSnapshot } from '../src/game/net/protocol';
import { expForLevel } from '../src/game/player/Player';
import type { Vocation } from '../src/game/player/vocations';
import type { EnemyKind } from '../src/game/world/WorldMap';
import { floodFill3D } from '../src/game/world/worldGen';
import { DUNGEON_BOSSES, RAID_DURATION, RAIDS, WORLD_BOSS_LIFETIME, WORLD_BOSSES } from '../src/game/bosses/bosses';
import { inLine } from '../src/game/enemies/EnemyAI';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

function hero(g: Game, name: string, voc: Vocation, level: number): Session {
  const s = g.addPlayer(name, { intent: new BufferedIntent(), vocation: voc });
  s.player.level = level;
  s.player.exp = expForLevel(level);
  g.refreshStats(s);
  s.player.hp = s.player.maxHp;
  s.player.mana = s.player.maxMana;
  s.admin = true;
  return s;
}

function openSpot(g: Game, r = 3, from = 20): { x: number; y: number; z: number } {
  const w = g.world;
  for (let y = from; y < w.height - 20; y++) for (let x = 20; x < w.width - 20; x++) {
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!w.isWalkable(x + dx, y + dy, 0) || w.isSafe(x + dx, y + dy, 0) || w.linkAt(x + dx, y + dy, 0)) { ok = false; break; }
    }
    if (ok && !g.isOccupied(x, y, 0)) return { x, y, z: 0 };
  }
  throw new Error('no open spot');
}

const ALL_BOSSES = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].boss);

// ---------------------------------------------------------------- definitions
console.log('Boss definitions');
{
  const dungeon = ALL_BOSSES.filter((k) => ENEMIES[k].boss === 'dungeon');
  const world = ALL_BOSSES.filter((k) => ENEMIES[k].boss === 'world');
  const raid = ALL_BOSSES.filter((k) => ENEMIES[k].boss === 'raid');
  check(dungeon.length === DUNGEON_BOSSES.length && dungeon.length >= 11 && world.length === 3 && raid.length === 4, `${DUNGEON_BOSSES.length} dungeon bosses, 3 world bosses, 4 raid bosses (${dungeon.length}/${world.length}/${raid.length})`);
  check(ALL_BOSSES.every((k) => ENEMIES[k].elite && ENEMIES[k].title && ENEMIES[k].enrage), 'every boss is elite, has a title and enrages');
  const names = new Set(ALL_BOSSES.map((k) => ENEMIES[k].name));
  check(names.size === ALL_BOSSES.length, 'boss names are unique');
  check(dungeon.every((k) => ENEMIES[k].respawn >= 3600 && ENEMIES[k].respawn <= 4 * 3600), 'dungeon bosses respawn after 1–4 hours');
  check(ALL_BOSSES.every((k) => ENEMIES[k].abilities.length >= 2 && ENEMIES[k].abilities.length <= 4), 'every boss has 2–4 special abilities');
  const kinds = new Set(ALL_BOSSES.flatMap((k) => ENEMIES[k].abilities.map((a) => a.kind)));
  check(['nova', 'summon', 'heal', 'wave', 'beam'].every((k) => kinds.has(k as never)), `bosses use novas, summons, heals, waves and beams (${[...kinds].join(', ')})`);
  check(ALL_BOSSES.every((k) => ENEMIES[k].abilities.filter((a) => a.kind === 'summon').every((a) => a.summon && ENEMIES[a.summon] && (a.maxAlive ?? 0) >= (a.count ?? 1))), 'summons name real monsters and a cap');
  check(world.every((k) => ENEMIES[k].maxHp >= 200000), 'world bosses have huge health');
  const guaranteed = dungeon.every((k) => ENEMIES[k].loot.filter((l) => l.chance === 1 && l.id !== 'gold').length >= 3);
  check(guaranteed, 'dungeon bosses always drop rare loot (3+ guaranteed items besides gold)');
  const dropped = new Set(ALL_BOSSES.flatMap((k) => ENEMIES[k].loot.map((l) => l.id)));
  check(BOSS_UNIQUES.every((id) => ITEMS[id] && dropped.has(id)), `all ${BOSS_UNIQUES.length} unique items exist and bosses drop them`);
  check(dungeon.every((k) => ENEMIES[k].loot.some((l) => BOSS_UNIQUES.includes(l.id) && l.chance < 1 && l.chance >= 0.1)), 'every dungeon boss has a chance at its unique item');
  check(BOSS_UNIQUES.every((id) => ITEMS[id].rarity === 'rare' || ITEMS[id].rarity === 'legendary'), 'uniques are rare or legendary');
  // strong but not game-breaking: within a step of the best ordinary item of the same kind
  const best = (pred: (d: typeof ITEMS[string]) => boolean, f: (d: typeof ITEMS[string]) => number) => Math.max(...Object.values(ITEMS).filter((d) => !BOSS_UNIQUES.includes(d.id) && pred(d)).map(f));
  const tooStrong = BOSS_UNIQUES.filter((id) => {
    const d = ITEMS[id];
    if (d.weaponType && d.weaponType !== 'wand' && d.weaponType !== 'rod') return (d.attack ?? 0) > best((o) => o.weaponType === d.weaponType, (o) => o.attack ?? 0) + 4;
    if (d.magicDamage) return d.magicDamage[1] > best((o) => !!o.magicDamage, (o) => o.magicDamage![1]) + 12;
    if (d.armor) return d.armor > best((o) => o.kind === d.kind, (o) => o.armor ?? 0) + 1;
    if (d.defense) return d.defense > best((o) => o.kind === d.kind, (o) => o.defense ?? 0) + 2;
    return false;
  });
  check(tooStrong.length === 0, `uniques are strong but not game-breaking${tooStrong.length ? ` (${tooStrong.join(' ')})` : ''}`);
  try {
    const { LOOKS, SHIELDS, ARMOR_LOOK } = await import('../src/render/models/weapons');
    const { HELMETS, LEGS, BOOTS } = await import('../src/render/models/humanoid');
    const lookless = BOSS_UNIQUES.filter((id) => {
      const d = ITEMS[id];
      return (d.kind === 'weapon' && !LOOKS[id]) || (d.kind === 'shield' && !SHIELDS[id]) || (d.kind === 'armor' && !ARMOR_LOOK[id]) || (d.kind === 'helmet' && !HELMETS[id]) || (d.kind === 'legs' && !LEGS[id]) || (d.kind === 'boots' && !BOOTS[id]);
    });
    check(lookless.length === 0, `every wearable unique has a model${lookless.length ? ` (${lookless.join(' ')})` : ''}`);
    check(BOSS_UNIQUES.every((id) => typeof ITEMS[id].icon === 'string' && ITEMS[id].icon.length > 0), 'every unique has an icon');
    const { buildEnemy, BOSS_LOOK, ENEMY_SCALE } = await import('../src/render/models/rigs');
    const badRig: string[] = [];
    for (const k of ALL_BOSSES) {
      const look = BOSS_LOOK[k];
      if (!look) { badRig.push(`${k}: no look`); continue; }
      const rig = buildEnemy(k);
      let crown = false;
      rig.head.traverse((o) => { if (o !== rig.head && (o as { isMesh?: boolean }).isMesh) crown = true; });
      if (!crown || rig.materials.length < 3) badRig.push(`${k}: no crown`);
      if (!(ENEMY_SCALE[k] > ENEMY_SCALE[look.base])) badRig.push(`${k}: not bigger than a ${look.base}`);
    }
    check(badRig.length === 0, `every boss has its own bigger, recoloured rig with a crown${badRig.length ? ` (${badRig.join('; ')})` : ''}`);
    check(WORLD_BOSSES.every((w) => ENEMY_SCALE[w.kind] >= 3), 'world bosses are colossal');
  } catch (err) {
    console.log(`  skip models: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------- dungeon bosses
console.log('Dungeon bosses');
{
  const g = new Game();
  const placed = g.enemies.filter((e) => e.def.boss === 'dungeon');
  check(placed.length === DUNGEON_BOSSES.length && new Set(placed.map((e) => e.enemyKind)).size === DUNGEON_BOSSES.length, `each dungeon boss is placed once (${placed.length})`);
  const reach = floodFill3D(g.world);
  const wrong = DUNGEON_BOSSES.filter((b) => {
    const e = placed.find((x) => x.enemyKind === b.kind);
    return !e || g.world.regionAt(e.x, e.y, e.z)?.name !== b.region || !reach.at(e.x, e.y, e.z) || g.world.isSafe(e.x, e.y, e.z);
  });
  check(wrong.length === 0, `every dungeon boss waits in its region and can be reached${wrong.length ? ` (${wrong.map((b) => b.kind).join(' ')})` : ''}`);
  const weak = placed.filter((b) => {
    const r = g.world.regionAt(b.x, b.y, b.z)!;
    const kin = g.enemies.filter((e) => !e.def.boss && e.z === b.z && e.x >= r.x0 && e.x <= r.x1 && e.y >= r.y0 && e.y <= r.y1);
    return kin.length > 0 && b.maxHp < 4 * Math.max(...kin.map((e) => e.maxHp));
  });
  check(weak.length === 0, `dungeon bosses have at least 4× the health of anything else in their dungeon${weak.length ? ` (${weak.map((b) => b.enemyKind).join(' ')})` : ''}`);

  // abilities against a god-mode knight next to the boss
  const k = hero(g, 'Bosshunter', 'knight', 150);
  const at = openSpot(g, 4);
  k.player.placeAt(at.x, at.y, 0);
  k.player.god = true;
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  const boss = g.spawnBossNear(k.player, 'boss_ironjaw')!;
  check(!!boss && boss.dynamic && g.dist(boss, k.player) <= 4, '/boss-style spawn puts a boss next to the player');
  const summon = boss.def.abilities.find((a) => a.kind === 'summon')!;
  g.useAbility(boss, summon, k.player);
  g.useAbility(boss, summon, k.player);
  g.useAbility(boss, summon, k.player);
  const adds = g.enemies.filter((e) => e.masterId === boss.id);
  check(adds.length === summon.maxAlive && adds.every((a) => a.enemyKind === summon.summon && a.noReward), `the boss summons ${summon.summon}s, never more than ${summon.maxAlive} (${adds.length})`);
  let fired = 0;
  for (const kind of ALL_BOSSES) {
    const e = g.spawnEnemy(kind, at.x + 2, at.y, 0, { tag: 'test', radius: 3 })!;
    for (const a of e.def.abilities) { g.useAbility(e, a, k.player); fired++; }
    g.despawnEnemy(e);
  }
  g.update(0.05); // despawned test bosses leave at the end of the update
  check(fired >= ALL_BOSSES.length * 2, `${fired} boss abilities used without errors`);
  // wave and beam reach the player along the line
  check(inLine({ x: 10, y: 10 } as Enemy, { x: 13, y: 11 } as Enemy, 'wave', 5) && !inLine({ x: 10, y: 10 } as Enemy, { x: 13, y: 11 } as Enemy, 'beam', 5) && inLine({ x: 10, y: 10 } as Enemy, { x: 10, y: 14 } as Enemy, 'beam', 5), 'waves reach a cone, beams a straight line');
  k.player.god = false;
  k.player.hp = k.player.maxHp = 100000;
  let gor: Enemy | null = null;
  for (let dx = 2; dx <= 5 && !gor; dx++) gor = g.spawnEnemy('boss_labyrinth_lord', k.player.x + dx, k.player.y, 0, { tag: 'test', radius: 0 });
  if (gor) {
    const hp0 = k.player.hp;
    g.useAbility(gor, gor.def.abilities.find((a) => a.kind === 'beam')!, k.player);
    check(k.player.hp < hp0 && events.some((e) => e.type === 'tiles'), 'a beam hits the player standing in line');
    g.despawnEnemy(gor);
  } else check(false, 'room for the beam test');
  k.player.god = true;
  // enrage below 30%
  boss.damageBy.clear();
  const dealt = Math.ceil(boss.hp - boss.maxHp * 0.25);
  (g as unknown as { applyDamage(t: unknown, s: unknown, r: unknown, el: string): void }).applyDamage(boss, k.player, { amount: dealt, result: 'hit' }, 'physical');
  check(boss.rage > 1 && events.some((e) => e.type === 'chat' && e.id === boss.id && /ENRAGED/.test(e.text)), 'below 30% health the boss enrages');

  // loot on death: bag with gold and guaranteed rares; the helpers fall with it
  const bags0 = g.bags.length;
  const exp0 = k.player.exp;
  g.adminKill(k.player, boss);
  g.update(0.05);
  const bag = g.bags.find((b) => b.x === boss.x && b.y === boss.y);
  const ids = new Set(bag?.items.map((i) => i.id));
  check(g.bags.length > bags0 && ids.has('gold') && ids.has('orc_banner') && ids.has('orc_warhelm'), `boss loot drops: ${bag?.items.map((i) => i.id).join(', ')}`);
  check(k.player.exp > exp0, 'slaying the boss gives experience');
  check(g.enemies.filter((e) => e.masterId === boss.id && !e.dead).length === 0, 'its summoned helpers vanish with it');
  // a summoned helper gives nothing
  const wrongFoe = g.spawnEnemy('orc', at.x - 2, at.y, 0, { tag: 'summon', noReward: true })!;
  const exp1 = k.player.exp;
  const bags1 = g.bags.length;
  g.adminKill(k.player, wrongFoe);
  check(k.player.exp === exp1 && g.bags.length === bags1, 'summoned helpers give no experience and no loot');
  // dungeon boss respawn after 1–4 hours with jitter
  const wyrm = placed.find((e) => e.enemyKind === 'boss_rime_wyrm')!;
  g.adminKill(k.player, wyrm);
  const rt = wyrm.respawnTimer;
  check(rt >= wyrm.def.respawn * 0.9 && rt <= wyrm.def.respawn * 1.1, `a slain dungeon boss returns after ${Math.round(rt / 60)} minutes`);
  check(events.some((e) => e.type === 'announce' && e.style === 'boss' && /Hrimgaard/.test(e.text)), 'a dungeon boss kill is announced to everyone');
  // dead dynamic monsters leave once their corpse fades; clients are told
  for (let i = 0; i < 30 * 20; i++) g.update(0.05);
  check(!g.enemies.includes(boss) && events.some((e) => e.type === 'despawn' && e.id === boss.id), 'a /boss corpse leaves the world and clients hear about it');
  check(g.enemies.includes(wyrm) && wyrm.dead, 'map bosses stay (dead) until they respawn');
}

// ---------------------------------------------------------------- world bosses
console.log('World bosses');
{
  const g = new Game();
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  const we = g.worldEvents;
  check(we.nextWorldBoss >= 3 * 3600 && we.nextWorldBoss <= 6 * 3600, `first world boss in ${Math.round(we.nextWorldBoss / 60)} minutes (3–6 hours)`);
  we.nextRaid = 1e9; // keep raids out of this part
  // fast-forward the schedule
  const steps = Math.ceil(we.nextWorldBoss / 5) + 2;
  for (let i = 0; i < steps && !we.worldBoss; i++) g.update(5);
  const wb = we.worldBoss;
  check(!!wb, 'a world boss appears on schedule');
  if (wb) {
    const e = wb.enemy;
    check(wb.def.spots.some((sp) => Math.max(Math.abs(sp.x - e.x), Math.abs(sp.y - e.y)) <= 8 && sp.z === e.z), `at one of its spots (${e.enemyKind} at ${e.x}, ${e.y})`);
    check(events.some((ev) => ev.type === 'announce' && ev.big && /trembles/.test(ev.title) && /has awakened near/.test(ev.text)), 'the whole server hears it awaken');
    check(g.enemies.filter((x) => x.masterId === e.id).length >= 3, 'helpers rise with it');
    check(g.worldMarks().some((m) => m.kind === 'worldboss'), 'the world map marks it');
    // three players: a big hitter, a small hitter and a healer
    const a = hero(g, 'Bigaxe', 'knight', 200);
    const b = hero(g, 'Littlebow', 'paladin', 120);
    const c = hero(g, 'Mender', 'druid', 150);
    for (const s of [a, b, c]) { s.player.placeAt(e.x + 2, e.y + 2, e.z); s.player.god = true; }
    a.player.placeAt(e.x + 1, e.y, e.z);
    b.player.placeAt(e.x - 1, e.y, e.z);
    c.player.placeAt(e.x, e.y + 2, e.z);
    // the client learns about the boss from the snapshot (monsters spawned at run time carry their kind)
    const mirror = new Game({ simulate: false });
    mirror.localId = a.id;
    applySnapshot(mirror, buildSnapshot(g, a) as Extract<ReturnType<typeof buildSnapshot>, { t: 'snap' }>);
    const me = mirror.getEnemy(e.id);
    check(!!me && me.enemyKind === e.enemyKind && me.def.title === e.def.title, 'a client mirror adds the world boss with its kind and title');
    check(mirror.worldMarks().some((m) => m.kind === 'worldboss' && /Gorrumvald|Vaelith|Nhalgrith/.test(m.name)), 'and the world map marker reaches the client');
    e.damageBy.set(b.id, Math.round(e.maxHp * 0.04));
    g.worldEvents.onDamage(e, a.player);
    // the druid heals the knight who is fighting it (a real Heal Friend)
    a.player.god = false;
    a.player.hp = Math.round(a.player.maxHp / 3);
    c.spells.add('exura_sio');
    c.player.placeAt(a.player.x, a.player.y + 1, a.player.z);
    c.player.groupCooldowns.heal = 0;
    g.castSpell(c.id, 'exura_sio', a.player.name);
    check(wb.healing.get(c.id)! > 0, `healing a fighter counts as contribution (${wb.healing.get(c.id)})`);
    // a long fight's worth of healing (each heal counts double: bosses/bosses.ts HEAL_WEIGHT)
    const h0 = wb.healing.get(c.id)!;
    for (let i = 0; i < 20; i++) g.worldEvents.onHeal(c.player, a.player, 300);
    check(wb.healing.get(c.id) === h0 + 2 * 20 * 300, 'healing counts double');
    g.worldEvents.onHeal(c.player, b.player, 300);
    check(wb.healing.get(c.id) === h0 + 2 * 20 * 300, 'heals on a player who never fought it do not count');
    a.player.god = true;
    const expA = a.player.exp, expB = b.player.exp, expC = c.player.exp;
    const invA = a.inventory.count('gold'), invB = b.inventory.count('gold'), invC = c.inventory.count('gold');
    g.adminKill(a.player, e);
    g.update(0.05);
    check(a.player.exp - expA > 10 * (b.player.exp - expB) && b.player.exp > expB && c.player.exp === expC, 'experience is shared by damage');
    check(a.inventory.count('gold') > invA && b.inventory.count('gold') > invB && c.inventory.count('gold') > invC, `every contributor gets a personal loot bag in their backpack (gold +${a.inventory.count('gold') - invA} / +${b.inventory.count('gold') - invB} / +${c.inventory.count('gold') - invC})`);
    check(a.inventory.count('gold') - invA > b.inventory.count('gold') - invB, 'a bigger share brings more gold');
    check(!g.bags.some((bg) => bg.x === e.x && bg.y === e.y), 'nothing is left on the ground for others to grab');
    check(events.some((ev) => ev.type === 'message' && ev.to === c.id && /share of the spoils/.test(ev.text)), 'the healer is told about their share');
    check(events.some((ev) => ev.type === 'announce' && /has been slain/.test(ev.text)), 'its death is announced');
    check(g.enemies.filter((x) => x.masterId === e.id && !x.dead).length === 0, 'its helpers leave with it');
    check(!g.worldMarks().some((m) => m.kind === 'worldboss'), 'the map marker goes away');
    check(we.nextWorldBoss >= 3 * 3600, 'the next world boss is scheduled 3–6 hours later');
    // a full backpack spills into the depot
    const full = hero(g, 'Packrat', 'knight', 100);
    while (full.inventory.add('spear', 100) === 0) { /* fill the backpack */ }
    we.deliver(full, [{ id: 'gold', qty: 500 }, { id: 'small_diamond', qty: 2 }], 'Test share');
    check(full.depot.some((x) => x?.id === 'small_diamond'), 'when the backpack is full, the share goes to the depot');
  }
  // one that nobody kills leaves after 45 minutes
  for (let i = 0; i < 400; i++) g.update(0.05);
  we.nextWorldBoss = 1;
  g.update(2);
  const wb2 = we.worldBoss;
  check(!!wb2 && !wb2.enemy.dead, 'the next world boss wakes when its time comes');
  if (wb2) {
    const id = wb2.enemy.id;
    for (let t = 0; t < WORLD_BOSS_LIFETIME + 10; t += 2) g.update(2);
    check(!we.worldBoss && !g.enemies.some((x) => x.id === id) && events.some((ev) => ev.type === 'despawn' && ev.id === id), 'an unkilled world boss despawns after 45 minutes');
    check(events.some((ev) => ev.type === 'announce' && /sinks back/.test(ev.text)), 'and the server is told');
  }
}

// ---------------------------------------------------------------- raids
console.log('Raids');
{
  const g = new Game();
  const events: GameEvent[] = [];
  g.events.on((e) => events.push(e));
  const we = g.worldEvents;
  we.nextWorldBoss = 1e9;
  check(we.nextRaid >= 2 * 3600 && we.nextRaid <= 4 * 3600, `first raid in ${Math.round(we.nextRaid / 60)} minutes (2–4 hours)`);
  const steps = Math.ceil(we.nextRaid / 5) + 2;
  for (let i = 0; i < steps && !we.raid; i++) g.update(5);
  check(!!we.raid && we.raid.t < 0, 'a raid is announced on schedule');
  check(events.some((e) => e.type === 'announce' && e.style === 'raid' && e.big), 'with a server-wide warning');
  check(g.worldMarks().some((m) => m.kind === 'raid'), 'the world map marks the raid');
  check(!we.startRaid(RAIDS[0]), 'only one raid at a time');
  // every raid runs: warning, 2–4 waves, a boss, an end after 20 minutes
  for (const def of RAIDS) {
    if (we.raid) { (we as unknown as { endRaid(w: boolean): void }).endRaid(false); g.update(0.05); }
    const warned = events.length;
    check(we.startRaid(def), `${def.name}: starts`);
    check(events.slice(warned).some((e) => e.type === 'announce' && e.text === def.warning), `${def.name}: warning "${def.warning}"`);
    // a player waits at the edge of the protection zone so raiders come for them
    const town = g.world.regions.find((r) => r.name === def.target)!;
    const s = hero(g, `Guard${def.id.slice(0, 4)}`, 'knight', 120);
    s.player.god = true;
    let edge: { x: number; y: number } | null = null;
    for (let x = town.x0; x <= town.x1 && !edge; x++) for (const y of [town.y0, town.y1]) if (g.world.isWalkable(x, y, 0) && g.world.isSafe(x, y, 0)) { edge = { x, y }; break; }
    if (edge) s.player.placeAt(edge.x, edge.y, 0);
    let inPz = 0;
    let maxAlive = 0;
    let bossSeen = false;
    const raid = we.raid!;
    for (let t = 0; t < 400 * 20 && we.raid; t++) {
      g.update(0.25);
      if (t % 4) continue;
      let alive = 0;
      for (const e of g.enemies) {
        if (!raid.ids.has(e.id) || e.dead) continue;
        alive++;
        if (g.world.isSafe(e.x, e.y, e.z)) inPz++;
        if (e.enemyKind === def.boss) bossSeen = true;
      }
      maxAlive = Math.max(maxAlive, alive);
      if (raid.t > 700 && bossSeen) break;
    }
    check(raid.waves === def.waves.length && def.waves.length >= 2 && def.waves.length <= 4, `${def.name}: ${raid.waves} waves came`);
    check(maxAlive >= 15, `${def.name}: raiders spawned (${maxAlive} at once)`);
    check(bossSeen && !!raid.boss && raid.boss.enemyKind === def.boss, `${def.name}: ${ENEMIES[def.boss].name} leads the last wave`);
    check(inPz === 0, `${def.name}: no raider ever stood in a protection zone`);
    // run out the clock: leftovers despawn and the raid ends
    const ids = [...raid.ids];
    for (let t = 0; t < (RAID_DURATION + 30) * 2 && we.raid; t++) g.update(0.5);
    g.update(0.05);
    check(!we.raid, `${def.name}: ends after 20 minutes`);
    check(!g.enemies.some((e) => ids.includes(e.id) && !e.dead), `${def.name}: leftover raiders despawn`);
    g.removePlayer(s.id);
  }
  check(we.nextRaid >= 2 * 3600 && we.nextRaid <= 4 * 3600, 'the next raid is scheduled 2–4 hours later');
  // killing the raid boss and every raider ends it early
  we.startRaid(RAIDS[0], 0);
  const k = hero(g, 'Raidbreaker', 'knight', 200);
  for (let i = 0; i < 20 * 700 && we.raid && we.raid.waves < RAIDS[0].waves.length; i++) g.update(0.5);
  const r = we.raid!;
  for (const e of g.enemies.filter((x) => r.ids.has(x.id) && !x.dead)) g.adminKill(k.player, e);
  g.update(0.05);
  check(!we.raid && events.some((e) => e.type === 'announce' && e.text === RAIDS[0].victory), 'slaying the raid boss and the last raiders ends the raid in victory');
}

// ---------------------------------------------------------------- admin commands
console.log('Game-master commands');
{
  const g = new Game();
  const gm = hero(g, 'Gamemaster', 'knight', 100);
  const tester = hero(g, 'Tester', 'knight', 100);
  tester.testOnly = true;
  const at = openSpot(g, 4, 200);
  gm.player.placeAt(at.x, at.y, 0);
  tester.player.placeAt(at.x, at.y + 3, 0);
  const said: Record<number, string[]> = {};
  g.events.on((e) => { if (e.type === 'message') (said[e.to] ??= []).push(e.text); });
  const last = (s: Session) => (said[s.id] ?? []).slice(-1)[0] ?? '';
  const n0 = g.enemies.length;
  g.say(gm.id, '/boss ironjaw');
  const spawned = g.enemies.slice(n0).find((e) => e.enemyKind === 'boss_ironjaw');
  check(!!spawned && g.dist(spawned, gm.player) <= 4, `/boss ironjaw spawns Ughrak Ironjaw next to the game master (${last(gm)})`);
  g.say(tester.id, '/boss hrimgaard');
  check(!g.enemies.some((e) => e.enemyKind === 'boss_rime_wyrm' && e.dynamic) && /Only game masters/.test(last(tester)), '/boss is for game masters only');
  g.say(tester.id, '/raid orc');
  check(!g.worldEvents.raid && /Only game masters/.test(last(tester)), 'outside test mode, testers cannot start raids');
  g.say(tester.id, '/worldboss gorrumvald');
  check(!g.worldEvents.worldBoss, 'or wake world bosses');
  g.say(tester.id, '/events');
  check(/Only game masters/.test(last(tester)), 'or read the timers');
  g.say(gm.id, '/events');
  check((said[gm.id] ?? []).some((l) => /Next world boss in \d+ min/.test(l)) && (said[gm.id] ?? []).some((l) => /Next raid in \d+ min/.test(l)) && (said[gm.id] ?? []).some((l) => /Hrimgaard, the Rime Wyrm \(Frost Dragon Lair\): alive/.test(l)), '/events lists world boss, raid and dungeon boss timers');
  g.say(gm.id, '/raid scarab');
  check(g.worldEvents.raid?.def.id === 'scarab_swarm' && g.worldEvents.raid.t === -30, '/raid scarab starts the scarab swarm after a 30 s warning');
  g.say(gm.id, '/worldboss vaelith');
  check(g.worldEvents.worldBoss?.def.kind === 'wb_storm_serpent', '/worldboss vaelith wakes the Storm Serpent');
  g.say(gm.id, '/worldboss nonsense');
  check(/World bosses:/.test(last(gm)), 'an unknown world boss lists the right names');
  // test mode: everyone may start raids and world bosses, still not /boss
  const t = new Game({ testMode: true });
  const tt = hero(t, 'Tester', 'knight', 50);
  tt.testOnly = true;
  t.say(tt.id, '/raid restless dead');
  check(t.worldEvents.raid?.def.id === 'restless_dead', 'in test mode everyone may use /raid');
  t.say(tt.id, '/worldboss blight');
  check(t.worldEvents.worldBoss?.def.kind === 'wb_blight_mother', 'and /worldboss');
  const before = t.enemies.length;
  t.say(tt.id, '/boss ironjaw');
  check(t.enemies.length === before, 'but not /boss');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll boss checks passed.');
process.exit(failures ? 1 : 0);
