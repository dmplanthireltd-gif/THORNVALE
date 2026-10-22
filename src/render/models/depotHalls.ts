import * as THREE from 'three';
import type { DepotHall, DepotTheme, HallProp } from '../../game/world/depotHalls';
import { Mesher } from './darkRigsCore';
import type { Mat } from './parts';
import type { MatFn } from './spawnPlaza';

/**
 * The big depot halls of the other towns (layout in game/world/depotHalls.ts): the
 * DEPOT sign over the double doors, lanterns, banners, wall sconces and pools of
 * lamplight inside, runners on the floor and each town's own details (citadel
 * buttresses, elven vines, a dwarven stone arch, norse shields, marble columns, an
 * anchor and nets by the sea, a thatch fringe in the jungle, striped awnings in
 * the desert...). Walls, lockers, counters and the board are the ordinary map objects.
 *
 * Performance: per hall ONE merged vertex-coloured mesh, one glowing mesh (flames,
 * lantern glass), one additive mesh for the light pools and the two sign faces
 * (shared textures). Nothing is allocated per frame.
 */
export interface DepotHallsView {
  group: THREE.Group;
  flameMats: Mat[];
  /** Animates flames; shows a hall's lamplight while the player (tile px, py, floor pz) is inside it. */
  update(dt: number, px: number, py: number, pz: number): void;
}

const GOLD = 0xe6c25a, IRON = 0x34343a, DKWOOD = 0x4e3420, WOOD = 0x7a5232;

interface Look {
  /** Banner cloth and its trim. */
  banner: number;
  trim: number;
  /** Floor runner and its border. */
  rug: number;
  rugEdge: number;
  /** Flame colour of sconces and lanterns. */
  flame: number;
}

const LOOKS: Record<DepotTheme, Look> = {
  citadel: { banner: 0x8a2a24, trim: GOLD, rug: 0x7a2a22, rugEdge: 0xc9a24a, flame: 0xffa035 },
  grove: { banner: 0x2f6a3a, trim: 0xd8d0a0, rug: 0x3f6a34, rugEdge: 0xc8b878, flame: 0xc8f07a },
  dwarven: { banner: 0x5a3a24, trim: 0xd88a3a, rug: 0x4a3a30, rugEdge: 0xb8742a, flame: 0xff8a2a },
  hill: { banner: 0x3f5a8a, trim: 0xe8dcc0, rug: 0x5a4a6a, rugEdge: 0xd8c08a, flame: 0xffa035 },
  barn: { banner: 0x9a3a2a, trim: 0xf0e6d0, rug: 0x8a6a3a, rugEdge: 0xe0c88a, flame: 0xffb04a },
  norse: { banner: 0x3a4a6a, trim: 0xd8d8e0, rug: 0x5a3a24, rugEdge: 0x9aa0b0, flame: 0xffa035 },
  grand: { banner: 0x2c4a8a, trim: GOLD, rug: 0x2c3e7a, rugEdge: GOLD, flame: 0xffd27a },
  frontier: { banner: 0x5a6a2a, trim: 0xd8c8a0, rug: 0x6a4a2a, rugEdge: 0xb89a5a, flame: 0xffa035 },
  harbour: { banner: 0x2a5a7a, trim: 0xf0ead8, rug: 0x2a4a6a, rugEdge: 0xe0d8c0, flame: 0xffc05a },
  saltworn: { banner: 0x3a5a5a, trim: 0xc8c0a8, rug: 0x34505a, rugEdge: 0xb0a890, flame: 0xa8e0ff },
  jungle: { banner: 0xb8742a, trim: 0x3f8a34, rug: 0x9a6a2a, rugEdge: 0x3f7a2a, flame: 0xffa035 },
  sandstone: { banner: 0x2a6a8a, trim: GOLD, rug: 0xa8402a, rugEdge: GOLD, flame: 0xffc05a },
  outpost: { banner: 0x9a5a2a, trim: 0xe8d8b0, rug: 0x8a4a2a, rugEdge: 0xd8b878, flame: 0xffa035 },
};

