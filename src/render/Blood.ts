import * as THREE from 'three';

/**
 * Blood that stays on the ground: flat splats under whoever is hit, a pool
 * where something dies. Splats slowly dry (darken) and fade away after a few
 * minutes. Drawn with a few instanced meshes, so hundreds of splats are cheap.
 */
const VARIANTS = 4;
const PER_VARIANT = 160;
const LIFE = 180; // seconds a splat stays
const DRY = 45; // seconds until it has dried to its darkest

interface Splat {
  x: number;
  y: number; // world tile y (scene z)
  z: number; // floor
  rot: number;
  size: number;
  color: THREE.Color;
  age: number;
  variant: number;
  lift: number;
}

function splatTexture(seed: number, pool: boolean): THREE.CanvasTexture {
  const S = 48;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#fff';
  const blob = (x: number, y: number, rad: number) => {
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  };
  // main stain made of overlapping blobs
  const n = pool ? 9 : 5;
  for (let i = 0; i < n; i++) blob(S / 2 + (rnd() - 0.5) * S * 0.32, S / 2 + (rnd() - 0.5) * S * 0.32, S * (pool ? 0.2 : 0.13) + rnd() * S * 0.08);
  // splashes and droplets flung outwards
  const drops = pool ? 8 : 12;
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2;
    const d = S * (0.22 + rnd() * 0.24);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1 + rnd() * 2.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

const dummy = new THREE.Object3D();

export class Blood {
  private splats: Splat[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private timer = 0;
  private dirty = false;
  private tint = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly floorOffset: (z: number) => number | null) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let v = 0; v < VARIANTS; v++) {
      const mat = new THREE.MeshBasicMaterial({
        map: splatTexture(v + 1, v === VARIANTS - 1),
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
    }
  }

  /** A splat under (x, y) on floor z. `pool` = the big stain left by a death. */
  add(x: number, y: number, z: number, color: number, size: number, pool = false): void {
    const variant = pool ? VARIANTS - 1 : Math.floor(Math.random() * (VARIANTS - 1));
    const same = this.splats.filter((s) => s.variant === variant);
    if (same.length >= PER_VARIANT) this.splats.splice(this.splats.indexOf(same[0]), 1);
    this.splats.push({
      x: x + (Math.random() - 0.5) * (pool ? 0.1 : 0.5),
      y: y + (Math.random() - 0.5) * (pool ? 0.1 : 0.5),
      z, rot: Math.random() * Math.PI * 2, size, color: new THREE.Color(color), age: 0, variant,
      lift: 0.012 + Math.random() * 0.006,
    });
    this.dirty = true;
  }

  update(dt: number): void {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      s.age += dt;
      if (s.age >= LIFE) {
        this.splats.splice(i, 1);
        this.dirty = true;
      }
    }
    this.timer -= dt;
    if (!this.dirty && this.timer > 0) return;
    this.timer = 0.5;
    this.dirty = false;
    const counts = new Array(VARIANTS).fill(0);
    for (const s of this.splats) {
      const off = this.floorOffset(s.z);
      if (off === null) continue;
      const m = this.meshes[s.variant];
      const i = counts[s.variant]++;
      // dries darker, then shrinks away at the very end
      const dry = Math.min(1, s.age / DRY);
      const end = s.age > LIFE - 10 ? (LIFE - s.age) / 10 : 1;
      dummy.position.set(s.x, off + s.lift, s.y);
      dummy.rotation.set(0, s.rot, 0);
      dummy.scale.setScalar(s.size * (0.3 + 0.7 * end) * (s.age < 0.25 ? 0.6 + s.age * 1.6 : 1));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      this.tint.copy(s.color).multiplyScalar(1 - 0.45 * dry);
      m.setColorAt(i, this.tint);
    }
    this.meshes.forEach((m, v) => {
      m.count = counts[v];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  /** Floors changed (or the view reset): recompute heights next frame. */
  refresh(): void {
    this.dirty = true;
  }
}
