/**
 * Music audit: walks every region of the world (every floor it covers) and prints which place and
 * track src/audio/musicPlaces.ts picks at the region's centre and at a few sample tiles, next to the
 * region's character (terrain, monsters, protection zone) and the music that character calls for.
 * A row is a MISMATCH when a sampled tile plays music that doesn't fit the region.
 *
 *   npx tsx scripts/music-audit.ts [out.md]     # prints the table (and writes it to out.md)
 *   npx tsx scripts/music-audit.ts --strict     # exit code 1 when anything mismatches
 */
import { writeFileSync } from 'node:fs';
import { buildWorld } from '../src/game/world/worldGen';
import { Ground, type Region } from '../src/game/world/WorldMap';
import { DUNGEON_BOSSES } from '../src/game/bosses/bosses';
import { MusicPicker, PLACE_TRACKS, PlaceFinder, type Place } from '../src/audio/musicPlaces';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const out = args.find((a) => !a.startsWith('--'));

const world = buildWorld();
const finder = new PlaceFinder(world);
const bossKinds = new Set<string>(DUNGEON_BOSSES.map((b) => b.kind));
const bosses = world.spawns.filter((s) => bossKinds.has(s.kind));

const GROUND_NAME: Record<number, string> = Object.fromEntries(Object.entries(Ground).filter(([, v]) => typeof v === 'number').map(([k, v]) => [v, k.toLowerCase()]));

interface Info { tiles: Array<{ x: number; y: number }>; ground: Map<string, number>; monsters: Map<string, number> }

/** Walkable tiles of the region on floor z where it is the innermost region, its ground mix and its monsters. */
function survey(r: Region, z: number): Info {
  const tiles: Info['tiles'] = [], ground = new Map<string, number>(), monsters = new Map<string, number>();
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (world.regionAt(x, y, z)?.name !== r.name || !world.isWalkable(x, y, z)) continue;
    tiles.push({ x, y });
    const g = GROUND_NAME[world.getGround(x, y, z)] ?? '?';
    ground.set(g, (ground.get(g) ?? 0) + 1);
  }
  for (const s of world.spawns) if (s.z === z && world.regionAt(s.x, s.y, z)?.name === r.name) monsters.set(s.kind, (monsters.get(s.kind) ?? 0) + 1);
  return { tiles, ground, monsters };
}

const share = (m: Map<string, number>, test: (k: string) => boolean) => {
  let a = 0, n = 0;
  for (const [k, v] of m) { n += v; if (test(k)) a += v; }
  return n ? a / n : 0;
};

const TOWN_THEME: Record<string, Place> = {
  Thornvale: 'court', Westmarch: 'westmarch', Elderglen: 'elderglen', Stonedeep: 'stonedeep', Highmoor: 'highmoor',
  Millbrook: 'millbrook', Valdrheim: 'valdrheim', Aurelion: 'aurelion', Briarwatch: 'briarwatch', Corvane: 'harbour',
  Saltmere: 'harbour', Palmreach: 'palmreach', Sunspire: 'oasis', Dunewatch: 'oasis',
};

/**
 * What the region's character calls for: the places that fit (the first is the ideal one).
 * Judged from its name, protection zone, monsters and ground, independently of musicPlaces.ts.
 */
