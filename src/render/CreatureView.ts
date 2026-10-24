import * as THREE from 'three';
import type { Creature } from '../game/entities/Creature';
import type { BipedRig, QuadRig, Rig } from './models/rigs';
import { BlockAnim } from './anim/blockAnim';
import { PAINTED } from './style';

const TAU = Math.PI * 2;
const baseEmissive = new WeakMap<THREE.Material, THREE.Color>();

function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Drives one creature's 3D rig from logical state plus combat events:
 * idle breathing, walk cycle, attack swing, hurt flash/recoil and death fall.
 */
export class CreatureView {
  readonly rig: Rig;
  private yaw = 0;
  private phase = 0;
  private walkBlend = 0;
  private attackT = -1;
  private hurtT = -1;
  private deathT = -1;
  private fade = 1;
  private fadingIn = false;
  private time = Math.random() * 10;
  private transparentOn = false;

  /** 1 = solid; lower = see-through (invisible players). */
  ghost = 1;

  /**
   * See-through target while this creature's model covers the local player on screen
   * (Renderer.seeThrough): 1 = solid. Eased in `see` so it never pops.
   */
  cover = 1;
  private see = 1;

  /** Height of the floor this creature is drawn on. */
  yOffset = 0;

  /** Shield block / weapon parry on top of the pose (anim/blockAnim.ts). */
  readonly block = new BlockAnim();

  constructor(public creature: Creature, rig: Rig, private readonly parent: THREE.Object3D) {
    this.rig = rig;
    this.yaw = creature.facing;
    rig.root.userData.creatureId = creature.id;
    rig.hitbox.userData.creatureId = creature.id;
    parent.add(rig.root);
    this.syncPosition();
  }

