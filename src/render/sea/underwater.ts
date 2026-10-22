import * as THREE from 'three';
import { isUnderwater } from '../../game/world/sea';
import type { WorldMap } from '../../game/world/WorldMap';
import type { CreatureView } from '../CreatureView';

const BUBBLES = 320;
const RAYS = 7;
const WATER = new THREE.Color(0x0b3442);
const FOG = new THREE.Color(0x0e4456);

export interface SceneLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  torch: THREE.PointLight;
  background: THREE.Color;
}

/** Something that breathes out bubbles now and then (a creature's head). */
export interface Breather {
  id: number;
  x: number;
  z: number;
  /** Height of the head above the floor. */
  top: number;
}

/**
 * The underwater look of the Sunken Reach (game/world/sea.ts), switched on while
 * the player is on the sea floor: blue-green light from above, fog that thickens
 * with distance, slanting shafts of light, bubbles rising from the floor, from
 * vents, from the bubble column and from every creature's mouth, and a gentle
 * swimming bob for players. Off again (lights restored) the moment you surface.
 */
export class UnderwaterFx {
  active = false;
  private time = 0;
  private fog = new THREE.Fog(FOG.getHex(), 54, 80);
  /** The sea-floor fog, for compiling shaders ahead of the first dive (Renderer.precompile). */
  get fogForCompile(): THREE.Fog {
    return this.fog;
  }
  private saved: { hemiGround: THREE.Color; sunColor: THREE.Color; torchColor: THREE.Color } | null = null;
  // bubbles (pooled)
  private bubbleMesh: THREE.InstancedMesh;
  private bx = new Float32Array(BUBBLES);
  private by = new Float32Array(BUBBLES);
  private bz = new Float32Array(BUBBLES);
  private bv = new Float32Array(BUBBLES);
  private bs = new Float32Array(BUBBLES);
  private bp = new Float32Array(BUBBLES);
  private live = 0;
  private nextAmbient = 0;
  private nextVent = 0;
  private breath = new Map<number, number>();
  // light shafts
  private rays: THREE.Mesh[] = [];
  private rayData: Array<{ x: number; z: number; phase: number }> = [];
  private group = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, private readonly world: WorldMap, private readonly lights: SceneLights, private readonly onExit: () => void) {
    const geo = new THREE.IcosahedronGeometry(0.05, 1);
    const mt = new THREE.MeshBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.62, depthWrite: false });
    this.bubbleMesh = new THREE.InstancedMesh(geo, mt, BUBBLES);
    this.bubbleMesh.count = 0;
    this.bubbleMesh.frustumCulled = false;
    this.bubbleMesh.renderOrder = 3;
    const rayTex = this.rayTexture();
    for (let i = 0; i < RAYS; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 10), new THREE.MeshBasicMaterial({
        map: rayTex, color: 0x9fe8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      ray.renderOrder = 2;
      this.rays.push(ray);
      this.rayData.push({ x: 0, z: 0, phase: i * 1.7 });
      this.group.add(ray);
    }
    this.group.add(this.bubbleMesh);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** A soft vertical gradient: bright at the top, fading toward the floor. */
  private rayTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 8, 64);
    const h = x.createLinearGradient(0, 0, 8, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.5, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = h;
    x.fillRect(0, 0, 8, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private emit(x: number, y: number, z: number, speed: number, size = 1): void {
    if (this.live >= BUBBLES) return;
    const i = this.live++;
    this.bx[i] = x;
    this.by[i] = y;
    this.bz[i] = z;
    this.bv[i] = speed;
    this.bs[i] = size * (0.6 + Math.random() * 0.8);
    this.bp[i] = Math.random() * 6.28;
  }

  private setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    this.group.visible = on;
    const L = this.lights;
    if (on) {
      this.saved = { hemiGround: L.hemi.groundColor.clone(), sunColor: L.sun.color.clone(), torchColor: L.torch.color.clone() };
      this.scene.fog = this.fog;
      this.live = 0;
      this.breath.clear();
    } else {
      if (this.scene.fog === this.fog) this.scene.fog = null;
      if (this.saved) {
        L.hemi.groundColor.copy(this.saved.hemiGround);
        L.sun.color.copy(this.saved.sunColor);
        L.torch.color.copy(this.saved.torchColor);
      }
      this.onExit();
    }
  }

  /**
   * Once a frame, after the normal lighting: `at` is the player's tile, `focus`
   * the camera's ground point, `breathers` the creatures on screen.
   */
  update(dt: number, at: { x: number; y: number; z: number }, focus: { x: number; z: number }, breathers: Iterable<Breather>): void {
    this.setActive(isUnderwater(this.world, Math.round(at.x), Math.round(at.y), at.z));
    if (!this.active) return;
    this.time += dt;
    const t = this.time;
    const L = this.lights;
    // light from far above, filtered blue-green
    L.background.copy(WATER);
    L.hemi.color.setHex(0x6ac0d8);
    L.hemi.groundColor.setHex(0x0a2430);
    L.hemi.intensity = 0.95;
    L.sun.color.setHex(0xa8e4ff);
    L.sun.intensity = 1.25 + Math.sin(t * 0.7) * 0.08;
    L.sun.castShadow = false;
    L.torch.color.setHex(0x8adcff);
    L.torch.intensity = 1.2;
    L.torch.distance = 6;

    // ---- bubbles: ambient ones from the floor around you, vents, the column and creatures
    const sea = this.world.sea!;
    this.nextAmbient -= dt;
    while (this.nextAmbient <= 0) {
      this.nextAmbient += 0.05;
      const x = focus.x + (Math.random() - 0.5) * 26, z = focus.z + (Math.random() - 0.5) * 20;
      if (isUnderwater(this.world, Math.round(x), Math.round(z), sea.z)) this.emit(x, 0.05, z, 0.7 + Math.random() * 0.6, 0.7);
    }
    this.nextVent -= dt;
    if (this.nextVent <= 0) {
      this.nextVent = 0.12;
      for (const p of sea.props) {
        if (p.k !== 'vent' || Math.abs(p.x - focus.x) > 16 || Math.abs(p.y - focus.z) > 13) continue;
        if (Math.random() < 0.6) this.emit(p.x + (Math.random() - 0.5) * 0.1, 0.42, p.y + (Math.random() - 0.5) * 0.1, 1.2 + Math.random() * 0.5, 1.2);
      }
      const c = sea.column;
      if (Math.abs(c.x - focus.x) < 18 && Math.abs(c.y - focus.z) < 14) {
        for (let k = 0; k < 2; k++) this.emit(c.x + (Math.random() - 0.5) * 0.6, 0.05, c.y + (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 0.8, 1.3);
      }
    }
    for (const b of breathers) {
      let n = this.breath.get(b.id) ?? Math.random() * 2;
      n -= dt;
      if (n <= 0) {
        n = 1.4 + Math.random() * 2.2;
        const k = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < k; i++) this.emit(b.x + (Math.random() - 0.5) * 0.15, b.top + i * 0.06, b.z + (Math.random() - 0.5) * 0.15, 0.9 + Math.random() * 0.4, 0.8);
      }
      this.breath.set(b.id, n);
    }
    // move, wobble and recycle (swap-remove keeps the live ones packed)
    let i = 0;
    while (i < this.live) {
      this.by[i] += this.bv[i] * dt;
      this.bp[i] += dt * 3;
      if (this.by[i] > 5.5) {
        const j = --this.live;
        this.bx[i] = this.bx[j]; this.by[i] = this.by[j]; this.bz[i] = this.bz[j]; this.bv[i] = this.bv[j]; this.bs[i] = this.bs[j]; this.bp[i] = this.bp[j];
        continue;
      }
      const sc = this.bs[i] * (1 + this.by[i] * 0.08);
      this.m.compose(this.v.set(this.bx[i] + Math.sin(this.bp[i]) * 0.05, this.by[i], this.bz[i] + Math.cos(this.bp[i] * 0.8) * 0.04), this.q.identity(), this.s.setScalar(sc));
      this.bubbleMesh.setMatrixAt(i, this.m);
      i++;
    }
    this.bubbleMesh.count = this.live;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;

    // ---- slanting shafts of light that drift over the floor around you
    this.rays.forEach((ray, k) => {
      const d = this.rayData[k];
      if (Math.abs(d.x - focus.x) > 13 || Math.abs(d.z - focus.z) > 10 || d.x === 0) {
        d.x = focus.x + (Math.random() - 0.5) * 22;
        d.z = focus.z + (Math.random() - 0.5) * 16;
      }
      d.x += dt * 0.25;
      ray.position.set(d.x, 4.2, d.z);
      ray.rotation.set(-0.35, 0, 0.42 + Math.sin(t * 0.3 + d.phase) * 0.05);
      (ray.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.5 + d.phase));
    });
  }

  /** Players float and paddle a little while under water. */
  swim(view: CreatureView, id: number): void {
    const rig = view.rig;
    if (rig.type !== 'biped') return;
    const t = this.time + id * 0.37;
    rig.body.position.y += 0.14 + Math.sin(t * 1.7) * 0.06;
    rig.legL.rotation.x += Math.sin(t * 4.2) * 0.22;
    rig.legR.rotation.x -= Math.sin(t * 4.2) * 0.22;
    rig.armL.rotation.x += Math.sin(t * 2.1) * 0.18;
  }
}
