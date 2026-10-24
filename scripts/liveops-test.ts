/**
 * Daily and weekly tasks, the task boards, the seal shop, and the world events of 2026-10-24
 * (liveops/): the calendar, scheduled raids and world bosses, treasure hunts, festivals with their
 * mini-boss and costumes, double weekends, raid rewards by contribution, the safety rules (no event
 * monster in a protection zone, the Gilded Exchange or on Wayfarer's Isle), saves, the network view
 * and the game-master commands. Run as part of `npm run test:logic` (also `npx tsx scripts/liveops-test.ts`).
 */
declare const process: { exit(code: number): never };
import { Game, type Session } from '../src/game/Game';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import { applySnapshot, buildSnapshot, executeCommand, PROTOCOL_VERSION } from '../src/game/net/protocol';
import { ITEMS } from '../src/game/inventory/items';
import { CAPE_BY_ID } from '../src/game/inventory/capes';
import { NPCS } from '../src/game/npc/npcs';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { RAIDS, WORLD_BOSSES } from '../src/game/bosses/bosses';
import { runAdminCommand } from '../src/game/admin';
import { gatherXpForLevel } from '../src/game/gathering/woodcutting';
import { expForLevel } from '../src/game/player/Player';
import { TOWNS } from '../src/game/world/townList';
import { onIsle, ISLE_MEADOW } from '../src/game/world/tutorialIsle';
import { EXCHANGE_HOUSE } from '../src/game/world/grandCity';
import { TASKBOARD_NPCS } from '../src/game/liveops/liveNpcs';
import {
  DELIVERIES, emptyTaskState, huntTargetExp, loginSeals, nextDailyReset, nextWeeklyReset, parseTaskState, RESET_HOUR_UTC, SEAL_SHOP, streakBonus,
  taskDay, taskRewards, taskWeek,
} from '../src/game/liveops/tasks';
import { calendarEntries, RAID_HOUR_UTC, TREASURE_HOUR_UTC, WORLD_BOSS_HOUR_UTC } from '../src/game/liveops/calendar';
import { FESTIVALS, festivalByDate, festivalWindow } from '../src/game/liveops/festivals';
import { CACHE_SEALS, TREASURE_CACHES } from '../src/game/liveops/LiveEvents';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const realRandom = Math.random;
function withRandom<T>(v: number, fn: () => T): T {
  Math.random = () => v;
  try { return fn(); } finally { Math.random = realRandom; }
}
const H = 3_600_000, D = 86_400_000;
/** Saturday 24 October 2026, 10:00 UTC (the Hollow Moon festival is on). */
const SAT = Date.UTC(2026, 9, 24, 10, 0);

let clock = SAT;
const g = new Game({ now: () => clock, testMode: true });
const step = (secs: number) => { for (let t = 0; t < secs; t += 0.05) g.update(0.05); };
const msgs: string[] = [];
const heard: string[] = [];
g.events.on((e) => {
  if (e.type === 'message') msgs.push(e.text);
  if (e.type === 'announce') heard.push(`${e.style}|${e.text}`);
});
const lastMsg = (re: RegExp) => msgs.some((m) => re.test(m));

function newHero(name: string, level: number): Session {
  const s = g.addPlayer(name);
  s.player.level = level;
  s.player.exp = expForLevel(level);
  g.refreshStats(s);
  return s;
}
const near = (s: Session, x: number, y: number, z: number) => {
  const t = (g as unknown as { freeTileNear(x: number, y: number, z: number): { x: number; y: number; z: number } }).freeTileNear(x, y, z);
  s.player.placeAt(t.x, t.y, t.z);
};

