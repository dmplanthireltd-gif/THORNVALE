import * as THREE from 'three';
import { hash2 } from '../game/core/rng';
import { Ground, Obj, WorldMap, type House } from '../game/world/WorldMap';
import { oreAt } from '../game/gathering/mining';
import { buildFoundersStone } from './models/foundersStone';
import { buildDepotHallsView, type DepotHallsView } from './models/depotHalls';
import { buildPlazaView, type PlazaView } from './models/spawnPlaza';
import { buildSeaView, type SeaView } from './sea/seaView';
import { mat, toonGradient, type Mat } from './models/parts';
import { buildCaveRock, CAVE_ROCK_FLOORS, CAVE_UNIFORMS, type LightSource } from './caveRock';
import { DecorBuilder } from './caveDecor';
import { groundTex, objTex } from './textures';
import type { GraphicsLevel } from './graphics';
import { StaticMerger } from './staticMerge';
import { applyWind, WIND_BUSH, WIND_CROP, WIND_GRASS, WIND_PALM, WIND_TREE } from './weather/wind';
import { PAINTED } from './style';
import { groundIdTexture, paintsGround, usePaintedGround } from './paintGround';
import { paintedProps } from './paintProps';

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
  [Ground.Seabed]: groundTex.seabed,
};

/**
 * Chunk size in tiles for the instanced world batches. Every batch is split into
 * one InstancedMesh per CHUNK × CHUNK square of the map, each with its own
 * bounding sphere, so three.js frustum-culls the squares the camera (and the sun's
 * shadow camera) cannot see. Drawing whole-floor batches cost millions of
 * triangles a frame (performance rules, BIBLE §6).
 */
export const CHUNK = 32;
const chunkKey = (x: number, y: number) => Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);
const _bc = new THREE.Color();

/** Columns in a ground variant atlas. */
const VARIANTS = 3;
const atlasCache = new Map<Ground, THREE.Texture | null>();
/** The three 32 × 32 variants of a ground texture side by side (96 × 32), same filtering and wrapping. */
function groundAtlas(g: Ground): THREE.Texture | null {
  if (atlasCache.has(g)) return atlasCache.get(g)!;
  const make = GROUND_TEX[g];
  let out: THREE.Texture | null = null;
  if (make) {
    const first = make(0);
    const img = first.image as HTMLCanvasElement;
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w * VARIANTS;
    c.height = h;
    const ctx = c.getContext('2d')!;
    for (let v = 0; v < VARIANTS; v++) ctx.drawImage(make(v).image as HTMLCanvasElement, v * w, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = first.magFilter;
    // painted style: smooth, but no mipmaps (the shader wraps inside each column; mip levels would seam there)
    t.minFilter = PAINTED ? THREE.LinearFilter : first.minFilter;
    t.generateMipmaps = false;
    t.colorSpace = first.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    out = t;
  }
  atlasCache.set(g, out);
  return out;
}

/** Samples the tile's own variant column of the atlas (per-instance `aVariant`), wrapping inside that column. */
function useVariantAtlas(m: THREE.Material): void {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aVariant;\nvarying float vVariant;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vVariant = aVariant;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vVariant;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec2 atlasUv = vec2((fract(vMapUv.x) + vVariant) / ${VARIANTS.toFixed(1)}, vMapUv.y);
  diffuseColor *= texture2D(map, atlasUv);
#endif`);
  };
  m.customProgramCacheKey = () => 'groundAtlas';
}

/** Instance transforms + colours of one geometry/material pair, grouped by map chunk (flat arrays, no per-instance objects). */
class Batch {
  private chunks = new Map<number, { m: number[]; c: number[]; t: number[]; v: number[] }>();
  /** Batches of ground tiles carry each tile's texture variant (column of the variant atlas, see groundAtlas). */
  variants = false;
  /**
   * `tag` marks what the Graphics setting may trim: 'small' props stop casting
   * shadows on Medium and Low, 'decor' (grass tufts, berries) is hidden on Low.
   */
  constructor(readonly geo: THREE.BufferGeometry, readonly material: THREE.Material, readonly shadows = true, readonly tag: '' | 'small' | 'decor' = '') {}
  add(m: THREE.Matrix4, color: number | THREE.Color = 0xffffff, tile = -1, variant = 0): void {
    const e = m.elements;
    const key = chunkKey(e[12] + 0.5, e[14] + 0.5);
    let ch = this.chunks.get(key);
    if (!ch) this.chunks.set(key, (ch = { m: [], c: [], t: [], v: [] }));
    if (this.variants) ch.v.push(variant);
    for (let k = 0; k < 16; k++) ch.m.push(e[k]);
    const c = color instanceof THREE.Color ? color : _bc.setHex(color);
    ch.c.push(c.r, c.g, c.b);
    ch.t.push(tile);
  }
  /**
   * Adds one InstancedMesh per chunk to `group`. With a layer, records which
   * instances belong to which tile (felled trees, faded canopies, mined rocks).
   */
  build(group: THREE.Group, layer?: TileLayer): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const ch of this.chunks.values()) {
      const n = ch.t.length;
      let g = this.geo;
      if (this.variants) {
        // same vertex buffers for every chunk, plus this chunk's variants
        g = new THREE.BufferGeometry();
        g.setIndex(this.geo.index);
        for (const [name, a] of Object.entries(this.geo.attributes)) g.setAttribute(name, a);
        g.setAttribute('aVariant', new THREE.InstancedBufferAttribute(new Float32Array(ch.v), 1));
        if (!this.geo.boundingSphere) this.geo.computeBoundingSphere();
        g.boundingSphere = this.geo.boundingSphere;
      }
      const im = new THREE.InstancedMesh(g, this.material, n);
      im.instanceMatrix.array.set(ch.m);
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ch.c), 3);
      im.castShadow = this.shadows;
      im.receiveShadow = true;
      if (this.tag) im.userData.gfx = this.tag;
      im.computeBoundingSphere();
      // wind sway and stump/rubble scaling stay well inside a little margin
      im.boundingSphere!.radius += 0.6;
      group.add(im);
      if (layer) {
        const mi = layer.meshes.length;
        layer.meshes.push(im);
        layer.originals.push(new Float32Array(ch.m));
        ch.t.forEach((t, i) => {
          if (t < 0) return;
          const list = layer.byTile.get(t);
          if (list) list.push(mi, i);
          else layer.byTile.set(t, [mi, i]);
        });
      }
      out.push(im);
    }
    this.chunks.clear();
    return out;
  }
}

