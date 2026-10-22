import * as THREE from 'three';
import type { Controller } from '../client/Controller';
import { chebyshev } from '../game/core/types';
import { activePet, petLevel } from '../game/pets/PetSystem';
import { PET_DEFS, type PetId } from '../game/pets/petDefs';
import { animatePet, buildPet, disposePet, type PetRig } from './models/pets3d';
import type { Renderer } from './Renderer';
import { showOtherPets } from '../ui/petsUi';

const VIEW_RANGE = 15;
/** Further than this (tiles) from its owner, or on another floor, and the pet hops straight to them. */
const TELEPORT_DIST = 4;

interface Follower {
  rig: PetRig;
  item: string;
  level: number;
  /** Position in tiles (smooth). */
  x: number; y: number; z: number;
  /** Tiles the owner walked off, oldest first: the pet walks in their footsteps. */
  trail: Array<{ x: number; y: number }>;
  lastTile: string;
  yaw: number;
  walk: number;
  t: number;
}

/**
 * Draws every pet that is out near the camera and walks it behind its owner (purely visual: pets
 * never block, fight or get hit, so the server only says which pet is out). The pet follows the
 * tiles its owner stepped off, sits down beside them when they stop, and hops to them when it falls
 * too far behind or the owner changes floor. The owl adds a soft glow underground (its light perk).
 */
export class PetsView {
  private pets = new Map<number, Follower>();
  private glow: THREE.PointLight;
  private clock = 0;

  constructor(private readonly renderer: Renderer, private readonly ctl: Controller) {
    this.glow = new THREE.PointLight(0xffe0a0, 0, 6, 1.6);
    renderer.scene.add(this.glow);
  }

  update(dt: number): void {
    const g = this.ctl.game;
    const me = g.getPlayer(this.ctl.pid);
    if (!me) return;
    const showOthers = showOtherPets();
    const seen = new Set<number>();
    for (const p of g.players()) {
      const s = g.session(p.id);
      const def = s ? activePet(s.pets) : null;
      if (!s || !def || p.dead) continue;
      if (p.id !== me.id && (!showOthers || chebyshev(p.x, p.y, me.x, me.y) > VIEW_RANGE)) continue;
      const level = petLevel(s.pets, def.id);
      let f = this.pets.get(p.id);
      if (f && (f.item !== def.item || f.level !== level)) {
        this.drop(p.id);
        f = undefined;
      }
      if (!f) {
        const rig = buildPet(def.id, level);
        this.renderer.scene.add(rig.root);
        const back = this.behind(p.x, p.y, p.facing, p.z);
        f = { rig, item: def.item, level, x: back.x, y: back.y, z: p.z, trail: [], lastTile: `${p.x},${p.y},${p.z}`, yaw: p.facing, walk: 0, t: Math.random() * 10 };
        this.pets.set(p.id, f);
      }
      seen.add(p.id);
      this.follow(f, p.x, p.y, p.z, p.facing, p.moveDur, dt);
      const off = this.renderer.worldView.floorOffset(f.z);
      f.rig.root.visible = off !== null;
      f.rig.root.position.set(f.x, off ?? 0, f.y);
      f.rig.root.rotation.y = f.yaw;
      f.t += dt;
      animatePet(f.rig, f.t, f.walk);
    }
    for (const id of [...this.pets.keys()]) if (!seen.has(id)) this.drop(id);
    for (const r of this.showcase) animatePet(r, (this.clock += dt * 0.125), 0);

    // the owl lights dark caves around its owner
    const ms = g.session(me.id);
    const light = ms ? g.petSys.light(ms) : 0;
    const mine = this.pets.get(me.id);
    if (light > 0 && mine && me.z < 0) {
      this.glow.intensity = 2.5 + light;
      this.glow.distance = 3 + light * 1.8;
      const off = this.renderer.worldView.floorOffset(mine.z) ?? 0;
      this.glow.position.set(mine.x, off + 1.4, mine.y);
    } else this.glow.intensity = 0;
  }

