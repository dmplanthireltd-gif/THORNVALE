import * as THREE from 'three';
import { hash2 } from '../game/core/rng';
import { Ground, Obj, WorldMap, type House } from '../game/world/WorldMap';
import { mat, toonGradient, type Mat } from './models/parts';
import { groundTex, objTex } from './textures';

/** Vertical distance between floors in world units. */
export const FLOOR_H = 3.4;

const GROUND_TEX: Partial<Record<Ground, (v: number) => THREE.Texture>> = {
  [Ground.Grass]: groundTex.grass,
  [Ground.DarkGrass]: groundTex.darkGrass,
  [Ground.Path]: groundTex.path,
  [Ground.Stone]: groundTex.stone,
  [Ground.Wood]: groundTex.wood,
  [Ground.Water]: groundTex.water,
  [Ground.Dirt]: groundTex.dirt,
  [Ground.Crop]: groundTex.crop,
  [Ground.Sand]: groundTex.sand,
  [Ground.Lava]: groundTex.lava,
  [Ground.Ash]: groundTex.ash,
  [Ground.Swamp]: groundTex.swamp,
  [Ground.Cave]: groundTex.cave,
  [Ground.Jungle]: groundTex.jungle,
  [Ground.Marble]: groundTex.marble,
  [Ground.DeepWater]: groundTex.deepWater,
};

/** Collects instance transforms for one shared geometry/material pair. */
class Batch {
  matrices: THREE.Matrix4[] = [];
  colors: THREE.Color[] = [];
  tiles: number[] = [];
  constructor(readonly geo: THREE.BufferGeometry, readonly material: THREE.Material, readonly shadows = true) {}
  add(m: THREE.Matrix4, color: number | THREE.Color = 0xffffff, tile = -1): void {
    this.matrices.push(m.clone());
    this.colors.push(color instanceof THREE.Color ? color.clone() : new THREE.Color(color));
    this.tiles.push(tile);
  }
  build(): THREE.InstancedMesh | null {
    if (!this.matrices.length) return null;
    const im = new THREE.InstancedMesh(this.geo, this.material, this.matrices.length);
    this.matrices.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, this.colors[i]);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = this.shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    return im;
  }
}

interface FadeLayer {
  mesh: THREE.InstancedMesh;
  byTile: Map<number, number>;
  original: THREE.Matrix4[];
  proxyMat: THREE.Material;
}

interface RoofView {
  house: House;
  group: THREE.Group;
  materials: Mat[];
  opacity: number;
}

/** A tile object that can change at runtime (dug holes) or needs its own mesh. */
interface Feature {
  x: number;
  y: number;
  looseStone: THREE.Object3D | null;
  hole: THREE.Object3D | null;
}

class FloorView {
  readonly group = new THREE.Group();
  readonly mats: Mat[] = [];
  fadeLayers: FadeLayer[] = [];
  roofs: RoofView[] = [];
  features = new Map<number, Feature>();
  dim = 1;
  constructor(readonly z: number) {}

  /** Creates a cel material owned by this floor (so the floor can be dimmed). */
  m(color: number, opts: { emissive?: number; map?: THREE.Texture | null } = {}): Mat {
    const mm = mat(color, opts);
    mm.userData.base = mm.color.clone();
    this.mats.push(mm);
    return mm;
  }

