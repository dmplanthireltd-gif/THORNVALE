import * as THREE from 'three';
import type { Blood } from '../Blood';

/**
 * Painted style (render/style.ts), owner 2026-10-23 "grim and brutal for older players":
 * visceral monster hits and deaths — no dismemberment, nothing lingering for long.
 *
 * - A blow sprays droplets AWAY from the attacker; drops that land leave spatter on the
 *   ground (streaks when they land fast), a heavy blow leaves a little blood mist.
 * - A death bursts more widely, throws a few lumps that settle on the ground for a few
 *   seconds, and leaves a pool that seeps outwards under the corpse (Blood.ts).
 * - What comes out depends on the creature (`goreOf`): red blood, green ichor (spiders,
 *   insects, scorpions, the blight brood), black ooze (the undead), bone chips and grave
 *   dust (skeletons), sparks and embers (fire elementals), ice shards (golems), stone
 *   chips and sparks (the walking mountain), glowing goo (jellies). Under the sea blood
 *   becomes slow drifting clouds with bubbles.
 *
 * Cost: three instanced meshes (solid drops, additive glints, soft clouds) over one
 * fixed particle pool in typed arrays — nothing is allocated while playing.
 */

export type GoreKind = 'red' | 'ichor' | 'undead' | 'bone' | 'sparks' | 'frost' | 'stone' | 'jelly';

interface GoreLook {
  /** Droplet colour, ground stain colour. */
  drop: number;
  stain: number;
  /** Lumps thrown on death. */
  lump: number;
  /** Mist / dust colour. */
  mist: number;
  /** Glints (sparks, ice, goo) — 0 for none. */
  glint: number;
  /** Leaves stains on the ground. */
  stains: boolean;
  /** Drops are thick (slower, bigger). */
  thick: number;
}

const LOOKS: Record<GoreKind, GoreLook> = {
  red: { drop: 0x7c0c08, stain: 0x5e0a06, lump: 0x4a0c0a, mist: 0x5a0a08, glint: 0, stains: true, thick: 1 },
  ichor: { drop: 0x8aa82a, stain: 0x4e6a16, lump: 0x2a2a18, mist: 0x6a8a2a, glint: 0, stains: true, thick: 1.25 },
  undead: { drop: 0x1c1612, stain: 0x18140e, lump: 0x2a2620, mist: 0x5a5448, glint: 0, stains: true, thick: 1.35 },
  bone: { drop: 0xd2c6a2, stain: 0x4a4236, lump: 0xc4b896, mist: 0x8a7e66, glint: 0, stains: false, thick: 1 },
  sparks: { drop: 0x2a2018, stain: 0x221c18, lump: 0x3a2a1a, mist: 0x4a3a2a, glint: 0xffa040, stains: false, thick: 1 },
  frost: { drop: 0xcfe6f6, stain: 0x8aa8bc, lump: 0xa8cce4, mist: 0xd8eeff, glint: 0xbfe8ff, stains: false, thick: 1 },
  stone: { drop: 0x6a6660, stain: 0x3a3632, lump: 0x5a5650, mist: 0x7a7468, glint: 0xffd080, stains: false, thick: 1 },
  jelly: { drop: 0x4ab0d0, stain: 0x2a5a6a, lump: 0x3a7a8a, mist: 0x4a9ab0, glint: 0x6ae0ff, stains: true, thick: 1.4 },
};