// ---------------------------------------------------------------- versions and saves
console.log('saves and versions');
check(SAVE_VERSION >= 18 && PROTOCOL_VERSION >= 35, `save v${SAVE_VERSION}, protocol ${PROTOCOL_VERSION}`);
{
  const old = { version: 17, savedAt: 0, player: { x: 210, y: 330, z: 0, level: 30, exp: expForLevel(30), hp: 100, mana: 50, facing: 0 }, inventory: { slots: [], equipment: {} }, quests: {}, trades: { run: false } };
  const m = migrateSave(old);
  check(typeof m !== 'string' && (m.data as unknown as { tasks: { seals: number; daily: unknown[] } }).tasks.seals === 0, 'a v17 save gains an empty task board (no seals, no tasks)');
  const m2 = migrateSave({ ...old, version: 3, player: { ...old.player } });
  check(typeof m2 !== 'string' && !!(m2.data as unknown as { tasks: unknown }).tasks, 'a very old save also reaches v18 with a task board');
  check(JSON.stringify(parseTaskState(null)) === JSON.stringify(emptyTaskState()) && parseTaskState({ seals: -5, daily: [{ k: 'bad' }] }).seals === 0, 'unreadable task data starts empty, never negative');
}

// ---------------------------------------------------------------- clock
console.log('reset times');
{
  const mon = Date.UTC(2026, 9, 26, RESET_HOUR_UTC, 0);
  check(taskDay(mon) === taskDay(mon - 1) + 1, `the task day changes at ${RESET_HOUR_UTC}:00 UTC`);
  check(taskWeek(mon) === taskWeek(mon - 1) + 1 && taskWeek(mon - D) === taskWeek(mon - 1), 'the task week changes on Monday at the reset hour only');
  check(nextDailyReset(SAT) === Date.UTC(2026, 9, 25, RESET_HOUR_UTC) && nextWeeklyReset(SAT) === mon, 'next daily and weekly resets');
  check(streakBonus(1) === 0 && streakBonus(3) > 0 && streakBonus(100) <= 0.3 && loginSeals(1) === 1 && loginSeals(7) === 3, 'streak bonus grows to +30%, login seals 1–3');
  const lo = taskRewards(20, false), hi = taskRewards(150, false), wk = taskRewards(20, true);
  check(hi.x > lo.x && hi.g > lo.g && wk.x > lo.x * 3 && wk.s > lo.s, 'rewards scale with level; weekly pays more');
  check(lo.x < (expForLevel(21) - expForLevel(20)) * 0.05, 'a daily task is a small part of a level (balance-safe)');
}

// ---------------------------------------------------------------- task boards in the world
console.log('task boards');
{
  for (const t of TOWNS) {
    const n = g.npcs.find((x) => x.key === `taskboard_${t.key}`);
    check(!!n && !!NPCS[n.key]?.tasks && Math.max(Math.abs(n.x - t.x), Math.abs(n.y - t.y)) <= 30 && g.world.isWalkable(n.x, n.y, n.z), `${t.name} has a task board keeper (${n ? `${NPCS[n.key].name} at ${n.x}, ${n.y}` : 'missing'})`);
  }
  check(TASKBOARD_NPCS.length === TOWNS.length, 'one keeper per town');
}

// ---------------------------------------------------------------- shop and items
console.log('seal shop and festival goods');
{
  for (const e of SEAL_SHOP) check(!!ITEMS[e.id], `seal shop item exists: ${e.id}`);
  // a seal must never become a gold farm: what the goods fetch from traders per seal stays small
  const worst = Math.max(...SEAL_SHOP.map((e) => (ITEMS[e.id]?.value ?? 0) * e.qty / e.price));
  check(worst <= 40, `seal shop goods are worth at most ${worst.toFixed(1)} gold per seal at traders`);
  for (const id of ['taskbearer_cape', 'wayfinder_mantle', 'hollowmoon_cape', 'winterhearth_cape']) {
    const d = ITEMS[id];
    check(!!d && d.kind === 'cape' && !d.attack && !d.armor && !d.defense && CAPE_BY_ID[id]?.kind === 'reward', `${id} is a decorative cape`);
  }
  for (const f of FESTIVALS) {
    check(!!ITEMS[f.token] && !!ENEMIES[f.boss] && !!ITEMS[f.guise], `${f.name}: token, mini-boss and costume exist`);
    for (const e of f.shop) check(e.id === 'seals' || !!ITEMS[e.id], `${f.name} trade exists: ${e.id}`);
  }
  for (const [id] of DELIVERIES) check(!!ITEMS[id], `delivery item exists: ${id}`);
}

