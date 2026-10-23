import * as THREE from 'three';
import { toonGradient, type Mat } from './parts';
import type { BipedRig, QuadRig } from './rigs';
import { PAINTED } from '../style';
import { cellRect, grimBody, grimFor, guessDetail, type Grim, type MonDetail } from './grimMonsters';

/**
 * Core of the "dark realistic" monster models (the default look; the old
 * models stay reachable with the URL query `?monsters=classic` for debugging).
 *
 * Performance rules every dark model follows:
 * - every limb is ONE merged, vertex-coloured geometry, built once per
 *   monster kind and shared by all instances (geometry.userData.shared, so
 *   CreatureView.dispose leaves it alone);
 * - each instance owns only two materials (body + glow), which the hurt flash
 *   and the fade need per creature;
 * - nothing is allocated per frame (all work happens at build time).
 *
 * Rig layout, pivots, facing (+Z) and footprint match the classic rigs, so the
 * walk / idle / attack / death animations in CreatureView work unchanged.
 */

export const DARK_MONSTERS: boolean = (() => {
  try {
    return !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('monsters') === 'classic');
  } catch {
    return true;
  }
})();

export type V3 = [number, number, number];

export interface PartOpt {
  /** Euler rotation (XYZ). */
  r?: V3;
  /** Scale. */
  s?: V3;
  /** Per-triangle brightness noise (0 = flat colour). */
  grit?: number;
  /** Share of triangles stained with blood. */
  blood?: number;
  /** Goes into the emissive (glow) mesh. */
  glow?: boolean;
  /** Draw both faces (wing membranes, cloth). */
  two?: boolean;
  /** Not darkened toward the bottom of the limb (eyes, rims that must read). */
  flat?: boolean;
  /** Painted style: the surface from the monster atlas (grimMonsters.ts); guessed when left out. */
  d?: MonDetail;
}

