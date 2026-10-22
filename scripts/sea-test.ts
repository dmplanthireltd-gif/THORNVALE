/**
 * The Sunken Reach (src/game/world/sea.ts): content and a walk-through.
 *   - every sea monster is defined, dropped loot exists, every sea material has a buyer
 *   - spawns stand on open sea floor, can be reached, and come in groups
 *   - the whirlpool and the bubble column link Pearl Pier and Pearl Grotto both ways
 *   - a player walks onto the whirlpool, lands on the sea floor, and rides the bubbles back up
 *   tsx scripts/sea-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game } from '../src/game/Game';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { ITEMS } from '../src/game/inventory/items';
import { SEA_MATERIAL_IDS, SEA_UNIQUES } from '../src/game/inventory/seaItems';
import { SET_BY_ID } from '../src/game/inventory/sets';
import { NPCS } from '../src/game/npc/npcs';
import { DUNGEON_BOSSES } from '../src/game/bosses/bosses';
import { floodFill3D } from '../src/game/world/worldGen';
import { Ground, Obj } from '../src/game/world/WorldMap';
import {
  isUnderwater, SEA_ARRIVAL, SEA_BOSS_REGION, SEA_BOX, SEA_CHESTS, SEA_COLUMN, SEA_DIVER, SEA_GROTTO, SEA_KINDS, SEA_PIER, SEA_SURFACE, SEA_WHIRLPOOL, SEA_Z,
} from '../src/game/world/sea';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const g = new Game();
const w = g.world;
const inBox = (s: { x: number; y: number; z: number }) => s.z === SEA_Z && s.x >= SEA_BOX.x0 && s.x <= SEA_BOX.x1 && s.y >= SEA_BOX.y0 && s.y <= SEA_BOX.y1;

console.log('Sea monsters and loot');
{
  check(SEA_KINDS.every((k) => ENEMIES[k] && ENEMIES[k].kind === k), `${SEA_KINDS.length} sea monsters defined`);
  const regular = SEA_KINDS.filter((k) => !ENEMIES[k].boss);
  check(regular.every((k) => ENEMIES[k].exp >= 100 && ENEMIES[k].exp <= 700), 'sea monsters give mid-level experience (100–700)');
  check(ENEMIES.lantern_jelly.maxHp < 250 && ENEMIES.blight_jelly.maxHp < 250, 'jellies are fragile (made for area damage)');
  check(ENEMIES.ironshell_crab.armor >= 30 && ENEMIES.ironshell_crab.maxHp >= 900, 'the ironshell crab is a tank');
  check(ENEMIES.gloom_eel.stepTime < 0.3, 'the gloom eel is fast');
  check(ENEMIES.deepfin_harpooner.kite && ENEMIES.deepfin_harpooner.abilities.some((a) => a.kind === 'ranged' && a.range >= 4), 'harpooners throw from range');
  check(ENEMIES.deepfin_tidecaller.abilities.some((a) => a.kind === 'heal') && ENEMIES.deepfin_tidecaller.abilities.some((a) => a.element === 'ice'), 'tidecallers heal and cast water magic');
  check(ENEMIES.lantern_jelly.abilities.some((a) => a.element === 'energy') && ENEMIES.blight_jelly.abilities.some((a) => a.element === 'earth'), 'jellies sting with energy or poison');
  const boss = ENEMIES.boss_drowned_tyrant;
  check(boss.boss === 'dungeon' && DUNGEON_BOSSES.some((b) => b.kind === 'boss_drowned_tyrant' && b.region === SEA_BOSS_REGION), 'Ulmaroth is a dungeon boss of the Drowned Crown');
  const bad = SEA_KINDS.flatMap((k) => ENEMIES[k].loot.filter((l) => !ITEMS[l.id]).map((l) => `${k}:${l.id}`));
  check(bad.length === 0, `all sea loot exists${bad.length ? ` (${bad.join(' ')})` : ''}`);
  const dropped = new Set(SEA_KINDS.flatMap((k) => ENEMIES[k].loot.map((l) => l.id)));
  check(SEA_MATERIAL_IDS.every((id) => dropped.has(id)), 'every sea material drops in the Sunken Reach');
  check(SEA_UNIQUES.every((id) => boss.loot.some((l) => l.id === id && l.chance >= 0.1 && l.chance < 1)), "Ulmaroth drops his two uniques");
  check(SET_BY_ID.tidewrought?.pieces.every((id) => dropped.has(id)), 'every Tidewrought piece drops down there');
  const diver = NPCS[SEA_DIVER];
  check(!!diver && SEA_MATERIAL_IDS.every((id) => diver.buys?.includes(id)), 'Nerissa buys every sea material');
  const bankers = Object.values(NPCS).filter((n) => n.bank);
  check(bankers.length > 3 && bankers.every((n) => n.buys?.includes('pearl') && n.buys?.includes('black_pearl')), 'bankers buy pearls');
  check(SEA_MATERIAL_IDS.every((id) => Object.values(NPCS).filter((n) => n.buys?.includes(id)).length >= 2), 'every sea material has several buyers');
  check(/whirlpool/i.test(diver?.greeting ?? '') && /bubble/i.test(diver?.greeting ?? ''), 'Nerissa explains the way down and back up');
}

console.log('Sea floor and spawns');
{
  check(!!w.sea && w.sea.z === SEA_Z, 'the world has a sea layout');
  const reach = floodFill3D(w);
  const sp = w.spawns.filter(inBox);
  check(sp.length >= 80, `${sp.length} monsters on the sea floor`);
  check(SEA_KINDS.every((k) => sp.some((s) => s.kind === k)), 'every sea kind is placed');
  check(sp.every((s) => w.isWalkable(s.x, s.y, s.z) && w.getObj(s.x, s.y, s.z) === Obj.None && !w.isSafe(s.x, s.y, s.z) && !w.linkAt(s.x, s.y, s.z)), 'every spawn stands on open, unsafe floor');
  check(sp.every((s) => reach.at(s.x, s.y, s.z)), 'every spawn can be reached');
  check(new Set(sp.map((s) => `${s.x},${s.y}`)).size === sp.length, 'no two spawns share a tile');
  const grouped = sp.filter((s) => s.kind !== 'boss_drowned_tyrant' && sp.some((o) => o !== s && Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) <= 3)).length;
  check(grouped >= (sp.length - 1) * 0.9, `monsters come in groups (${grouped}/${sp.length - 1} have company within 3 tiles)`);
  const jellies = sp.filter((s) => s.kind === 'lantern_jelly' || s.kind === 'blight_jelly');
  const packed = jellies.filter((s) => jellies.filter((o) => (o.x - s.x) ** 2 + (o.y - s.y) ** 2 <= 9 + 3).length >= 3).length;
  check(packed >= jellies.length * 0.7, `jelly swarms fit an area rune (${packed}/${jellies.length} with 2+ others in a radius-3 blast)`);
  let open = 0, wet = 0, outside = 0;
  for (let y = SEA_BOX.y0; y <= SEA_BOX.y1; y++) for (let x = SEA_BOX.x0; x <= SEA_BOX.x1; x++) {
    const gr = w.getGround(x, y, SEA_Z);
    if (gr === Ground.Void) continue;
    open++;
    const top = w.getGround(x, y, 0);
    if (top === Ground.Water || top === Ground.DeepWater || (top === Ground.Wood && w.regionAt(x, y, 0)?.name === SEA_PIER)) wet++;
    if (!isUnderwater(w, x, y, SEA_Z)) outside++;
  }
  check(open > 1500 && wet === open, `the sea floor (${open} tiles) lies only under open sea`);
  check(outside === 0, 'every sea-floor tile counts as underwater');
  const unreached: string[] = [];
  for (let y = SEA_BOX.y0; y <= SEA_BOX.y1; y++) for (let x = SEA_BOX.x0; x <= SEA_BOX.x1; x++) if (w.isWalkable(x, y, SEA_Z) && !reach.at(x, y, SEA_Z)) unreached.push(`${x},${y}`);
  check(unreached.length === 0, `no sealed-off scraps of sea floor${unreached.length ? ` (${unreached.slice(0, 5).join(' ')})` : ''}`);
  const chests = w.chests.filter((c) => c.id.startsWith('sea_'));
  check(chests.length === SEA_CHESTS.length && chests.every((c) => c.items.every((i) => ITEMS[i.id] && i.qty > 0)), `${chests.length} treasure chests with real items`);
  check(chests.every((c) => [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => reach.at(c.x + dx, c.y + dy, c.z))), 'every chest can be reached');
  const hulls = w.sea!.wrecks;
  check(hulls.length >= 2 && hulls.every((h) => { let n = 0; for (let y = h.y0; y <= h.y1; y++) for (let x = h.x0; x <= h.x1; x++) if (w.getObj(x, y, SEA_Z) === Obj.Hull) n++; return n > 10; }), 'two wrecks with planked hulls');
  const bossAt = sp.find((s) => s.kind === 'boss_drowned_tyrant')!;
  check(w.regionAt(bossAt.x, bossAt.y, bossAt.z)?.name === SEA_BOSS_REGION, 'Ulmaroth waits inside the Drowned Crown');
  check(w.sea!.props.length > 200 && w.sea!.props.some((p) => p.k === 'kelp') && w.sea!.props.some((p) => p.k === 'coralBranch'), `${w.sea!.props.length} reef props (kelp, coral, …)`);
  check(w.sea!.props.every((p) => w.getGround(p.x, p.y, SEA_Z) !== Ground.Void), 'every prop stands on the sea floor');
}

console.log('Links');
{
  const down = w.linkAt(SEA_WHIRLPOOL.x, SEA_WHIRLPOOL.y, SEA_WHIRLPOOL.z);
  const up = w.linkAt(SEA_COLUMN.x, SEA_COLUMN.y, SEA_COLUMN.z);
  check(w.getObj(SEA_WHIRLPOOL.x, SEA_WHIRLPOOL.y, 0) === Obj.Whirlpool && w.getObj(SEA_COLUMN.x, SEA_COLUMN.y, SEA_Z) === Obj.Whirlpool, 'whirlpool on the pier, bubble column under it');
  check(!!down && down.kind === 'walk' && down.to.x === SEA_ARRIVAL.x && down.to.y === SEA_ARRIVAL.y && down.to.z === SEA_Z, 'the whirlpool leads down to Pearl Grotto');
  check(!!up && up.kind === 'walk' && up.to.x === SEA_SURFACE.x && up.to.y === SEA_SURFACE.y && up.to.z === 0, 'the bubble column leads back up to the pier');
  check(w.isWalkable(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z) && !w.linkAt(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z) && w.isWalkable(SEA_SURFACE.x, SEA_SURFACE.y, 0) && !w.linkAt(SEA_SURFACE.x, SEA_SURFACE.y, 0), 'both landing tiles are open');
  check(w.regionAt(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z)?.name === SEA_GROTTO && w.isSafe(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z), 'you land in a protection zone');
  check(w.regionAt(SEA_SURFACE.x, SEA_SURFACE.y, 0)?.name === SEA_PIER && w.isSafe(SEA_SURFACE.x, SEA_SURFACE.y, 0), 'Pearl Pier is a protection zone');
  const reach = floodFill3D(w);
  check(reach.at(SEA_SURFACE.x, SEA_SURFACE.y, 0) && reach.at(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z), 'the pier is reached on foot from the mainland and the grotto through the whirlpool');
  const diver = w.npcs.find((n) => n.key === SEA_DIVER);
  check(!!diver && w.regionAt(diver.x, diver.y, diver.z)?.name === SEA_PIER, 'Nerissa stands on the pier');
  check(isUnderwater(w, SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_Z) && !isUnderwater(w, SEA_SURFACE.x, SEA_SURFACE.y, 0), 'underwater below, dry on the pier');
}

console.log('Diving (walk-through)');
{
  const s = g.addPlayer('Diver', { intent: new BufferedIntent(), vocation: 'knight' });
  g.localId = s.id;
  const p = s.player;
  p.god = true;
  p.placeAt(SEA_SURFACE.x, SEA_SURFACE.y, 0);
  const msgs: string[] = [];
  g.events.on((e) => { if (e.type === 'message' && e.to === s.id) msgs.push(e.text); });
  const run = (sec: number, until: () => boolean) => { for (let t = 0; t < sec && !until(); t += 1 / 30) g.update(1 / 30); };
  g.tryStep(p, SEA_WHIRLPOOL.x - p.x, SEA_WHIRLPOOL.y - p.y);
  run(3, () => p.z === SEA_Z);
  check(p.z === SEA_Z && p.x === SEA_ARRIVAL.x && p.y === SEA_ARRIVAL.y, `stepping into the whirlpool lands you in Pearl Grotto (${p.x},${p.y},${p.z})`);
  check(msgs.some((t) => /Sunken Reach/.test(t)), 'a message tells you where you are');
  // walk into the bubble column (two tiles north)
  for (let k = 0; k < 4 && p.z === SEA_Z; k++) {
    g.tryStep(p, Math.sign(SEA_COLUMN.x - p.x), Math.sign(SEA_COLUMN.y - p.y));
    run(2, () => !p.moving);
  }
  run(1, () => p.z === 0);
  check(p.z === 0 && p.x === SEA_SURFACE.x && p.y === SEA_SURFACE.y, `the bubble column carries you back up to the pier (${p.x},${p.y},${p.z})`);
  check(msgs.some((t) => /Pearl Pier/.test(t)), 'and says so');
  // monsters never use the whirlpool or enter the grotto
  const near = g.enemies.filter((e) => e.z === SEA_Z && Math.abs(e.x - SEA_ARRIVAL.x) <= 6 && Math.abs(e.y - SEA_ARRIVAL.y) <= 5);
  check(near.every((e) => !w.isSafe(e.x, e.y, e.z)), 'no monster inside Pearl Grotto');
}

console.log(failures ? `\n${failures} sea check(s) FAILED` : '\nAll Sunken Reach checks passed.');
process.exit(failures ? 1 : 0);