// ---------------------------------------------------------------- tasks for a character
console.log('daily and weekly tasks');
const ann = newHero('Ann', 40);
const board = g.npcs.find((n) => n.key === 'taskboard_thornvale')!;
{
  step(1.2);
  const st = ann.tasks;
  check(st.daily.length === 3 && st.weekly.length === 2, `3 daily and 2 weekly tasks (${st.daily.map((t) => `${t.k}:${t.t}`).join(', ')} | ${st.weekly.map((t) => `${t.k}:${t.t}`).join(', ')})`);
  check(st.streak === 1 && st.seals === 1 && lastMsg(/task seal for logging in/), 'first login of the day: streak 1 and a seal');
  const hunt = st.daily.find((t) => t.k === 'hunt')!;
  check(!!hunt && !!ENEMIES[hunt.t as keyof typeof ENEMIES], `a daily hunt (${hunt?.n} × ${hunt?.t})`);
  const ex = ENEMIES[hunt.t as keyof typeof ENEMIES].exp;
  check(ex > huntTargetExp(40) / 5 && ex < huntTargetExp(40) * 5, `the hunt fits level 40 (${ex} exp a kill, aim ${Math.round(huntTargetExp(40))})`);
  check(!st.daily.some((t, i) => st.daily.findIndex((o) => o.k === t.k && o.t === t.t) !== i), 'no task twice');

  // a different character gets tasks of its own level
  const big = newHero('Bram', 300);
  step(1.2);
  const bh = big.tasks.daily.find((t) => t.k === 'hunt');
  check(!!bh && ENEMIES[bh.t as keyof typeof ENEMIES].exp > ex, `level 300 hunts bigger game (${bh?.t})`);
  g.removePlayer(big.id);

  // kills count
  const kind = hunt.t as keyof typeof ENEMIES;
  for (let i = 0; i < hunt.n - 1; i++) g.taskSys.onKill(ann, kind);
  check(hunt.h === hunt.n - 1 && !lastMsg(/A task is done/), 'kills count towards the hunt');
  g.taskSys.onKill(ann, kind);
  check(hunt.h === hunt.n && lastMsg(/A task is done/), 'the last kill finishes it');
  g.taskSys.onKill(ann, kind);
  check(hunt.h === hunt.n, 'never more than needed');

  // claiming needs a board
  const hi = st.daily.indexOf(hunt);
  ann.player.placeAt(board.x + 30, board.y + 30, board.z);
  msgs.length = 0;
  executeCommand(g, ann.id, { c: 'task', a: 'claim', i: hi });
  check(!hunt.c && lastMsg(/Find a task board/), 'claiming far from a board is refused');
  near(ann, board.x, board.y + 1, board.z);
  const exp0 = ann.player.exp, gold0 = ann.inventory.count('gold') + ann.bank, seals0 = st.seals;
  executeCommand(g, ann.id, { c: 'task', a: 'claim', i: hi });
  check(hunt.c && ann.player.exp - exp0 === hunt.x && st.seals === seals0 + hunt.s, `claimed at the board: +${hunt.x} exp, +${hunt.s} seals`);
  check(ann.inventory.count('gold') + ann.bank + ann.depot.reduce((a, x) => a + (x?.id === 'gold' ? x.qty : 0), 0) >= gold0 + hunt.g, `+${hunt.g} gold`);
  executeCommand(g, ann.id, { c: 'task', a: 'claim', i: hi });
  check(st.done === 1, 'a reward is paid once');
  executeCommand(g, ann.id, { c: 'task', a: 'claim', i: 99 });
  executeCommand(g, ann.id, { c: 'task', a: 'claim', i: 1.5 } as never);
  executeCommand(g, ann.id, { c: 'task', a: 'nope', i: 0 } as never);
  check(st.done === 1, 'bad indexes and actions are ignored');

  // a skill task: experience in that skill counts
  const sk = st.daily.find((t) => t.k === 'skill') ?? st.weekly.find((t) => t.k === 'skill');
  if (sk) {
    const before = sk.h;
    g.gainSkill(ann, sk.t as never, 50, ann.id);
    check(sk.h > before, `skill experience counts (${sk.t}: ${sk.h}/${sk.n})`);
  } else check(true, 'no skill task today (rerolled into another kind)');

  // deliveries: goods leave the backpack at the board
  st.daily[2] = { k: 'deliver', t: 'logs', n: 10, h: 0, c: false, x: 100, g: 100, s: 2 };
  ann.inventory.add('logs', 6);
  executeCommand(g, ann.id, { c: 'task', a: 'deliver', i: 2 });
  check(st.daily[2].h === 6 && ann.inventory.count('logs') === 0, 'six logs handed in (6/10)');
  ann.inventory.add('logs', 9);
  executeCommand(g, ann.id, { c: 'task', a: 'deliver', i: 2 });
  check(st.daily[2].h === 10 && ann.inventory.count('logs') === 5, 'only what is still needed is taken (5 logs kept)');

  // an explore task finishes when walking into the place
  const reg = g.world.regions.find((r) => !r.safe && r.z0 <= 0 && r.z1 >= 0 && /\d/.test(r.level) && (r.x1 - r.x0) > 10 && (r.y1 - r.y0) > 10 && !onIsle(r.x0, r.y0, 0))!;
  st.daily[1] = { k: 'explore', t: reg.name, n: 1, h: 0, c: false, x: 10, g: 10, s: 2 };
  near(ann, (reg.x0 + reg.x1) >> 1, (reg.y0 + reg.y1) >> 1, 0);
  if (g.world.regionAt(ann.player.x, ann.player.y, 0)?.name === reg.name) {
    step(1.2);
    check(st.daily[1].h === 1, `visiting ${reg.name} finishes the journey`);
  } else check(true, 'explore: the centre tile belongs to a nested region');

  // reroll: once a day, at a board
  near(ann, board.x, board.y + 1, board.z);
  st.daily[0] = { k: 'hunt', t: 'rat', n: 25, h: 0, c: false, x: 10, g: 10, s: 2 };
  executeCommand(g, ann.id, { c: 'task', a: 'reroll', i: 0 });
  const swapped = st.daily[0].t !== 'rat' || st.daily[0].k !== 'hunt';
  check(swapped && st.rr === taskDay(clock), `a daily task is swapped (${st.daily[0].k}:${st.daily[0].t})`);
  const keep = JSON.stringify(st.daily[0]);
  executeCommand(g, ann.id, { c: 'task', a: 'reroll', i: 0 });
  check(JSON.stringify(st.daily[0]) === keep && lastMsg(/already swapped/), 'a second swap the same day is refused');

  // the seal shop
  st.seals = 2;
  const pots = ann.inventory.count('health_potion') + ann.depot.reduce((a, x) => a + (x?.id === 'health_potion' ? x.qty : 0), 0);
  executeCommand(g, ann.id, { c: 'task', a: 'buy', i: 0 });
  check(st.seals === 2 && lastMsg(/You need 3 task seals/), 'too few seals: refused');
  st.seals = 100;
  executeCommand(g, ann.id, { c: 'task', a: 'buy', i: 0 });
  const pots2 = ann.inventory.count('health_potion') + ann.depot.reduce((a, x) => a + (x?.id === 'health_potion' ? x.qty : 0), 0);
  check(st.seals === 97 && pots2 === pots + 10, '10 health potions for 3 seals');

  // saves keep it all
  const save = g.serialize(ann.id);
  const g2 = new Game({ now: () => clock });
  const c = g2.addPlayer('Ann');
  check(g2.applySave(c.id, JSON.parse(JSON.stringify(save))) && JSON.stringify(c.tasks) === JSON.stringify(ann.tasks), 'tasks, seals and streak survive a save and load');
}