/** Fresh blood is bright enough to read through the pixel pass at normal zoom. */
const BLOOD = new THREE.Color(0x9a120c);
const BLOOD_DRY = new THREE.Color(0x5a0a06);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function hash(x: number, y: number, z: number, k: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

interface Piece { geo: THREE.BufferGeometry; color: THREE.Color; grit: number; blood: number; two: boolean; flat: boolean; d?: MonDetail }

const RIME = new THREE.Color(0xd8e8f4);
const MOULD = new THREE.Color(0x4a4a24);
const SOOT = new THREE.Color(0x120c08);
const _c2 = new THREE.Color();
/** Smooth 3D wobble in 0..1 (patches of rot, frost, soot that span several triangles). */
function patch(x: number, y: number, z: number, f: number): number {
  return 0.5 + 0.25 * Math.sin(x * f + Math.sin(y * f * 0.7) * 2) + 0.25 * Math.sin(z * f * 1.3 + y * f * 0.9);
}

/** Accumulates primitives into one merged geometry (plus one for glowing bits). */
export class Mesher {
  private base: Piece[] = [];
  private glow: Piece[] = [];
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** How much the lowest part of the limb is darkened (fake ambient occlusion). */
  ao = 0.22;
  /** Painted style: the kind's grim look (UVs into the monster atlas + per-family grime). */
  grim: Grim | null = null;

  /** Opens a sub-assembly with its own offset / rotation (e.g. a hunched upper body). */
  push(p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]): this {
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(_m));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  add(geo: THREE.BufferGeometry, color: number, p: V3 = [0, 0, 0], o: PartOpt = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0]))), _s.set(...(o.s ?? [1, 1, 1])));
    g.applyMatrix4(this.stack[this.stack.length - 1].clone().multiply(_m));
    (o.glow ? this.glow : this.base).push({ geo: g, color: new THREE.Color(color), grit: o.grit ?? 0.14, blood: o.blood ?? 0, two: !!o.two, flat: !!o.flat || !!o.glow, d: o.d });
    return this;
  }

  box(w: number, h: number, d: number, c: number, p?: V3, o?: PartOpt): this { return this.add(new THREE.BoxGeometry(w, h, d), c, p, o); }
  sph(r: number, c: number, p?: V3, o?: PartOpt, detail = 1): this { return this.add(new THREE.IcosahedronGeometry(r, detail), c, p, o); }
  cyl(rt: number, rb: number, h: number, c: number, p?: V3, o?: PartOpt, seg = 6): this { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, p, o); }
  cone(r: number, h: number, c: number, p?: V3, o?: PartOpt, seg = 5): this { return this.add(new THREE.ConeGeometry(r, h, seg), c, p, o); }
  /** A partial ring lying flat (XZ plane): collars, rims, ribs. */
  ring(R: number, t: number, c: number, p?: V3, o?: PartOpt, arc = Math.PI * 2, seg = 10): this {
    const g = new THREE.TorusGeometry(R, t, 3, seg, arc);
    g.rotateX(Math.PI / 2);
    return this.add(g, c, p, o);
  }

  /** A flat polygon (wing membranes, cloth) in the XY plane; with `depth` a solid slab (blades). */
  poly(pts: [number, number][], c: number, p?: V3, o?: PartOpt, depth = 0): this {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
    if (depth > 0) {
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
      g.translate(0, 0, -depth / 2);
      return this.add(g, c, p, o);
    }
    return this.add(new THREE.ShapeGeometry(sh), c, p, { two: true, ...o });
  }

  /** A tapered rod from a to b (bones, limbs, horn segments). */
  seg(a: V3, b: V3, ra: number, rb: number, c: number, o: PartOpt = {}, seg = 6): this {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const len = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
    const mid = A.add(B).multiplyScalar(0.5);
    return this.add(g, c, [mid.x, mid.y, mid.z], { ...o, r: undefined, s: undefined });
  }

  /** A cone from base point `at` pointing along `dir` (spikes, claws, teeth). */
  spike(at: V3, dir: V3, len: number, r: number, c: number, o: PartOpt = {}, seg = 4): this {
    const D = new THREE.Vector3(...dir).normalize();
    const g = new THREE.ConeGeometry(r, len, seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, D));
    return this.add(g, c, [at[0] + D.x * len / 2, at[1] + D.y * len / 2, at[2] + D.z * len / 2], { ...o, r: undefined, s: undefined });
  }

  /** A curving horn / tail / tentacle through the given points, ending in a point. */
  horn(pts: V3[], r0: number, c: number, tip = c, o: PartOpt = {}, r1 = 0.004): this {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const ra = r0 * (1 - i / n) + r1;
      const rb = r0 * (1 - (i + 1) / n) + r1;
      if (i === n - 1) {
        const a = pts[i];
        const b = pts[i + 1];
        this.spike(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ra, tip, o, 6);
      } else {
        this.seg(pts[i], pts[i + 1], ra, rb, i > n * 0.6 ? tip : c, o, 6);
        if (i > 0) this.sph(ra * 1.02, i > n * 0.6 ? tip : c, pts[i], o, 0);
      }
    }
    return this;
  }

  /** A thick rounded tube through the points (necks, tails, bodies of snakes). */
  tube(pts: V3[], radii: number[], c: number, o: PartOpt = {}, seg = 7): this {
    for (let i = 0; i < pts.length - 1; i++) {
      this.seg(pts[i], pts[i + 1], radii[i], radii[i + 1], c, o, seg);
      this.sph(radii[i + 1] * 1.03, c, pts[i + 1], o, 1);
    }
    return this;
  }

  /** Two glowing eyes (left and right of x = 0), slanted into a scowl. */
  eyes(x: number, y: number, z: number, w: number, h: number, slant = 0.3, color = 0xffffff): this {
    this.box(w, h, 0.04, color, [x, y, z], { glow: true, r: [0, 0, -slant] });
    this.box(w, h, 0.04, color, [-x, y, z], { glow: true, r: [0, 0, slant] });
    return this;
  }

  build(which: 'base' | 'glow'): THREE.BufferGeometry | null {
    const list = which === 'base' ? this.base : this.glow;
    if (!list.length) return null;
    let n = 0;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of list) {
      n += p.geo.attributes.position.count * (p.two ? 2 : 1);
      const P = p.geo.attributes.position.array as ArrayLike<number>;
      for (let i = 1; i < P.length; i += 3) {
        if (P[i] < y0) y0 = P[i];
        if (P[i] > y1) y1 = P[i];
      }
    }
    const span = Math.max(0.05, y1 - y0);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const G = which === 'base' ? this.grim : null;
    const uvs = G ? new Float32Array(n * 2) : null;
    const bloodA = G?.bloodColor !== undefined ? new THREE.Color(G.bloodColor) : BLOOD;
    const bloodB = G?.bloodColor !== undefined ? new THREE.Color(G.bloodColor).multiplyScalar(0.6) : BLOOD_DRY;
    const c = new THREE.Color();
    let o = 0;
    let pi = 0;
    for (const p of list) {
      const P = p.geo.attributes.position.array as ArrayLike<number>;
      const N = p.geo.attributes.normal.array as ArrayLike<number>;
      const cnt = p.geo.attributes.position.count;
      // painted style: which atlas cell this primitive samples, and how much of it
      let U: ArrayLike<number> | null = null;
      let u0 = 0, v0 = 0, us = 1, vs = 1, umin = 0, vmin = 0, uspan = 1, vspan = 1;
      let blood = p.blood;
      if (G && uvs) {
        let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
          bx0 = Math.min(bx0, P[i]); bx1 = Math.max(bx1, P[i]);
          by0 = Math.min(by0, P[i + 1]); by1 = Math.max(by1, P[i + 1]);
          bz0 = Math.min(bz0, P[i + 2]); bz1 = Math.max(bz1, P[i + 2]);
        }
        const ext = [bx1 - bx0, by1 - by0, bz1 - bz0].sort((a, b) => b - a);
        const size = ext[0], thin = ext[2] / Math.max(1e-4, ext[0]), long = ext[0] / Math.max(1e-4, ext[1]);
        const d = p.d ?? guessDetail(G, p.color, size, thin, p.two, long);
        // claws, fangs, horns and spikes of a bloody kind are stained (blood on hide comes from the atlas)
        if (G.blood) {
          if ((d === 'horn' || d === 'bone' || d === 'blade') && size < 0.6 && long > 2) blood = Math.max(blood, G.blood);
          else if (d === 'blade' || d === 'steel' || d === 'iron') blood = Math.max(blood, G.blood * 0.25);
        }
        const r = cellRect(d);
        const k = Math.min(1, Math.max(0.2, size / 1.4));
        u0 = r[0] + hash(pi, 1, 2, 3) * r[2] * (1 - k);
        v0 = r[1] + hash(pi, 4, 5, 6) * r[2] * (1 - k);
        us = vs = r[2] * k;
        const UA = p.geo.attributes.uv as THREE.BufferAttribute | undefined;
        if (UA) {
          U = UA.array as ArrayLike<number>;
          let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
          for (let i = 0; i < U.length; i += 2) { a0 = Math.min(a0, U[i]); a1 = Math.max(a1, U[i]); b0 = Math.min(b0, U[i + 1]); b1 = Math.max(b1, U[i + 1]); }
          umin = a0; vmin = b0; uspan = Math.max(1e-4, a1 - a0); vspan = Math.max(1e-4, b1 - b0);
        }
      }
      pi++;
      const write = (flip: boolean) => {
        for (let t = 0; t < cnt; t += 3) {
          const cx = (P[t * 3] + P[t * 3 + 3] + P[t * 3 + 6]) / 3;
          const cy = (P[t * 3 + 1] + P[t * 3 + 4] + P[t * 3 + 7]) / 3;
          const cz = (P[t * 3 + 2] + P[t * 3 + 5] + P[t * 3 + 8]) / 3;
          const k = 1 + (hash(cx, cy, cz, 1) * 2 - 1) * p.grit;
          c.copy(p.color).multiplyScalar(k);
          if (!p.flat && this.ao > 0) {
            const t01 = (cy - y0) / span;
            c.multiplyScalar(1 - this.ao * (1 - t01) * (1 - t01));
          }
          if (G && !p.flat) {
            const t01 = (cy - y0) / span;
            // a little duller and darker, like the painted characters
            const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
            c.setRGB(c.r + (l - c.r) * 0.18, c.g + (l - c.g) * 0.18, c.b + (l - c.b) * 0.18);
            const ny = (N[t * 3 + 1] + N[t * 3 + 4] + N[t * 3 + 7]) / 3;
            const w = patch(cx, cy, cz, 9);
            if (G.frost && ny > 0.3) c.lerp(RIME, Math.min(0.62, G.frost * ((ny - 0.3) / 0.7) * 1.4 * (0.4 + w)));
            if (G.soot && t01 < 0.55) c.lerp(SOOT, G.soot * (1 - t01 / 0.55) * (0.4 + 0.6 * w));
            if (G.rot) {
              if (w > 1 - G.rot * 0.7) c.lerp(MOULD, 0.45);
              if (t01 < 0.35) c.lerp(_c2.copy(MOULD).multiplyScalar(0.5), G.rot * (1 - t01 / 0.35) * 0.6);
            }
          }
          if (blood > 0 && hash(cx, cy, cz, 7) < blood) c.lerp(hash(cx, cy, cz, 5) < 0.6 ? bloodA : bloodB, 0.75 + hash(cx, cy, cz, 3) * 0.25);
          for (let j = 0; j < 3; j++) {
            const v = t + (flip ? 2 - j : j);
            pos[o * 3] = P[v * 3]; pos[o * 3 + 1] = P[v * 3 + 1]; pos[o * 3 + 2] = P[v * 3 + 2];
            if (uvs) {
              const a = U ? (U[v * 2] - umin) / uspan : 0.5 + P[v * 3] * 0.8;
              const b = U ? (U[v * 2 + 1] - vmin) / vspan : (P[v * 3 + 1] - y0) / span;
              uvs[o * 2] = u0 + Math.min(1, Math.max(0, a)) * us;
              uvs[o * 2 + 1] = v0 + Math.min(1, Math.max(0, b)) * vs;
            }
            const s = flip ? -1 : 1;
            nor[o * 3] = N[v * 3] * s; nor[o * 3 + 1] = N[v * 3 + 1] * s; nor[o * 3 + 2] = N[v * 3 + 2] * s;
            col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
            o++;
          }
        }
      };
      write(false);
      if (p.two) write(true);
      p.geo.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.computeBoundingSphere();
    g.userData.shared = true;
    return g;
  }
}

