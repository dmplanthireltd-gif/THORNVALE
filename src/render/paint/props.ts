import * as THREE from 'three';
import { hash2 } from '../../game/core/rng';
import { Obj, type WorldMap } from '../../game/world/WorldMap';
import { Cell } from './builtAtlas';
import type { PaintMesher, PartOpt } from './paintMesh';

/**
 * Painted style: gritty, rounder versions of the map's props, as pieces for the
 * floor's PaintMesher (merged per chunk, one draw call for all of them): bulging
 * barrels with rusty hoops, nailed crates, scarred tables with stools and clutter,
 * counters, straw bales, leaning moss-eaten headstones over sunken soil, bones in
 * dried blood, iron lamps, torches, lockers, pillars, altars, wells, chests, the
 * market board and the smithy stations. Flames and lamp glass stay with the
 * animated glow batches in WorldView.
 */
const BARREL: Array<[number, number]> = [[0.0, 0.0], [0.25, 0.0], [0.29, 0.12], [0.315, 0.35], [0.29, 0.58], [0.25, 0.7], [0.0, 0.7]];

export class PaintProps {
  constructor(readonly w: WorldMap, readonly z: number, private readonly S: PaintMesher) {}

  /** Adds the prop for `o` at (x, y); false when this object is not one of ours. */
  add(o: Obj, x: number, y: number): boolean {
    const h = hash2(x, y, 3);
    const rot = hash2(x, y, 5) * Math.PI * 2;
    switch (o) {
      case Obj.Barrel: this.barrel(x, y, rot, h); return true;
      case Obj.Crate: this.crate(x, y, h); return true;
      case Obj.Table: this.table(x, y, h); return true;
      case Obj.Counter: this.counter(x, y, h); return true;
      case Obj.Hay: this.hay(x, y, h); return true;
      case Obj.Grave: this.grave(x, y, h); return true;
      case Obj.Bones: this.bones(x, y, h, rot); return true;
      case Obj.Locker: this.locker(x, y); return true;
      case Obj.Pillar: this.pillar(x, y, h); return true;
      case Obj.Well: this.well(x, y); return true;
      case Obj.Chest: this.chest(x, y); return true;
      case Obj.MarketBoard: this.board(x, y); return true;
      case Obj.Anvil: this.anvil(x, y); return true;
      case Obj.TanningRack: this.rack(x, y); return true;
      default: return false;
    }
  }

  private barrel(x: number, y: number, rot: number, h: number): void {
    const S = this.S;
    S.push([x, 0, y], [0, rot, (h - 0.5) * 0.04]);
    S.lathe(BARREL, { cell: Cell.Staves, uv: 'own', su: 2, sv: 0.7, ao: 0.35, tint: 0.85 + h * 0.25 }, [0, 0, 0], 12);
    for (const [hy, r] of [[0.1, 0.285], [0.35, 0.318], [0.6, 0.285]] as const) S.cyl(r + 0.008, r + 0.008, 0.045, { cell: Cell.Iron, ao: 0, tint: 0.9 }, [0, hy, 0], 12, 1, true);
    // the lid: a disc of boards, sometimes a tap or a dent of spilt ale down the side
    S.cyl(0.255, 0.255, 0.02, { cell: Cell.Plank, tint: 0.7, ao: 0, su: 3, sv: 3 }, [0, 0.69, 0], 12);
    if (h > 0.6) S.cyl(0.025, 0.025, 0.08, { cell: Cell.DWood, tint: 0x5a3a20, ao: 0, r: [Math.PI / 2, 0, 0] }, [0, 0.16, 0.3], 5);
    S.pop();
  }