// ---------------------------------------------------------------- the next day
console.log('resets and the login streak');
{
  const st = ann.tasks;
  // finish one daily without claiming: the reset pays it
  const t = st.daily.find((x) => !x.c)!;
  t.h = t.n;
  const exp0 = ann.player.exp;
  clock += D;
  step(1.2);
  check(st.streak === 2 && st.day === taskDay(clock) && ann.player.exp > exp0 && lastMsg(/Login streak: 2 days/), 'next day: streak 2, new dailies, the finished task was paid');
  check(st.daily.every((x) => !x.c && x.h === 0), 'the new daily tasks are fresh');
  const week = st.week;
  clock += 3 * D;
  step(1.2);
  check(st.streak === 1 && st.week !== week, 'a gap breaks the streak; Monday brings new weekly tasks');
  clock = SAT;
}

// ---------------------------------------------------------------- calendar
console.log('calendar');
{
  const day = Date.UTC(2026, 9, 24);
  const list = calendarEntries(day, day + D, RAIDS.map((r) => r.id), WORLD_BOSSES.length);
  const at = (k: string, h: number) => list.find((e) => e.kind === k && e.at === day + h * H);
  check(!!at('treasure', TREASURE_HOUR_UTC) && !!at('raid', RAID_HOUR_UTC), `daily treasure hunt at ${TREASURE_HOUR_UTC}:00 and raid at ${RAID_HOUR_UTC}:00 UTC`);
  check(!!at('worldboss', WORLD_BOSS_HOUR_UTC), 'Saturday: an announced world boss at 20:00 UTC');
  const tue = Date.UTC(2026, 9, 27);
  check(!calendarEntries(tue, tue + D, RAIDS.map((r) => r.id), WORLD_BOSSES.length).some((e) => e.kind === 'worldboss'), 'no world boss on a Tuesday');
  check(list.filter((e) => e.kind === 'miniboss').length === 4, 'festival days: four mini-boss times');
  const raids = new Set(calendarEntries(day, day + RAIDS.length * D, RAIDS.map((r) => r.id), WORLD_BOSSES.length).filter((e) => e.kind === 'raid').map((e) => e.id));
  check(raids.size === RAIDS.length, `the daily raid visits every town in turn (${raids.size} raids)`);
  check(festivalByDate(Date.UTC(2026, 9, 24))?.id === 'hollowmoon' && festivalByDate(Date.UTC(2026, 11, 24))?.id === 'winterhearth' && festivalByDate(Date.UTC(2027, 0, 3))?.id === 'winterhearth' && !festivalByDate(Date.UTC(2026, 6, 1)), 'Hollow Moon in late October, Winterhearth over the new year, nothing in July');
  const w = festivalWindow(FESTIVALS[1], Date.UTC(2026, 9, 24));
  check(w.start === Date.UTC(2026, 11, 15) && w.end === Date.UTC(2027, 0, 6), 'the winter window wraps the new year');
  check(RAIDS.every((r) => !!g.world.regions.find((x) => x.name === r.area.region)), 'every raid town exists');
}

