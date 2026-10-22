/**
 * The big depot halls (world/depotHalls.ts): every town but Thornvale has one large
 * themed hall with 12–20 lockers, a walking gap beside every locker, a market board,
 * the banker and a stove, and every locker opens the shared depot. The town halls that
 * moved keep their people reachable, every door in town can be walked through, and a
 * character saved on a spot that was built over wakes safely at that town's temple.
 *   tsx scripts/depots-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game } from '../src/game/Game';
import { chebyshev } from '../src/game/core/types';
import { DEPOT_TOWNS } from '../src/game/world/depotHalls';
import { TOWNS } from '../src/game/world/townList';
import { floodFill3D } from '../src/game/world/worldGen';
import { Obj } from '../src/game/world/WorldMap';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

function run(g: Game, seconds: number, until?: () => boolean, step = 1 / 30): void {
  for (let t = 0; t < seconds; t += step) {
    g.update(step);
    if (until?.()) return;
  }
}

const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const g = new Game();
const w = g.world;
const reach = floodFill3D(w);
const reachable8 = (x: number, y: number, z: number) => D8.some(([dx, dy]) => reach.at(x + dx, y + dy, z));

console.log('Depot halls');
{
  const towns = Object.keys(DEPOT_TOWNS);
  check(towns.length === TOWNS.length - 1 && !DEPOT_TOWNS.thornvale, `every town but Thornvale gets a hall (${towns.length})`);
  check(w.depotHalls.length === towns.length, `one hall per town (${w.depotHalls.length})`);
  for (const hall of w.depotHalls) {
    const info = TOWNS.find((t) => t.key === hall.town)!;
    const label = `${info.name} (${hall.theme})`;
    const inside = (x: number, y: number) => x > hall.x && y > hall.y && x < hall.x + hall.w - 1 && y < hall.y + hall.h - 1;
    const house = w.houses.find((h) => h.z === 0 && h.x === hall.x && h.y === hall.y && /depot/i.test(h.name));
    check(!!house && house.w === hall.w && house.h === hall.h && house.w * house.h >= 130, `${label}: a big depot building (${hall.w}×${hall.h})`);
    check(w.houses.filter((h) => /depot/i.test(h.name) && h.name.startsWith(info.name)).length === 1, `${label}: the old depot and its loft are gone`);
    let lockers = 0, boards = 0, stoves = 0, counters = 0, touching = 0, unreachable = 0;
    for (let y = hall.y + 1; y < hall.y + hall.h - 1; y++) for (let x = hall.x + 1; x < hall.x + hall.w - 1; x++) {
      const o = w.getObj(x, y, 0);
      if (o === Obj.Locker) {
        lockers++;
        if ([[1, 0], [-1, 0]].some(([dx, dy]) => w.getObj(x + dx, y + dy, 0) === Obj.Locker)) touching++;
        if (!reachable8(x, y, 0)) unreachable++;
      }
      if (o === Obj.MarketBoard) boards++;
      if (o === Obj.Stove) stoves++;
      if (o === Obj.Counter) counters++;
    }
    check(lockers >= 12 && lockers <= 20 && lockers === hall.lockers.length, `${label}: ${lockers} lockers`);
    check(touching === 0, `${label}: a walking gap beside every locker`);
    check(unreachable === 0, `${label}: every locker can be walked up to`);
    check(boards === 1 && stoves === 1 && counters >= 1, `${label}: market board, stove and bank counter inside`);
    const banker = w.npcs.find((n) => n.key === info.staff.bank.key)!;
    check(inside(banker.x, banker.y) && reachable8(banker.x, banker.y, 0), `${label}: the banker stands in the hall and can be reached`);
    check(hall.doors.length === 2 && hall.doors.every((d) => w.getObj(d.x, d.y, 0) === Obj.Door && reach.at(d.x, d.y + 1, 0) && reach.at(d.x, d.y - 1, 0)), `${label}: double doors onto the plaza`);
    for (const k of [info.staff.quest?.key, info.staff.trainer?.key]) {
      if (!k) continue;
      const n = w.npcs.find((q) => q.key === k)!;
      check(reachable8(n.x, n.y, 0) && w.regionAt(n.x, n.y, 0)?.name === info.name, `${label}: ${k} can be reached in town`);
    }
    const props = new Set(hall.props.map((p) => p.k));
    check(['sign', 'lantern', 'sconce', 'banner', 'glow'].every((k) => props.has(k)), `${label}: sign over the door, lanterns, banners and a lit interior`);
    check(w.getGround(hall.x + 5, hall.y + 1, 1) !== w.getGround(hall.x + 5, hall.y + 1, 0) || !w.isWalkable(hall.x + 5, hall.y + 1, 1), `${label}: no loft floor left above the hall`);
  }
  // every door in every town is passable from both sides (homes beside the halls included)
  let badDoors = 0;
  for (const r of w.regions) {
    if (!r.temple || !r.safe) continue;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (w.getObj(x, y, 0) !== Obj.Door) continue;
      if (!reach.at(x, y, 0)) { badDoors++; console.log('    door not reachable', r.name, x, y); }
    }
  }
  check(badDoors === 0, 'every door in every town can be walked through');
  // the depot logic is unchanged: a locker in every hall opens the same depot
  const intent = new BufferedIntent();
  const s = g.addPlayer('Depotwalker', { intent, vocation: 'knight' });
  g.localId = s.id;
  s.depot[0] = { id: 'health_potion', qty: 3 };
  let opened = 0;
  for (const hall of w.depotHalls) {
    const lk = hall.lockers[hall.lockers.length >> 1];
    const near = D8.map(([dx, dy]) => [lk.x + dx, lk.y + dy]).find(([x, y]) => reach.at(x, y, 0) && w.getObj(x, y, 0) === Obj.None)!;
    g.closeDepot(s.id);
    g.teleport(s.player, near[0], near[1], 0);
    g.commandUseTile(s.id, lk.x, lk.y);
    run(g, 1, () => !!s.depotOpen);
    if (s.depotOpen && chebyshev(s.depotOpen.x, s.depotOpen.y, lk.x, lk.y) === 0 && s.depot[0]?.id === 'health_potion') opened++;
  }
  check(opened === w.depotHalls.length, `a locker in every hall opens the shared depot (${opened}/${w.depotHalls.length})`);
}

console.log('Safe login on rebuilt tiles');
{
  const intent = new BufferedIntent();
  const s = g.addPlayer('Sleeper', { intent, vocation: 'druid' });
  const base = g.serialize(s.id);
  let ok = 0, n = 0;
  for (const hall of w.depotHalls) {
    const info = TOWNS.find((t) => t.key === hall.town)!;
    const town = w.regions.find((r) => r.name === info.name && r.temple)!;
    // the old depot loft (z 1), a locker tile and a hall wall: all no longer standable
    const spots = [
      { x: hall.x + 5, y: hall.y + 5, z: 1 },
      { x: hall.lockers[0].x, y: hall.lockers[0].y, z: 0 },
      { x: hall.x + hall.w - 1, y: hall.y + 2, z: 0 },
    ];
    for (const sp of spots) {
      n++;
      const data = JSON.parse(JSON.stringify(base));
      data.player.x = sp.x; data.player.y = sp.y; data.player.z = sp.z;
      g.applySave(s.id, data);
      const p = s.player;
      const fine = w.isWalkable(p.x, p.y, p.z) && reach.at(p.x, p.y, p.z) && chebyshev(p.x, p.y, town.temple!.x, town.temple!.y) <= 6 && p.z === town.temple!.z;
      if (fine) ok++; else console.log('    not safe', info.name, sp, '→', p.x, p.y, p.z);
    }
  }
  check(ok === n, `characters saved on built-over tiles wake at their town's temple (${ok}/${n})`);
  // a character saved inside a hall on a free tile stays there
  const hall = w.depotHalls[0];
  const data = JSON.parse(JSON.stringify(base));
  data.player.x = hall.x + 3; data.player.y = hall.y + 2; data.player.z = 0;
  g.applySave(s.id, data);
  check(s.player.x === hall.x + 3 && s.player.y === hall.y + 2, 'a character saved on a free hall tile stays where it was');
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll depot hall checks passed.');
