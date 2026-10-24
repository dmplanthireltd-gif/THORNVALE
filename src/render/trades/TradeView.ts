import * as THREE from 'three';
import type { Game } from '../../game/Game';
import { hash2 } from '../../game/core/rng';
import { HERB_BY_ID } from '../../game/trades/herblore';
import { obstaclePath, type Obstacle } from '../../game/trades/layout';
import { STALLS } from '../../game/trades/thieving';
import { PLANTS } from '../../game/trades/farming';
import { currentActivity } from '../../game/gathering/activity';
import { Obj } from '../../game/world/WorldMap';
import { Player } from '../../game/player/Player';
import type { CreatureView } from '../CreatureView';
import { mat } from '../models/parts';

/**
 * The trade-skill places on screen: agility shortcuts (a log over the river, a
 * float line for a swim, a rope and pegs up a cliff, timber props at a crack in
 * the rock), market stalls with their goods, strongboxes (closed / hanging
 * open) and wild herbs (leafy / picked bare). Everything is instanced per
 * 32-tile chunk and floor so three.js culls what is off screen; restocking is a
 * per-instance show/hide, never a rebuild. Also lifts a climber over the cliff.
 */

const CHUNK = 32;
const chunkKey = (x: number, y: number) => Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);

/** One geometry + material, its instances grouped by chunk; instances can be shown and hidden. */
class Part {
  private chunks = new Map<number, { m: number[]; c: number[]; owner: number[] }>();
  readonly meshes: THREE.InstancedMesh[] = [];
  /** owner id → [mesh index, instance, ...] */
  private byOwner = new Map<number, number[]>();
  private originals: Float32Array[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly material: THREE.Material, readonly shadows = true) {}