// ------------------------------------------------------------------ shared parts and per-instance materials

interface Built { base: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null }
const CACHE = new Map<string, Built>();

/** Number of cached limb geometries (debug / tests). */
export function darkCacheSize(): number {
  return CACHE.size;
}

export interface DarkMats { body: Mat; glow: Mat }

/**
 * One monster kind's builder context: its two per-instance materials and
 * limbs whose geometry is cached under "<kind>.<name>".
 */
export class Kit {
  readonly M: DarkMats;
  /** Painted style: this kind's grim look (null in the classic style and for kinds without one). */
  readonly grim: Grim | null;

  constructor(readonly kind: string, glow: number, glowBoost = 1.5) {
    this.M = {
      body: new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() }),
      glow: new THREE.MeshToonMaterial({ color: new THREE.Color(glow).multiplyScalar(0.25), emissive: glow, emissiveIntensity: glowBoost, vertexColors: true, gradientMap: toonGradient() }),
    };
    this.grim = PAINTED ? grimFor(kind) : null;
    if (this.grim) grimBody(this.M.body, this.grim);
  }

  /** A pivot group holding the shared geometry of one limb. */
  limb(name: string, at: V3, make: (m: Mesher) => void): THREE.Group {
    const key = this.kind + '.' + name;
    let b = CACHE.get(key);
    if (!b) {
      const m = new Mesher();
      m.grim = this.grim;
      make(m);
      b = { base: m.build('base'), glow: m.build('glow') };
      CACHE.set(key, b);
    }
    const g = new THREE.Group();
    g.position.set(...at);
    for (const [geo, mt] of [[b.base, this.M.body], [b.glow, this.M.glow]] as const) {
      if (!geo) continue;
      const me = new THREE.Mesh(geo, mt);
      me.castShadow = true;
      me.receiveShadow = mt === this.M.body;
      g.add(me);
    }
    return g;
  }

  get materials(): Mat[] {
    return [this.M.body, this.M.glow];
  }
}