/**
 * Instances of a batch by tile (flat pairs: mesh index, instance index), so a
 * felled tree can shrink to a stump, a canopy can fade, an ore rock can turn to rubble.
 */
interface TileLayer {
  meshes: THREE.InstancedMesh[];
  /** The built instance matrices of each mesh. */
  originals: Float32Array[];
  byTile: Map<number, number[]>;
}

function newLayer(): TileLayer {
  return { meshes: [], originals: [], byTile: new Map() };
}

const _om = new THREE.Matrix4();
/** The instance's built matrix (shared temp: copy before keeping). */
function originalOf(L: TileLayer, mi: number, i: number): THREE.Matrix4 {
  return _om.fromArray(L.originals[mi], i * 16);
}

interface FadeLayer extends TileLayer {
  proxyMat: THREE.Material;
}

/** Tree trunks by tile, so a felled tree can shrink to a stump (and grow back). */
type TrunkLayer = TileLayer;

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
  trunkLayers: TrunkLayer[] = [];
  /** Tiles currently drawn as stumps. */
  stumps = new Set<number>();
  /** Ore rocks by tile (rock + coloured veins), so a mined-out rock can turn to rubble and back. */
  oreLayers: TrunkLayer[] = [];
  /** Tiles currently drawn as mined-out rubble. */
  rubble = new Set<number>();
  /** Campfires built into the map (drawn with the instanced objects). */
  staticFires = new Set<number>();
  /** Campfires lit by players (firemaking), by tile: built and removed as they flare up and burn out. */
  litFires = new Map<number, THREE.Group>();
  /** Materials shared by every lit campfire on this floor (made on the first one). */
  litMats: { wood: Mat; flame: Mat; glow: THREE.MeshBasicMaterial } | null = null;
  roofs: RoofView[] = [];
  features = new Map<number, Feature>();
  /** Torches, braziers, crystals and lava that light the floor around them (the nearest few get real lights). */
  lights: LightSource[] = [];
  dim = 1;
  /** Bakes the floor's static props into merged chunk meshes (filled while building, emptied by build()). */
  merger: StaticMerger;
  constructor(readonly z: number, keep: (m: THREE.Material) => boolean) {
    this.merger = new StaticMerger((c, o) => this.m(c, o), keep, chunkKey);
  }

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
const tmpC = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** A trunk cut down to a stump: short and a little wider. */
const STUMP_SCALE = new THREE.Matrix4().makeScale(1.35, 0.24, 1.35);
/** A mined-out ore rock: a low, wide heap of grey rubble. */
const RUBBLE_SCALE = new THREE.Matrix4().makeScale(1.25, 0.38, 1.25);

function compose(x: number, y: number, z: number, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0): THREE.Matrix4 {
  tmpQ.setFromEuler(tmpE.set(rotX, rotY, rotZ));
  tmpS.set(sx, sy, sz);
  tmpP.set(x, y, z);
  return tmpM.compose(tmpP, tmpQ, tmpS);
}

