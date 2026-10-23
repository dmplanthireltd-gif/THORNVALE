import * as THREE from 'three';
import { hash2 } from '../../game/core/rng';
import { Obj, type House, type WorldMap } from '../../game/world/WorldMap';
import { Cell } from './builtAtlas';
import { houseStyle, townKindAt, type HouseStyle } from './houseStyle';
import { PaintMesher, type PartOpt, type V3 } from './paintMesh';

/**
 * Painted style: walls, doors, windows, fences, palisades, stairs and roofs of the
 * built world, as pieces for the floor's PaintMesher (one merged mesh per chunk).
 * Silhouettes are slightly irregular (world-space jitter), every wall stands on a
 * plinth with a soft dark foot, timber houses get real frame beams, log houses
 * crossed log ends, windows get frames, sills and shutters, doors stand ajar.
 */

const WALLISH = new Set<number>([Obj.Wall, Obj.StoneWall, Obj.SandWall]);
/** Unit vectors of the four faces: +x (east), -x (west), +z (south), -z (north). */
const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A vertical wall face of width 1 in the local XY plane (facing +Z), rows at the given heights. */
function face(ys: number[], cols = 2, w = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < cols; c++) {
    const x0 = -w / 2 + (c / cols) * w, x1 = -w / 2 + ((c + 1) / cols) * w, y0 = ys[r], y1 = ys[r + 1];
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
    for (let k = 0; k < 6; k++) nor.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Rotation that turns a +Z-facing face toward direction (dx, dz). */
const faceRot = (dx: number, dz: number): number => (dx === 1 ? Math.PI / 2 : dx === -1 ? -Math.PI / 2 : dz === 1 ? 0 : Math.PI);

export class PaintBuildings {
  constructor(private readonly w: WorldMap, private readonly z: number, private readonly S: PaintMesher) {}

  private obj(x: number, y: number): number {
    return this.w.inBounds(x, y) ? this.w.getObj(x, y, this.z) : Obj.None;
  }

  /** The house a wall/door tile belongs to and which faces of it look outside. */
  private outward(h: House | null, x: number, y: number, dx: number, dz: number): boolean {
    if (!h) return true;
    const nx = x + dx, ny = y + dz;
    return nx < h.x || ny < h.y || nx >= h.x + h.w || ny >= h.y + h.h;
  }

  /** A wall tile of a house (Obj.Wall) or a free-standing stone wall (Obj.StoneWall). */
  wall(x: number, y: number, o: number): void {
    const S = this.S;
    const h = o === Obj.Wall ? this.w.houseAt(x, y, this.z) : null;
    const k = townKindAt(x, y);
    const st: HouseStyle | null = h ? houseStyle(this.w, h) : null;
    const r3 = hash2(x, y, 3);
    const H = h ? (h.stone ? 1.9 : 1.7) : o === Obj.StoneWall ? 1.9 * (0.75 + r3 * 0.3) : 1.7;
    const cell = st ? st.wall : o === Obj.SandWall ? Cell.Sandstone : k.stoneWall;
    const tint = st ? st.wallTint : new THREE.Color().setScalar(0.85 + r3 * 0.2);
    const plinth = st ? st.plinth : cell;
    const eaveY = h && !h.noRoof ? H : undefined;
    const ys = [0, 0.3, 0.75, H - 0.45, H];
    const base: PartOpt = { cell, tint, jitter: 0.018, ao: 0.4, aoH: 0.6, eaveY, grit: 0.04 };
    const horiz = WALLISH.has(this.obj(x - 1, y)) || WALLISH.has(this.obj(x + 1, y)) || this.obj(x - 1, y) === Obj.Door || this.obj(x + 1, y) === Obj.Door;
    const vert = WALLISH.has(this.obj(x, y - 1)) || WALLISH.has(this.obj(x, y + 1)) || this.obj(x, y - 1) === Obj.Door || this.obj(x, y + 1) === Obj.Door;
    const corner = horiz && vert;
    for (const [dx, dz] of DIRS) {
      const n = this.obj(x + dx, y + dz);
      if (WALLISH.has(n)) continue;
      const rot = faceRot(dx, dz);
      S.push([x + dx * 0.5, 0, y + dz * 0.5], [0, rot, 0]);
      S.add(face(ys), base);
      // the plinth: a rougher stone course with a dark wet foot
      if (cell !== Cell.Logs && cell !== Cell.Leather) S.box(1.0, 0.3, 0.07, { cell: plinth, tint: 0.78, ao: 0.5, aoH: 0.3, jitter: 0.012, grit: 0.08 }, [0, 0.15, 0.02]);
      else S.box(1.0, 0.18, 0.08, { cell: Cell.Fieldstone, tint: 0.7, ao: 0.5, aoH: 0.2, jitter: 0.02 }, [0, 0.09, 0.03]);
      const out = this.outward(h, x, y, dx, dz);
      if (st?.timber) this.timberFace(x, y, dx, dz, H, out);
      if (h && out && !corner && dz !== -1) this.maybeWindow(x, y, dx, dz, H, st!, h);
      if (h && !out && !corner && dz !== -1) this.maybeShelf(x, y, dx, dz, h);
      S.pop();
    }
    // the top of the wall (seen from inside when the roof is off): a coping or a top plate
    S.box(1.02, 0.08, 1.02, { cell: cell === Cell.Logs || cell === Cell.Elven ? Cell.Beam : st?.timber ? cell : plinth, tint: st?.timber ? tint.clone().multiplyScalar(0.85) : 0.8, jitter: 0.015, ao: 0 }, [x, H + 0.02, y]);
    if (st?.timber) {
      // the top plate of the frame, running along the wall
      if (horiz) S.box(1.0, 0.04, 0.22, { cell: Cell.Beam, tint: 0.75, swap: true, ao: 0 }, [x, H + 0.07, y]);
      if (vert) S.box(0.22, 0.04, 1.0, { cell: Cell.Beam, tint: 0.75, ao: 0 }, [x, H + 0.07, y]);
    }
    if (cell === Cell.Logs && corner) this.logEnds(x, y, H);
    if (o === Obj.StoneWall && !h && hash2(x, y, 8) < 0.5) {
      // crumbling merlons on free-standing walls
      S.box(0.46, 0.34, 0.9, { cell, tint, jitter: 0.03 }, [x, H + 0.2, y]);
    }
  }

  /** Timber frame on one plaster face: sill, top plate, studs, and a brace on some tiles. */
  private timberFace(x: number, y: number, dx: number, dz: number, H: number, out: boolean): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Beam, tint: 0.9 + hash2(x, y, 12) * 0.2, jitter: 0.008, ao: 0.25 };
    S.box(1.0, 0.12, 0.05, { ...wood, swap: true }, [0, 0.36, 0.035]);
    S.box(1.0, 0.13, 0.05, { ...wood, swap: true }, [0, H - 0.12, 0.035]);
    S.box(0.11, H - 0.3, 0.05, wood, [-0.5, H / 2 + 0.14, 0.035]);
    // the right-hand stud only where the face ends (a corner or the end of the run)
    const along: [number, number] = dz !== 0 ? [1, 0] : [0, 1];
    const sx = dz === 1 || dx === -1 ? 1 : -1;
    const nx = x + along[0] * sx, ny = y + along[1] * sx;
    if (!WALLISH.has(this.obj(nx, ny))) S.box(0.11, H - 0.3, 0.05, wood, [0.5, H / 2 + 0.14, 0.035]);
    const b = hash2(x, y, 14);
    if (out && b < 0.4) {
      const len = Math.hypot(1, H - 0.6);
      S.box(0.1, len - 0.1, 0.045, { ...wood, r: [0, 0, (b < 0.2 ? 1 : -1) * Math.atan2(1, H - 0.6)] }, [0, H / 2 + 0.1, 0.03]);
    } else if (out && b > 0.7) {
      S.box(1.0, 0.1, 0.045, { ...wood, swap: true }, [0, H * 0.58, 0.03]);
    }
  }

  /** A window on an outer face: recessed leaded glass, frame, sill, lintel and (sometimes) open shutters. */
  private maybeWindow(x: number, y: number, dx: number, dz: number, H: number, st: HouseStyle, h: House): void {
    if (hash2(x, y, 41) > 0.42) return;
    // never right beside a door, nor on the very first / last tile of a face
    for (const s of [-1, 1]) {
      const ax = dz !== 0 ? x + s : x, ay = dz !== 0 ? y : y + s;
      if (this.obj(ax, ay) !== Obj.Wall) return;
    }
    void h;
    const S = this.S;
    const cy = H * 0.56, ww = 0.42, wh = 0.5;
    const stoneish = st.wall !== Cell.Plaster && st.wall !== Cell.Logs && st.wall !== Cell.Elven;
    const frame: PartOpt = { cell: Cell.Beam, tint: 0.8, ao: 0 };
    S.add(new THREE.PlaneGeometry(ww, wh), { cell: Cell.Window, uv: 'own', ao: 0, grit: 0 }, [0, cy, 0.012]);
    S.box(ww + 0.12, 0.06, 0.07, frame, [0, cy + wh / 2 + 0.03, 0.03]);
    S.box(0.06, wh, 0.07, frame, [-ww / 2 - 0.03, cy, 0.03]);
    S.box(0.06, wh, 0.07, frame, [ww / 2 + 0.03, cy, 0.03]);
    S.box(0.035, wh, 0.03, frame, [0, cy, 0.02]);
    // sill and lintel (stone on masonry walls)
    S.box(ww + 0.22, 0.07, 0.14, { cell: stoneish ? st.plinth : Cell.Beam, tint: 0.85, jitter: 0.008, ao: 0 }, [0, cy - wh / 2 - 0.04, 0.06]);
    if (stoneish) S.box(ww + 0.26, 0.12, 0.06, { cell: st.plinth, tint: 0.75, jitter: 0.01, ao: 0 }, [0, cy + wh / 2 + 0.1, 0.03]);
    const sh = hash2(x, y, 43);
    if (sh < 0.55 && st.wall !== Cell.Sandstone && st.wall !== Cell.Marble) {
      const col = [0x5a6a4a, 0x4a5a6a, 0x7a4a34, 0x6a5a40][Math.floor(hash2(x, y, 44) * 4)];
      for (const s of [-1, 1]) {
        const a = -s * (0.25 + hash2(x, y, 45 + s) * 0.45);
        S.push([s * (ww / 2 + 0.06), cy, 0.05], [0, a, 0]);
        S.box(ww / 2 + 0.02, wh, 0.03, { cell: Cell.Door, uv: 'own', tint: col, ao: 0, grit: 0.04 }, [s * (ww / 4), 0, 0]);
        S.pop();
      }
    }
    // a flower box under some southern windows
    if (dz === 1 && sh > 0.75 && st.wall === Cell.Plaster) {
      S.box(ww + 0.14, 0.12, 0.14, { cell: Cell.Plank, tint: 0.7, ao: 0 }, [0, cy - wh / 2 - 0.13, 0.1]);
      for (let i = 0; i < 4; i++) S.sph(0.06, { cell: Cell.DPlant, tint: [0x4a7a34, 0xc84a4a, 0xe8d860, 0x3e6a2e][i], ao: 0 }, [-0.17 + i * 0.11, cy - wh / 2 - 0.05, 0.1], 0);
    }
    void dx;
  }

  /** Shelves against an inner wall, stocked by the kind of house (smithy, magic shop, outfitter, store, home). */
  private maybeShelf(x: number, y: number, dx: number, dz: number, h: House): void {
    const k = hash2(x, y, 71);
    if (k > 0.45) return;
    for (const s of [-1, 1]) {
      const ax = dz !== 0 ? x + s : x, ay = dz !== 0 ? y : y + s;
      if (!WALLISH.has(this.obj(ax, ay))) return;
    }
    if (this.obj(x + dx, y + dz) !== Obj.None) return;
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Plank, tint: 0.6, ao: 0.2 };
    // local frame: the face looks along +Z into the room
    S.box(0.86, 1.3, 0.03, { ...wood, cell: Cell.Beam, tint: 0.5, swap: true }, [0, 0.7, 0.02]);
    for (const sx of [-0.42, 0.42]) S.box(0.05, 1.4, 0.28, { cell: Cell.Beam, tint: 0.55 }, [sx, 0.7, 0.15]);
    const levels = [0.38, 0.8, 1.22];
    for (const ly of levels) S.box(0.84, 0.035, 0.26, wood, [0, ly, 0.15]);
    const kind = /smith/i.test(h.name) ? 0 : /magic|curios/i.test(h.name) ? 1 : /outfit/i.test(h.name) ? 2 : /store|trading|bank|depot/i.test(h.name) ? 3 : 4;
    levels.forEach((ly, li) => {
      for (let i = 0; i < 4; i++) {
        const r = hash2(x * 7 + i, y * 3 + li, 77);
        if (r < 0.2) continue;
        const ix = -0.3 + i * 0.2 + (r - 0.5) * 0.06, iy = ly + 0.02, iz = 0.15;
        switch (kind) {
          case 0: // blades leaning, ingots
            if (li === 2) S.box(0.04, 0.34, 0.02, { cell: Cell.Iron, tint: 1.3, ao: 0, r: [0.2, 0, (r - 0.5) * 0.4] }, [ix, iy + 0.17, iz]);
            else S.box(0.12, 0.05, 0.07, { cell: Cell.DMetal, tint: [0x9a6a3a, 0x8a8a92, 0x6a6a70][li % 3], ao: 0 }, [ix, iy + 0.03, iz]);
            break;
          case 1: // potions, candles, a skull
            if (r > 0.85) S.sph(0.06, { cell: Cell.Bone, ao: 0, s: [1, 0.9, 1.1] }, [ix, iy + 0.06, iz], 1);
            else { S.cyl(0.035, 0.045, 0.11, { cell: Cell.DGold, tint: [0x7a2a8a, 0x2a6a3a, 0x8a2a24, 0x2a4a8a][Math.floor(r * 4)], ao: 0 }, [ix, iy + 0.055, iz], 7); S.cyl(0.012, 0.012, 0.04, { cell: Cell.Beam, ao: 0 }, [ix, iy + 0.13, iz], 4); }
            break;
          case 2: // folded cloth and leather
            S.box(0.16, 0.07 + r * 0.05, 0.18, { cell: Cell.DCloth, tint: [0x7a3a2a, 0x3a4a6a, 0x5a6a3a, 0x8a7a5a, 0x5a3a2a][Math.floor(r * 5)], ao: 0 }, [ix, iy + 0.05, iz]);
            break;
          case 3: // jars, sacks, small boxes
            if (r > 0.6) S.cyl(0.05, 0.06, 0.13, { cell: Cell.DStone, tint: 0x9a7a5a, ao: 0 }, [ix, iy + 0.065, iz], 8);
            else S.box(0.13, 0.1, 0.14, { cell: Cell.Crate, tint: 0.9, ao: 0 }, [ix, iy + 0.05, iz]);
            break;
          default: // pots, plates and bowls
            if (r > 0.55) S.cyl(0.06, 0.05, 0.09, { cell: Cell.DStone, tint: 0x6a5a4a, ao: 0 }, [ix, iy + 0.045, iz], 8);
            else S.cyl(0.08, 0.06, 0.02, { cell: Cell.DStone, tint: 0xc8bca8, ao: 0, r: [-1.2, 0, 0] }, [ix, iy + 0.08, iz - 0.05], 9);
        }
      }
    });
    void dx;
  }

  /** Crossed log ends sticking out of a log-house corner. */
  private logEnds(x: number, y: number, H: number): void {
    const n = Math.floor(H / 0.25);
    for (let i = 0; i < n; i++) {
      const yy = 0.14 + i * 0.25;
      const along = i % 2 === 0;
      this.S.cyl(0.12, 0.12, 1.24, { cell: Cell.Bark, tint: 0.95, r: along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], jitter: 0.01 }, [x, yy, y], 7);
    }
  }

  /** A door: posts, lintel, a worn threshold and the door leaf standing ajar into the house. */
  door(x: number, y: number): void {
    const S = this.S;
    const horizontal = WALLISH.has(this.obj(x - 1, y)) || WALLISH.has(this.obj(x + 1, y));
    const h = this.w.houseAt(x, y, this.z);
    const st = h ? houseStyle(this.w, h) : null;
    const H = h?.stone ? 1.9 : 1.7;
    let inward = 0;
    if (h) {
      if (horizontal) inward = y === h.y ? 1 : y === h.y + h.h - 1 ? -1 : 0;
      else inward = x === h.x ? 1 : x === h.x + h.w - 1 ? -1 : 0;
    }
    const wood: PartOpt = { cell: Cell.Beam, tint: 0.85, jitter: 0.008 };
    S.push([x, 0, y], [0, horizontal ? 0 : Math.PI / 2, 0]);
    for (const s of [-1, 1]) S.box(0.17, H - 0.1, 0.24, wood, [s * 0.42, (H - 0.1) / 2, 0]);
    const stoneLintel = st && st.wall !== Cell.Plaster && st.wall !== Cell.Logs && st.wall !== Cell.Elven;
    S.box(1.02, 0.22, 0.28, stoneLintel ? { cell: st!.plinth, tint: 0.8, jitter: 0.012 } : { ...wood, swap: true }, [0, H - 0.08, 0]);
    // a wall panel over the lintel up to the eaves
    if (st) S.box(1.0, 0.12, 0.2, { cell: st.wall, tint: st.wallTint, ao: 0, eaveY: H }, [0, H + 0.0, 0]);
    S.box(0.82, 0.05, 0.3, { cell: Cell.Steps, tint: 0.75, jitter: 0.01, ao: 0.2 }, [0, 0.025, 0]);
    if (inward) {
      S.push([-0.34, 0, 0], [0, inward > 0 ? -1.85 : 1.85, 0]);
      S.box(0.68, H - 0.24, 0.06, { cell: Cell.Door, uv: 'own', tint: 0.95, ao: 0.3 }, [0.34, (H - 0.24) / 2 + 0.03, 0]);
      S.pop();
    }
    S.pop();
  }

  /** Fence post and rails to the east / south neighbours. */
  fence(x: number, y: number): void {
    const S = this.S;
    const t = 0.85 + hash2(x, y, 5) * 0.2;
    const wood: PartOpt = { cell: Cell.Plank, tint: new THREE.Color(0.86 * t, 0.8 * t, 0.7 * t), jitter: 0.01 };
    const lean: V3 = [(hash2(x, y, 6) - 0.5) * 0.12, hash2(x, y, 7) * 3, (hash2(x, y, 8) - 0.5) * 0.12];
    S.push([x, 0, y], lean);
    S.cyl(0.055, 0.07, 0.86, { ...wood, cell: Cell.Beam }, [0, 0.43, 0], 6);
    S.cone(0.06, 0.12, { ...wood, cell: Cell.Beam }, [0, 0.92, 0], 6);
    S.pop();
    const rail = (ax: number, ay: number) => {
      for (const hy of [0.34, 0.66]) {
        const sag = (hash2(x * 3 + ax, y + ay, hy * 10) - 0.5) * 0.05;
        S.seg([x, hy, y], [x + ax, hy + sag, y + ay], 0.035, 0.035, wood, 5);
      }
    };
    if (this.obj(x + 1, y) === Obj.Fence) rail(1, 0);
    if (this.obj(x, y + 1) === Obj.Fence) rail(0, 1);
  }

  railing(x: number, y: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Plank, tint: 0.7, jitter: 0.006 };
    S.box(0.1, 0.72, 0.1, { ...wood, cell: Cell.Beam }, [x, 0.36, y]);
    S.box(0.14, 0.05, 0.14, { ...wood, cell: Cell.Beam }, [x, 0.74, y]);
    if (this.obj(x + 1, y) === Obj.Railing) { S.box(1, 0.07, 0.08, wood, [x + 0.5, 0.64, y]); S.box(1, 0.05, 0.05, wood, [x + 0.5, 0.32, y]); }
    if (this.obj(x, y + 1) === Obj.Railing) { S.box(0.08, 0.07, 1, wood, [x, 0.64, y + 0.5]); S.box(0.05, 0.05, 1, wood, [x, 0.32, y + 0.5]); }
  }

  /** Three sharpened, bark-covered logs bound with a crossbeam. */
  palisade(x: number, y: number): void {
    const S = this.S;
    const horiz = this.obj(x - 1, y) === Obj.Palisade || this.obj(x + 1, y) === Obj.Palisade;
    for (let i = -1; i <= 1; i++) {
      const hh = 1.85 + hash2(x, y, 20 + i) * 0.4;
      const r = 0.15 + hash2(x, y, 30 + i) * 0.03;
      const px = x + (horiz ? i * 0.33 : 0), pz = y + (horiz ? 0 : i * 0.33);
      const lean: V3 = [(hash2(x, y, 40 + i) - 0.5) * 0.08, hash2(x, y, 50 + i) * 6, (hash2(x, y, 60 + i) - 0.5) * 0.08];
      S.push([px, 0, pz], lean);
      S.cyl(r * 0.92, r, hh, { cell: Cell.Bark, tint: 0.9, uv: 'own', su: 1, sv: hh, ou: hash2(x, y, i) }, [0, hh / 2, 0], 7);
      S.cone(r * 0.92, 0.42, { cell: Cell.Beam, tint: 0.95 }, [0, hh + 0.2, 0], 7);
      S.pop();
    }
    // the crossbeam and lashings on the inner (north / west) side
    const off = 0.2;
    S.box(horiz ? 1.02 : 0.12, 0.14, horiz ? 0.12 : 1.02, { cell: Cell.Beam, tint: 0.8, swap: true }, [x - (horiz ? 0 : off), 1.25, y - (horiz ? off : 0)]);
  }

  /** Stone steps up (four blocks rising north to south, like the classic stairs) or a dark stairwell down. */
  stairs(x: number, y: number, up: boolean): void {
    const S = this.S;
    const stone: PartOpt = { cell: Cell.Steps, tint: up ? 0.95 : 0.7, jitter: 0.012, ao: 0.25 };
    S.push([x, 0, y]);
    if (up) {
      for (let i = 0; i < 4; i++) {
        const hh = (i + 1) * 0.16;
        S.box(0.9, hh, 0.22, { ...stone, tint: 0.9 - i * 0.04 }, [0, hh / 2, -0.33 + i * 0.22]);
      }
      for (const s of [-1, 1]) S.box(0.1, 0.7, 0.92, { ...stone, cell: Cell.Fieldstone, tint: 0.75 }, [s * 0.5, 0.35, 0]);
    } else {
      S.box(0.9, 0.02, 0.9, { cell: Cell.Soot, tint: 0.25, ao: 0 }, [0, 0.012, 0]);
      for (let i = 0; i < 3; i++) S.box(0.85 * (1 - i * 0.12), 0.03, 0.2, { ...stone, tint: 0.6 - i * 0.15 }, [0, 0.03, -0.3 + i * 0.25]);
      // a rim of worn stones round the opening
      for (const [rx, rz, w, d] of [[0, -0.47, 1.0, 0.1], [-0.47, 0, 0.1, 1.0], [0.47, 0, 0.1, 1.0]] as const) S.box(w, 0.08, d, { ...stone, cell: Cell.Fieldstone, tint: 0.8 }, [rx, 0.04, rz]);
    }
    S.pop();
  }

  ladder(x: number, y: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Beam, tint: 1.1, ao: 0 };
    S.push([x, 0, y - 0.3], [-0.18, 0, 0]);
    for (const sx of [-0.25, 0.25]) S.cyl(0.04, 0.045, 3.2, wood, [sx, 1.6, 0], 6);
    for (let i = 0; i < 8; i++) S.cyl(0.028, 0.028, 0.52, { ...wood, r: [0, 0, Math.PI / 2], tint: 1.0 + (i % 3) * 0.06 }, [0, 0.25 + i * 0.38, 0], 5);
    S.pop();
  }
}