  private crate(x: number, y: number, h: number): void {
    const S = this.S;
    const t = 0.8 + h * 0.3;
    const crate = (cx: number, cy: number, cz: number, s: number, r: number) => {
      S.push([cx, cy, cz], [0, r, 0], [s, s, s]);
      S.box(0.66, 0.56, 0.66, { cell: Cell.Crate, tint: t, ao: 0.35, ou: h, ov: h * 3 }, [0, 0.28, 0]);
      // dark corner battens and cross braces
      const bat: PartOpt = { cell: Cell.Beam, tint: 0.75, ao: 0.3 };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box(0.07, 0.58, 0.07, bat, [sx * 0.32, 0.29, sz * 0.32]);
      for (const sz of [-1, 1]) S.box(0.07, 0.07, 0.68, { ...bat, swap: true }, [0, 0.55, sz * 0]);
      S.box(0.62, 0.06, 0.04, { ...bat, swap: true, r: [0, 0, 0.65] }, [0, 0.28, 0.335]);
      S.box(0.04, 0.06, 0.62, { ...bat, r: [0.65, 0, 0] }, [0.335, 0.28, 0]);
      S.pop();
    };
    crate(x, 0, y, 1, (h - 0.5) * 0.2);
    // stacked: a smaller crate or a sack on top of some
    if (h > 0.62) crate(x + (h - 0.8) * 0.2, 0.58, y - 0.04, 0.68, h * 2);
    else if (h < 0.18) this.sack(x + 0.05, 0.56, y, h);
  }

  private sack(x: number, y0: number, y: number, h: number): void {
    const g = new THREE.IcosahedronGeometry(0.2, 1);
    g.scale(1.1, 0.75, 0.9);
    this.S.add(g, { cell: Cell.Burlap, tint: 0.9, jitter: 0.015, ao: 0.2, r: [0, h * 6, 0] }, [x, y0 + 0.14, y]);
    this.S.cyl(0.05, 0.08, 0.1, { cell: Cell.Burlap, tint: 0.8, ao: 0 }, [x + 0.12, y0 + 0.28, y], 6);
  }

