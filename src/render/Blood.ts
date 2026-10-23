import * as THREE from 'three';
import { PAINTED } from './style';

/**
 * Blood that stays on the ground: flat splats under whoever is hit, a pool
 * where something dies. Splats slowly dry (darken) and fade away after a few
 * minutes. Drawn with a few instanced meshes, so hundreds of splats are cheap.
 * Every splat lives in a fixed pool (no allocations while playing).
 *
 * Painted style (render/style.ts): smooth 128 px wet-looking stains (dark rim, glossy
 * specks), death pools that spread out over a few seconds, and a streak variant for
 * spatter flung from a blow (creatureGore.ts).
 */
const VARIANTS = PAINTED ? 5 : 4;
/** The pool variant (the big stain left by a death). */
const POOL = VARIANTS - 1;
/** Painted: the streak variant (spatter that hit the ground at an angle). */
const STREAK = PAINTED ? VARIANTS - 2 : -1;
const PER_VARIANT = 160;
const LIFE = 180; // seconds a splat stays
const DRY = 45; // seconds until it has dried to its darkest
/** Painted: seconds a death pool takes to spread to its full size. */
const SPREAD = 3.2;

interface Splat {
  on: boolean;
  x: number;
  y: number; // world tile y (scene z)
  z: number; // floor
  rot: number;
  size: number;
  r: number; g: number; b: number;
  age: number;
  lift: number;
  /** Stretch along its rotation (streaks); 1 = round. */
  len: number;
}