// ---------------------------------------------------------------- raids never in safe places
console.log('safety of event monsters');
{
  const ex = EXCHANGE_HOUSE;
  let bad = 0;
  for (const r of RAIDS) {
    const area = g.world.regions.find((x) => x.name === r.area.region && x.z0 <= 0 && x.z1 >= 0)!;
    for (let i = 0; i < 300; i++) {
      const t = g.worldEvents.raidTile(area, r.area.mode);
      if (!t) continue;
      const inEx = t.x >= ex.x && t.x < ex.x + ex.w && t.y >= ex.y && t.y < ex.y + ex.h;
      if (g.world.isSafe(t.x, t.y, 0) || g.world.regionAt(t.x, t.y, 0)?.safe || onIsle(t.x, t.y, 0) || inEx) bad++;
    }
  }
  check(bad === 0, 'raid spawn tiles are never in a protection zone, a temple, the Gilded Exchange or on Wayfarer\'s Isle');
  const e = g.spawnEnemy('orc', ISLE_MEADOW.x, ISLE_MEADOW.y, 0, { tag: 'raid', at: { x: ISLE_MEADOW.x, y: ISLE_MEADOW.y } });
  check(!!e && onIsle(e!.x, e!.y, 0), 'test: an event monster put on the isle');
  step(1.2);
  check(!!e && e.gone, 'it is taken away at once: no event monster on Wayfarer\'s Isle');
}