function expected(r: Region, z: number, info: Info): { want: Place[]; why: string } {
  const n = r.name, mon = info.monsters;
  if (r.safe) {
    if (n === "Wayfarer's Rest") return { want: ['isle'], why: 'tutorial isle refuge' };
    if (n === 'Pearl Grotto') return { want: ['reach'], why: 'sea-floor refuge' };
    if (n === 'Pearl Pier') return { want: ['millbrook', 'harbour'], why: "Millbrook's pier" };
    const town = n.replace(/ Harbour$/, '');
    if (TOWN_THEME[town]) return { want: [TOWN_THEME[town]], why: n.endsWith('Harbour') ? `${town}'s harbour` : `town (${town})` };
    if (/landing/i.test(n)) return { want: ['town', 'harbour'], why: 'island landing' };
    if (/temple plaza/i.test(n)) return { want: ['court'], why: 'Temple Court' };
    return { want: ['town'], why: 'protection zone' };
  }
  if (n === "Wayfarer's Isle") return z === 0 ? { want: ['isle'], why: 'tutorial isle' } : { want: ['deep', 'isle'], why: 'tutorial cave' };
  if (/^(thornvale|greywood|miller's farm)$/i.test(n)) return { want: ['court'], why: 'Thornvale (spawn city)' };
  if (n === 'Old Graveyard') return { want: ['crypt'], why: 'graveyard' };
  if (/gravewind|silk throne/i.test(n)) return { want: ['steppe'], why: 'the steppe' };
  if (r.x0 >= 244 && r.x1 <= 358 && r.y0 >= 560 && r.y1 <= 638 && z === -1) return { want: ['reach'], why: 'Sunken Reach' };
  const orc = share(mon, (k) => k.startsWith('orc')), mino = share(mon, (k) => k.startsWith('minotaur')),
    elf = share(mon, (k) => k.startsWith('elf')), dwarf = share(mon, (k) => k.startsWith('dwarf')),
    dragon = share(mon, (k) => /dragon/.test(k)), lizard = share(mon, (k) => k.startsWith('lizard')),
    mummy = share(mon, (k) => /mummy|scarab|sand_king/.test(k)), dead = share(mon, (k) => /skeleton|ghoul|bonebound|grave/.test(k)),
    fire = share(mon, (k) => /fire_elemental|behemoth|demon|ashen/.test(k)), ice = share(mon, (k) => /crystal_spider|ice_golem|frost|rime/.test(k)),
    bog = share(mon, (k) => /hydra|crocodile/.test(k));
  const gr = (k: string) => share(info.ground, (g) => g === k);
  if (/ember|infernal|burning|abyssal|demon pit/i.test(n)) return { want: ['volcano'], why: 'fire and brimstone' };
  if (orc >= 0.5) return { want: ['warcamp'], why: 'orc warcamp' };
  if (mino >= 0.5) return { want: ['labyrinth'], why: 'minotaur labyrinth' };
  if (elf >= 0.4 || /silverbough|glimmer/i.test(n)) return { want: ['elfwood'], why: 'elven woods' };
  if (dwarf >= 0.5 && z < 0) return { want: ['mines'], why: 'dwarven mines' };
  if (dragon >= 0.5 || /dragon|caldera/i.test(n)) return { want: ['dragon'], why: 'dragon lair' };
  if (lizard >= 0.5 && /temple|sanctum|undercroft/i.test(n)) return { want: ['serpent'], why: 'lizard temple' };
  if (/temple of the sunken eye/i.test(n)) return { want: ['serpent'], why: 'jungle temple' };
  if (mummy >= 0.4 || /kesh|pharaoh|valley of tombs/i.test(n)) return { want: ['tomb'], why: 'desert tomb' };
  if (z < 0 && ice >= 0.5) return { want: ['icecave'], why: 'ice caves' };
  if (z < 0 && /jotun/i.test(n)) return { want: ['icecave'], why: 'frost giant caves' };
  if (fire >= 0.5 && (z < 0 || gr('lava') + gr('ash') > 0.15)) return { want: ['volcano', 'crypt'], why: 'fire and brimstone' };
  if (dead >= 0.5 || /crypt|catacomb|bonecrag|ruins/i.test(n)) return { want: ['crypt'], why: 'undead crypt' };
  if (bog >= 0.5 || /mire|bog|hydra/i.test(n)) return { want: z < 0 ? ['swamp'] : ['swamp', ...landThemes(r, z)], why: 'swamp / mire' };
  if (/smugglers/i.test(n)) return { want: ['sea', 'deep'], why: "smugglers' sea cave" };
  if (z < 0) return { want: ['deep', 'volcano'], why: 'cave' };
  // surface: the land itself decides (land mix): any outdoor land theme whose ground is really there
  return { want: landThemes(r, z), why: 'open land' };
}

/**
 * Land themes that fit a surface region: the ones whose ground covers at least 5% of the region and
 * its 4-tile rim (the land mix looks 4 tiles around the player), most common first; fields always fit.
 */
function landThemes(r: Region, z: number): Place[] {
  const c = new Map<Place, number>();
  let n = 0;
  for (let y = r.y0 - 4; y <= r.y1 + 4; y++) for (let x = r.x0 - 4; x <= r.x1 + 4; x++) {
    const g = world.getGround(x, y, z);
    if (g === Ground.Void) continue;
    n++;
    const p: Place | null = g === Ground.Snow || g === Ground.Ice ? 'snow' : g === Ground.Lava || g === Ground.Ash ? 'volcano' : g === Ground.Sand ? 'desert'
      : g === Ground.Jungle ? 'jungle' : g === Ground.Swamp ? 'swamp' : g === Ground.DarkGrass ? 'forest' : g === Ground.Water || g === Ground.DeepWater ? 'sea' : null;
    if (p) c.set(p, (c.get(p) ?? 0) + 1);
  }
  const out = [...c].filter(([, k]) => k >= n * 0.05).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  if (out.includes('swamp') && !out.includes('jungle')) out.push('jungle');
  return [...out, 'fields'];
}

/** Up to five sample tiles: the walkable tile nearest the region's centre and four spread out. */
function samples(r: Region, info: Info): Array<{ x: number; y: number }> {
  if (!info.tiles.length) return [];
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const near = (tx: number, ty: number) => info.tiles.reduce((b, t) => ((t.x - tx) ** 2 + (t.y - ty) ** 2 < (b.x - tx) ** 2 + (b.y - ty) ** 2 ? t : b));
  const qx = (r.x1 - r.x0) / 4, qy = (r.y1 - r.y0) / 4;
  const pts = [near(cx, cy), near(cx - qx, cy - qy), near(cx + qx, cy - qy), near(cx - qx, cy + qy), near(cx + qx, cy + qy)];
  return pts.filter((p, i) => pts.findIndex((q) => q.x === p.x && q.y === p.y) === i);
}

const top = (m: Map<string, number>, k: number, total = true) => {
  const n = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, b]) => (total ? `${a} ${Math.round((100 * b) / n)}%` : `${a}×${b}`)).join(', ');
};