  setDim(k: number): void {
    if (Math.abs(k - this.dim) < 0.001) return;
    this.dim = k;
    for (const mm of this.mats) mm.color.copy(mm.userData.base as THREE.Color).multiplyScalar(k);
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function compose(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  tmpS.set(sx, sy, sz);
  tmpP.set(x, y, z);
  return tmpM.compose(tmpP, tmpQ, tmpS);
}

function geo<T extends THREE.BufferGeometry>(g: T, ty = 0): T {
  if (ty) g.translate(0, ty, 0);
  return g;
}

/**
 * Builds every floor of the world as instanced 3D geometry, decides which
 * floors are visible from where the player stands, and keeps the player
 * visible: roofs vanish indoors, canopies and cliffs near creatures turn
 * translucent, upper floors hide while you stand beneath them.
 */
export class WorldView {
  readonly group = new THREE.Group();
  private floors = new Map<number, FloorView>();
  private proxies: THREE.Mesh[] = [];
  private faded = new Set<number>();
  private fadedFloor: FloorView | null = null;
  private time = 0;
  private waterTex: THREE.Texture[] = [];
  private flameMats: Mat[] = [];
  currentZ = 0;

  constructor(private readonly world: WorldMap, scene: THREE.Scene) {
    scene.add(this.group);
    for (const z of [...world.floors.keys()].sort((a, b) => a - b)) {
      const fv = new FloorView(z);
      this.floors.set(z, fv);
      this.group.add(fv.group);
      this.buildGround(fv);
      this.buildObjects(fv);
      for (const h of world.houses) if (h.z === z && !h.noRoof) this.buildRoof(fv, h);
      fv.group.visible = false;
    }
    // the meadow beyond the map edge
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat(0x2a4f6e));
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(world.width / 2, -0.4, world.height / 2);
    outer.receiveShadow = true;
    outer.name = 'outer';
    this.floors.get(0)?.group.add(outer);
  }

  // ================================================================ ground

  private buildGround(fv: FloorView): void {
    const w = this.world;
    const z = fv.z;
    const tileGeo = new THREE.BoxGeometry(1, 0.3, 1);
    const batches = new Map<string, Batch>();
    const matFor = new Map<string, Mat>();
    const getBatch = (g: Ground, v: number) => {
      const key = `${g}:${v}`;
      let b = batches.get(key);
      if (!b) {
        const tex = GROUND_TEX[g]?.(v) ?? null;
        if (tex && (g === Ground.Water || g === Ground.DeepWater)) this.waterTex.push(tex);
        let mm = matFor.get(key);
        if (!mm) {
          mm = fv.m(0xffffff, { map: tex, emissive: g === Ground.Lava ? 0xb8400c : 0x000000 });
          if (g === Ground.Lava) this.flameMats.push(mm);
          matFor.set(key, mm);
        }
        b = new Batch(tileGeo, mm, false);
        batches.set(key, b);
      }
      return b;
    };
    const rock = new Batch(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), fv.m(0x7a7068, { map: objTex.cliff() }));
    const c = new THREE.Color();
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const g = w.getGround(x, y, z);
        if (g === Ground.Void) {
          // underground: solid rock next to any open tile
          if (z < 0 && this.bordersOpen(x, y, z)) rock.add(compose(x, 0, y, 0, 1, 0.9 + hash2(x, y, 3) * 0.25, 1), c.setScalar(0.85 + hash2(x, y, 4) * 0.25));
          continue;
        }
        if (z === 0 && g === Ground.DeepWater && !this.nearLand(x, y)) continue; // the open sea is the backdrop plane
        const v = Math.floor(hash2(x, y, 17) * 3);
        const shade = 0.92 + hash2(x, y) * 0.1;
        const water = g === Ground.Water || g === Ground.DeepWater || g === Ground.Lava;
        const raised = g === Ground.Stone || g === Ground.Wood || g === Ground.Marble ? 0.02 : 0;
        getBatch(g, v).add(compose(x, water ? -0.33 : -0.15 + raised, y), c.setScalar(shade));
      }
    }
    for (const b of batches.values()) {
      const im = b.build();
      if (im) fv.group.add(im);
    }
    const r = rock.build();
    if (r) fv.group.add(r);

    // grass tufts on the surface
    if (z === 0 || z === 1) {
      const tuftGeo = geo(new THREE.ConeGeometry(0.05, 0.22, 3), 0.11);
      const tufts = new Batch(tuftGeo, fv.m(0xffffff), false);
      for (let y = 0; y < w.height; y++) {
        for (let x = 0; x < w.width; x++) {
          const g = w.getGround(x, y, z);
          if ((g !== Ground.Grass && g !== Ground.DarkGrass && g !== Ground.Jungle) || w.getObj(x, y, z) !== Obj.None) continue;
          if (hash2(x, y, 7) > 0.4) continue;
          for (let i = 0; i < 3; i++) {
            const ox = (hash2(x, y, 11 + i) - 0.5) * 0.8;
            const oz = (hash2(x, y, 23 + i) - 0.5) * 0.8;
            const s = 0.7 + hash2(x, y, 31 + i) * 0.7;
            tufts.add(compose(x + ox, 0, y + oz, hash2(x, y, i) * 6, s, s, s), g === Ground.DarkGrass ? 0x5f9a3c : 0x7fbf4f);
          }
        }
      }
      const t = tufts.build();
      if (t) fv.group.add(t);
    }
  }

  private bordersOpen(x: number, y: number, z: number): boolean {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const g = this.world.getGround(x + dx, y + dy, z);
      if (g !== Ground.Void && this.world.inBounds(x + dx, y + dy)) return true;
    }
    return false;
  }

  private nearLand(x: number, y: number): boolean {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const g = this.world.getGround(x + dx, y + dy, 0);
      if (g !== Ground.DeepWater && g !== Ground.Void) return true;
    }
    return false;
  }

  // ================================================================ objects

  private buildObjects(fv: FloorView): void {
    const w = this.world;
    const z = fv.z;
    const M = (color: number, map: THREE.Texture | null = null, emissive = 0) => fv.m(color, { map, emissive });
    const B = (g: THREE.BufferGeometry, m: THREE.Material, shadows = true) => new Batch(g, m, shadows);

    const leaves = objTex.leaves();
    const bark = objTex.bark();
    const trunkMat = M(0x7a5434, bark);
    const leafMat = M(0xffffff, leaves);
    const plainMat = M(0xffffff);
    const trunks = B(geo(new THREE.CylinderGeometry(0.11, 0.17, 1.3, 6), 0.65), trunkMat);
    const canopyLow = B(new THREE.IcosahedronGeometry(0.72, 0), leafMat);
    const canopyHigh = B(new THREE.IcosahedronGeometry(0.5, 0), leafMat);
    const pine1 = B(new THREE.ConeGeometry(0.78, 1.25, 7), leafMat);
    const pine2 = B(new THREE.ConeGeometry(0.58, 1.05, 7), leafMat);
    const pine3 = B(new THREE.ConeGeometry(0.36, 0.85, 7), leafMat);
    const jungle1 = B(new THREE.IcosahedronGeometry(0.85, 0), leafMat);
    const palmTrunk = B(geo(new THREE.CylinderGeometry(0.07, 0.12, 2.2, 5), 1.1), M(0x9a7a4a, bark));
    const frond = B(geo(new THREE.BoxGeometry(0.22, 0.05, 1.0), 0), leafMat);
    const deadBranch = B(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5), M(0x5a5048));
    const rocks = B(new THREE.DodecahedronGeometry(0.42, 0), M(0xffffff, objTex.rock()));
    const bushes = B(new THREE.IcosahedronGeometry(0.42, 0), leafMat);
    const ferns = B(geo(new THREE.ConeGeometry(0.32, 0.4, 5), 0.2), leafMat, false);
    const berry = B(new THREE.IcosahedronGeometry(0.06, 0), plainMat);
    const flowers = B(new THREE.IcosahedronGeometry(0.065, 0), plainMat, false);
    const stems = B(geo(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 3), 0.1), M(0x3f7a2a), false);
    const wheat = B(geo(new THREE.ConeGeometry(0.06, 0.55, 4), 0.27), M(0xd8b64a), false);
    const plaster = M(0xffffff, objTex.plaster());
    const brick = M(0xffffff, objTex.brick());
    const wallsWood = B(geo(new THREE.BoxGeometry(1, 1.7, 1), 0.85), plaster);
    const wallsStone = B(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), brick);
    const beams = B(new THREE.BoxGeometry(1.02, 0.12, 1.02), M(0x4a2f1b));
    const post = geo(new THREE.BoxGeometry(0.16, 1.7, 0.16), 0.85);
    const doorPosts = B(post, M(0x4a2f1b));
    const lintels = B(new THREE.BoxGeometry(1, 0.2, 0.22), M(0x4a2f1b));
    const fPosts = B(geo(new THREE.BoxGeometry(0.12, 0.85, 0.12), 0.42), M(0x7a5634));
    const rails = B(new THREE.BoxGeometry(1, 0.07, 0.06), M(0x8c6640));
    const railPosts = B(geo(new THREE.BoxGeometry(0.1, 0.7, 0.1), 0.35), M(0x6a4a2c));
    const headstones = B(geo(new THREE.BoxGeometry(0.5, 0.7, 0.14), 0.35), M(0xffffff, objTex.rock()));
    const mounds = B(new THREE.BoxGeometry(0.5, 0.14, 0.75), M(0x5a4530));
    const barrels = B(geo(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 10), 0.35), M(0x7b5230));
    const hoops = B(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 10), M(0x3d3d42));
    const crates = B(geo(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0.3), M(0x9a7444, objTex.logs()));
    const tableTop = B(new THREE.BoxGeometry(0.9, 0.08, 0.7), M(0x80592f));
    const tableLeg = B(geo(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0.25), M(0x5b3d24));
    const hay = B(geo(new THREE.BoxGeometry(0.85, 0.5, 0.75), 0.25), M(0xd9b95a));
    const lampPost = B(geo(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 6), 0.9), M(0x2d2d33));
    const glowMat = M(0xffd27a, null, 0xffb84a);
    const lampGlow = B(new THREE.BoxGeometry(0.22, 0.26, 0.22), glowMat, false);
    const cliffs = B(geo(new THREE.BoxGeometry(1, 3.1, 1), 1.55), M(0xffffff, objTex.cliff()));
    const stakes = B(geo(new THREE.BoxGeometry(1, 2.0, 0.35), 1.0), M(0xffffff, objTex.stakes()));
    const stakeTips = B(geo(new THREE.ConeGeometry(0.12, 0.35, 4), 2.15), M(0x6a4a2c));
    const stoneWalls = B(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), brick);
    const pillars = B(geo(new THREE.CylinderGeometry(0.28, 0.32, 2.1, 8), 1.05), M(0xd8d2c4, objTex.rock()));
    const counters = B(geo(new THREE.BoxGeometry(1, 0.85, 0.7), 0.42), M(0x7a5634, objTex.logs()));
    const altars = B(geo(new THREE.BoxGeometry(1, 0.8, 0.8), 0.4), M(0xbab2a4, objTex.rock()));
    const stalag = B(geo(new THREE.ConeGeometry(0.3, 1.4, 6), 0.7), M(0x7a7068, objTex.rock()));
    const bones = B(new THREE.BoxGeometry(0.4, 0.05, 0.06), M(0xe8e0c6), false);
    const skulls = B(new THREE.IcosahedronGeometry(0.09, 0), M(0xe8e0c6), false);
    const fireMat = M(0xff8a2a, null, 0xff5a10);
    this.flameMats.push(fireMat);
    const flames = B(geo(new THREE.ConeGeometry(0.16, 0.5, 5), 0.25), fireMat, false);
    const torchSticks = B(geo(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), 1.2), M(0x5b3d24));
    const torchFlame = B(geo(new THREE.ConeGeometry(0.08, 0.22, 5), 1.55), fireMat, false);

    const leafColors = [0x3f7d34, 0x4a8a38, 0x356f2e, 0x4f9340];
    const pineColors = [0x2f5e34, 0x2a5530, 0x356a3a, 0x284f2d];
    const isA = (xx: number, yy: number, objs: Obj[]) => w.inBounds(xx, yy) && objs.includes(w.getObj(xx, yy, z));

    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const o = w.getObj(x, y, z);
        if (o === Obj.None) continue;
        const ti = w.idx(x, y);
        const h = hash2(x, y, 3);
        const rot = hash2(x, y, 5) * Math.PI * 2;
        const c = new THREE.Color();
        switch (o) {
          case Obj.Tree: {
            const s = 0.9 + h * 0.35;
            trunks.add(compose(x, 0, y, rot, s, s, s));
            c.setHex(leafColors[Math.floor(hash2(x, y, 9) * 4)]);
            canopyLow.add(compose(x, 1.55 * s, y, rot, s, s * 0.9, s), c, ti);
            canopyHigh.add(compose(x + 0.12, 2.1 * s, y - 0.08, rot, s, s, s), c.clone().multiplyScalar(1.12), ti);
            break;
          }
          case Obj.Pine: {
            const s = 0.85 + h * 0.4;
            trunks.add(compose(x, 0, y, rot, s * 0.8, s * 0.8, s * 0.8));
            c.setHex(pineColors[Math.floor(hash2(x, y, 9) * 4)]);
            pine1.add(compose(x, 1.15 * s, y, rot, s, s, s), c, ti);
            pine2.add(compose(x, 1.8 * s, y, rot, s, s, s), c.clone().multiplyScalar(1.08), ti);
            pine3.add(compose(x, 2.4 * s, y, rot, s, s, s), c.clone().multiplyScalar(1.16), ti);
            break;
          }
          case Obj.JungleTree: {
            const s = 1.0 + h * 0.4;
            trunks.add(compose(x, 0, y, rot, s * 1.2, s * 1.3, s * 1.2));
            jungle1.add(compose(x, 2.0 * s, y, rot, s * 1.1, s * 0.75, s * 1.1), c.setHex(0x2f6a26).multiplyScalar(0.9 + h * 0.3), ti);
            canopyHigh.add(compose(x - 0.2, 2.5 * s, y + 0.1, rot, s * 1.2, s * 0.9, s * 1.2), c.clone().multiplyScalar(1.15), ti);
            break;
          }
          case Obj.Palm: {
            const lean = (h - 0.5) * 0.4;
            palmTrunk.add(compose(x, 0, y, rot, 1, 1, 1, lean, 0));
            for (let i = 0; i < 6; i++) {
              const a = rot + (i / 6) * Math.PI * 2;
              frond.add(compose(x + Math.sin(a) * 0.45, 2.15, y + Math.cos(a) * 0.45 + lean * 0.8, a, 1, 1, 1, 0.45, 0), c.setHex(0x4a9a3a).multiplyScalar(0.85 + hash2(x, y, i) * 0.3), ti);
            }
            break;
          }
          case Obj.DeadTree:
            trunks.add(compose(x, 0, y, rot, 0.9, 1.15, 0.9), 0xc8bcb0);
            deadBranch.add(compose(x + 0.2, 1.25, y, rot, 1, 1, 1, 0, -0.8));
            deadBranch.add(compose(x - 0.15, 1.05, y + 0.1, rot, 0.8, 0.8, 0.8, 0.5, 0.7));
            break;
          case Obj.Rock:
            rocks.add(compose(x, 0.2, y, rot, 1 + h * 0.3, 0.7 + h * 0.3, 0.9), c.setScalar(0.8 + h * 0.3));
            break;
          case Obj.Stalagmite:
            stalag.add(compose(x, 0, y, rot, 0.8 + h * 0.5, 0.7 + h * 0.8, 0.8 + h * 0.5));
            break;
          case Obj.Bush:
            bushes.add(compose(x, 0.36, y, rot, 1.1, 0.85, 1.1), c.setHex(0x3e7a30).multiplyScalar(0.9 + h * 0.2));
            if (h > 0.5) for (let i = 0; i < 3; i++) berry.add(compose(x + Math.cos(i * 2.1 + rot) * 0.3, 0.5 + i * 0.05, y + Math.sin(i * 2.1 + rot) * 0.3), 0xc0303a);
            break;
          case Obj.Fern:
            for (let i = 0; i < 3; i++) {
              const ox = (hash2(x, y, 40 + i) - 0.5) * 0.6, oz = (hash2(x, y, 50 + i) - 0.5) * 0.6;
              ferns.add(compose(x + ox, 0, y + oz, rot + i, 1, 0.8 + h * 0.6, 1), c.setHex(0x3f8a34).multiplyScalar(0.85 + hash2(x, y, i) * 0.3));
            }
            break;
          case Obj.Flowers: {
            const palette = [0xf2e35b, 0xe85d75, 0xf4f1ea, 0x9f7fe0, 0xf29b38];
            for (let i = 0; i < 4; i++) {
              const ox = (hash2(x, y, 40 + i) - 0.5) * 0.7, oz = (hash2(x, y, 50 + i) - 0.5) * 0.7;
              stems.add(compose(x + ox, 0, y + oz));
              flowers.add(compose(x + ox, 0.21, y + oz), palette[Math.floor(hash2(x, y, 60 + i) * palette.length)]);
            }
            break;
          }
          case Obj.Wheat:
            for (let i = 0; i < 5; i++) {
              const ox = (hash2(x, y, 70 + i) - 0.5) * 0.8, oz = (hash2(x, y, 80 + i) - 0.5) * 0.5;
              const s = 0.8 + hash2(x, y, 90 + i) * 0.5;
              wheat.add(compose(x + ox, 0, y + oz, 0, s, s, s));
            }
            break;
          case Obj.Wall: {
            const house = w.houseAt(x, y, z);
            if (house?.stone) {
              stoneWalls.add(compose(x, 0, y), c.setHex(house.wallColor).multiplyScalar(1.3));
            } else {
              wallsWood.add(compose(x, 0, y), c.setHex(house?.wallColor ?? 0xcfc2a4).multiplyScalar(0.95 + h * 0.08));
              beams.add(compose(x, 0.06, y));
              const horiz = isA(x - 1, y, [Obj.Wall, Obj.Door]) || isA(x + 1, y, [Obj.Wall, Obj.Door]);
              const vert = isA(x, y - 1, [Obj.Wall, Obj.Door]) || isA(x, y + 1, [Obj.Wall, Obj.Door]);
              if (horiz && vert) doorPosts.add(compose(x, 0, y, 0, 1.6, 1.02, 1.6));
            }
            break;
          }
          case Obj.StoneWall:
            stoneWalls.add(compose(x, 0, y, 0, 1, 0.75 + h * 0.3, 1), c.setScalar(0.85 + h * 0.2));
            break;
          case Obj.Door: {
            const horizontal = isA(x - 1, y, [Obj.Wall, Obj.StoneWall]) || isA(x + 1, y, [Obj.Wall, Obj.StoneWall]);
            if (horizontal) {
              doorPosts.add(compose(x - 0.42, 0, y));
              doorPosts.add(compose(x + 0.42, 0, y));
              lintels.add(compose(x, 1.6, y));
            } else {
              doorPosts.add(compose(x, 0, y - 0.42));
              doorPosts.add(compose(x, 0, y + 0.42));
              lintels.add(compose(x, 1.6, y, Math.PI / 2));
            }
            break;
          }
          case Obj.Fence: {
            fPosts.add(compose(x, 0, y));
            if (isA(x + 1, y, [Obj.Fence])) { rails.add(compose(x + 0.5, 0.35, y)); rails.add(compose(x + 0.5, 0.65, y)); }
            if (isA(x, y + 1, [Obj.Fence])) { rails.add(compose(x, 0.35, y + 0.5, Math.PI / 2)); rails.add(compose(x, 0.65, y + 0.5, Math.PI / 2)); }
            break;
          }
          case Obj.Railing: {
            railPosts.add(compose(x, 0, y));
            if (isA(x + 1, y, [Obj.Railing])) rails.add(compose(x + 0.5, 0.6, y));
            if (isA(x, y + 1, [Obj.Railing])) rails.add(compose(x, 0.6, y + 0.5, Math.PI / 2));
            break;
          }
          case Obj.Palisade: {
            const horiz = isA(x - 1, y, [Obj.Palisade]) || isA(x + 1, y, [Obj.Palisade]);
            stakes.add(compose(x, 0, y, horiz ? 0 : Math.PI / 2, 1, 0.9 + h * 0.2, 1));
            for (let i = -1; i <= 1; i++) stakeTips.add(compose(x + (horiz ? i * 0.33 : 0), 0, y + (horiz ? 0 : i * 0.33), 0, 1, 0.9 + h * 0.2, 1));
            break;
          }
          case Obj.Cliff:
            cliffs.add(compose(x, 0, y, 0, 1, 0.97 + h * 0.06, 1), c.setScalar(0.85 + h * 0.25), ti);
            break;
          case Obj.Grave:
            headstones.add(compose(x, 0, y - 0.28, (h - 0.5) * 0.3, 1, 0.8 + h * 0.4, 1, (h - 0.5) * 0.2), c.setScalar(0.7 + h * 0.2));
            mounds.add(compose(x, 0.05, y + 0.1));
            break;
          case Obj.Bones:
            bones.add(compose(x - 0.1, 0.03, y, rot));
            bones.add(compose(x + 0.1, 0.03, y + 0.1, rot + 1.2));
            skulls.add(compose(x + (h - 0.5) * 0.4, 0.08, y - 0.15));
            break;
          case Obj.Barrel:
            barrels.add(compose(x, 0, y, rot));
            hoops.add(compose(x, 0.15, y));
            hoops.add(compose(x, 0.55, y));
            break;
          case Obj.Crate:
            crates.add(compose(x, 0, y, rot * 0.1), c.setScalar(0.85 + h * 0.2));
            break;
          case Obj.Table:
            tableTop.add(compose(x, 0.54, y));
            for (const [lx, lz] of [[0.38, 0.28], [-0.38, 0.28], [0.38, -0.28], [-0.38, -0.28]]) tableLeg.add(compose(x + lx, 0, y + lz));
            break;
          case Obj.Counter:
            counters.add(compose(x, 0, y));
            break;
          case Obj.Altar:
            altars.add(compose(x, 0, y));
            flames.add(compose(x - 0.25, 0.8, y, 0, 0.6, 0.6, 0.6));
            flames.add(compose(x + 0.25, 0.8, y, 0, 0.6, 0.6, 0.6));
            break;
          case Obj.Pillar:
            pillars.add(compose(x, 0, y), c.setScalar(0.85 + h * 0.2));
            break;
          case Obj.Hay:
            hay.add(compose(x, 0, y, rot * 0.1));
            break;
          case Obj.Lamp:
            lampPost.add(compose(x, 0, y));
            lampGlow.add(compose(x, 1.85, y));
            break;
          case Obj.Torch:
            torchSticks.add(compose(x, 0, y - 0.35, 0, 1, 1, 1, -0.3));
            torchFlame.add(compose(x, 0, y - 0.42));
            break;
          case Obj.Campfire:
            for (let i = 0; i < 3; i++) flames.add(compose(x + Math.cos(i * 2.1) * 0.12, 0, y + Math.sin(i * 2.1) * 0.12, 0, 1, 1.2, 1));
            for (let i = 0; i < 4; i++) deadBranch.add(compose(x + Math.cos(i * 1.6) * 0.2, 0.05, y + Math.sin(i * 1.6) * 0.2, i * 1.6, 0.6, 0.6, 0.6, Math.PI / 2, 0));
            break;
          case Obj.FireField:
            for (let i = 0; i < 4; i++) flames.add(compose(x + (hash2(x, y, i) - 0.5) * 0.6, 0, y + (hash2(x, y, i + 9) - 0.5) * 0.6, 0, 0.9, 0.7 + hash2(x, y, i + 3) * 0.8, 0.9));
            break;
          case Obj.Well:
            this.buildWell(fv, x, y);
            break;
          case Obj.StairsUp:
          case Obj.StairsDown:
            this.buildStairs(fv, x, y, o === Obj.StairsUp);
            break;
          case Obj.Ladder:
            this.buildLadder(fv, x, y);
            break;
          case Obj.RopeSpot:
            this.buildRopeSpot(fv, x, y);
            break;
          case Obj.Hole:
          case Obj.LooseStone:
            this.buildDigFeature(fv, x, y, o);
            break;
          case Obj.Chest:
            this.buildChest(fv, x, y);
            break;
          case Obj.Locker:
            this.buildLocker(fv, x, y);
            break;
          default:
            break;
        }
      }
    }

    const all = [trunks, rocks, bushes, ferns, berry, flowers, stems, wheat, wallsWood, wallsStone, beams, doorPosts, lintels, fPosts, rails, railPosts,
      headstones, mounds, barrels, hoops, crates, tableTop, tableLeg, hay, lampPost, lampGlow, deadBranch, palmTrunk, stakes, stakeTips,
      stoneWalls, pillars, counters, altars, stalag, bones, skulls, flames, torchSticks, torchFlame];
    for (const b of all) {
      const im = b.build();
      if (im) fv.group.add(im);
    }
    const fadeBatches: Array<[Batch, number]> = [[canopyLow, 0x4a8a38], [canopyHigh, 0x4a8a38], [pine1, 0x2f5e34], [pine2, 0x2f5e34], [pine3, 0x2f5e34], [jungle1, 0x2f6a26], [frond, 0x4a9a3a], [cliffs, 0x6a6058]];
    for (const [b, proxyColor] of fadeBatches) {
      const im = b.build();
      if (!im) continue;
      fv.group.add(im);
      const byTile = new Map<number, number>();
      b.tiles.forEach((t, i) => {
        if (t < 0) return;
        // several instances per tile (palm fronds): keep the first and map extras by negative keys
        if (!byTile.has(t)) byTile.set(t, i);
        else byTile.set(-(t * 16 + byTile.size % 16) - 1, i);
      });
      const proxyMat = new THREE.MeshToonMaterial({ color: proxyColor, gradientMap: toonGradient(), transparent: true, opacity: 0.25, depthWrite: false });
      fv.fadeLayers.push({ mesh: im, byTile, original: b.matrices, proxyMat });
    }
  }

  private add(fv: FloorView, ...meshes: THREE.Object3D[]): void {
    for (const m of meshes) {
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      fv.group.add(m);
    }
  }

  private buildWell(fv: FloorView, x: number, y: number): void {
    const stone = fv.m(0x8f8b84);
    const wood = fv.m(0x5b3d24);
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.6, 12, 1, true), stone);
    ring.position.y = 0.3;
    const waterDisc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), fv.m(0x1f4f7a));
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.y = 0.35;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), wood);
    p1.position.set(0.45, 0.65, 0);
    const p2 = p1.clone();
    p2.position.x = -0.45;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), fv.m(0x8e3b2e));
    roof.position.y = 1.5;
    roof.rotation.y = Math.PI / 4;
    g.add(ring, waterDisc, p1, p2, roof);
    this.add(fv, g);
  }

  private buildStairs(fv: FloorView, x: number, y: number, up: boolean): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const stone = fv.m(up ? 0xb8b2a6 : 0x6a645c);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = up ? (i + 1) * 0.16 : 0.02;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, up ? h : 0.04, 0.22), up ? stone : fv.m(0x2a2622 + i * 0x0a0a0a));
      s.position.set(0, up ? h / 2 : 0.01 - i * 0.002, -0.33 + i * 0.22);
      if (!up) s.position.y = 0.02;
      g.add(s);
    }
    if (!up) {
      // a dark stairwell going down
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), fv.m(0x0e0c0a));
      hole.position.y = 0.015;
      g.add(hole);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.2), stone);
        s.position.set(0, 0.03, -0.3 + i * 0.25);
        s.scale.set(1 - i * 0.12, 1, 1);
        g.add(s);
      }
    }
    this.add(fv, g);
  }

  private buildLadder(fv: FloorView, x: number, y: number): void {
    const wood = fv.m(0x8a6a3e);
    const g = new THREE.Group();
    g.position.set(x, 0, y - 0.3);
    for (const sx of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.2, 0.07), wood);
      rail.position.set(sx, 1.6, 0);
      g.add(rail);
    }
    for (let i = 0; i < 8; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), wood);
      rung.position.set(0, 0.25 + i * 0.38, 0);
      g.add(rung);
    }
    g.rotation.x = -0.18;
    this.add(fv, g);
  }

  private buildRopeSpot(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.3, depthWrite: false }));
    light.rotation.x = -Math.PI / 2;
    light.position.y = 0.03;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 4, 12), fv.m(0x8a7a5a));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    g.add(light, ring);
    this.add(fv, g);
  }

  private buildDigFeature(fv: FloorView, x: number, y: number, o: Obj): void {
    const stones = new THREE.Group();
    const sm = fv.m(0x8a8278);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + hash2(x, y, i) * 0.06, 0), sm);
      s.position.set((hash2(x, y, i + 3) - 0.5) * 0.6, 0.06, (hash2(x, y, i + 7) - 0.5) * 0.6);
      stones.add(s);
    }
    stones.position.set(x, 0, y);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), fv.m(0x080706));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, 0.02, y);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 4, 12), fv.m(0x4a4038));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.02, y);
    const holeG = new THREE.Group();
    holeG.add(hole, rim);
    this.add(fv, stones, holeG);
    const isDig = this.world.linkAt(x, y, fv.z) && (o === Obj.LooseStone || this.isDigLink(x, y, fv.z));
    const f: Feature = { x, y, looseStone: isDig ? stones : null, hole: holeG };
    stones.visible = o === Obj.LooseStone;
    holeG.visible = o === Obj.Hole;
    fv.features.set(this.world.idx(x, y), f);
  }

  private isDigLink(x: number, y: number, z: number): boolean {
    const l = this.world.linkAt(x, y, z);
    return !!l && l.to.z === z - 1;
  }

  private buildChest(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const wood = fv.m(0x7a4a24, { map: objTex.logs() });
    const gold = fv.m(0xe0b03c);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), wood);
    base.position.y = 0.2;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 8, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.52), gold);
    band.position.y = 0.3;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), gold);
    lock.position.set(0, 0.35, 0.26);
    g.add(base, lid, band, lock);
    this.add(fv, g);
  }

  private buildLocker(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const wood = fv.m(0x6a4428, { map: objTex.logs() });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), wood);
    box.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), fv.m(0x4a2f1b));
    top.position.y = 1.62;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.04), fv.m(0xe0b03c));
    plate.position.set(0, 1.2, 0.31);
    g.add(box, top, plate);
    this.add(fv, g);
  }

  // ================================================================ roofs

  private buildRoof(fv: FloorView, h: House): void {
    const eave = h.stone ? 1.9 : 1.7;
    const overhang = 0.3;
    const alongX = h.w >= h.h;
    const span = (alongX ? h.h : h.w) + overhang * 2;
    const length = (alongX ? h.w : h.h) + overhang * 2;
    const rise = Math.min(1.5, span * 0.3 + 0.3);
    const half = span / 2;
    const slopeLen = Math.hypot(half, rise);
    const pitch = Math.atan2(rise, half);
    const tex = objTex.shingles().clone();
    tex.needsUpdate = true;
    tex.repeat.set(length / 0.9, slopeLen / 0.32);
    const roofMat = fv.m(h.roofColor, { map: tex });
    const gableMat = fv.m(h.wallColor);
    const beamMat = fv.m(0x4a2f1b);
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const slope = new THREE.Mesh(new THREE.BoxGeometry(length, 0.09, slopeLen), roofMat);
      slope.position.set(0, rise / 2, (side * half) / 2);
      slope.rotation.x = side * pitch;
      g.add(slope);
    }
    const tri = new THREE.Shape();
    tri.moveTo(-half + overhang, 0);
    tri.lineTo(half - overhang, 0);
    tri.lineTo(0, rise - overhang * (rise / half));
    tri.lineTo(-half + overhang, 0);
    const gableGeo = new THREE.ShapeGeometry(tri);
    for (const end of [-1, 1]) {
      const gable = new THREE.Mesh(gableGeo, gableMat);
      gable.rotation.y = end === 1 ? Math.PI / 2 : -Math.PI / 2;
      gable.position.x = end * (length / 2 - overhang);
      g.add(gable);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 0.06, 0.14, 0.18), beamMat);
    ridge.position.y = rise + 0.03;
    g.add(ridge);
    g.position.set(h.x + (h.w - 1) / 2, eave, h.y + (h.h - 1) / 2);
    if (!alongX) g.rotation.y = Math.PI / 2;
    this.add(fv, g);
    fv.roofs.push({ house: h, group: g, materials: [roofMat, gableMat, beamMat], opacity: 1 });
  }

  // ================================================================ per-frame

  onTileChanged(x: number, y: number, z: number): void {
    const fv = this.floors.get(z);
    const f = fv?.features.get(this.world.idx(x, y));
    if (!f) return;
    const o = this.world.getObj(x, y, z);
    if (f.looseStone) f.looseStone.visible = o === Obj.LooseStone;
    if (f.hole) f.hole.visible = o === Obj.Hole;
  }

  /** Is anything built on the floor above, right over the player? */
  private underCover(px: number, py: number, pz: number): boolean {
    for (const z of [pz + 1, pz + 2]) {
      if (!this.world.floors.has(z)) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (this.world.getGround(px + dx, py + dy, z) !== Ground.Void) return true;
      }
    }
    return false;
  }

  update(dt: number, pz: number, playerTiles: Array<{ x: number; y: number }>, watchTiles: Array<{ x: number; y: number }>): void {
    this.time += dt;
    this.currentZ = pz;
    for (const t of this.waterTex) {
      t.offset.x = Math.sin(this.time * 0.25) * 0.03;
      t.offset.y = this.time * 0.02;
    }
    const flick = 0.75 + Math.sin(this.time * 9) * 0.12 + Math.sin(this.time * 23) * 0.08;
    for (const m of this.flameMats) m.emissiveIntensity = flick;

    const p0 = playerTiles[playerTiles.length - 1] ?? { x: 0, y: 0 };
    const covered = this.underCover(Math.round(p0.x), Math.round(p0.y), pz);
    for (const [z, fv] of this.floors) {
      let visible = false;
      let offset = 0;
      let dim = 1;
      if (z === pz) visible = true;
      else if (pz >= 0 && z === pz - 1 && z >= 0) { visible = true; offset = -FLOOR_H; dim = 0.5; }
      else if (pz >= 0 && z > pz && z <= pz + 2 && !covered) { visible = true; offset = FLOOR_H * (z - pz); }
      fv.group.visible = visible;
      if (!visible) continue;
      fv.group.position.y = offset;
      fv.setDim(dim);
    }
    const cur = this.floors.get(pz);
    if (cur) {
      this.updateRoofs(cur, dt, playerTiles);
      this.updateCanopies(cur, [...playerTiles, ...watchTiles]);
    }
  }

  /** Vertical offset a floor is drawn at, or null when that floor is hidden. */
  floorOffset(z: number): number | null {
    const fv = this.floors.get(z);
    if (!fv || !fv.group.visible) return null;
    return fv.group.position.y;
  }

  floorDim(z: number): number {
    return this.floors.get(z)?.dim ?? 1;
  }

  private updateRoofs(fv: FloorView, dt: number, playerTiles: Array<{ x: number; y: number }>): void {
    for (const r of fv.roofs) {
      const h = r.house;
      let inside = false;
      let behind = false;
      for (const t of playerTiles) {
        if (t.x >= h.x && t.x < h.x + h.w && t.y >= h.y && t.y < h.y + h.h) inside = true;
        if (t.x >= h.x - 1 && t.x <= h.x + h.w && t.y >= h.y - 3 && t.y <= h.y + h.h - 1) behind = true;
      }
      const target = inside ? 0 : behind ? 0.3 : 1;
      r.opacity += (target - r.opacity) * (1 - Math.exp(-dt * 10));
      const transparent = r.opacity < 0.995;
      r.group.visible = r.opacity > 0.02;
      for (const m of r.materials) {
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.depthWrite = !transparent;
          m.needsUpdate = true;
        }
        m.opacity = r.opacity;
      }
    }
  }

  private updateCanopies(fv: FloorView, watch: Array<{ x: number; y: number }>): void {
    const w = this.world;
    const want = new Set<number>();
    for (const t of watch) {
      const tx = Math.round(t.x), ty = Math.round(t.y);
      for (let dy = -1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!w.inBounds(x, y)) continue;
        const o = w.getObj(x, y, fv.z);
        if (o === Obj.Tree || o === Obj.Pine || o === Obj.JungleTree || o === Obj.Palm || (o === Obj.Cliff && dy >= 1)) want.add(w.idx(x, y));
      }
    }
    // restore what no longer needs fading (and everything when the floor changed)
    if (this.fadedFloor && this.fadedFloor !== fv) {
      for (const ti of this.faded) this.restoreTile(this.fadedFloor, ti);
      this.faded.clear();
    }
    for (const ti of this.faded) if (!want.has(ti)) this.restoreTile(fv, ti);
    this.faded = want;
    this.fadedFloor = fv;
    let pi = 0;
    for (const ti of want) {
      for (const L of fv.fadeLayers) {
        for (const key of this.keysFor(L, ti)) {
          const i = L.byTile.get(key);
          if (i === undefined) continue;
          L.mesh.setMatrixAt(i, ZERO);
          L.mesh.instanceMatrix.needsUpdate = true;
          const proxy = this.proxy(pi++, L);
          proxy.matrix.copy(L.original[i]);
          proxy.visible = true;
          if (proxy.parent !== fv.group) fv.group.add(proxy);
        }
      }
    }
    for (; pi < this.proxies.length; pi++) this.proxies[pi].visible = false;
  }

  private keysFor(L: FadeLayer, ti: number): number[] {
    const keys = [ti];
    for (let k = 0; k < 16; k++) {
      const neg = -(ti * 16 + k) - 1;
      if (L.byTile.has(neg)) keys.push(neg);
    }
    return keys;
  }

  private restoreTile(fv: FloorView, ti: number): void {
    for (const L of fv.fadeLayers) {
      for (const key of this.keysFor(L, ti)) {
        const i = L.byTile.get(key);
        if (i !== undefined) {
          L.mesh.setMatrixAt(i, L.original[i]);
          L.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  private proxy(i: number, L: FadeLayer): THREE.Mesh {
    let p = this.proxies[i];
    if (!p) {
      p = new THREE.Mesh(L.mesh.geometry, L.proxyMat);
      p.matrixAutoUpdate = false;
      p.renderOrder = 2;
      this.proxies[i] = p;
    }
    p.geometry = L.mesh.geometry;
    p.material = L.proxyMat;
    return p;
  }
}
