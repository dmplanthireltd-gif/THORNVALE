import * as THREE from 'three';
import type { EnemyKind } from '../../game/world/WorldMap';
import type { Rig } from './rigs';
import { C, Mesher, type V3 } from './darkRigsCore';
import { toonGradient, type Mat } from './parts';

/**
 * A weathered boulder: a lumpy, smooth-shaded rounded rock (painted style; the old faceted
 * dodecahedrons read as blocks). The lumps hash from the position, so shared corners stay closed.
 */
function boulder(r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const h = Math.sin(v.x * 91.7 / r + v.y * 47.3 / r + v.z * 13.9 / r) * 43758.5453;
    const k = 0.86 + 0.22 * (h - Math.floor(h));
    N.setXYZ(i, v.x / r, v.y / r, v.z / r);
    P.setXYZ(i, v.x * k, v.y * k * 0.92, v.z * k);
  }
  return g;
}

/**
 * Painted style (render/style.ts) — grim bosses (owner 2026-10-23: "grim, brutal,
 * detailed, for older players"). Every dungeon boss, world boss, raid boss, the
 * sea boss and the Gravesilk Colossus gets its own trophies on top of its dark base
 * model: crowns and headdresses, skulls of its victims, chains and manacles, war
 * banners, bone armour, runes and veins that glow, crystals, icicles, egg sacs,
 * barnacles, scars and blood — plus a soft pulsing glow on the ground under it and a
 * few drifting particles that fit it (embers, frost mist, poison drips, sea bubbles…).
 * All shapes are made in code (original designs).
 *
 * Cost (performance rules, BIBLE §6):
 * - the solid trophies are baked INTO the base model's limb geometry (one new shared
 *   geometry per boss kind and limb, cached), drawn with the limb's own material: no
 *   extra draw call. Their vertex colours are divided by the boss tint so a gold crown
 *   stays gold on a red-tinted boss;
 * - glowing bits share one extra emissive material per boss (one mesh per limb that has any);
 * - the particles are one `THREE.Points` per effect, animated entirely in the vertex
 *   shader from a time uniform (no per-frame JS work, no allocations); the ground glow
 *   is one quad. Time and the glow pulse are advanced in that quad's onBeforeRender.
 */

type Slot = 'head' | 'torso' | 'armL' | 'armR' | 'tail' | 'neck';

/** A limb's bounding box in its own pivot space. */
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; w: number; h: number; d: number; cx: number; cy: number; cz: number }

type FxKind = 'embers' | 'souls' | 'drip' | 'mist' | 'bubbles' | 'sparks' | 'spores' | 'sand' | 'ash' | 'swarm' | 'snow';
interface Fx {
  kind: FxKind;
  color: number;
  /** Particle count. */
  n: number;
  /** World size of one particle (before the boss scale). */
  size: number;
  /** Spread radius around the boss and how high particles travel. */
  radius: number;
  height: number;
  /** Cycles per second. */
  speed: number;
  /** Start height (drips fall from it). */
  y0?: number;
}

interface Recipe {
  /** Colour of the glowing details (runes, veins, eyes, lanterns). */
  glow: number;
  /** The boss wears its own crown/headdress instead of the generic gold crown. */
  ownCrown?: boolean;
  /** Soft ground glow colour (defaults to the glow). */
  ground?: number;
  fx: Fx[];
  parts: Partial<Record<Slot, (m: Mesher, b: Box, g: Glow) => void>>;
}

/** Collects glowing pieces into a second mesher (drawn with the boss's emissive material). */
type Glow = Mesher;

// ------------------------------------------------------------------ small seeded random

let seed = 1;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const between = (a: number, b: number): number => a + (b - a) * rnd();

// ------------------------------------------------------------------ building blocks

const BLOOD = 0x8a140e;
const BLOOD_D = 0x4a0806;
const LAPIS = 0x1e3a7a;
const MOSS = 0x3a4a22;
const ROCK = 0x5a5650;
const ICE = 0xa8d4ee;
const CORAL = 0xb04a3a;
const SILK = 0xc8c2b0;
const OBSIDIAN = 0x16121a;

/** A skull (cranium, jaw, sockets, nose hole); `eyes` glow inside the sockets. */
function skull(m: Mesher, p: V3, r: number, rot: V3 = [0, 0, 0], g?: Glow, color: number = C.BONE): void {
  m.push(p, rot);
  m.sph(r, color, [0, 0, 0], { s: [0.92, 0.9, 1.05], grit: 0.22 }, 1);
  m.box(r * 1.15, r * 0.42, r * 0.8, color, [0, -r * 0.72, r * 0.28], { grit: 0.2 });
  for (const s of [-1, 1]) m.box(r * 0.36, r * 0.3, r * 0.1, C.SOCKET, [s * r * 0.36, -r * 0.08, r * 0.95], { flat: true });
  m.box(r * 0.14, r * 0.2, r * 0.1, C.SOCKET, [0, -r * 0.42, r * 1.0], { flat: true });
  for (let i = -2; i <= 2; i++) m.box(r * 0.12, r * 0.14, r * 0.06, C.FANG, [i * r * 0.2, -r * 0.62, r * 0.98], { flat: true });
  m.pop();
  if (g) {
    g.push(p, rot);
    for (const s of [-1, 1]) g.sph(r * 0.12, 0xffffff, [s * r * 0.36, -r * 0.08, r * 0.9], { glow: true }, 0);
    g.pop();
  }
}

/** A sagging chain of `n` links from a to b. */
function chain(m: Mesher, a: V3, b: V3, n: number, r: number, color: number = C.IRON, sag = 0.1): void {
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
  const pitch = Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2]));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
    const g = new THREE.TorusGeometry(r, r * 0.32, 3, 6);
    // links lie along the chain, every other one turned a quarter
    g.scale(1, 1.45, 1);
    g.rotateX(Math.PI / 2 - pitch);
    if (i % 2) g.rotateZ(Math.PI / 2);
    g.rotateY(yaw);
    m.add(g, color, p, { grit: 0.3 });
  }
}

/** A chain hanging straight down from `at`, `n` links, with an optional weight at the end. */
function hang(m: Mesher, at: V3, n: number, r: number, color: number = C.IRON): V3 {
  chain(m, at, [at[0], at[1] - n * r * 2.3, at[2]], n, r, color, 0);
  return [at[0], at[1] - n * r * 2.3 - r, at[2]];
}

/** A manacle (thick iron cuff) round a limb at `at`, with a broken chain dangling. */
function manacle(m: Mesher, at: V3, R: number, links = 3): void {
  m.cyl(R, R * 1.05, R * 0.9, C.IRON_D, at, { grit: 0.35 }, 8);
  m.ring(R * 1.06, R * 0.12, C.RUST, [at[0], at[1] + R * 0.42, at[2]], {}, Math.PI * 2, 10);
  m.ring(R * 1.06, R * 0.12, C.RUST, [at[0], at[1] - R * 0.42, at[2]], {}, Math.PI * 2, 10);
  hang(m, [at[0], at[1] - R * 0.5, at[2] + R * 1.1], links, R * 0.32, C.IRON);
}

/** A war banner on a pole: tattered cloth with an emblem, bloodied hem. */
function banner(m: Mesher, base: V3, h: number, w: number, cloth: number, emblem: number, lean = 0.12): void {
  m.push(base, [-lean, 0, 0]);
  m.seg([0, 0, 0], [0, h, 0], 0.03, 0.025, C.WOOD_D, { grit: 0.3 });
  m.cone(0.045, 0.16, C.IRON, [0, h + 0.08, 0], {}, 4);
  m.seg([-w * 0.55, h - 0.06, 0], [w * 0.55, h - 0.06, 0], 0.018, 0.018, C.WOOD_D);
  for (const s of [-1, 1]) m.sph(0.03, C.BONE, [s * w * 0.58, h - 0.06, 0], {}, 0);
  // tattered cloth: jagged lower edge, torn holes read as notches
  const H = h * 0.62;
  const pts: [number, number][] = [[-w / 2, 0], [w / 2, 0]];
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const x = w / 2 - (i / teeth) * w;
    pts.push([x, -H * (i % 2 ? 0.82 : 1) + between(-0.04, 0.04)]);
  }
  m.poly(pts, cloth, [0, h - 0.08, -0.01], { grit: 0.3, blood: 0.18 });
  // the emblem: a horned skull mark painted on both faces
  for (const z of [0.004, -0.024]) {
    m.push([0, h - 0.08 - H * 0.42, z]);
    m.sph(w * 0.16, emblem, [0, 0, 0], { s: [1, 1.05, 0.12], flat: true }, 1);
    m.box(w * 0.2, w * 0.1, 0.01, emblem, [0, -w * 0.15, 0], { flat: true });
    for (const s of [-1, 1]) {
      m.box(w * 0.06, w * 0.06, 0.012, C.SOCKET, [s * w * 0.06, 0.0, z > 0 ? 0.006 : -0.006], { flat: true });
      m.horn([[s * w * 0.12, w * 0.08, 0], [s * w * 0.26, w * 0.2, 0], [s * w * 0.24, w * 0.36, 0]], w * 0.035, emblem, emblem, { flat: true });
    }
    m.pop();
  }
  m.pop();
}

/** A cluster of crystals growing from `at` (tilted outwards along `dir`). */
function crystals(m: Mesher, at: V3, n: number, size: number, color: number, dir: V3 = [0, 1, 0], g?: Glow): void {
  for (let i = 0; i < n; i++) {
    const len = size * between(0.6, 1.25);
    const d: V3 = [dir[0] + between(-0.45, 0.45), dir[1] + between(-0.2, 0.2), dir[2] + between(-0.45, 0.45)];
    const p: V3 = [at[0] + between(-size, size) * 0.35, at[1], at[2] + between(-size, size) * 0.35];
    (g && i % 2 === 0 ? g : m).spike(p, d, len, len * 0.22, color, { glow: !!g && i % 2 === 0, grit: 0.1 }, 4);
  }
}

/** Icicles hanging from a row between a and b. */
function icicles(m: Mesher, a: V3, b: V3, n: number, len: number): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const L = len * between(0.5, 1.1);
    m.spike([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [between(-0.1, 0.1), -1, between(-0.1, 0.1)], L, L * 0.18, ICE, { flat: true, grit: 0.08 }, 4);
  }
}

