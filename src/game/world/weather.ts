import { Ground, type WorldMap } from './WorldMap';

/**
 * Regional weather. Pure and deterministic: the weather of a zone at a moment
 * is worked out from the wall clock and a seed only, so a server, its clients
 * and a restarted server all agree, and everybody standing in one zone sees
 * the same sky. Nothing here is saved.
 *
 * The world is cut into climate cells (from the ground of the surface floor:
 * snow, sand, jungle…) and 128-tile blocks; a zone is one climate inside one
 * block. Each hour of each zone is split into 2–3 spells of 10–30 minutes;
 * every spell rolls a kind (rain, snow, sandstorm…), an intensity and a wind,
 * and the first `WEATHER_BLEND_S` seconds of a spell fade over from the last.
 *
 * Gameplay is light on purpose (owner rule): fresh snow and blizzards make
 * walking on snow ground a little slower outside towns, and sandstorms only
 * shrink how far you can see (client haze). Combat numbers never change.
 */

export enum Climate {
  Temperate = 0,
  Frost = 1,
  Desert = 2,
  Jungle = 3,
  Volcanic = 4,
}

export enum WeatherKind {
  Clear = 0,
  Cloudy = 1,
  Rain = 2,
  Storm = 3,
  Snow = 4,
  Blizzard = 5,
  /** Desert: wind lifting light dust. */
  Dust = 6,
  Sandstorm = 7,
  /** Jungle: low drifting mist. */
  Mist = 8,
  /** Jungle: tropical downpour (now and then with thunder). */
  Downpour = 9,
}

export const WEATHER_NAMES: Record<WeatherKind, string> = {
  [WeatherKind.Clear]: 'clear', [WeatherKind.Cloudy]: 'cloudy', [WeatherKind.Rain]: 'rain', [WeatherKind.Storm]: 'storm',
  [WeatherKind.Snow]: 'snow', [WeatherKind.Blizzard]: 'blizzard', [WeatherKind.Dust]: 'dust', [WeatherKind.Sandstorm]: 'sandstorm',
  [WeatherKind.Mist]: 'mist', [WeatherKind.Downpour]: 'downpour',
};

/** Which kinds each climate rolls, and how often (weights). */
export const CLIMATE_WEATHER: Record<Climate, Array<[WeatherKind, number]>> = {
  [Climate.Temperate]: [[WeatherKind.Clear, 40], [WeatherKind.Cloudy, 25], [WeatherKind.Rain, 22], [WeatherKind.Storm, 13]],
  [Climate.Frost]: [[WeatherKind.Clear, 30], [WeatherKind.Cloudy, 20], [WeatherKind.Snow, 35], [WeatherKind.Blizzard, 15]],
  [Climate.Desert]: [[WeatherKind.Clear, 55], [WeatherKind.Dust, 27], [WeatherKind.Sandstorm, 18]],
  [Climate.Jungle]: [[WeatherKind.Clear, 30], [WeatherKind.Mist, 35], [WeatherKind.Downpour, 35]],
  [Climate.Volcanic]: [[WeatherKind.Clear, 70], [WeatherKind.Cloudy, 30]],
};

/** Typical wind (0–1) of each kind; a spell scales it by 0.75–1.25. */
const KIND_WIND: Record<WeatherKind, number> = {
  [WeatherKind.Clear]: 0.2, [WeatherKind.Cloudy]: 0.32, [WeatherKind.Rain]: 0.42, [WeatherKind.Storm]: 0.85,
  [WeatherKind.Snow]: 0.3, [WeatherKind.Blizzard]: 0.95, [WeatherKind.Dust]: 0.6, [WeatherKind.Sandstorm]: 0.95,
  [WeatherKind.Mist]: 0.1, [WeatherKind.Downpour]: 0.5,
};