function splatTexture(seed: number, pool: boolean, streak = false): THREE.CanvasTexture {
  const S = PAINTED ? 128 : 48;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const blobs: [number, number, number][] = [];
  const blob = (x: number, y: number, rad: number) => blobs.push([x, y, rad]);
  if (streak) {
    // a tear-drop streak with droplets thrown ahead of it
    for (let i = 0; i < 7; i++) blob(S * (0.22 + i * 0.08), S / 2 + (rnd() - 0.5) * S * 0.04, S * (0.12 - i * 0.012));
    for (let i = 0; i < 9; i++) blob(S * (0.7 + rnd() * 0.26), S / 2 + (rnd() - 0.5) * S * 0.16, 1 + rnd() * S * 0.025);
  } else {
    // main stain made of overlapping blobs
    const n = pool ? 9 : 5;
    for (let i = 0; i < n; i++) blob(S / 2 + (rnd() - 0.5) * S * 0.32, S / 2 + (rnd() - 0.5) * S * 0.32, S * (pool ? 0.2 : 0.13) + rnd() * S * 0.08);
    // splashes and droplets flung outwards
    const drops = pool ? 8 : 12;
    for (let i = 0; i < drops; i++) {
      const a = rnd() * Math.PI * 2;
      const d = S * (0.22 + rnd() * 0.24);
      blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, (1 + rnd() * 2.6) * S / 48);
    }
  }
  const draw = (grow: number, style: string) => {
    g.fillStyle = style;
    for (const [x, y, rad] of blobs) {
      g.beginPath();
      g.arc(x, y, Math.max(0.5, rad + grow), 0, Math.PI * 2);
      g.fill();
    }
  };
  if (!PAINTED) draw(0, '#fff');
  else {
    // wet blood: a dark rim, a lighter body, a few glossy specks where light catches it
    draw(0, '#8a8a8a');
    draw(-S * 0.025, '#d8d8d8');
    draw(-S * 0.05, '#c4c4c4');
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < (pool ? 6 : 3); i++) {
      const [x, y, rad] = blobs[i % blobs.length];
      g.beginPath();
      g.ellipse(x - rad * 0.3, y - rad * 0.3, Math.max(0.6, rad * 0.22), Math.max(0.4, rad * 0.1), -0.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = PAINTED ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = PAINTED ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = PAINTED;
  return t;
}

const dummy = new THREE.Object3D();

export class Blood {
  private splats: Splat[][] = [];
  private next: number[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private timer = 0;
  private dirty = false;
  private tint = new THREE.Color();
  private hex = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly floorOffset: (z: number) => number | null) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let v = 0; v < VARIANTS; v++) {
      const mat = new THREE.MeshBasicMaterial({
        map: splatTexture(v + 1, v === POOL, v === STREAK),
        transparent: true,
        alphaTest: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const m = new THREE.InstancedMesh(geo, mat, PER_VARIANT);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 1;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_VARIANT * 3), 3);
      scene.add(m);
      this.meshes.push(m);
      const list: Splat[] = [];
      for (let i = 0; i < PER_VARIANT; i++) list.push({ on: false, x: 0, y: 0, z: 0, rot: 0, size: 0, r: 0, g: 0, b: 0, age: 0, lift: 0, len: 1 });
      this.splats.push(list);
      this.next.push(0);
    }
  }

  /** A splat under (x, y) on floor z. `pool` = the big stain left by a death. */
  add(x: number, y: number, z: number, color: number, size: number, pool = false): void {
    const variant = pool ? POOL : Math.floor(Math.random() * (STREAK >= 0 ? VARIANTS - 2 : VARIANTS - 1));
    this.put(variant, x + (Math.random() - 0.5) * (pool ? 0.1 : 0.5), y + (Math.random() - 0.5) * (pool ? 0.1 : 0.5), z, color, size, Math.random() * Math.PI * 2, 1);
  }

  /**
   * Painted style: spatter landing at exactly (x, y) — a streak pointing along `dir`
   * (radians, scene XZ) when `streak`, else a small round drop. Classic falls back to add.
   */
  spatter(x: number, y: number, z: number, color: number, size: number, dir: number, streak: boolean): void {
    if (!PAINTED) { this.add(x, y, z, color, size); return; }
    if (streak) this.put(STREAK, x, y, z, color, size, -dir, 1.5);
    else this.put(Math.floor(Math.random() * (VARIANTS - 2)), x, y, z, color, size, Math.random() * Math.PI * 2, 1);
  }

  private put(variant: number, x: number, y: number, z: number, color: number, size: number, rot: number, len: number): void {
    // the oldest splat of this variant makes room (a ring over the fixed pool)
    const list = this.splats[variant];
    const s = list[this.next[variant]];
    this.next[variant] = (this.next[variant] + 1) % PER_VARIANT;
    this.hex.setHex(color);
    s.on = true;
    s.x = x; s.y = y; s.z = z;
    s.rot = rot; s.size = size; s.len = len;
    s.r = this.hex.r; s.g = this.hex.g; s.b = this.hex.b;
    s.age = 0;
    s.lift = 0.012 + Math.random() * 0.006;
    this.dirty = true;
  }

  update(dt: number): void {
    let spreading = false;
    for (let v = 0; v < VARIANTS; v++) {
      for (const s of this.splats[v]) {
        if (!s.on) continue;
        s.age += dt;
        if (s.age >= LIFE) {
          s.on = false;
          this.dirty = true;
        } else if (PAINTED && v === POOL && s.age < SPREAD) spreading = true;
      }
    }
    this.timer -= dt;
    if (!this.dirty && !spreading && this.timer > 0) return;
    this.timer = 0.5;
    this.dirty = false;
    for (let v = 0; v < VARIANTS; v++) {
      const m = this.meshes[v];
      let i = 0;
      for (const s of this.splats[v]) {
        if (!s.on) continue;
        const off = this.floorOffset(s.z);
        if (off === null) continue;
        // dries darker, then shrinks away at the very end
        const dry = Math.min(1, s.age / DRY);
        const end = s.age > LIFE - 10 ? (LIFE - s.age) / 10 : 1;
        let grow = s.age < 0.25 ? 0.6 + s.age * 1.6 : 1;
        if (PAINTED && v === POOL) {
          // a death pool seeps outwards for a few seconds
          const k = Math.min(1, s.age / SPREAD);
          grow = 0.3 + 0.7 * (1 - (1 - k) * (1 - k));
        }
        const sc = s.size * (0.3 + 0.7 * end) * grow;
        dummy.position.set(s.x, off + s.lift, s.y);
        dummy.rotation.set(0, s.rot, 0);
        dummy.scale.set(sc * s.len, sc, sc);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        this.tint.setRGB(s.r, s.g, s.b).multiplyScalar(1 - 0.45 * dry);
        m.setColorAt(i, this.tint);
        i++;
      }
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Floors changed (or the view reset): recompute heights next frame. */
  refresh(): void {
    this.dirty = true;
  }
}