/** A silk-wrapped body hanging from a strand (a cocoon), a skull peeking out. */
function cocoon(m: Mesher, top: V3, len: number, r: number): void {
  m.seg(top, [top[0], top[1] - 0.12, top[2]], 0.006, 0.006, SILK, { flat: true });
  const c: V3 = [top[0], top[1] - 0.12 - len / 2, top[2]];
  m.sph(r, SILK, c, { s: [1, len / (2 * r), 0.9], grit: 0.2, blood: 0.06 }, 1);
  for (let i = 0; i < 4; i++) m.ring(r * (1.02 - Math.abs(i - 1.5) * 0.12), r * 0.08, 0xa8a290, [c[0], c[1] - len * 0.34 + i * len * 0.22, c[2]], { r: [between(-0.3, 0.3), 0, between(-0.3, 0.3)] }, Math.PI * 2, 9);
  m.sph(r * 0.5, C.BONE, [c[0], c[1] + len * 0.3, c[2] + r * 0.62], { s: [0.9, 1, 0.8] }, 1);
  for (const s of [-1, 1]) m.box(r * 0.16, r * 0.14, 0.01, C.SOCKET, [c[0] + s * r * 0.18, c[1] + len * 0.31, c[2] + r * 1.02], { flat: true });
}

/** Spikes fanned along a row (shoulder spikes, spinal ridges). */
function spikes(m: Mesher, pts: V3[], dir: V3, len: number, r: number, color: number, tipBlood = 0): void {
  pts.forEach((p, i) => m.spike(p, [dir[0] + Math.sin(i * 1.7) * 0.15, dir[1], dir[2] + Math.cos(i * 1.3) * 0.15], len * (0.8 + 0.25 * Math.sin(i * 2.1)), r, color, { grit: 0.25, blood: tipBlood }, 5));
}

/** A thin glowing line (runes, veins, cracks) of several jagged segments from a to b. */
function vein(g: Glow, a: V3, b: V3, n: number, r: number, color = 0xffffff, jag = 0.04): void {
  let p = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const q: V3 = i === n ? b : [a[0] + (b[0] - a[0]) * t + between(-jag, jag), a[1] + (b[1] - a[1]) * t + between(-jag, jag), a[2] + (b[2] - a[2]) * t + between(-jag, jag) * 0.3];
    g.seg(p, q, r, r * 0.8, color, { glow: true }, 3);
    p = q;
  }
}

/** Rune marks set in a ring (or arc) of radius R around `c` in the XY plane facing +Z. */
function runes(g: Glow, c: V3, R: number, n: number, size: number, arc = Math.PI * 2, a0 = 0): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + 0.5) * (arc / n);
    const p: V3 = [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2]];
    g.box(size * 0.25, size, size * 0.2, 0xffffff, p, { glow: true, r: [0, 0, a] });
    g.box(size * 0.7, size * 0.22, size * 0.2, 0xffffff, [p[0], p[1] + size * (i % 2 ? 0.25 : -0.25), p[2]], { glow: true, r: [0, 0, a + (i % 3) * 0.6] });
  }
}

/** Barnacles scattered over a patch around `at`. */
function barnacles(m: Mesher, at: V3, spread: number, n: number, r: number): void {
  for (let i = 0; i < n; i++) {
    const p: V3 = [at[0] + between(-spread, spread), at[1] + between(-spread, spread) * 0.6, at[2] + between(-spread, spread) * 0.5];
    const s = r * between(0.6, 1.3);
    m.cone(s, s * 1.1, 0xb4ac98, p, { r: [between(-0.6, 0.6), 0, between(-0.6, 0.6)], grit: 0.3 }, 5);
    m.sph(s * 0.4, 0x2a2420, [p[0], p[1] + s * 0.5, p[2]], { flat: true }, 0);
  }
}

/** A branching coral growth from `at`. */
function coral(m: Mesher, at: V3, h: number, color: number = CORAL): void {
  m.horn([at, [at[0], at[1] + h * 0.5, at[2]], [at[0] + between(-0.05, 0.05), at[1] + h, at[2]]], h * 0.12, color, 0xe07a5a, { grit: 0.2 });
  for (const s of [-1, 1]) m.horn([[at[0], at[1] + h * 0.35, at[2]], [at[0] + s * h * 0.3, at[1] + h * 0.55, at[2]], [at[0] + s * h * 0.36, at[1] + h * 0.85, at[2] + between(-0.03, 0.03)]], h * 0.08, color, 0xe07a5a);
}

/** Torn hanging strips (moss, weeds, rags) under a line a→b. */
function strips(m: Mesher, a: V3, b: V3, n: number, len: number, color: number, w = 0.05, blood = 0): void {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const L = len * between(0.5, 1.1);
    m.box(w * between(0.7, 1.3), L, 0.012, color, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - L / 2, a[2] + (b[2] - a[2]) * t], { r: [between(-0.15, 0.15), Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2, between(-0.15, 0.15)], grit: 0.3, two: true, blood });
  }
}

/** Broken spears and arrows stuck in a hide: trophies of hunters who failed. */
function impaled(m: Mesher, at: V3, dir: V3, len: number): void {
  const e: V3 = [at[0] + dir[0] * len, at[1] + dir[1] * len, at[2] + dir[2] * len];
  m.seg(at, e, 0.016, 0.014, C.WOOD, { grit: 0.3 });
  m.box(0.05, 0.04, 0.05, C.LEATHER, at, { r: [0.4, 0.3, 0.2] });
  m.sph(0.05, BLOOD_D, at, { s: [1.3, 0.5, 1.3], flat: true }, 0);
  // a snapped end
  m.spike(e, [dir[0] + 0.3, dir[1], dir[2]], 0.05, 0.016, C.WOOD_D, {}, 3);
}

/** Blood drips running down from a point. */
function drips(m: Mesher, at: V3, n: number, len: number): void {
  for (let i = 0; i < n; i++) {
    const L = len * between(0.4, 1);
    const x = at[0] + between(-0.05, 0.05);
    m.box(0.016, L, 0.012, i % 2 ? BLOOD : BLOOD_D, [x, at[1] - L / 2, at[2]], { flat: true });
    m.sph(0.014, BLOOD, [x, at[1] - L, at[2]], { flat: true }, 0);
  }
}

// ------------------------------------------------------------------ the bosses

const front = (b: Box, k = 1): number => b.z1 * k;

/** A skull-and-chain belt slung across the front of a torso. */
function trophyBelt(m: Mesher, b: Box, g: Glow | undefined, n: number, y: number, r: number): void {
  const z = b.z1 + 0.01;
  chain(m, [b.x0 * 0.85, y + 0.04, z * 0.9], [b.x1 * 0.85, y + 0.04, z * 0.9], 9, r * 0.32, C.IRON, 0.05);
  for (let i = 0; i < n; i++) {
    const x = b.x0 * 0.7 + (b.x1 * 0.7 - b.x0 * 0.7) * (n === 1 ? 0.5 : i / (n - 1));
    const sag = Math.sin(((x - b.x0 * 0.85) / (b.x1 * 0.85 - b.x0 * 0.85)) * Math.PI) * 0.05;
    skull(m, [x, y - r * 1.3 - sag, z + r * 0.4], r, [0.25, between(-0.3, 0.3), between(-0.25, 0.25)], i === Math.floor(n / 2) ? g : undefined);
    m.seg([x, y + 0.03 - sag, z], [x, y - r * 0.4 - sag, z + r * 0.3], 0.008, 0.008, C.LEATHER_L, { flat: true });
  }
}

/** Shoulder spikes (iron or bone) rising from both shoulders. */
function shoulderSpikes(m: Mesher, b: Box, color: number, n: number, len: number, blood = 0.3): void {
  for (const s of [-1, 1]) {
    const x = s * (b.w * 0.42);
    m.sph(0.07, C.RUST, [x, b.y1 - 0.04, b.cz], { s: [1.2, 0.6, 1.1], grit: 0.35 }, 1);
    const pts: V3[] = [];
    for (let i = 0; i < n; i++) pts.push([x + s * i * 0.03, b.y1 - 0.02, b.cz - b.d * 0.25 + (i / Math.max(1, n - 1)) * b.d * 0.5]);
    spikes(m, pts, [s * 0.45, 1, -0.1], len, len * 0.17, color, blood);
  }
}