/** A canvas-painted sign face in the brand's browns and gold: emblem + word. */
function signTexture(word: string, emblem: 'chest' | 'coin'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2621';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#c9a24a';
  g.lineWidth = 6;
  g.strokeRect(5, 5, 246, 86);
  g.strokeStyle = '#5a4a30';
  g.lineWidth = 2;
  g.strokeRect(12, 12, 232, 72);
  // the emblem
  if (emblem === 'chest') {
    g.fillStyle = '#8a5a2a'; g.fillRect(22, 40, 50, 34);
    g.fillStyle = '#a06a32'; g.fillRect(22, 24, 50, 18);
    g.fillStyle = '#e8c26a'; g.fillRect(20, 40, 54, 5); g.fillRect(30, 24, 5, 50); g.fillRect(59, 24, 5, 50); g.fillRect(42, 44, 10, 12);
  } else {
    g.fillStyle = '#d8a832'; g.beginPath(); g.arc(47, 48, 25, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2d270'; g.beginPath(); g.arc(47, 48, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b8862a'; g.fillRect(41, 42, 12, 12);
  }
  // the word, wide-spaced Palatino capitals in gold
  g.fillStyle = '#e8c26a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = word.length > 4 ? 46 : 50;
  g.font = `bold ${size}px Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif`;
  const x0 = 84, x1 = 236, step = (x1 - x0) / word.length;
  for (let i = 0; i < word.length; i++) {
    g.fillStyle = '#0d0b09';
    g.fillText(word[i], x0 + step * (i + 0.5) + 2, 52);
    g.fillStyle = '#e8c26a';
    g.fillText(word[i], x0 + step * (i + 0.5), 50);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round glow (white centre fading out), tinted per pool by vertex colour. */
function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** All pools of one hall as one flat mesh of textured quads. */
function poolMesh(pools: number[], mat: THREE.Material): THREE.Mesh | null {
  const n = pools.length / 4;
  if (!n) return null;
  const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = pools[i * 4], z = pools[i * 4 + 1], r = pools[i * 4 + 2];
    c.setHex(pools[i * 4 + 3]).multiplyScalar(0.55);
    const y = 0.04 + i * 0.0005;
    const corners = [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, r, 0, 1]];
    corners.forEach(([dx, dz, u, v], k) => {
      pos.set([x + dx, y, z + dz], (i * 4 + k) * 3);
      uv.set([u, v], (i * 4 + k) * 2);
      col.set([c.r, c.g, c.b], (i * 4 + k) * 3);
    });
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const me = new THREE.Mesh(geo, mat);
  me.renderOrder = 2;
  return me;
}

export function buildDepotHallsView(halls: DepotHall[], M: MatFn): DepotHallsView {
  const group = new THREE.Group();
  group.name = 'depotHalls';
  const flameMats: Mat[] = [];
  if (!halls.length) return { group, flameMats, update() {} };

  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const poolMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: poolTexture(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
  const inside: Array<{ hall: DepotHall; mesh: THREE.Mesh }> = [];
  const baseMat = M(0xffffff);
  baseMat.vertexColors = true;
  const depotFace = M(0xffffff, { map: signTexture('DEPOT', 'chest') });
  const bankFace = M(0xffffff, { map: signTexture('BANK', 'coin') });
  const faceGeo = new THREE.PlaneGeometry(1, 1);

  for (const hall of halls) {
    const S = new Mesher();
    S.ao = 0.08;
    const pools: number[] = []; // x, z, radius, colour per pool of lamplight
    const look = LOOKS[hall.theme];
    const fz = hall.y + hall.h - 1 + 0.5; // the south façade's outer face

    const flame = (x: number, y: number, z: number, s = 1) => {
      S.cone(0.09 * s, 0.24 * s, look.flame, [x, y + 0.12 * s, z], { glow: true }, 5);
      S.cone(0.05 * s, 0.16 * s, 0xffe8a8, [x, y + 0.1 * s, z], { glow: true }, 4);
    };
    const pool = (x: number, z: number, r: number, c = 0xffb460) => { pools.push(x, z, r, c); };
    const sign = (p: HallProp, face: Mat, w: number, h: number, y: number) => {
      const z = fz + 0.42;
      S.push([p.x, y, z], [-0.32, 0, 0]);
      S.box(w + 0.16, h + 0.16, 0.07, 0x3a2414, [0, 0, -0.02]);
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) S.box(0.1, 0.1, 0.06, GOLD, [sx * (w / 2 + 0.02), sy * (h / 2 + 0.02), 0.02], { flat: true });
      S.pop();
      // iron brackets back to the wall
      for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) S.box(0.05, 0.05, 0.5, IRON, [p.x + sx, y + h / 2 - 0.05, fz + 0.2]);
      const me = new THREE.Mesh(faceGeo, face);
      me.scale.set(w, h, 1);
      me.position.set(p.x, y, z + 0.025);
      me.rotation.x = -0.32;
      group.add(me);
    };

    for (const p of hall.props) {
      switch (p.k) {
        case 'sign':
          sign(p, depotFace, 2.5, 0.94, 2.2);
          break;
        case 'plaque':
          sign(p, bankFace, 1.5, 0.56, 1.42);
          break;
        case 'lantern': {
          S.box(0.05, 0.05, 0.34, IRON, [p.x, 1.62, fz + 0.15]);
          S.box(0.03, 0.18, 0.03, IRON, [p.x, 1.52, fz + 0.32]);
          S.box(0.2, 0.04, 0.2, IRON, [p.x, 1.42, fz + 0.32]);
          S.box(0.2, 0.04, 0.2, IRON, [p.x, 1.14, fz + 0.32]);
          for (const [dx, dz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]] as const) S.box(0.025, 0.28, 0.025, IRON, [p.x + dx, 1.28, fz + 0.32 + dz]);
          S.box(0.15, 0.24, 0.15, 0xffd27a, [p.x, 1.28, fz + 0.32], { glow: true });
          flame(p.x, 1.2, fz + 0.32, 0.6);
          pool(p.x, fz + 0.8, 1.1);
          break;
        }
        case 'banner': {
          S.box(0.7, 0.06, 0.06, DKWOOD, [p.x, 1.8, fz + 0.06]);
          S.box(0.56, 1.1, 0.03, look.banner, [p.x, 1.22, fz + 0.06], { grit: 0.05 });
          S.poly([[-0.28, 0], [0.28, 0], [0, -0.22]], look.banner, [p.x, 0.67, fz + 0.06]);
          S.box(0.56, 0.06, 0.035, look.trim, [p.x, 1.74, fz + 0.075], { flat: true });
          S.box(0.2, 0.2, 0.04, look.trim, [p.x, 1.25, fz + 0.08], { r: [0, 0, Math.PI / 4], flat: true });
          S.box(0.1, 0.1, 0.045, look.banner, [p.x, 1.25, fz + 0.09], { r: [0, 0, Math.PI / 4], flat: true });
          break;
        }
        case 'sconce': {
          // mounted on the inner face of a wall; r turns it to face into the hall
          S.push([p.x, 0, p.y], [0, p.r ?? 0, 0]);
          S.box(0.14, 0.26, 0.05, IRON, [0, 1.25, 0.52]);
          S.box(0.05, 0.05, 0.2, IRON, [0, 1.2, 0.6]);
          S.cyl(0.08, 0.05, 0.08, IRON, [0, 1.24, 0.7], {}, 6);
          flame(0, 1.28, 0.7, 0.85);
          S.pop();
          const a = p.r ?? 0;
          pool(p.x + Math.sin(a) * 0.9, p.y + Math.cos(a) * 0.9, 0.9);
          break;
        }
        case 'glow':
          pool(p.x, p.y, 1.25, 0xffa850);
          break;
        case 'rug': {
          const x0 = Math.min(p.x, p.x2 ?? p.x), x1 = Math.max(p.x, p.x2 ?? p.x), y0 = Math.min(p.y, p.y2 ?? p.y), y1 = Math.max(p.y, p.y2 ?? p.y);
          const w = x1 - x0 + 0.8, d = y1 - y0 + 0.8;
          S.box(w, 0.012, d, look.rugEdge, [(x0 + x1) / 2, 0.03, (y0 + y1) / 2], { flat: true, grit: 0.03 });
          S.box(w - 0.16, 0.014, d - 0.16, look.rug, [(x0 + x1) / 2, 0.032, (y0 + y1) / 2], { flat: true, grit: 0.06 });
          break;
        }
        default:
          break;
      }
    }
    themeDetails(S, hall, fz, flame);

    const base = S.build('base');
    if (base) {
      const me = new THREE.Mesh(base, baseMat);
      me.castShadow = true;
      me.receiveShadow = true;
      group.add(me);
    }
    const glow = S.build('glow');
    if (glow) group.add(new THREE.Mesh(glow, glowMat));
    // lamplight lies on the floor only while you are inside (the roof is off then)
    const light = poolMesh(pools, poolMat);
    if (light) {
      light.visible = false;
      group.add(light);
      inside.push({ hall, mesh: light });
    }
  }

  let time = 0;
  return {
    group,
    flameMats,
    update(dt: number, px: number, py: number, pz: number): void {
      time += dt;
      glowMat.color.setScalar(0.86 + Math.sin(time * 8) * 0.08 + Math.sin(time * 21) * 0.05);
      poolMat.opacity = 0.5 + Math.sin(time * 5.3) * 0.04 + Math.sin(time * 13) * 0.025;
      for (const { hall: h, mesh } of inside) mesh.visible = pz === 0 && px >= h.x && py >= h.y && px < h.x + h.w && py < h.y + h.h;
    },
  };
}

