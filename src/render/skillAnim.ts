import * as THREE from 'three';
import type { GameEvent } from '../game/core/events';
import type { Game } from '../game/Game';
import { activityInterval, activityKey, activityStartPhase, currentActivity, MOVING_ACTIVITIES, type Activity, type ActivityKind } from '../game/gathering/activity';
import { Player } from '../game/player/Player';
import type { CreatureView } from './CreatureView';
import type { Effects } from './Effects';
import { GatherFx, type FishLine, type Prop } from './fx/gatherFx';
import { group, matCache, type MatFn } from './models/parts';
import type { BipedRig } from './models/rigs';
import { buildHeldTools, type HeldTools } from './models/toolAnims';

/**
 * Trade-skill animations for player characters: while someone mines, chops,
 * fishes or works a station, their weapon and shield are swapped for the right
 * tool and a looping pose replaces the idle one (overhead pick swing, side chop,
 * cast + bobber, hammer strikes, small hand work). The big hit of each loop
 * lands on the game's own action event (the moment the sound plays), so the
 * loop is re-synced on every `mine` / `chop` / `fish` / `craft` event.
 *
 * Runs after CreatureView.update and only overrides the joints it owns, with a
 * blend weight, so walking off returns smoothly to the normal animation.
 */

// pose slots
const ARX = 0, ARY = 1, ARZ = 2, ALX = 3, ALY = 4, ALZ = 5, TX = 6, TY = 7, HX = 8, HY = 9, BY = 10, BZ = 11, TRX = 12, TLX = 13;
const NP = 14;

/** Tiles worked at a distance: the character turns to face them (hand tools are worked where you stand). */
const FACES_TARGET: Record<ActivityKind, boolean> = {
  chop: true, fish: true, mine: true, furnace: true, anvil: true, campfire: true, stove: true, tanning: true,
  knife: false, needle: false, chisel: false, tinderbox: false,
  // the trade skills of 2026-10-24: crossings face where they lead, thieving and herbs face their target
  pestle: false, balance: true, climb: true, swim: true, squeeze: true, pickpocket: true, steal: true, lockpick: true, herbs: true,
  farm: true, trap: true, sail: false, salvage: true,
};

const WATER_Y = -0.17;
const TAU = Math.PI * 2;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeOut = (t: number) => 1 - (1 - clamp01(t)) * (1 - clamp01(t));
const easeIn = (t: number) => clamp01(t) * clamp01(t);
function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** Tool holders and built tools live on the model, so starting again reuses them. */
interface RigTools {
  M: MatFn;
  holdR: THREE.Group;
  holdL: THREE.Group;
  tools: Map<string, HeldTools>;
}
const rigTools = new WeakMap<BipedRig, RigTools>();

function toolsOn(rig: BipedRig): RigTools {
  let r = rigTools.get(rig);
  if (r) return r;
  const g = rig.gear!;
  // the arms may be stretched (slim player models): an outer holder undoes the arm's scale,
  // the inner one carries the grip rotation, so tools keep their shape
  const mount = (arm: THREE.Object3D, x: number): THREE.Group => {
    const outer = group(x, g.weaponMount.position.y, g.weaponMount.position.z);
    outer.scale.set(1 / (arm.scale.x || 1), 1 / (arm.scale.y || 1), 1 / (arm.scale.z || 1));
    const inner = group();
    inner.rotation.order = 'ZXY';
    outer.add(inner);
    arm.add(outer);
    return inner;
  };
  const holdR = mount(rig.armR, g.weaponMount.position.x);
  const holdL = mount(rig.armL, -g.weaponMount.position.x);
  // yaw outermost so a chop sweeps round the shoulder (identical to the default order while yaw is 0)
  rig.armR.rotation.order = 'YXZ';
  rig.armL.rotation.order = 'YXZ';
  r = { M: matCache(), holdR, holdL, tools: new Map() };
  rigTools.set(rig, r);
  return r;
}