const RECIPES: Partial<Record<EnemyKind, Recipe>> = {
  // Ughrak Ironjaw, Warchief of Grimtusk: an iron jaw riveted over his own, skull trophies, a war banner
  boss_ironjaw: {
    glow: 0xff6a20,
    fx: [{ kind: 'embers', color: 0xff7a2a, n: 26, size: 0.05, radius: 0.7, height: 2.0, speed: 0.35 }],
    parts: {
      head: (m, b) => {
        const z = front(b) - 0.02;
        m.box(b.w * 0.55, 0.15, 0.14, C.IRON_D, [0, b.y0 + 0.12, z], { grit: 0.4, blood: 0.15 });
        for (let i = -2; i <= 2; i++) m.sph(0.022, C.IRON_L, [i * b.w * 0.11, b.y0 + 0.17, z + 0.075], {}, 0);
        for (const s of [-1, 1]) m.spike([s * b.w * 0.22, b.y0 + 0.16, z + 0.04], [s * 0.15, 1, 0.25], 0.2, 0.035, C.IRON_L, { blood: 0.4 }, 5);
        // a deep scar across the brow
        m.box(0.02, 0.24, 0.02, C.SCAR, [b.w * 0.12, b.cy + 0.08, z + 0.04], { r: [0, 0, 0.6], flat: true });
      },
      torso: (m, b, g) => {
        trophyBelt(m, b, g, 3, b.y0 + 0.22, 0.085);
        shoulderSpikes(m, b, C.IRON, 3, 0.26);
        chain(m, [b.x1 * 0.7, b.y1 - 0.08, b.z1 * 0.9], [b.x0 * 0.5, b.y0 + 0.35, b.z1 * 1.02], 10, 0.028, C.IRON, 0.02);
        banner(m, [b.x0 * 0.35, b.y0 + 0.1, b.z0 - 0.06], 1.75, 0.7, 0x5a1410, C.BONE);
      },
      armL: (m, b) => manacle(m, [b.cx, b.y0 + 0.2, b.cz], 0.11, 3),
      armR: (m, b) => manacle(m, [b.cx, b.y0 + 0.2, Math.min(b.cz, 0.05)], 0.1, 2),
    },
  },
  // Lord Ossric, the Bonebound: bone armour, ghost-fire in his sockets, chains from his wrists
  boss_bonebound: {
    glow: 0x7ab0ff,
    fx: [
      { kind: 'souls', color: 0x9ac4ff, n: 14, size: 0.12, radius: 0.8, height: 2.0, speed: 0.18 },
      { kind: 'mist', color: 0x4a6a9a, n: 10, size: 0.7, radius: 0.9, height: 0.35, speed: 0.06 },
    ],
    parts: {
      head: (m, b, g) => {
        for (const s of [-1, 1]) g.spike([s * 0.075, b.cy + 0.02, b.z1 - 0.06], [s * 0.2, 1, -0.5], 0.22, 0.035, 0xffffff, { glow: true }, 4);
        // a cracked bone visor ridge
        m.box(b.w * 0.85, 0.05, 0.1, C.BONE_D, [0, b.cy + 0.1, b.z1 - 0.04], { r: [0.3, 0, 0], grit: 0.3 });
        hang(m, [b.x0 * 0.5, b.y0 + 0.04, b.z1 - 0.05], 3, 0.022);
        hang(m, [b.x1 * 0.5, b.y0 + 0.04, b.z1 - 0.05], 2, 0.022);
      },
      torso: (m, b, g) => {
        // great rib-bone pauldrons, each with a skull boss
        for (const s of [-1, 1]) {
          const x = s * 0.3;
          m.sph(0.12, C.BONE_D, [x, b.y1 - 0.02, b.cz], { s: [1.1, 0.42, 1.0], grit: 0.3 }, 1);
          for (let i = 0; i < 4; i++) m.horn([[x, b.y1 + 0.02, b.cz - 0.12 + i * 0.08], [x + s * 0.16, b.y1 - 0.02, b.cz - 0.12 + i * 0.08], [x + s * 0.22, b.y1 - 0.2, b.cz - 0.1 + i * 0.08]], 0.022, C.BONE, C.BONE_D);
          skull(m, [x + s * 0.06, b.y1 + 0.06, b.cz + 0.04], 0.07, [0.2, s * 0.5, 0]);
        }
        // a spine of spikes down the back and a ragged black cloak
        spikes(m, [[0, b.y1 - 0.05, b.z0 + 0.05], [0, b.y1 - 0.25, b.z0 + 0.02], [0, b.y1 - 0.45, b.z0]], [0, 0.6, -1], 0.18, 0.03, C.BONE);
        strips(m, [b.x0 * 0.9, b.y1 - 0.02, b.z0 - 0.02], [b.x1 * 0.9, b.y1 - 0.02, b.z0 - 0.02], 7, 1.05, 0x1c1a20, 0.11, 0.08);
        runes(g, [0.08, b.cy + 0.2, b.z1 + 0.02], 0.12, 5, 0.06);
      },
      armL: (m, b) => manacle(m, [b.cx, b.y0 + 0.16, b.cz], 0.07, 4),
      armR: (m, b) => manacle(m, [b.cx, b.y0 + 0.18, Math.min(b.cz, 0.04)], 0.065, 3),
    },
  },
  // Grimbold Ashanvil, the Delving King: forge runes, stone pauldrons, a lantern, a braided beard bound in gold
  boss_delving_king: {
    glow: 0xff9030,
    fx: [
      { kind: 'embers', color: 0xffa040, n: 20, size: 0.045, radius: 0.6, height: 1.5, speed: 0.4 },
      { kind: 'ash', color: 0x4a4440, n: 12, size: 0.05, radius: 0.8, height: 1.6, speed: 0.12, y0: 1.6 },
    ],
    parts: {
      head: (m, b) => {
        for (const s of [-1, 0, 1]) m.ring(0.045, 0.014, C.GOLD, [s * 0.1, b.y0 + 0.1, b.z1 - 0.02], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
        m.box(0.02, 0.18, 0.02, C.SCAR, [-0.12, b.cy + 0.05, b.z1 - 0.01], { r: [0, 0, -0.5], flat: true });
      },
      torso: (m, b, g) => {
        for (const s of [-1, 1]) {
          m.box(0.24, 0.1, 0.3, ROCK, [s * (b.w * 0.42), b.y1 - 0.02, b.cz], { r: [0, 0, s * -0.3], grit: 0.4 });
          m.box(0.26, 0.03, 0.32, C.IRON_D, [s * (b.w * 0.42), b.y1 - 0.07, b.cz], { r: [0, 0, s * -0.3] });
          vein(g, [s * (b.w * 0.3), b.y1 + 0.04, b.cz + 0.2], [s * (b.w * 0.55), b.y1 - 0.06, b.cz + 0.2], 3, 0.012);
        }
        runes(g, [0, b.cy + 0.08, b.z1 + 0.02], 0.13, 6, 0.06);
        // a forge lantern on a chain at the belt
        const end = hang(m, [b.x1 * 0.6, b.y0 + 0.15, b.z1 * 0.7], 2, 0.02, C.BRASS);
        m.box(0.09, 0.12, 0.09, C.IRON_D, [end[0], end[1] - 0.06, end[2]], {}).cone(0.07, 0.05, C.IRON_D, [end[0], end[1] + 0.01, end[2]], {}, 4);
        g.sph(0.04, 0xffffff, [end[0], end[1] - 0.06, end[2]], { glow: true }, 1);
        // an anvil mark on the back
        m.box(0.3, 0.1, 0.04, C.IRON_D, [0, b.cy + 0.15, b.z0 - 0.02]).box(0.12, 0.12, 0.04, C.IRON_D, [0, b.cy + 0.04, b.z0 - 0.02]);
      },
      armL: (m, b) => m.cyl(0.09, 0.1, 0.16, C.GOLD_D, [b.cx, b.y0 + 0.18, b.cz], { grit: 0.3 }, 8),
    },
  },
  // Gorhorn, Lord of the Labyrinth: a necklace of his victims' skulls, a heavy nose ring, blood on the horns
  boss_labyrinth_lord: {
    glow: 0xff4020,
    fx: [{ kind: 'mist', color: 0x5a2a1a, n: 10, size: 0.6, radius: 0.9, height: 0.3, speed: 0.05 }],
    parts: {
      head: (m, b) => {
        m.ring(0.075, 0.018, C.GOLD, [0, b.y0 + 0.1, b.z1 + 0.02], { r: [Math.PI / 2 - 0.3, 0, 0] }, Math.PI * 2, 10);
        hang(m, [0, b.y0 + 0.03, b.z1 + 0.02], 3, 0.02, C.GOLD_D);
        drips(m, [b.w * 0.3, b.y1 - 0.05, b.z1 * 0.5], 3, 0.14);
        drips(m, [-b.w * 0.3, b.y1 - 0.05, b.z1 * 0.5], 2, 0.12);
      },
      torso: (m, b, g) => {
        const y = b.y1 - 0.06;
        for (let i = 0; i < 5; i++) {
          const a = -0.9 + i * 0.45;
          skull(m, [Math.sin(a) * b.w * 0.42, y - Math.cos(a) * 0.12, b.cz + Math.cos(a) * b.d * 0.62], 0.06, [0.3, a, 0], i === 2 ? g : undefined);
        }
        m.ring(b.w * 0.42, 0.012, C.LEATHER_L, [0, y + 0.02, b.cz + 0.04], { s: [1, 1, b.d * 1.5 / b.w] }, Math.PI * 2, 14);
        // leather war-straps with iron studs crossing the chest
        for (const s of [-1, 1]) {
          m.box(0.07, b.h * 0.9, 0.03, C.LEATHER, [0, b.cy, b.z1 + 0.01], { r: [0, 0, s * 0.62], grit: 0.3, blood: 0.1 });
          for (let i = -2; i <= 2; i++) m.sph(0.02, C.IRON_L, [i * 0.1 * s, b.cy + i * 0.14, b.z1 + 0.03], {}, 0);
        }
        strips(m, [b.x0 * 0.5, b.y0 + 0.05, b.z1 + 0.02], [b.x1 * 0.5, b.y0 + 0.05, b.z1 + 0.02], 4, 0.35, 0x3a2418, 0.12, 0.25);
      },
      armL: (m, b) => manacle(m, [b.cx, b.y0 + 0.14, b.cz], 0.09, 2),
    },
  },
  // Sszarak, the Venom Oracle: a serpent-skull headdress, venom sacs that drip, green veins
  boss_venom_oracle: {
    glow: 0x6aff3a,
    fx: [
      { kind: 'drip', color: 0x7aff3a, n: 12, size: 0.045, radius: 0.35, height: 0.8, speed: 0.5, y0: 0.85 },
      { kind: 'spores', color: 0x5ad02a, n: 16, size: 0.07, radius: 0.8, height: 1.6, speed: 0.15 },
    ],
    parts: {
      head: (m, b, g) => {
        // a great snake skull worn over the head, fangs forward
        m.sph(0.1, C.BONE_D, [0, b.y1 - 0.02, b.cz + 0.04], { s: [0.95, 0.5, 1.5], grit: 0.3 }, 1);
        m.box(0.2, 0.05, 0.2, C.BONE_D, [0, b.y1 - 0.06, b.z1 + 0.08], { grit: 0.3 });
        for (const s of [-1, 1]) {
          m.spike([s * 0.07, b.y1 - 0.06, b.z1 + 0.16], [0, -1, 0.35], 0.14, 0.018, C.FANG, { flat: true }, 4);
          m.box(0.05, 0.035, 0.02, C.SOCKET, [s * 0.075, b.y1 + 0.05, b.z1 + 0.08], { flat: true });
          g.sph(0.018, 0xffffff, [s * 0.075, b.y1 + 0.05, b.z1 + 0.09], { glow: true }, 0);
        }
        // a frill of dark spines fanned behind
        for (let i = 0; i < 7; i++) {
          const a = -1.1 + i * (2.2 / 6);
          m.spike([Math.sin(a) * 0.12, b.cy + 0.05, b.z0 + 0.02], [Math.sin(a) * 1.2, 0.8 + Math.cos(a) * 0.4, -0.7], 0.28, 0.025, 0x1a3a1a, { grit: 0.2 }, 4);
        }
      },
      torso: (m, b, g) => {
        // venom sacs hanging at the belt (glowing within)
        for (const x of [-0.24, 0.0, 0.24]) {
          m.seg([x, b.y0 + 0.24, b.z1 * 0.9], [x, b.y0 + 0.14, b.z1 * 0.95], 0.008, 0.008, C.LEATHER_L, { flat: true });
          m.sph(0.065, 0x2a4a1a, [x, b.y0 + 0.08, b.z1 + 0.02], { s: [1, 1.25, 1], grit: 0.2 }, 1);
          g.sph(0.045, 0xffffff, [x, b.y0 + 0.07, b.z1 + 0.06], { glow: true }, 1);
        }
        for (let i = 0; i < 4; i++) vein(g, [between(-0.2, 0.2), b.y1 - 0.08, b.z1 + 0.015], [between(-0.3, 0.3), b.cy - 0.1, b.z1 + 0.015], 4, 0.01);
        for (let i = 0; i < 6; i++) m.sph(0.03, C.BONE, [Math.sin(-0.9 + i * 0.36) * 0.3, b.y1 - 0.12 - Math.cos(-0.9 + i * 0.36) * 0.06, b.z1 + 0.02], {}, 0);
      },
    },
  },
  // Kaerith, Mother of Flames: molten cracks down her back, a crown of black horns, embers
  boss_ember_matriarch: {
    glow: 0xff7010,
    fx: [{ kind: 'embers', color: 0xff8a20, n: 40, size: 0.06, radius: 1.3, height: 2.4, speed: 0.4 }],
    parts: {
      torso: (m, b, g) => {
        for (let i = 0; i < 7; i++) {
          const z = b.z1 - 0.3 - i * (b.d - 0.4) / 7;
          g.box(0.05, 0.02, 0.09, 0xffffff, [0, b.y1 - 0.03 - Math.abs(i - 2) * 0.03, z], { glow: true, r: [0.3, 0, 0] });
          if (i % 2 === 0) for (const s of [-1, 1]) vein(g, [s * 0.05, b.y1 - 0.04 - Math.abs(i - 2) * 0.03, z], [s * b.w * 0.32, b.cy, z + between(-0.1, 0.1)], 3, 0.012);
        }
        for (let i = 0; i < 4; i++) impaled(m, [between(-0.3, 0.3), b.y1 - 0.15, b.cz - 0.2 + i * 0.15], [between(-0.4, 0.4), 1, -0.3], 0.35);
      },
      head: (m, b, g) => {
        for (let i = 0; i < 6; i++) {
          const a = -1.2 + i * 0.48;
          m.horn([[Math.sin(a) * b.w * 0.35, b.y1 - 0.06, b.z0 + 0.12], [Math.sin(a) * b.w * 0.55, b.y1 + 0.12, b.z0], [Math.sin(a) * b.w * 0.6, b.y1 + 0.3, b.z0 - 0.12]], 0.04, OBSIDIAN, 0x6a1a08, { grit: 0.2 });
        }
        vein(g, [b.x0 * 0.5, b.y0 + 0.05, b.z1 * 0.6], [b.x0 * 0.2, b.cy, b.z1 * 0.9], 3, 0.012);
        vein(g, [b.x1 * 0.5, b.y0 + 0.05, b.z1 * 0.6], [b.x1 * 0.2, b.cy, b.z1 * 0.9], 3, 0.012);
      },
    },
  },
  // Ankhset, the Undying Sand King: a gold-and-lapis headdress with a rearing cobra, a broad collar, a scarab
  boss_sand_king: {
    glow: 0xffc040,
    ownCrown: true,
    fx: [
      { kind: 'sand', color: 0xc8a060, n: 18, size: 0.3, radius: 0.9, height: 0.6, speed: 0.12 },
      { kind: 'souls', color: 0xffd060, n: 10, size: 0.05, radius: 0.6, height: 1.9, speed: 0.22 },
    ],
    parts: {
      head: (m, b, g) => {
        const y = b.cy + 0.06;
        // the striped headcloth: crown, side lappets down to the shoulders, a tail behind
        m.sph(b.w * 0.56, C.GOLD, [0, y + 0.04, b.cz - 0.01], { s: [1.05, 0.62, 1.05], grit: 0.15 }, 1);
        // lapis stripes running front to back over the crown of the headcloth
        for (let i = -2; i <= 2; i++) m.box(0.022, 0.02, b.w * 1.1, LAPIS, [i * b.w * 0.17, y + 0.04 + b.w * 0.33 - Math.abs(i) * 0.03, b.cz - 0.01], { flat: true });
        for (const s of [-1, 1]) {
          for (let i = 0; i < 6; i++) m.box(0.1, 0.05, 0.035, i % 2 ? LAPIS : C.GOLD, [s * b.w * 0.6, y - 0.1 - i * 0.05, b.cz + 0.06 - i * 0.008], { r: [0, 0, s * 0.12] });
        }
        m.box(0.14, 0.26, 0.05, C.GOLD, [0, y - 0.14, b.z0 - 0.02], { r: [0.2, 0, 0] });
        // the rearing cobra on the brow
        m.horn([[0, y + 0.06, b.z1 - 0.01], [0, y + 0.13, b.z1 + 0.03], [0, y + 0.2, b.z1 + 0.02]], 0.022, C.GOLD, C.GOLD);
        m.sph(0.03, C.GOLD, [0, y + 0.2, b.z1 + 0.03], { s: [1.4, 1, 0.6] }, 1);
        g.sph(0.014, 0xff2010, [0, y + 0.14, b.z1 + 0.05], { glow: true }, 0);
      },
      torso: (m, b, g) => {
        // a broad collar of gold and lapis
        // a broad collar: alternating gold and lapis plates fanned over the chest
        for (let i = 0; i < 9; i++) {
          const a = -1.1 + i * (2.2 / 8);
          m.box(0.07, 0.016, 0.16, i % 2 ? LAPIS : C.GOLD, [Math.sin(a) * b.w * 0.42, b.y1 - 0.04, b.cz + Math.cos(a) * b.d * 0.55], { r: [0.5, a, 0], flat: true });
        }
        // a scarab pectoral that glows
        m.sph(0.07, C.GOLD_D, [0, b.y1 - 0.22, b.z1 + 0.03], { s: [1, 1.2, 0.4] }, 1);
        g.sph(0.045, 0xffffff, [0, b.y1 - 0.22, b.z1 + 0.05], { glow: true, s: [1, 1.2, 0.4] }, 1);
        for (const s of [-1, 1]) m.box(0.1, 0.05, 0.015, C.GOLD, [s * 0.09, b.y1 - 0.21, b.z1 + 0.035], { r: [0, 0, s * 0.35] });
        // rotting wraps torn open, dried blood
        strips(m, [b.x0 * 0.8, b.y0 + 0.2, b.z1], [b.x1 * 0.8, b.y0 + 0.2, b.z1], 5, 0.3, 0x8a7a5a, 0.05, 0.2);
      },
      armL: (m, b) => m.cyl(0.07, 0.075, 0.12, C.GOLD, [b.cx, b.y0 + 0.16, b.cz], {}, 8).ring(0.075, 0.012, LAPIS, [b.cx, b.y0 + 0.16, b.cz], {}, Math.PI * 2, 10),
      armR: (m, b) => m.cyl(0.07, 0.075, 0.12, C.GOLD, [b.cx, b.y0 + 0.16, Math.min(0.03, b.cz)], {}, 8).ring(0.075, 0.012, LAPIS, [b.cx, b.y0 + 0.16, Math.min(0.03, b.cz)], {}, Math.PI * 2, 10),
    },
  },
  // Mirewretch, the Hundred-Fanged: moss and weeds hanging off her, hunters' spears broken in her hide
  boss_mire_hydra: {
    glow: 0x50e0a0,
    fx: [
      { kind: 'bubbles', color: 0x6a9a4a, n: 16, size: 0.07, radius: 1.1, height: 0.5, speed: 0.4 },
      { kind: 'drip', color: 0x8ad04a, n: 10, size: 0.04, radius: 0.9, height: 1.3, speed: 0.45, y0: 1.4 },
    ],
    parts: {
      torso: (m, b) => {
        strips(m, [b.x0 * 0.7, b.y1 * 0.8, b.cz + 0.2], [b.x1 * 0.7, b.y1 * 0.8, b.cz + 0.2], 6, 0.4, MOSS, 0.09);
        strips(m, [b.x0 * 0.7, b.y1 * 0.75, b.cz - 0.4], [b.x1 * 0.7, b.y1 * 0.75, b.cz - 0.4], 6, 0.35, 0x2a3a1a, 0.08);
        for (let i = 0; i < 5; i++) impaled(m, [between(-0.4, 0.4), b.y1 * 0.82, b.cz - 0.5 + i * 0.22], [between(-0.5, 0.5), 1, between(-0.4, 0.2)], between(0.3, 0.5));
        skull(m, [0.2, b.y1 * 0.85 + 0.05, b.cz - 0.2], 0.08, [0.4, 0.6, 0.2]);
      },
      neck: (m, _b, g) => {
        for (const s of [-1, 1]) m.spike([s * 0.05, 0.02, -0.04], [s * 0.5, 1, -0.6], 0.16, 0.025, C.BONE_D, { grit: 0.2 }, 4);
        g.sph(0.03, 0xffffff, [0, 0.03, 0.02], { glow: true }, 0);
      },
    },
  },
  // Hrimgaard, the Rime Wyrm: ice crystals along the spine, icicles everywhere, frost mist
  boss_rime_wyrm: {
    glow: 0x8ae8ff,
    fx: [
      { kind: 'mist', color: 0xc8e8ff, n: 14, size: 0.9, radius: 1.3, height: 0.4, speed: 0.06 },
      { kind: 'snow', color: 0xf0f8ff, n: 26, size: 0.04, radius: 1.3, height: 2.2, speed: 0.12, y0: 2.2 },
    ],
    parts: {
      torso: (m, b, g) => {
        for (let i = 0; i < 6; i++) crystals(m, [0, b.y1 - 0.05 - Math.abs(i - 2) * 0.03, b.z1 - 0.25 - i * (b.d - 0.4) / 6], 3, 0.24 - i * 0.015, ICE, [0, 1, -0.3], g);
        for (const s of [-1, 1]) icicles(m, [s * b.w * 0.4, b.y0 + b.h * 0.35, b.z1 - 0.3], [s * b.w * 0.4, b.y0 + b.h * 0.35, b.z0 + 0.3], 6, 0.16);
      },
      head: (m, b, g) => {
        crystals(m, [0, b.y1 - 0.03, b.cz - 0.05], 5, 0.2, ICE, [0, 1, -0.5], g);
        icicles(m, [b.x0 * 0.6, b.y0 + 0.02, b.z1 * 0.6], [b.x1 * 0.6, b.y0 + 0.02, b.z1 * 0.6], 5, 0.12);
      },
      tail: (m, b, g) => crystals(m, [b.cx, b.y1 - 0.05, b.cz], 3, 0.16, ICE, [0, 1, -0.2], g),
    },
  },
  // Vorthazul, the Ashen Sovereign: an obsidian crown, molten veins, broken chains, skulls on his spikes
  boss_ashen_sovereign: {
    glow: 0xff4a10,
    ownCrown: true,
    fx: [
      { kind: 'embers', color: 0xff5a1a, n: 34, size: 0.055, radius: 1.0, height: 2.6, speed: 0.38 },
      { kind: 'ash', color: 0x2a2624, n: 16, size: 0.06, radius: 1.0, height: 2.4, speed: 0.1, y0: 2.6 },
    ],
    parts: {
      head: (m, b, g) => {
        const y = b.cy + b.h * 0.15;
        // an open circlet (a solid disc this wide read as a brown plate over the head from above)
        const cr = Math.min(0.17, b.w * 0.3);
        m.ring(cr, 0.03, OBSIDIAN, [0, y, b.cz], { grit: 0.2 }, Math.PI * 2, 14);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const p: V3 = [Math.sin(a) * cr, y + 0.03, b.cz + Math.cos(a) * cr];
          m.spike(p, [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3], i % 2 ? 0.18 : 0.28, 0.035, OBSIDIAN, {}, 4);
          if (i % 2 === 0) g.sph(0.025, 0xffffff, [p[0], p[1] + 0.03, p[2] + 0.02], { glow: true }, 0);
        }
        vein(g, [b.x0 * 0.3, b.cy - 0.05, b.z1 - 0.02], [b.x0 * 0.1, b.y0 + 0.05, b.z1 - 0.01], 3, 0.012);
      },
      torso: (m, b, g) => {
        for (let i = 0; i < 6; i++) vein(g, [between(-0.1, 0.1), b.y1 - 0.15, b.z1 + 0.01], [between(-0.55, 0.55), b.y0 + 0.4 + between(0, 0.4), b.z1 + 0.01], 5, 0.014);
        for (let i = 0; i < 4; i++) vein(g, [between(-0.3, 0.3), b.y1 - 0.2, b.z0 - 0.01], [between(-0.6, 0.6), b.cy, b.z0 - 0.01], 4, 0.014);
        for (const s of [-1, 1]) {
          m.spike([s * b.w * 0.42, b.y1 - 0.12, b.cz], [s * 0.5, 1, -0.2], 0.42, 0.06, OBSIDIAN, { blood: 0.3 }, 5);
          skull(m, [s * b.w * 0.47, b.y1 + 0.05, b.cz - 0.02], 0.08, [0.2, s * 0.8, s * -0.3], g);
        }
        hang(m, [b.x0 * 0.6, b.y0 + 0.5, b.z1 * 0.9], 5, 0.03);
        hang(m, [b.x1 * 0.3, b.y0 + 0.5, b.z1 * 0.95], 4, 0.03);
      },
      armL: (m, b, g) => { manacle(m, [b.cx, b.y0 + 0.18, b.cz], 0.12, 4); vein(g, [b.cx, -0.1, b.z1 - 0.01], [b.cx, b.y0 + 0.3, b.z1 - 0.01], 4, 0.012); },
      armR: (m, b, g) => { manacle(m, [b.cx, b.y0 + 0.18, b.cz], 0.12, 3); vein(g, [b.cx, -0.1, b.z1 - 0.01], [b.cx, b.y0 + 0.3, b.z1 - 0.01], 4, 0.012); },
    },
  },
  // Gorrumvald, the Mountain That Walks: crags, moss and pines on his back, amber veins, siege chains
  wb_mountain: {
    glow: 0xffb040,
    fx: [
      { kind: 'ash', color: 0x6a645a, n: 18, size: 0.06, radius: 0.9, height: 2.4, speed: 0.14, y0: 2.5 },
      { kind: 'mist', color: 0x6a604a, n: 8, size: 0.8, radius: 1.0, height: 0.3, speed: 0.05 },
    ],
    parts: {
      torso: (m, b, g) => {
        for (let i = 0; i < 7; i++) {
          const p: V3 = [between(-0.5, 0.5), b.y1 - between(0.0, 0.35), b.z0 + between(0.05, 0.25)];
          const r = between(0.12, 0.22);
          m.add(boulder(r), ROCK, p, { r: [rnd() * 3, rnd() * 3, rnd() * 3], s: [1, 0.8, 1], grit: 0.35 });
          m.sph(r * 0.8, MOSS, [p[0], p[1] + r * 0.55, p[2]], { s: [1.1, 0.35, 1.1], grit: 0.3 }, 1);
          if (i % 2 === 0) m.cone(0.07, 0.24, 0x24341a, [p[0] + 0.03, p[1] + r + 0.1, p[2]], {}, 5);
        }
        for (let i = 0; i < 4; i++) vein(g, [between(-0.4, 0.4), b.y1 - 0.1, b.z1 + 0.01], [between(-0.6, 0.6), b.y0 + 0.2, b.z1 + 0.01], 4, 0.016);
        crystals(m, [b.x1 * 0.5, b.y1 - 0.05, b.cz], 3, 0.2, 0xd08a30, [0.4, 1, 0], g);
        chain(m, [b.x0 * 0.9, b.y1 - 0.05, b.cz], [b.x1 * 0.6, b.y0 + 0.2, b.z1 + 0.02], 12, 0.04, C.RUST, 0.05);
        impaled(m, [0.2, b.cy + 0.2, b.z0 + 0.05], [0.4, 0.5, -1], 0.6);
      },
      head: (m, b) => {
        for (const s of [-1, 1]) m.add(boulder(0.12), ROCK, [s * b.w * 0.42, b.y1 - 0.05, b.cz - 0.05], { r: [1, 2, 0.5], s: [1, 1.4, 1], grit: 0.4 });
        m.sph(0.14, MOSS, [0, b.y1 - 0.02, b.cz - 0.08], { s: [1.4, 0.35, 1], grit: 0.3 }, 1);
      },
      armL: (m, b) => manacle(m, [b.cx, b.y0 + 0.2, b.cz], 0.15, 3),
      armR: (m, b) => manacle(m, [b.cx, b.y0 + 0.2, b.cz], 0.15, 3),
    },
  },
  // Vaelith, the Storm Serpent: storm-lit fins and runes, lightning horns, crackling sparks
  wb_storm_serpent: {
    glow: 0xa090ff,
    fx: [
      { kind: 'sparks', color: 0xd0c8ff, n: 22, size: 0.05, radius: 1.2, height: 2.2, speed: 0.9 },
      { kind: 'mist', color: 0x4a5a9a, n: 10, size: 0.8, radius: 1.2, height: 0.4, speed: 0.07 },
    ],
    parts: {
      torso: (m, b, g) => {
        for (let i = 0; i < 4; i++) {
          const z = b.cz + 0.5 - i * 0.35;
          const h = 0.32 - i * 0.04;
          m.poly([[0, 0], [0.32, 0], [0.12, h]], 0x2a2a6a, [0, b.y1 * 0.82, z], { r: [0, Math.PI / 2, 0], grit: 0.2 });
          vein(g, [0, b.y1 * 0.82 + 0.02, z - 0.02], [0, b.y1 * 0.82 + h * 0.9, z - 0.12], 3, 0.012);
        }
        for (const s of [-1, 1]) runes(g, [s * b.w * 0.3, b.y1 * 0.7, b.cz], 0.0001, 1, 0.08);
        for (let i = 0; i < 6; i++) g.box(0.05, 0.014, 0.08, 0xffffff, [between(-0.4, 0.4), b.y1 * 0.8, b.cz + between(-0.6, 0.6)], { glow: true, r: [0, rnd() * 3, 0] });
      },
      neck: (m, _b, g) => {
        for (const s of [-1, 1]) g.spike([s * 0.05, 0.03, -0.03], [s * 0.4, 1, -0.7], 0.2, 0.025, 0xffffff, { glow: true }, 4);
        m.spike([0, 0.04, -0.06], [0, 1, -1], 0.14, 0.02, 0x1a1a3a, {}, 4);
      },
    },
  },
  // Nhalgrith, the Blight Mother: egg sacs, bloated glowing pustules, her prey in silk cocoons
  wb_blight_mother: {
    glow: 0x9aff3a,
    fx: [
      { kind: 'spores', color: 0x9ad03a, n: 24, size: 0.08, radius: 1.0, height: 1.4, speed: 0.12 },
      { kind: 'drip', color: 0xa0ff40, n: 10, size: 0.035, radius: 0.5, height: 0.55, speed: 0.55, y0: 0.6 },
    ],
    parts: {
      torso: (m, b, g) => {
        // egg sacs heaped on the abdomen
        for (let i = 0; i < 9; i++) {
          const p: V3 = [between(-0.28, 0.28), b.y1 - 0.08 + between(-0.04, 0.06), b.z0 + 0.25 + between(-0.1, 0.25)];
          m.sph(between(0.03, 0.045), 0xb8b090, p, { grit: 0.15 }, 1);
        }
        for (let i = 0; i < 6; i++) {
          const p: V3 = [between(-0.45, 0.45), b.y1 * between(0.55, 0.9), b.z0 + between(0.1, 0.6)];
          m.sph(0.032, 0x3a5a1a, p, { grit: 0.2 }, 1);
          g.sph(0.022, 0xffffff, [p[0], p[1] + 0.02, p[2]], { glow: true }, 1);
        }
        for (const x of [-0.25, 0.22]) cocoon(m, [x, b.y1 * 0.55, b.z0 - 0.02], 0.26, 0.055);
        strips(m, [b.x0 * 0.8, b.y1 * 0.5, b.z0 + 0.2], [b.x1 * 0.8, b.y1 * 0.5, b.z0 + 0.2], 6, 0.25, SILK, 0.04);
      },
      head: (_m, b, g) => {
        for (let i = 0; i < 6; i++) g.sph(0.018, 0xffffff, [between(-0.08, 0.08), b.y1 - 0.02 - between(0, 0.05), b.z1 - 0.02], { glow: true }, 0);
      },
    },
  },
  // Grashnak Tuskbreaker: a black war banner, a necklace of broken tusks, a skull on the shoulder
  raid_tusk_warlord: {
    glow: 0xff5a1a,
    fx: [{ kind: 'embers', color: 0xff6a2a, n: 20, size: 0.045, radius: 0.7, height: 1.8, speed: 0.35 }],
    parts: {
      torso: (m, b, g) => {
        for (let i = 0; i < 7; i++) {
          const a = -1.0 + i * (2 / 6);
          m.spike([Math.sin(a) * b.w * 0.36, b.y1 - 0.1 - Math.cos(a) * 0.06, b.cz + Math.cos(a) * b.d * 0.55], [Math.sin(a) * 0.2, -1, 0.3], 0.13, 0.025, 0xd8caa0, {}, 4);
        }
        m.ring(b.w * 0.36, 0.01, C.LEATHER_L, [0, b.y1 - 0.08, b.cz + 0.03], { s: [1, 1, 1.3] }, Math.PI * 2, 12);
        skull(m, [b.x1 * 0.62, b.y1 + 0.04, b.cz], 0.08, [0.1, 0.9, 0], g);
        banner(m, [b.x1 * 0.3, b.y0 + 0.1, b.z0 - 0.05], 1.6, 0.62, 0x18141a, 0x9a2a1a);
        chain(m, [b.x0 * 0.7, b.y1 - 0.08, b.z1], [b.x1 * 0.4, b.y0 + 0.3, b.z1 + 0.02], 9, 0.025, C.IRON, 0.02);
      },
      armL: (m, b) => manacle(m, [b.cx, b.y0 + 0.2, b.cz], 0.1, 2),
    },
  },
  // Sexton Morrow, the grave warden: a gravedigger's hood and shroud, a grave lantern, a shovel on his back
  raid_grave_warden: {
    glow: 0x9ad8c0,
    fx: [
      { kind: 'mist', color: 0x5a6a7a, n: 12, size: 0.7, radius: 0.9, height: 0.3, speed: 0.06 },
      { kind: 'souls', color: 0xb0e8d0, n: 10, size: 0.08, radius: 0.7, height: 1.8, speed: 0.15 },
    ],
    parts: {
      head: (m, b) => {
        m.sph(b.w * 0.6, 0x3a3630, [0, b.cy + 0.07, b.cz - 0.07], { s: [1.05, 0.9, 1.0], grit: 0.3 }, 1);
        m.cone(b.w * 0.36, 0.16, 0x3a3630, [0, b.y1 + 0.06, b.z0 - 0.02], { r: [-0.9, 0, 0] }, 6);
      },
      torso: (m, b) => {
        strips(m, [b.x0 * 1.1, b.y1 - 0.02, b.z0 - 0.02], [b.x1 * 1.1, b.y1 - 0.02, b.z0 - 0.02], 6, 0.85, 0x2a2826, 0.1, 0.05);
        // a gravedigger's shovel strapped across the back
        m.push([0, b.cy, b.z0 - 0.06], [0, 0, 0.6]);
        m.seg([0, -0.45, 0], [0, 0.45, 0], 0.02, 0.02, C.WOOD);
        m.box(0.18, 0.22, 0.02, C.RUST, [0, -0.55, 0], { grit: 0.4 });
        m.pop();
        chain(m, [b.x0 * 0.9, b.y1 - 0.05, b.z1 * 0.8], [b.x1 * 0.9, b.y0 + 0.1, b.z1], 9, 0.022, C.IRON, 0.02);
      },
      armL: (m, b, g) => {
        const end = hang(m, [b.cx, b.y0 + 0.02, b.cz + 0.06], 2, 0.02);
        m.box(0.1, 0.14, 0.1, C.IRON_D, [end[0], end[1] - 0.08, end[2]], { grit: 0.3 }).cone(0.08, 0.06, C.IRON_D, [end[0], end[1] + 0.0, end[2]], {}, 4);
        g.sph(0.045, 0xffffff, [end[0], end[1] - 0.08, end[2]], { glow: true }, 1);
      },
    },
  },
  // Gourdmaw, the Hollow King (festival, liveops/festivals.ts): a carved pumpkin for a head with candle-lit eyes,
  // a rag cloak and a pumpkin lantern swinging from one hand
  fest_hollow_king: {
    glow: 0xffa030,
    fx: [
      { kind: 'embers', color: 0xff9a2a, n: 14, size: 0.05, radius: 0.7, height: 1.9, speed: 0.22 },
      { kind: 'mist', color: 0x3a2a40, n: 8, size: 0.7, radius: 0.9, height: 0.3, speed: 0.05 },
    ],
    parts: {
      head: (m, b, g) => {
        const y = b.cy + 0.05, z = b.cz;
        for (const [dx, sx] of [[-0.09, 0.8], [0.09, 0.8], [0, 1]] as Array<[number, number]>) m.sph(b.w * 0.62, 0xd8701a, [dx, y, z], { s: [sx, 0.82, 0.95], grit: 0.25 }, 1);
        m.cyl(0.025, 0.035, 0.12, 0x3a5a22, [0, y + b.w * 0.5, z], { r: [0.2, 0, 0.15] }, 5);
        // the carved face, lit from inside
        for (const sx of [-1, 1]) g.cone(0.045, 0.05, 0xffd860, [sx * 0.07, y + 0.04, z + b.w * 0.55], { r: [Math.PI / 2, 0, 0], glow: true }, 3);
        g.box(0.16, 0.035, 0.02, 0xffd860, [0, y - 0.07, z + b.w * 0.56], { glow: true });
      },
      torso: (m, b) => {
        strips(m, [b.x0 * 1.1, b.y1 - 0.02, b.z0 - 0.02], [b.x1 * 1.1, b.y1 - 0.02, b.z0 - 0.02], 7, 0.9, 0x2a1a2e, 0.1, 0);
        strips(m, [b.x0 * 1.05, b.y1 - 0.05, b.z1 + 0.01], [b.x1 * 1.05, b.y1 - 0.05, b.z1 + 0.01], 5, 0.5, 0x4a3a2a, 0.07, 0);
        m.ring(b.w * 0.4, 0.02, 0x5a3a1a, [0, b.y1 - 0.06, b.cz], { s: [1, 1, 1.3] }, Math.PI * 2, 12);
      },
      armL: (m, b, g) => {
        const end = hang(m, [b.cx, b.y0 + 0.02, b.cz + 0.06], 2, 0.02);
        m.sph(0.07, 0xd8701a, [end[0], end[1] - 0.08, end[2]], { s: [1.1, 0.85, 1.1], grit: 0.2 }, 1);
        g.sph(0.04, 0xffd860, [end[0], end[1] - 0.08, end[2] + 0.04], { glow: true }, 1);
      },
    },
  },
  // Old Rimeclaw, the Feast-Thief (festival): a stolen red feast-cap with white fur, a sack of baubles on his back
  fest_rimeclaw: {
    glow: 0x9ae0ff,
    fx: [
      { kind: 'snow', color: 0xf0f8ff, n: 18, size: 0.05, radius: 1.0, height: 2.0, speed: 0.2, y0: 2.2 },
      { kind: 'mist', color: 0xc8e0f0, n: 8, size: 0.8, radius: 1.0, height: 0.3, speed: 0.05 },
    ],
    parts: {
      head: (m, b, g) => {
        m.cone(b.w * 0.42, 0.34, 0xb82a22, [0, b.y1 + 0.12, b.cz - 0.02], { r: [-0.35, 0, 0.2], grit: 0.2 }, 7);
        m.ring(b.w * 0.42, 0.04, 0xf4f4f0, [0, b.y1 - 0.02, b.cz - 0.02], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 12);
        g.sph(0.05, 0xffffff, [0.06, b.y1 + 0.3, b.cz - 0.14], { glow: true }, 1);
      },
      torso: (m, b, g) => {
        m.sph(b.w * 0.42, 0x6a4a2a, [0, b.y1 + 0.18, b.cz - 0.1], { s: [1, 0.85, 1.2], grit: 0.35 }, 1);
        m.ring(b.w * 0.2, 0.03, 0x3a2a14, [0, b.y1 + 0.42, b.cz - 0.1], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
        for (let i = 0; i < 4; i++) g.sph(0.05, [0x9ad0f0, 0xe8c26a, 0xc8302a, 0x9ae0ff][i], [between(-0.2, 0.2), b.y1 + 0.42 + between(0, 0.06), b.cz - 0.1 + between(-0.15, 0.15)], { glow: true }, 1);
      },
    },
  },
  // Hjalmvar Rimeborn, the frost jarl: a fur mantle, frozen trophy shields, icicles and frost runes
  raid_frost_jarl: {
    glow: 0x8ae8ff,
    fx: [
      { kind: 'mist', color: 0xd0e8ff, n: 12, size: 0.8, radius: 1.0, height: 0.35, speed: 0.06 },
      { kind: 'snow', color: 0xffffff, n: 20, size: 0.035, radius: 1.0, height: 2.6, speed: 0.12, y0: 2.6 },
    ],
    parts: {
      torso: (m, b, g) => {
        for (const sx of [-1, 1]) m.sph(0.16, 0x4a3e32, [sx * b.w * 0.36, b.y1 - 0.05, b.cz - 0.06], { s: [1.1, 0.45, 1.0], grit: 0.4 }, 1);
        for (let i = 0; i < 10; i++) m.spike([(i % 2 ? 1 : -1) * between(0.18, 0.45), b.y1 - 0.08, b.cz + between(-0.2, 0.2)], [between(-0.5, 0.5), -1, between(-0.3, 0.3)], 0.12, 0.03, 0x6a5a48, {}, 3);
        for (const s of [-1, 1]) {
          m.push([s * 0.25, b.cy, b.z0 - 0.06], [0, Math.PI, s * 0.3]);
          m.cyl(0.25, 0.25, 0.04, C.WOOD, [0, 0, 0], { r: [Math.PI / 2, 0, 0], grit: 0.35 }, 10);
          m.sph(0.06, C.IRON, [0, 0, 0.03], { s: [1, 1, 0.5] }, 1);
          icicles(m, [-0.2, -0.12, 0.02], [0.2, -0.12, 0.02], 4, 0.14);
          m.pop();
        }
        runes(g, [0, b.cy + 0.1, b.z1 + 0.02], 0.15, 5, 0.07);
      },
      head: (m, b) => icicles(m, [b.x0 * 0.5, b.y0 + 0.08, b.z1 - 0.02], [b.x1 * 0.5, b.y0 + 0.08, b.z1 - 0.02], 6, 0.14),
      armL: (_m, b, g) => vein(g, [b.cx, -0.05, b.z1 - 0.01], [b.cx, b.y0 + 0.15, b.z1 - 0.01], 4, 0.014),
    },
  },
  // Ixtara, the swarm queen: a fan of gold blades on her head, an amber egg sac, gold seams
  raid_swarm_queen: {
    glow: 0xffc030,
    fx: [{ kind: 'swarm', color: 0x3a2a10, n: 18, size: 0.05, radius: 0.9, height: 0.9, speed: 0.4 }, { kind: 'sand', color: 0xd0a860, n: 10, size: 0.3, radius: 0.8, height: 0.4, speed: 0.1 }],
    parts: {
      head: (m, b) => {
        for (let i = 0; i < 7; i++) {
          const a = -1.1 + i * (2.2 / 6);
          m.poly([[-0.025, 0], [0.025, 0], [0, 0.22 + (i === 3 ? 0.08 : 0)]], C.GOLD, [Math.sin(a) * 0.08, b.y1 - 0.02, b.cz - 0.02], { r: [-0.4, 0, -a], grit: 0.2 }, 0.012);
        }
      },
      torso: (m, b, g) => {
        m.sph(0.1, 0x6a4a10, [0, b.y1 - 0.02, b.z0 + 0.12], { s: [1, 0.7, 1.2], grit: 0.2 }, 1);
        g.sph(0.075, 0xffffff, [0, b.y1 + 0.02, b.z0 + 0.12], { glow: true, s: [1, 0.7, 1.1] }, 1);
        for (const s of [-1, 1]) vein(g, [s * 0.04, b.y1 - 0.01, b.z1 - 0.2], [s * 0.05, b.y1 - 0.03, b.z0 + 0.3], 4, 0.01, 0xffffff, 0.01);
        spikes(m, [[b.x0 * 0.6, b.y1 * 0.8, b.cz], [b.x1 * 0.6, b.y1 * 0.8, b.cz]], [0, 1, -0.4], 0.14, 0.03, C.GOLD_D);
      },
    },
  },
  // Ulmaroth, the Drowned Tyrant: a coral crown, barnacles, an anchor chain, a glowing lure
  boss_drowned_tyrant: {
    glow: 0x4ad8e8,
    fx: [{ kind: 'bubbles', color: 0xb0e8ff, n: 22, size: 0.06, radius: 0.8, height: 2.4, speed: 0.3 }],
    parts: {
      head: (m, b, g) => {
        for (let i = 0; i < 5; i++) coral(m, [-0.12 + i * 0.06, b.y1 - 0.04, b.cz - 0.02 + Math.abs(i - 2) * -0.02], 0.16 + (i === 2 ? 0.06 : 0));
        barnacles(m, [0.1, b.cy, b.z0 + 0.04], 0.06, 4, 0.025);
        m.horn([[0, b.y1 - 0.02, b.z1 - 0.06], [0, b.y1 + 0.16, b.z1 + 0.05], [0, b.y1 + 0.1, b.z1 + 0.22]], 0.012, 0x2a3a3a, 0x2a3a3a);
        g.sph(0.04, 0xffffff, [0, b.y1 + 0.07, b.z1 + 0.24], { glow: true }, 1);
      },
      torso: (m, b) => {
        for (const s of [-1, 1]) barnacles(m, [s * b.w * 0.36, b.y1 - 0.06, b.cz], 0.1, 8, 0.03);
        chain(m, [b.x1 * 0.9, b.y1 - 0.05, b.cz], [b.x0 * 0.8, b.y0 + 0.08, b.z1 + 0.04], 12, 0.03, C.RUST, 0.03);
        // a small anchor at the hip
        const a: V3 = [b.x0 * 0.8, b.y0 - 0.06, b.z1 + 0.04];
        m.seg(a, [a[0], a[1] - 0.24, a[2]], 0.018, 0.018, C.RUST).ring(0.03, 0.01, C.RUST, [a[0], a[1] + 0.02, a[2]], { r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8);
        m.ring(0.11, 0.018, C.RUST, [a[0], a[1] - 0.2, a[2]], { r: [Math.PI / 2, 0, Math.PI] }, Math.PI, 8);
        coral(m, [b.x1 * 0.4, b.y1 - 0.05, b.z0 + 0.02], 0.14, 0x8a3a6a);
      },
    },
  },
  // The Gravesilk Colossus: its prey hanging in silk, purple grave-light
  gravesilk_colossus: {
    glow: 0xb06aff,
    ground: 0x7a40c0,
    fx: [
      { kind: 'spores', color: 0xb080ff, n: 18, size: 0.07, radius: 1.0, height: 1.3, speed: 0.12 },
      { kind: 'mist', color: 0x3a2a4a, n: 10, size: 0.7, radius: 1.1, height: 0.3, speed: 0.05 },
    ],
    parts: {
      torso: (m, b, g) => {
        for (const [x, z] of [[-0.35, -0.3], [0.38, -0.5], [0.0, -0.75]] as const) cocoon(m, [x, b.y1 * 0.5, z], 0.38, 0.085);
        for (let i = 0; i < 5; i++) skull(m, [between(-0.4, 0.4), b.y1 * between(0.55, 0.75), between(-0.8, 0.1)], 0.045, [rnd(), rnd() * 3, rnd()], i === 0 ? g : undefined);
        runes(g, [0, b.y1 * 0.6, b.z0 + 0.2], 0.0001, 1, 0.08);
      },
    },
  },
};

// ------------------------------------------------------------------ the painted crown

/**
 * Painted style boss crown (rigs.ts buildBoss): two thin bands with tall uneven spikes,
 * a gem at the front — open, so from the high camera it reads as a crown on the head
 * instead of a gold disc covering it.
 */
export function grimCrown(w: number, gold: Mat, gem: Mat): THREE.Group {
  const g = new THREE.Group();
  const band = (r: number, y: number, t: number) => {
    const geo = new THREE.TorusGeometry(r, t, 4, 14);
    geo.rotateX(Math.PI / 2);
    const me = new THREE.Mesh(geo, gold);
    me.position.y = y;
    g.add(me);
  };
  band(w, 0.0, 0.022);
  band(w * 0.97, 0.06, 0.016);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = i % 2 ? 0.1 : 0.16;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.028, h, 4), gold);
    c.position.set(Math.sin(a) * w, 0.04 + h / 2, Math.cos(a) * w);
    c.rotation.set(Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18);
    g.add(c);
  }
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 0), gem);
  s.position.set(0, 0.035, w + 0.02);
  g.add(s);
  return g;
}