// ---------------------------------------------------------------- scheduled raid and world boss
console.log('scheduled events');
{
  clock = Date.UTC(2026, 9, 24, RAID_HOUR_UTC, 0) - 5 * 60_000 - 2000;
  step(1.2);
  check(!g.worldEvents.raid, 'no raid before its warning');
  clock += 4000;
  step(1.2);
  const day = Math.floor(clock / D);
  const want = calendarEntries(day * D, (day + 1) * D, RAIDS.map((r) => r.id), WORLD_BOSSES.length).find((x) => x.kind === 'raid')!.id;
  check(g.worldEvents.raid?.def.id === want, `the calendar raid is announced five minutes ahead (${want})`);
  // contribution: Ann fights the first wave
  const raid = g.worldEvents.raid!;
  (raid as { t: number }).t = 0;
  step(0.2);
  const raiders = g.enemies.filter((x) => raid.ids.has(x.id) && !x.dead);
  check(raiders.length > 0 && raiders.every((x) => !g.world.isSafe(x.x, x.y, x.z)), `the first wave arrives outside the protection zones (${raiders.length} raiders)`);
  const sealsBefore = ann.tasks.seals, expBefore = ann.player.exp;
  for (const x of raiders.slice(0, 5)) g.adminKill(ann.player, x);
  (g.worldEvents as unknown as { endRaid(w: boolean): void }).endRaid(true);
  check(ann.tasks.seals > sealsBefore && ann.player.exp > expBefore && lastMsg(/task seals for the defence/), `defenders are rewarded by contribution (+${ann.tasks.seals - sealsBefore} seals)`);
  check(heard.some((h) => /bravest defenders/.test(h)), 'the top defenders are named');

  // Saturday 20:00: a world boss, announced ten minutes ahead
  heard.length = 0;
  clock = Date.UTC(2026, 9, 24, WORLD_BOSS_HOUR_UTC, 0) - 10 * 60_000 - 2000;
  step(1.2);
  clock += 4000;
  step(1.2);
  check(heard.some((h) => /will awaken near .* in 10 minutes/.test(h)) && !g.worldEvents.worldBoss, 'world boss announced ten minutes ahead');
  check(g.liveEvents.view().a.some((a) => a[0] === 'worldboss'), 'the events view shows the coming world boss');
  clock += 10 * 60_000;
  step(1.2);
  check(!!g.worldEvents.worldBoss, `it wakes on time (${g.worldEvents.worldBoss ? ENEMIES[g.worldEvents.worldBoss.def.kind].name : 'no'})`);
  g.worldEvents.stopWorldBoss();
  step(0.2);
  clock = SAT;
}