/** Each town's own touch on its hall's front. */
function themeDetails(S: Mesher, hall: DepotHall, fz: number, flame: (x: number, y: number, z: number, s?: number) => void): void {
  const { x, w } = hall;
  const doorX = x + 4.5;
  const ends = [x + 0.5, x + w - 1.5];
  /** A free stretch of the front between the banners for the town's emblem. */
  const AX = x + w - 9;
  const busy = [x + 1, x + w - 2, x + w - 6, x + w - 3.5, AX];
  switch (hall.theme) {
    case 'citadel':
      // stone buttresses along the front and a crenellated parapet
      for (let bx = x; bx <= x + w - 1; bx += 4) if (Math.abs(bx - doorX) > 1.4) S.box(0.42, 1.95, 0.32, 0x8e877c, [bx, 0.97, fz + 0.12], { grit: 0.12 });
      for (let mx = x; mx <= x + w - 1; mx += 1) if (mx % 2 === 0) S.box(0.5, 0.3, 0.4, 0x9a9488, [mx, 2.0, fz - 0.2], { grit: 0.1 });
      break;
    case 'grove':
      // climbing vines and leaf clusters, two potted saplings by the doors
      for (let vx = x + 1; vx < x + w - 1; vx += 3) {
        S.box(0.06, 1.6, 0.04, 0x3a5a24, [vx + 0.2, 0.9, fz + 0.03]);
        for (let k = 0; k < 4; k++) S.sph(0.16, k % 2 ? 0x4a8a38 : 0x3f7a34, [vx + 0.2 + (k % 2 ? 0.15 : -0.12), 0.5 + k * 0.38, fz + 0.06], { s: [1, 0.8, 0.5] }, 0);
      }
      for (const px of [doorX - 1.6, doorX + 1.6]) {
        S.cyl(0.18, 0.14, 0.32, 0x8a5a3a, [px, 0.16, fz + 0.4], {}, 8);
        S.cyl(0.03, 0.04, 0.6, DKWOOD, [px, 0.6, fz + 0.4], {}, 5);
        S.sph(0.28, 0x4a8a38, [px, 0.98, fz + 0.4], {}, 1);
      }
      break;
    case 'dwarven':
      // a heavy stone arch round the doors, iron braziers, a rune lintel
      for (const sx of [-1.25, 1.25]) S.box(0.5, 2.0, 0.36, 0x5a554e, [doorX + sx, 1.0, fz + 0.14], { grit: 0.15 });
      S.box(3.0, 0.3, 0.2, 0x5a554e, [doorX, 1.72, fz + 0.08], { grit: 0.15 });
      for (let k = -2; k <= 2; k++) S.box(0.12, 0.12, 0.03, 0xffa040, [doorX + k * 0.4, 1.72, fz + 0.19], { glow: true, r: [0, 0, Math.PI / 4] });
      for (const bx of [doorX - 2.3, doorX + 2.3]) {
        S.cyl(0.05, 0.08, 0.9, IRON, [bx, 0.45, fz + 0.45], {}, 6);
        S.cyl(0.26, 0.16, 0.22, IRON, [bx, 0.98, fz + 0.45], {}, 8);
        flame(bx, 1.02, fz + 0.45, 1.3);
      }
      break;
    case 'hill':
    case 'frontier':
      // timber framing on the front; flower boxes (hill) or an antler trophy (frontier)
      for (let bx = x + 1; bx < x + w - 1; bx += 2) if (Math.abs(bx - doorX) > 1.2) S.box(0.1, 1.7, 0.04, DKWOOD, [bx, 0.9, fz + 0.025]);
      S.box(w - 0.2, 0.1, 0.04, DKWOOD, [x + (w - 1) / 2, 1.0, fz + 0.025]);
      if (hall.theme === 'hill') {
        for (const bx of [x + 2, x + w - 4, x + w - 8]) {
          S.box(0.9, 0.2, 0.22, WOOD, [bx, 1.0, fz + 0.12]);
          for (let k = 0; k < 4; k++) S.sph(0.08, [0xe85d75, 0xf2e35b, 0xf4f1ea, 0x9f7fe0][k], [bx - 0.3 + k * 0.2, 1.15, fz + 0.12], {}, 0);
        }
      } else {
        S.box(0.4, 0.3, 0.06, WOOD, [doorX, 2.65, fz + 0.1]);
        for (const sx of [-1, 1]) {
          S.seg([doorX + sx * 0.12, 2.7, fz + 0.14], [doorX + sx * 0.55, 3.05, fz + 0.18], 0.035, 0.02, 0xe8dcc0);
          S.seg([doorX + sx * 0.35, 2.85, fz + 0.16], [doorX + sx * 0.3, 3.15, fz + 0.18], 0.025, 0.015, 0xe8dcc0);
        }
      }
      break;
    case 'barn':
      // white X-bracing on the front boards and hay bales by the ends
      for (let bx = x + 1; bx < x + w - 2; bx += 3) {
        if (Math.abs(bx + 1 - doorX) < 1.6) continue;
        S.box(1.25, 0.08, 0.03, 0xf0e6d0, [bx + 1, 0.85, fz + 0.03], { r: [0, 0, 0.75] });
        S.box(1.25, 0.08, 0.03, 0xf0e6d0, [bx + 1, 0.85, fz + 0.03], { r: [0, 0, -0.75] });
      }
      for (const ex of ends) S.box(0.7, 0.42, 0.45, 0xd8b860, [ex, 0.21, fz + 0.34], { grit: 0.2 });
      break;
    case 'norse':
      // round painted shields along the front, crossed axes over the doors, carved posts
      for (let bx = x + 1; bx < x + w - 1; bx += 2) {
        if (Math.abs(bx - doorX) < 1.4 || busy.some((b) => Math.abs(b - bx) < 0.9)) continue;
        const c = [0x8a2a24, 0x2c4a6a, 0xc8a24a, 0x3a5a2a][(bx - x) % 4];
        S.push([bx, 1.1, fz + 0.1], [-0.35, 0, 0]);
        S.add(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 14).rotateX(Math.PI / 2), c);
        S.add(new THREE.TorusGeometry(0.37, 0.035, 4, 14), 0x9aa0b0, [0, 0, 0.03], { flat: true });
        S.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8).rotateX(Math.PI / 2), 0x9aa0b0, [0, 0, 0.04], { flat: true });
        S.pop();
      }
      for (const a of [-0.7, 0.7]) {
        S.push([AX, 1.2, fz + 0.12], [0, 0, a]);
        S.box(0.06, 0.95, 0.05, DKWOOD);
        S.box(0.3, 0.22, 0.04, 0x9aa0b0, [0.1, 0.38, 0]);
        S.pop();
      }
      for (const ex of [x - 0.05, x + w - 0.95]) S.box(0.3, 2.3, 0.3, 0x5a3a20, [ex, 1.15, fz + 0.05]);
      break;
    case 'grand':
      // paired marble columns either side of the doors (clear of the lanterns and the sign) and a gilded frieze
      for (const sg of [-1, 1]) {
        for (const off of [2.25, 3.25]) {
          S.cyl(0.18, 0.2, 1.75, 0xeae4d6, [doorX + sg * off, 0.88, fz + 0.3], { grit: 0.04 }, 10);
          S.box(0.44, 0.1, 0.44, 0xd8d2c4, [doorX + sg * off, 0.05, fz + 0.3]);
        }
        S.box(1.6, 0.18, 0.5, 0xd8d2c4, [doorX + sg * 2.75, 1.84, fz + 0.3]);
        S.box(1.6, 0.05, 0.03, GOLD, [doorX + sg * 2.75, 1.84, fz + 0.56], { flat: true });
      }
      S.box(w, 0.08, 0.03, GOLD, [x + (w - 1) / 2, 1.62, fz + 0.02], { flat: true });
      break;
    case 'harbour':
    case 'saltworn': {
      // an anchor on the front, a drying net, coiled rope and a buoy
      const ax = AX;
      S.box(0.08, 0.8, 0.05, IRON, [ax, 1.2, fz + 0.05]);
      S.box(0.36, 0.06, 0.05, IRON, [ax, 1.5, fz + 0.05]);
      S.add(new THREE.TorusGeometry(0.28, 0.04, 6, 12, Math.PI), IRON, [ax, 0.85, fz + 0.05], { r: [0, 0, Math.PI] });
      S.add(new THREE.TorusGeometry(0.08, 0.025, 5, 8), IRON, [ax, 1.66, fz + 0.05]);
      for (let k = 0; k < 6; k++) S.box(0.02, 0.9, 0.02, 0x8a7a5a, [x + 1.4 + k * 0.25, 1.15, fz + 0.04], { r: [0, 0, 0.2] });
      for (let k = 0; k < 4; k++) S.box(1.4, 0.02, 0.02, 0x8a7a5a, [x + 2.0, 0.8 + k * 0.25, fz + 0.04]);
      S.add(new THREE.TorusGeometry(0.2, 0.07, 6, 12).rotateX(Math.PI / 2), 0xb8a070, [ends[1], 0.08, fz + 0.4]);
      S.sph(0.18, 0xc83a2a, [ends[1] - 0.6, 1.0, fz + 0.12], {}, 1);
      S.box(0.36, 0.06, 0.06, 0xf0ead8, [ends[1] - 0.6, 1.0, fz + 0.16]);
      break;
    }
    case 'jungle':
      // a thatch fringe along the eaves, bamboo corner poles and tiki torches
      for (let tx = x - 0.3; tx <= x + w - 0.7; tx += 0.35) S.cone(0.2, 0.42, 0xc8a050, [tx, 1.75, fz + 0.32], { r: [Math.PI, 0, 0] }, 4);
      for (const ex of [x - 0.05, x + w - 0.95]) for (let k = 0; k < 3; k++) S.cyl(0.07, 0.07, 0.65, 0x9a9a4a, [ex, 0.33 + k * 0.66, fz + 0.06], {}, 6);
      for (const bx of [doorX - 2.2, doorX + 2.2]) {
        S.cyl(0.04, 0.05, 1.2, 0x9a7a3a, [bx, 0.6, fz + 0.5], {}, 5);
        S.cyl(0.1, 0.07, 0.2, 0x6a4a2a, [bx, 1.25, fz + 0.5], {}, 6);
        flame(bx, 1.32, fz + 0.5, 1.1);
      }
      break;
    case 'sandstone':
    case 'outpost': {
      // a striped awning over the doors, a gold sun disc (city) or crossed spears (outpost)
      const red = hall.theme === 'sandstone' ? 0x2a6a8a : 0xb8742a, wh = 0xf0e6d0;
      for (let i = 0; i < 7; i++) S.box(0.42, 0.04, 0.95, i % 2 ? wh : red, [doorX - 1.26 + i * 0.42, 1.68, fz + 0.4], { r: [0.35, 0, 0] });
      for (const sx of [-1.45, 1.45]) S.cyl(0.035, 0.035, 1.5, DKWOOD, [doorX + sx, 0.75, fz + 0.85], {}, 5);
      if (hall.theme === 'sandstone') {
        S.add(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 16).rotateX(Math.PI / 2), GOLD, [AX, 1.3, fz + 0.04], { flat: true });
        for (let k = 0; k < 8; k++) S.box(0.06, 0.18, 0.04, GOLD, [AX + Math.sin(k * Math.PI / 4) * 0.46, 1.3 + Math.cos(k * Math.PI / 4) * 0.46, fz + 0.04], { r: [0, 0, -k * Math.PI / 4], flat: true });
        for (const ex of ends) {
          S.cyl(0.2, 0.16, 0.36, 0xb8742a, [ex, 0.18, fz + 0.38], {}, 8);
          for (let k = 0; k < 5; k++) S.box(0.6, 0.04, 0.14, 0x4a9a3a, [ex + Math.cos(k * 1.26) * 0.22, 0.62, fz + 0.38 + Math.sin(k * 1.26) * 0.22], { r: [0, k * 1.26, 0.5] });
        }
      } else {
        for (const a of [-0.5, 0.5]) S.box(0.05, 1.7, 0.04, DKWOOD, [AX, 1.1, fz + 0.06], { r: [0, 0, a] });
        for (const a of [-0.5, 0.5]) S.cone(0.06, 0.2, 0xb8bcc4, [AX + Math.sin(-a) * 0.85, 1.1 + Math.cos(a) * 0.85, fz + 0.06], { r: [0, 0, a] }, 4);
        for (const ex of ends) S.box(0.6, 0.3, 0.4, 0xc8b07c, [ex, 0.15, fz + 0.32], { grit: 0.15 });
      }
      break;
    }
    default:
      break;
  }
}