// ------------------------------------------------------------------ attaching to a rig

/** The bounding box of a limb's own meshes (not of child limbs) in its pivot space. */
function limbBox(g: THREE.Object3D): Box {
  const b = new THREE.Box3();
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const tmp = new THREE.Matrix4();
  const add = (me: THREE.Mesh) => {
    if (!me.geometry.boundingBox) me.geometry.computeBoundingBox();
    b.union(me.geometry.boundingBox!.clone().applyMatrix4(tmp.multiplyMatrices(inv, me.matrixWorld)));
  };
  for (const c of g.children) if ((c as THREE.Mesh).isMesh && c.visible) add(c as THREE.Mesh);
  if (b.isEmpty()) g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) add(o as THREE.Mesh); });
  if (b.isEmpty()) b.set(new THREE.Vector3(-0.2, -0.2, -0.2), new THREE.Vector3(0.2, 0.2, 0.2));
  return {
    x0: b.min.x, y0: b.min.y, z0: b.min.z, x1: b.max.x, y1: b.max.y, z1: b.max.z,
    w: b.max.x - b.min.x, h: b.max.y - b.min.y, d: b.max.z - b.min.z,
    cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, cz: (b.min.z + b.max.z) / 2,
  };
}

/**
 * Appends geometry b (non-indexed position/normal/colour) to the host limb geometry a.
 * Any other attribute the host carries (e.g. painted UVs into a monster atlas) is
 * continued for b's vertices with the host's first value, so the merged mesh stays valid.
 */