  private table(x: number, y: number, h: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: h > 0.85 ? Cell.Butcher : Cell.Plank, tint: 0.85 + h * 0.2, ou: h, ov: h * 2, jitter: 0.006 };
    S.box(0.94, 0.08, 0.72, { ...wood, ao: 0 }, [x, 0.56, y]);
    S.box(0.84, 0.08, 0.62, { cell: Cell.Beam, tint: 0.6, ao: 0, swap: true }, [x, 0.48, y]);
    for (const [lx, lz] of [[0.38, 0.27], [-0.38, 0.27], [0.38, -0.27], [-0.38, -0.27]]) S.cyl(0.04, 0.05, 0.5, { cell: Cell.Beam, tint: 0.7 }, [x + lx, 0.25, y + lz], 6);
    S.box(0.7, 0.05, 0.05, { cell: Cell.Beam, tint: 0.6, swap: true }, [x, 0.14, y]);
    // clutter: a tankard, a plate with bread or bones, a candle stub, a knife
    const k = hash2(x, y, 31);
    S.cyl(0.05, 0.045, 0.12, { cell: Cell.Staves, tint: 0.8, ao: 0 }, [x + 0.22, 0.66, y - 0.12], 8);
    S.box(0.02, 0.06, 0.04, { cell: Cell.Iron, ao: 0 }, [x + 0.28, 0.66, y - 0.12]);
    S.cyl(0.12, 0.1, 0.02, { cell: Cell.DStone, tint: 0xc8bca8, ao: 0 }, [x - 0.15, 0.61, y + 0.08], 10);
    if (k < 0.5) S.sph(0.07, { cell: Cell.Straw, tint: 0xd8a860, ao: 0, s: [1.4, 0.7, 1] }, [x - 0.15, 0.64, y + 0.08], 1);
    else { S.seg([x - 0.24, 0.63, y + 0.06], [x - 0.06, 0.64, y + 0.12], 0.018, 0.012, { cell: Cell.Bone, ao: 0 }, 5); }
    if (k > 0.3) { S.cyl(0.03, 0.035, 0.08, { cell: Cell.Plain, tint: 0xe8dcc0, ao: 0 }, [x + 0.05, 0.64, y + 0.22], 6); }
    S.box(0.2, 0.01, 0.03, { cell: Cell.Iron, tint: 1.2, ao: 0, r: [0, 0.6, 0] }, [x + 0.12, 0.605, y + 0.06]);
    // stools tucked under the long sides
    for (const s of [-1, 1]) {
      if (hash2(x, y, 33 + s) < 0.35) continue;
      const sx = x + (hash2(x, y, 35 + s) - 0.5) * 0.4, sz = y + s * 0.42;
      S.cyl(0.14, 0.14, 0.05, { cell: Cell.Plank, tint: 0.8 }, [sx, 0.36, sz], 9);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + s;
        S.seg([sx + Math.cos(a) * 0.08, 0.34, sz + Math.sin(a) * 0.08], [sx + Math.cos(a) * 0.13, 0, sz + Math.sin(a) * 0.13], 0.02, 0.025, { cell: Cell.Beam, tint: 0.7 }, 5);
      }
    }
  }

  private counter(x: number, y: number, h: number): void {
    const S = this.S;
    S.box(1.02, 0.08, 0.74, { cell: Cell.Plank, tint: 0.9, ao: 0, ou: h }, [x, 0.86, y]);
    S.box(0.96, 0.8, 0.62, { cell: Cell.Plank, tint: 0.7, ou: h * 2, ao: 0.4 }, [x, 0.41, y]);
    S.box(0.98, 0.12, 0.66, { cell: Cell.Beam, tint: 0.55, swap: true, ao: 0.4 }, [x, 0.06, y]);
    for (const s of [-1, 1]) S.box(0.08, 0.8, 0.66, { cell: Cell.Beam, tint: 0.6 }, [x + s * 0.47, 0.41, y]);
    // goods on the counter
    const k = hash2(x, y, 51);
    if (k < 0.33) { for (let i = 0; i < 3; i++) S.cyl(0.05, 0.06, 0.16, { cell: Cell.DStone, tint: [0x6a8a4a, 0x8a5a3a, 0x4a5a7a][i], ao: 0 }, [x - 0.25 + i * 0.13, 0.98, y - 0.1], 8); }
    else if (k < 0.66) { S.box(0.26, 0.04, 0.2, { cell: Cell.Paper, uv: 'box', su: 2, sv: 2, ao: 0 }, [x + 0.1, 0.91, y], [1, 1, 1]); S.cyl(0.04, 0.04, 0.03, { cell: Cell.DGold, tint: 0xd8a830, ao: 0 }, [x - 0.2, 0.915, y + 0.1], 8); }
    else { S.sph(0.11, { cell: Cell.Leather, ao: 0, s: [1.2, 0.8, 1] }, [x + 0.2, 0.97, y - 0.05], 1); }
  }

  private hay(x: number, y: number, h: number): void {
    const S = this.S;
    const g = new THREE.BoxGeometry(0.86, 0.52, 0.74, 3, 2, 3);
    S.add(g, { cell: Cell.Straw, tint: 0.85 + h * 0.2, jitter: 0.035, ao: 0.35, r: [0, (h - 0.5) * 0.3, 0] }, [x, 0.26, y]);
    for (const s of [-0.22, 0.22]) S.box(0.04, 0.54, 0.76, { cell: Cell.Burlap, tint: 0.6, ao: 0.2, r: [0, (h - 0.5) * 0.3, 0] }, [x + s, 0.26, y]);
    // loose straw spilled round the foot
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + h * 5;
      S.box(0.22, 0.012, 0.03, { cell: Cell.Straw, tint: 1.1, ao: 0, r: [0, a * 2, 0] }, [x + Math.cos(a) * 0.5, 0.01, y + Math.sin(a) * 0.45]);
    }
  }

  private grave(x: number, y: number, h: number): void {
    const S = this.S;
    const lean = (h - 0.5) * 0.3, tilt = (hash2(x, y, 9) - 0.5) * 0.3;
    const kind = Math.floor(hash2(x, y, 11) * 4);
    const stone: PartOpt = { cell: Cell.Gravestone, tint: 1.05 + h * 0.3, ao: 0.3, jitter: 0.008 };
    S.push([x, -0.04, y - 0.3], [tilt, lean, (hash2(x, y, 13) - 0.5) * 0.2], [1.25, 1.3, 1.25]);
    if (kind === 0) {
      // rounded slab
      const pts: Array<[number, number]> = [[-0.24, 0]];
      for (let i = 0; i <= 8; i++) { const a = Math.PI - (i / 8) * Math.PI; pts.push([Math.cos(a) * 0.24, 0.52 + Math.sin(a) * 0.22]); }
      pts.push([0.24, 0]);
      S.slab(pts, 0.12, stone, [0, 0, 0]);
    } else if (kind === 1) {
      // a cross
      S.box(0.12, 0.78, 0.12, stone, [0, 0.39, 0]);
      S.box(0.46, 0.12, 0.12, stone, [0, 0.56, 0]);
    } else if (kind === 2) {
      // a broken slab, its top lying in the grass
      S.slab([[-0.24, 0], [0.24, 0], [0.24, 0.32], [0.08, 0.4], [-0.05, 0.3], [-0.24, 0.44]], 0.12, stone, [0, 0, 0]);
      S.box(0.36, 0.1, 0.22, { ...stone, r: [0.1, 0.7, 0.05] }, [0.36, 0.06, 0.55]);
    } else {
      // a squat old stone, sunk deep
      S.box(0.5, 0.42, 0.16, { ...stone, jitter: 0.03 }, [0, 0.2, 0], [2, 2, 1]);
    }
    S.pop();
    // the grave itself: a sunken mound of dark earth, a few stones, now and then a skull or a dead bunch of flowers
    const mound = new THREE.SphereGeometry(0.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    mound.scale(0.75, 0.22, 1.05);
    S.add(mound, { cell: Cell.Earth, tint: 1.25, jitter: 0.025, ao: 0.2, aoH: 0.1 }, [x, -0.01, y + 0.12]);
    for (let i = 0; i < 4; i++) S.sph(0.04 + hash2(x, y, 60 + i) * 0.03, { cell: Cell.DStone, tint: 0x8a857a, ao: 0 }, [x + (hash2(x, y, 70 + i) - 0.5) * 0.6, 0.03, y + 0.12 + (hash2(x, y, 80 + i) - 0.5) * 0.8], 0);
    const extra = hash2(x, y, 90);
    if (extra < 0.18) this.skull(x + 0.22, 0.05, y + 0.42, 0.9);
    else if (extra > 0.8) for (let i = 0; i < 4; i++) S.seg([x - 0.05 + i * 0.03, 0.07, y + 0.05], [x - 0.12 + i * 0.07, 0.1, y + 0.3], 0.008, 0.006, { cell: Cell.DPlant, tint: 0x5a4a30, ao: 0 }, 3);
  }

  private skull(x: number, y: number, z: number, s: number): void {
    const S = this.S;
    const bone: PartOpt = { cell: Cell.Bone, ao: 0.2, tint: 0.95 };
    S.sph(0.085 * s, { ...bone, s: [1, 0.9, 1.15] }, [x, y + 0.06 * s, z], 1);
    S.box(0.1 * s, 0.05 * s, 0.07 * s, bone, [x, y + 0.02 * s, z + 0.05 * s]);
    for (const e of [-1, 1]) S.sph(0.022 * s, { cell: Cell.Soot, tint: 0.2, ao: 0 }, [x + e * 0.032 * s, y + 0.06 * s, z + 0.085 * s], 0);
  }

  private bones(x: number, y: number, h: number, rot: number): void {
    const S = this.S;
    // dried blood soaked into the ground under them
    const stain: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 0.22 + hash2(x, y, 100 + i) * 0.16; stain.push([Math.cos(a) * r, Math.sin(a) * r]); }
    S.slab(stain, 0.01, { cell: Cell.Blood, tint: 0.75, ao: 0, r: [-Math.PI / 2, 0, 0] }, [x + (h - 0.5) * 0.2, 0.006, y]);
    const bone: PartOpt = { cell: Cell.Bone, ao: 0.15, tint: 0.9 };
    for (let i = 0; i < 3; i++) {
      const a = rot + i * 1.3, cx = x + Math.cos(i * 2.2 + h) * 0.18, cz = y + Math.sin(i * 2.2 + h) * 0.14;
      const dx = Math.cos(a) * 0.18, dz = Math.sin(a) * 0.18;
      S.seg([cx - dx, 0.03, cz - dz], [cx + dx, 0.03, cz + dz], 0.022, 0.022, bone, 5);
      for (const e of [-1, 1]) S.sph(0.035, bone, [cx + e * dx, 0.035, cz + e * dz], 0);
    }
    this.skull(x + (h - 0.5) * 0.4, 0, y - 0.15, 1);
  }

  private locker(x: number, y: number): void {
    const S = this.S;
    S.box(0.8, 1.56, 0.6, { cell: Cell.Plank, tint: 0.62, swap: true, ao: 0.35 }, [x, 0.8, y]);
    S.box(0.9, 0.08, 0.7, { cell: Cell.Beam, tint: 0.55, swap: true, ao: 0 }, [x, 1.62, y]);
    S.box(0.86, 0.1, 0.66, { cell: Cell.Beam, tint: 0.5, swap: true }, [x, 0.05, y]);
    // two doors with iron straps and a brass name plate
    for (const s of [-1, 1]) S.box(0.37, 1.36, 0.03, { cell: Cell.Door, uv: 'own', tint: 0.85, ao: 0.3 }, [x + s * 0.19, 0.84, y + 0.31]);
    S.box(0.3, 0.2, 0.04, { cell: Cell.DGold, tint: 0xe0b03c, ao: 0, grit: 0 }, [x, 1.2, y + 0.33]);
    for (const hy of [0.4, 1.38]) S.box(0.78, 0.05, 0.035, { cell: Cell.Iron, ao: 0 }, [x, hy, y + 0.325]);
  }

  private pillar(x: number, y: number, h: number): void {
    const S = this.S;
    const st: PartOpt = { cell: Cell.Marble, tint: 0.85 + h * 0.2, ao: 0.35, jitter: 0.006 };
    S.box(0.72, 0.18, 0.72, { ...st, cell: Cell.Steps }, [x, 0.09, y]);
    S.cyl(0.31, 0.34, 0.12, st, [x, 0.24, y], 14);
    S.cyl(0.26, 0.3, 1.66, { ...st, uv: 'own', su: 2, sv: 1.6 }, [x, 1.13, y], 14);
    S.cyl(0.36, 0.28, 0.16, st, [x, 2.02, y], 14);
    S.box(0.78, 0.1, 0.78, { ...st, cell: Cell.Steps }, [x, 2.14, y]);
  }

  private well(x: number, y: number): void {
    const S = this.S;
    const ring = new THREE.CylinderGeometry(0.5, 0.54, 0.62, 14, 2, true);
    S.add(ring, { cell: Cell.Fieldstone, tint: 0.9, jitter: 0.02, ao: 0.4 }, [x, 0.31, y]);
    S.add(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 14, 1, true).scale(-1, 1, 1), { cell: Cell.Fieldstone, tint: 0.5, ao: 0 }, [x, 0.31, y]);
    S.add(new THREE.TorusGeometry(0.46, 0.08, 4, 14).rotateX(Math.PI / 2), { cell: Cell.Steps, tint: 0.8, jitter: 0.012, ao: 0 }, [x, 0.62, y]);
    S.cyl(0.4, 0.4, 0.02, { cell: Cell.Soot, tint: 0x203848, ao: 0 }, [x, 0.4, y], 14);
    const wood: PartOpt = { cell: Cell.Beam, tint: 0.8 };
    for (const s of [-1, 1]) S.box(0.1, 1.35, 0.1, wood, [x + s * 0.46, 0.68, y]);
    S.cyl(0.05, 0.05, 1.0, { ...wood, r: [0, 0, Math.PI / 2] }, [x, 1.16, y], 6);
    S.cyl(0.07, 0.07, 0.3, { cell: Cell.Burlap, tint: 0.7, r: [0, 0, Math.PI / 2] }, [x, 1.16, y], 8);
    S.box(0.02, 0.5, 0.02, { cell: Cell.Burlap, tint: 0.6, ao: 0 }, [x + 0.05, 0.88, y]);
    S.cyl(0.08, 0.07, 0.14, { cell: Cell.Staves, tint: 0.8, ao: 0 }, [x + 0.05, 0.58, y], 8);
    // a small shingled roof
    for (const s of [-1, 1]) S.box(1.2, 0.05, 0.62, { cell: Cell.Shingle, tint: 0.85, r: [s * 0.62, 0, 0], ao: 0 }, [x, 1.55, y + s * 0.25]);
    S.box(1.24, 0.08, 0.08, { cell: Cell.Beam, tint: 0.6, ao: 0, swap: true }, [x, 1.72, y]);
  }

  private chest(x: number, y: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Plank, tint: 0.75, ao: 0.35 };
    S.box(0.7, 0.4, 0.5, wood, [x, 0.2, y]);
    S.add(new THREE.CylinderGeometry(0.25, 0.25, 0.7, 10, 1, false, 0, Math.PI), { ...wood, r: [0, 0, Math.PI / 2], ao: 0 }, [x, 0.4, y]);
    const iron: PartOpt = { cell: Cell.Iron, ao: 0, tint: 0.9 };
    for (const s of [-0.24, 0.24]) {
      S.box(0.07, 0.42, 0.52, iron, [x + s, 0.2, y]);
      S.add(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 10, 1, false, 0, Math.PI), { ...iron, r: [0, 0, Math.PI / 2] }, [x + s, 0.4, y]);
    }
    S.box(0.12, 0.14, 0.05, { cell: Cell.DGold, tint: 0xc89a3a, ao: 0 }, [x, 0.36, y + 0.26]);
  }

  private board(x: number, y: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Beam, tint: 0.8 };
    for (const s of [-0.36, 0.36]) S.box(0.1, 1.5, 0.1, wood, [x + s, 0.75, y]);
    S.box(0.86, 0.66, 0.08, { cell: Cell.Plank, tint: 0.75, swap: true }, [x, 1.12, y + 0.02]);
    for (const s of [-1, 1]) S.box(0.6, 0.05, 0.3, { cell: Cell.Shingle, tint: 0.8, r: [s * 0.5, 0, 0], ao: 0 }, [x, 1.55, y + s * 0.1]);
    const notes: Array<[number, number, number]> = [[-0.22, 1.2, 0.08], [0.05, 1.04, -0.06], [0.24, 1.22, 0.1], [-0.12, 0.95, -0.04], [0.2, 0.92, 0.05]];
    for (const [nx, ny, r] of notes) S.box(0.2, 0.22, 0.008, { cell: Cell.Paper, uv: 'own', ao: 0, r: [0, 0, r] }, [x + nx, ny, y + 0.07]);
    S.cyl(0.08, 0.08, 0.03, { cell: Cell.DGold, tint: 0xe8b923, ao: 0, r: [Math.PI / 2, 0, 0] }, [x, 1.36, y + 0.07], 10);
  }

  private anvil(x: number, y: number): void {
    const S = this.S;
    S.cyl(0.26, 0.3, 0.42, { cell: Cell.Bark, tint: 0.8 }, [x, 0.21, y], 9);
    S.cyl(0.26, 0.26, 0.01, { cell: Cell.DWood, tint: 0x9a7a52, ao: 0 }, [x, 0.425, y], 9);
    const iron: PartOpt = { cell: Cell.Iron, tint: 0.75, ao: 0 };
    S.box(0.22, 0.18, 0.2, iron, [x, 0.5, y]);
    S.box(0.62, 0.14, 0.26, { ...iron, tint: 0.9 }, [x, 0.66, y]);
    S.cone(0.1, 0.32, { ...iron, r: [0, 0, -Math.PI / 2] }, [x + 0.46, 0.66, y], 8);
    S.box(0.3, 0.1, 0.32, iron, [x, 0.42, y]);
    S.box(0.06, 0.04, 0.3, { cell: Cell.Beam, ao: 0, r: [0, 0.5, 0] }, [x - 0.12, 0.75, y + 0.04]);
    S.box(0.1, 0.07, 0.07, iron, [x - 0.2, 0.765, y + 0.15]);
  }

  private rack(x: number, y: number): void {
    const S = this.S;
    const wood: PartOpt = { cell: Cell.Beam, tint: 0.8 };
    for (const px of [-0.38, 0.38]) S.cyl(0.04, 0.045, 1.22, wood, [x + px, 0.61, y], 6);
    for (const py of [0.25, 1.12]) S.cyl(0.035, 0.035, 0.86, { ...wood, r: [0, 0, Math.PI / 2] }, [x, py, y], 6);
    const hide = new THREE.PlaneGeometry(0.66, 0.78, 3, 3);
    const P = hide.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 6) * 0.02 + (hash2(i, x, y) - 0.5) * 0.02);
    S.add(hide, { cell: Cell.Leather, tint: 1.1, uv: 'own', ao: 0, r: [0, 0, 0.04] }, [x, 0.68, y + 0.02]);
    // lacing to the frame
    for (let i = 0; i < 4; i++) S.seg([x - 0.33 + i * 0.22, 1.07, y + 0.02], [x - 0.33 + i * 0.22, 1.12, y], 0.006, 0.006, { cell: Cell.Burlap, ao: 0 }, 3);
  }

  /** Lamp post (iron, with a cage round the glass the glow batch draws at 1.85). */
  lamp(x: number, y: number): void {
    const S = this.S;
    const iron: PartOpt = { cell: Cell.Iron, tint: 0.7 };
    S.cyl(0.12, 0.15, 0.16, { ...iron, cell: Cell.Steps, tint: 0.7 }, [x, 0.08, y], 8);
    S.cyl(0.045, 0.065, 1.66, iron, [x, 0.9, y], 7);
    S.cyl(0.07, 0.05, 0.08, iron, [x, 1.69, y], 8);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) S.box(0.02, 0.3, 0.02, { ...iron, ao: 0 }, [x + dx * 0.12, 1.85, y + dz * 0.12]);
    S.cone(0.2, 0.14, { ...iron, ao: 0 }, [x, 2.07, y], 4);
    S.add(new THREE.TorusGeometry(0.04, 0.012, 4, 8), { ...iron, ao: 0 }, [x, 2.17, y]);
  }

  /** A torch stuck in the ground (stick wrapped in pitch-soaked rags; the flame batch draws the fire). */
  torch(x: number, y: number): void {
    const S = this.S;
    S.push([x, 0, y - 0.35], [-0.3, 0, 0]);
    S.cyl(0.03, 0.04, 0.5, { cell: Cell.Beam, tint: 0.8 }, [0, 1.2, 0], 6);
    S.cyl(0.05, 0.04, 0.12, { cell: Cell.Soot, tint: 0.6, jitter: 0.008, ao: 0 }, [0, 1.42, 0], 7);
    S.cyl(0.055, 0.045, 0.04, { cell: Cell.Iron, ao: 0 }, [0, 1.33, 0], 7);
    S.pop();
  }

  /** The stone altar body (its flames stay in the flame batch). */
  altar(x: number, y: number): void {
    const S = this.S;
    S.box(1.0, 0.78, 0.8, { cell: Cell.Marble, tint: 0.85, jitter: 0.008, ao: 0.35 }, [x, 0.39, y]);
    S.box(1.08, 0.08, 0.88, { cell: Cell.Steps, tint: 0.85, ao: 0 }, [x, 0.8, y]);
    S.box(1.1, 0.12, 0.9, { cell: Cell.Steps, tint: 0.7, ao: 0.4 }, [x, 0.06, y]);
    // a long altar cloth with a gold edge, stained with old wax
    S.box(0.5, 0.01, 0.9, { cell: Cell.Cloth, tint: 0x8a2a24, ao: 0 }, [x, 0.845, y]);
    S.box(0.5, 0.38, 0.01, { cell: Cell.Cloth, tint: 0x8a2a24, ao: 0 }, [x, 0.66, y + 0.445]);
    S.box(0.5, 0.03, 0.012, { cell: Cell.DGold, tint: 0xd8b04a, ao: 0 }, [x, 0.48, y + 0.447]);
    for (const s of [-0.25, 0.25]) S.cyl(0.06, 0.07, 0.08, { cell: Cell.Plain, tint: 0xe8dcc0, ao: 0 }, [x + s, 0.88, y], 7);
  }

  /** A ring of stones round a campfire. */
  campfireStones(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.S.sph(0.08 + hash2(x, y, i) * 0.03, { cell: Cell.Fieldstone, tint: 0.7, jitter: 0.01, ao: 0.3, s: [1.2, 0.7, 1] }, [x + Math.cos(a) * 0.36, 0.04, y + Math.sin(a) * 0.36], 0);
    }
    this.S.cyl(0.3, 0.32, 0.01, { cell: Cell.Soot, tint: 0.5, ao: 0 }, [x, 0.006, y], 10);
  }
}