const GORE: Record<string, GoreKind> = {
  tarantula: 'ichor', crystal_spider: 'frost', scorpion: 'ichor', scarab: 'ichor', dread_weaver: 'ichor', gravesilk_colossus: 'ichor',
  wb_blight_mother: 'ichor', raid_swarm_queen: 'ichor', ironshell_crab: 'ichor', hydra: 'ichor', boss_mire_hydra: 'ichor',
  ghoul: 'undead', mummy: 'undead', raid_grave_warden: 'undead', boss_sand_king: 'undead',
  skeleton: 'bone', boss_bonebound: 'bone',
  fire_elemental: 'sparks', ice_golem: 'frost', wb_mountain: 'stone',
  lantern_jelly: 'jelly', blight_jelly: 'jelly',
};
/** Kind-specific colours on top of the family look. */
const TINT: Record<string, Partial<GoreLook>> = {
  hydra: { drop: 0x4a7a2a, stain: 0x2e4a1a }, boss_mire_hydra: { drop: 0x3a6a3a, stain: 0x24401e },
  gravesilk_colossus: { drop: 0x8a7aa0, stain: 0x4a3a5a }, wb_blight_mother: { drop: 0x9ac83a, stain: 0x5a7a1a },
  blight_jelly: { drop: 0x8ad04a, stain: 0x4a6a2a, glint: 0xa0ff50, lump: 0x5a8a3a, mist: 0x6a9a3a },
  ironshell_crab: { drop: 0x6a8aa0, stain: 0x3a4a5a },
  boss_ashen_sovereign: { drop: 0x5a0806, glint: 0xff6a20 }, demon: { drop: 0x5a0806, glint: 0xff6a20 },
  boss_ember_matriarch: { glint: 0xff8a20 }, raid_swarm_queen: { drop: 0xb0a030, stain: 0x6a5a18 },
};

const lookCache = new Map<string, GoreLook>();
function lookOf(kind: string): GoreLook {
  let l = lookCache.get(kind);
  if (!l) {
    l = { ...LOOKS[goreOf(kind)], ...(TINT[kind] ?? {}) };
    lookCache.set(kind, l);
  }
  return l;
}

/** What a creature kind bleeds. */
export function goreOf(kind: string): GoreKind {
  return GORE[kind] ?? 'red';
}

/** The ground stain colour of a creature kind (for other bleeding effects). */
export function goreStain(kind: string): number {
  return lookOf(kind).stain;
}

const CAP = 900;
const DROP = 0;
const GLINT = 1;
const CLOUD = 2;
const F_SPLAT = 1;
const F_STRETCH = 2;
const F_REST = 4;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
/** The view tilt (keep in step with CameraController.CAMERA_TILT_DEG): clouds face the camera. */
const TILT = THREE.MathUtils.degToRad(32);
const R = Math.random;

export class CreatureGore {
  private n = 0;
  private readonly px = new Float32Array(CAP); private readonly py = new Float32Array(CAP); private readonly pz = new Float32Array(CAP);
  private readonly vx = new Float32Array(CAP); private readonly vy = new Float32Array(CAP); private readonly vz = new Float32Array(CAP);
  private readonly age = new Float32Array(CAP); private readonly life = new Float32Array(CAP);
  private readonly size = new Float32Array(CAP); private readonly grow = new Float32Array(CAP);
  private readonly floor = new Float32Array(CAP); private readonly grav = new Float32Array(CAP); private readonly drag = new Float32Array(CAP);
  private readonly col = new Float32Array(CAP * 3); private readonly stain = new Float32Array(CAP);
  private readonly fz = new Int16Array(CAP); private readonly mesh = new Uint8Array(CAP); private readonly flags = new Uint8Array(CAP);
  private readonly meshes: THREE.InstancedMesh[];

