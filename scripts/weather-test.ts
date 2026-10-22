/**
 * Regional weather and jungle traps: deterministic weather per zone from the
 * wall clock, spells of 10–30 minutes with smooth fades, the `wx` snapshot
 * field, snow slowing walking only off-road outside towns, and traps that
 * root / poison players, re-arm, and never grow in protection zones or on
 * roads. Run as part of `npm run test:logic`.
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game } from '../src/game/Game';
import { applySnapshot, buildSnapshot, PROTOCOL_VERSION } from '../src/game/net/protocol';
import {
  BLIZZARD_SLOW, CLIMATE_WEATHER, Climate, decodeWeather, encodeWeather, hourSplit, kindAmount, sandVisibility, SNOW_SLOW, snowStepFactor,
  WEATHER_BLEND_S, WEATHER_MAX_MINUTES, WEATHER_MIN_MINUTES, WeatherKind, weatherAt,
} from '../src/game/world/weather';
import { FLOWER_POISON_SECONDS, placeTraps, TRAP_REARM_SECONDS, VINE_ROOT_SECONDS } from '../src/game/world/traps';
import { Ground } from '../src/game/world/WorldMap';
import { isUnderwater } from '../src/game/world/sea';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const T0 = Date.UTC(2026, 9, 22, 12, 0, 0);
let clock = T0;
const g = new Game({ now: () => clock });
const w = g.world;
const cm = g.weather.climate;

// ------------------------------------------------------------------ climate and zones
const townAt = (name: string) => w.regions.find((r) => r.name === name && r.temple);
const climateOf = (name: string) => {
  const r = townAt(name);
  return r ? cm.climateAt(r.temple!.x, r.temple!.y) : null;
};
check(climateOf('Thornvale') === Climate.Temperate || climateOf('Temple Plaza') === Climate.Temperate, 'Thornvale is temperate');
check(climateOf('Valdrheim') === Climate.Frost, 'Valdrheim (north) is frost');
check(climateOf('Sunspire') === Climate.Desert, 'Sunspire is desert');
check(climateOf('Palmreach') === Climate.Jungle || [...Array(40)].some((_, i) => {
  const r = townAt('Palmreach');
  return r && cm.climateAt(r.temple!.x + (i % 9 - 4) * 8, r.temple!.y + (Math.floor(i / 9) - 2) * 8) === Climate.Jungle;
}), 'the Palmreach jungle is jungle');
const counts = [0, 0, 0, 0, 0];
for (const c of cm.cells) counts[c]++;
check(counts.every((n, i) => i === Climate.Volcanic || n > 0), `every climate exists on the map (${counts.join(' / ')} cells)`);

// ------------------------------------------------------------------ deterministic weather
const zone = cm.zoneAt(200, 300);
const a = weatherAt(zone, Climate.Temperate, T0 + 123456);
const b = weatherAt(zone, Climate.Temperate, T0 + 123456);
check(JSON.stringify(a) === JSON.stringify(b), 'same zone, same moment → same weather');
let differs = false;
for (let h = 0; h < 48 && !differs; h++) differs = weatherAt(zone, Climate.Temperate, T0 + h * 3600_000).kind !== weatherAt(zone + 8, Climate.Temperate, T0 + h * 3600_000).kind;
check(differs, 'two zones of one climate have their own weather');
const g2 = new Game({ now: () => clock });
check(JSON.stringify(g2.weather.at(400, 500)) === JSON.stringify(g.weather.at(400, 500)), 'two games (server and client) agree on the weather');

let splitsOk = true;
for (let h = 0; h < 2000; h++) {
  const s = hourSplit(zone, 480000 + h);
  if (s.reduce((x, y) => x + y, 0) !== 60 || s.some((m) => m < WEATHER_MIN_MINUTES || m > WEATHER_MAX_MINUTES)) splitsOk = false;
}
check(splitsOk, 'every spell lasts 10–30 minutes and the spells fill each hour');

// a week, minute by minute, per climate: only that climate's kinds, and they change
for (const climate of [Climate.Temperate, Climate.Frost, Climate.Desert, Climate.Jungle]) {
  const z = 8 * 37 + climate;
  const seen = new Set<WeatherKind>();
  let changes = 0, prev = -1;
  for (let m = 0; m < 7 * 24 * 60; m += 1) {
    const s = weatherAt(z, climate, T0 + m * 60_000);
    seen.add(s.kind);
    if (s.kind !== prev) changes++;
    prev = s.kind;
  }
  const allowed = new Set(CLIMATE_WEATHER[climate].map(([k]) => k));
  check([...seen].every((k) => allowed.has(k)) && seen.size === allowed.size, `${Climate[climate]}: rolls exactly its own weather (${[...seen].join(',')})`);
  check(changes > 7 * 24 * 1.2 && changes < 7 * 24 * 6.5, `${Climate[climate]}: changes ${changes} times a week (every 10–30 min at most)`);
}

// smooth: strengths never jump within a second
let smooth = true, maxJump = 0;
for (let s = 0; s < 6 * 3600; s += 1) {
  const x = weatherAt(zone, Climate.Temperate, T0 + s * 1000), y = weatherAt(zone, Climate.Temperate, T0 + (s + 1) * 1000);
  for (const k of [WeatherKind.Cloudy, WeatherKind.Rain, WeatherKind.Storm]) {
    const d = Math.abs(kindAmount(x, k) - kindAmount(y, k));
    maxJump = Math.max(maxJump, d);
    if (d > 0.05) smooth = false;
  }
}
check(smooth, `weather fades over ${WEATHER_BLEND_S} s (largest change in one second ${maxJump.toFixed(3)})`);

// storms flash, calm weather never does
let stormFlash = false, calmFlash = false;
for (let m = 0; m < 3 * 24 * 60; m++) {
  const s = weatherAt(zone, Climate.Temperate, T0 + m * 60_000);
  if (s.flash && s.kind === WeatherKind.Storm) stormFlash = true;
  if (s.flash && s.kind === WeatherKind.Clear && s.prevAmount === 0) calmFlash = true;
}
check(stormFlash && !calmFlash, 'thunderstorms have lightning, clear skies none');

const rt = decodeWeather(encodeWeather(a));
check(!!rt && rt.kind === a.kind && Math.abs(rt.amount - a.amount) < 0.011 && rt.zone === a.zone, 'weather round-trips through its wire form');
check(decodeWeather('nope') === null && decodeWeather([1, 2]) === null, 'broken weather data is ignored');

// ------------------------------------------------------------------ snapshot field
check(PROTOCOL_VERSION >= 27, 'protocol 27: weather and traps in snapshots');
const watcher = g.addPlayer('Watcher', { intent: new BufferedIntent() });
const mirror = new Game({ simulate: false, now: () => clock });
const mw = mirror.addPlayer('Watcher', { id: watcher.id, starter: false });
mirror.localId = mw.id;
const snap = () => {
  const sn = buildSnapshot(g, watcher);
  if (sn.t !== 'snap') throw new Error('no snapshot');
  applySnapshot(mirror, sn);
  return sn;
};
let sn = snap();
check(Array.isArray(sn.wx) && sn.wx.length === 8, 'the snapshot carries the weather of the player\'s zone');
check(mirror.weatherView(watcher.id).zone === g.weatherView(watcher.id).zone && mirror.weatherView(watcher.id).kind === g.weatherView(watcher.id).kind, 'the client mirror shows the server\'s weather');
sn = snap();
check(sn.wx === undefined, 'unchanged weather is not resent');
g.weather.force(WeatherKind.Storm, 0.8);
sn = snap();
check(sn.wx?.[1] === WeatherKind.Storm && mirror.weatherView(watcher.id).kind === WeatherKind.Storm, 'a weather change reaches the client');
g.weather.force(null);
g.removePlayer(watcher.id);

// ------------------------------------------------------------------ snow slows walking, only off-road outside towns
let snowTile: { x: number; y: number } | null = null, townSnow: { x: number; y: number } | null = null, rock: { x: number; y: number } | null = null;
for (let y = 1; y < w.height - 1 && !(snowTile && townSnow && rock); y++) for (let x = 1; x < w.width - 1; x++) {
  if (w.getGround(x, y, 0) === Ground.Snow && w.isWalkable(x, y, 0) && w.isWalkable(x + 1, y, 0) && w.getGround(x + 1, y, 0) === Ground.Snow) {
    if (w.isSafe(x + 1, y, 0)) townSnow ??= { x, y };
    else if (!w.regionAt(x + 1, y, 0)?.temple) snowTile ??= { x, y };
  }
  if (cm.climateAt(x, y) === Climate.Frost && w.getGround(x + 1, y, 0) === Ground.Path && w.isWalkable(x, y, 0) && w.isWalkable(x + 1, y, 0)) rock ??= { x, y };
}
check(!!snowTile, 'found open snow ground');
const walker = g.addPlayer('Walker', { intent: new BufferedIntent() });
const wp = walker.player;
const stepDur = (t: { x: number; y: number }) => {
  wp.placeAt(t.x, t.y, 0);
  g.tryStep(wp, 1, 0);
  const d = wp.moveDur;
  wp.placeAt(t.x, t.y, 0);
  return d;
};
if (snowTile) {
  const base = wp.stepTime;
  g.weather.force(WeatherKind.Clear);
  check(Math.abs(stepDur(snowTile) - base) < 1e-9, 'clear weather: snow ground walks at normal speed');
  g.weather.force(WeatherKind.Snow, 1);
  check(Math.abs(stepDur(snowTile) - base * (1 + SNOW_SLOW)) < 1e-9, `fresh snow: ×${1 + SNOW_SLOW} step time off-road`);
  g.weather.force(WeatherKind.Blizzard, 1);
  check(Math.abs(stepDur(snowTile) - base * (1 + BLIZZARD_SLOW)) < 1e-9, `blizzard: ×${1 + BLIZZARD_SLOW} step time off-road`);
  if (townSnow) check(Math.abs(stepDur(townSnow) - base) < 1e-9, 'blizzard: no slowdown inside a town');
  if (rock) check(Math.abs(stepDur(rock) - base) < 1e-9, 'blizzard: no slowdown on a road');
  check(wp.stepTime === base, 'the weather never changes the walking speed stat itself');
  const wz = g.weather.at(snowTile.x, snowTile.y);
  check(snowStepFactor(w, wz, snowTile.x + 1, snowTile.y, -1) === 1, 'no snow slowdown underground');
}
// the sea floor (Sunken Reach) is below ground: no weather reaches it, and snow never slows you there
let seaTile: { x: number; y: number; z: number } | null = null;
for (let y = 0; y < w.height && !seaTile; y += 2) for (let x = 0; x < w.width; x += 2) if (isUnderwater(w, x, y, -1)) { seaTile = { x, y, z: -1 }; break; }
let surfaceSea = false;
for (let y = 0; y < w.height && !surfaceSea; y += 3) for (let x = 0; x < w.width; x += 3) if (isUnderwater(w, x, y, 0)) surfaceSea = true;
check(!!seaTile && !surfaceSea, 'the sea floor lies below ground level (the client draws no weather there)');
if (seaTile) {
  g.weather.force(WeatherKind.Blizzard, 1);
  check(snowStepFactor(w, g.weather.at(seaTile.x, seaTile.y), seaTile.x, seaTile.y, -1) === 1, 'no weather slowdown under the sea');
}
g.weather.force(WeatherKind.Sandstorm, 1);
const sv = sandVisibility(g.weather.at(100, 100));
check(sv.clear === 6 && sv.max > 0.5, 'a full sandstorm closes the view to 6 tiles');
g.weather.force(WeatherKind.Rain, 1);
check(sandVisibility(g.weather.at(100, 100)).max === 0, 'no haze without sand');
g.weather.force(null);

// ------------------------------------------------------------------ jungle traps
const traps = g.traps.list;
check(traps.length >= 20, `jungle traps placed (${traps.length}: ${traps.filter((t) => t.kind === 'vines').length} vines, ${traps.filter((t) => t.kind === 'flower').length} flowers)`);
check(JSON.stringify(placeTraps(g2.world)) === JSON.stringify(traps), 'traps sit on the same tiles for the server and every client');
const ROAD = [Ground.Path, Ground.Stone, Ground.Wood, Ground.Marble];
let bad = 0;
for (const t of traps) {
  if (w.isSafe(t.x, t.y, t.z) || w.regionAt(t.x, t.y, t.z)?.temple || w.houseAt(t.x, t.y, t.z) || w.getGround(t.x, t.y, 0) !== Ground.Jungle) bad++;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ROAD.includes(w.getGround(t.x + dx, t.y + dy, 0)) || w.isSafe(t.x + dx, t.y + dy, 0)) bad++;
}
check(bad === 0, 'no trap in a protection zone, a town, a house or on or beside a road');

const vine = traps.find((t) => t.kind === 'vines' && w.isWalkable(t.x - 1, t.y, 0) && !g.traps.at(t.x - 1, t.y, 0))!;
const flower = traps.find((t) => t.kind === 'flower' && w.isWalkable(t.x - 1, t.y, 0) && !g.traps.at(t.x - 1, t.y, 0))!;
// keep monsters out of the way
for (const e of g.enemies) if (Math.abs(e.x - vine.x) < 25 || Math.abs(e.x - flower.x) < 25) e.dead = true;
const run = (sec: number) => { for (let i = 0; i < sec * 20; i++) g.update(0.05); };
wp.placeAt(vine.x - 1, vine.y, 0);
check(g.tryStep(wp, 1, 0), 'walked onto a vine trap');
run(0.7);
check(wp.x === vine.x && wp.buffs.rooted > 0, `strangling vines root you (${VINE_ROOT_SECONDS} s)`);
check(!g.traps.armed(vine), 'the vine trap is sprung');
const held = new BufferedIntent();
walker.intent = held;
held.dir = { dx: 1, dy: 0 };
run(1);
check(wp.x === vine.x, 'rooted: you cannot walk away');
run(1.4);
check(wp.buffs.rooted === 0, 'the vines let go after 2 seconds');
held.dir = { dx: 0, dy: 0 };
run(1);
// stepping back on while it grows back does nothing
wp.placeAt(vine.x - 1, vine.y, 0);
g.tryStep(wp, 1, 0);
run(0.7);
check(wp.buffs.rooted === 0, 'a sprung trap does nothing until it grows back');
run(TRAP_REARM_SECONDS);
check(g.traps.armed(vine), `the trap re-arms after ${TRAP_REARM_SECONDS} s`);

wp.placeAt(flower.x - 1, flower.y, 0);
wp.buffs.poisoned = 0;
g.tryStep(wp, 1, 0);
run(0.7);
check(wp.buffs.poisoned > 0 && wp.buffs.poisoned <= FLOWER_POISON_SECONDS, 'a snapping flower poisons you');
check(wp.buffs.rooted === 0, 'flowers do not root');

// monsters never spring traps
const mon = g.enemies.find((e) => !e.dead && e.z === 0)!;
mon.dead = false;
mon.placeAt(vine.x - 1, vine.y, 0);
wp.placeAt(vine.x - 6, vine.y + 6, 0);
g.tryStep(mon, 1, 0);
for (let i = 0; i < 20; i++) g.advanceStep(mon, 0.05);
check(mon.x === vine.x && g.traps.armed(vine), 'monsters walk over traps without springing them');
mon.dead = true;

// traps on the wire
const tw = g.addPlayer('TrapWatcher', { intent: new BufferedIntent() });
tw.player.placeAt(flower.x + 2, flower.y + 2, 0);
const m2 = new Game({ simulate: false, now: () => clock });
const m2p = m2.addPlayer('TrapWatcher', { id: tw.id, starter: false });
m2.localId = m2p.id;
const snap2 = () => {
  const s = buildSnapshot(g, tw);
  if (s.t !== 'snap') throw new Error('no snapshot');
  applySnapshot(m2, s);
  return s;
};
let s2 = snap2();
check(s2.tr?.includes(flower.i) && !m2.traps.armed(m2.traps.list[flower.i]), 'a sprung trap nearby is sent and shown sprung');
run(TRAP_REARM_SECONDS + 1);
s2 = snap2();
check(Array.isArray(s2.tr) && !s2.tr.includes(flower.i) && m2.traps.armed(m2.traps.list[flower.i]), 'the client sees it grow back');
check(snap2().tr === undefined, 'an unchanged trap list is not resent');

if (failures) {
  console.log(`\n${failures} weather/trap check(s) FAILED`);
  process.exit(1);
}
console.log('\nweather + traps: all checks passed');
