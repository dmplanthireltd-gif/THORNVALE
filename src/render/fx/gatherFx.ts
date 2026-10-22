import * as THREE from 'three';

/**
 * Small pooled scene pieces for the trade-skill animations (skillAnim.ts):
 * fishing lines with bobbers, hit flashes that always face the camera,
 * and the little flame of a tinderbox. Everything is
 * built once and reused; nothing is allocated per frame.
 */
const LINE_POINTS = 12;
const MAX_FLASH = 10;

export interface FishLine {
  line: THREE.Line;
  bobber: THREE.Group;
  pos: Float32Array;
  busy: boolean;
}

export interface Prop {
  obj: THREE.Object3D;
  busy: boolean;
}

interface Flash {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  max: number;
  size: number;
}

/** A 16×16 four-point star, crisp like the pixel-art effects. */
function starTexture(): THREE.DataTexture {
  const n = 16;
  const d = new Uint8Array(n * n * 4);
  const c = (n - 1) / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.abs(x - c), dy = Math.abs(y - c);
      // a bright core plus two thin rays
      const core = Math.max(0, 1 - Math.hypot(dx, dy) / 3.2);
      const ray = Math.max(0, 1 - Math.min(dx, dy) / 0.9) * Math.max(0, 1 - Math.max(dx, dy) / 7.5);
      const a = Math.min(1, core + ray);
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export class GatherFx {
  private lines: FishLine[] = [];
  private flames: Prop[] = [];
  private flashes: Flash[] = [];
  private nextFlash = 0;
  private time = 0;

  // shared by every pooled piece
  private lineMat = new THREE.LineBasicMaterial({ color: 0xeae6d8, transparent: true, opacity: 0.85 });
  private bobGeo = new THREE.IcosahedronGeometry(0.055, 0);
  private bobTop = new THREE.MeshBasicMaterial({ color: 0xd8342a });
  private bobLow = new THREE.MeshBasicMaterial({ color: 0xf2eee0 });
  private flameGeo = new THREE.ConeGeometry(0.07, 0.2, 5);
  private flameMat = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  private flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  private star = starTexture();

  constructor(private readonly scene: THREE.Scene) {}

  // ---------------------------------------------------------------- fishing line + bobber

  acquireLine(): FishLine {
    let l = this.lines.find((x) => !x.busy);
    if (!l) {
      const pos = new Float32Array(LINE_POINTS * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(geo, this.lineMat);
      line.frustumCulled = false;
      const bobber = new THREE.Group();
      const top = new THREE.Mesh(this.bobGeo, this.bobTop);
      top.scale.set(1, 0.7, 1);
      top.position.y = 0.025;
      const low = new THREE.Mesh(this.bobGeo, this.bobLow);
      low.scale.set(0.9, 0.55, 0.9);
      low.position.y = -0.012;
      bobber.add(top, low);
      this.scene.add(line, bobber);
      l = { line, bobber, pos, busy: false };
      this.lines.push(l);
    }
    l.busy = true;
    l.line.visible = false;
    l.bobber.visible = false;
    return l;
  }

  /** Draws the line from the rod tip to the bobber as a sagging curve (sag in world units). */
  setLine(l: FishLine, tip: THREE.Vector3, end: THREE.Vector3, sag: number): void {
    const p = l.pos;
    const mx = (tip.x + end.x) / 2, my = Math.min(tip.y, end.y) + (Math.max(tip.y, end.y) - Math.min(tip.y, end.y)) * 0.35 - sag, mz = (tip.z + end.z) / 2;
    for (let i = 0; i < LINE_POINTS; i++) {
      const t = i / (LINE_POINTS - 1);
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      p[i * 3] = a * tip.x + b * mx + c * end.x;
      p[i * 3 + 1] = a * tip.y + b * my + c * end.y;
      p[i * 3 + 2] = a * tip.z + b * mz + c * end.z;
    }
    (l.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    l.line.visible = true;
  }

  releaseLine(l: FishLine): void {
    l.busy = false;
    l.line.visible = false;
    l.bobber.visible = false;
  }

  // ---------------------------------------------------------------- tinderbox flame

  private acquire(pool: Prop[], make: () => THREE.Object3D): Prop {
    let p = pool.find((x) => !x.busy);
    if (!p) {
      p = { obj: make(), busy: false };
      this.scene.add(p.obj);
      pool.push(p);
    }
    p.busy = true;
    p.obj.visible = true;
    return p;
  }

  acquireFlame(): Prop {
    return this.acquire(this.flames, () => {
      const g = new THREE.Group();
      const outer = new THREE.Mesh(this.flameGeo, this.flameMat);
      outer.position.y = 0.1;
      const core = new THREE.Mesh(this.flameGeo, this.flameCoreMat);
      core.scale.setScalar(0.55);
      core.position.y = 0.06;
      g.add(outer, core);
      return g;
    });
  }

  release(p: Prop): void {
    p.busy = false;
    p.obj.visible = false;
  }

  /** Flickers a flame prop at a size 0..1. */
  flicker(p: Prop, size: number, seed: number): void {
    const f = 0.85 + Math.sin(this.time * 23 + seed) * 0.1 + Math.sin(this.time * 37 + seed * 2) * 0.06;
    p.obj.scale.set(size * (0.9 + f * 0.1), Math.max(0.001, size * f), size * (0.9 + f * 0.1));
    p.obj.visible = size > 0.02;
  }

  // ---------------------------------------------------------------- hit flash

  /** A short star-shaped flash that always faces the camera (strikes on rock and metal). */
  flash(x: number, y: number, z: number, color: number, size = 0.5, dur = 0.16): void {
    let f = this.flashes[this.nextFlash];
    if (!f) {
      const mat = new THREE.SpriteMaterial({ map: this.star, color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      f = { sprite, mat, life: 0, max: 0, size: 0 };
      this.flashes[this.nextFlash] = f;
    }
    this.nextFlash = (this.nextFlash + 1) % MAX_FLASH;
    f.life = 0;
    f.max = dur;
    f.size = size;
    f.mat.color.setHex(color);
    f.mat.rotation = Math.random() * 0.6 - 0.3;
    f.sprite.position.set(x, y, z);
    f.sprite.visible = true;
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.flashes) {
      if (!f || !f.sprite.visible) continue;
      f.life += dt;
      const k = f.life / f.max;
      if (k >= 1) {
        f.sprite.visible = false;
        continue;
      }
      // pops big, then shrinks and fades
      const s = f.size * (k < 0.25 ? 0.6 + k * 1.6 : 1 - (k - 0.25) * 0.8);
      f.sprite.scale.set(s, s, 1);
      f.mat.opacity = 1 - k * k;
    }
  }
}