  add(owner: number, m: THREE.Matrix4, color = 0xffffff): void {
    const e = m.elements;
    const key = chunkKey(e[12] + 0.5, e[14] + 0.5);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { m: [], c: [], owner: [] }));
    for (let k = 0; k < 16; k++) ch.m.push(e[k]);
    const c = new THREE.Color(color);
    ch.c.push(c.r, c.g, c.b);
    ch.owner.push(owner);
  }

  build(group: THREE.Group): void {
    for (const ch of this.chunks.values()) {
      const n = ch.owner.length;
      const im = new THREE.InstancedMesh(this.geo, this.material, n);
      im.instanceMatrix.array.set(ch.m);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ch.c), 3);
      im.castShadow = this.shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.boundingSphere!.radius += 0.5;
      const mi = this.meshes.length;
      this.meshes.push(im);
      this.originals.push(new Float32Array(ch.m));
      ch.owner.forEach((o, i) => {
        const l = this.byOwner.get(o);
        if (l) l.push(mi, i);
        else this.byOwner.set(o, [mi, i]);
      });
      group.add(im);
    }
    this.chunks.clear();
  }

  /** Shows or hides every instance of an owner (a stall's goods, an open lid…). */
  show(owner: number, on: boolean): void {
    const l = this.byOwner.get(owner);
    if (!l) return;
    for (let k = 0; k < l.length; k += 2) {
      const im = this.meshes[l[k]];
      const i = l[k + 1];
      const arr = im.instanceMatrix.array as Float32Array;
      if (on) arr.set(this.originals[l[k]].subarray(i * 16, i * 16 + 16), i * 16);
      else arr.fill(0, i * 16, i * 16 + 16);
      im.instanceMatrix.needsUpdate = true;
    }
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function compose(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

const _x = new THREE.Vector3(1, 0, 0);
/** A unit X-aligned piece (rope) stretched from P to Q. */
function segment(P: THREE.Vector3, Q: THREE.Vector3): THREE.Matrix4 {
  const d = _p.subVectors(Q, P);
  const len = d.length();
  _q.setFromUnitVectors(_x, d.clone().normalize());
  return _m.compose(new THREE.Vector3().addVectors(P, Q).multiplyScalar(0.5), _q, _s.set(len, 1, 1));
}

interface Watched {
  x: number;
  y: number;
  z: number;
  /** Owner ids of the "full" and "empty" looks. */
  full: number;
  empty: number;
  fullObj: Obj;
  last: number;
}

export class TradeView {
  private floors = new Map<number, THREE.Group>();
  private parts = new Map<string, Part>();
  private watched: Watched[] = [];
  private timer = 0;
  private nextOwner = 1;

  constructor(scene: THREE.Scene, private readonly game: Game) {
    this.scene = scene;
    const l = game.world.trades;
    if (!l) return;
    for (const o of l.obstacles) this.obstacle(o);
    l.stalls.forEach((s) => this.stall(s.x, s.y, s.z, STALLS[s.kind].awning, s.kind));
    l.boxes.forEach((b) => this.box(b.x, b.y, b.z));
    l.herbs.forEach((h) => this.herb(h.x, h.y, h.z, HERB_BY_ID[h.herb]?.color ?? '#6a9a3a'));
    l.patches.forEach((q) => this.patch(q.x, q.y, q.z, q.kind));
    l.hunts.forEach((h) => this.huntSpot(h.x, h.y, h.z, h.kind));
    l.moorings.forEach((mo) => this.mooring(mo.x, mo.y, mo.z, mo.dockX, mo.dockY));
    l.flotsam.forEach((f) => this.flotsam(f.x, f.y, f.z));
    for (const [key, part] of this.parts) part.build(this.floorGroup(Number(key.split('|')[0])));
  }

  private scene: THREE.Scene | null = null;

  private floorGroup(z: number): THREE.Group {
    let g = this.floors.get(z);
    if (!g) {
      g = new THREE.Group();
      g.name = `trades:${z}`;
      this.floors.set(z, g);
      this.scene?.add(g);
    }
    return g;
  }

  private part(z: number, name: string, make: () => [THREE.BufferGeometry, THREE.Material, boolean?]): Part {
    const key = `${z}|${name}`;
    let p = this.parts.get(key);
    if (!p) {
      const [g, m, sh] = make();
      p = new Part(g, m, sh ?? true);
      this.parts.set(key, p);
    }
    return p;
  }

  // ---------------------------------------------------------------- builders (shared geometries per floor)

  private static geo = {
    log: new THREE.CylinderGeometry(0.17, 0.19, 1, 8).rotateZ(Math.PI / 2),
    rope: new THREE.CylinderGeometry(0.025, 0.025, 1, 5).rotateZ(Math.PI / 2),
    float: new THREE.IcosahedronGeometry(0.09, 0),
    post: new THREE.CylinderGeometry(0.06, 0.07, 1, 6).translate(0, 0.5, 0),
    peg: new THREE.BoxGeometry(0.22, 0.06, 0.08),
    beam: new THREE.BoxGeometry(1, 0.12, 0.14),
    table: new THREE.BoxGeometry(1.0, 0.1, 0.72),
    awning: new THREE.BoxGeometry(1.18, 0.05, 0.9),
    goods: new THREE.BoxGeometry(0.2, 0.16, 0.18),
    chest: new THREE.BoxGeometry(0.72, 0.42, 0.5).translate(0, 0.21, 0),
    band: new THREE.BoxGeometry(0.06, 0.44, 0.52).translate(0, 0.22, 0),
    lid: new THREE.BoxGeometry(0.74, 0.12, 0.52).translate(0, 0.06, 0.26),
    leaf: new THREE.ConeGeometry(0.07, 0.36, 4).translate(0, 0.18, 0),
    bloom: new THREE.IcosahedronGeometry(0.055, 0),
    stub: new THREE.CylinderGeometry(0.02, 0.03, 0.08, 4).translate(0, 0.04, 0),
    soil: new THREE.BoxGeometry(0.9, 0.12, 0.9).translate(0, 0.06, 0),
    furrow: new THREE.BoxGeometry(0.8, 0.05, 0.1).translate(0, 0.14, 0),
    plank: new THREE.BoxGeometry(1, 0.16, 0.08).translate(0, 0.08, 0),
    mound: new THREE.IcosahedronGeometry(0.36, 1).scale(1, 0.45, 1),
    hole: new THREE.CircleGeometry(0.14, 10).rotateX(-Math.PI / 2),
    bush: new THREE.IcosahedronGeometry(0.4, 1).scale(1, 0.8, 1),
    nest: new THREE.TorusGeometry(0.13, 0.05, 5, 10).rotateX(Math.PI / 2),
  };

  private static mats = new Map<string, THREE.Material>();
  private static m(name: string, color = 0xffffff, emissive = 0): THREE.Material {
    let m = TradeView.mats.get(name);
    if (!m) {
      m = mat(color, { emissive });
      TradeView.mats.set(name, m);
    }
    return m;
  }

  private obstacle(o: Obstacle): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    const path = obstaclePath(o);
    const a = path[0], b = path[path.length - 1];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const yaw = o.dx !== 0 ? 0 : Math.PI / 2;
    const span = o.len + 1;
    const wood = this.part(o.z, 'wood', () => [G.post, M('wood', 0x8a6a46)]);
    switch (o.kind) {
      case 'balance': {
        const log = this.part(o.z, 'log', () => [G.log, M('bark', 0x6a4a2c)]);
        log.add(owner, compose(mx, -0.04, my, yaw, span + 0.2, 1, 1));
        for (const e of [a, b]) wood.add(owner, compose(e.x - o.dx * 0.2 + (o.dy ? 0.25 : 0), -0.1, e.y - o.dy * 0.2 + (o.dx ? 0.25 : 0), 0, 1, 0.55, 1));
        break;
      }
      case 'swim': {
        const rope = this.part(o.z, 'rope', () => [G.rope, M('rope', 0xc8b080)]);
        const fl = this.part(o.z, 'float', () => [G.float, M('float', 0xffffff)]);
        rope.add(owner, compose(mx, 0.02, my, yaw, span, 1, 1));
        for (let i = 1; i <= o.len; i++) fl.add(owner, compose(a.x + o.dx * i, 0.03, a.y + o.dy * i), i % 2 ? 0xd83a2a : 0xf0ece0);
        for (const e of [a, b]) wood.add(owner, compose(e.x, -0.1, e.y, 0, 1, 1.0, 1));
        break;
      }
      case 'climb': {
        // a rope over the cliff top with wooden pegs hammered into the rock on both faces
        const rope = this.part(o.z, 'rope', () => [G.rope, M('rope', 0xc8b080)]);
        const peg = this.part(o.z, 'peg', () => [G.peg, M('wood', 0x8a6a46)]);
        const top = 1.65;
        const pt = (t: number, h: number) => new THREE.Vector3(a.x + o.dx * t, h, a.y + o.dy * t);
        const pts = [pt(0.5, 0.05), pt(0.95, top), pt(span - 0.95, top), pt(span - 0.5, 0.05)];
        for (let i = 0; i < 3; i++) if (pts[i].distanceTo(pts[i + 1]) > 0.05) rope.add(owner, segment(pts[i], pts[i + 1]));
        for (let i = 0; i < 3; i++) {
          const h = 0.35 + i * 0.45;
          peg.add(owner, compose(a.x + o.dx * 0.55, h, a.y + o.dy * 0.55, yaw + Math.PI / 2));
          peg.add(owner, compose(b.x - o.dx * 0.55, h, b.y - o.dy * 0.55, yaw + Math.PI / 2));
        }
        break;
      }
      case 'squeeze': {
        // timber props framing the crack at both ends
        const beam = this.part(o.z, 'beam', () => [G.beam, M('wood', 0x8a6a46)]);
        for (const [e, s] of [[a, 1], [b, -1]] as const) {
          const cx = e.x + o.dx * 0.5 * s, cy = e.y + o.dy * 0.5 * s;
          const sx = o.dy ? 0.32 : 0, sy = o.dx ? 0.32 : 0;
          wood.add(owner, compose(cx - sx, 0, cy - sy, 0, 0.9, 1.5, 0.9));
          wood.add(owner, compose(cx + sx, 0, cy + sy, 0, 0.9, 1.5, 0.9));
          beam.add(owner, compose(cx, 1.5, cy, yaw + Math.PI / 2, 0.8, 1, 1));
        }
        break;
      }
    }
  }

  private stall(x: number, y: number, z: number, awning: [number, number], kind: string): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    const goodsOwner = this.nextOwner++;
    const h = hash2(x, y, 77);
    const rot = h < 0.5 ? 0 : Math.PI / 2;
    this.part(z, 'table', () => [G.table, M('plank', 0x9a7450)]).add(owner, compose(x, 0.72, y, rot));
    const posts = this.part(z, 'wood', () => [G.post, M('wood', 0x8a6a46)]);
    for (const [dx, dy] of [[-0.46, -0.32], [0.46, -0.32], [-0.46, 0.32], [0.46, 0.32]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      posts.add(owner, compose(x + dx * c - dy * s, 0, y + dx * s + dy * c, 0, 0.8, 1.62, 0.8));
    }
    // a striped awning over the back half, so the goods on the front of the counter show from above
    const aw = this.part(z, 'awning', () => [G.awning, M('cloth', 0xffffff)]);
    const c0 = Math.cos(rot), s0 = Math.sin(rot);
    for (let i = 0; i < 4; i++) {
      const ox = -0.44 + i * 0.295, oy = -0.18;
      aw.add(owner, compose(x + ox * c0 - oy * s0, 1.6, y + ox * s0 + oy * c0, rot, 0.25, 1, 0.62, 0.22), i % 2 ? awning[1] : awning[0]);
    }
    // goods on the counter: colours by what is sold
    const colors: Record<string, number[]> = {
      bakery: [0xd8a860, 0xc89048, 0xe6c84f], fruit: [0x7ab04a, 0xe0402a, 0xe8304a], fish: [0x9ab8cc, 0xa8b47a, 0xf09a80], fur: [0x7a7a82, 0xdfe6ee, 0x6a4a2a],
      silk: [0xc8507a, 0x5a3aa8, 0xe8c8d8], spice: [0xc0601a, 0xe0a030, 0x8a3a1a], silver: [0xd8dce4, 0xb0b6c0, 0xe8ecf0], gem: [0x24c060, 0xe8243a, 0x2a6ae8],
    };
    const g = this.part(z, 'goods', () => [G.goods, M('goods', 0xffffff)]);
    const cs = colors[kind] ?? colors.bakery;
    for (let i = 0; i < 4; i++) {
      const ox = -0.33 + i * 0.22, oy = 0.12 + (hash2(x, y, i) - 0.5) * 0.18;
      const c = Math.cos(rot), s = Math.sin(rot);
      g.add(goodsOwner, compose(x + ox * c - oy * s, 0.85, y + ox * s + oy * c, hash2(x, y, i + 5) * 2, 1, 0.8 + hash2(x, y, i + 9) * 0.5, 1), cs[i % cs.length]);
    }
    this.watched.push({ x, y, z, full: goodsOwner, empty: -1, fullObj: Obj.TradeStall, last: -1 });
  }

  /** A mooring post in the water beside the pier, a rope to the pier and a ring. */
  private mooring(x: number, y: number, z: number, dx: number, dy: number): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    this.part(z, 'mpost', () => [G.post, M('tarwood', 0x3a2a1c)]).add(owner, compose(x, -0.45, y, 0, 1.9, 1.35, 1.9));
    this.part(z, 'mcap', () => [G.bloom, M('iron', 0x5a5e66)]).add(owner, compose(x, 0.92, y, 0, 1.4, 0.7, 1.4));
    const rope = this.part(z, 'mrope', () => [new THREE.CylinderGeometry(0.022, 0.022, 1, 5), M('rope', 0xc8b088), false]);
    const a = new THREE.Vector3(x, 0.7, y), b = new THREE.Vector3(x + (dx - x) * 0.55, 0.12, y + (dy - y) * 0.55);
    rope.add(owner, segment(a, b));
    this.part(z, 'mring', () => [new THREE.TorusGeometry(0.1, 0.02, 4, 10), M('iron', 0x5a5e66), false]).add(owner, compose(x, 0.55, y, 0, 1, 1, 1, Math.PI / 2));
  }

  /** Floating wreckage: planks, a barrel and a scrap of sail; a few splinters while the sea brings more. */
  private flotsam(x: number, y: number, z: number): void {
    const G = TradeView.geo, M = TradeView.m;
    const full = this.nextOwner++;
    const empty = this.nextOwner++;
    const W = -0.07;
    const plank = this.part(z, 'fplank', () => [G.plank, M('wetwood', 0xa8875a)]);
    for (let i = 0; i < 3; i++) {
      const r = hash2(x, y, i) * Math.PI;
      plank.add(full, compose(x + (hash2(x, y, i + 4) - 0.5) * 0.6, W, y + (hash2(x, y, i + 9) - 0.5) * 0.6, r, 0.95, 1, 2.8));
    }
    this.part(z, 'fbarrel', () => [new THREE.CylinderGeometry(0.2, 0.2, 0.46, 10).rotateZ(Math.PI / 2), M('barrel', 0xa0703a)])
      .add(full, compose(x + 0.18, W + 0.14, y - 0.12, hash2(x, y, 21) * 3));
    this.part(z, 'fcrate', () => [new THREE.BoxGeometry(0.42, 0.34, 0.42).translate(0, 0.17, 0), M('crate', 0xc09a62)])
      .add(full, compose(x - 0.18, W + 0.04, y + 0.1, hash2(x, y, 27) * 3, 1, 1, 1, 0.12, 0.08));
    this.part(z, 'fsail', () => [new THREE.PlaneGeometry(0.6, 0.45).rotateX(-Math.PI / 2), M('sailcloth', 0xd8cfb4)])
      .add(full, compose(x - 0.2, W + 0.05, y + 0.18, hash2(x, y, 33) * 3, 1, 1, 1, 0.05));
    for (let i = 0; i < 3; i++) plank.add(empty, compose(x + (hash2(x, y, i + 40) - 0.5) * 0.7, W, y + (hash2(x, y, i + 50) - 0.5) * 0.7, hash2(x, y, i + 60) * 3, 0.4, 0.6, 0.6));
    this.watched.push({ x, y, z, full, empty, fullObj: Obj.Flotsam, last: -1 });
  }

  private box(x: number, y: number, z: number): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    const closed = this.nextOwner++;
    const open = this.nextOwner++;
    const rot = hash2(x, y, 31) * 0.6 - 0.3;
    this.part(z, 'chest', () => [G.chest, M('darkwood', 0x4a3220)]).add(owner, compose(x, 0, y, rot));
    const band = this.part(z, 'band', () => [G.band, M('iron', 0x5a5e66)]);
    for (const k of [-0.24, 0.24]) band.add(owner, compose(x + Math.cos(rot) * k, 0, y - Math.sin(rot) * k, rot));
    const lid = this.part(z, 'lid', () => [G.lid, M('darkwood', 0x4a3220)]);
    lid.add(closed, compose(x - Math.sin(rot) * 0.26, 0.42, y - Math.cos(rot) * 0.26, rot));
    lid.add(open, compose(x - Math.sin(rot) * 0.26, 0.42, y - Math.cos(rot) * 0.26, rot, 1, 1, 1, -1.9));
    this.watched.push({ x, y, z, full: closed, empty: open, fullObj: Obj.StrongBox, last: -1 });
  }

  private herb(x: number, y: number, z: number, color: string): void {
    const G = TradeView.geo, M = TradeView.m;
    const full = this.nextOwner++;
    const empty = this.nextOwner++;
    const leaf = this.part(z, 'leaf', () => [G.leaf, M('leaf', 0xffffff), false]);
    const bloom = this.part(z, 'bloom', () => [G.bloom, M('bloom', 0xffffff, 0x101010), false]);
    const stub = this.part(z, 'stub', () => [G.stub, M('stub', 0x5a6a3a), false]);
    const c = new THREE.Color(color);
    const leafColor = c.clone().multiplyScalar(0.75).getHex();
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + hash2(x, y, i) * 0.4;
      const r = 0.06 + hash2(x, y, i + 3) * 0.12;
      leaf.add(full, compose(x + Math.cos(a) * r, 0, y + Math.sin(a) * r, a, 1, 0.8 + hash2(x, y, i + 7) * 0.5, 1, 0.35 * Math.cos(a), 0.35 * Math.sin(a)), leafColor);
      stub.add(empty, compose(x + Math.cos(a) * r, 0, y + Math.sin(a) * r));
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + hash2(x, y, i + 11);
      bloom.add(full, compose(x + Math.cos(a) * 0.1, 0.36 + hash2(x, y, i + 13) * 0.08, y + Math.sin(a) * 0.1), c.getHex());
    }
    this.watched.push({ x, y, z, full, empty, fullObj: Obj.WildHerbs, last: -1 });
  }

  private patch(x: number, y: number, z: number, kind: string): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    this.part(z, 'soil', () => [G.soil, M('soil', 0x4a3220)]).add(owner, compose(x, 0, y));
    const fur = this.part(z, 'furrow', () => [G.furrow, M('soil2', 0x5e4028)]);
    for (const k of [-0.25, 0, 0.25]) fur.add(owner, compose(x, 0, y + k));
    const plank = this.part(z, 'plank', () => [G.plank, M('wood', 0x8a6a46)]);
    for (const [dx, dy, r] of [[0, -0.48, 0], [0, 0.48, 0], [-0.48, 0, Math.PI / 2], [0.48, 0, Math.PI / 2]] as const) plank.add(owner, compose(x + dx, 0, y + dy, r), kind === 'herb' ? 0x6a8a4a : 0x8a6a46);
  }

  private huntSpot(x: number, y: number, z: number, kind: string): void {
    const G = TradeView.geo, M = TradeView.m;
    const owner = this.nextOwner++;
    if (kind === 'burrow') {
      this.part(z, 'mound', () => [G.mound, M('earth', 0x6a5236)]).add(owner, compose(x, 0, y, hash2(x, y, 3) * 6));
      this.part(z, 'hole', () => [G.hole, M('hole', 0x0c0806), false]).add(owner, compose(x + 0.16, 0.12, y + 0.18));
    } else {
      this.part(z, 'bush', () => [G.bush, M('leaf2', 0x3e6a2c)]).add(owner, compose(x, 0.32, y, hash2(x, y, 5) * 6), hash2(x, y, 9) < 0.5 ? 0x3e6a2c : 0x4a7a32);
      this.part(z, 'nest', () => [G.nest, M('twig', 0x8a6a3a), false]).add(owner, compose(x, 0.62, y));
    }
  }

  // ---------------------------------------------------------------- your own crops and traps (per player, rebuilt when they change)

  private crops = new Map<number, { key: string; g: THREE.Group }>();
  private trapsShown = new Map<number, { key: string; g: THREE.Group }>();
  private ownTimer = 0;

  private updateOwn(): void {
    const g = this.game;
    const s = g.session(g.localId);
    const l = g.world.trades;
    if (!s || !l) return;
    const farm = new Map(g.skillSys.farmView(s).map((e) => [e[0], e]));
    for (const [id, c] of [...this.crops]) if (!farm.has(id)) { c.g.removeFromParent(); this.crops.delete(id); }
    for (const [id, e] of farm) {
      const patch = l.patches[id];
      if (!patch) continue;
      const key = e.join(',');
      const have = this.crops.get(id);
      if (have?.key === key) continue;
      have?.g.removeFromParent();
      const grp = this.buildCrop(patch.x, patch.y, e[1], e[2]);
      this.floorGroup(patch.z).add(grp);
      this.crops.set(id, { key, g: grp });
    }
    const traps = new Map(g.skillSys.trapView(s).map((e) => [e[0], e]));
    for (const [id, c] of [...this.trapsShown]) if (!traps.has(id)) { c.g.removeFromParent(); this.trapsShown.delete(id); }
    for (const [id, e] of traps) {
      const spot = l.hunts[id];
      if (!spot) continue;
      const key = e.join(',');
      const have = this.trapsShown.get(id);
      if (have?.key === key) continue;
      have?.g.removeFromParent();
      const grp = this.buildTrap(spot.x, spot.y, spot.kind, e[1]);
      this.floorGroup(spot.z).add(grp);
      this.trapsShown.set(id, { key, g: grp });
    }
  }

  private static cropMats = new Map<number, THREE.Material>();
  private static cm(c: number): THREE.Material {
    let m = TradeView.cropMats.get(c);
    if (!m) TradeView.cropMats.set(c, (m = mat(c)));
    return m;
  }

  /** A crop on a patch: small sprouts, then leaves, then fruit (stage 0–3). */
  private buildCrop(x: number, y: number, seedIndex: number, stage: number): THREE.Group {
    const d = PLANTS[seedIndex];
    const grp = new THREE.Group();
    const leaf = TradeView.cm(d?.leaf ?? 0x4a8a2a);
    const fruit = TradeView.cm(d?.fruit ?? 0xe0402a);
    const h = [0.12, 0.24, 0.36, 0.42][stage] ?? 0.2;
    const herb = d?.patch === 'herb';
    for (let i = 0; i < 6; i++) {
      const ox = ((i % 3) - 1) * 0.26, oz = (Math.floor(i / 3) - 0.5) * 0.4;
      const cone = new THREE.Mesh(TradeView.geo.leaf, leaf);
      cone.position.set(x + ox, 0.12, y + oz);
      cone.scale.set(herb ? 1.6 : 1.2, h / 0.36 * (herb ? 0.9 : 1), herb ? 1.6 : 1.2);
      cone.rotation.set(hash2(x, y, i) * 0.4 - 0.2, hash2(x, y, i + 7) * 6, 0);
      cone.castShadow = true;
      grp.add(cone);
      if (stage === 3) {
        const f = new THREE.Mesh(TradeView.geo.bloom, fruit);
        f.position.set(x + ox + 0.05, 0.12 + h * (herb ? 1 : 0.5), y + oz);
        f.scale.setScalar(herb ? 0.9 : 1.5);
        grp.add(f);
      }
    }
    return grp;
  }

  /** Your own trap: a wooden box by a burrow or a looped snare in a bush; a catch shows its fur or feathers. */
  private buildTrap(x: number, y: number, kind: string, state: number): THREE.Group {
    const grp = new THREE.Group();
    const wood = TradeView.cm(0x8a6a3a);
    if (kind === 'burrow') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.42), wood);
      box.position.set(x - 0.28, 0.12, y + 0.3);
      box.rotation.y = 0.4;
      if (state === 2) box.rotation.z = 0.5;
      box.castShadow = true;
      grp.add(box);
      if (state === 1) {
        const tuft = new THREE.Mesh(TradeView.geo.bloom, TradeView.cm(0xa89070));
        tuft.position.set(x - 0.28, 0.27, y + 0.3);
        tuft.scale.set(2.2, 1.2, 2.2);
        grp.add(tuft);
      }
    } else {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 4, 12), TradeView.cm(0xd8c090));
      loop.position.set(x + 0.1, 0.72, y + 0.1);
      loop.rotation.x = state === 2 ? 0.3 : Math.PI / 2;
      grp.add(loop);
      if (state === 1) {
        const bird = new THREE.Mesh(TradeView.geo.bloom, TradeView.cm(0xc8a050));
        bird.position.set(x + 0.1, 0.72, y + 0.1);
        bird.scale.set(1.6, 1.3, 2.2);
        grp.add(bird);
      }
    }
    return grp;
  }

  // ---------------------------------------------------------------- per frame

  /** Floors: only the player's own is drawn, at its height; restocked things are shown again. */
  update(dt: number, px: number, py: number, pz: number, floorOffset: (z: number) => number | null): void {
    for (const [z, g] of this.floors) {
      const off = z === pz ? floorOffset(z) : null;
      g.visible = off !== null;
      if (off !== null) g.position.y = off;
    }
    this.ownTimer -= dt;
    if (this.ownTimer <= 0) {
      this.ownTimer = 0.4;
      this.updateOwn();
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const w = this.game.world;
    for (const it of this.watched) {
      if (it.z !== pz || Math.abs(it.x - px) > 40 || Math.abs(it.y - py) > 40) continue;
      const full = w.getObj(it.x, it.y, it.z) === it.fullObj ? 1 : 0;
      if (full === it.last) continue;
      it.last = full;
      for (const p of this.parts.values()) {
        p.show(it.full, full === 1);
        if (it.empty >= 0) p.show(it.empty, full === 0);
      }
    }
  }

  private boats = new Map<number, { n: number; group: THREE.Group; t: number }>();

  /** A boat under a sailing player: a rowing skiff, a one-mast sloop or a two-mast cutter (bow along +z). */
  private static buildBoat(n: number): THREE.Group {
    const g = new THREE.Group();
    g.name = 'boat';
    const hullM = TradeView.m(`hull${n}`, n === 1 ? 0x7a5a32 : n === 2 ? 0x8a6a3e : 0x5a3e24);
    const trimM = TradeView.m(`trim${n}`, n === 3 ? 0xd0b070 : 0xa8804a);
    const deckM = TradeView.m('deck', 0xb89868);
    const len = n === 1 ? 1.3 : n === 2 ? 1.7 : 2.1;
    const wid = n === 1 ? 0.62 : n === 2 ? 0.78 : 0.86;
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    // hull: a box with a pointed bow, a deck inside and a trim along the gunwale
    add(new THREE.BoxGeometry(wid, 0.3, len * 0.72), hullM, 0, 0.05, -len * 0.08);
    const bow = new THREE.CylinderGeometry(0, wid * 0.72, len * 0.36, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.42, 1);
    add(bow, hullM, 0, 0.07, len * 0.46);
    add(new THREE.BoxGeometry(wid * 0.86, 0.04, len * 0.66), deckM, 0, 0.16, -len * 0.08);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.06, len * 0.74), trimM, s * wid * 0.5, 0.22, -len * 0.08);
    add(new THREE.BoxGeometry(wid, 0.08, 0.06), trimM, 0, 0.22, -len * 0.44);
    if (n === 1) {
      // two oars resting in their locks
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 5), TradeView.m('oar', 0x9a7a4a), s * (wid * 0.5 + 0.3), 0.18, -0.05, 0, 0, s * 1.25);
      return g;
    }
    const sailM = TradeView.m(`sail${n}`, n === 3 ? 0xf0e8d4 : 0xe0d4b4);
    const masts = n === 2 ? [0.15] : [0.45, -0.35];
    for (const mz of masts) {
      const h = n === 2 ? 1.9 : 2.2;
      add(new THREE.CylinderGeometry(0.035, 0.045, h, 6), TradeView.m('mast', 0x5a4028), 0, 0.2 + h / 2, mz);
      const sail = new THREE.BufferGeometry();
      // a triangular sail from the mast top to the boom
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.45, 0, 0, h + 0.1, 0, 0, 0.45, -(n === 2 ? 0.95 : 0.75)], 3));
      sail.computeVertexNormals();
      const mesh = add(sail, sailM, 0.02, 0, mz);
      (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      add(new THREE.CylinderGeometry(0.025, 0.025, n === 2 ? 0.95 : 0.75, 5).rotateX(Math.PI / 2), TradeView.m('mast', 0x5a4028), 0, 0.45, mz - (n === 2 ? 0.47 : 0.37));
    }
    if (n === 3) add(new THREE.BoxGeometry(0.5, 0.08, 0.04), TradeView.m(`trim${n}`, 0xd0b070), 0, 0.3, len * 0.62);
    return g;
  }

  /** The boat under a sailing player, rocking on the swell (all clients: `Player.boat`). */
  private adjustBoat(view: CreatureView, c: Player): void {
    let b = this.boats.get(c.id);
    if (!c.boat || c.dead) {
      if (b) {
        b.group.removeFromParent();
        this.boats.delete(c.id);
      }
      return;
    }
    if (!b || b.n !== c.boat || b.group.parent !== view.rig.root) {
      b?.group.removeFromParent();
      b = { n: c.boat, group: TradeView.buildBoat(c.boat), t: Math.random() * 6 };
      view.rig.root.add(b.group);
      this.boats.set(c.id, b);
    }
    b.t += 1 / 60;
    b.group.position.y = -0.04 + Math.sin(b.t * 1.7) * 0.025;
    b.group.rotation.z = Math.sin(b.t * 1.3) * 0.04;
    b.group.rotation.x = Math.sin(b.t * 1.1 + 1) * 0.025;
    // stand (or sit) on the deck
    view.rig.body.position.y += 0.08;
  }

  /** Climbers go up and over the cliff, sailors ride in their boat (after CreatureView.update); the same on mirror games. */
  adjustCreature(view: CreatureView): void {
    const c = view.creature;
    if (c instanceof Player && (c.boat || this.boats.has(c.id))) this.adjustBoat(view, c);
    if (!(c instanceof Player) || !c.moving) return;
    const a = currentActivity(this.game, c.id);
    if (!a || a.kind !== 'climb') return;
    const l = this.game.world.trades;
    // the activity points at the far end: find the shortcut, then how far along it the climber is
    const ob = l?.obstacles.find((o) => o.kind === 'climb' && o.z === c.z && ((o.bx === a.x && o.by === a.y) || (o.ax === a.x && o.ay === a.y)));
    if (!ob) return;
    const start = ob.bx === a.x && ob.by === a.y ? { x: ob.ax, y: ob.ay } : { x: ob.bx, y: ob.by };
    const vp = c.visualPos();
    const t = Math.max(Math.abs(vp.x - start.x), Math.abs(vp.y - start.y)) / (ob.len + 1);
    view.rig.root.position.y += Math.sin(Math.PI * Math.max(0, Math.min(1, t))) * 1.55;
  }
}