/** Seconds a new spell takes to fade in over the last one. */
export const WEATHER_BLEND_S = 120;
/** Shortest and longest spell, minutes (each hour is split into spells from `HOUR_SPLITS`). */
export const WEATHER_MIN_MINUTES = 10;
export const WEATHER_MAX_MINUTES = 30;
const HOUR_SPLITS: number[][] = [
  [30, 30], [20, 20, 20], [10, 20, 30], [30, 20, 10], [20, 30, 10], [15, 25, 20], [25, 10, 25],
  [10, 30, 20], [20, 10, 30], [12, 18, 30], [30, 15, 15], [15, 15, 30], [18, 24, 18], [24, 12, 24],
];
const HOUR_MS = 3600_000;
const MIN_MS = 60_000;
/** Size of a climate cell and of a weather block, in tiles. */
export const CLIMATE_CELL = 16;
export const WEATHER_BLOCK = 128;
export const DEFAULT_WEATHER_SEED = 0x7e47;

/** Gameplay: extra step time on snow ground outside towns, at full strength (×1.10 / ×1.20). */
export const SNOW_SLOW = 0.1;
export const BLIZZARD_SLOW = 0.2;
/**
 * Sandstorm visibility (client haze, tiles from the player): clear up to
 * `SAND_CLEAR_FAR` in calm air, shrinking to `SAND_CLEAR_NEAR` at full storm,
 * then fading to `SAND_HAZE_MAX` opacity over `SAND_HAZE_FADE` tiles.
 */
export const SAND_CLEAR_NEAR = 6;
export const SAND_CLEAR_FAR = 16;
export const SAND_HAZE_FADE = 4;
export const SAND_HAZE_MAX = 0.82;
/** Chance of a lightning flash in any one second: storms, and the odd one in a downpour (× intensity). */
export const STORM_FLASH_CHANCE = 0.07;
export const DOWNPOUR_FLASH_CHANCE = 0.015;

/** One spell of weather. */
interface Spell {
  kind: WeatherKind;
  intensity: number;
  wind: number;
  dir: number;
  /** Start of the spell (ms). */
  start: number;
}

/** The weather at one moment in one zone, as the game and the wire use it. */
export interface WeatherState {
  zone: number;
  climate: Climate;
  /** The kind fading in (or holding) and its strength 0–1. */
  kind: WeatherKind;
  amount: number;
  /** The kind fading out and what is left of it (0 = none). */
  prev: WeatherKind;
  prevAmount: number;
  /** Wind strength 0–1 and the direction it blows towards (radians, 0 = east, π/2 = south). */
  wind: number;
  dir: number;
  /** Id of the last lightning flash (its second since 1970, 0 = none in the last minute). */
  flash: number;
}

export const CALM: WeatherState = { zone: -1, climate: Climate.Temperate, kind: WeatherKind.Clear, amount: 0, prev: WeatherKind.Clear, prevAmount: 0, wind: 0, dir: 0, flash: 0 };