  private castOn: boolean | null = null;
  /**
   * Turns the model's shadow on or off (only creatures whose shadow can reach the
   * view cast one: renderer). `force` re-applies after the model was re-dressed.
   */
  setCastShadow(on: boolean, force = false): void {
    if (on === this.castOn && !force) return;
    this.castOn = on;
    const hb = this.rig.hitbox;
    this.rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== hb && !o.userData.noShadow) o.castShadow = on;
    });
  }

  get hitbox(): THREE.Mesh {
    return this.rig.hitbox;
  }

  onAttack(): void {
    this.attackT = 0;
  }

  /** A blow was blocked: raise the shield (or parry) toward world yaw `fromYaw`. */
  onBlock(fromYaw: number | null): void {
    this.block.start(fromYaw);
  }

  onHurt(): void {
    this.hurtT = 0;
  }

  onDeath(): void {
    this.deathT = 0;
    this.attackT = -1;
  }

  onRespawn(): void {
    this.deathT = -1;
    this.hurtT = -1;
    this.attackT = -1;
    this.yaw = this.creature.facing;
    const b = this.rig.body;
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    this.rig.head.rotation.z = 0;
    this.fade = 0;
    this.fadingIn = true;
    this.rig.root.visible = true;
  }

  private syncPosition(): void {
    const p = this.creature.visualPos();
    this.rig.root.position.set(p.x, this.yOffset, p.y);
  }

  /** World-space point above the head, for labels. */
  labelAnchor(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.rig.root.position.x, this.yOffset + this.rig.height, this.rig.root.position.z);
  }

  update(dt: number, corpseVisible: boolean): void {
    const c = this.creature;
    const rig = this.rig;
    this.time += dt;
    this.syncPosition();
    this.see += (this.cover - this.see) * (1 - Math.exp(-dt * 9));
    if (Math.abs(this.cover - this.see) < 0.01) this.see = this.cover;

    // facing: smooth shortest-arc turn
    this.yaw = angleLerp(this.yaw, c.facing, 1 - Math.exp(-dt * 16));
    rig.root.rotation.y = this.yaw;

    // walk cycle advances with distance walked so feet don't skate
    const moving = c.moving && !c.dead;
    this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * (1 - Math.exp(-dt * 12));
    if (moving) this.phase += (dt / c.moveDur) * Math.PI;

    // death
    if (c.dead) {
      if (this.deathT < 0) this.deathT = 0;
      if (PAINTED && c.kind === 'enemy') {
        // painted style: a heavier collapse — knees buckle, then the body drops and settles
        this.deathT = Math.min(1, this.deathT + dt / 0.95);
        this.applyCollapse(this.deathT);
      } else {
        this.deathT = Math.min(1, this.deathT + dt / 0.6);
        this.applyDeath(easeOut(this.deathT));
      }
      if (!corpseVisible) this.fade = Math.max(0, this.fade - dt / 1.2);
      this.applyFade();
      rig.root.visible = this.fade > 0.01;
      this.applyFlash(0);
      return;
    }
    if (this.deathT >= 0) this.onRespawn();
    if (this.fadingIn) {
      this.fade = Math.min(1, this.fade + dt / 0.6);
      if (this.fade >= 1) this.fadingIn = false;
    }
    this.applyFade();

    let flash = 0;
    if (this.hurtT >= 0) {
      this.hurtT += dt / 0.28;
      flash = Math.max(0, 1 - this.hurtT);
      if (this.hurtT >= 1) this.hurtT = -1;
    }
    this.applyFlash(flash);

    let atk = -1;
    if (this.attackT >= 0) {
      this.attackT += dt / 0.42;
      atk = this.attackT;
      if (this.attackT >= 1) this.attackT = -1;
    }

    this.block.tick(dt);
    if (rig.type === 'biped') this.animateBiped(rig, atk, flash);
    else this.animateQuad(rig, atk, flash);
  }

  private animateBiped(rig: BipedRig, atk: number, hurt: number): void {
    const s = Math.sin(this.phase);
    const w = this.walkBlend;
    const breathe = Math.sin(this.time * 2.2) * 0.012;
    rig.legL.rotation.x = s * 0.75 * w;
    rig.legR.rotation.x = -s * 0.75 * w;
    rig.armL.rotation.x = -s * 0.5 * w - 0.15;
    rig.body.position.y = rig.hover ? 0.12 + Math.sin(this.time * 3) * 0.06 : Math.abs(Math.cos(this.phase)) * 0.05 * w + breathe;
    if (rig.hover) rig.torso.scale.set(1 + Math.sin(this.time * 11) * 0.04, 1 + Math.sin(this.time * 13) * 0.05, 1);
    rig.wings?.forEach((wg, i) => {
      const side = i === 0 ? -1 : 1;
      wg.rotation.y = side * (0.3 + Math.sin(this.time * (w > 0.5 ? 6 : 2)) * (w > 0.5 ? 0.4 : 0.15));
    });
    rig.torso.rotation.y = s * 0.08 * w;
    rig.head.rotation.y = -s * 0.05 * w;
    if (rig.cape) rig.cape.rotation.x = 0.12 + w * 0.18 + Math.sin(this.time * 3) * 0.03;

    let arm = rig.restArm + s * 0.45 * w;
    let lunge = 0;
    if (atk >= 0) {
      // wind-up overhead, chop down, recover
      if (atk < 0.35) arm = lerp(rig.restArm, -2.7, easeOut(atk / 0.35));
      else if (atk < 0.6) arm = lerp(-2.7, -0.15, (atk - 0.35) / 0.25);
      else arm = lerp(-0.15, rig.restArm, (atk - 0.6) / 0.4);
      lunge = Math.sin(Math.min(1, atk / 0.6) * Math.PI) * 0.14;
      rig.torso.rotation.x = Math.sin(atk * Math.PI) * 0.18;
    } else {
      rig.torso.rotation.x = 0;
    }
    rig.armR.rotation.x = arm;
    rig.armR.rotation.z = atk >= 0 ? -0.15 : 0;
    rig.body.position.z = lunge;
    rig.body.rotation.x = -hurt * 0.22;
    this.block.apply(rig, this.yaw, (this.creature as { enemyKind?: string }).enemyKind ?? null, atk >= 0);
  }

  private animateQuad(rig: QuadRig, atk: number, hurt: number): void {
    const s = Math.sin(this.phase);
    const w = this.walkBlend;
    rig.legs.forEach((l, i) => {
      const sign = ((i & 1) ^ ((i >> 1) & 1)) ? -1 : 1;
      l.rotation.x = sign * s * 0.8 * w;
    });
    rig.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * w + Math.sin(this.time * 3) * 0.006;
    rig.tail.rotation.y = Math.sin(this.time * (w > 0.5 ? 9 : 3.5)) * 0.45;
    let lunge = 0;
    let headPitch = Math.sin(this.time * 1.7) * 0.05;
    if (atk >= 0) {
      const k = Math.sin(atk * Math.PI);
      lunge = k * 0.22;
      headPitch = k * 0.5;
    }
    rig.body.position.z = lunge;
    if (rig.necks) {
      // independent sway; on attack the heads strike one after another, jaws gaping
      headPitch = 0;
      for (let i = 0; i < rig.necks.length; i++) {
        const n = rig.necks[i];
        // each head: rear back with the jaws opening, snap forward, recover
        const t = atk >= 0 ? Math.min(1, Math.max(0, (atk - i * 0.18) / 0.64)) : 0;
        const strike = t <= 0 ? 0 : t < 0.35 ? -0.35 * Math.sin((t / 0.35) * Math.PI / 2) : t < 0.55 ? lerp(-0.35, 0.5, (t - 0.35) / 0.2) : lerp(0.5, 0, (t - 0.55) / 0.45);
        const gape = t <= 0 ? 0 : Math.sin(Math.min(1, t / 0.6) * Math.PI);
        n.neck.rotation.y = n.yaw + Math.sin(this.time * 1.3 + i * 2.1) * 0.16;
        n.neck.rotation.x = Math.sin(this.time * 1.7 + i * 1.3) * 0.07 + strike;
        n.neck.rotation.z = Math.sin(this.time * 1.1 + i * 2.7) * 0.07;
        if (n.jaw) n.jaw.rotation.x = 0.06 + Math.max(0, Math.sin(this.time * 0.9 + i * 1.9)) * 0.1 + gape * 0.8;
      }
    }
    rig.head.rotation.x = headPitch;
    rig.body.rotation.x = -hurt * 0.25;
    rig.wings.forEach((wg, i) => {
      const side = i === 0 ? -1 : 1;
      const beat = atk >= 0 ? Math.sin(atk * Math.PI) * 0.9 : 0;
      wg.rotation.z = side * (0.35 + Math.sin(this.time * (w > 0.5 ? 7 : 2.2)) * (w > 0.5 ? 0.35 : 0.12) + beat);
    });
  }

  private applyDeath(t: number): void {
    const rig = this.rig;
    const b = rig.body;
    if (rig.type === 'biped') {
      b.rotation.set(-t * Math.PI / 2, 0, 0); // topple backwards onto the back
      b.position.set(0, t * 0.12, 0);
      rig.armR.rotation.x = lerp(rig.restArm, -1.2, t);
    } else {
      b.rotation.set(0, 0, t * Math.PI / 2);
      b.position.set(0, t * 0.18, 0);
      for (const l of rig.legs) l.rotation.x = 0.3 * t;
    }
  }

  /**
   * Painted style death (monsters): sag and buckle (0–0.3), fall under gravity (0.3–0.8),
   * a small bounce as it hits the ground and settles (0.8–1). Ends in the same pose as
   * applyDeath(1), so corpses look the same afterwards. No dismemberment.
   */
  private applyCollapse(t: number): void {
    const rig = this.rig;
    const b = rig.body;
    const a = Math.min(1, t / 0.3);
    const sag = a * a * (3 - 2 * a);
    const f0 = Math.min(1, Math.max(0, (t - 0.3) / 0.5));
    const fall = f0 * f0;
    const settle = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * (1 - (t - 0.8) / 0.2 * 0.5) : 0;
    if (rig.type === 'biped') {
      // a lurch forward as the legs give, then over onto the back
      const rx = 0.22 * sag * (1 - fall) - fall * Math.PI / 2 + settle * 0.1;
      b.rotation.set(rx, 0, 0.12 * sag * (1 - fall));
      b.position.set(0, -0.16 * sag * (1 - fall) + 0.12 * fall + settle * 0.04, 0);
      rig.legL.rotation.x = -0.7 * sag * (1 - fall);
      rig.legR.rotation.x = -0.55 * sag * (1 - fall);
      rig.armL.rotation.x = lerp(-0.15, -1.0, fall) + 0.5 * sag * (1 - fall);
      rig.armR.rotation.x = lerp(rig.restArm, -1.25, fall) + 0.4 * sag * (1 - fall);
      rig.head.rotation.x = 0.35 * sag * (1 - fall) - 0.25 * fall;
      rig.head.rotation.z = 0.3 * fall;
    } else {
      // legs fold under it, it sinks, then rolls onto its side
      b.rotation.set(0.12 * sag * (1 - fall), 0, fall * Math.PI / 2 - settle * 0.08);
      b.position.set(0, -0.14 * sag * (1 - fall) + 0.18 * fall + settle * 0.03, 0);
      for (const l of rig.legs) l.rotation.x = 0.6 * sag * (1 - fall) + 0.3 * fall;
      rig.head.rotation.x = 0.3 * sag + 0.15 * fall;
    }
  }

  private applyFlash(k: number): void {
    for (const m of this.rig.materials) {
      let base = baseEmissive.get(m);
      if (!base) {
        base = m.emissive.clone();
        baseEmissive.set(m, base);
      }
      m.emissive.setRGB(base.r + k * 0.9, base.g + k * 0.08, base.b + k * 0.05);
    }
  }

  private applyFade(): void {
    const a = this.fade * this.ghost * this.see;
    const needTransparent = a < 0.999;
    if (needTransparent !== this.transparentOn) {
      this.transparentOn = needTransparent;
      for (const m of this.rig.materials) {
        m.transparent = needTransparent;
        m.needsUpdate = true;
      }
    }
    if (needTransparent) for (const m of this.rig.materials) m.opacity = a;
    else for (const m of this.rig.materials) m.opacity = 1;
  }

  dispose(): void {
    this.parent.remove(this.rig.root);
    this.rig.root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      // skinned characters (rigMerge.ts skinRig) own a bone texture
      if ((me as THREE.SkinnedMesh).isSkinnedMesh) (me as THREE.SkinnedMesh).skeleton.dispose();
      if (!me.geometry.userData.shared) me.geometry.dispose(); // dark models share geometry between instances
      if (me.userData.sharedMaterial) return;
      const mm = me.material;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
      else mm.dispose();
    });
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