// ------------------------------------------------------------------ roofs

/**
 * The roof of a house as one geometry (fades as one when the player goes inside):
 * two sagging, slightly uneven slopes with a deep overhang, fascia and barge
 * boards, gables of the wall material, a ridge in the roof's own style, and a
 * sooty stone chimney on bigger houses.
 */
export function paintedRoof(world: WorldMap, h: House): { geo: THREE.BufferGeometry; eave: number } {
  const st = houseStyle(world, h);
  const S = new PaintMesher(() => 0);
  const eave = h.stone ? 1.9 : 1.7;
  const overhang = 0.45;
  const alongX = h.w >= h.h;
  const span = (alongX ? h.h : h.w) + overhang * 2;
  const length = (alongX ? h.w : h.h) + overhang * 2;
  const rise = Math.min(1.7, span * 0.34 + 0.3);
  const half = span / 2;
  const slopeLen = Math.hypot(half, rise);
  const pitch = Math.atan2(rise, half);
  const seed = h.id * 7.31;
  const thick = st.roof === Cell.Thatch ? 0.22 : 0.1;
  const roofOpt: PartOpt = { cell: st.roof, tint: st.roofTint, ao: 0, grit: 0.05, ou: hash2(h.id, 1), ov: hash2(h.id, 2), eaveY: undefined };
  const segL = Math.max(2, Math.ceil(length * 1.5)), segS = Math.max(2, Math.ceil(slopeLen * 2));
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(length, thick, slopeLen, segL, 1, segS);
    // an old roof: the ridge sags in the middle, the surface is not quite flat
    const P = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) {
      const u = P.getX(i) / length + 0.5, v = P.getZ(i) / slopeLen + 0.5;
      const sag = Math.sin(Math.PI * u) * 0.07 * (0.4 + 0.6 * (side === 1 ? 1 - v : v));
      const bump = (hash2(Math.round(u * segL), Math.round(v * segS), seed) - 0.5) * 0.04;
      P.setY(i, P.getY(i) - sag + bump);
    }
    S.add(g, { ...roofOpt, r: [side * pitch, 0, 0], uv: 'box' }, [0, rise / 2, (side * half) / 2]);
    // fascia board along the eave
    S.push([0, 0, side * half], [side * pitch, 0, 0]);
    S.box(length, 0.14, 0.06, { cell: Cell.Beam, tint: 0.7, ao: 0, swap: true }, [0, -0.06, side * 0.02]);
    S.pop();
    // barge boards up the gable ends
    for (const end of [-1, 1]) {
      S.push([end * (length / 2 - 0.02), rise / 2, (side * half) / 2], [side * pitch, 0, 0]);
      S.box(0.07, 0.16, slopeLen, { cell: Cell.Beam, tint: 0.65, ao: 0 }, [0, -0.02, 0]);
      S.pop();
    }
  }
  // gables of the wall material
  const tri: Array<[number, number]> = [[-half + overhang, 0], [half - overhang, 0], [0, rise - overhang * (rise / half)]];
  const gableCell = st.wall === Cell.Plaster ? Cell.Plaster : st.wall;
  for (const end of [-1, 1]) {
    S.push([end * (length / 2 - overhang), 0, 0], [0, end === 1 ? Math.PI / 2 : -Math.PI / 2, 0]);
    S.slab(tri, 0.08, { cell: gableCell, tint: st.wallTint, ao: 0, grit: 0.03 }, [0, 0, 0]);
    if (st.timber) {
      const top = rise - overhang * (rise / half);
      S.box(0.1, top, 0.04, { cell: Cell.Beam, tint: 0.85, ao: 0 }, [0, top / 2, 0.06]);
      S.box((half - overhang) * 1.2, 0.09, 0.04, { cell: Cell.Beam, tint: 0.85, ao: 0 }, [0, top * 0.45, 0.06]);
      S.box(0.36, 0.3, 0.03, { cell: Cell.Window, uv: 'own', ao: 0 }, [0, top * 0.22, 0.05]);
    }
    S.pop();
  }
  // the ridge
  if (st.roof === Cell.Thatch) {
    S.cyl(0.2, 0.2, length + 0.1, { cell: Cell.Thatch, tint: st.roofTint.clone().multiplyScalar(0.85), r: [0, 0, Math.PI / 2], jitter: 0.03, ao: 0 }, [0, rise + 0.04, 0], 8);
  } else if (st.roof === Cell.RoofTile) {
    S.cyl(0.11, 0.11, length + 0.06, { cell: Cell.RoofTile, tint: st.roofTint.clone().multiplyScalar(0.8), r: [0, 0, Math.PI / 2], uv: 'own', su: length * 2, sv: 0.5, ao: 0 }, [0, rise + 0.03, 0], 8);
  } else {
    for (const side of [-1, 1]) S.box(length + 0.08, 0.05, 0.22, { cell: st.roof === Cell.Slate ? Cell.Iron : Cell.Beam, tint: 0.7, r: [side * pitch, 0, 0], ao: 0 }, [0, rise + 0.02, side * 0.08]);
    if (st.roof === Cell.Shingle && (st.wall === Cell.Logs)) {
      // carved crossed gable ends (northern halls)
      for (const end of [-1, 1]) for (const s of [-1, 1]) S.box(0.07, 0.6, 0.08, { cell: Cell.Beam, tint: 0.8, r: [s * 0.6, 0, 0], ao: 0 }, [end * (length / 2 - 0.02), rise + 0.2, s * 0.13]);
    }
  }
  // a stone chimney with a sooty top on bigger houses
  if (h.w * h.h >= 24 && hash2(h.id, 9) < 0.7 && st.wall !== Cell.Leather) {
    const cx = (hash2(h.id, 10) < 0.5 ? -1 : 1) * (length * 0.25), cz = half * 0.35;
    const hh = rise * 0.65 + 0.9;
    const ch = st.wall === Cell.Brick || st.wall === Cell.Plaster ? Cell.Brick : st.plinth;
    S.box(0.46, hh, 0.46, { cell: ch, tint: 0.85, jitter: 0.012, ao: 0 }, [cx, rise - cz * (rise / half) + hh / 2 - 0.5, cz]);
    S.box(0.56, 0.1, 0.56, { cell: Cell.Steps, tint: 0.6, ao: 0 }, [cx, rise - cz * (rise / half) + hh - 0.45, cz]);
    S.box(0.34, 0.02, 0.34, { cell: Cell.Soot, tint: 0.4, ao: 0 }, [cx, rise - cz * (rise / half) + hh - 0.39, cz]);
  }
  const grp = new THREE.Group();
  const meshes = S.build(grp, new THREE.MeshBasicMaterial());
  return { geo: meshes[0].geometry, eave };
}
