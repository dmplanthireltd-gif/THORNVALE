/**
 * Arena bots (server/pvpBots.ts): runs the 4 vs 4 on the North Green for a few
 * simulated minutes and checks that both teams score, focus fire happens, the
 * bots never enter a protection zone or leave the arena, never touch real
 * players or monsters, drop nothing when they die and keep the tick cheap.
 *   npm run test:pvpbots   (also part of npm run test:logic)
 */
declare const process: { exit(code: number): never; argv: string[] };
import { BufferedIntent, Game } from '../src/game/Game';
import { Enemy } from '../src/game/enemies/Enemy';
import { activeSets } from '../src/game/inventory/sets';
import { arenaSupplies, PVP_ARENA, PVP_LEVEL_MAX, PVP_LEVEL_MIN, PvpBots } from '../server/pvpBots';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const MINUTES = Number(process.argv[2] ?? 6);
const g = new Game({ pvp: true, testMode: true });
const A = PVP_ARENA;

// two real players: one on the temple plaza watching, one standing on the green itself (secure mode off: fair game for bots, if they cheated)
const watcher = g.addPlayer('Watcher', { intent: new BufferedIntent(), vocation: 'knight' });
g.teleport(watcher.player, A.x1 + 4, 312, 0);
const walker = g.addPlayer('Walker', { intent: new BufferedIntent(), vocation: 'paladin' });
walker.player.secure = false;
g.teleport(walker.player, A.x0 + 8, A.y1, 0);
const humans = new Set([watcher.id, walker.id]);

const arena = new PvpBots(g, 4);
const ids = arena.ids;
console.log('Arena bots');
check(arena.bots.length === 8, '8 bots, 4 per team');
const vocs = (t: 0 | 1) => arena.teams[t].members.map((m) => m.s.player.vocation).sort().join(',');
check(vocs(0) === 'druid,knight,paladin,sorcerer' && vocs(1) === vocs(0), 'each team: knight, paladin, sorcerer, druid');
check(arena.bots.every((b) => b.level >= PVP_LEVEL_MIN && b.level <= PVP_LEVEL_MAX && b.s.player.level === b.level), `levels ${PVP_LEVEL_MIN}–${PVP_LEVEL_MAX}`);
check(arena.bots.every((b) => / \[(Red|Blue) Bot\]$/.test(b.s.player.name) && b.s.bot), 'names carry the team tag and Bot marker; sessions flagged as bots');
check(arena.bots.every((b) => arena.bots.every((o) => (o.team === b.team) === g.sameParty(b.s.id, o.s.id))), 'each team is one party');
check(arena.bots.every((b) => activeSets(Object.values(b.s.inventory.equipment).filter((x) => x).map((x) => x!.id)).some((a) => a.count >= 4)), 'every bot wears a complete 4-piece set');
const pal = arena.bots.filter((b) => b.s.player.vocation === 'paladin');
check(pal.every((b) => b.s.inventory.equipment.ammo && b.s.inventory.equipment.ammo.qty > 100), 'paladins carry ammunition');
check(arena.bots.filter((b) => b.s.player.vocation === 'sorcerer' || b.s.player.vocation === 'druid').every((b) => b.s.inventory.count('death_rune') > 0), 'mages carry attack runes');
check(arena.bots.every((b) => b.s.inventory.slots.some((x) => x && /potion/.test(x.id))), 'everyone carries potions');
check(arena.bots.every((b) => arena.inArena(b.s.player.x, b.s.player.y, b.s.player.z)), 'all start inside the arena');