/** Integer hash in [0,1) that stays exact for large inputs (seconds since 1970). */
function hash2(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(salt | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function pickKind(climate: Climate, r: number): WeatherKind {
  const list = CLIMATE_WEATHER[climate];
  let total = 0;
  for (const [, w] of list) total += w;
  let x = r * total;
  for (const [k, w] of list) {
    if (x < w) return k;
    x -= w;
  }
  return list[list.length - 1][0];
}

/** The split (minutes per spell) of one hour of one zone. */
export function hourSplit(zone: number, hour: number, seed = DEFAULT_WEATHER_SEED): number[] {
  return HOUR_SPLITS[Math.floor(hash2(zone, hour, seed) * HOUR_SPLITS.length)];
}

function spellAt(zone: number, climate: Climate, hour: number, i: number, start: number, seed: number): Spell {
  const k = hour * 8 + i;
  const kind = pickKind(climate, hash2(zone, k, seed + 1));
  const intensity = 0.55 + 0.45 * hash2(zone, k, seed + 2);
  const wind = Math.min(1, KIND_WIND[kind] * (0.75 + 0.5 * hash2(zone, k, seed + 3)));
  // the prevailing wind of a zone drifts slowly; a spell turns it a little
  const dir = hash2(zone, 0, seed + 4) * Math.PI * 2 + (hash2(zone, k, seed + 5) - 0.5) * 1.6;
  return { kind, intensity, wind, dir, start };
}

/** The spell running at `ms` and the one before it. */
function spellsAround(zone: number, climate: Climate, ms: number, seed: number): { cur: Spell; prev: Spell } {
  const hour = Math.floor(ms / HOUR_MS);
  const split = hourSplit(zone, hour, seed);
  let t = hour * HOUR_MS, i = 0;
  while (i < split.length - 1 && ms >= t + split[i] * MIN_MS) t += split[i++] * MIN_MS;
  const cur = spellAt(zone, climate, hour, i, t, seed);
  let prev: Spell;
  if (i > 0) {
    prev = spellAt(zone, climate, hour, i - 1, t - split[i - 1] * MIN_MS, seed);
  } else {
    const ps = hourSplit(zone, hour - 1, seed);
    prev = spellAt(zone, climate, hour - 1, ps.length - 1, t - ps[ps.length - 1] * MIN_MS, seed);
  }
  return { cur, prev };
}

/** Strength of lightning in a state: 0 none, up to 1 for a full storm. */
function flashChance(kind: WeatherKind, amount: number): number {
  if (kind === WeatherKind.Storm) return STORM_FLASH_CHANCE * amount;
  if (kind === WeatherKind.Downpour) return DOWNPOUR_FLASH_CHANCE * amount;
  return 0;
}

/** The weather of one zone at a wall-clock moment (ms). Same inputs, same answer, everywhere. */
export function weatherAt(zone: number, climate: Climate, ms: number, seed = DEFAULT_WEATHER_SEED): WeatherState {
  const { cur, prev } = spellsAround(zone, climate, ms, seed);
  const b = Math.min(1, Math.max(0, (ms - cur.start) / (WEATHER_BLEND_S * 1000)));
  const s = smooth(b);
  let kind = cur.kind, amount = cur.intensity, pk = prev.kind, pa = 0;
  if (cur.kind === prev.kind) {
    amount = prev.intensity + (cur.intensity - prev.intensity) * s;
  } else {
    amount = cur.intensity * s;
    pa = prev.intensity * (1 - s);
  }
  if (kind === WeatherKind.Clear) amount = 1;
  if (pk === WeatherKind.Clear) pa = 0;
  const wind = prev.wind + (cur.wind - prev.wind) * s;
  const dir = lerpAngle(prev.dir, cur.dir, s);
  // lightning: each second of a stormy spell may hold one flash; report the latest of the last minute
  let flash = 0;
  const sec = Math.floor(ms / 1000);
  const c = Math.max(flashChance(kind, amount), flashChance(pk, pa));
  if (c > 0) {
    for (let k = sec; k > sec - 60; k--) {
      if (hash2(zone, k, seed + 9) < c) { flash = k; break; }
    }
  }
  return { zone, climate, kind, amount: round2(amount), prev: pk, prevAmount: round2(pa), wind: round2(wind), dir: Math.round(dir * 100) / 100, flash };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** How strongly a state shows one kind (0–1), counting the spell fading out too. */
export function kindAmount(w: WeatherState, kind: WeatherKind): number {
  return (w.kind === kind ? w.amount : 0) + (w.prev === kind ? w.prevAmount : 0);
}

/** Lightning flash details from its id (same on every client): seconds until the thunder, loudness 0.4–1. */
export function flashInfo(id: number, zone: number, seed = DEFAULT_WEATHER_SEED): { delay: number; power: number } {
  const r = hash2(zone, id, seed + 11);
  return { delay: 0.25 + r * 2.6, power: 1 - r * 0.6 };
}

// ------------------------------------------------------------------ climate map

/** Climate per 16×16 cell, read from the surface ground (snow, sand, jungle, lava) around it. */
export class ClimateMap {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Uint8Array;

  constructor(readonly world: WorldMap) {
    const C = CLIMATE_CELL;
    this.cols = Math.ceil(world.width / C);
    this.rows = Math.ceil(world.height / C);
    const n = this.cols * this.rows;
    // ground counts per cell
    const cnt = new Uint16Array(n * 5); // land, frost, sand, jungle, lava
    const f = world.floor(0);
    if (f) {
      for (let y = 0; y < world.height; y++) {
        const row = Math.floor(y / C) * this.cols;
        for (let x = 0; x < world.width; x++) {
          const g = f.ground[y * world.width + x];
          if (g === Ground.Water || g === Ground.DeepWater || g === Ground.Void) continue;
          const o = (row + Math.floor(x / C)) * 5;
          cnt[o]++;
          if (g === Ground.Snow || g === Ground.Ice) cnt[o + 1]++;
          else if (g === Ground.Sand) cnt[o + 2]++;
          else if (g === Ground.Jungle) cnt[o + 3]++;
          else if (g === Ground.Lava || g === Ground.Ash) cnt[o + 4]++;
        }
      }
    }
    this.cells = new Uint8Array(n).fill(255);
    // classify each cell from its 3×3 neighbourhood (48×48 tiles) so borders are not noisy
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) {
      let land = 0, fr = 0, sa = 0, ju = 0, la = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const o = (y * this.cols + x) * 5;
        const w = dx === 0 && dy === 0 ? 2 : 1;
        land += cnt[o] * w; fr += cnt[o + 1] * w; sa += cnt[o + 2] * w; ju += cnt[o + 3] * w; la += cnt[o + 4] * w;
      }
      const own = cnt[(cy * this.cols + cx) * 5];
      if (own < C * C * 0.08 || land === 0) continue; // open sea: filled in below
      let c = Climate.Temperate;
      if (fr / land > 0.28) c = Climate.Frost;
      else if (la / land > 0.25) c = Climate.Volcanic;
      else if (ju / land > 0.25) c = Climate.Jungle;
      else if (sa / land > 0.35) c = Climate.Desert;
      this.cells[cy * this.cols + cx] = c;
    }
    // sea cells take the climate of the nearest land (breadth-first over cells)
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) if (this.cells[i] !== 255) frontier.push(i);
    if (!frontier.length) this.cells.fill(Climate.Temperate);
    while (frontier.length) {
      const next: number[] = [];
      for (const i of frontier) {
        const x = i % this.cols, y = Math.floor(i / this.cols);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const j = ny * this.cols + nx;
          if (this.cells[j] !== 255) continue;
          this.cells[j] = this.cells[i];
          next.push(j);
        }
      }
      frontier = next;
    }
  }

  climateAt(x: number, y: number): Climate {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CLIMATE_CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CLIMATE_CELL)));
    return this.cells[cy * this.cols + cx] as Climate;
  }

  /** Weather zone of a tile: its climate inside its 128-tile block. */
  zoneAt(x: number, y: number): number {
    const bx = Math.max(0, Math.floor(x / WEATHER_BLOCK));
    const by = Math.max(0, Math.floor(y / WEATHER_BLOCK));
    return (by * 16 + bx) * 8 + this.climateAt(x, y);
  }
}

