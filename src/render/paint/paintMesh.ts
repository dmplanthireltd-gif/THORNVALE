import * as THREE from 'three';
import type { Cell } from './builtAtlas';

/**
 * Painted style: collects every static piece of the built world (walls, timber,
 * fences, furniture, graves, lamps…) into ONE merged mesh per map chunk, all drawn
 * with the built atlas material (builtAtlas.ts). Each piece brings its atlas cell,
 * a tint, world-unit UVs (box-projected or its own), a little per-face grit,
 * ambient darkening toward the ground (contact shadow) and optional world-space
 * jitter (irregular, hand-made silhouettes that stay watertight between
 * neighbouring tiles because the jitter depends only on the world position).
 */
export type V3 = [number, number, number];

export interface PartOpt {
  /** Atlas cell. */
  cell: Cell;
  /** Colour multiplied with the cell (default white). */
  tint?: number | THREE.Color;  // a number below 16 is a grey scale (0.8 = 80 %)
  /** 'box' = world-space box projection (default), 'own' = the geometry's UVs. */
  uv?: 'box' | 'own';
  /** UV scale (cell repeats per world unit for 'box'). */
  su?: number;
  sv?: number;
  /** UV offset (varies the pattern between props). */
  ou?: number;
  ov?: number;
  /** Swap u and v (grain across instead of along). */
  swap?: boolean;
  /** Per-face brightness noise. */
  grit?: number;
  /** Darkening toward the ground (0 = none) over `aoH` world units. */
  ao?: number;
  aoH?: number;
  /** Darkening under the eaves: from `eaveY - 0.45` up to `eaveY`. */
  eaveY?: number;
  /** World-space jitter amplitude (irregular shapes). */
  jitter?: number;
  /** Rotation, scale of the part (Euler XYZ). */
  r?: V3;
  s?: V3;
}

interface Chunk { pos: number[]; nor: number[]; uv: number[]; col: number[]; cell: number[] }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Matrix3();
const _c = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fn = new THREE.Vector3();
const _e2 = new THREE.Vector3();