  constructor(scene: THREE.Scene, private readonly blood: Blood) {
    const drop = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), CAP);
    const glint = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), CAP);
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-(Math.PI / 2 - TILT));
    const cloud = new THREE.InstancedMesh(quad, new THREE.MeshBasicMaterial({ color: 0xffffff, map: softDot(), transparent: true, opacity: 0.42, depthWrite: false }), CAP);
    this.meshes = [drop, glint, cloud];
    this.meshes.forEach((m, i) => {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = i === DROP ? 3 : 8;
      scene.add(m);
    });
  }

  private spawn(mesh: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number,
    floor: number, fz: number, flags: number, grav = 9, drag = 0.4, grow = 0, stain = 0): void {
    if (this.n >= CAP) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.floor[i] = floor; this.fz[i] = fz; this.mesh[i] = mesh; this.flags[i] = flags;
    this.grav[i] = grav; this.drag[i] = drag; this.stain[i] = stain;
    _c.setHex(color);
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
  }

  /**
   * A creature was hit. `at` = its chest, `fromX/fromZ` = where the blow came from
   * (NaN when unknown), `floorY` = its floor height, `fz` = its floor, `scale` ≈ its size.
   */
  hit(kind: string, at: THREE.Vector3, fromX: number, fromZ: number, amount: number, floorY: number, fz: number, scale: number, under: boolean): void {
    const L = lookOf(kind);
    const g = goreOf(kind);
    const p = Math.min(1.6, 0.35 + amount / 90);
    let dx = at.x - fromX, dz = at.z - fromZ;
    const dl = Math.hypot(dx, dz);
    if (!(dl > 0.01)) { const a = R() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= dl; dz /= dl; }
    const sc = Math.min(1.8, Math.max(0.8, scale));
    if (under) {
      // under the sea: a cloud that spreads and drifts up, and a few bubbles
      const n = 2 + Math.min(4, Math.floor(amount / 25));
      for (let i = 0; i < n; i++) this.spawn(CLOUD, at.x + (R() - 0.5) * 0.2, at.y + (R() - 0.5) * 0.2, at.z + (R() - 0.5) * 0.2, dx * 0.4 + (R() - 0.5) * 0.3, 0.15 + R() * 0.2, dz * 0.4 + (R() - 0.5) * 0.3, 1.8 + R(), 0.4 * sc, L.drop, -99, fz, 0, 0, 1.2, 2.8);
      for (let i = 0; i < 4; i++) this.spawn(GLINT, at.x + (R() - 0.5) * 0.3, at.y, at.z + (R() - 0.5) * 0.3, (R() - 0.5) * 0.2, 0.9 + R() * 0.6, (R() - 0.5) * 0.2, 1.2, 0.025, 0x8ac8e0, -99, fz, 0, -0.5, 0.2);
      return;
    }
    const thick = L.thick;
    const n = (g === 'red' || g === 'ichor' || g === 'undead' || g === 'jelly' ? 9 : 6) + Math.min(18, Math.floor(amount / 6));
    for (let i = 0; i < n; i++) {
      const sp = (0.8 + 1.3 * p) * (0.45 + R() * 0.9) / Math.sqrt(thick);
      const spread = 0.75;
      const vx = dx * sp + (R() - 0.5) * spread * sp;
      const vz = dz * sp + (R() - 0.5) * spread * sp;
      const vy = (0.6 + R() * 1.6) * (0.7 + p * 0.4);
      const big = R() < 0.18;
      const s = (big ? 0.045 : 0.022 + R() * 0.02) * thick * Math.sqrt(sc);
      if (g === 'sparks' || g === 'frost' || g === 'stone' || g === 'jelly') {
        if (L.glint && i % 2 === 0) this.spawn(GLINT, at.x, at.y, at.z, vx * 1.3, vy * 1.2, vz * 1.3, 0.35 + R() * 0.3, s * 0.8, L.glint, floorY, fz, F_STRETCH, 7, 0.8);
        else this.spawn(DROP, at.x, at.y, at.z, vx, vy, vz, 1.4 + R(), s * (g === 'jelly' ? 1 : 1.3), L.drop, floorY, fz, g === 'jelly' ? F_SPLAT | F_STRETCH : F_REST, 10, 0.3, 0, L.stain);
      } else if (g === 'bone') {
        this.spawn(DROP, at.x, at.y, at.z, vx, vy, vz, 1.8 + R(), s * 1.2, i % 3 ? L.drop : L.mist, floorY, fz, F_REST, 10, 0.3);
      } else {
        this.spawn(DROP, at.x, at.y, at.z, vx, vy, vz, 1.5, s, L.drop, floorY, fz, F_SPLAT | F_STRETCH, 9.5, 0.35, 0, L.stain);
      }
    }
    // a little mist on heavy blows (dust from the dry dead)
    if (amount > 35 || g === 'bone' || g === 'undead' || g === 'stone') {
      const k = g === 'red' || g === 'ichor' ? 1 : 2;
      for (let i = 0; i < k; i++) this.spawn(CLOUD, at.x + dx * 0.15, at.y, at.z + dz * 0.15, dx * 0.35 + (R() - 0.5) * 0.2, 0.2 + R() * 0.15, dz * 0.35 + (R() - 0.5) * 0.2, 0.7 + R() * 0.4, 0.22 * sc, L.mist, -99, fz, 0, 0, 2, 1.6);
    }
    // a stain right under it
    if (L.stains && R() < Math.min(1, 0.45 + amount / 60)) this.blood.add(at.x, at.z, fz, L.stain, (0.6 + Math.min(0.6, amount / 90)) * Math.sqrt(sc));
  }

  /** A creature died: a wide burst, lumps that settle, mist, and a pool that spreads under it. */
  death(kind: string, at: THREE.Vector3, floorY: number, fz: number, scale: number, under: boolean): void {
    const L = lookOf(kind);
    const g = goreOf(kind);
    const sc = Math.min(3, Math.max(0.8, scale));
    const ss = Math.sqrt(sc);
    if (under) {
      for (let i = 0; i < 6; i++) this.spawn(CLOUD, at.x + (R() - 0.5) * 0.5, at.y + (R() - 0.5) * 0.4, at.z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.4, 0.1 + R() * 0.2, (R() - 0.5) * 0.4, 2.8 + R() * 1.5, 0.55 * ss, L.drop, -99, fz, 0, 0, 0.8, 3.2);
      for (let i = 0; i < 14; i++) this.spawn(GLINT, at.x + (R() - 0.5) * 0.6, at.y - 0.2 + R() * 0.4, at.z + (R() - 0.5) * 0.6, (R() - 0.5) * 0.3, 0.8 + R() * 0.9, (R() - 0.5) * 0.3, 1.6, 0.03, 0x8ac8e0, -99, fz, 0, -0.4, 0.2);
      if (L.stains) this.blood.add(at.x, at.z, fz, L.stain, 1.3 * ss, true);
      return;
    }
    const n = Math.round((g === 'bone' || g === 'stone' ? 26 : 38) * Math.min(1.6, ss));
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const sp = (0.9 + R() * 1.9) * Math.min(1.4, ss) / Math.sqrt(L.thick);
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = 1 + R() * 2.4;
      const s = (0.024 + R() * 0.03) * L.thick * ss;
      if (L.glint && (g === 'sparks' || g === 'frost' || g === 'stone' || g === 'jelly') && i % 2 === 0) this.spawn(GLINT, at.x, at.y, at.z, vx * 1.3, vy * 1.4, vz * 1.3, 0.5 + R() * 0.4, s * 0.8, L.glint, floorY, fz, F_STRETCH, 6, 0.7);
      else if (g === 'red' || g === 'ichor' || g === 'undead' || g === 'jelly') this.spawn(DROP, at.x, at.y, at.z, vx, vy, vz, 1.6, s, L.drop, floorY, fz, F_SPLAT | F_STRETCH, 9.5, 0.3, 0, L.stain);
      else this.spawn(DROP, at.x, at.y, at.z, vx * 0.8, vy, vz * 0.8, 2.5 + R() * 2, s * 1.4, i % 3 ? L.drop : L.lump, floorY, fz, F_REST, 10, 0.3);
    }
    // a few lumps that settle by the corpse for a while (gore, never limbs)
    const lumps = g === 'red' || g === 'ichor' || g === 'undead' ? 3 + Math.floor(R() * 3) : 2;
    for (let i = 0; i < lumps; i++) {
      const a = R() * Math.PI * 2;
      const sp = 0.6 + R() * 1.2;
      this.spawn(DROP, at.x, at.y, at.z, Math.cos(a) * sp, 1.2 + R() * 1.2, Math.sin(a) * sp, 7 + R() * 4, (0.05 + R() * 0.035) * ss, L.lump, floorY, fz, F_REST, 10, 0.2);
    }
    for (let i = 0; i < 3; i++) this.spawn(CLOUD, at.x + (R() - 0.5) * 0.3, at.y - 0.1, at.z + (R() - 0.5) * 0.3, (R() - 0.5) * 0.5, 0.15 + R() * 0.2, (R() - 0.5) * 0.5, 0.9 + R() * 0.5, 0.3 * ss, L.mist, -99, fz, 0, 0, 1.8, 1.8);
    if (L.stains) {
      this.blood.add(at.x, at.z, fz, L.stain, 1.55 * ss, true);
      for (let i = 0; i < 4; i++) this.blood.add(at.x + (R() - 0.5) * 1.3 * ss, at.z + (R() - 0.5) * 1.3 * ss, fz, L.stain, 0.6 * ss);
    } else if (g !== 'frost') this.blood.add(at.x, at.z, fz, L.stain, 1.1 * ss);
  }

  update(dt: number): void {
    let landed = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      const flags = this.flags[i];
      let dead = this.age[i] >= this.life[i];
      if (!dead) {
        const k = Math.max(0, 1 - this.drag[i] * dt);
        this.vx[i] *= k; this.vz[i] *= k; this.vy[i] = this.vy[i] * k - this.grav[i] * dt;
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        if (this.py[i] < this.floor[i]) {
          if (flags & F_SPLAT) {
            if (landed < 8 && this.stain[i] && Math.random() < 0.55) {
              const fast = Math.hypot(this.vx[i], this.vz[i]) > 1.6;
              this.blood.spatter(this.px[i], this.pz[i], this.fz[i], this.stain[i] | 0, this.size[i] * (fast ? 7 : 5.5), Math.atan2(this.vz[i], this.vx[i]), fast);
              landed++;
            }
            dead = true;
          } else if (flags & F_REST) {
            this.py[i] = this.floor[i] + this.size[i] * 0.5;
            this.vy[i] = Math.abs(this.vy[i]) > 1.2 ? -this.vy[i] * 0.25 : 0;
            this.vx[i] *= 0.4; this.vz[i] *= 0.4;
            this.grav[i] = this.vy[i] === 0 ? 0 : this.grav[i];
          } else dead = true;
        }
      }
      if (dead) this.kill(i);
    }
    const counts = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      const mi = this.mesh[i];
      const m = this.meshes[mi];
      const j = counts[mi]++;
      const t = this.age[i] / this.life[i];
      const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      const s = this.size[i] * (1 + this.grow[i] * t) * (mi === CLOUD ? Math.min(1, t * 6) * (0.5 + 0.5 * fade) : 0.35 + 0.65 * fade);
      _p.set(this.px[i], this.py[i], this.pz[i]);
      if (this.flags[i] & F_STRETCH) {
        _v.set(this.vx[i], this.vy[i], this.vz[i]);
        const sp = _v.length();
        if (sp > 0.01) _q.setFromUnitVectors(UP, _v.multiplyScalar(1 / sp));
        else _q.identity();
        _s.set(s, s * (1 + Math.min(3, sp * 0.45)), s);
      } else {
        _q.identity();
        _s.set(s, mi === DROP ? s * 0.7 : s, s);
      }
      _m.compose(_p, _q, _s);
      m.setMatrixAt(j, _m);
      // the additive glints and clouds dim as they fade; solid drops keep their colour
      const k = mi === DROP ? 1 : fade;
      _c.setRGB(this.col[i * 3] * k, this.col[i * 3 + 1] * k, this.col[i * 3 + 2] * k);
      m.setColorAt(j, _c);
    }
    this.meshes.forEach((m, mi) => {
      if (m.count === 0 && counts[mi] === 0) return;
      m.count = counts[mi];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  /** Removes particle i by moving the last one into its place. */
  private kill(i: number): void {
    const l = --this.n;
    if (i === l) return;
    this.px[i] = this.px[l]; this.py[i] = this.py[l]; this.pz[i] = this.pz[l];
    this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
    this.age[i] = this.age[l]; this.life[i] = this.life[l]; this.size[i] = this.size[l]; this.grow[i] = this.grow[l];
    this.floor[i] = this.floor[l]; this.fz[i] = this.fz[l]; this.mesh[i] = this.mesh[l]; this.flags[i] = this.flags[l];
    this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.stain[i] = this.stain[l];
    this.col[i * 3] = this.col[l * 3]; this.col[i * 3 + 1] = this.col[l * 3 + 1]; this.col[i * 3 + 2] = this.col[l * 3 + 2];
  }
}

let dot: THREE.Texture | null = null;
function softDot(): THREE.Texture {
  if (dot) return dot;
  const S = 32;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(1, Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5) / (S / 2));
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * (1 - d) * (1 - d));
  }
  dot = new THREE.DataTexture(data, S, S);
  dot.magFilter = THREE.LinearFilter;
  dot.minFilter = THREE.LinearFilter;
  dot.needsUpdate = true;
  return dot;
}
