/**
 * Grand Thornvale (world/grandCity.ts): the spawn city rebuilt round a fountain ten
 * times wider (4 → 40 tiles) with the Gilded Exchange on its island. Checks the shape,
 * that every building, NPC, monster, door, locker and station is still there and can be
 * walked to, that the Exchange is entered only by its doorways over the bridges, the
 * sewer stairs, the roads out of town, the start-island → Thornvale walk, the protection
 * zones, and that characters saved inside the rebuilt city wake safely at the temple.
 *   tsx scripts/grandcity-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game } from '../src/game/Game';
import { chebyshev, DIRS8 } from '../src/game/core/types';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import {
  CITY_BOX, EXCHANGE_CLERKS, EXCHANGE_HOUSE, EXCHANGE_NAME, fountainPart, GRAND_CX, GRAND_CY, GRAND_PLAZA, GRAND_R, GRAND_TEMPLE, inGrandCore,
} from '../src/game/world/grandCity';
import { floodFill3D } from '../src/game/world/worldGen';
import { Ground, Obj, type WorldMap } from '../src/game/world/WorldMap';

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
const reach = floodFill3D(w);
const near = (x: number, y: number, z: number) => DIRS8.some(([dx, dy]) => reach.at(x + dx, y + dy, z));

/** Tiles reachable on one floor from a start, by the game's own step rule; `block` closes extra tiles. */
function flood2D(m: WorldMap, sx: number, sy: number, z: number, block: (x: number, y: number) => boolean = () => false): Uint8Array {
  const seen = new Uint8Array(m.width * m.height);
  const st = [sx, sy];
  seen[m.idx(sx, sy)] = 1;
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!m.inBounds(nx, ny) || seen[m.idx(nx, ny)] || block(nx, ny) || !m.canStep(x, y, z, dx, dy)) continue;
      seen[m.idx(nx, ny)] = 1;
      st.push(nx, ny);
    }
  }
  return seen;
}

console.log('The great fountain');
{
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, water = 0;
  for (let y = 300; y < 360; y++) for (let x = 180; x < 240; x++) {
    const part = fountainPart(x, y);
    if (!part) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    if (part === 'water') { water++; if (w.getObj(x, y, 0) !== Obj.Fountain) { check(false, `water tile ${x},${y} is fountain`); break; } }
  }
  check(maxX - minX + 1 === 40 && maxY - minY + 1 === 40, `the fountain is 40 tiles across (${maxX - minX + 1}×${maxY - minY + 1}; the old one was 4)`);
  check(water > 800, `a wide basin of water (${water} tiles)`);
  check(GRAND_PLAZA.x1 - GRAND_PLAZA.x0 + 1 === 60 && GRAND_PLAZA.y1 - GRAND_PLAZA.y0 + 1 === 60, 'the plaza round it is 60×60 tiles (the old one was 14×10)');
  check(!!w.plaza?.grand && w.plaza.grand.r === GRAND_R && w.plaza.cx === GRAND_CX && w.plaza.cy === GRAND_CY, 'the renderer gets the fountain layout');
  // four bridges from the rim to the island, all walkable
  const axes: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  let bridges = 0;
  for (const [ax, ay] of axes) {
    let ok = true;
    for (let k = 9; k < 20; k++) {
      const x = Math.floor(GRAND_CX + ax * (k + 0.5) + (ax === 0 ? 0.5 : 0)), y = Math.floor(GRAND_CY + ay * (k + 0.5) + (ay === 0 ? 0.5 : 0));
      if (!w.isWalkable(x, y, 0) || !reach.at(x, y, 0)) ok = false;
    }
    if (ok) bridges++;
  }
  check(bridges === 4, `four bridges over the water to the island (${bridges})`);
}

