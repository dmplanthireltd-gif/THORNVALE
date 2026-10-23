/**
 * Music selection test: which track plays where (title, regions with taking-turns variants, special
 * places, quiet indoor themes) and that every track has its song and rendered file.
 *
 *   npx tsx scripts/music-test.ts
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from '../src/game/world/worldGen';
import { SEA_ARRIVAL } from '../src/game/world/sea';
import { DUNGEON_BOSSES } from '../src/game/bosses/bosses';
import { INDOOR_PLACES, LOOP_SAMPLES, MusicPicker, PLACE_TRACKS, PlaceFinder, REROTATE_MS, TRACKS, indoorPlace, type Place } from '../src/audio/musicPlaces';
import { SONGS } from './music/songs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, passed = 0;
function check(cond: boolean, what: string): void {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${what}`); }
}

// ---------------------------------------------------------------- songs and files
for (const t of TRACKS) {
  const song = SONGS.find((s) => s.id === t);
  check(!!song, `track ${t} has a song in scripts/music/songs.ts`);
  if (!song) continue;
  const bars = song.form.reduce((a, f) => a + song.sections[f].chords.length, 0);
  const n = Math.round(bars * (song.bar ?? 16) * (60 / song.bpm / 4) * 44100);
  check(LOOP_SAMPLES[t] === n, `LOOP_SAMPLES.${t} = ${LOOP_SAMPLES[t]}, song is ${n}`);
  const sec = n / 44100;
  check(sec >= 45 && sec <= 150, `${t} loop length ${sec.toFixed(1)} s`);
  const file = join(ROOT, 'public', 'audio', 'music', `${t}.m4a`);
  check(existsSync(file), `${t}.m4a rendered`);
}
check(SONGS.every((s) => (TRACKS as string[]).includes(s.id)), 'every song is used by a place');
for (const p of INDOOR_PLACES) {
  const song = SONGS.find((s) => s.id === PLACE_TRACKS[p][0])!;
  const drums = [song.drums, ...Object.values(song.sections).map((x) => x.drums ?? song.drums)].join('');
  check((song.loudness ?? 0) <= -4.5, `indoor ${p} renders quieter (loudness ${song.loudness})`);
  check(song.bpm <= 92, `indoor ${p} is slow (${song.bpm} bpm)`);
  check(!/[sxho]/.test(drums), `indoor ${p} has no snare, hats or crash`);
}
const added = ['title', 'town2', 'fields2', 'forest2', 'deep2', 'sea2', 'court', 'reach', 'crypt', 'steppe', 'boss', 'shop', 'hall', 'temple', 'smithy'];
const bytes = added.reduce((a, t) => a + (existsSync(join(ROOT, 'public', 'audio', 'music', `${t}.m4a`)) ? statSync(join(ROOT, 'public', 'audio', 'music', `${t}.m4a`)).size : 0), 0);
check(bytes < 9 * 1024 * 1024, `new tracks total ${(bytes / 1048576).toFixed(1)} MB`);
for (const p of ['town', 'fields', 'forest', 'deep', 'sea'] as Place[]) check(PLACE_TRACKS[p].length >= 2, `${p} has two themes`);
check(PLACE_TRACKS.title[0] === 'title', 'title screen theme');

// ---------------------------------------------------------------- indoor names
check(indoorPlace('Thornvale Depot') === 'hall', 'depot → hall');
check(indoorPlace('Thornvale Bank') === 'hall', 'bank → hall');
check(indoorPlace('Millbrook Depot Hall') === 'hall', 'depot hall → hall');
check(indoorPlace('Temple of Thornvale') === 'temple', 'temple → temple');
check(indoorPlace("Brunhild's Smithy") === 'smithy', 'smithy → smithy');
check(indoorPlace("Garrick's Outfitters") === 'shop', 'outfitters → shop');
check(indoorPlace("Quillon the Wise's Magic Shop") === 'shop', 'magic shop → shop');
check(indoorPlace('General Store') === 'shop', 'general store → shop');

// ---------------------------------------------------------------- places in the real world
const world = buildWorld();
const finder = new PlaceFinder(world);
/** First walkable tile of a box (scanning from its middle outwards) that passes `ok`. */
function tile(x0: number, y0: number, x1: number, y1: number, z: number, ok: (x: number, y: number) => boolean = () => true): { x: number; y: number } | null {
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  for (let r = 0; r <= Math.max(x1 - x0, y1 - y0); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (world.isWalkable(x, y, z) && ok(x, y)) return { x, y };
    }
  }
  return null;
}
function inHouse(name: string): Place | null {
  const h = world.houses.find((q) => q.name === name);
  if (!h) return null;
  const t = tile(h.x + 1, h.y + 1, h.x + h.w - 2, h.y + h.h - 2, h.z);
  return t ? finder.placeAt(t.x, t.y, h.z) : null;
}
function inRegion(name: string, z: number, ok?: (x: number, y: number) => boolean): Place | null {
  const r = world.regions.find((q) => q.name === name && z >= q.z0 && z <= q.z1);
  if (!r) return null;
  const t = tile(r.x0, r.y0, r.x1, r.y1, z, (x, y) => world.regionAt(x, y, z)?.name === name && (!ok || ok(x, y)));
  return t ? finder.placeAt(t.x, t.y, z) : null;
}
const at = (p: Place | null, want: Place, what: string) => check(p === want, `${what}: ${p} (want ${want})`);

