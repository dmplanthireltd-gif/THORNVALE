import * as THREE from 'three';
import type { Game } from '../../game/Game';
import { hash2 } from '../../game/core/rng';
import { VINE_ROOT_SECONDS, type Trap } from '../../game/world/traps';
import { mat } from '../models/parts';
import { applyWind, WIND_BUSH } from './wind';

/**
 * Jungle traps on screen. An armed trap shows as a small tuft of leaves that
 * is just a little off from the jungle around it (darker, glossier, red-veined
 * for the snapping flower) — you can learn to spot them. When one springs,
 * vines whip up and coil round the tile for the hold, or a flower head bursts
 * open and snaps shut; then a withered tangle lies there until it grows back.
 * Animations come from a small pool; nothing is built per frame.
 */

const POOL = 6;

interface Anim {
  group: THREE.Group;
  vines: THREE.Mesh[];
  petals: THREE.Mesh[];
  head: THREE.Mesh;
  trap: Trap | null;
  t: number;
}

export class TrapView {
  private leaves: THREE.InstancedMesh;
  private buds: THREE.InstancedMesh;
  private spent: THREE.InstancedMesh;
  private readonly list: Trap[];
  /** Per trap: was armed last frame, and how far it has grown back (0–1). */
  private armed: Uint8Array;
  private grow: Float32Array;
  private pool: Anim[] = [];
  private budOf = new Map<number, number>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly offsetY: () => number | null;
  private lastY = Number.NaN;