console.log('The Gilded Exchange');
{
  const h = w.houses.find((q) => q.name === EXCHANGE_NAME && q.z === 0);
  check(!!h && h.x === EXCHANGE_HOUSE.x && h.y === EXCHANGE_HOUSE.y && h.noRoof, 'the Exchange building stands on the island (its dome is drawn by the plaza model)');
  check(w.regionAt(Math.floor(GRAND_CX), Math.floor(GRAND_CY) - 4, 0)?.name === EXCHANGE_NAME && w.isSafe(Math.floor(GRAND_CX), Math.floor(GRAND_CY) - 4, 0), 'the Exchange is a protection zone');
  for (const c of EXCHANGE_CLERKS) {
    const n = w.npcs.find((q) => q.key === c.key);
    // a player can stand within talking range (2 tiles) of every clerk
    let talk = false;
    if (n) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (reach.at(n.x + dx, n.y + dy, 0) && w.isWalkable(n.x + dx, n.y + dy, 0)) talk = true;
    check(!!n && talk, `clerk ${c.key} stands behind the counter and can be talked to`);
  }
  // the rotunda is entered only through its four doorways: close them and nothing inside is reachable
  const doorway = (x: number, y: number) => fountainPart(x, y) === 'floor' && Math.hypot(x - GRAND_CX, y - GRAND_CY) >= 5.9;
  const sealed = flood2D(w, GRAND_TEMPLE.x, GRAND_TEMPLE.y, 0, doorway);
  let leaks = 0, inside = 0, doorways = 0;
  for (let y = 315; y < 340; y++) for (let x = 195; x < 225; x++) {
    if (doorway(x, y)) doorways++;
    if (fountainPart(x, y) === 'floor' && !doorway(x, y) && w.isWalkable(x, y, 0)) { inside++; if (sealed[w.idx(x, y)]) leaks++; }
  }
  check(doorways === 8, `four doorways, two tiles wide (${doorways} tiles)`);
  check(inside > 40 && leaks === 0, `no way in through the round wall, not even diagonally (${inside} floor tiles, ${leaks} leaks)`);
}