at(inHouse('Thornvale Depot'), 'hall', 'Thornvale depot');
at(inHouse('Thornvale Bank'), 'hall', 'Thornvale bank');
at(inHouse('Temple of Thornvale'), 'temple', 'Thornvale temple');
at(inHouse("Brunhild's Smithy"), 'smithy', "Brunhild's smithy");
at(inHouse("Garrick's Outfitters"), 'shop', "Garrick's shop");
at(inHouse('General Store'), 'shop', 'general store');
at(inHouse('Millbrook Depot Hall'), 'hall', 'Millbrook depot hall');
at(inHouse('Sunspire Temple'), 'temple', 'Sunspire temple');
at(inHouse("Barnaby's Smithy"), 'smithy', 'Millbrook smithy');
// every building inside a protection zone gets an indoor theme
let indoorOk = 0, indoorAll = 0;
for (const h of world.houses) {
  const t = tile(h.x + 1, h.y + 1, h.x + h.w - 2, h.y + h.h - 2, h.z);
  if (!t || !world.isSafe(t.x, t.y, h.z)) continue;
  indoorAll++;
  if (INDOOR_PLACES.has(finder.placeAt(t.x, t.y, h.z))) indoorOk++;
}
check(indoorAll > 50 && indoorOk === indoorAll, `town buildings with indoor music: ${indoorOk}/${indoorAll}`);
// monster buildings out in the wild keep the land's music
const orc = world.houses.find((h) => h.name === 'Orc Tower')!;
const orcTile = tile(orc.x + 1, orc.y + 1, orc.x + orc.w - 2, orc.y + orc.h - 2, orc.z);
check(!!orcTile && !INDOOR_PLACES.has(finder.placeAt(orcTile.x, orcTile.y, orc.z)), 'an orc tower is not a shop');

const plaza = world.plaza!;
const pt = tile(plaza.x0, plaza.y0, plaza.x1, plaza.y1, 0, (x, y) => !world.houseAt(x, y, 0));
at(pt ? finder.placeAt(pt.x, pt.y, 0) : null, 'court', 'Temple Court plaza');
at(inRegion('Thornvale', 0, (x, y) => !world.houseAt(x, y, 0) && !world.isSafe(x, y, 0)), 'court', 'Thornvale streets');
at(inRegion('Old Graveyard', 0), 'crypt', 'Old Graveyard');
at(inRegion('Millbrook', 0, (x, y) => !world.houseAt(x, y, 0)), 'town', 'Millbrook streets');
at(finder.placeAt(SEA_ARRIVAL.x, SEA_ARRIVAL.y, SEA_ARRIVAL.z), 'reach', 'Pearl Grotto');
at(inRegion('Coral Gardens', -1), 'reach', 'Coral Gardens');
at(inRegion('Gravewind Steppe', 0), 'steppe', 'Gravewind Steppe');
at(inRegion('The Silk Throne', 0), 'steppe', 'The Silk Throne');
const kinds = new Set<string>(DUNGEON_BOSSES.map((b) => b.kind));
const bosses = world.spawns.filter((s) => kinds.has(s.kind));
check(bosses.length >= 10, `dungeon boss lairs found: ${bosses.length}`);
for (const b of bosses) at(finder.placeAt(b.x, b.y, b.z), 'boss', `${b.kind}'s lair`);
const farFromBoss = (z: number) => (x: number, y: number) => bosses.every((b) => b.z !== z || Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) > 10);
at(inRegion('Hollow Crypt', -1, farFromBoss(-1)), 'crypt', 'Hollow Crypt');
at(inRegion('Aurelion Catacombs', -2, farFromBoss(-2)), 'crypt', 'Aurelion Catacombs');
at(inRegion('Tomb of Kesh', -1, farFromBoss(-1)), 'crypt', 'Tomb of Kesh');
at(inRegion('Stonedeep Mines', -1, (x, y) => farFromBoss(-1)(x, y) && !world.isSafe(x, y, -1)), 'deep', 'Stonedeep Mines');
at(inRegion('Thornvale Sewers', -1), 'deep', 'Thornvale Sewers');
at(inRegion('Molten Deep', -3, farFromBoss(-3)), 'volcano', 'Molten Deep');
at(inRegion('Frostfang Glacier', 0, farFromBoss(0)), 'snow', 'Frostfang Glacier');
at(inRegion('Sunspire Dunes', 0), 'desert', 'Sunspire Dunes');

// ---------------------------------------------------------------- taking turns
{
  const m = new MusicPicker();
  check(m.enter('title', 0) === 'title', 'title screen plays the title theme');
  check(m.enter('town', 1000) === 'town', 'first visit to a town: first theme');
  check(m.enter('battle', 5000) === 'battle', 'battle');
  check(m.enter('town', 9000) === 'town', 'a fight is not leaving: same theme');
  check(m.enter('fields', 20_000) === 'fields', 'fields: first theme');
  check(m.enter('town', 30_000) === 'town', 'back in town after 10 s: same theme');
  check(m.enter('fields', 40_000) === 'fields', 'back on the fields after 20 s: same theme');
  check(m.enter('town', 40_000 + REROTATE_MS) === 'town2', 'back in town after a while: the other theme');
  check(m.advance('town') === 'town', 'town2 played to its end: town again');
  check(m.advance('town') === 'town2', 'and town2 after that');
  check(m.enter('fields', 200_000) === 'fields2', 'back on the fields much later: fields2');
  check(m.advance('court') === 'court' && m.advance('shop') === 'shop', 'single-theme places keep their theme');
  check(m.enter('shop', 300_000) === 'shop' && m.enter('temple', 301_000) === 'temple' && m.enter('hall', 302_000) === 'hall', 'indoor themes');
}

console.log(`music-test: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