/** Joins already-placed geometries into one (unindexed: position, normal, uv). */
function joinGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]] as const) {
    const arr = new Float32Array(parts.reduce((n, g) => n + g.attributes[name].count * size, 0));
    let o = 0;
    for (const g of parts) {
      arr.set(g.attributes[name].array as Float32Array, o);
      o += g.attributes[name].count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
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
  /** The Thornvale spawn plaza (fountain, paving, decorations), animated while its floor shows. */
  private plaza: PlazaView | null = null;
  /** The big depot halls of the other towns (signs, lanterns, lit interiors). */
  private depotHalls: DepotHallsView | null = null;
  /** The Sunken Reach (game/world/sea.ts): reef, wrecks, caustics, whirlpool. */
  private sea: SeaView | null = null;
  currentZ = 0;
  /** A few real lights that follow the nearest torches and braziers on the current floor. */
  private pool: THREE.PointLight[] = [];
  private poolPick: LightSource[] = [];
  private poolTimer = 0;
  /** Fields laid by runes: they are drawn by the animated field sprites, not as static flames. */
  isRuneField: (x: number, y: number, z: number) => boolean = () => false;

  /**
   * `stumpOf` tells which tree a stump tile was (felled trees grow back), so a
   * view built while a tree lies felled still has that tree to restore.
   */
  constructor(private readonly world: WorldMap, scene: THREE.Scene, private readonly stumpOf: (x: number, y: number, z: number) => Obj | null = () => null) {
    scene.add(this.group);
    // always in the scene (intensity 0 when unused), so the number of lights never changes shaders
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 7, 1.6);
      this.pool.push(l);
      scene.add(l);
    }
    for (const z of [...world.floors.keys()].sort((a, b) => a - b)) {
      const fv = new FloorView(z, (m) => this.flameMats.includes(m as Mat));
      this.floors.set(z, fv);
      this.group.add(fv.group);
      this.buildGround(fv);
      this.buildObjects(fv);
      for (const h of world.houses) if (h.z === z && !h.noRoof) this.buildRoof(fv, h);
      fv.merger.build(fv.group);
      fv.group.visible = false;
    }
    const f0 = this.floors.get(0);
    if (world.plaza && f0) {
      this.plaza = buildPlazaView(world, world.plaza, (c, o) => f0.m(c, o));
      f0.group.add(this.plaza.group);
      this.flameMats.push(...this.plaza.flameMats);
    }
    if (world.depotHalls.length && f0) {
      this.depotHalls = buildDepotHallsView(world.depotHalls, (c, o) => f0.m(c, o));
      f0.group.add(this.depotHalls.group);
    }
    if (world.sea) {
      this.sea = buildSeaView(world, world.sea);
      this.floors.get(0)?.group.add(this.sea.surface);
      this.floors.get(world.sea.z)?.group.add(this.sea.floor);
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
    // one batch per ground kind: its three texture variants sit side by side in one atlas (one draw call per chunk, not three)
    // painted style: every painted ground kind of the floor is one batch with one material (paintGround.ts)
    let painted: Batch | null = null;
    const getBatch = (g: Ground) => {
      if (PAINTED && paintsGround(g)) {
        if (!painted) {
          const pm = fv.m(0xffffff);
          usePaintedGround(pm, groundIdTexture(w, z), w);
          painted = new Batch(tileGeo, pm, false);
          batches.set('painted', painted);
        }
        return painted;
      }
      const key = `${g}`;
      let b = batches.get(key);
      if (!b) {
        const tex = groundAtlas(g);
        if (tex && (g === Ground.Water || g === Ground.DeepWater) && !this.waterTex.includes(tex)) this.waterTex.push(tex);
        let mm = matFor.get(key);
        if (!mm) {
          mm = fv.m(0xffffff, { map: tex, emissive: g === Ground.Lava ? 0xb8400c : 0x000000 });
          if (tex) useVariantAtlas(mm);
          if (g === Ground.Lava) this.flameMats.push(mm);
          matFor.set(key, mm);
        }
        b = new Batch(tileGeo, mm, false);
        b.variants = !!tex;
        batches.set(key, b);
      }
      return b;
    };
    const rock = new Batch(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), fv.m(0x7a7068, { map: objTex.cliff() }));
    const sea = w.sea;
    // reef walls of the Sunken Reach: paler weathered stone, some of it crusted with red coral
    const reefRock = new Batch(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), fv.m(0xffffff, { map: objTex.rock() }));
    const c = new THREE.Color();
    // below ground every rock tile is drawn as rock: a shaded rock top, jagged walls, torches, glows (caveRock.ts)
    const caveRock = z < 0 && CAVE_ROCK_FLOORS.includes(z);
    if (caveRock) {
      const cave = buildCaveRock(w, z, (col, o) => fv.m(col, o), this.flameMats);
      fv.group.add(cave.group);
      fv.lights.push(...cave.lights);
    }
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const g = w.getGround(x, y, z);
        if (g === Ground.Void) {
          // underground: solid rock next to any open tile
          if (z < 0 && this.bordersOpen(x, y, z)) {
            // the Sunken Reach: reef walls, paler and blue-green instead of cave rock
            const reef = sea && z === sea.z && x >= sea.x0 && x <= sea.x1 && y >= sea.y0 && y <= sea.y1;
            if (reef) reefRock.add(compose(x, 0, y, hash2(x, y, 5) * 0.3, 1.02, 0.55 + hash2(x, y, 3) * 0.45, 1.02), c.setHex(hash2(x, y, 6) < 0.15 ? 0x9a6a5a : 0x7a9898).multiplyScalar(0.8 + hash2(x, y, 4) * 0.35));
            // floors not yet rolled out to the solid-rock look keep the old plain rock blocks
            else if (!caveRock) rock.add(compose(x, 0, y, 0, 1, 0.9 + hash2(x, y, 3) * 0.25, 1), c.setScalar(0.85 + hash2(x, y, 4) * 0.25));
          }
          continue;
        }
        if (z === 0 && g === Ground.DeepWater && !this.nearLand(x, y)) continue; // the open sea is the backdrop plane
        const v = Math.floor(hash2(x, y, 17) * 3);
        // painted style: no per-tile brightness (it would show the tile grid); the shader varies colour across the land
        const shade = PAINTED && paintsGround(g) ? 1 : 0.92 + hash2(x, y) * 0.1;
        const water = g === Ground.Water || g === Ground.DeepWater || g === Ground.Lava;
        const raised = g === Ground.Stone || g === Ground.Wood || g === Ground.Marble ? 0.02 : 0;
        getBatch(g).add(compose(x, water ? -0.33 : -0.15 + raised, y), c.setScalar(shade), -1, v);
      }
    }
    for (const b of batches.values()) b.build(fv.group);
    rock.build(fv.group);
    reefRock.build(fv.group);

    // grass tufts on the surface
    if (z === 0 || z === 1) {
      const tuftGeo = geo(new THREE.ConeGeometry(0.05, 0.22, 3), 0.11);
      const tuftMat = fv.m(0xffffff);
      applyWind(tuftMat, WIND_GRASS);
      const tufts = new Batch(tuftGeo, tuftMat, false, 'decor');
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
      tufts.build(fv.group);
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
    const B = (g: THREE.BufferGeometry, m: THREE.Material, shadows = true, tag: '' | 'small' | 'decor' = '') => new Batch(g, m, shadows, tag);

    const leaves = objTex.leaves();
    const bark = objTex.bark();
    const trunkMat = M(0x7a5434, bark);
    const leafMat = M(0xffffff, leaves);
    const plainMat = M(0xffffff);
    // wind (render/weather/wind.ts): canopies and trunks bend by height, bushes, ferns, flowers and crops on their own profiles
    const bushMat = M(0xffffff, leaves);
    const flowerMat = M(0xffffff);
    const stemMat = M(0x3f7a2a);
    const wheatMat = M(0xd8b64a);
    const palmMat = M(0x9a7a4a, bark);
    applyWind(leafMat, WIND_TREE);
    applyWind(plainMat, WIND_BUSH);
    applyWind(trunkMat, WIND_TREE);
    applyWind(bushMat, WIND_BUSH);
    applyWind(flowerMat, WIND_GRASS);
    applyWind(stemMat, WIND_GRASS);
    applyWind(wheatMat, WIND_CROP);
    applyWind(palmMat, WIND_PALM);
    const trunkGeo = geo(new THREE.CylinderGeometry(0.11, 0.17, 1.3, 6), 0.65);
    const trunks = B(trunkGeo, trunkMat);
    // living trees get their own trunk batch, indexed by tile, so they can be felled
    const treeTrunks = B(trunkGeo, trunkMat);
    const stumpTiles: number[] = [];
    // ore rocks (mining): a boulder plus a few coloured veins, both indexed by tile
    const oreRock = B(new THREE.DodecahedronGeometry(0.44, 0), M(0xffffff, objTex.rock()));
    const oreVein = B(new THREE.OctahedronGeometry(0.1, 0), M(0xffffff, null, 0x161210), false);
    const rubbleTiles: number[] = [];
    const canopyLow = B(PAINTED ? paintedProps.canopyLow() : new THREE.IcosahedronGeometry(0.72, 0), leafMat);
    const canopyHigh = B(PAINTED ? paintedProps.canopyHigh() : new THREE.IcosahedronGeometry(0.5, 0), leafMat);
    const pine1 = B(PAINTED ? paintedProps.pine(0.78, 1.25, 1) : new THREE.ConeGeometry(0.78, 1.25, 7), leafMat);
    const pine2 = B(PAINTED ? paintedProps.pine(0.58, 1.05, 2) : new THREE.ConeGeometry(0.58, 1.05, 7), leafMat);
    const pine3 = B(PAINTED ? paintedProps.pine(0.36, 0.85, 3) : new THREE.ConeGeometry(0.36, 0.85, 7), leafMat);
    const jungle1 = B(PAINTED ? paintedProps.jungle() : new THREE.IcosahedronGeometry(0.85, 0), leafMat);
    const palmTrunk = B(geo(new THREE.CylinderGeometry(0.07, 0.12, 2.2, 5), 1.1), palmMat);
    const frond = B(geo(new THREE.BoxGeometry(0.22, 0.05, 1.0), 0), leafMat);
    const deadBranch = B(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5), M(0x5a5048), true, 'small');
    const rocks = B(PAINTED ? paintedProps.rock() : new THREE.DodecahedronGeometry(0.42, 0), M(0xffffff, objTex.rock()));
    const bushes = B(PAINTED ? paintedProps.bush() : new THREE.IcosahedronGeometry(0.42, 0), bushMat);
    const ferns = B(geo(new THREE.ConeGeometry(0.32, 0.4, 5), 0.2), bushMat, false);
    const berry = B(new THREE.IcosahedronGeometry(0.06, 0), plainMat, true, 'decor');
    const flowers = B(new THREE.IcosahedronGeometry(0.065, 0), flowerMat, false);
    const stems = B(geo(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 3), 0.1), stemMat, false);
    const wheat = B(geo(new THREE.ConeGeometry(0.06, 0.55, 4), 0.27), wheatMat, false);
    const plaster = M(0xffffff, objTex.plaster());
    const brick = M(0xffffff, objTex.brick());
    const wallsWood = B(geo(new THREE.BoxGeometry(1, 1.7, 1), 0.85), plaster);
    const wallsStone = B(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), brick);
    const beams = B(new THREE.BoxGeometry(1.02, 0.12, 1.02), M(0x4a2f1b), true, 'small');
    const post = geo(new THREE.BoxGeometry(0.16, 1.7, 0.16), 0.85);
    const doorPosts = B(post, M(0x4a2f1b), true, 'small');
    const lintels = B(new THREE.BoxGeometry(1, 0.2, 0.22), M(0x4a2f1b), true, 'small');
    const fPosts = B(geo(new THREE.BoxGeometry(0.12, 0.85, 0.12), 0.42), M(0x7a5634), true, 'small');
    const rails = B(new THREE.BoxGeometry(1, 0.07, 0.06), M(0x8c6640), true, 'small');
    const railPosts = B(geo(new THREE.BoxGeometry(0.1, 0.7, 0.1), 0.35), M(0x6a4a2c), true, 'small');
    const headstones = B(geo(new THREE.BoxGeometry(0.5, 0.7, 0.14), 0.35), M(0xffffff, objTex.rock()));
    const mounds = B(new THREE.BoxGeometry(0.5, 0.14, 0.75), M(0x5a4530), true, 'small');
    const barrels = B(geo(new THREE.CylinderGeometry(0.28, 0.3, 0.7, 10), 0.35), M(0x7b5230));
    const hoops = B(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 10), M(0x3d3d42), true, 'small');
    const crates = B(geo(new THREE.BoxGeometry(0.7, 0.6, 0.7), 0.3), M(0x9a7444, objTex.logs()));
    const tableTop = B(new THREE.BoxGeometry(0.9, 0.08, 0.7), M(0x80592f));
    const tableLeg = B(geo(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0.25), M(0x5b3d24), true, 'small');
    const hay = B(geo(new THREE.BoxGeometry(0.85, 0.5, 0.75), 0.25), M(0xd9b95a));
    const lampPost = B(geo(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 6), 0.9), M(0x2d2d33), true, 'small');
    const glowMat = M(0xffd27a, null, 0xffb84a);
    const lampGlow = B(new THREE.BoxGeometry(0.22, 0.26, 0.22), glowMat, false);
    const cliffs = B(geo(new THREE.BoxGeometry(1, 3.1, 1), 1.55), M(0xffffff, objTex.cliff()));
    const stakes = B(geo(new THREE.BoxGeometry(1, 2.0, 0.35), 1.0), M(0xffffff, objTex.stakes()));
    const stakeTips = B(geo(new THREE.ConeGeometry(0.12, 0.35, 4), 2.15), M(0x6a4a2c), true, 'small');
    const stoneWalls = B(geo(new THREE.BoxGeometry(1, 1.9, 1), 0.95), brick);
    const pillars = B(geo(new THREE.CylinderGeometry(0.28, 0.32, 2.1, 8), 1.05), M(0xd8d2c4, objTex.rock()));
    const counters = B(geo(new THREE.BoxGeometry(1, 0.85, 0.7), 0.42), M(0x7a5634, objTex.logs()));
    const altars = B(geo(new THREE.BoxGeometry(1, 0.8, 0.8), 0.4), M(0xbab2a4, objTex.rock()));
    const stalag = B(PAINTED ? paintedProps.stalagmite() : geo(new THREE.ConeGeometry(0.3, 1.4, 6), 0.7), M(0x7a7068, objTex.rock()));
    const bones = B(new THREE.BoxGeometry(0.4, 0.05, 0.06), M(0xe8e0c6), false);
    const skulls = B(new THREE.IcosahedronGeometry(0.09, 0), M(0xe8e0c6), false);
    const fireMat = M(0xff8a2a, null, 0xff5a10);
    this.flameMats.push(fireMat);
    const flames = B(geo(new THREE.ConeGeometry(0.16, 0.5, 5), 0.25), fireMat, false);
    const torchSticks = B(geo(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), 1.2), M(0x5b3d24), true, 'small');
    const torchFlame = B(geo(new THREE.ConeGeometry(0.08, 0.22, 5), 1.55), fireMat, false);
    // depot lockers: instanced (the big depot halls hold 15–19 each), same look as before
    const lockerBox = B(geo(new THREE.BoxGeometry(0.8, 1.6, 0.6), 0.8), M(0x6a4428, objTex.logs()));
    const lockerTop = B(geo(new THREE.BoxGeometry(0.9, 0.08, 0.7), 1.62), M(0x4a2f1b), true, 'small');
    const lockerPlate = B(new THREE.BoxGeometry(0.3, 0.2, 0.04), M(0xe0b03c), false);

    const leafColors = [0x3f7d34, 0x4a8a38, 0x356f2e, 0x4f9340];
    const pineColors = [0x2f5e34, 0x2a5530, 0x356a3a, 0x284f2d];
    const isA = (xx: number, yy: number, objs: Obj[]) => w.inBounds(xx, yy) && objs.includes(w.getObj(xx, yy, z));
    const decor = new DecorBuilder(w, z, (col, o) => fv.m(col, o), this.flameMats);

    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        let o = w.getObj(x, y, z);
        if (o === Obj.None) continue;
        const ti = w.idx(x, y);
        if (o === Obj.Stump) {
          const tree = this.stumpOf(x, y, z);
          if (tree === null) continue;
          o = tree;
          stumpTiles.push(ti);
        }
        if (o === Obj.DepletedRock) {
          const ore = this.stumpOf(x, y, z);
          if (ore === null) continue;
          o = ore;
          rubbleTiles.push(ti);
        }
        const h = hash2(x, y, 3);
        const rot = hash2(x, y, 5) * Math.PI * 2;
        const c = new THREE.Color();
        switch (o) {
          case Obj.Tree: {
            const s = 0.9 + h * 0.35;
            treeTrunks.add(compose(x, 0, y, rot, s, s, s), 0xffffff, ti);
            c.setHex(leafColors[Math.floor(hash2(x, y, 9) * 4)]);
            canopyLow.add(compose(x, 1.55 * s, y, rot, s, s * 0.9, s), c, ti);
            canopyHigh.add(compose(x + 0.12, 2.1 * s, y - 0.08, rot, s, s, s), c.clone().multiplyScalar(1.12), ti);
            break;
          }
          case Obj.Pine: {
            const s = 0.85 + h * 0.4;
            treeTrunks.add(compose(x, 0, y, rot, s * 0.8, s * 0.8, s * 0.8), 0xffffff, ti);
            c.setHex(pineColors[Math.floor(hash2(x, y, 9) * 4)]);
            pine1.add(compose(x, 1.15 * s, y, rot, s, s, s), c, ti);
            pine2.add(compose(x, 1.8 * s, y, rot, s, s, s), c.clone().multiplyScalar(1.08), ti);
            pine3.add(compose(x, 2.4 * s, y, rot, s, s, s), c.clone().multiplyScalar(1.16), ti);
            break;
          }
          case Obj.JungleTree: {
            const s = 1.0 + h * 0.4;
            treeTrunks.add(compose(x, 0, y, rot, s * 1.2, s * 1.3, s * 1.2), 0xffffff, ti);
            jungle1.add(compose(x, 2.0 * s, y, rot, s * 1.1, s * 0.75, s * 1.1), c.setHex(0x2f6a26).multiplyScalar(0.9 + h * 0.3), ti);
            canopyHigh.add(compose(x - 0.2, 2.5 * s, y + 0.1, rot, s * 1.2, s * 0.9, s * 1.2), c.clone().multiplyScalar(1.15), ti);
            break;
          }
          case Obj.Palm: {
            const lean = (h - 0.5) * 0.4;
            palmTrunk.add(compose(x, 0, y, rot, 1, 1, 1, lean, 0), 0xffffff, ti);
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
            fv.staticFires.add(this.world.idx(x, y));
            for (let i = 0; i < 3; i++) flames.add(compose(x + Math.cos(i * 2.1) * 0.12, 0, y + Math.sin(i * 2.1) * 0.12, 0, 1, 1.2, 1));
            for (let i = 0; i < 4; i++) deadBranch.add(compose(x + Math.cos(i * 1.6) * 0.2, 0.05, y + Math.sin(i * 1.6) * 0.2, i * 1.6, 0.6, 0.6, 0.6, Math.PI / 2, 0));
            break;
          case Obj.FireField:
            if (this.isRuneField(x, y, z)) break;
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
            lockerBox.add(compose(x, 0, y));
            lockerTop.add(compose(x, 0, y));
            lockerPlate.add(compose(x, 1.2, y + 0.31));
            break;
          case Obj.MarketBoard:
            this.buildMarketBoard(fv, x, y);
            break;
          case Obj.Furnace:
            this.buildFurnace(fv, x, y);
            break;
          case Obj.Anvil:
            this.buildAnvil(fv, x, y);
            break;
          case Obj.Stove:
            this.buildStove(fv, x, y);
            break;
          case Obj.TanningRack:
            this.buildTanningRack(fv, x, y);
            break;
          case Obj.FoundersStone:
            this.buildFoundersStone(fv, x, y);
            break;
          case Obj.CopperRock:
          case Obj.TinRock:
          case Obj.IronRock:
          case Obj.CoalRock:
          case Obj.SilverRock:
          case Obj.GoldRock:
          case Obj.StarsteelRock:
          case Obj.DarkstoneRock: {
            const ore = oreAt(o)!;
            oreRock.add(compose(x, 0.24, y, rot, 1.05 + h * 0.2, 0.85 + h * 0.2, 1), c.setHex(0x8a847c).multiplyScalar(0.85 + h * 0.25), ti);
            const vein = new THREE.Color(ore.color);
            for (let i = 0; i < 4; i++) {
              const a = rot + i * 1.7;
              const r = 0.3 + hash2(x, y, 60 + i) * 0.08;
              oreVein.add(compose(x + Math.cos(a) * r, 0.25 + hash2(x, y, 70 + i) * 0.35, y + Math.sin(a) * r, a, 1, 0.7 + hash2(x, y, 80 + i) * 0.6, 1), vein, ti);
            }
            break;
          }
          default:
            decor.add(o, x, y);
            break;
        }
      }
    }
    decor.build(fv.group);
    fv.lights.push(...decor.lights);

    const all = [trunks, rocks, bushes, ferns, berry, flowers, stems, wheat, wallsWood, wallsStone, beams, doorPosts, lintels, fPosts, rails, railPosts,
      headstones, mounds, barrels, hoops, crates, tableTop, tableLeg, hay, lampPost, lampGlow, deadBranch, stakes, stakeTips,
      stoneWalls, pillars, counters, altars, stalag, bones, skulls, flames, torchSticks, torchFlame, lockerBox, lockerTop, lockerPlate];
    for (const b of all) b.build(fv.group);
    for (const b of [treeTrunks, palmTrunk]) {
      const L = newLayer();
      b.build(fv.group, L);
      if (L.meshes.length) fv.trunkLayers.push(L);
    }
    const fadeBatches: Array<[Batch, number]> = [[canopyLow, 0x4a8a38], [canopyHigh, 0x4a8a38], [pine1, 0x2f5e34], [pine2, 0x2f5e34], [pine3, 0x2f5e34], [jungle1, 0x2f6a26], [frond, 0x4a9a3a], [cliffs, 0x6a6058]];
    for (const [b, proxyColor] of fadeBatches) {
      const proxyMat = new THREE.MeshToonMaterial({ color: proxyColor, gradientMap: toonGradient(), transparent: true, opacity: 0.25, depthWrite: false });
      const L: FadeLayer = { ...newLayer(), proxyMat };
      b.build(fv.group, L);
      if (L.meshes.length) fv.fadeLayers.push(L);
    }
    for (const ti of stumpTiles) this.setStump(fv, ti, true);
    for (const b of [oreRock, oreVein]) {
      // index 0 = the boulders, 1 = the veins (even when a floor has no ore at all)
      const L = newLayer();
      b.build(fv.group, L);
      fv.oreLayers.push(L);
    }
    for (const ti of rubbleTiles) this.setRubble(fv, ti, true);
  }

  /** Shows an ore rock as mined-out rubble (veins gone, boulder flattened) or full again. */
  private setRubble(fv: FloorView, ti: number, on: boolean): void {
    if (on === fv.rubble.has(ti)) return;
    if (on) fv.rubble.add(ti);
    else fv.rubble.delete(ti);
    fv.oreLayers.forEach((L, li) => {
      const list = L.byTile.get(ti) ?? [];
      for (let k = 0; k < list.length; k += 2) {
        const mesh = L.meshes[list[k]], i = list[k + 1];
        const orig = originalOf(L, list[k], i);
        // layer 0 is the boulder (flattened), the others are veins (hidden)
        mesh.setMatrixAt(i, !on ? orig : li === 0 ? orig.multiply(RUBBLE_SCALE) : ZERO);
        mesh.instanceMatrix.needsUpdate = true;
        if (li === 0 && mesh.instanceColor) {
          mesh.getColorAt(i, tmpC);
          mesh.setColorAt(i, on ? tmpC.multiplyScalar(0.7) : tmpC.multiplyScalar(1 / 0.7));
          mesh.instanceColor.needsUpdate = true;
        }
      }
    });
  }

  /** A stone smelting furnace with a glowing mouth and a chimney (blacksmithing). */
  private buildFurnace(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const stone = fv.m(0x8a7a6a, { map: objTex.rock() });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.05, 0.8), stone);
    body.position.y = 0.52;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.12, 0.88), fv.m(0x5a5048));
    top.position.y = 1.1;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), stone);
    chimney.position.set(0.18, 1.55, -0.16);
    const fire = fv.m(0xff8a2a, { emissive: 0xff5a10 });
    this.flameMats.push(fire);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.05), fire);
    mouth.position.set(0, 0.38, 0.41);
    const coals = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.18), fv.m(0x2a1a14, { emissive: 0x6a1a00 }));
    coals.position.set(0, 0.2, 0.36);
    g.add(body, top, chimney, mouth, coals);
    this.add(fv, g);
  }

  /** An iron anvil on a wooden block (blacksmithing). */
  private buildAnvil(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 8), fv.m(0x6a4428, { map: objTex.logs() }));
    block.position.y = 0.21;
    const iron = fv.m(0x3d4048);
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), iron);
    waist.position.y = 0.5;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.26), fv.m(0x55595f));
    face.position.y = 0.66;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), iron);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(0.44, 0.66, 0);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.3), fv.m(0x5b3d24));
    hammer.position.set(-0.12, 0.75, 0.04);
    hammer.rotation.y = 0.5;
    g.add(block, waist, face, horn, hammer);
    this.add(fv, g);
  }

  /** An iron cooking stove with a glowing grate and a pot on top (cooking; in every depot). */
  private buildStove(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const iron = fv.m(0x3a3c42);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), iron);
    body.position.y = 0.35;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.76), fv.m(0x55595f));
    top.position.y = 0.73;
    const fire = fv.m(0xff8a2a, { emissive: 0xff5a10 });
    this.flameMats.push(fire);
    const grate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.04), fire);
    grate.position.set(0, 0.25, 0.36);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), iron);
    pipe.position.set(-0.26, 1.18, -0.22);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 8), fv.m(0x6a6e76));
    pot.position.set(0.12, 0.86, 0.05);
    g.add(body, top, grate, pipe, pot);
    this.add(fv, g);
  }

  /** A wooden frame with a hide stretched across it (crafting; in every smithy). */
  private buildTanningRack(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const wood = fv.m(0x6a4428, { map: objTex.logs() });
    for (const px of [-0.38, 0.38]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 0.07), wood);
      post.position.set(px, 0.6, 0);
      g.add(post);
    }
    for (const py of [0.25, 1.12]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.06), wood);
      rail.position.set(0, py, 0);
      g.add(rail);
    }
    const hide = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.02), fv.m(0xa8743f));
    hide.position.set(0, 0.68, 0.02);
    hide.rotation.z = 0.04;
    g.add(hide);
    this.add(fv, g);
  }

  /** A campfire a player lit: crossed logs and a flickering flame (removed when it burns out). */
  private setLitFire(fv: FloorView, x: number, y: number, on: boolean): void {
    const ti = this.world.idx(x, y);
    const had = fv.litFires.get(ti);
    if (on === !!had || fv.staticFires.has(ti)) return;
    if (had) {
      fv.group.remove(had);
      had.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      fv.litFires.delete(ti);
      return;
    }
    if (!fv.litMats) {
      const flameMat = fv.m(0xff8a2a, { emissive: 0xff5a10 });
      this.flameMats.push(flameMat);
      fv.litMats = {
        wood: fv.m(0x5b3d24, { map: objTex.logs() }), flame: flameMat,
        glow: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
      };
    }
    const { wood, flame, glow } = fv.litMats;
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), wood);
      log.rotation.z = Math.PI / 2 - 0.25;
      log.rotation.y = i * (Math.PI / 4) + 0.3;
      log.position.y = 0.07;
      g.add(log);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45 + i * 0.08, 5), flame);
      f.position.set(Math.cos(i * 2.1) * 0.08, 0.28, Math.sin(i * 2.1) * 0.08);
      f.castShadow = false;
      g.add(f);
    }
    const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), glow);
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.y = 0.03;
    g.add(glowDisc);
    fv.group.add(g);
    fv.litFires.set(ti, g);
  }

  /** The carved memorial to the founders in the Thornvale temple. */
  private buildFoundersStone(fv: FloorView, x: number, y: number): void {
    const g = buildFoundersStone((c, o) => fv.m(c, o), objTex.rock());
    g.position.set(x, 0, y);
    this.add(fv, g);
  }

  /** Shows a tree as a stump (canopy gone, trunk cut short) or restores it. */
  private setStump(fv: FloorView, ti: number, on: boolean): void {
    if (on === fv.stumps.has(ti)) return;
    if (on) fv.stumps.add(ti);
    else fv.stumps.delete(ti);
    for (const L of fv.trunkLayers) {
      const list = L.byTile.get(ti) ?? [];
      for (let k = 0; k < list.length; k += 2) {
        const orig = originalOf(L, list[k], list[k + 1]);
        L.meshes[list[k]].setMatrixAt(list[k + 1], on ? orig.multiply(STUMP_SCALE) : orig);
        L.meshes[list[k]].instanceMatrix.needsUpdate = true;
      }
    }
    // a stump that is faded right now gets its canopy back when the fade lets go (restoreTile skips stumps)
    if (!on && fv === this.fadedFloor && this.faded.has(ti)) return;
    for (const L of fv.fadeLayers) this.setTileMatrices(L, ti, on);
  }

  /** Hides (zero scale) or restores every instance of a tile in a layer. */
  private setTileMatrices(L: TileLayer, ti: number, hide: boolean): void {
    const list = L.byTile.get(ti);
    if (!list) return;
    for (let k = 0; k < list.length; k += 2) {
      const mesh = L.meshes[list[k]];
      mesh.setMatrixAt(list[k + 1], hide ? ZERO : originalOf(L, list[k], list[k + 1]));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private buildMarketBoard(fv: FloorView, x: number, y: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, y);
    const wood = fv.m(0x6a4428, { map: objTex.logs() });
    for (const px of [-0.36, 0.36]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood);
      post.position.set(px, 0.75, 0);
      g.add(post);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.66, 0.08), fv.m(0x8a5e34, { map: objTex.logs() }));
    board.position.set(0, 1.12, 0.02);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.07, 0.2), fv.m(0x4a2f1b));
    cap.position.set(0, 1.48, 0.02);
    g.add(board, cap);
    // pinned notices and a gold coin sign
    const paper = fv.m(0xefe6cf);
    for (const [nx, ny, r] of [[-0.22, 1.2, 0.08], [0.05, 1.04, -0.06], [0.24, 1.22, 0.1], [-0.12, 0.95, -0.04]]) {
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.01), paper);
      note.position.set(nx, ny, 0.07);
      note.rotation.z = r;
      g.add(note);
    }
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10), fv.m(0xe8b923, { emissive: 0x3a2a00 }));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, 1.62, 0.02);
    g.add(coin);
    this.add(fv, g);
  }

  /** Adds static models to a floor: their plain parts are baked into the floor's merged chunk meshes (staticMerge.ts). */
  private add(fv: FloorView, ...meshes: THREE.Object3D[]): void {
    for (const m of meshes) {
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      if (!fv.merger.take(m)) fv.group.add(m);
    }
  }

  /** Adds models that change at runtime (dig holes, roofs that fade): never merged. */
  private addLive(fv: FloorView, ...meshes: THREE.Object3D[]): void {
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
    this.addLive(fv, stones, holeG);
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
    // both slopes in one mesh and both gables in one (fewer draw calls; the roof still fades as one)
    const slopes: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const sg = new THREE.BoxGeometry(length, 0.09, slopeLen);
      sg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, rise / 2, (side * half) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(side * pitch, 0, 0)), new THREE.Vector3(1, 1, 1)));
      slopes.push(sg);
    }
    g.add(new THREE.Mesh(joinGeometries(slopes), roofMat));
    const tri = new THREE.Shape();
    tri.moveTo(-half + overhang, 0);
    tri.lineTo(half - overhang, 0);
    tri.lineTo(0, rise - overhang * (rise / half));
    tri.lineTo(-half + overhang, 0);
    const gables: THREE.BufferGeometry[] = [];
    for (const end of [-1, 1]) {
      const gg = new THREE.ShapeGeometry(tri);
      gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(end * (length / 2 - overhang), 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, end === 1 ? Math.PI / 2 : -Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)));
      gables.push(gg);
    }
    g.add(new THREE.Mesh(joinGeometries(gables), gableMat));
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 0.06, 0.14, 0.18), beamMat);
    ridge.position.y = rise + 0.03;
    g.add(ridge);
    g.position.set(h.x + (h.w - 1) / 2, eave, h.y + (h.h - 1) / 2);
    if (!alongX) g.rotation.y = Math.PI / 2;
    this.addLive(fv, g);
    fv.roofs.push({ house: h, group: g, materials: [roofMat, gableMat, beamMat], opacity: 1 });
  }

  // ================================================================ graphics setting

  /** Settings → Display → Graphics: small props stop casting shadows, decoration hides (graphics.ts). */
  setGraphics(g: GraphicsLevel): void {
    this.group.traverse((o) => {
      const tag = o.userData.gfx as string | undefined;
      if (o.name === 'dust') o.visible = g.decor;
      if (!tag) return;
      if (o.userData.cast === undefined) o.userData.cast = o.castShadow;
      if (tag === 'small') o.castShadow = (o.userData.cast as boolean) && g.smallShadows;
      if (tag === 'decor') o.visible = g.decor;
    });
  }

  // ================================================================ per-frame

  onTileChanged(x: number, y: number, z: number): void {
    const fv = this.floors.get(z);
    if (!fv) return;
    const ti = this.world.idx(x, y);
    const o = this.world.getObj(x, y, z);
    // woodcutting: a tree was felled or grew back
    if (o === Obj.Stump || o === Obj.Tree || o === Obj.Pine || o === Obj.JungleTree || o === Obj.Palm) this.setStump(fv, ti, o === Obj.Stump);
    // mining: an ore rock was mined out or filled again
    if (o === Obj.DepletedRock || oreAt(o)) this.setRubble(fv, ti, o === Obj.DepletedRock);
    // firemaking: a campfire flared up or burnt out
    if (o === Obj.Campfire || fv.litFires.has(ti)) this.setLitFire(fv, x, y, o === Obj.Campfire);
    const f = fv.features.get(ti);
    if (!f) return;
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
    if (this.plaza && pz >= 0) this.plaza.update(dt);
    this.sea?.update(dt, pz);
    const flick = 0.75 + Math.sin(this.time * 9) * 0.12 + Math.sin(this.time * 23) * 0.08;
    for (const m of this.flameMats) m.emissiveIntensity = flick;

    const p0 = playerTiles[playerTiles.length - 1] ?? { x: 0, y: 0 };
    this.depotHalls?.update(dt, Math.round(p0.x), Math.round(p0.y), pz);
    CAVE_UNIFORMS.uTime.value = this.time;
    CAVE_UNIFORMS.uLight.value.set(p0.x, 0, p0.y);
    this.updateLightPool(dt, pz, p0);
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

  /** Points the few real lights at the torches, braziers and lava nearest the player, flickering. */
  private updateLightPool(dt: number, pz: number, p: { x: number; y: number }): void {
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.3;
      const list = this.floors.get(pz)?.lights ?? [];
      const near: Array<[number, LightSource]> = [];
      for (const l of list) {
        const d = Math.max(Math.abs(l.x - p.x), Math.abs(l.y - p.y));
        if (d < 14) near.push([d, l]);
      }
      near.sort((a, b) => a[0] - b[0]);
      this.poolPick = near.slice(0, this.pool.length).map((n) => n[1]);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const L = this.pool[i];
      const s = this.poolPick[i];
      if (!s) { L.intensity = 0; continue; }
      L.color.setHex(s.color);
      L.position.set(s.x, s.h, s.y);
      // painted style: wider, stronger warm pools of light around fires and torches
      L.distance = (4.5 + s.power * 2.5) * (PAINTED ? 1.35 : 1);
      L.intensity = s.power * (PAINTED ? 1.6 : 1) * (3.2 + Math.sin(this.time * (8 + i) + s.x) * 0.5 + Math.sin(this.time * (19 + i * 3) + s.y) * 0.35);
    }
  }

  /** Every floor's group by floor number (for warming up the GPU at load), plus the sea floor's own group. */
  floorGroups(): { floors: Array<[number, THREE.Group]>; sea: THREE.Object3D | null } {
    return { floors: [...this.floors].map(([z, fv]) => [z, fv.group] as [number, THREE.Group]), sea: this.sea?.floor ?? null };
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
      // only trees between the camera (south) and the player fade; the tree you chop beside or above you stays solid
      for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (!w.inBounds(x, y)) continue;
        const o = w.getObj(x, y, fv.z);
        if (o === Obj.Tree || o === Obj.Pine || o === Obj.JungleTree || o === Obj.Palm || o === Obj.Cliff) want.add(w.idx(x, y));
      }
    }
    // restore what no longer needs fading (and everything when the floor changed)
    const floorChanged = this.fadedFloor !== fv;
    if (this.fadedFloor && floorChanged) {
      for (const ti of this.faded) this.restoreTile(this.fadedFloor, ti);
      this.faded.clear();
    }
    let changed = floorChanged;
    for (const ti of this.faded) if (!want.has(ti)) { this.restoreTile(fv, ti); changed = true; }
    // only tiles that start fading touch the instance buffers (each touch re-uploads a chunk's buffer)
    for (const ti of want) {
      if (this.faded.has(ti)) continue;
      changed = true;
      for (const L of fv.fadeLayers) this.setTileMatrices(L, ti, true);
    }
    this.faded = want;
    this.fadedFloor = fv;
    if (!changed) return;
    let pi = 0;
    for (const ti of want) {
      if (fv.stumps.has(ti)) continue;
      for (const L of fv.fadeLayers) {
        const list = L.byTile.get(ti);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 2) {
          const proxy = this.proxy(pi++, L, L.meshes[list[k]].geometry);
          proxy.matrix.copy(originalOf(L, list[k], list[k + 1]));
          proxy.visible = true;
          if (proxy.parent !== fv.group) fv.group.add(proxy);
        }
      }
    }
    for (; pi < this.proxies.length; pi++) this.proxies[pi].visible = false;
  }

  private restoreTile(fv: FloorView, ti: number): void {
    // a stump keeps its canopy hidden
    if (fv.stumps.has(ti)) return;
    for (const L of fv.fadeLayers) this.setTileMatrices(L, ti, false);
  }

  private proxy(i: number, L: FadeLayer, geometry: THREE.BufferGeometry): THREE.Mesh {
    let p = this.proxies[i];
    if (!p) {
      p = new THREE.Mesh(geometry, L.proxyMat);
      p.matrixAutoUpdate = false;
      p.renderOrder = 2;
      this.proxies[i] = p;
    }
    p.geometry = geometry;
    p.material = L.proxyMat;
    return p;
  }
}