export function zoneClimate(zone: number): Climate {
  return (zone % 8) as Climate;
}

// ------------------------------------------------------------------ the system inside Game

/** Wire form of a WeatherState: [zone, kind, amount%, prev, prevAmount%, wind%, dir (degrees), flash]. */
export type WeatherSnap = [number, number, number, number, number, number, number, number];

export function encodeWeather(w: WeatherState): WeatherSnap {
  const deg = Math.round((((w.dir * 180) / Math.PI) % 360 + 360) % 360);
  return [w.zone, w.kind, Math.round(w.amount * 100), w.prev, Math.round(w.prevAmount * 100), Math.round(w.wind * 100), deg, w.flash];
}

export function decodeWeather(a: unknown): WeatherState | null {
  if (!Array.isArray(a) || a.length < 8 || !a.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const kind = (v: number): WeatherKind => (v >= 0 && v <= 9 ? Math.floor(v) : 0) as WeatherKind;
  const pc = (v: number) => Math.min(1, Math.max(0, v / 100));
  return {
    zone: a[0], climate: zoneClimate(Math.max(0, a[0])), kind: kind(a[1]), amount: pc(a[2]), prev: kind(a[3]), prevAmount: pc(a[4]),
    wind: pc(a[5]), dir: (a[6] * Math.PI) / 180, flash: a[7],
  };
}

/** Weather inside a Game: zones, a per-second cache and the test override (/weather). */
export class WeatherSystem {
  readonly climate: ClimateMap;
  private cache = new Map<number, WeatherState>();
  private cacheSec = -1;
  /** /weather: one kind everywhere until cleared (test servers and offline). */
  private forced: { kind: WeatherKind; amount: number; wind: number } | null = null;

  constructor(world: WorldMap, private readonly now: () => number, readonly seed = DEFAULT_WEATHER_SEED) {
    this.climate = new ClimateMap(world);
  }

  force(kind: WeatherKind | null, amount = 1): void {
    this.forced = kind === null ? null : { kind, amount: Math.min(1, Math.max(0.05, amount)), wind: Math.min(1, KIND_WIND[kind] * (0.6 + amount * 0.5)) };
    this.cache.clear();
  }

  get forcedKind(): WeatherKind | null {
    return this.forced?.kind ?? null;
  }

  zone(zone: number): WeatherState {
    const ms = this.now();
    const sec = Math.floor(ms / 1000);
    if (sec !== this.cacheSec) {
      this.cacheSec = sec;
      this.cache.clear();
    }
    let w = this.cache.get(zone);
    if (!w) {
      w = weatherAt(zone, zoneClimate(zone), ms, this.seed);
      if (this.forced) {
        const f = this.forced;
        // forced storms still flash: every 6–12 s
        const flash = f.kind === WeatherKind.Storm || f.kind === WeatherKind.Downpour ? Math.floor(sec / 8) * 8 : 0;
        w = { ...w, kind: f.kind, amount: f.amount, prev: WeatherKind.Clear, prevAmount: 0, wind: f.wind, flash };
      }
      this.cache.set(zone, w);
    }
    return w;
  }

  at(x: number, y: number): WeatherState {
    return this.zone(this.climate.zoneAt(x, y));
  }
}

/**
 * Step-time multiplier from the weather on a tile: fresh snow (×1 + 0.10 × amount) and
 * blizzards (×1 + 0.20 × amount) on snow ground of the surface, outside protection
 * zones and towns. 1 everywhere else.
 */
export function snowStepFactor(world: WorldMap, w: WeatherState, x: number, y: number, z: number): number {
  if (z !== 0 || world.getGround(x, y, z) !== Ground.Snow) return 1;
  const k = SNOW_SLOW * kindAmount(w, WeatherKind.Snow) + BLIZZARD_SLOW * kindAmount(w, WeatherKind.Blizzard);
  if (k <= 0) return 1;
  if (world.isSafe(x, y, z) || world.regionAt(x, y, z)?.temple) return 1;
  return 1 + k;
}

/**
 * Sandstorm visibility for the client haze (also kept with weather effects off,
 * since it is gameplay): `clear` = tiles that stay clear, `max` = opacity at the edge.
 */
export function sandVisibility(w: WeatherState): { clear: number; max: number } {
  const storm = kindAmount(w, WeatherKind.Sandstorm), dust = kindAmount(w, WeatherKind.Dust);
  const k = Math.min(1, storm + dust * 0.35);
  if (k <= 0) return { clear: Infinity, max: 0 };
  return { clear: SAND_CLEAR_FAR - (SAND_CLEAR_FAR - SAND_CLEAR_NEAR) * k, max: SAND_HAZE_MAX * Math.min(1, storm + dust * 0.4) };
}

/** Parses a kind name for /weather. */
export function weatherKindByName(name: string): WeatherKind | null {
  const n = name.trim().toLowerCase();
  for (const [k, v] of Object.entries(WEATHER_NAMES)) if (v === n) return Number(k) as WeatherKind;
  if (n === 'thunder' || n === 'thunderstorm') return WeatherKind.Storm;
  if (n === 'sand') return WeatherKind.Sandstorm;
  return null;
}
