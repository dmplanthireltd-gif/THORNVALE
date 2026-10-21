/**
 * Facts for the website, read straight from the game's own content so the site never drifts from
 * the game: monsters (bestiary), towns, vocations, counts, and the world atlas picture.
 * Used by scripts/site/build.ts.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';
import { ENEMIES } from '../../src/game/enemies/enemyDefs';
import { ITEMS } from '../../src/game/inventory/items';
import { SPELLS } from '../../src/game/magic/spells';
import { VOCATIONS } from '../../src/game/player/vocations';
import { TOWNS } from '../../src/game/world/townList';
import { buildWorld, WORLD_H, WORLD_W } from '../../src/game/world/worldGen';
import { Ground, Obj } from '../../src/game/world/WorldMap';

export interface Beast {
  id: string;
  name: string;
  hp: number;
  exp: number;
  hit: [number, number];
  armor: number;
  elite: boolean;
  ranged: boolean;
  tier: 'Harmless' | 'Easy' | 'Fair' | 'Tough' | 'Deadly' | 'Legendary';
  abilities: { name: string; element: string; kind: string; min: number; max: number }[];
  weak: string[];
  strong: string[];
  immune: string[];
  loot: { name: string; chance: number; rarity: string }[];
}

function tier(exp: number, elite: boolean): Beast['tier'] {
  if (elite || exp >= 5000) return 'Legendary';
  if (exp >= 1500) return 'Deadly';
  if (exp >= 400) return 'Tough';
  if (exp >= 100) return 'Fair';
  if (exp >= 15) return 'Easy';
  return 'Harmless';
}

export function bestiary(): Beast[] {
  return Object.entries(ENEMIES)
    .map(([id, d]) => {
      const res = Object.entries(d.resist ?? {}) as [string, number][];
      return {
        id,
        name: d.name,
        hp: d.maxHp,
        exp: d.exp,
        hit: [d.minDmg, d.maxDmg] as [number, number],
        armor: d.armor,
        elite: !!d.elite,
        ranged: !!d.kite,
        tier: tier(d.exp, !!d.elite),
        abilities: d.abilities.filter((a) => a.kind !== 'heal' || true).map((a) => ({ name: a.name, element: a.element, kind: a.kind, min: a.min, max: a.max })),
        weak: res.filter(([, v]) => v < 0).map(([k]) => k),
        strong: res.filter(([, v]) => v > 0 && v < 100).map(([k]) => k),
        immune: res.filter(([, v]) => v >= 100).map(([k]) => k),
        loot: d.loot
          .filter((l) => ITEMS[l.id])
          .map((l) => ({ name: ITEMS[l.id].name, chance: l.chance, rarity: ITEMS[l.id].rarity }))
          .sort((a, b) => b.chance - a.chance),
      };
    })
    .sort((a, b) => a.exp - b.exp);
}

export function towns() {
  return TOWNS.map((t) => ({ key: t.key, name: t.name, x: t.x, y: t.y, travel: t.travel, flavour: t.flavour }));
}

export function vocations() {
  return Object.values(VOCATIONS).map((v) => ({ id: v.id, name: v.name, blurb: v.blurb }));
}

export function counts() {
  return {
    monsters: Object.keys(ENEMIES).length,
    items: Object.keys(ITEMS).length,
    spells: Object.keys(SPELLS).length,
    towns: TOWNS.length,
    vocations: Object.keys(VOCATIONS).length,
  };
}

// ------------------------------------------------------------------ atlas picture

const GROUND: Record<number, [number, number, number]> = {
  [Ground.Grass]: [70, 104, 48], [Ground.Path]: [140, 118, 82], [Ground.Stone]: [118, 114, 106], [Ground.Wood]: [110, 80, 50],
  [Ground.Water]: [36, 70, 98], [Ground.Dirt]: [104, 84, 58], [Ground.Crop]: [128, 112, 54], [Ground.Sand]: [196, 172, 116],
  [Ground.DarkGrass]: [46, 78, 38], [Ground.Lava]: [226, 92, 30], [Ground.Ash]: [62, 56, 52], [Ground.Void]: [16, 24, 34],
  [Ground.Swamp]: [70, 80, 46], [Ground.Cave]: [90, 78, 64], [Ground.Jungle]: [38, 86, 34], [Ground.Marble]: [196, 188, 172],
  [Ground.DeepWater]: [20, 40, 64], [Ground.Snow]: [222, 226, 228], [Ground.Ice]: [168, 200, 214],
};
const TREES = new Set<number>([Obj.Tree, Obj.Pine, Obj.JungleTree, Obj.Palm]);
const BUILT = new Set<number>([Obj.Wall, Obj.StoneWall, Obj.Palisade, Obj.SandWall, Obj.Door]);

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.subarray(y * w * 3, (y + 1) * w * 3).forEach((v, i) => { raw[y * (w * 3 + 1) + 1 + i] = v; });
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Paints the surface floor at 2 px per tile with light shading, then saves a WebP + JPEG. */
export function atlas(outBase: string): { w: number; h: number } {
  const world = buildWorld();
  const S = 2, W = WORLD_W * S, H = WORLD_H * S;
  const rgb = new Uint8Array(W * H * 3);
  const height = (x: number, y: number) => {
    const g = world.getGround(x, y, 0), o = world.getObj(x, y, 0);
    if (g === Ground.Water || g === Ground.DeepWater || g === Ground.Void) return 0;
    return o === Obj.Cliff || o === Obj.Rock ? 3 : TREES.has(o) ? 1.5 : 1;
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const g = world.getGround(x, y, 0), o = world.getObj(x, y, 0);
      let [r, gg, b] = GROUND[g] ?? [40, 40, 40];
      if (TREES.has(o)) { r *= 0.62; gg *= 0.7; b *= 0.62; }
      else if (BUILT.has(o)) { [r, gg, b] = [92, 72, 54]; }
      else if (o === Obj.Cliff || o === Obj.Rock) { [r, gg, b] = [96, 92, 86]; }
      // light from the north-west
      const shade = 1 + (height(x - 1, y - 1) - height(x + 1, y + 1)) * -0.07;
      // coastline glow and a little grain
      const water = g === Ground.Water || g === Ground.DeepWater;
      const coast = water && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = world.getGround(x + dx, y + dy, 0); return n !== Ground.Water && n !== Ground.DeepWater && n !== Ground.Void; });
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const k = rnd() * 10 - 5, i = ((y * S + sy) * W + x * S + sx) * 3;
        const c = coast ? 1.35 : 1;
        rgb[i] = Math.max(0, Math.min(255, r * shade * c + k));
        rgb[i + 1] = Math.max(0, Math.min(255, gg * shade * c + k));
        rgb[i + 2] = Math.max(0, Math.min(255, b * shade * c + k));
      }
    }
  }
  // toward the iron palette: lift contrast, warm the shadows, darken the rim
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, dx = x / W - 0.5, dy = y / H - 0.5;
    const vig = 1 - Math.min(0.55, (dx * dx + dy * dy) * 1.5);
    rgb[i] = Math.min(255, rgb[i] * vig * 1.04 + 4);
    rgb[i + 1] = Math.min(255, rgb[i + 1] * vig * 0.98);
    rgb[i + 2] = Math.min(255, rgb[i + 2] * vig * 0.92);
  }
  mkdirSync(dirname(outBase), { recursive: true });
  const tmp = `${outBase}.png`;
  writeFileSync(tmp, png(W, H, rgb));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-quality', '82', `${outBase}.webp`]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-vf', 'scale=640:-1', '-q:v', '4', `${outBase}-small.jpg`]);
  execFileSync('rm', ['-f', tmp]);
  return { w: WORLD_W, h: WORLD_H };
}