const picker = new MusicPicker();
const trackOf = (p: Place) => PLACE_TRACKS[p].join('/');
const rows: string[] = [];
let mismatches = 0, regions = 0;
const seen = new Set<string>();
for (const r of world.regions) {
  for (let z = r.z0; z <= r.z1; z++) {
    const key = `${r.name}@${z}`;
    if (seen.has(key)) continue;
    // a region listed twice (an outer box and an inner box) is surveyed once per floor
    const info = survey(r, z);
    if (!info.tiles.length) continue;
    seen.add(key);
    regions++;
    const { want, why } = expected(r, z, info);
    const pts = samples(r, info);
    const picks = pts.map((p) => {
      const pl = finder.placeAt(p.x, p.y, z);
      // tiles in a town building or right next to a boss legitimately play indoor/boss music
      const house = world.houseAt(p.x, p.y, z), safe = world.isSafe(p.x, p.y, z);
      const bossNear = !safe && bosses.some((b) => b.z === z && Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)) <= 7);
      const ok = want.includes(pl) || (house && safe && ['shop', 'hall', 'temple', 'smithy'].includes(pl)) || (bossNear && pl === 'boss');
      return { pl, ok };
    });
    const bad = picks.filter((p) => !p.ok);
    if (bad.length) mismatches++;
    const character = [
      r.safe ? 'protection zone' : `lvl ${r.level}`,
      top(info.ground, 2),
      info.monsters.size ? top(info.monsters, 3, false) : 'no monsters',
    ].join('; ');
    rows.push(`| ${r.name} | ${z} | ${character} | ${why} → ${want[0]} | ${picks[0].pl} (${trackOf(picks[0].pl)}) | ${picks.map((p) => p.pl).join(', ')} | ${bad.length ? '**MISMATCH**' : 'ok'} |`);
  }
}
void picker;

const md = [
  '# Thornvale music audit',
  '',
  `${regions} region floors, ${mismatches} mismatches.`,
  '',
  '| Region | Floor | Character (zone/level; ground; monsters) | Calls for | Centre plays (track) | Sample tiles | Status |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
].join('\n');
console.log(md);
if (out) writeFileSync(out, md);
if (strict && mismatches) process.exit(1);
