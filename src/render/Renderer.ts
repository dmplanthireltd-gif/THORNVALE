import * as THREE from 'three';
import type { Controller } from '../client/Controller';
import type { Effect, GameEvent } from '../game/core/events';
import { chebyshev } from '../game/core/types';
import { Enemy } from '../game/enemies/Enemy';
import type { Creature } from '../game/entities/Creature';
import type { GroundBag } from '../game/Game';
import { itemDef, type Element } from '../game/inventory/items';
import { treeAt } from '../game/gathering/woodcutting';
import { isFishingWater } from '../game/gathering/fishing';
import { NPCS } from '../game/npc/npcs';
import { Npc } from '../game/npc/Npc';
import { Player, spellLight } from '../game/player/Player';
import { CreatureView } from './CreatureView';
import { blockReaction, defensiveGuard } from './anim/blockFx';
import { Effects, type FieldKind } from './Effects';
import { applyGear } from './models/humanoid';
import { buildPlayerRig } from './models/playerModel';
import { mat, toonGradient } from './models/parts';
import { mergeRig } from './models/rigMerge';
import { CAMERA_TILT_DEG, CameraController } from './CameraController';
import { itemIcon } from '../ui/icons';
import { buildEnemy, buildNpc, ENEMY_SCALE, type BipedRig, type Rig } from './models/rigs';
import { Overlay } from './Overlay';
import { PixelPass, TILE_PX } from './PixelPass';
import { WorldView } from './WorldView';
import { UnderwaterFx, type Breather } from './sea/underwater';
import { Blood } from './Blood';
import { playSkillFx } from './skillFx';
import { SkillAnimator } from './skillAnim';
import { oreAt } from '../game/gathering/mining';
import { stationAt } from '../game/production/recipes';
import { Obj, WorldMap, type EnemyKind } from '../game/world/WorldMap';
import { WeatherView, type WeatherQuality } from './weather/WeatherView';
import { TrapView } from './weather/trapView';
import { FpsWatch, GRAPHICS, storeGraphics, storedGraphics, type GraphicsQuality } from './graphics';

export type PickResult =
  | { kind: 'enemy' | 'npc' | 'player'; id: number }
  | { kind: 'bag'; id: number }
  | { kind: 'tile'; x: number; y: number; usable: boolean }
  | null;

const BLOOD: Partial<Record<string, number>> = {
  skeleton: 0xe6dfc6, fire_elemental: 0xff8a2a, ghoul: 0x6a8a4a, tarantula: 0x7ad04a, hydra: 0x4a8a3a, elf_arcanist: 0xb3221b,
};

const VIEW_RANGE = 15;
/** Where the sun stands relative to the camera focus (west, up, south). */
const SUN_OFFSET = { x: 12, y: 40, z: 16 };
const TILT_COS = Math.cos(THREE.MathUtils.degToRad(CAMERA_TILT_DEG));
const DROP_RANGE = 22;