console.log('Everything the old village had');
{
  for (const name of ['Temple of Thornvale', 'Thornvale Depot', 'Thornvale Bank', "Mirella's Curiosities", "Garrick's Outfitters", "Brunhild's Smithy", 'General Store', "Trainers' Hall", 'Miller Barn']) {
    const h = w.houses.find((q) => q.name === name && q.z === 0);
    check(!!h && inGrandCore(h.x, h.y) && inGrandCore(h.x + h.w - 1, h.y + h.h - 1), `${name} stands in the new city`);
  }
  check(!w.houses.some((h) => h.name === 'Depot Loft'), 'the old depot loft is gone (the new hall has room on one floor)');
  for (const key of ['aldric', 'orwin', 'mirella', 'garrick', 'brunhild', 'elias']) {
    const n = w.npcs.find((q) => q.key === key);
    check(!!n && n.z === 0 && inGrandCore(n.x, n.y) && near(n.x, n.y, 0), `${key} is in town and can be reached`);
  }
  check(w.temple.x === GRAND_TEMPLE.x && w.temple.y === GRAND_TEMPLE.y && w.isWalkable(w.temple.x, w.temple.y, 0) && w.houseAt(w.temple.x, w.temple.y, 0)?.name === 'Temple of Thornvale', 'the respawn point is inside the temple');
  const tr = w.regions.filter((r) => r.temple && r.temple.x === w.temple.x && r.temple.y === w.temple.y);
  check(tr.some((r) => r.name === 'Thornvale') && tr.some((r) => r.name === 'Temple Plaza' && r.safe), 'the town and the plaza respawn at the new temple');
  // depot hall
  const depot = w.houses.find((q) => q.name === 'Thornvale Depot')!;
  let lockers = 0, bad = 0, boards = 0, stoves = 0;
  for (let y = depot.y; y < depot.y + depot.h; y++) for (let x = depot.x; x < depot.x + depot.w; x++) {
    const o = w.getObj(x, y, 0);
    if (o === Obj.Locker) { lockers++; if (!near(x, y, 0)) bad++; }
    if (o === Obj.MarketBoard) boards++;
    if (o === Obj.Stove) stoves++;
  }
  check(lockers >= 15 && bad === 0, `the depot hall has ${lockers} lockers, every one reachable`);
  check(boards === 1 && stoves === 1, 'the depot hall has its market board and a cooking stove');
  const smithy = w.houses.find((q) => q.name === "Brunhild's Smithy")!;
  const inS = (o: Obj) => { for (let y = smithy.y; y < smithy.y + smithy.h; y++) for (let x = smithy.x; x < smithy.x + smithy.w; x++) if (w.getObj(x, y, 0) === o && near(x, y, 0)) return true; return false; };
  check(inS(Obj.Furnace) && inS(Obj.Anvil) && inS(Obj.TanningRack), 'the smithy has its furnace, anvil and tanning rack');
  let pz = 0, pzOk = 0;
  for (let y = GRAND_PLAZA.y0; y <= GRAND_PLAZA.y1; y++) for (let x = GRAND_PLAZA.x0; x <= GRAND_PLAZA.x1; x++) if (w.getObj(x, y, 0) === Obj.MarketBoard) { pz++; if (near(x, y, 0)) pzOk++; }
  check(pz === 1 && pzOk === 1, 'the market board pavilion on the plaza');
  let stone = 0;
  for (let y = GRAND_PLAZA.y0; y <= GRAND_PLAZA.y1; y++) for (let x = GRAND_PLAZA.x0; x <= GRAND_PLAZA.x1; x++) if (w.getObj(x, y, 0) === Obj.FoundersStone && near(x, y, 0) && w.isSafe(x, y, 0)) stone++;
  check(stone === 1, "the Founders' Stone stands on the plaza");
  // every door in the city opens onto walkable ground on both sides
  let doors = 0, badDoors = 0;
  for (let y = CITY_BOX.y0; y <= CITY_BOX.y1; y++) for (let x = CITY_BOX.x0; x <= CITY_BOX.x1; x++) {
    if (w.getObj(x, y, 0) !== Obj.Door) continue;
    doors++;
    const ns = reach.at(x, y - 1, 0) && reach.at(x, y + 1, 0), ew = reach.at(x - 1, y, 0) && reach.at(x + 1, y, 0);
    if (!reach.at(x, y, 0) || !(ns || ew)) { badDoors++; console.log('    door', x, y); }
  }
  check(doors >= 14 && badDoors === 0, `every door in the city can be walked through (${doors})`);
  // every open tile of the plaza can be walked to (no prop boxes anyone in)
  let open = 0, cut = 0;
  for (let y = GRAND_PLAZA.y0; y <= GRAND_PLAZA.y1; y++) for (let x = GRAND_PLAZA.x0; x <= GRAND_PLAZA.x1; x++) {
    if (!w.isWalkable(x, y, 0) || w.houseAt(x, y, 0)) continue;
    open++;
    if (!reach.at(x, y, 0)) { cut++; if (cut < 5) console.log('    cut off', x, y); }
  }
  check(open > 1500 && cut === 0, `every open plaza tile can be reached (${open})`);
  // the monsters of the beginner grounds are back, outside the protection zones
  for (const [kind, region] of [['wolf', 'Greywood'], ['rat', "Miller's Farm"], ['skeleton', 'Old Graveyard']] as const) {
    const list = w.spawns.filter((s) => s.kind === kind && s.z === 0 && inGrandCore(s.x, s.y));
    check(list.length >= 4 && list.every((s) => reach.at(s.x, s.y, 0) && !w.isSafe(s.x, s.y, 0) && w.regionAt(s.x, s.y, 0)?.name === region), `${list.length} ${kind}s in ${region}`);
  }
  check(!w.spawns.some((s) => s.z === 0 && w.isSafe(s.x, s.y, 0) && inGrandCore(s.x, s.y)), 'no monster spawns in a protection zone');
}

