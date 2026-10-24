import * as THREE from 'three';
import type { Game } from '../../game/Game';
import { hash2 } from '../../game/core/rng';
import { HERB_BY_ID } from '../../game/trades/herblore';
import { obstaclePath, type Obstacle } from '../../game/trades/layout';
import { STALLS } from '../../game/trades/thieving';
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
    const l = game.world.trades;
    if (!l) return;
    for (const o of l.obstacles) this.obstacle(o);
    l.stalls.forEach((s) => this.stall(s.x, s.y, s.z, STALLS[s.kind].awning, s.kind));
    l.boxes.forEach((b) => this.box(b.x, b.y, b.z));
    l.herbs.forEach((h) => this.herb(h.x, h.y, h.z, HERB_BY_ID[h.herb]?.color ?? '#6a9a3a'));
    for (const [key, part] of this.parts) {
      const z = Number(key.split('|')[0]);
      let g = this.floors.get(z);
      if (!g) {
        g = new THREE.Group();
        g.name = `trades:${z}`;
        this.floors.set(z, g);
        scene.add(g);
      }
      part.build(g);
    }
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

  // ---------------------------------------------------------------- per frame

  /** Floors: only the player's own is drawn, at its height; restocked things are shown again. */
  update(dt: number, px: number, py: number, pz: number, floorOffset: (z: number) => number | null): void {
    for (const [z, g] of this.floors) {
      const off = z === pz ? floorOffset(z) : null;
      g.visible = off !== null;
      if (off !== null) g.position.y = off;
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

  /** Climbers go up and over the cliff (after CreatureView.update); works the same on mirror games. */
  adjustCreature(view: CreatureView): void {
    const c = view.creature;
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
