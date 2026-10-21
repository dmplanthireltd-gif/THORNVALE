import { hash2 } from '../core/rng';

/**
 * Large-scale geography of the world: where the land is and what kind of land
 * it is. Every shape is a union of soft ellipses whose edges are roughened by
 * value noise, so coastlines and biome borders look natural while the overall
 * layout stays hand-placed.
 */

/** [centre x, centre y, radius x, radius y] in tiles. */
export type Blob = [number, number, number, number];

export enum Biome {
  Sea = 0,
  Temperate = 1,
  Snow = 2,
  Glacier = 3,
  Mountain = 4,
  Volcanic = 5,
  Plateau = 6,
  Clearing = 7,
  Hills = 8,
  Swamp = 9,
  Jungle = 10,
  Desert = 11,
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0,1). */
export function vnoise(x: number, y: number, scale: number, salt: number): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = smooth(fx - ix), ty = smooth(fy - iy);
  const a = hash2(ix, iy, salt), b = hash2(ix + 1, iy, salt);
  const c = hash2(ix, iy + 1, salt), d = hash2(ix + 1, iy + 1, salt);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Three octaves of value noise, roughly in [0,1). */
export function fbm(x: number, y: number, salt: number, scale = 24): number {
  return (vnoise(x, y, scale, salt) * 0.55 + vnoise(x, y, scale / 2.3, salt + 1) * 0.3 + vnoise(x, y, scale / 5.5, salt + 2) * 0.15);
}

/**
 * Stamps blobs into a field: each cell keeps the highest "inside-ness"
 * (1 at a blob centre, 0 on its rim, negative outside).
 */
export function blobField(w: number, h: number, blobs: Blob[]): Float32Array {
  const f = new Float32Array(w * h).fill(-1);
  for (const [cx, cy, rx, ry] of blobs) {
    const x0 = Math.max(0, Math.floor(cx - rx * 1.6)), x1 = Math.min(w - 1, Math.ceil(cx + rx * 1.6));
    const y0 = Math.max(0, Math.floor(cy - ry * 1.6)), y1 = Math.min(h - 1, Math.ceil(cy + ry * 1.6));
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const v = 1 - Math.sqrt(dx * dx + dy * dy);
        const i = y * w + x;
        if (v > f[i]) f[i] = v;
      }
    }
  }
  return f;
}

// ------------------------------------------------------------------ land

export const LAND: Blob[] = [
  // north-west: the frozen isles
  [55, 152, 24, 22], [68, 122, 26, 26], [80, 88, 30, 28], [112, 62, 30, 26], [124, 104, 22, 42], [118, 146, 18, 20],
  [150, 42, 30, 22], [190, 40, 26, 19], [226, 33, 26, 14], [256, 42, 14, 11],
  [222, 112, 28, 40], [262, 79, 8, 9],
  [152, 172, 11, 8], [172, 165, 11, 8], [190, 157, 8, 7],
  [77, 234, 26, 20], [118, 239, 6, 6], [165, 239, 6, 5], [58, 279, 16, 8], [112, 297, 4, 4], [131, 264, 15, 12],
  // small isles between the north and the centre
  [286, 120, 11, 12], [302, 181, 21, 17], [357, 190, 20, 13], [393, 236, 10, 10],
  // the capital island
  [392, 78, 60, 58], [350, 58, 28, 34], [432, 46, 28, 28], [440, 118, 26, 28], [398, 133, 32, 20], [345, 118, 22, 26],
  // north-east: fire fortress and the wild country beyond
  [506, 72, 24, 50], [556, 40, 38, 26], [590, 88, 30, 38], [570, 150, 44, 38], [586, 200, 36, 38], [602, 236, 18, 13],
  [478, 180, 30, 44], [520, 140, 18, 20],
  // the central continent
  [176, 292, 42, 42], [235, 262, 52, 30], [300, 278, 46, 40], [345, 258, 24, 22],
  [418, 316, 46, 42], [370, 300, 20, 30], [372, 348, 20, 18], [290, 330, 42, 18], [240, 328, 30, 16],
  [296, 360, 52, 30], [258, 405, 42, 26], [338, 402, 52, 28], [400, 395, 26, 22],
  [200, 440, 46, 30], [215, 500, 54, 52], [192, 545, 40, 18], [160, 470, 18, 22],
  [455, 440, 56, 40], [492, 474, 32, 30], [440, 395, 20, 18],
  [362, 500, 48, 44], [352, 540, 30, 16], [326, 448, 36, 24],
  // the eastern isle
  [556, 302, 44, 44], [560, 346, 30, 22], [532, 282, 22, 22], [602, 398, 20, 19],
  // western and south-western isles
  [93, 463, 42, 27], [80, 520, 20, 8], [55, 554, 22, 18], [96, 568, 12, 12], [94, 541, 8, 6], [138, 562, 22, 20],
  [160, 512, 6, 5], [178, 482, 5, 5], [108, 412, 10, 8], [136, 374, 7, 6], [195, 377, 4, 4],
  [36, 628, 17, 18], [103, 633, 28, 22], [47, 670, 15, 13], [72, 681, 13, 12], [113, 676, 7, 7],
  // south-centre island and its neighbour
  [182, 688, 52, 38], [232, 690, 24, 36], [204, 625, 24, 16],
  [62, 742, 36, 37],
  // sandy islets in the far south
  [129, 776, 22, 19], [226, 774, 24, 19], [271, 783, 18, 14], [264, 741, 10, 7],
  // the southern jungle
  [392, 640, 60, 44], [340, 700, 55, 50], [420, 710, 60, 54], [392, 758, 55, 26], [458, 650, 30, 42],
  // the south-eastern desert
  [575, 545, 32, 40], [522, 575, 34, 24], [582, 602, 28, 18],
  [552, 690, 50, 70], [540, 748, 46, 26], [490, 660, 28, 62], [542, 606, 32, 14],
];