export function wh(x: number, y: number, z: number, k: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

export class PaintMesher {
  private chunks = new Map<number, Chunk>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** Triangles added so far (for the perf budget). */
  tris = 0;

  constructor(private readonly chunkOf: (x: number, z: number) => number) {}

  push(p: V3, r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]): this {
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s));
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(_m));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Adds a geometry placed at `p` (inside the current push frame). The geometry is consumed. */
  add(geo: THREE.BufferGeometry, o: PartOpt, p: V3 = [0, 0, 0]): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    _m.compose(_v.set(...p), _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0]))), _s.set(...(o.s ?? [1, 1, 1])));
    const M = this.stack[this.stack.length - 1].clone().multiply(_m);
    _n.getNormalMatrix(M);
    const P = g.attributes.position.array as Float32Array;
    const N = g.attributes.normal?.array as Float32Array | undefined;
    const U = g.attributes.uv?.array as Float32Array | undefined;
    const cnt = g.attributes.position.count;
    const origin = _v.set(0, 0, 0).applyMatrix4(M);
    const key = this.chunkOf(origin.x + 0.5, origin.z + 0.5);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { pos: [], nor: [], uv: [], col: [], cell: [] }));
    const t0 = o.tint ?? 0xffffff;
    const tint = typeof t0 === 'number' && t0 < 16 ? _c.setScalar(t0) : _c.set(t0);
    const tr = tint.r, tg = tint.g, tb = tint.b;
    const su = o.su ?? 1, sv = o.sv ?? 1, ou = o.ou ?? 0, ov = o.ov ?? 0;
    const grit = o.grit ?? 0.06, ao = o.ao ?? 0.32, aoH = o.aoH ?? 0.45, jit = o.jitter ?? 0;
    const W = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      _a.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M);
      if (jit) {
        const x = Math.round(_a.x * 200) / 200, y = Math.round(_a.y * 200) / 200, z = Math.round(_a.z * 200) / 200;
        _a.x += (wh(x, y, z, 1) - 0.5) * 2 * jit;
        _a.z += (wh(x, y, z, 2) - 0.5) * 2 * jit;
        if (_a.y > 0.02) _a.y += (wh(x, y, z, 3) - 0.5) * 2 * jit;
      }
      W[i * 3] = _a.x; W[i * 3 + 1] = _a.y; W[i * 3 + 2] = _a.z;
    }
    for (let t = 0; t < cnt; t += 3) {
      // face normal (flat shading: painted facets) unless the geometry is smooth and not jittered
      _a.set(W[t * 3], W[t * 3 + 1], W[t * 3 + 2]);
      _b.set(W[t * 3 + 3], W[t * 3 + 4], W[t * 3 + 5]);
      _d.set(W[t * 3 + 6], W[t * 3 + 7], W[t * 3 + 8]);
      const fn = _fn.subVectors(_b, _a).cross(_e2.subVectors(_d, _a));
      if (fn.lengthSq() < 1e-14) continue;
      fn.normalize();
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      const cx = (_a.x + _b.x + _d.x) / 3, cy = (_a.y + _b.y + _d.y) / 3, cz = (_a.z + _b.z + _d.z) / 3;
      const k = 1 + (wh(cx, cy, cz, 7) * 2 - 1) * grit;
      for (let j = 0; j < 3; j++) {
        const v = t + j;
        const x = W[v * 3], y = W[v * 3 + 1], z = W[v * 3 + 2];
        ch.pos.push(x, y, z);
        if (N && !jit) {
          _s.set(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]).applyMatrix3(_n).normalize();
          ch.nor.push(_s.x, _s.y, _s.z);
        } else ch.nor.push(fn.x, fn.y, fn.z);
        let u: number, w: number;
        if (o.uv === 'own' && U) { u = U[v * 2]; w = U[v * 2 + 1]; }
        else if (ay >= ax && ay >= az) { u = x; w = -z; }
        else if (ax >= az) { u = z; w = y; }
        else { u = x; w = y; }
        if (o.swap) { const q = u; u = w; w = q; }
        ch.uv.push(u * su + ou, w * sv + ov);
        let kk = k;
        if (ao) { const t01 = Math.min(1, Math.max(0, y / aoH)); kk *= 1 - ao * (1 - t01) * (1 - t01); }
        if (o.eaveY !== undefined) { const e = Math.min(1, Math.max(0, (y - (o.eaveY - 0.45)) / 0.45)); kk *= 1 - 0.38 * e * e; }
        ch.col.push(tr * kk, tg * kk, tb * kk);
        ch.cell.push(o.cell);
        this.tris += j === 0 ? 1 : 0;
      }
    }
    g.dispose();
    return this;
  }

  box(w: number, h: number, d: number, o: PartOpt, p?: V3, seg: [number, number, number] = [1, 1, 1]): this { return this.add(new THREE.BoxGeometry(w, h, d, ...seg), o, p); }
  cyl(rt: number, rb: number, h: number, o: PartOpt, p?: V3, seg = 8, hs = 1, open = false): this { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, hs, open), o, p); }
  cone(r: number, h: number, o: PartOpt, p?: V3, seg = 6): this { return this.add(new THREE.ConeGeometry(r, h, seg), o, p); }
  sph(r: number, o: PartOpt, p?: V3, detail = 1): this { return this.add(new THREE.IcosahedronGeometry(r, detail), o, p); }
  /** A body of revolution through (radius, height) points (barrels, urns, columns). */
  lathe(pts: Array<[number, number]>, o: PartOpt, p?: V3, seg = 10): this {
    return this.add(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), o, p);
  }
  /** A tapered rod between two points. */
  seg(a: V3, b: V3, ra: number, rb: number, o: PartOpt, seg = 6): this {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = B.clone().sub(A);
    const g = new THREE.CylinderGeometry(rb, ra, d.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    const mid = A.add(B).multiplyScalar(0.5);
    return this.add(g, { ...o, r: undefined, s: undefined }, [mid.x, mid.y, mid.z]);
  }
  /** A flat polygon in the XY plane, extruded `depth` (slabs, boards, signs). */
  slab(pts: Array<[number, number]>, depth: number, o: PartOpt, p?: V3): this {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x, y);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, o, p);
  }

  get empty(): boolean { return this.chunks.size === 0; }

  /** One mesh per chunk into `group`, drawn with `mat` (a built-atlas material). */
  build(group: THREE.Group, mat: THREE.Material, cast = true, name = 'painted'): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const ch of this.chunks.values()) {
      if (!ch.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ch.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ch.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ch.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ch.col), 3));
      g.setAttribute('aCell', new THREE.BufferAttribute(new Float32Array(ch.cell), 1));
      g.computeBoundingSphere();
      const me = new THREE.Mesh(g, mat);
      me.castShadow = cast;
      me.receiveShadow = true;
      me.name = name;
      group.add(me);
      out.push(me);
    }
    this.chunks.clear();
    return out;
  }
}