// ---------------------------------------------------------------- treasure hunt
console.log('treasure hunt');
{
  heard.length = 0;
  check(g.liveEvents.startTreasure(), 'a treasure hunt starts');
  const tr = g.liveEvents.treasure!;
  check(tr.caches.length === TREASURE_CACHES && heard.some((h) => /treasure caches are hidden/.test(h)), `${tr.caches.length} caches hidden, everyone told`);
  check(tr.caches.every((c) => g.world.isWalkable(c.x, c.y, 0) && !g.world.isSafe(c.x, c.y, 0) && !onIsle(c.x, c.y, 0) && !g.premiumLand(c.x, c.y)), 'caches lie on open, free, unprotected ground');
  check(new Set(tr.caches.map((c) => c.region)).size === tr.caches.length, 'one cache per place');
  check(tr.caches.every((c) => !TOWNS.some((t) => t.name === c.region)), 'caches lie out in the wilds, not in the towns');
  const c0 = tr.caches[0];
  ann.player.placeAt(c0.x + 40, c0.y, 0);
  msgs.length = 0;
  g.time += 10;
  executeCommand(g, ann.id, { c: 'live', a: 'seek' });
  check(lastMsg(/The trail leads (west|north-west|south-west), about \d+ tiles away\./) || lastMsg(/The trail leads/), `seek gives a direction (${msgs[msgs.length - 1]})`);
  near(ann, c0.x, c0.y, 0);
  const seals0 = ann.tasks.seals;
  g.time += 10;
  executeCommand(g, ann.id, { c: 'live', a: 'seek' });
  check(c0.found === 'Ann' && ann.tasks.seals === seals0 + CACHE_SEALS && heard.some((h) => /Ann dug up a cache/.test(h)), 'standing by a cache digs it up: gold, a gem or potions, seals');
  check(g.liveEvents.view().tr?.length === TREASURE_CACHES - 1, 'the events view lists the places still hiding a cache');
  g.liveEvents.endTreasure(true);
}

// ---------------------------------------------------------------- festival
console.log('festival');
{
  const f = g.liveEvents.festival();
  check(f?.id === 'hollowmoon', 'late October: the Hollow Moon festival is on');
  const wolf = g.enemies.find((e) => !e.dead && !e.dynamic && e.def.exp >= 20 && !e.def.boss)!;
  const drops = withRandom(0.01, () => g.liveEvents.festivalLoot(wolf));
  check(drops.length === 1 && drops[0].id === 'hollow_pumpkin', 'monsters drop hollow pumpkins');
  check(withRandom(0.99, () => g.liveEvents.festivalLoot(wolf)).length === 0, '… but not every time');
  heard.length = 0;
  const town = g.liveEvents.startMiniboss(f!);
  const mb = g.liveEvents.miniboss;
  check(!!town && !!mb && !g.world.isSafe(mb.enemy.x, mb.enemy.y, 0) && !onIsle(mb.enemy.x, mb.enemy.y, 0) && heard.some((h) => /Gourdmaw/.test(h)), `Gourdmaw comes to ${town} (outside the protection zone), with his court`);
  g.adminKill(ann.player, mb!.enemy);
  check(!g.liveEvents.miniboss && heard.some((h) => /smashed to pulp/.test(h)), 'his fall is announced');
  // festival trades at the board
  near(ann, board.x, board.y + 1, board.z);
  // make room in the backpack (earlier checks filled it)
  ann.inventory.slots.forEach((x, i) => { if (x && x.id !== 'gold') ann.inventory.slots[i] = null; });
  ann.inventory.add('hollow_pumpkin', 30);
  executeCommand(g, ann.id, { c: 'task', a: 'festival', i: 0 });
  const hasGuise = () => ann.inventory.count('hollow_guise') + ann.depot.filter((x) => x?.id === 'hollow_guise').length > 0;
  check(hasGuise() && ann.inventory.count('hollow_pumpkin') === 5, 'pumpkins traded for the Hollow Moon Guise');
  const slot = ann.inventory.slots.findIndex((x) => x?.id === 'hollow_guise');
  if (slot >= 0) {
    g.useSlot(ann.id, slot);
    check(ann.player.illusion === 'skeleton' && ann.player.buffs.illusion > 0, 'the costume makes you a skeleton for a while');
    g.useSlot(ann.id, slot);
    check(!ann.player.illusion && ann.inventory.count('hollow_guise') === 1, 'used again it comes off, and is never used up');
  }
  g.liveEvents.setFestival('off');
  check(!g.liveEvents.festival() && withRandom(0.01, () => g.liveEvents.festivalLoot(wolf)).length === 0, 'a game master can switch it off: no more drops');
  g.liveEvents.setFestival('auto');
}

