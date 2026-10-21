import * as THREE from 'three';
import type { Effect } from '../game/core/events';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  gravity: number;
  color: THREE.Color;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  from: number;
  to: number;
  rise: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  delay: number;
}

interface Missile {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  trail: THREE.Color | null;
  orient: boolean;
  onHit: () => void;
}

const MAX_PARTICLES = 900;
const dummy = new THREE.Object3D();

/** Colours used by every effect type. */
export const EFFECT_COLOR: Record<Effect, number> = {
  physical: 0xd8d8d8, fire: 0xff7a1a, energy: 0xb07aff, ice: 0x8adcff, earth: 0x7ad04a, death: 0x8a3ab0, holy: 0xfff0a0,
  arrow: 0xc9b28a, bolt: 0x9aa0a8, spear: 0xc9d0da, star: 0xd8dde6, stone: 0x9a8a7a,
  heal: 0x7dff9a, haste: 0x9fe8ff, shield: 0x7fb2ff, light: 0xfff2b0, blood: 0xb3221b,
};

const ELEMENTAL = new Set<Effect>(['fire', 'energy', 'ice', 'earth', 'death', 'holy', 'physical']);

/** Pooled particles, rings, tile flashes, missiles and tile markers. */
export class Effects {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private pmesh: THREE.InstancedMesh;
  private rings: Ring[] = [];
  private flashes: Flash[] = [];
  private missiles: Missile[] = [];
  private flashGeo = new THREE.PlaneGeometry(0.96, 0.96);
  readonly targetMarker: THREE.Mesh;
  readonly hoverMarker: THREE.Mesh;
  readonly followMarker: THREE.Mesh;
  private clickMarker: THREE.Mesh;
  private clickLife = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pmesh = new THREE.InstancedMesh(geo, m, MAX_PARTICLES);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.count = 0;
    this.pmesh.frustumCulled = false;
    this.pmesh.setColorAt(0, new THREE.Color());
    this.group.add(this.pmesh);