interface Worker {
  rig: BipedRig;
  M: MatFn;
  holdR: THREE.Group;
  holdL: THREE.Group;
  tools: Map<string, HeldTools>;
  cur: HeldTools | null;
  act: Activity | null;
  actKey: string;
  /** Kind of the last activity (kept while blending out). */
  kind: ActivityKind | null;
  u: number;
  prevU: number;
  w: number;
  pose: Float32Array;
  yaw: number;
  seen: number;
  time: number;
  // fishing
  fish: 'cast' | 'wait' | 'reel';
  fishT: number;
  /** The cast has landed (ring on the water drawn). */
  landed: boolean;
  dip: number;
  reelIdle: number;
  /** Seconds to the next small ripple round the bobber while waiting. */
  ripple: number;
  line: FishLine | null;
  flame: Prop | null;
  flameSize: number;
}

export interface SkillAnimContext {
  game(): Game;
  /** Whether a tile is close enough to the camera for particles. */
  near(x: number, y: number): boolean;
}

export class SkillAnimator {
  private workers = new Map<number, Worker>();
  private frameNo = 0;
  private fx: GatherFx;
  private target = new Float32Array(NP);
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly effects: Effects, private readonly ctx: SkillAnimContext) {
    this.fx = new GatherFx(scene);
  }

  // ---------------------------------------------------------------- per creature, after CreatureView.update

  apply(view: CreatureView, dt: number): void {
    const c = view.creature;
    if (!(c instanceof Player)) return;
    const rig = view.rig;
    if (rig.type !== 'biped' || !rig.gear || rig.prop) return;
    let wk = this.workers.get(c.id);
    // most work stops while walking; crossing a shortcut or sailing is done on the move
    const cur = c.dead ? null : currentActivity(this.ctx.game(), c.id);
    const act = cur && (!c.moving || MOVING_ACTIVITIES.has(cur.kind)) ? cur : null;
    if (wk && wk.rig !== rig) {
      // the model was rebuilt (outfit or illusion change): start over on the new one
      this.release(wk, false);
      this.workers.delete(c.id);
      wk = undefined;
    }
    if (!wk) {
      if (!act) return;
      wk = this.newWorker(rig);
      this.workers.set(c.id, wk);
    }
    wk.seen = this.frameNo;
    wk.time += dt;

    const key = activityKey(act);
    if (key !== wk.actKey) {
      const fresh = act && (!wk.act || wk.act.kind !== act.kind || wk.act.x !== act.x || wk.act.y !== act.y);
      if (act && fresh) {
        wk.u = wk.prevU = activityStartPhase(act.kind);
        wk.fish = 'cast';
        wk.fishT = 0;
        wk.landed = false;
        wk.flameSize = 0;
        if (!wk.act) wk.yaw = rig.root.rotation.y;
      }
      wk.act = act;
      wk.actKey = key;
      if (act) {
        this.hold(wk, act);
        wk.kind = act.kind;
      }
    }

    wk.w += ((act ? 1 : 0) - wk.w) * (1 - Math.exp(-dt * 10));
    if (!act && wk.w < 0.03) {
      this.release(wk, true);
      this.workers.delete(c.id);
      return;
    }
    // swap weapon/shield for the tool (and back once mostly blended out)
    const showTool = !!act || wk.w > 0.5;
    if (wk.cur) {
      if (wk.cur.right) wk.cur.right.visible = showTool;
      if (wk.cur.left) wk.cur.left.visible = showTool;
    }
    rig.gear.weaponMount.visible = !showTool;
    rig.gear.shieldMount.visible = !showTool || !wk.cur?.left;

    const kind = wk.kind!;
    if (act) {
      wk.prevU = wk.u;
      wk.u += dt / activityInterval(kind);
      if (wk.u >= 1) {
        wk.u -= 1;
        wk.prevU -= 1;
      }
      this.poseFor(wk, kind, dt);
    }
    // smooth towards the pose (hides small pops when an event re-syncs the loop)
    const k = 1 - Math.exp(-dt * 28);
    for (let i = 0; i < NP; i++) wk.pose[i] += (this.target[i] - wk.pose[i]) * (act ? k : 0);
    this.applyPose(wk, view, c, dt);
    if (act) this.updateFx(wk, view, act, kind, dt);
    else this.hideFx(wk);
  }

  /** Once per frame after every creature: drops workers whose model was not drawn, ticks the shared fx. */
  frame(dt: number): void {
    for (const [id, wk] of this.workers) {
      if (wk.seen !== this.frameNo) {
        this.release(wk, true);
        this.workers.delete(id);
      }
    }
    this.frameNo++;
    this.fx.update(dt);
  }

  /** The creature's model is going away. */
  forget(id: number): void {
    const wk = this.workers.get(id);
    if (!wk) return;
    this.release(wk, false);
    this.workers.delete(id);
  }

  // ---------------------------------------------------------------- game events (the moment of each hit)

  onEvent(e: Extract<GameEvent, { type: 'mine' | 'chop' | 'fish' | 'craft' }>): void {
    const wk = this.workers.get(e.id);
    if (!wk || !wk.act) return;
    const near = this.ctx.near(e.x, e.y);
    const off = wk.rig.root.position.y;
    switch (e.type) {
      case 'mine': {
        wk.u = wk.prevU = 0;
        if (!near) return;
        // a white-hot spark where the pick bites, and a little dust
        const p = this.towardWorker(wk, e.x, e.y, 0.32, off + 0.4);
        this.fx.flash(p.x, p.y, p.z, e.got ? 0xfff0b0 : 0xffffff, e.got ? 0.62 : 0.48);
        this.effects.burst(p, 0xb4aa98, 5, 0.6, 1.2, 0.1);
        return;
      }
      case 'chop': {
        wk.u = wk.prevU = 0;
        if (!near) return;
        const p = this.towardWorker(wk, e.x, e.y, 0.3, off + 0.55);
        this.effects.burst(p, 0x9a6a3a, 4, 1.4, 7, 0.05);
        return;
      }
      case 'fish':
        if (e.got) {
          wk.fish = 'reel';
          wk.fishT = 0;
        } else {
          wk.dip = 1;
          wk.ripple = 0;
        }
        return;
      case 'craft':
        wk.u = wk.prevU = 0;
        if (e.station === 'tinderbox') wk.flameSize = 0;
        if (!near) return;
        if (e.station === 'anvil') {
          this.fx.flash(e.x, off + 0.8, e.y, 0xffe08a, 0.55);
          this.effects.light(this.v1.set(e.x, off + 0.9, e.y), 0xffa040, 2.5, 3, 0.18);
        } else if (e.station === 'chisel') {
          this.headPos(wk, this.v1);
          this.fx.flash(this.v1.x, this.v1.y, this.v1.z, 0xffffff, 0.3, 0.12);
        }
        return;
    }
  }

  // ---------------------------------------------------------------- internals

  private newWorker(rig: BipedRig): Worker {
    const { M, holdR, holdL, tools } = toolsOn(rig);
    return {
      rig, M, holdR, holdL, tools, cur: null, act: null, actKey: '', kind: null,
      u: 0, prevU: 0, w: 0, pose: new Float32Array(NP), yaw: rig.root.rotation.y, seen: this.frameNo, time: 0,
      fish: 'cast', fishT: 0, landed: false, dip: 0, reelIdle: 4 + Math.random() * 4, ripple: 1.2, line: null, flame: null, flameSize: 0,
    };
  }

  /** Puts the tools for an activity in the character's hands (built once per character and tool). */
  private hold(wk: Worker, act: Activity): void {
    const key = `${act.kind}|${act.tool ?? ''}`;
    let t = wk.tools.get(key);
    if (!t) {
      t = buildHeldTools(act.kind, act.tool, wk.M);
      if (t.right) wk.holdR.add(t.right);
      if (t.left) wk.holdL.add(t.left);
      // tool materials join the character's, so hit flashes and see-through (invisible) apply to them too
      for (const g of [t.right, t.left]) g?.traverse((o) => {
        const m = (o as THREE.Mesh).material as BipedRig['materials'][number] | undefined;
        if (m && (m as THREE.MeshToonMaterial).isMeshToonMaterial && !wk.rig.materials.includes(m)) wk.rig.materials.push(m);
      });
      wk.tools.set(key, t);
    }
    if (wk.cur && wk.cur !== t) {
      if (wk.cur.right) wk.cur.right.visible = false;
      if (wk.cur.left) wk.cur.left.visible = false;
    }
    wk.cur = t;
  }

  /** Fills `this.target` with the activity's pose at the worker's loop phase. */
  private poseFor(wk: Worker, kind: ActivityKind, dt: number): void {
    const p = this.target;
    p.fill(0);
    const u = wk.u;
    const t = wk.time;
    switch (kind) {
      case 'mine': {
        // two hands on the haft: bounce off the rock, heave it overhead, hold, slam down
        let a: number;
        if (u < 0.16) a = lerp(-0.75, -1.05, easeOut(u / 0.16));
        else if (u < 0.6) a = lerp(-1.05, -2.95, smooth((u - 0.16) / 0.44));
        else if (u < 0.84) a = -2.95 - 0.12 * smooth((u - 0.6) / 0.24);
        else a = lerp(-3.07, -0.75, easeIn((u - 0.84) / 0.16));
        const up = clamp01((a + 0.75) / -2.3);
        p[ARX] = a;
        p[ALX] = a;
        p[ARZ] = 0.38;
        p[ALZ] = -0.38;
        p[TRX] = 1.05;
        p[TX] = 0.3 * (1 - up) - 0.12 * up;
        p[HX] = 0.28 * (1 - up) - 0.08 * up;
        p[BZ] = 0.1 * (1 - up);
        p[BY] = -0.04 * (1 - up);
        return;
      }
      case 'chop': {
        // side chop, kept level so it reads from above: swing the axe round behind the right hip, then sweep it into the trunk
        let y: number;
        if (u < 0.14) y = lerp(0.25, 0.05, smooth(u / 0.14));
        else if (u < 0.66) y = lerp(0.05, -2.0, smooth((u - 0.14) / 0.52));
        else if (u < 0.86) y = -2.0 - 0.1 * smooth((u - 0.66) / 0.2);
        else y = lerp(-2.1, 0.25, easeIn((u - 0.86) / 0.14));
        const back = clamp01(-y / 2.1);
        p[ARX] = -1.3 - 0.3 * back;
        p[ARY] = y;
        p[ARZ] = 0.12;
        p[ALX] = -1.2 - 0.2 * back;
        p[ALY] = y * 0.85 - 0.45;
        p[ALZ] = -0.15;
        p[TRX] = 1.45 - 0.15 * back;
        p[TY] = y * 0.3;
        p[HY] = y * 0.1;
        p[TX] = 0.12;
        p[HX] = 0.15;
        return;
      }
      case 'fish': {
        wk.fishT += dt;
        wk.dip = Math.max(0, wk.dip - dt * 3);
        let a = -0.9;
        let reel = 0;
        if (wk.fish === 'cast') {
          const s = wk.fishT;
          if (s < 0.42) a = lerp(-0.9, -2.75, smooth(s / 0.42));
          else if (s < 0.56) a = lerp(-2.75, -0.6, easeIn((s - 0.42) / 0.14));
          else a = lerp(-0.6, -0.9, smooth((s - 0.56) / 0.4));
          if (s >= 1) {
            wk.fish = 'wait';
            wk.fishT = 0;
          }
        } else if (wk.fish === 'reel') {
          const s = wk.fishT / 0.7;
          a = lerp(-0.9, -1.75, Math.sin(clamp01(s) * Math.PI * 0.85));
          reel = 1;
          if (s >= 1) {
            wk.fish = 'cast';
            wk.fishT = 0;
            wk.landed = false;
          }
        } else {
          // waiting for a bite: tiny drift, the tip dips on a nibble, now and then a few turns of the reel
          a = -0.9 + Math.sin(t * 1.3) * 0.03 + wk.dip * 0.18;
          wk.reelIdle -= dt;
          if (wk.reelIdle < 0) {
            reel = 0.5;
            a -= 0.08;
            if (wk.reelIdle < -0.9) wk.reelIdle = 5 + Math.random() * 5;
          }
        }
        p[ARX] = a;
        p[ARZ] = 0.1;
        p[TRX] = 0.3;
        p[ALX] = -0.95 + Math.sin(t * 15) * 0.14 * reel;
        p[ALZ] = -0.35 + Math.cos(t * 15) * 0.08 * reel;
        p[TX] = 0.05;
        p[HX] = 0.12;
        return;
      }
      case 'anvil': {
        // a light tap at half time and the full strike on the beat
        const v = (u * 2) % 1;
        const amp = u < 0.5 ? 0.6 : 1;
        let a: number;
        if (v < 0.2) a = lerp(-0.95, -1.15, easeOut(v / 0.2));
        else if (v < 0.72) a = lerp(-1.15, -1.15 - 1.1 * amp, smooth((v - 0.2) / 0.52));
        else a = lerp(-1.15 - 1.1 * amp, -0.95, easeIn((v - 0.72) / 0.28));
        p[ARX] = a;
        p[ARZ] = 0.15;
        p[TRX] = 1.6;
        p[ALX] = -1.05;
        p[ALZ] = -0.25;
        p[TLX] = 1.7;
        p[TX] = 0.2;
        p[HX] = 0.32;
        p[BZ] = 0.12;
        return;
      }
      case 'furnace': {
        const s = Math.sin(u * TAU);
        p[ARX] = -1.2 + s * 0.12;
        p[ARZ] = 0.2;
        p[TRX] = 1.1;
        p[ALX] = -1.0 - s * 0.08;
        p[ALZ] = -0.2;
        p[TX] = 0.15;
        p[HX] = 0.2;
        p[BZ] = 0.04 + s * 0.04;
        return;
      }
      case 'campfire':
      case 'stove': {
        // shake the pan over the heat, toss once per item
        const toss = u > 0.45 && u < 0.62 ? Math.sin(((u - 0.45) / 0.17) * Math.PI) : 0;
        p[ARX] = -0.95 + Math.sin(t * 9) * 0.04 - toss * 0.35;
        p[ARZ] = 0.15 + Math.sin(t * 7) * 0.04;
        p[TRX] = 0.95 + toss * 0.25;
        p[ALX] = -0.45;
        p[ALZ] = -0.1;
        p[TX] = 0.22;
        p[HX] = 0.32;
        p[BY] = -0.05;
        p[BZ] = 0.06;
        return;
      }
      case 'knife': {
        // two carving strokes per item along the log in the left hand
        const v = (u * 2) % 1;
        p[ARX] = -0.95 - (v < 0.6 ? 0.28 * smooth(v / 0.6) : 0.28 * (1 - easeOut((v - 0.6) / 0.4)));
        p[ARZ] = 0.32;
        p[TRX] = 1.0;
        p[ALX] = -0.85;
        p[ALZ] = -0.45;
        p[TLX] = 0.85;
        p[TX] = 0.12;
        p[HX] = 0.42;
        return;
      }
      case 'needle': {
        // two stitches: push in, pull the thread up high
        const v = (u * 2) % 1;
        p[ARX] = v < 0.5 ? lerp(-0.95, -1.6, smooth(v / 0.5)) : lerp(-1.6, -0.95, smooth((v - 0.5) / 0.5));
        p[ARZ] = 0.28;
        p[TRX] = 0.6;
        p[ALX] = -0.9;
        p[ALZ] = -0.3;
        p[TLX] = 0.9;
        p[TX] = 0.12;
        p[HX] = 0.38;
        return;
      }
      case 'chisel': {
        const v = (u * 3) % 1;
        p[ARX] = v < 0.7 ? lerp(-1.0, -1.45, smooth(v / 0.7)) : lerp(-1.45, -1.0, easeIn((v - 0.7) / 0.3));
        p[ARZ] = 0.3;
        p[TRX] = 1.4;
        p[ALX] = -0.95;
        p[ALZ] = -0.3;
        p[TLX] = 1.2;
        p[TX] = 0.15;
        p[HX] = 0.42;
        return;
      }
      case 'tinderbox': {
        // bent over the logs: three quick strikes of flint on steel, then the flame takes
        const v = u < 0.6 ? (u / 0.6 * 3) % 1 : 0;
        p[ARX] = -0.75 - (v < 0.5 ? 0.3 * smooth(v / 0.5) : 0.3 * (1 - easeIn((v - 0.5) / 0.5)));
        p[ARZ] = 0.3;
        p[TRX] = 0.8;
        p[ALX] = -0.7;
        p[ALZ] = -0.3;
        p[TLX] = 0.7;
        p[TX] = 0.38;
        p[HX] = 0.42;
        p[BY] = -0.06;
        return;
      }
      // ---- the trade skills of 2026-10-24
      case 'balance': {
        // arms out wide, wobbling, small careful steps
        const s = Math.sin(t * 5.2);
        p[ARZ] = 1.35 + s * 0.18;
        p[ALZ] = -1.35 + s * 0.18;
        p[ARX] = -0.2;
        p[ALX] = -0.2;
        p[TY] = s * 0.12;
        p[TX] = 0.08;
        return;
      }
      case 'climb': {
        // hand over hand up the rock face, leaning in
        const v = Math.sin(u * TAU);
        p[ARX] = -2.55 + v * 0.45;
        p[ALX] = -2.55 - v * 0.45;
        p[ARZ] = 0.25;
        p[ALZ] = -0.25;
        p[TX] = 0.32;
        p[HX] = -0.25;
        p[BY] = 0.1 + Math.abs(v) * 0.08;
        return;
      }
      case 'swim': {
        // low in the water, a slow breaststroke
        const v = Math.sin(u * TAU);
        p[ARX] = -1.9 + v * 0.5;
        p[ALX] = -1.9 + v * 0.5;
        p[ARZ] = 0.5 + v * 0.35;
        p[ALZ] = -0.5 - v * 0.35;
        p[TX] = 0.55;
        p[HX] = -0.45;
        p[BY] = -0.62;
        return;
      }
      case 'squeeze': {
        // turned side-on, arms in, shuffling through the gap
        const v = Math.sin(t * 6);
        p[ARX] = -0.3;
        p[ALX] = -0.9;
        p[ARZ] = 0.1;
        p[ALZ] = -0.6;
        p[TY] = 1.2;
        p[TX] = 0.18 + v * 0.04;
        p[BY] = -0.18;
        return;
      }
      case 'pickpocket':
      case 'steal': {
        // a quick, low reach and the hand drawn back in
        const v = u < 0.55 ? smooth(u / 0.55) : 1 - easeOut((u - 0.55) / 0.45);
        p[ARX] = -0.35 - v * (kind === 'steal' ? 1.15 : 0.85);
        p[ARZ] = 0.15;
        p[ALX] = 0.2;
        p[TX] = 0.18 + v * 0.12;
        p[HX] = 0.25;
        p[BY] = -0.08;
        return;
      }
      case 'lockpick': {
        // crouched at the box, both hands at the lock, the pick jiggling
        const j = Math.sin(t * 22) * 0.06;
        p[ARX] = -1.15 + j;
        p[ALX] = -1.05;
        p[ARZ] = 0.2;
        p[ALZ] = -0.2;
        p[TRX] = 1.1;
        p[TX] = 0.4;
        p[HX] = 0.4;
        p[BY] = -0.3;
        return;
      }
      case 'herbs':
      case 'farm':
      case 'trap': {
        // kneeling to the ground: pull, dig or set
        const v = kind === 'farm' ? Math.abs(Math.sin(u * TAU * 1.5)) : u < 0.6 ? smooth(u / 0.6) : 1 - smooth((u - 0.6) / 0.4);
        p[ARX] = -0.55 - v * 0.5;
        p[ALX] = kind === 'trap' ? -0.75 : -0.4 - v * 0.2;
        p[ARZ] = 0.2;
        p[ALZ] = -0.2;
        p[TRX] = 1.3;
        p[TX] = 0.55;
        p[HX] = 0.35;
        p[BY] = -0.36;
        return;
      }
      case 'pestle': {
        // the mortar held to the chest, the pestle grinding round
        p[ARX] = -0.95 + Math.sin(u * TAU * 2) * 0.12;
        p[ARY] = Math.cos(u * TAU * 2) * 0.12;
        p[ARZ] = 0.32;
        p[TRX] = 1.5;
        p[ALX] = -0.9;
        p[ALZ] = -0.42;
        p[TLX] = 0.9;
        p[TX] = 0.12;
        p[HX] = 0.42;
        return;
      }
      case 'sail': {
        // sitting in the boat, pulling the oar
        const v = Math.sin(t * 2.6);
        p[ARX] = -1.25 + v * 0.35;
        p[ALX] = -1.25 + v * 0.35;
        p[ARZ] = 0.15;
        p[ALZ] = -0.15;
        p[TRX] = 1.45;
        p[TX] = 0.1 - v * 0.12;
        p[BY] = -0.42;
        return;
      }
      case 'salvage': {
        // leaning over the side with the boathook
        const v = u < 0.5 ? smooth(u / 0.5) : 1 - smooth((u - 0.5) / 0.5);
        p[ARX] = -1.2 - v * 0.6;
        p[ALX] = -1.1 - v * 0.5;
        p[TRX] = 0.9;
        p[TX] = 0.35 + v * 0.2;
        p[BY] = -0.42;
        return;
      }
      case 'tanning': {
        const s = Math.sin(u * TAU * 2);
        p[ARX] = -1.15 + s * 0.15;
        p[ALX] = -1.15 + s * 0.15;
        p[ARZ] = 0.3;
        p[ALZ] = -0.3;
        p[TRX] = 1.2;
        p[TX] = 0.2;
        p[HX] = 0.3;
        p[BZ] = s * 0.05;
        return;
      }
    }
  }

  /** Blends the smoothed pose over what CreatureView set this frame. */
  private applyPose(wk: Worker, view: CreatureView, c: Player, dt: number): void {
    const rig = wk.rig;
    const p = wk.pose;
    const w = wk.w;
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, p[ARX], w);
    rig.armR.rotation.y = p[ARY] * w;
    rig.armR.rotation.z = lerp(rig.armR.rotation.z, p[ARZ], w);
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, p[ALX], w);
    rig.armL.rotation.y = p[ALY] * w;
    rig.armL.rotation.z = p[ALZ] * w;
    rig.torso.rotation.x = lerp(rig.torso.rotation.x, p[TX], w);
    rig.torso.rotation.y = lerp(rig.torso.rotation.y, p[TY], w);
    rig.head.rotation.x = p[HX] * w;
    rig.head.rotation.y = lerp(rig.head.rotation.y, p[HY], w);
    rig.body.position.y += p[BY] * w;
    rig.body.position.z = lerp(rig.body.position.z, p[BZ], w);
    // tools keep their grip angle and ignore the arm's inward tilt
    wk.holdR.rotation.set(p[TRX], 0, -rig.armR.rotation.z);
    wk.holdL.rotation.set(p[TLX], 0, -rig.armL.rotation.z);
    // face the tree / rock / water / station
    const a = wk.act;
    if (a && FACES_TARGET[a.kind] && (a.x !== c.x || a.y !== c.y)) {
      const want = Math.atan2(a.x - c.x, a.y - c.y);
      wk.yaw = angleLerp(wk.yaw, want, 1 - Math.exp(-dt * 14));
    } else wk.yaw = view.rig.root.rotation.y;
    rig.root.rotation.y = angleLerp(rig.root.rotation.y, wk.yaw, w);
  }

  private updateFx(wk: Worker, view: CreatureView, act: Activity, kind: ActivityKind, dt: number): void {
    const off = view.yOffset;
    const crossed = (th: number) => wk.prevU < th && wk.u >= th;
    const near = this.ctx.near(act.x, act.y);
    switch (kind) {
      case 'fish':
        this.fishFx(wk, act, off, dt);
        return;
      case 'anvil':
        if (near && crossed(0.5)) {
          this.effects.burst(this.v1.set(act.x, off + 0.78, act.y), 0xffc04a, 5, 2.0, 9, 0.035);
          this.fx.flash(act.x, off + 0.8, act.y, 0xffd070, 0.32, 0.1);
        }
        return;
      case 'knife':
        if (near && (crossed(0.28) || crossed(0.78))) {
          this.headPos(wk, this.v1);
          this.effects.burst(this.v1, 0xd8b080, 3, 0.9, 6, 0.035);
        }
        return;
      case 'chisel':
        if (near && (crossed(0.3) || crossed(0.63) || crossed(0.97))) {
          this.headPos(wk, this.v1);
          this.effects.burst(this.v1, 0xd8d8e0, 2, 0.8, 6, 0.03);
        }
        return;
      case 'tinderbox': {
        if (near && (crossed(0.1) || crossed(0.3) || crossed(0.5))) {
          this.headPos(wk, this.v1);
          this.effects.burst(this.v1, 0xffb040, 4, 1.4, 6, 0.03);
          this.fx.flash(this.v1.x, this.v1.y, this.v1.z, 0xffd080, 0.22, 0.08);
        }
        // the flame catches on the logs in front of you
        if (!wk.flame) wk.flame = this.fx.acquireFlame();
        wk.flameSize = Math.max(wk.flameSize, smooth((wk.u - 0.55) / 0.4));
        const yaw = wk.rig.root.rotation.y;
        wk.flame.obj.position.set(wk.rig.root.position.x + Math.sin(yaw) * 0.55, off + 0.02, wk.rig.root.position.z + Math.cos(yaw) * 0.55);
        this.fx.flicker(wk.flame, wk.flameSize, wk.u * 7);
        return;
      }
      default:
        void dt;
    }
  }

  private fishFx(wk: Worker, act: Activity, off: number, dt: number): void {
    if (!wk.cur?.tip) return;
    if (!wk.line) wk.line = this.fx.acquireLine();
    const l = wk.line;
    wk.rig.root.updateMatrixWorld(true);
    const tip = wk.cur.tip.getWorldPosition(this.v1);
    // the bobber sits on the water just short of the tile centre
    const spot = this.towardWorker(wk, act.x, act.y, 0.25, off + WATER_Y);
    const bob = this.v3;
    let sag = 0.25;
    let show = true;
    if (wk.fish === 'cast') {
      const s = (wk.fishT - 0.48) / 0.47;
      if (s < 0) show = false;
      else {
        const k = clamp01(s);
        bob.lerpVectors(tip, spot, easeOut(k));
        bob.y += Math.sin(k * Math.PI) * 0.7;
        sag = 0.05;
        if (s >= 1 && !wk.landed) {
          wk.landed = true;
          if (this.ctx.near(act.x, act.y)) this.effects.ring(spot, 0xcfe8ff, 0.06, 0.35, 0.5);
        }
      }
    } else if (wk.fish === 'reel') {
      const k = clamp01(wk.fishT / 0.7);
      bob.lerpVectors(spot, tip, easeIn(k));
      bob.y += Math.sin(k * Math.PI) * 0.4;
      sag = 0.02;
      if (k > 0.92) show = false;
    } else {
      bob.copy(spot);
      bob.y += Math.sin(wk.time * 3.1) * 0.012 - wk.dip * 0.06;
      sag = 0.35;
      // slow rings spread round the float; a nibble (dip) sends one at once
      wk.ripple -= dt;
      if (wk.ripple <= 0) {
        wk.ripple = 1.6 + Math.random() * 1.2;
        if (this.ctx.near(act.x, act.y)) this.effects.ring(this.v2.set(bob.x, off + WATER_Y + 0.005, bob.z), 0xcfe8ff, 0.05, 0.28 + wk.dip * 0.12, 0.9);
      }
    }
    if (!show) {
      l.line.visible = false;
      l.bobber.visible = false;
      return;
    }
    l.bobber.position.copy(bob);
    l.bobber.visible = true;
    this.fx.setLine(l, tip, bob, sag);
  }

  /** World point `dist` from tile (x, y) towards the worker, at height `h`. */
  private towardWorker(wk: Worker, x: number, y: number, dist: number, h: number): THREE.Vector3 {
    const rx = wk.rig.root.position.x - x, rz = wk.rig.root.position.z - y;
    const len = Math.hypot(rx, rz) || 1;
    return this.v2.set(x + (rx / len) * dist, h, y + (rz / len) * dist);
  }

  /** World position of the working end of the held tool. */
  private headPos(wk: Worker, out: THREE.Vector3): THREE.Vector3 {
    const h = wk.cur?.head;
    if (!h) return out.copy(wk.rig.root.position).setY(wk.rig.root.position.y + 0.9);
    wk.rig.root.updateMatrixWorld(true);
    return h.getWorldPosition(out);
  }

  private hideFx(wk: Worker): void {
    if (wk.line) {
      this.fx.releaseLine(wk.line);
      wk.line = null;
    }
    if (wk.flame) {
      this.fx.release(wk.flame);
      wk.flame = null;
    }
  }

  /** Gives pooled pieces back; `restore` also puts the rig back to its normal look (it stays on screen). */
  private release(wk: Worker, restore: boolean): void {
    this.hideFx(wk);
    if (!restore) return;
    const rig = wk.rig;
    for (const t of wk.tools.values()) {
      if (t.right) t.right.visible = false;
      if (t.left) t.left.visible = false;
    }
    if (rig.gear) {
      rig.gear.weaponMount.visible = true;
      rig.gear.shieldMount.visible = true;
    }
    rig.armR.rotation.y = 0;
    rig.armL.rotation.y = 0;
    rig.armL.rotation.z = 0;
    rig.head.rotation.x = 0;
  }
}