console.log('Ways in and out');
{
  // the sewer stairs stay on their tile and still lead down and back up
  const down = w.linkAt(183, 315, 0), up = w.linkAt(183, 315, -1);
  check(w.getObj(183, 315, 0) === Obj.StairsDown && !!down && down.to.z === -1 && w.isWalkable(down.to.x, down.to.y, -1), 'the sewer stairs lead down');
  check(!!up && up.to.z === 0 && w.isWalkable(up.to.x, up.to.y, 0) && reach.at(up.to.x, up.to.y, 0), 'and back up into the city');
  check(![...w.links.entries()].some(([k, l]) => { const [x, y, z] = k.split(',').map(Number); return z >= 0 && inGrandCore(x, y) && !(x === 183 && y === 315) && l; }), 'no stairs left over from the old village');
  // from the temple you can walk to the harbour, the Grimtusk gate, Eastfold and the Westmarch road
  const town = flood2D(w, GRAND_TEMPLE.x, GRAND_TEMPLE.y, 0);
  const harbour = w.destinations.thornvale;
  check(!!harbour && town[w.idx(harbour.x, harbour.y)] === 1, 'the harbour (where the ship from Wayfarer\'s Isle lands) walks to the temple');
  check(town[w.idx(230, 279)] === 1, 'the north road to the Grimtusk gate');
  check(town[w.idx(262, 317)] === 1, 'the east road to Eastfold');
  const wm = w.regions.find((r) => r.name === 'Westmarch' && r.temple)!;
  check(town[w.idx(wm.temple!.x, wm.temple!.y)] === 1, 'the road to Westmarch');
  const sd = w.regions.find((r) => r.name === 'Stonedeep' && r.temple)!;
  check(reach.at(sd.temple!.x, sd.temple!.y, sd.temple!.z), 'Stonedeep can still be reached');
  // nothing outside the city's box changed hands: the stockade of Bandit Hollow is still there
  check(w.getObj(168, 340, 0) === Obj.Palisade || w.getObj(168, 340, 0) === Obj.Wall || w.getObj(168, 340, 0) === Obj.Fence || w.getGround(168, 340, 0) !== Ground.Grass, 'Bandit Hollow untouched');
}

console.log('Characters saved in the old village');
{
  const intent = new BufferedIntent();
  const s = g.addPlayer('Oldtimer', { intent, vocation: 'knight' });
  const base = g.serialize(s.id) as unknown as Record<string, unknown> & { player: Record<string, unknown> };
  // old village spots (version 15): a street, the old depot loft (z 1), what is now the fountain, a new wall
  const spots = [{ x: 204, y: 312, z: 0 }, { x: 190, y: 312, z: 1 }, { x: 214, y: 316, z: 0 }, { x: 201, y: 290, z: 0 }, { x: 186, y: 310, z: 0 }];
  let ok = 0;
  for (const sp of spots) {
    const data = JSON.parse(JSON.stringify(base));
    data.version = 15;
    data.player.x = sp.x; data.player.y = sp.y; data.player.z = sp.z;
    const mg = migrateSave(data);
    const moved = typeof mg !== 'string' && (mg.data as { player: { x: number } }).player.x === -1;
    g.applySave(s.id, data);
    const p = s.player;
    if (moved && p.z === 0 && w.isWalkable(p.x, p.y, 0) && reach.at(p.x, p.y, 0) && chebyshev(p.x, p.y, w.temple.x, w.temple.y) <= 3) ok++;
    else console.log('    not safe', sp, '→', p.x, p.y, p.z);
  }
  check(ok === spots.length, `characters saved inside the old village wake at the temple (${ok}/${spots.length})`);
  // a character saved elsewhere stays put, and a v16 save in the city stays where it was
  const far = JSON.parse(JSON.stringify(base));
  far.version = 15; far.player.x = wmSpot().x; far.player.y = wmSpot().y; far.player.z = 0;
  g.applySave(s.id, far);
  check(s.player.x === wmSpot().x && s.player.y === wmSpot().y, 'a character saved outside Thornvale stays where it was');
  const now = JSON.parse(JSON.stringify(base));
  now.version = SAVE_VERSION; now.player.x = 195; now.player.y = 305; now.player.z = 0;
  g.applySave(s.id, now);
  check(s.player.x === 195 && s.player.y === 305, 'a character saved in the new city stays where it was');
  check(SAVE_VERSION >= 16, `save version ${SAVE_VERSION}`);
}

function wmSpot(): { x: number; y: number } {
  const wm = w.regions.find((r) => r.name === 'Westmarch' && r.temple)!;
  return { x: wm.temple!.x, y: wm.temple!.y };
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll Grand Thornvale checks passed.');
if (failures) process.exit(1);