/** Sea channels carved after the land blobs (keeps continents apart where the map has straits). */
export const STRAITS: Blob[] = [
  [284, 505, 14, 36], [300, 538, 8, 14],
  [470, 245, 26, 12], [500, 250, 12, 30],
  [330, 175, 8, 30],
  [270, 600, 14, 40],
];

// ------------------------------------------------------------------ biomes, in painting order

export const BIOMES: Array<[Biome, Blob[]]> = [
  [Biome.Snow, [[140, 96, 150, 100], [92, 255, 70, 38]]],
  [Biome.Glacier, [[84, 98, 26, 30], [206, 38, 24, 9], [64, 158, 8, 6]]],
  [Biome.Mountain, [
    [128, 96, 14, 46], [116, 38, 9, 12], [222, 112, 12, 22],
    [300, 360, 46, 20], [266, 384, 16, 14], [482, 186, 24, 36],
    [302, 181, 17, 13], [36, 628, 15, 15], [62, 742, 28, 28],
    [490, 662, 20, 58], [528, 604, 20, 10], [240, 690, 16, 30],
  ]],
  [Biome.Volcanic, [[343, 60, 22, 22], [506, 72, 24, 50], [544, 28, 16, 10], [103, 633, 22, 18]]],
  [Biome.Plateau, [[296, 312, 24, 17]]],
  [Biome.Clearing, [[326, 444, 28, 18]]],
  [Biome.Hills, [[568, 128, 40, 26], [456, 426, 30, 16], [204, 625, 22, 14]]],
  [Biome.Swamp, [[590, 200, 26, 22], [604, 238, 14, 10]]],
  [Biome.Jungle, [[392, 690, 118, 112]]],
  [Biome.Swamp, [[440, 690, 26, 22], [360, 760, 26, 14]]],
  [Biome.Desert, [[566, 560, 50, 62], [552, 690, 56, 86], [129, 776, 26, 22], [226, 774, 27, 22], [271, 783, 21, 16], [264, 741, 12, 9]]],
  [Biome.Mountain, [[492, 662, 18, 56]]],
];

/** Land/sea and biome per tile. */
export function computeGeography(w: number, h: number): { land: Uint8Array; biome: Uint8Array; landField: Float32Array } {
  const landField = blobField(w, h, LAND);
  const strait = blobField(w, h, STRAITS);
  const land = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const n = fbm(x, y, 11, 22) - 0.5;
      let v = landField[i] + n * 0.62;
      if (strait[i] + (fbm(x, y, 13, 10) - 0.5) * 0.5 > 0) v = -1;
      // keep a sea margin around the world edge
      if (x < 4 || y < 4 || x >= w - 4 || y >= h - 4) v = -1;
      land[i] = v > 0 ? 1 : 0;
      landField[i] = v;
    }
  }
  const biome = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) biome[i] = land[i] ? Biome.Temperate : Biome.Sea;
  let salt = 40;
  for (const [kind, blobs] of BIOMES) {
    const f = blobField(w, h, blobs);
    salt += 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!land[i] || f[i] < -0.4) continue;
        if (f[i] + (fbm(x, y, salt, 14) - 0.5) * 0.7 > 0) biome[i] = kind;
      }
    }
  }
  return { land, biome, landField };
}