/**
 * Presentation layer. Reads game state every frame and reacts to game events;
 * it never mutates the simulation. Draws the player's floor plus the floors
 * you can see from there, and keeps creature models only near the camera.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: CameraController;
  readonly overlay: Overlay;
  readonly worldView: WorldView;
  private effects: Effects;
  private pixel = new PixelPass();
  private views = new Map<number, CreatureView>();
  private bagMeshes = new Map<number, THREE.Group>();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private torch: THREE.PointLight;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private delayed: Array<{ t: number; fn: () => void }> = [];
  /** Counts frames, so events of one game tick can be tied together. */
  private fxFrame = 0;
  /** Visuals of a hit wait for the missile that carries them (target id → pending hit). */
  private pendingHits = new Map<number, { frame: number; fns: Array<() => void> }>();
  private lastProjectile: { frame: number; toId: number } | null = null;
  private lastCast: { frame: number; casterId: number } | null = null;
  private hover: PickResult = null;
  private time = 0;
  private lastPz = Number.NaN;
  private blood!: Blood;
  /** Tools in hand and work loops for mining, woodcutting, fishing and production (skillAnim.ts). */
  private skillAnim!: SkillAnimator;
  /** The underwater look of the Sunken Reach (sea/underwater.ts). */
  private underwater!: UnderwaterFx;
  private sky = new THREE.Color(0x2a4f6e);
  private dark = new THREE.Color(0x000000);
  /** Rain, snow, sand, mist, wind and lightning (render/weather/). */
  private weather!: WeatherView;
  /** Jungle traps: tell-tale leaves and the spring animations. */
  private trapView!: TrapView;
  private baseHemi = 1.15;
  private baseSun = 2.3;
  private stormSky = new THREE.Color(0x3a4048);
  private skyNow = new THREE.Color();
  private skyFlash = new THREE.Color(0xdde6ff);
  /** Settings → Display → Graphics (graphics.ts). */
  graphics: GraphicsQuality = storedGraphics();
  private fps = new FpsWatch();
  /** Called once when the game has run slowly for a while on High (the HUD suggests a lower setting). */
  onSlow: (() => void) | null = null;

  constructor(private readonly container: HTMLElement, private readonly ctl: Controller) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';
    this.scene.background = this.sky.clone();

    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5e32, 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 90;
    // north-up shadow map, so the fitted box (fitShadow) is a tight rectangle around the view
    sc.up.set(0, 0, -1);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.torch = new THREE.PointLight(0xffc27a, 0, 10, 1.2);
    this.scene.add(this.torch);

    const p = this.me;
    this.cam = new CameraController(p.x, p.y);
    this.worldView = new WorldView(ctl.game.world, this.scene, (x, y, z) => ctl.game.stumpOrigin(x, y, z));
    this.worldView.isRuneField = (x, y, z) => this.ctl.game.fieldAt(x, y, z) !== null;
    this.effects = new Effects(this.scene);
    this.blood = new Blood(this.scene, (z) => this.worldView.floorOffset(z));
    this.skillAnim = new SkillAnimator(this.scene, this.effects, { game: () => this.ctl.game, near: (x, y) => chebyshev(x, y, this.me.x, this.me.y) <= VIEW_RANGE + 2 });
    this.underwater = new UnderwaterFx(this.scene, ctl.game.world, { hemi: this.hemi, sun: this.sun, torch: this.torch, background: this.scene.background as THREE.Color }, () => {
      this.lastPz = Number.NaN;
    });
    this.overlay = new Overlay(container, this.cam.camera);
    this.weather = new WeatherView(this.scene);
    this.trapView = new TrapView(this.scene, ctl.game, () => this.worldView.floorOffset(0));
    for (const b of ctl.game.bags) this.addBag(b);

    ctl.game.events.on((e) => this.onEvent(e));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.worldView.update(0, p.z, [{ x: p.x, y: p.y }], []);
    this.applyGraphics();
    this.precompile();
  }

  /**
   * Compiles every shader the world needs up front, in both light setups (sun
   * shadows above ground, none below), so the first step underground or onto a
   * new floor never freezes the game while shaders compile.
   */
  private precompile(): void {
    try {
      const cast = this.sun.castShadow;
      this.sun.castShadow = true;
      this.renderer.compile(this.scene, this.cam.camera);
      this.sun.castShadow = false;
      this.renderer.compile(this.scene, this.cam.camera);
      this.sun.castShadow = cast;
    } catch {
      /* compiling early is only an optimisation */
    }
  }

  /** Settings → Display → Graphics: High / Medium / Low. */
  setGraphics(q: GraphicsQuality): void {
    this.graphics = q;
    storeGraphics(q);
    this.applyGraphics();
  }

  private applyGraphics(): void {
    const g = GRAPHICS[this.graphics];
    if (this.sun.shadow.mapSize.x !== g.shadowMap) {
      this.sun.shadow.mapSize.set(g.shadowMap, g.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.lastPz = Number.NaN; // updateLighting turns the sun's shadows on/off
    this.worldView.setGraphics(g);
    this.weather.particleShare = g.particles;
    this.cam.setZoomOutCut(g.zoomOutCut);
    if (!this.cam.pixelMode) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, g.maxPixelRatio));
      this.resize();
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private get me(): Player {
    const p = this.ctl.game.getPlayer(this.ctl.pid);
    if (!p) throw new Error('Local player missing');
    return p;
  }

  /** Settings → Weather effects (High / Low / Off). */
  setWeatherQuality(q: WeatherQuality): void {
    this.weather.setQuality(q);
  }

  get weatherQuality(): WeatherQuality {
    return this.weather.quality;
  }

  setPixelMode(on: boolean): void {
    this.cam.setPixelMode(on);
    this.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, GRAPHICS[this.graphics].maxPixelRatio));
    this.resize();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cam.resize(w, h);
    this.overlay.resize(w, h);
  }

  // ------------------------------------------------------------------ creature views

  private buildRig(c: Creature): Rig {
    let rig: Rig;
    if (c instanceof Player && c.illusion) {
      // Creature Illusion: drawn as the monster
      const kind = c.illusion as EnemyKind;
      rig = buildEnemy(kind);
      const sc = ENEMY_SCALE[kind] ?? 1;
      rig.root.scale.setScalar(sc);
      rig.height *= sc;
      return rig;
    } else if (c instanceof Player) {
      rig = buildPlayerRig(c.appearance);
      this.gearUp(rig as BipedRig, c.id);
    } else if (c instanceof Npc) {
      rig = buildNpc(NPCS[c.key]);
    } else {
      rig = buildEnemy((c as Enemy).enemyKind);
    }
    const s = c instanceof Enemy ? ENEMY_SCALE[c.enemyKind] : 1.3;
    rig.root.scale.setScalar(s);
    rig.height *= s;
    return rig;
  }

  private gearUp(rig: BipedRig, pid: number): void {
    const s = this.ctl.game.session(pid);
    if (!s) return;
    const eq = s.inventory.equipment;
    const show = s.player.showGear;
    const id = (k: keyof typeof eq) => (show ? eq[k]?.id ?? null : null);
    // the founder cloak is a look, not gear: it shows even with "show gear" off
    // the cloak switch (cosmetics) also hides a worn cape
    applyGear(rig, {
      weapon: id('weapon'), shield: id('shield'), armor: id('armor'), head: id('head'), legs: id('legs'), feet: id('feet'), cloak: s.player.cloak || null,
      cape: s.cosmetics.hideCloak ? null : id('cape'),
    });
  }

  private ensureView(c: Creature): CreatureView {
    let v = this.views.get(c.id);
    if (!v) {
      const rig = this.buildRig(c);
      // fewer draw calls per character, same look (models/rigMerge.ts)
      mergeRig(rig);
      v = new CreatureView(c, rig, this.scene);
      this.views.set(c.id, v);
    }
    return v;
  }

  private dropView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    this.skillAnim.forget(id);
    v.dispose();
    this.views.delete(id);
    this.overlay.removeLabel(id);
  }

  private rebuildView(id: number): void {
    const v = this.views.get(id);
    if (!v) return;
    const c = v.creature;
    this.dropView(id);
    this.ensureView(c);
  }

  // ------------------------------------------------------------------ rune fields

  /** Standing looks of fields laid by runes (and synced from snapshots online): "x,y,z" → object. */
  private fieldMeshes = new Map<string, THREE.Object3D>();

  private fieldKind(obj: number): FieldKind {
    return obj === Obj.FireField ? 'fire' : obj === Obj.EnergyField ? 'energy' : obj === Obj.MagicWall ? 'wall' : 'poison';
  }

  private syncFieldMesh(x: number, y: number, z: number): void {
    const k = WorldMap.key(x, y, z);
    const obj = this.ctl.game.fieldAt(x, y, z);
    const old = this.fieldMeshes.get(k);
    if (old && old.userData.obj === obj) return;
    if (old) {
      // geometry, materials and textures are shared by every field: nothing to dispose
      this.scene.remove(old);
      this.fieldMeshes.delete(k);
    }
    if (obj === null) return;
    const kind = this.fieldKind(obj);
    const o = this.effects.fieldObject(kind, x, y);
    o.userData.obj = obj;
    o.userData.kind = kind;
    o.userData.tile = { x, y, z };
    this.scene.add(o);
    this.fieldMeshes.set(k, o);
  }

  private updateFieldMeshes(dt: number): void {
    for (const m of this.fieldMeshes.values()) {
      const t = m.userData.tile as { x: number; y: number; z: number };
      const off = this.worldView.floorOffset(t.z);
      m.visible = off !== null && chebyshev(t.x, t.y, this.me.x, this.me.y) <= VIEW_RANGE + 2;
      if (!m.visible) continue;
      m.position.set(t.x, off!, t.y);
      this.effects.fieldTick(m.userData.kind as FieldKind, t.x, off!, t.y, dt);
    }
  }


  // ------------------------------------------------------------------ bags

  private itemTex = new Map<string, THREE.Texture>();
  private itemGeo = new THREE.PlaneGeometry(0.9, 0.9);

  /** The item's icon as a pixel texture (same art as the backpack). */
  private texFor(id: string): THREE.Texture {
    let t = this.itemTex.get(id);
    if (t) return t;
    const img = new Image();
    const tex = new THREE.Texture(img);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    img.onload = () => {
      tex.needsUpdate = true;
    };
    img.src = itemIcon(id);
    this.itemTex.set(id, tex);
    t = tex;
    return t;
  }

  /** Rebuilds what a pile on the ground looks like: its top items, drawn big like classic item sprites. */
  /** A fallen adventurer lying face down: shared geometry, drawn once per body. */
  private static bodyParts: { geo: THREE.BufferGeometry; mat: THREE.Material; pos: [number, number, number]; rot: [number, number, number] }[] | null = null;

  private paintCorpse(vis: THREE.Group): void {
    if (!Renderer.bodyParts) {
      const cloth = mat(0x5a4636);
      const skin = mat(0xb08a70);
      const dark = mat(0x3a2e26);
      const blood = new THREE.MeshBasicMaterial({ color: 0x5c0a0a, transparent: true, opacity: 0.85, depthWrite: false });
      const limb = new THREE.CylinderGeometry(0.055, 0.045, 0.42, 7);
      Renderer.bodyParts = [
        { geo: new THREE.CircleGeometry(0.42, 18), mat: blood, pos: [0.05, 0.012, 0.05], rot: [-Math.PI / 2, 0, 0] },
        { geo: new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), mat: cloth, pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0.15] },
        { geo: new THREE.SphereGeometry(0.1, 12, 10), mat: skin, pos: [0.04, 0.1, -0.33], rot: [0, 0, 0] },
        { geo: limb, mat: cloth, pos: [-0.2, 0.06, -0.1], rot: [Math.PI / 2, 0, 0.7] },
        { geo: limb, mat: cloth, pos: [0.22, 0.06, -0.05], rot: [Math.PI / 2, 0, -0.4] },
        { geo: limb, mat: dark, pos: [-0.08, 0.06, 0.36], rot: [Math.PI / 2, 0, 0.15] },
        { geo: limb, mat: dark, pos: [0.1, 0.06, 0.38], rot: [Math.PI / 2, 0, -0.25] },
      ];
    }
    for (const part of Renderer.bodyParts) {
      const m = new THREE.Mesh(part.geo, part.mat);
      m.position.set(...part.pos);
      m.rotation.set(...part.rot);
      vis.add(m);
    }
    vis.rotation.y = 0.6;
  }

  private paintPile(g: THREE.Group, b: GroundBag): void {
    if (b.corpse) {
      if (g.userData.sig === 'corpse') return;
      g.userData.sig = 'corpse';
      (g.userData.vis as THREE.Group).clear();
      this.paintCorpse(g.userData.vis as THREE.Group);
      return;
    }
    const sig = b.items.slice(-3).map((i) => i.id).join(',');
    if (g.userData.sig === sig) return;
    g.userData.sig = sig;
    const vis = g.userData.vis as THREE.Group;
    vis.clear();
    const top = b.items.slice(-3);
    if (!top.length) {
      // contents unknown (should not happen): a plain sack
      const sackMat = mat(0x8b6a3e);
      const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), sackMat);
      sack.scale.set(1, 0.85, 1);
      sack.position.y = 0.17;
      vis.add(sack);
      return;
    }
    // standing sprites tilted to face the camera; older items peek out behind the newest
    const lean = -(Math.PI / 2 - THREE.MathUtils.degToRad(CAMERA_TILT_DEG));
    top.forEach((it, i) => {
      const depth = top.length - 1 - i;
      const m = new THREE.Mesh(this.itemGeo, new THREE.MeshToonMaterial({ map: this.texFor(it.id), alphaTest: 0.5, gradientMap: toonGradient() }));
      m.rotation.x = lean;
      m.position.set(-depth * 0.14, 0.24 + depth * 0.02, -depth * 0.12);
      m.renderOrder = 1;
      vis.add(m);
    });
  }

  private addBag(b: GroundBag): void {
    if (this.bagMeshes.has(b.id)) return;
    const g = new THREE.Group();
    const vis = new THREE.Group();
    g.add(vis);
    g.userData.vis = vis;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), new THREE.MeshBasicMaterial());
    hit.position.y = 0.35;
    hit.visible = false;
    hit.userData.bagId = b.id;
    g.add(hit);
    g.userData.hit = hit;
    g.userData.bag = b;
    // piles put on furniture lie on its top
    const o = this.ctl.game.world.getObj(b.x, b.y, b.z);
    const top = o === Obj.Locker ? 1.66 : o === Obj.Counter ? 0.86 : o === Obj.Table ? 0.6 : o === Obj.Crate ? 0.75 : o === Obj.Barrel ? 0.8 : 0;
    g.position.set(b.x, top, b.y);
    g.userData.top = top;
    g.scale.setScalar(0.01);
    this.paintPile(g, b);
    this.scene.add(g);
    this.bagMeshes.set(b.id, g);
  }

  private removeBag(id: number): void {
    const g = this.bagMeshes.get(id);
    if (!g) return;
    this.scene.remove(g);
    this.bagMeshes.delete(id);
  }

  // ------------------------------------------------------------------ helpers for events

  private visibleView(id: number): CreatureView | null {
    const v = this.views.get(id);
    return v && v.rig.root.visible ? v : null;
  }

  private chest(id: number): THREE.Vector3 {
    const v = this.views.get(id);
    if (!v) return new THREE.Vector3();
    const p = v.rig.root.position;
    return new THREE.Vector3(p.x, v.yOffset + v.rig.height * 0.55, p.z);
  }

  private head(id: number): THREE.Vector3 {
    const v = this.views.get(id);
    if (!v) return new THREE.Vector3();
    return v.labelAnchor(new THREE.Vector3());
  }

  /** Leaves a splat on the floor under someone who was hit (bigger hits, more blood). */
  private bleed(id: number, color: number, amount: number): void {
    const c = this.ctl.game.getCreature(id);
    if (!c) return;
    const chance = Math.min(1, 0.45 + amount / 60);
    if (Math.random() > chance) return;
    const v = c.visualPos();
    this.blood.add(v.x, v.y, c.z, color, 0.7 + Math.min(0.6, amount / 90));
  }

  private bloodFor(id: number): number {
    const e = this.ctl.game.getEnemy(id);
    return (e && BLOOD[e.enemyKind]) ?? 0xb3221b;
  }

  private float(id: number, text: string, cls: string, max = 1.1, rise = 0): void {
    if (!this.visibleView(id)) return;
    const at = this.head(id).add(new THREE.Vector3(0, rise, 0));
    this.overlay.float(text, cls, at, () => this.head(id).add(new THREE.Vector3(0, rise, 0)), max);
  }

  /** Runs a hit's visuals now, or when the missile launched at `id` this tick lands. */
  private withHit(id: number, fn: () => void): void {
    const rec = this.pendingHits.get(id);
    if (rec && rec.frame === this.fxFrame) rec.fns.push(fn);
    else fn();
  }

  private damageFx(e: Extract<GameEvent, { type: 'damage' }>): void {
    const v = this.visibleView(e.targetId);
    if (!v) return;
    const me = this.ctl.pid;
    const pos = this.chest(e.targetId);
    if (e.result === 'hit') {
      v.onHurt();
      const el: Element = e.element;
      const power = Math.min(1.6, 0.35 + e.amount / 90);
      if (el === 'physical') {
        const col = this.bloodFor(e.targetId);
        this.effects.impact(pos, 'physical', power);
        this.effects.burst(pos, col, 6 + Math.min(10, Math.floor(e.amount / 10)), 2.4);
        this.bleed(e.targetId, col, e.amount);
      } else {
        this.effects.impact(pos, el as Effect, power);
        if (el === 'death' && e.amount > 0) {
          // death magic tears flesh: a bloody burst on top of the dark one
          const col = this.bloodFor(e.targetId);
          this.effects.burst(pos, col, 4 + Math.min(10, Math.floor(e.amount / 15)), 2.4);
          this.bleed(e.targetId, col, e.amount);
        } else if (e.amount > 0 && Math.random() < 0.5) this.bleed(e.targetId, this.bloodFor(e.targetId), e.amount * 0.6);
      }
      // a heavy blow on you jolts the view a little
      if (e.targetId === me && e.amount > 0) {
        const share = e.amount / Math.max(1, this.me.maxHp);
        if (share > 0.08) this.effects.shake(Math.min(3, 1 + share * 8), 0.25);
      }
      const cls = `dmg el-${el}${e.targetId === me ? ' taken' : ''}`;
      if (e.amount > 0) this.float(e.targetId, String(e.amount), cls);
      if (e.manaShield) this.float(e.targetId, String(e.manaShield), 'mana', 1.1, 0.25);
    } else if (e.result === 'blocked') {
      // weapon blows (melee/distance) are caught on the shield or parried; magic just fizzles
      if (e.element === 'physical') blockReaction(v, this.views.get(e.sourceId)?.creature.visualPos() ?? null, this.effects);
      else this.effects.block(pos);
      this.float(e.targetId, 'blocked', 'miss', 0.8);
    } else {
      this.effects.poff(pos);
      this.float(e.targetId, 'miss', 'miss', 0.8);
    }
  }

  private onEvent(e: GameEvent): void {
    const me = this.ctl.pid;
    if (e.type === 'mine' || e.type === 'chop' || e.type === 'fish' || e.type === 'craft') this.skillAnim.onEvent(e);
    switch (e.type) {
      case 'attack':
        this.visibleView(e.attackerId)?.onAttack();
        break;
      case 'damage': {
        if (!this.visibleView(e.targetId)) break;
        this.withHit(e.targetId, () => this.damageFx(e));
        break;
      }
      case 'heal': {
        if (!this.visibleView(e.targetId)) break;
        const id = e.targetId, amount = e.amount;
        this.withHit(id, () => {
          const v = this.visibleView(id);
          if (!v) return;
          const c = v.creature;
          // bigger heals look bigger: by share of max health and raw amount
          const power = Math.min(1.5, Math.max(amount / Math.max(1, c.maxHp) * 2.2, amount / 260));
          const p = v.rig.root.position;
          this.effects.heal(new THREE.Vector3(p.x, v.yOffset, p.z), power);
          this.float(id, `+${amount}`, 'heal');
        });
        break;
      }
      case 'mana': {
        const v = this.visibleView(e.targetId);
        if (!v) break;
        const p = v.rig.root.position;
        this.effects.mana(new THREE.Vector3(p.x, v.yOffset, p.z), e.amount / 150);
        this.float(e.targetId, `+${e.amount}`, 'mana');
        break;
      }
      case 'projectile': {
        if (!this.visibleView(e.fromId) && !this.visibleView(e.toId)) break;
        const to = e.toId;
        const effect = e.effect;
        const rec = { frame: this.fxFrame, fns: [] as Array<() => void> };
        this.pendingHits.set(to, rec);
        this.lastProjectile = { frame: this.fxFrame, toId: to };
        this.effects.missile(this.chest(e.fromId), () => this.chest(to), effect, () => {
          if (this.pendingHits.get(to) === rec) this.pendingHits.delete(to);
          if (rec.fns.length) for (const fn of rec.fns) fn();
          else if (effect !== 'arrow' && effect !== 'bolt' && effect !== 'spear' && effect !== 'star' && effect !== 'stone') this.effects.impact(this.chest(to), effect);
        });
        break;
      }
      case 'area': {
        const off = this.worldView.floorOffset(e.z);
        if (off === null) break;
        if (chebyshev(e.x, e.y, this.me.x, this.me.y) > VIEW_RANGE + 2) break;
        const fx = () => {
          if (e.radius === 0) {
            this.effects.buff(new THREE.Vector3(e.x, off, e.y), e.effect);
          } else {
            this.effects.explosion(e.x, e.y, off, e.radius, e.effect);
          }
        };
        // a rune thrown at a creature bursts when its missile lands
        const lp = this.lastProjectile;
        const t = lp && lp.frame === this.fxFrame ? this.ctl.game.getCreature(lp.toId) : null;
        if (t && t.x === e.x && t.y === e.y && e.radius > 0) this.withHit(t.id, fx);
        else fx();
        break;
      }
      case 'tiles': {
        const off = this.worldView.floorOffset(e.z);
        if (off === null || !e.tiles.length) break;
        if (chebyshev(e.tiles[0], e.tiles[1], this.me.x, this.me.y) > VIEW_RANGE + 6) break;
        const lc = this.lastCast;
        const caster = lc && lc.frame === this.fxFrame ? this.ctl.game.getCreature(lc.casterId) : null;
        if (!caster) {
          // runes laying fields and walls
          this.effects.fieldPlaced(e.tiles, off, e.effect);
          break;
        }
        // a spell: a straight line is a beam, anything wider a wave
        const t = e.tiles;
        let line = true;
        for (let i = 2; i < t.length; i += 2) {
          if ((t[i] - caster.x) * (t[1] - caster.y) !== (t[i + 1] - caster.y) * (t[0] - caster.x)) line = false;
        }
        if (line && t.length >= 4) this.effects.beam(t, caster.x, caster.y, off, e.effect);
        else this.effects.wave(t, caster.x, caster.y, off, e.effect);
        break;
      }
      case 'cast':
        this.lastCast = { frame: this.fxFrame, casterId: e.casterId };
        this.float(e.casterId, e.words, 'speech spell', 1.6, 0.15);
        break;
      case 'chat':
        this.float(e.id, `${e.name}: ${e.text}`, 'speech', 3.2, 0.15);
        break;
      case 'buff': {
        const v = this.visibleView(e.id);
        if (v && e.on) {
          const c = e.buff === 'haste' || e.buff === 'strongHaste' ? 0x9fe8ff : e.buff === 'magicShield' ? 0x7fb2ff
            : e.buff === 'poisoned' ? 0x7ad04a : e.buff === 'invisible' || e.buff === 'illusion' ? 0xb07aff : 0xfff2b0;
          const at = new THREE.Vector3(v.rig.root.position.x, v.yOffset + 0.05, v.rig.root.position.z);
          if (e.buff === 'poisoned') this.effects.burst(this.chest(e.id), 0x7ad04a, 10, 1.2, 2, 0.06);
          else this.effects.ring(at, c, 0.2, 1.1, 0.7, 0.8);
        }
        break;
      }
      case 'death': {
        const v = this.visibleView(e.id);
        if (!v) break;
        v.onDeath();
        const pos = this.chest(e.id);
        this.effects.burst(pos, this.bloodFor(e.id), 34, 3.2);
        {
          const c = this.ctl.game.getCreature(e.id);
          if (c) {
            const col = this.bloodFor(e.id);
            this.blood.add(c.x, c.y, c.z, col, 1.7, true);
            for (let i = 0; i < 3; i++) this.blood.add(c.x + (Math.random() - 0.5) * 1.2, c.y + (Math.random() - 0.5) * 1.2, c.z, col, 0.7);
          }
        }
        this.effects.burst(pos.setY(v.yOffset + 0.15), 0x8a7a62, 12, 1.4, 2, 0.1);
        break;
      }
      case 'spawn': {
        const v = this.views.get(e.id);
        if (v) {
          v.onRespawn();
          this.effects.ring(new THREE.Vector3(v.rig.root.position.x, v.yOffset + 0.05, v.rig.root.position.z), 0xb48cff, 0.2, 0.8, 0.6);
        }
        break;
      }
      case 'teleport': {
        if (e.id === me) {
          const p = this.me;
          this.cam.snapTo(p.x, p.y);
          this.effects.ring(new THREE.Vector3(p.x, 0.05, p.y), 0xffffff, 0.2, 0.9, 0.5);
        }
        const v = this.views.get(e.id);
        if (v) {
          v.onRespawn();
          this.effects.teleport(new THREE.Vector3(v.creature.x, v.yOffset, v.creature.y));
        }
        break;
      }
      case 'xp':
        if (e.to === me) this.float(e.atId, e.skill ? `+${e.amount} ${e.skill} xp` : `+${e.amount} exp`, e.skill ? 'xp skill' : 'xp', 1.4, 0.3);
        break;
      case 'chop': {
        // reuse the attack swing; wood chips fly, and leaves when the tree falls
        this.visibleView(e.id)?.onAttack();
        const off = this.worldView.floorOffset(e.z);
        if (off === null || chebyshev(e.x, e.y, this.me.x, this.me.y) > VIEW_RANGE + 2) break;
        this.effects.burst(new THREE.Vector3(e.x, off + 0.5, e.y), 0xc8a070, e.got ? 10 : 5, 1.8, 7, 0.06);
        if (e.felled) this.effects.burst(new THREE.Vector3(e.x, off + 1.6, e.y), 0x4a8a38, 26, 2.4, 4, 0.09);
        break;
      }
      case 'fish': {
        // a cast: the line goes out with a swing; a soft ring on the water, a splash and ripples when something bites
        this.visibleView(e.id)?.onAttack();
        const off = this.worldView.floorOffset(e.z);
        if (off === null || chebyshev(e.x, e.y, this.me.x, this.me.y) > VIEW_RANGE + 2) break;
        const at = new THREE.Vector3(e.x, off + 0.04, e.y);
        this.effects.ring(at, 0xcfe8ff, 0.08, 0.45, 0.6);
        if (e.got) {
          this.effects.burst(new THREE.Vector3(e.x, off + 0.1, e.y), 0xbfe0ff, 12, 1.6, 6, 0.06);
          this.effects.ring(at.clone(), 0x9fd0ff, 0.15, 0.9, 1.0);
          this.effects.ring(at.clone(), 0x9fd0ff, 0.1, 0.65, 1.3);
        }
        break;
      }
      case 'mine':
      case 'craft':
        // mining and blacksmithing visuals live in skillFx.ts
        playSkillFx({
          effects: this.effects, world: this.ctl.game.world, floorOffset: (z) => this.worldView.floorOffset(z),
          near: (x, y) => chebyshev(x, y, this.me.x, this.me.y) <= VIEW_RANGE + 2, swing: (id) => this.visibleView(id)?.onAttack(),
        }, e);
        break;
      case 'levelUp': {
        const v = this.visibleView(e.id);
        if (!v) break;
        const base = new THREE.Vector3(v.rig.root.position.x, v.yOffset + 0.05, v.rig.root.position.z);
        this.effects.ring(base, 0xffd34d, 0.3, 1.6, 0.9, 1.6);
        this.effects.ring(base.clone(), 0xffd34d, 0.2, 1.1, 1.1, 2.4);
        this.effects.sparkle(base, 0xffe27a, 40, 0.6);
        if (e.id === me) this.float(e.id, `LEVEL ${e.level}!`, 'level', 2);
        break;
      }
      case 'bagCreated': {
        const b = this.ctl.game.bags.find((x) => x.id === e.bagId);
        if (b) this.addBag(b);
        break;
      }
      case 'bagRemoved':
        this.removeBag(e.bagId);
        break;
      case 'tileChanged':
        this.worldView.onTileChanged(e.x, e.y, e.z);
        this.syncFieldMesh(e.x, e.y, e.z);
        break;
      case 'playerLeft':
      case 'despawn':
        this.dropView(e.id);
        break;
      case 'playerRespawn': {
        const v = this.views.get(e.id);
        v?.onRespawn();
        if (e.id === me) {
          const p = this.me;
          this.cam.snapTo(p.x, p.y);
          this.effects.ring(new THREE.Vector3(p.x, 0.05, p.y), 0xffffff, 0.2, 1.2, 0.8, 0.8);
        }
        break;
      }
      case 'equipmentChanged': {
        const v = this.views.get(e.id);
        if (v && v.rig.type === 'biped' && !(v.creature instanceof Player && v.creature.illusion)) {
          this.gearUp(v.rig, e.id);
          mergeRig(v.rig);
          v.setCastShadow(true, true);
        }
        break;
      }
      case 'lookChanged':
        this.rebuildView(e.id);
        break;
      case 'gameLoaded':
        if (e.to !== me) break;
        for (const id of [...this.views.keys()]) this.dropView(id);
        for (const id of [...this.bagMeshes.keys()]) this.removeBag(id);
        for (const b of this.ctl.game.bags) this.addBag(b);
        for (const k of [...this.fieldMeshes.keys()]) {
          const [x, y, z] = k.split(',').map(Number);
          this.fieldMeshes.get(k)!.userData.obj = -1;
          this.syncFieldMesh(x, y, z);
        }
        for (const f of this.ctl.game.fieldList()) {
          const [x, y, z] = f.split(',').map(Number);
          this.syncFieldMesh(x, y, z);
        }
        this.cam.snapTo(this.me.x, this.me.y);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ picking

  pick(clientX: number, clientY: number): PickResult {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam.camera);
    const g = this.ctl.game;
    const pz = this.me.z;

    const targets: THREE.Object3D[] = [];
    for (const [id, v] of this.views) {
      const c = v.creature;
      if (id === this.ctl.pid || c.dead || c.z !== pz || !v.rig.root.visible) continue;
      targets.push(v.hitbox);
    }
    for (const b of this.bagMeshes.values()) {
      if ((b.userData.bag as GroundBag).z === pz) targets.push(b.userData.hit as THREE.Object3D);
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length) {
      const o = hits[0].object;
      if (o.userData.bagId !== undefined) return { kind: 'bag', id: o.userData.bagId as number };
      const id = o.userData.creatureId as number;
      const c = g.getCreature(id);
      if (c) return { kind: c.kind === 'npc' ? 'npc' : c.kind === 'player' ? 'player' : 'enemy', id };
    }
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    const x = Math.round(hit.x);
    const y = Math.round(hit.z);
    if (!g.world.inBounds(x, y)) return null;
    // classic tile clicks: whatever stands on the clicked tile
    for (const c of g.creatures()) {
      if (c.dead || c.id === this.ctl.pid || c.z !== pz || c.x !== x || c.y !== y) continue;
      return { kind: c.kind === 'npc' ? 'npc' : c.kind === 'player' ? 'player' : 'enemy', id: c.id };
    }
    return { kind: 'tile', x, y, usable: g.isUsable(x, y, pz) };
  }

  /** The tile under the cursor (or under the creature there), for aiming runes. */
  pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const h = this.pick(clientX, clientY);
    if (!h) return null;
    if (h.kind === 'tile') return { x: h.x, y: h.y };
    if (h.kind === 'bag') {
      const b = this.ctl.game.bags.find((x) => x.id === h.id);
      return b ? { x: b.x, y: b.y } : null;
    }
    const c = this.ctl.game.getCreature(h.id);
    return c ? { x: c.x, y: c.y } : null;
  }

  private aim: { radius: number; range: number } | null = null;
  private aimGroup = new THREE.Group();
  private aimMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, depthWrite: false });

  /** Shows the area a rune will hit around the hovered tile (null hides it). */
  setAim(radius: number | null, range: number): void {
    this.aimGroup.clear();
    if (radius === null) {
      this.aim = null;
      return;
    }
    this.aim = { radius, range };
    if (!this.aimGroup.parent) this.scene.add(this.aimGroup);
    const geo = new THREE.PlaneGeometry(0.94, 0.94);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + radius) continue;
        const m = new THREE.Mesh(geo, this.aimMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(dx, 0.05, dy);
        m.renderOrder = 5;
        this.aimGroup.add(m);
      }
    }
    this.aimGroup.visible = false;
  }

  setHover(p: PickResult): void {
    this.hover = p;
  }

  showClickMarker(x: number, y: number): void {
    this.effects.showClick(x, y);
  }

  /** Name of what the mouse is over, for the status line. */
  describeHover(): string {
    const h = this.hover;
    const g = this.ctl.game;
    if (!h) return '';
    if (h.kind === 'bag') {
      const b = g.bags.find((x) => x.id === h.id);
      if (b?.corpse) return `The dead body of ${b.corpse}${b.items.length ? ' — click to open' : ' (empty)'}`;
      return b && b.items.length ? `A bag: ${b.items.map((i) => itemDef(i.id).name).join(', ')}` : 'A bag.';
    }
    if (h.kind === 'tile') {
      const o = g.world.getObj(h.x, h.y, this.me.z);
      const tree = treeAt(o);
      if (tree) return `A ${tree.name}${tree.level > 1 ? ` (woodcutting ${tree.level})` : ''}${h.usable ? ' — click to chop' : ''}`;
      if (o === Obj.Stump) return 'A tree stump. It will grow back.';
      if (o === Obj.MarketBoard) return 'Market board — buy from and sell to other players';
      if (o === Obj.Whirlpool) return this.me.z < 0 ? 'Rising bubbles — step in to swim up to Pearl Pier' : 'A whirlpool — step in to dive into the Sunken Reach';
      if (o === Obj.FoundersStone) return "The Founders' Stone — the names of Thornvale's Legends";
      const ore = oreAt(o);
      if (ore) return `A ${ore.name}${ore.level > 1 ? ` (mining ${ore.level})` : ''}${h.usable ? ' — click to mine' : ''}`;
      if (o === Obj.DepletedRock) return 'A mined-out rock. The ore will come back.';
      const st = stationAt(o);
      if (st) return st.id === 'furnace' ? 'A furnace — smelt ore into bars' : "An anvil — smith bars into gear (needs a smith's hammer)";
      if (h.usable && isFishingWater(g.world, h.x, h.y, this.me.z)) return 'Water — click to fish';
      return '';
    }
    const c = g.getCreature(h.id);
    if (!c) return '';
    if (c instanceof Player) return `${c.name} — level ${c.level} ${c.vocation}`;
    if (c instanceof Npc) return `${c.name} — ${NPCS[c.key]?.role ?? ''}`;
    return c.name;
  }

  // ------------------------------------------------------------------ frame

  private shadowFitKey = '';
  /**
   * Fits the sun's shadow camera tightly around what the camera can see (plus
   * the casters just outside it whose shadows fall into view), instead of a fixed
   * 40 × 40 tile square: far fewer objects go through the shadow pass.
   */
  private fitShadow(): void {
    const c = this.cam.camera;
    const key = `${c.right}:${c.top}`;
    if (key === this.shadowFitKey) return;
    this.shadowFitKey = key;
    // ground rectangle the view covers (relative to the focus), with margins: tall things north of the
    // view still show their tops, and casters up to ~6 high just west/south throw shadows into it
    const halfW = c.right + 3;
    const north = c.top / TILT_COS + 5;
    const south = c.top / TILT_COS + 4;
    const sc = this.sun.shadow.camera;
    const eye = new THREE.Vector3(-SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
    const basis = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(), sc.up);
    const ax = new THREE.Vector3().setFromMatrixColumn(basis, 0);
    const ay = new THREE.Vector3().setFromMatrixColumn(basis, 1);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [-halfW, halfW]) for (const z of [-north, south]) for (const y of [0, 10]) {
      p.set(x, y, z);
      const lx = p.dot(ax), ly = p.dot(ay);
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
      minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
    }
    sc.left = minX; sc.right = maxX; sc.bottom = minY; sc.top = maxY;
    sc.updateProjectionMatrix();
  }

  private updateLighting(pz: number): void {
    if (pz === this.lastPz) return;
    this.lastPz = pz;
    this.blood?.refresh();
    const under = pz < 0;
    (this.scene.background as THREE.Color).copy(under ? this.dark : this.sky);
    // below ground a dim, warm-grey ambient keeps rock and floor readable beyond your light
    this.baseHemi = this.hemi.intensity = under ? 0.3 : 1.15;
    this.hemi.color.setHex(under ? 0x9a948c : 0xcfe4ff);
    this.baseSun = this.sun.intensity = under ? 0.25 : 2.3;
    this.sun.castShadow = !under && GRAPHICS[this.graphics].shadows;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.fps.frame(performance.now()) && this.graphics === 'high') this.onSlow?.();
    this.fxFrame++;
    const g = this.ctl.game;
    const p = this.me;
    const pz = p.z;

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        d.fn();
      }
    }

    // world floors first so creature offsets match this frame
    const watch: Array<{ x: number; y: number }> = [];
    for (const e of g.enemies) if (!e.dead && e.z === pz && chebyshev(e.x, e.y, p.x, p.y) <= 7) watch.push(e.visualPos());
    for (const o of g.players()) if (o !== p && o.z === pz && chebyshev(o.x, o.y, p.x, p.y) <= 7) watch.push(o.visualPos());
    for (const b of g.bags) if (b.z === pz && chebyshev(b.x, b.y, p.x, p.y) <= 7) watch.push(b);
    const playerTiles = p.dead ? [] : [{ x: p.fromX, y: p.fromY }, { x: p.x, y: p.y }];
    this.worldView.update(dt, pz, playerTiles, watch);
    this.updateLighting(pz);

    // creatures: build models nearby, drop far ones
    const anchor = new THREE.Vector3();
    // only creatures whose shadow can fall into the view cast one: the sun stands west and south,
    // so shadows fall east and north (a little margin west/south, none east/north)
    const cc = this.cam.camera, fo = this.cam.focus;
    const sx0 = fo.x - cc.right - 2.5, sx1 = fo.x + cc.right + 1;
    const sz0 = fo.z - cc.top / TILT_COS - 3, sz1 = fo.z + cc.top / TILT_COS + 3;
    const consider = (c: Creature) => {
      const d = chebyshev(c.x, c.y, p.x, p.y);
      const off = this.worldView.floorOffset(c.z);
      const v = this.views.get(c.id);
      if (d > DROP_RANGE) {
        if (v) this.dropView(c.id);
        return;
      }
      if (off === null || d > VIEW_RANGE) {
        if (v) {
          v.rig.root.visible = false;
          this.overlay.setLabel(c.id, null, c.name, 0);
        }
        return;
      }
      const view = this.ensureView(c);
      view.yOffset = off;
      // invisible players show as a faint shimmer to other players, a little more to themselves
      view.ghost = c instanceof Player && c.buffs.invisible > 0 ? (c === p ? 0.45 : 0.2) : 1;
      const corpse = c instanceof Enemy ? c.corpseTimer > 0 : true;
      if (!c.dead) view.rig.root.visible = true;
      if (c === p) view.block.guard = defensiveGuard(p);
      view.update(dt, corpse);
      const rp = view.rig.root.position;
      view.setCastShadow(rp.x >= sx0 && rp.x <= sx1 && rp.z >= sz0 && rp.z <= sz1);
      this.skillAnim.apply(view, dt);
      if (this.underwater.active && c instanceof Player && !c.dead && c.z === pz) this.underwater.swim(view, c.id);
      if (c.dead || c.z !== pz) {
        this.overlay.setLabel(c.id, null, c.name, 0);
      } else {
        view.labelAnchor(anchor);
        const opts = {
          player: c === p, npc: c.kind === 'npc', other: c.kind === 'player' && c !== p, targeted: p.targetId === c.id, skull: c instanceof Player ? g.skullOf(c) : 0 as const, party: c instanceof Player ? g.partyFlag(p.id, c.id) : 0 as const,
          // bosses: gold crown and their title under the name
          boss: c instanceof Enemy && c.def.boss ? (c.def.title ?? '') : undefined,
          // founders: their title under the name
          title: c instanceof Player ? c.title : '',
        };
        this.overlay.setLabel(c.id, anchor, c.name, c.hp / c.maxHp, opts);
      }
    };
    for (const c of g.players()) consider(c);
    for (const c of g.npcs) consider(c);
    for (const c of g.enemies) consider(c);
    this.skillAnim.frame(dt);

    this.updateFieldMeshes(dt);

    for (const b of this.bagMeshes.values()) {
      const bag = b.userData.bag as GroundBag;
      const off = this.worldView.floorOffset(bag.z);
      b.visible = off !== null;
      if (off !== null) b.position.y = off + (b.userData.top ?? 0);
      b.scale.setScalar(Math.min(1, b.scale.x + dt * 5));
      this.paintPile(b, bag);
    }

    // markers
    const t = g.getCreature(p.targetId ?? -1);
    const tm = this.effects.targetMarker;
    if (t && !t.dead && t.z === pz) {
      const vp = t.visualPos();
      tm.visible = true;
      tm.position.set(vp.x, 0.026, vp.y);
      const pulse = 1 + Math.sin(this.time * 7) * 0.04;
      tm.scale.set(pulse, pulse, 1);
    } else {
      tm.visible = false;
    }
    const hm = this.effects.hoverMarker;
    const hv = this.hover;
    hm.visible = false;
    if (hv && hv.kind === 'tile') {
      hm.visible = true;
      hm.position.set(hv.x, 0.022, hv.y);
    } else if (hv && (hv.kind === 'enemy' || hv.kind === 'npc' || hv.kind === 'player')) {
      const c = g.getCreature(hv.id);
      if (c && !c.dead) {
        const vp = c.visualPos();
        hm.visible = true;
        hm.position.set(vp.x, 0.022, vp.y);
      }
    }

    // rune aiming preview
    if (this.aim) {
      const h = this.hover;
      let at: { x: number; y: number } | null = null;
      if (h && h.kind === 'tile') at = h;
      else if (h && h.kind !== 'bag') {
        const c = g.getCreature(h.id);
        if (c) at = { x: c.x, y: c.y };
      }
      this.aimGroup.visible = !!at;
      if (at) {
        this.aimGroup.position.set(at.x, 0, at.y);
        const ok = chebyshev(at.x, at.y, p.x, p.y) <= this.aim.range && g.world.lineOfSight(p.x, p.y, at.x, at.y, pz);
        this.aimMat.color.setHex(ok ? 0xffa040 : 0xff2020);
      }
    }

    // camera, light and darkness follow the player
    const vp = p.visualPos();
    this.cam.update(dt, vp.x, vp.y);
    const f = this.cam.focus;
    this.sun.position.set(f.x - SUN_OFFSET.x, SUN_OFFSET.y, f.z + SUN_OFFSET.z);
    this.sun.target.position.set(f.x, 0, f.z);
    this.fitShadow();
    const s = g.session(this.ctl.pid);
    const ringLight = s?.inventory.equipment.ring ? itemDef(s.inventory.equipment.ring.id).bonus?.light ?? 0 : 0;
    const light = (pz < 0 ? 2.5 : 0) + spellLight(p.buffs) + ringLight;
    this.torch.intensity = light > 0 ? (pz < 0 ? 5 + light * 1.4 : 1.5) : 0;
    this.torch.distance = 3 + light * 1.8;
    this.torch.position.set(vp.x, 2.2, vp.y + 0.3);
    // under the sea: blue light, fog, light shafts and bubbles (sea/underwater.ts)
    const breathers: Breather[] = [];
    if (this.underwater.active) {
      for (const v of this.views.values()) {
        const c = v.creature;
        if (!c.dead && c.z === pz && v.rig.root.visible) breathers.push({ id: c.id, x: v.rig.root.position.x, z: v.rig.root.position.z, top: v.yOffset + v.rig.height * 0.85 });
      }
    }
    this.underwater.update(dt, p, f, breathers);

    // weather: particles, haze, wind, storm light and lightning (nothing of it underground)
    const wl = this.weather.update(dt, g, p, this.cam.camera, this.worldView.floorOffset(pz) ?? 0, f.x, f.z);
    this.trapView.update(dt, p.x, p.y, pz);
    if (pz >= 0) {
      this.hemi.intensity = this.baseHemi * wl.hemi;
      this.sun.intensity = this.baseSun * wl.sun;
      this.skyNow.copy(this.sky).lerp(this.stormSky, wl.overcast * 0.75);
      if (wl.flash > 0) this.skyNow.lerp(this.skyFlash, wl.flash * 0.6);
      (this.scene.background as THREE.Color).copy(this.skyNow);
    }

    // shake the view in whole art pixels so the pixel grid never swims
    const sh = this.effects.shakeOffset();
    if (sh) {
      const px = this.cam.pixelMode ? 1 / TILE_PX : 0.03;
      this.cam.camera.position.x += sh.x * px;
      this.cam.camera.position.z += (sh.y * px) / Math.cos(THREE.MathUtils.degToRad(CAMERA_TILT_DEG));
    }
    this.effects.focus = { x: vp.x, z: vp.y };
    this.effects.update(dt);
    this.blood.update(dt);
    this.overlay.update(dt);
    if (this.cam.pixelMode) {
      const a = this.cam.artSize();
      if (this.renderer.getPixelRatio() !== 1) this.renderer.setPixelRatio(1);
      this.pixel.setSize(a.w, a.h);
      this.pixel.render(this.renderer, this.scene, this.cam.camera);
    } else {
      this.renderer.render(this.scene, this.cam.camera);
    }
  }
}
