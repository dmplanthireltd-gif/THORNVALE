/**
 * Trade-skill activity on the wire: other players learn what someone is working
 * on (tool + target tile) through the snapshot's `ac` field, sent only when it
 * changes and cleared when the work stops. Run as part of `npm run test:logic`.
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game } from '../src/game/Game';
import { applySnapshot, buildSnapshot } from '../src/game/net/protocol';
import { ACTIVITY_KINDS, currentActivity, decodeActivity, encodeActivity } from '../src/game/gathering/activity';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const g = new Game();
const miner = g.addPlayer('Miner', { intent: new BufferedIntent() });
const watcher = g.addPlayer('Watcher', { intent: new BufferedIntent() });
miner.inventory.add('iron_pickaxe', 1);
miner.gathering.mining = 1e7;

const mirror = new Game({ simulate: false });
const me = mirror.addPlayer('Watcher', { id: watcher.id, starter: false });
mirror.localId = me.id;
const sync = () => {
  const snap = buildSnapshot(g, watcher);
  if (snap.t !== 'snap') throw new Error('no snapshot');
  applySnapshot(mirror, snap);
  return snap.c.find((c) => c.id === miner.id)!;
};

let c = sync();
check(c.ac === 0, 'an idle player is sent as idle once');
check(sync().ac === undefined, 'unchanged activity is not resent');

const p = miner.player;
p.mine = { x: p.x + 1, y: p.y, z: p.z, timer: 1 };
check(currentActivity(g, p.id)?.kind === 'mine' && currentActivity(g, p.id)?.tool === 'iron_pickaxe', 'the server knows the miner swings an iron pickaxe');
c = sync();
check(Array.isArray(c.ac) && c.ac[0] === ACTIVITY_KINDS.indexOf('mine') && c.ac[3] === 'iron_pickaxe', 'the snapshot carries the activity (kind, tile, tool)');
const seen = currentActivity(mirror, p.id);
check(seen?.kind === 'mine' && seen.x === p.x + 1 && seen.y === p.y && seen.tool === 'iron_pickaxe', 'other players see the activity on their mirror');
check(sync().ac === undefined, 'a running activity is sent only once');

p.mine = null;
c = sync();
check(c.ac === 0 && currentActivity(mirror, p.id) === null, 'stopping clears it for other players');

p.fish = { x: p.x + 2, y: p.y, z: p.z, timer: 1 };
sync();
check(currentActivity(mirror, p.id)?.kind === 'fish' && currentActivity(mirror, p.id)?.tool === 'fishing_rod', 'fishing shows the rod');
p.fish = null;
sync();

check(decodeActivity(encodeActivity({ kind: 'anvil', x: 5, y: 6, tool: 'smithing_hammer' }))?.kind === 'anvil', 'activity round-trips');
check(decodeActivity([99, 1, 2, '']) === null && decodeActivity('bad') === null, 'unknown or broken activity codes are ignored');

console.log(failures === 0 ? '\nAll activity checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