let HITBOX_GEO: THREE.BoxGeometry | null = null;
const HITBOX_MAT = new THREE.MeshBasicMaterial();
export function hitbox(w: number, h: number, d: number): THREE.Mesh {
  if (!HITBOX_GEO) {
    HITBOX_GEO = new THREE.BoxGeometry(1, 1, 1);
    HITBOX_GEO.userData.shared = true;
  }
  const hb = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
  hb.scale.set(w, h, d);
  hb.position.y = h / 2;
  hb.visible = false;
  hb.userData.sharedMaterial = true;
  return hb;
}

export interface BipedParts {
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  wings?: THREE.Group[];
}

export function bipedRig(K: Kit, p: BipedParts, hb: THREE.Mesh, height: number, restArm: number, hover = false): BipedRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body, hb);
  body.add(p.legL, p.legR, p.torso, p.head, p.armL, p.armR, ...(p.wings ?? []));
  return { type: 'biped', root, body, torso: p.torso, head: p.head, armL: p.armL, armR: p.armR, legL: p.legL, legR: p.legR, cape: null, materials: K.materials, hitbox: hb, height, restArm, wings: p.wings, hover };
}

export interface QuadParts {
  body: THREE.Group;
  head: THREE.Group;
  /** FL, FR, BL, BR (then further pairs for spiders). */
  legs: THREE.Group[];
  tail: THREE.Group;
  wings?: THREE.Group[];
}