function concat(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const nb = b.attributes.position.count;
  for (const k of Object.keys(a.attributes)) {
    const A = a.attributes[k] as THREE.BufferAttribute;
    const B = b.attributes[k] as THREE.BufferAttribute | undefined;
    const size = A.itemSize;
    const arr = new Float32Array(A.array.length + nb * size);
    arr.set(A.array as Float32Array, 0);
    if (B && B.itemSize === size) arr.set(B.array as Float32Array, A.array.length);
    else for (let i = 0; i < nb; i++) for (let c = 0; c < size; c++) arr[A.array.length + i * size + c] = (A.array as Float32Array)[c];
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  out.userData = { ...a.userData, shared: true };
  return out;
}

/** Divides vertex colours by a material tint, so the part shows its true colour on a tinted material. */
function untint(g: THREE.BufferGeometry, tint: THREE.Color): void {
  const c = g.attributes.color as THREE.BufferAttribute;
  const a = c.array as Float32Array;
  const f = [tint.r, tint.g, tint.b].map((v) => 1 / Math.max(0.25, v));
  for (let i = 0; i < a.length; i++) a[i] = a[i] * f[i % 3];
}

interface Cached { base: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; host: THREE.BufferGeometry | null }
const CACHE = new Map<string, Cached>();

const GLOW_KEY = '__grimBossGlow';

/** True when this boss kind has a grim treatment (painted style). */
export function hasGrimBoss(kind: EnemyKind): boolean {
  return kind in RECIPES;
}

/** True when the boss wears its own headdress in place of the generic gold crown. */
export function grimOwnCrown(kind: EnemyKind): boolean {
  return !!RECIPES[kind]?.ownCrown;
}

/**
 * Adds the grim boss treatment to a built boss rig (painted style only; called by
 * rigs.ts after the boss is tinted and crowned). Returns false when the kind has none.
 */
export function grimBoss(kind: EnemyKind, rig: Rig): boolean {
  const R = RECIPES[kind];
  if (!R) return false;
  const body = rig.materials[0];
  const glowMat = new THREE.MeshToonMaterial({ color: new THREE.Color(R.glow).multiplyScalar(0.3), emissive: R.glow, emissiveIntensity: 1.6, vertexColors: true, gradientMap: toonGradient() });
  glowMat.userData[GLOW_KEY] = true;
  let usedGlow = false;

  const slots: [Slot, THREE.Object3D][] = [];
  if (rig.type === 'biped') slots.push(['head', rig.head], ['torso', rig.torso], ['armL', rig.armL], ['armR', rig.armR]);
  else {
    if (!rig.necks) slots.push(['head', rig.head]);
    slots.push(['torso', rig.body], ['tail', rig.tail]);
    for (const n of rig.necks ?? []) slots.push(['neck', n.crest]);
  }
  slots.forEach(([slot, grp], i) => {
    const make = R.parts[slot];
    if (!make) return;
    // the limb's own mesh drawn with the body material: our solid parts are baked into its geometry
    const host = grp.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).material === body && (c as THREE.Mesh).geometry.attributes.color) as THREE.Mesh | undefined;
    const key = `${kind}.${slot}.${i}`;
    let c = CACHE.get(key);
    if (!c || (host && c.host !== host.geometry)) {
      seed = 7919 + i * 104729 + kind.length * 31;
      const b = limbBox(grp);
      const m = new Mesher();
      const g = new Mesher();
      m.ao = 0.12;
      make(m, b, g);
      const base = m.build('base');
      const glow = g.build('glow');
      if (base) untint(base, (body as Mat).color);
      c = { base: base && host ? concat(host.geometry, base) : base, glow, host: host?.geometry ?? null };
      if (base && host) base.dispose();
      CACHE.set(key, c);
    }
    if (c.base) {
      if (host && c.host === host.geometry) host.geometry = c.base;
      else {
        const me = new THREE.Mesh(c.base, body);
        me.castShadow = true;
        me.receiveShadow = true;
        grp.add(me);
      }
    }
    if (c.glow) {
      const me = new THREE.Mesh(c.glow, glowMat);
      me.castShadow = false;
      grp.add(me);
      usedGlow = true;
    }
  });
  if (usedGlow) rig.materials.push(glowMat);
  else glowMat.dispose();
  addAura(rig, R, usedGlow ? glowMat : null);
  return true;
}