    this.targetMarker = this.makeSquare(0xe8342b, 0.44, 0.5);
    this.followMarker = this.makeSquare(0x3ccf3c, 0.44, 0.5);
    this.hoverMarker = this.makeSquare(0xffffff, 0.46, 0.5, 0.35);
    this.clickMarker = this.makeSquare(0xffe27a, 0.3, 0.38);
    this.targetMarker.visible = false;
    this.followMarker.visible = false;
    this.clickMarker.visible = false;
  }

  /** Flat square outline lying on a tile. */
  private makeSquare(color: number, inner: number, outer: number, opacity = 0.95): THREE.Mesh {
    const s = new THREE.Shape();
    s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.lineTo(-outer, -outer);
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner); hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.lineTo(-inner, -inner);
    s.holes.push(hole);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.025;
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return mesh;
  }

  showClick(x: number, z: number): void {
    this.clickMarker.position.set(x, 0.03, z);
    this.clickMarker.visible = true;
    this.clickLife = 0.6;
  }

  private push(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  burst(pos: THREE.Vector3, color: number, count: number, speed = 2.2, gravity = 7, size = 0.07): void {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 0.9;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp, vy: up * sp, vz: Math.sin(a) * sp,
        life: 0, max: 0.45 + Math.random() * 0.35,
        size: size * (0.7 + Math.random() * 0.6), gravity, color: base.clone().multiplyScalar(0.75 + Math.random() * 0.5),
      });
    }
  }

  /** Rising sparkles (heal, level up, buffs). */
  sparkle(pos: THREE.Vector3, color: number, count: number, radius = 0.5): void {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.random();
      this.push({
        x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 0.4, z: pos.z + Math.sin(a) * r,
        vx: 0, vy: 1.2 + Math.random() * 1.4, vz: 0,
        life: 0, max: 0.7 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.05, gravity: 0,
        color: base.clone().multiplyScalar(0.8 + Math.random() * 0.5),
      });
    }
  }

  ring(pos: THREE.Vector3, color: number, from: number, to: number, dur: number, rise = 0): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.rings.push({ mesh, life: 0, max: dur, from, to, rise });
  }

  /** A glowing tile, the classic area-spell look. */
  tileFlash(x: number, y: number, z: number, effect: Effect, delay = 0): void {
    const color = EFFECT_COLOR[effect];
    const mesh = new THREE.Mesh(this.flashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.04, z);
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.flashes.push({ mesh, life: 0, max: 0.55, delay });
  }

  /** Spell or rune area: flashes every tile within the radius, centre first. */
  area(cx: number, cy: number, yOff: number, radius: number, effect: Effect): void {
    const color = EFFECT_COLOR[effect];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + radius) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        this.tileFlash(cx + dx, yOff, cy + dy, effect, d * 0.06);
        const pos = new THREE.Vector3(cx + dx, yOff + 0.15, cy + dy);
        if (effect === 'heal' || effect === 'haste' || effect === 'shield' || effect === 'light' || effect === 'holy') this.sparkle(pos, color, 5, 0.4);
        else this.burst(pos, color, 5, 1.6, effect === 'fire' ? -1 : 5, 0.08);
      }
    }
  }

  private missileObject(effect: Effect): { obj: THREE.Object3D; orient: boolean; spin: number; trail: THREE.Color | null } {
    const color = EFFECT_COLOR[effect];
    const basic = (c: number, opts: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: c, ...opts });
    switch (effect) {
      case 'arrow':
      case 'bolt': {
        const g = new THREE.Group();
        const len = effect === 'arrow' ? 0.55 : 0.4;
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), basic(0x8a6a3e)));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), basic(0xd8dde6));
        tip.rotation.x = Math.PI / 2;
        tip.position.z = len / 2 + 0.05;
        g.add(tip);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), basic(effect === 'arrow' ? 0xf0f0f0 : 0x6a5040));
        fl.position.z = -len / 2;
        g.add(fl);
        return { obj: g, orient: true, spin: 0, trail: null };
      }
      case 'spear': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.0), basic(0x7a5530)));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), basic(0xc9d0da));
        tip.rotation.x = Math.PI / 2;
        tip.position.z = 0.58;
        g.add(tip);
        return { obj: g, orient: true, spin: 0, trail: null };
      }
      case 'star': {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 3), basic(color));
          c.rotation.z = (i * Math.PI) / 2;
          c.position.set(Math.sin((i * Math.PI) / 2) * -0.09, Math.cos((i * Math.PI) / 2) * 0.09, 0);
          g.add(c);
        }
        const holder = new THREE.Group();
        g.rotation.x = Math.PI / 2;
        holder.add(g);
        return { obj: holder, orient: false, spin: 25, trail: null };
      }
      case 'stone':
        return { obj: new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshToonMaterial({ color })), orient: false, spin: 8, trail: new THREE.Color(0x8a7a6a) };
      default: {
        const mesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(ELEMENTAL.has(effect) ? 0.17 : 0.13, 1),
          basic(color, { transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        return { obj: mesh, orient: false, spin: 0, trail: new THREE.Color(color) };
      }
    }
  }

  /** A projectile flying from `from` to a (possibly moving) target. */
  missile(from: THREE.Vector3, to: () => THREE.Vector3, effect: Effect, onHit: () => void = () => {}): void {
    const { obj, orient, spin, trail } = this.missileObject(effect);
    obj.position.copy(from);
    this.group.add(obj);
    const dist = from.distanceTo(to());
    const physical = !ELEMENTAL.has(effect) && effect !== 'heal';
    this.missiles.push({
      obj, from: from.clone(), to, t: 0, dur: Math.max(0.12, dist * (physical ? 0.045 : 0.06)), arc: physical ? Math.min(0.5, dist * 0.05) : 0.25,
      spin, trail, orient, onHit,
    });
  }

  /** Hit splash for an element at a point. */
  impact(pos: THREE.Vector3, effect: Effect): void {
    const color = EFFECT_COLOR[effect];
    if (effect === 'heal' || effect === 'holy' || effect === 'light') this.sparkle(pos, color, 12, 0.35);
    else this.burst(pos, color, effect === 'physical' || effect === 'blood' ? 8 : 14, 2.0, effect === 'fire' ? -1.5 : 6, 0.07);
  }

  private disposeObj(o: THREE.Object3D): void {
    this.group.remove(o);
    o.traverse((c) => {
      const me = c as THREE.Mesh;
      if (!me.isMesh) return;
      if (me.geometry !== this.flashGeo) me.geometry.dispose();
      (me.material as THREE.Material).dispose();
    });
  }

  update(dt: number): void {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    let n = 0;
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      dummy.position.set(p.x, p.y, p.z);
      const s = p.size * (0.4 + 0.6 * k);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(p.life * 5, p.life * 3, 0);
      dummy.updateMatrix();
      this.pmesh.setMatrixAt(n, dummy.matrix);
      this.pmesh.setColorAt(n, p.color);
      n++;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.max;
      if (t >= 1) {
        this.disposeObj(r.mesh);
        this.rings.splice(i, 1);
        continue;
      }
      const s = r.from + (r.to - r.from) * t;
      r.mesh.scale.set(s, s, s);
      r.mesh.position.y += r.rise * dt;
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.life += dt;
      const t = f.life / f.max;
      if (t >= 1) {
        this.disposeObj(f.mesh);
        this.flashes.splice(i, 1);
        continue;
      }
      // quick flare in, slow fade out, stepped so it reads as pixel-art frames
      const k = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.round(k * 4) / 4 * 0.85;
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const p = this.missiles[i];
      p.t += dt / p.dur;
      const to = p.to();
      if (p.t >= 1) {
        this.disposeObj(p.obj);
        this.missiles.splice(i, 1);
        p.onHit();
        continue;
      }
      const prev = p.obj.position.clone();
      p.obj.position.lerpVectors(p.from, to, p.t);
      p.obj.position.y += Math.sin(p.t * Math.PI) * p.arc;
      if (p.orient) p.obj.lookAt(p.obj.position.clone().add(p.obj.position.clone().sub(prev)));
      if (p.spin) p.obj.rotation.y += p.spin * dt;
      if (p.trail && Math.random() < 0.8) {
        this.push({
          x: p.obj.position.x, y: p.obj.position.y, z: p.obj.position.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, vz: (Math.random() - 0.5) * 0.4,
          life: 0, max: 0.3, size: 0.07, gravity: 0, color: p.trail.clone(),
        });
      }
    }

    if (this.clickLife > 0) {
      this.clickLife -= dt;
      const k = Math.max(0, this.clickLife / 0.6);
      (this.clickMarker.material as THREE.MeshBasicMaterial).opacity = k;
      const s = 1 + (1 - k) * 0.25;
      this.clickMarker.scale.set(s, s, 1);
      if (this.clickLife <= 0) this.clickMarker.visible = false;
    }
  }
}