export function quadRig(K: Kit, p: QuadParts, hb: THREE.Mesh, height: number): QuadRig {
  const root = new THREE.Group();
  p.body.add(p.head, ...p.legs, p.tail, ...(p.wings ?? []));
  for (const l of p.legs) l.userData.splay = l.rotation.z;
  root.add(p.body, hb);
  return { type: 'quad', root, body: p.body, head: p.head, legs: p.legs, tail: p.tail, wings: p.wings ?? [], materials: K.materials, hitbox: hb, height };
}

/** An empty pivot (a rig slot this monster has nothing in, e.g. a snake's legs). */
export function empty(at: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...at);
  return g;
}

// ------------------------------------------------------------------ shared palette

export const C = {
  SOCKET: 0x120e0c,
  MOUTH: 0x1a0806,
  GUM: 0x6a1410,
  FANG: 0xdcd0b0,
  BONE: 0xd6caa6,
  BONE_D: 0x7e7058,
  IRON: 0x6a6e74,
  IRON_D: 0x34373c,
  IRON_L: 0xa4a6a8,
  STEEL: 0x8a929c,
  RUST: 0x7a4220,
  LEATHER: 0x3a2a1c,
  LEATHER_L: 0x5a4028,
  WOOD: 0x4a3420,
  WOOD_D: 0x2a1e14,
  CLOTH: 0x33302a,
  GOLD: 0xb08a34,
  GOLD_D: 0x6a5020,
  SCAR: 0x9a6a58,
  CLAW: 0x1e1814,
  HORN: 0x2e261e,
  HORN_L: 0x7a6a52,
  BRASS: 0x8a6a30,
} as const;