  constructor(private readonly scene: THREE.Scene, private readonly game: Game, offsetY: () => number | null) {
    this.offsetY = offsetY;
    this.list = game.traps.list;
    const n = this.list.length;
    this.armed = new Uint8Array(n).fill(1);
    this.grow = new Float32Array(n).fill(1);
    // leaf blades: flat cones bent outwards; a slightly darker, waxier green than the jungle floor
    const blade = new THREE.ConeGeometry(0.09, 0.42, 3).translate(0, 0.21, 0).scale(1, 1, 0.35);
    const leafMat = mat(0x2d5a24);
    applyWind(leafMat, WIND_BUSH);
    this.leaves = new THREE.InstancedMesh(blade, leafMat, Math.max(1, n * 5));
    const budMat = mat(0x7a2a3a, { emissive: 0x1a0408 });
    this.buds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0).scale(1, 1.5, 1), budMat, Math.max(1, n));
    const spentMat = mat(0x5a4628);
    this.spent = new THREE.InstancedMesh(new THREE.TorusGeometry(0.26, 0.035, 3, 9).rotateX(Math.PI / 2), spentMat, Math.max(1, n));
    for (const im of [this.leaves, this.buds, this.spent]) {
      im.castShadow = false;
      im.receiveShadow = true;
      im.frustumCulled = false;
      scene.add(im);
    }
    let b = 0;
    for (const t of this.list) if (t.kind === 'flower') this.budOf.set(t.i, b++);
    this.buds.count = Math.max(0, b);
    for (const t of this.list) this.place(t, 1);
    this.leaves.instanceMatrix.needsUpdate = true;
    this.buds.instanceMatrix.needsUpdate = true;
    this.spent.instanceMatrix.needsUpdate = true;

    // the animation pool
    const vineMat = mat(0x6a9a34, { emissive: 0x0c1806 });
    const petalMat = mat(0xb03050, { emissive: 0x2a0610 });
    const headMat = mat(0x6a8a2a);
    const vineGeo = (k: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, a = k * 1.25 + u * 5.2;
        const r = 0.34 - u * 0.18;
        pts.push(new THREE.Vector3(Math.cos(a) * r, u * 1.25, Math.sin(a) * r));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.05, 4);
    };
    const petalGeo = new THREE.ConeGeometry(0.16, 0.5, 4).translate(0, 0.25, 0).scale(1, 1, 0.3);
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      const vines: THREE.Mesh[] = [];
      for (let k = 0; k < 5; k++) {
        const v = new THREE.Mesh(vineGeo(k), vineMat);
        v.castShadow = true;
        g.add(v);
        vines.push(v);
      }
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), headMat);
      g.add(head);
      const petals: THREE.Mesh[] = [];
      for (let k = 0; k < 5; k++) {
        const pg = new THREE.Group();
        const pm = new THREE.Mesh(petalGeo, petalMat);
        pg.add(pm);
        pg.rotation.y = (k / 5) * Math.PI * 2;
        head.add(pg);
        petals.push(pm);
      }
      g.visible = false;
      scene.add(g);
      this.pool.push({ group: g, vines, petals, head, trap: null, t: 0 });
    }
    game.events.on((e) => {
      if (e.type === 'trap') this.play(e.i);
    });
  }

  /** Sets one trap's leaves / bud / tangle for its growth (0 = just sprung, 1 = armed). */
  private place(t: Trap, g: number): void {
    const y = Number.isNaN(this.lastY) ? 0 : this.lastY;
    for (let k = 0; k < 5; k++) {
      const a = hash2(t.x, t.y, 70 + k) * Math.PI * 2;
      const lean = 0.5 + hash2(t.x, t.y, 80 + k) * 0.5;
      const sc = (0.75 + hash2(t.x, t.y, 90 + k) * 0.5) * g;
      this.q.setFromEuler(this.e.set(Math.cos(a) * lean, a, Math.sin(a) * lean));
      this.m.compose(this.v.set(t.x + Math.cos(a) * 0.08, y, t.y + Math.sin(a) * 0.08), this.q, this.s.set(sc, sc, sc));
      this.leaves.setMatrixAt(t.i * 5 + k, this.m);
    }
    const b = this.budOf.get(t.i);
    if (b !== undefined) {
      const sc = g;
      this.m.compose(this.v.set(t.x, y + 0.12 * g, t.y), this.q.identity(), this.s.set(sc, sc, sc));
      this.buds.setMatrixAt(b, this.m);
    }
    const sp = g >= 1 ? 0 : 1 - g;
    this.m.compose(this.v.set(t.x, y + 0.02, t.y), this.q.setFromEuler(this.e.set(0, hash2(t.x, t.y, 5) * 6, 0)), this.s.set(sp, sp * 2, sp));
    this.spent.setMatrixAt(t.i, this.m);
  }

  private play(i: number): void {
    const t = this.list[i];
    if (!t) return;
    const a = this.pool.find((p) => !p.trap) ?? this.pool.reduce((x, y) => (x.t > y.t ? x : y));
    a.trap = t;
    a.t = 0;
    a.group.visible = true;
    const vines = t.kind === 'vines';
    for (const v of a.vines) v.visible = vines;
    a.head.visible = !vines;
  }

  update(dt: number, px: number, py: number, pz: number): void {
    dt = Math.max(0, Math.min(dt, 0.25));
    const off = this.offsetY();
    const show = off !== null && pz >= 0;
    this.leaves.visible = this.buds.visible = this.spent.visible = show;
    if (off === null) return;
    let dirty = false;
    if (off !== this.lastY) {
      this.lastY = off;
      for (const t of this.list) this.place(t, this.grow[t.i]);
      dirty = true;
    }
    const traps = this.game.traps;
    for (const t of this.list) {
      if (Math.abs(t.x - px) > 26 || Math.abs(t.y - py) > 26) continue;
      const armed = traps.armed(t);
      const was = this.armed[t.i] === 1;
      let ch = false;
      if (armed !== was) {
        this.armed[t.i] = armed ? 1 : 0;
        if (!armed) this.grow[t.i] = 0;
        ch = true;
      }
      if (armed && this.grow[t.i] < 1) {
        this.grow[t.i] = Math.min(1, this.grow[t.i] + dt / 3);
        ch = true;
      }
      if (ch) {
        this.place(t, this.grow[t.i]);
        dirty = true;
      }
    }
    if (dirty) {
      this.leaves.instanceMatrix.needsUpdate = true;
      this.buds.instanceMatrix.needsUpdate = true;
      this.spent.instanceMatrix.needsUpdate = true;
    }
    for (const a of this.pool) {
      if (!a.trap) continue;
      a.t += dt;
      const t = a.trap;
      a.group.position.set(t.x, off, t.y);
      if (t.kind === 'vines') {
        // whip up (0.25 s), hold and writhe for the root, then sink back
        const hold = VINE_ROOT_SECONDS;
        const up = Math.min(1, a.t / 0.25);
        const down = a.t > hold ? Math.max(0, 1 - (a.t - hold) / 0.5) : 1;
        const k = up * down;
        a.vines.forEach((v, i) => {
          v.scale.set(1 + (1 - k) * 0.4, Math.max(0.001, k * (0.85 + 0.15 * Math.sin(a.t * 9 + i))), 1 + (1 - k) * 0.4);
          v.rotation.y = Math.sin(a.t * 3 + i * 1.3) * 0.25 * k;
        });
        if (a.t > hold + 0.5) this.stop(a);
      } else {
        // the head bursts up, the petals open wide and snap shut, then it wilts away
        const rise = Math.min(1, a.t / 0.12);
        const open = a.t < 0.22 ? Math.min(1, a.t / 0.12) : Math.max(0, 1 - (a.t - 0.22) / 0.07);
        const wilt = a.t > 1.2 ? Math.max(0, 1 - (a.t - 1.2) / 0.8) : 1;
        a.head.position.y = 0.55 * rise * wilt;
        a.head.scale.setScalar(Math.max(0.001, (0.6 + rise * 0.6) * wilt));
        for (const pm of a.petals) pm.parent!.rotation.x = 0.15 + open * 1.25;
        if (a.t > 2.0) this.stop(a);
      }
    }
  }

  private stop(a: Anim): void {
    a.trap = null;
    a.group.visible = false;
  }

  dispose(): void {
    for (const im of [this.leaves, this.buds, this.spent]) this.scene.remove(im);
    for (const a of this.pool) this.scene.remove(a.group);
  }
}