// ---- watch the fight
const hitsOn = new Map<number, Array<{ t: number; src: number }>>();
let t = 0;
let badTarget = 0, monsterHits = 0, outside = 0, inPz = 0, botDeaths = 0, focusFire = 0, maxAttackers = 0;
const newBags: string[] = [];
g.events.on((e) => {
  if (e.type === 'death' && ids.has(e.id)) botDeaths++;
  if (e.type === 'bagCreated') { const bag = g.bags.find((x) => x.id === e.bagId); newBags.push(`${e.x},${e.y}${bag?.corpse ? ' corpse of ' + bag.corpse : ''}: ${bag?.items.map((i) => i.id).join(' ') ?? ''}`); }
  if (e.type !== 'damage' || e.result !== 'hit' || !ids.has(e.sourceId)) return;
  if (humans.has(e.targetId)) badTarget++;
  if (g.getEnemy(e.targetId)) monsterHits++;
  if (!ids.has(e.targetId)) return;
  const list = hitsOn.get(e.targetId) ?? [];
  list.push({ t, src: e.sourceId });
  while (list.length && list[0].t < t - 1) list.shift();
  hitsOn.set(e.targetId, list);
  const n = new Set(list.map((h) => h.src)).size;
  maxAttackers = Math.max(maxAttackers, n);
  if (n >= 3) focusFire++;
});
const levels = new Map(arena.bots.map((b) => [b.s.id, b.level]));
const DT = 1 / 20;
let botMs = 0, worstBot = 0, ticks = 0, gameMs = 0;
const samples: number[] = [];
let targetedHuman = 0, respawns = 0, badRestock = 0;
const wasDead = new Map<number, boolean>();
while (t < MINUTES * 60) {
  const a = performance.now();
  g.update(DT);
  const b = performance.now();
  arena.update(DT);
  const c = performance.now();
  gameMs += b - a;
  botMs += c - b;
  worstBot = Math.max(worstBot, c - b);
  samples.push(c - b);
  ticks++;
  t += DT;
  for (const bot of arena.bots) {
    const p = bot.s.player;
    if (p.dead) continue;
    if (g.world.isSafe(p.x, p.y, p.z)) inPz++;
    if (!(p.z === A.z && p.x >= A.x0 && p.x <= A.x1 && p.y >= A.y0 && p.y <= A.y1)) outside++;
    if (p.targetId !== null && humans.has(p.targetId)) targetedHuman++;
  }
  for (const bot of arena.bots) {
    const p = bot.s.player;
    if (wasDead.get(p.id) && !p.dead) {
      // back with full health, mana and supplies
      respawns++;
      const full = arenaSupplies(p.vocation, bot.level).every(([id, qty]) => bot.s.inventory.count(id) === qty);
      if (!full || p.hp !== p.maxHp || p.mana !== p.maxMana) badRestock++;
    }
    wasDead.set(p.id, p.dead);
  }
  // keep the humans where they are
  watcher.player.hp = watcher.player.maxHp;
}
console.log(`  ${MINUTES} min: ${arena.scoreLine()}, deaths ${arena.stats.deaths}, combos ${arena.stats.combos}, ≥3 attackers within 1 s ${focusFire}× (max ${maxAttackers}), area attacks ${arena.stats.areaAttacks}, magic walls ${arena.stats.walls}, heals ${arena.stats.heals} + team heals ${arena.stats.teamHeals}`);
samples.sort((x, y) => x - y);
const p99 = samples[Math.floor(samples.length * 0.99)];
console.log(`  bot logic ${(botMs / ticks).toFixed(3)} ms/tick (99% under ${p99.toFixed(2)} ms, worst ${worstBot.toFixed(2)} ms incl. GC), whole game ${(gameMs / ticks).toFixed(3)} ms/tick`);
check(arena.stats.kills[0] > 0 && arena.stats.kills[1] > 0, 'both teams score kills');
check(botDeaths >= arena.stats.kills[0] + arena.stats.kills[1], 'kills match deaths');
check(focusFire > 0 && maxAttackers >= 3, 'focus fire: 3+ attackers hit one target within one second');
check(arena.stats.combos > 0, 'team combos fired');
check(arena.stats.heals > 0 && arena.stats.teamHeals > 0, 'bots heal themselves and their teammates');
check(inPz === 0, 'bots never stand in a protection zone');
check(outside === 0, 'bots never leave the arena');
// only damage dealt BY bots counts: wild monsters (wolves near the North Green) may bite the test players
check(badTarget === 0 && targetedHuman === 0, 'bots never target or hurt real players');
check(monsterHits === 0, 'bots never hurt monsters');
const arenaBags = newBags.filter((b) => { const [x, y] = b.split(':')[0].split(',').map(Number); return x >= A.x0 - 2 && x <= A.x1 + 2 && y >= A.y0 - 2 && y <= A.y1 + 2; });
if (arenaBags.length) console.log('  bags: ' + arenaBags.join(' | '));
check(arenaBags.length === 0 && !g.bags.some((b) => b.corpse && ids.has(g.findPlayerByName(b.corpse)?.id ?? -1)), 'bot deaths leave no body and drop nothing');
check(arena.bots.every((b) => g.skullOf(b.s.player) === 0), 'bots never carry a skull');
check(arena.bots.every((b) => b.s.player.dead || b.s.player.level === levels.get(b.s.id)), 'level restored after respawn');
check(botMs / ticks < 1 && p99 < 10, 'bot logic stays cheap (under 1 ms a tick on average, 99% of ticks under 10 ms)');
check(respawns > 0 && badRestock === 0, `respawned bots come back with full health, mana and supplies (${respawns} respawns)`);
// monsters leave them alone
check(!g.enemies.some((e: Enemy) => !e.dead && e.targetId !== null && ids.has(e.targetId)), 'no monster targets an arena bot');
arena.dispose();
check(arena.bots.every((b) => !g.sessions.has(b.s.id)), 'dispose removes the bots');

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll arena bot checks passed.');