// ------------------------------------------------------------------ ground glow and particles (GPU-animated)

const TIME = { value: 0 };
let lastStamp = -1;
const _size = new THREE.Vector2();

let glowTex: THREE.Texture | null = null;
function groundGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2);
    const a = Math.max(0, 1 - d);
    const v = Math.round(255 * a * a * (0.85 + 0.15 * Math.sin(d * 18)));
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = v;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  glowTex = t;
  return t;
}

const MODE: Record<FxKind, number> = { embers: 0, souls: 1, drip: 2, mist: 3, bubbles: 4, sparks: 5, spores: 6, sand: 7, ash: 8, swarm: 9, snow: 10 };

const FX_VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uRadius;
uniform float uHeight;
uniform float uSpeed;
uniform float uY0;
uniform float uMode;
uniform float uPx;
attribute vec4 aSeed;
varying float vA;
void main() {
  float ph = fract(uTime * uSpeed * (0.75 + aSeed.w * 0.5) + aSeed.z);
  float ang = aSeed.x * 6.2832;
  float rad = sqrt(aSeed.y) * uRadius;
  vec3 p = vec3(cos(ang) * rad, 0.0, sin(ang) * rad);
  float s = 1.0;
  float a = sin(ph * 3.1416);
  int m = int(uMode + 0.5);
  if (m == 0 || m == 5) { // embers / sparks: rise and flicker
    p.y = ph * uHeight;
    p.x += sin(uTime * 2.0 + aSeed.z * 20.0) * 0.12 * ph;
    p.z += cos(uTime * 1.7 + aSeed.x * 20.0) * 0.12 * ph;
    s = 1.0 - ph * 0.6;
    if (m == 5) a *= step(0.45, fract(sin(floor(uTime * 14.0 + aSeed.z * 40.0) * 12.9898) * 43758.5));
  } else if (m == 1 || m == 6) { // souls / spores: slow wavering rise
    p.y = ph * uHeight;
    p.x += sin(uTime * 0.9 + aSeed.z * 30.0) * 0.2;
    p.z += cos(uTime * 0.8 + aSeed.x * 30.0) * 0.2;
    s = 0.6 + a * 0.6;
  } else if (m == 2 || m == 8 || m == 10) { // drips / ash / snow: fall
    p.y = uY0 * (1.0 - ph * ph);
    if (m != 2) { p.y = uY0 * (1.0 - ph); p.x += sin(uTime + aSeed.z * 9.0) * 0.25; p.z += cos(uTime * 0.7 + aSeed.x * 9.0) * 0.25; }
    a = min(1.0, (1.0 - ph) * 6.0) * min(1.0, ph * 8.0);
  } else if (m == 3 || m == 7) { // mist / sand: low drifting puffs
    float t = uTime * 0.25 + aSeed.z * 6.0;
    p.x += sin(t) * 0.3; p.z += cos(t * 0.8) * 0.3;
    p.y = aSeed.w * uHeight;
    s = 0.7 + a * 0.5;
    a *= 0.55;
  } else if (m == 4) { // bubbles: rise and wobble
    p.y = ph * uHeight;
    p.x += sin(uTime * 5.0 + aSeed.z * 20.0) * 0.04;
    s = 0.6 + ph * 0.7;
  } else { // swarm: circling motes
    float w = uTime * (1.5 + aSeed.w) + aSeed.z * 6.2832;
    p = vec3(cos(w) * (0.4 + aSeed.y * uRadius), 0.3 + aSeed.x * uHeight + sin(w * 3.0) * 0.08, sin(w) * (0.4 + aSeed.y * uRadius));
    a = 1.0;
  }
  vA = a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // orthographic view: world size to pixels (projection[1][1] = 2 / view height)
  float scale = length(modelMatrix[0].xyz);
  gl_PointSize = max(1.0, uSize * s * scale * projectionMatrix[1][1] * 0.5 * uPx);
}`;

const FX_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoft;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q) * 2.0;
  float a = uSoft > 0.5 ? (1.0 - d) * (1.0 - d) : smoothstep(1.0, 0.55, d);
  if (a <= 0.01) discard;
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

function fxPoints(f: Fx): THREE.Points {
  const n = f.n;
  const pos = new Float32Array(n * 3);
  const sd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) sd[i * 4 + k] = rnd();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, f.height / 2, 0), f.radius + f.height);
  const dark = f.kind === 'swarm' || f.kind === 'ash' || (f.kind === 'mist' && new THREE.Color(f.color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35);
  const soft = f.kind === 'mist' || f.kind === 'sand' || f.kind === 'souls' || f.kind === 'spores';
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: TIME,
      uSize: { value: f.size },
      uRadius: { value: f.radius },
      uHeight: { value: f.height },
      uSpeed: { value: f.speed },
      uY0: { value: f.y0 ?? f.height },
      uMode: { value: MODE[f.kind] },
      uPx: { value: 800 },
      uColor: { value: new THREE.Color(f.color) },
      uOpacity: { value: 1 },
      uSoft: { value: soft ? 1 : 0 },
    },
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    transparent: true,
    depthWrite: false,
    blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 7;
  pts.userData.grimFx = true;
  return pts;
}

/** Ground glow + particle effects for a boss; drives the shared time and the glow pulse. */
function addAura(rig: Rig, R: Recipe, glowMat: THREE.MeshToonMaterial | null): void {
  const body = rig.materials[0];
  const color = R.ground ?? R.glow;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({
    map: groundGlowTexture(), color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  disc.renderOrder = 2;
  disc.userData.grimFx = true;
  disc.userData.noShadow = true; // CreatureView.setCastShadow leaves it alone
  const points = R.fx.map(fxPoints);
  const discMat = disc.material as THREE.MeshBasicMaterial;
  const phase = Math.random() * 6;
  disc.onBeforeRender = (renderer) => {
    // one clock for every boss: advance it once per frame
    const now = performance.now() / 1000;
    if (now !== lastStamp) { lastStamp = now; TIME.value = now % 3600; }
    renderer.getDrawingBufferSize(_size);
    const fade = body.transparent ? body.opacity : 1;
    const pulse = 0.5 + 0.5 * Math.sin(TIME.value * 1.6 + phase);
    discMat.opacity = (0.32 + 0.22 * pulse) * fade;
    if (glowMat) glowMat.emissiveIntensity = 1.2 + 0.7 * pulse;
    for (const p of points) {
      const u = (p.material as THREE.ShaderMaterial).uniforms;
      u.uPx.value = _size.y;
      u.uOpacity.value = fade;
    }
  };
  rig.root.add(disc, ...points);
}

/** Every boss kind with a grim treatment (tests / debug). */
export function grimBossKinds(): EnemyKind[] {
  return Object.keys(RECIPES) as EnemyKind[];
}