// ---------------------------------------------------------------- double weekends
console.log('double experience and skill');
{
  const s = ann;
  const e0 = s.player.exp;
  g.grantExp(s, 100, s.id, 'for a test');
  const plain = s.player.exp - e0;
  g.liveEvents.startDouble('exp', 2);
  const e1 = s.player.exp;
  g.grantExp(s, 100, s.id, 'for a test');
  check(s.player.exp - e1 === plain * 2, `double experience doubles monster experience (${plain} → ${s.player.exp - e1})`);
  const e2 = s.player.exp;
  g.grantExp(s, 100, s.id, 'for a task', true);
  check(s.player.exp - e2 === 100, 'task rewards are not doubled');
  g.liveEvents.startDouble('skill', 2);
  const x0 = s.gathering.mining;
  g.gainSkill(s, 'mining', 10, s.id);
  check(s.gathering.mining - x0 >= 20, 'double skill doubles trade-skill experience');
  clock += 3 * H;
  step(1.2);
  check(g.liveEvents.expRate() === 1 && g.liveEvents.skillRate() === 1, 'they end on time');
  clock = SAT;
  s.gathering.mining = gatherXpForLevel(1);
}

// ---------------------------------------------------------------- the network view
console.log('network view');
{
  const snap = buildSnapshot(g, ann) as { t: 'snap'; self: { tk?: unknown }; lv?: unknown };
  check(!!snap.self.tk && !!snap.lv, 'the snapshot carries the task board and the events view');
  const again = buildSnapshot(g, ann) as { self: { tk?: unknown }; lv?: unknown };
  check(!again.self.tk && !again.lv, 'unchanged: not sent again');
  const mirror = new Game({ simulate: false });
  const m = mirror.addPlayer('Ann', { id: ann.id });
  mirror.localId = m.id;
  applySnapshot(mirror, snap as never);
  check(m.tasks.seals === ann.tasks.seals && m.tasks.daily.length === 3, 'the client mirror knows the tasks and seals');
  const cv = mirror.liveEvents.clientView();
  check(!!cv.v && cv.v.c.length > 0 && Math.abs(cv.now - clock) < 5000, 'the client gets the calendar and the server\'s clock');
  check(mirror.liveEvents.festival()?.id === 'hollowmoon', 'the client knows the festival is on');
}

// ---------------------------------------------------------------- commands
console.log('game-master commands');
{
  const say = (t: string) => runAdminCommand(g, ann, t);
  msgs.length = 0;
  say('/double both 1');
  check(g.liveEvents.expRate() === 2 && g.liveEvents.skillRate() === 2, '/double both 1');
  say('/double off');
  check(g.liveEvents.expRate() === 1, '/double off');
  say('/event start treasure');
  check(!!g.liveEvents.treasure, '/event start treasure');
  say('/event stop treasure');
  check(!g.liveEvents.treasure, '/event stop treasure');
  say('/festival winterhearth');
  check(g.liveEvents.festival()?.id === 'winterhearth', '/festival winterhearth');
  say('/festival auto');
  check(g.liveEvents.festival()?.id === 'hollowmoon', '/festival auto');
  say('/event start raid scarab');
  check(g.worldEvents.raid?.def.id === 'scarab_swarm', '/event start raid scarab');
  say('/event stop raid');
  check(!g.worldEvents.raid, '/event stop raid');
  say('/tasks done');
  check([...ann.tasks.daily, ...ann.tasks.weekly].every((t) => t.h === t.n), '/tasks done');
  say('/event');
  check(msgs.some((m) => /Calendar: /.test(m)), '/event lists the calendar');
  // on a live server (not test mode) a tester without game-master rights may not
  const live = new Game({ now: () => clock, testMode: false });
  const t = live.addPlayer('Tess');
  t.testOnly = true;
  runAdminCommand(live, t, '/double both');
  check(live.liveEvents.expRate() === 1, 'testers cannot start double weekends on a live server');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll liveops checks passed.');
process.exit(failures ? 1 : 0);