  /** A walkable tile behind someone facing `facing` (yaw, +Z = south); beside them if that is a wall. */
  private behind(x: number, y: number, facing: number, z = this.ctl.game.getPlayer(this.ctl.pid)?.z ?? 0): { x: number; y: number } {
    const w = this.ctl.game.world;
    const bx = -Math.round(Math.sin(facing));
    const by = -Math.round(Math.cos(facing));
    for (const [dx, dy] of [[bx, by], [by, bx], [-by, -bx], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((dx || dy) && w.isWalkable(x + dx, y + dy, z)) return { x: x + dx, y: y + dy };
    }
    return { x, y };
  }

  private follow(f: Follower, px: number, py: number, pz: number, facing: number, stepDur: number, dt: number): void {
    const tile = `${px},${py},${pz}`;
    if (tile !== f.lastTile) {
      const [lx, ly, lz] = f.lastTile.split(',').map(Number);
      if (lz === pz && chebyshev(lx, ly, px, py) <= 1) f.trail.push({ x: lx, y: ly });
      else f.trail = [];
      if (f.trail.length > 6) f.trail.shift();
      f.lastTile = tile;
    }
    // too far or another floor: hop straight to the owner's heels
    if (f.z !== pz || Math.hypot(f.x - px, f.y - py) > TELEPORT_DIST) {
      const b = this.behind(px, py, facing, pz);
      f.x = b.x;
      f.y = b.y;
      f.z = pz;
      f.trail = [];
      f.walk = 0;
      return;
    }
    // the next footstep to walk to: never the owner's own tile, keep one tile back
    while (f.trail.length > 1 && Math.hypot(f.trail[0].x - f.x, f.trail[0].y - f.y) < 0.15) f.trail.shift();
    const goal = f.trail.length ? f.trail[0] : null;
    const speed = (1 / Math.max(0.1, stepDur || 0.4)) * 1.05;
    if (goal && (f.trail.length > 1 || Math.hypot(goal.x - f.x, goal.y - f.y) > 0.05)) {
      const dx = goal.x - f.x;
      const dy = goal.y - f.y;
      const d = Math.hypot(dx, dy);
      // catch up a little faster when lagging behind
      const v = speed * (f.trail.length > 2 ? 1.35 : 1) * dt;
      if (d <= v) { f.x = goal.x; f.y = goal.y; } else { f.x += (dx / d) * v; f.y += (dy / d) * v; }
      if (d > 0.01) f.yaw = lerpAngle(f.yaw, Math.atan2(dx, dy), 1 - Math.exp(-dt * 12));
      f.walk = Math.min(1, f.walk + dt * 6);
    } else {
      // resting: turn to look the way the owner looks
      f.walk = Math.max(0, f.walk - dt * 4);
      f.yaw = lerpAngle(f.yaw, facing, 1 - Math.exp(-dt * 3));
    }
  }

  /** Debug / screenshots: every pet standing in two rows of four from (x, y), idling. Returns where each one stands. */
  lineup(x: number, y: number, z: number): Array<{ id: PetId; name: string; x: number; y: number }> {
    const out: Array<{ id: PetId; name: string; x: number; y: number }> = [];
    PET_DEFS.forEach((d, i) => {
      const rig = buildPet(d.id, 1);
      const px = x + (i % 4) * 1.6;
      const py = y + Math.floor(i / 4) * 1.9;
      rig.root.position.set(px, this.renderer.worldView.floorOffset(z) ?? 0, py);
      rig.root.rotation.y = 0.35;
      this.renderer.scene.add(rig.root);
      this.showcase.push(rig);
      out.push({ id: d.id, name: d.name, x: px, y: py });
    });
    return out;
  }

  private showcase: PetRig[] = [];

  private drop(id: number): void {
    const f = this.pets.get(id);
    if (!f) return;
    f.rig.root.removeFromParent();
    disposePet(f.rig);
    this.pets.delete(id);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
