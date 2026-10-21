import * as THREE from 'three';
import { Rng } from '../game/core/rng';

/**
 * Procedural 32×32 pixel-art textures, drawn once at startup with a small
 * palette per material — the hand-painted tile look of classic 2D RPGs,
 * mapped onto real 3D surfaces. Everything is original and generated in code.
 */
const SIZE = 32;
const cache = new Map<string, THREE.CanvasTexture>();

type Painter = (ctx: CanvasRenderingContext2D, rng: Rng) => void;

function make(key: string, paint: Painter, seed = 1): THREE.CanvasTexture {
  const k = `${key}:${seed}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;
  paint(ctx, new Rng(seed * 7919 + key.length * 104729));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(k, t);
  return t;
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(((x % SIZE) + SIZE) % SIZE, ((y % SIZE) + SIZE) % SIZE, w, h);
}

/** Fills with a dithered mix of palette colours, weighted toward the first. */
function noise(ctx: CanvasRenderingContext2D, rng: Rng, pal: string[], weights?: number[]): void {
  const w = weights ?? pal.map((_, i) => (i === 0 ? 3 : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = rng.next() * sum;
      let i = 0;
      while (r > w[i]) r -= w[i++];
      px(ctx, x, y, pal[i]);
    }
  }
}

function blobs(ctx: CanvasRenderingContext2D, rng: Rng, color: string, count: number, rMin: number, rMax: number): void {
  for (let i = 0; i < count; i++) {
    const cx = rng.int(0, SIZE - 1);
    const cy = rng.int(0, SIZE - 1);
    const r = rng.int(rMin, rMax);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + rng.next() * r) px(ctx, cx + x, cy + y, color);
    }
  }
}

// ------------------------------------------------------------------ ground

export const groundTex = {
  grass: (v: number) => make('grass', (ctx, rng) => {
    noise(ctx, rng, ['#4f8e2e', '#5a9c33', '#46802a', '#64a83a'], [5, 3, 2, 1]);
    blobs(ctx, rng, '#55962f', 4, 2, 4);
    for (let i = 0; i < 14; i++) {
      const x = rng.int(0, 31), y = rng.int(0, 31);
      px(ctx, x, y, '#79bd47'); px(ctx, x, y + 1, '#5fa236');
    }
    for (let i = 0; i < 6; i++) px(ctx, rng.int(0, 31), rng.int(0, 31), '#3a6e22');
  }, v),
  darkGrass: (v: number) => make('dgrass', (ctx, rng) => {
    noise(ctx, rng, ['#3f7526', '#47822b', '#356620', '#4f8a2f'], [5, 3, 2, 1]);
    for (let i = 0; i < 10; i++) {
      const x = rng.int(0, 31), y = rng.int(0, 31);
      px(ctx, x, y, '#5e9a38'); px(ctx, x, y + 1, '#4a842d');
    }
  }, v),
  path: (v: number) => make('path', (ctx, rng) => {
    noise(ctx, rng, ['#9b7a4c', '#a8865a', '#8c6c42', '#b39064'], [5, 2, 2, 1]);
    for (let i = 0; i < 7; i++) {
      const x = rng.int(0, 30), y = rng.int(0, 30);
      px(ctx, x, y, '#c9b494', 2, 1); px(ctx, x, y + 1, '#7a6040', 2, 1);
    }
  }, v),
  dirt: (v: number) => make('dirt', (ctx, rng) => {
    noise(ctx, rng, ['#6f5435', '#7a5e3c', '#634a2e', '#856843'], [5, 2, 2, 1]);
    blobs(ctx, rng, '#5c4329', 3, 1, 2);
    for (let i = 0; i < 4; i++) px(ctx, rng.int(0, 31), rng.int(0, 31), '#a39274');
  }, v),
  stone: (v: number) => make('stone', (ctx, rng) => {
    px(ctx, 0, 0, '#5d5a54', 32, 32);
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const base = ['#9a978f', '#a29f97', '#928f87', '#a8a59c'][rng.int(0, 3)];
      const x0 = sx * 16 + 1, y0 = sy * 16 + 1;
      px(ctx, x0, y0, base, 14, 14);
      px(ctx, x0, y0, '#bdbab1', 14, 1);
      px(ctx, x0, y0, '#b3b0a7', 1, 14);
      px(ctx, x0, y0 + 13, '#7d7a73', 14, 1);
      px(ctx, x0 + 13, y0, '#85827a', 1, 14);
      for (let i = 0; i < 6; i++) px(ctx, x0 + rng.int(2, 11), y0 + rng.int(2, 11), '#8c8981');
    }
  }, v),
  wood: (v: number) => make('wood', (ctx, rng) => {
    for (let row = 0; row < 4; row++) {
      const base = ['#7d5833', '#87613a', '#73502e'][rng.int(0, 2)];
      px(ctx, 0, row * 8, base, 32, 8);
      px(ctx, 0, row * 8, '#946c42', 32, 1);
      px(ctx, 0, row * 8 + 7, '#4f3820', 32, 1);
      const seam = rng.int(4, 27);
      px(ctx, seam, row * 8, '#4f3820', 1, 8);
      for (let i = 0; i < 5; i++) px(ctx, rng.int(0, 31), row * 8 + rng.int(2, 5), '#6a4a2a', rng.int(2, 5), 1);
      px(ctx, seam - 2, row * 8 + 3, '#3a2a18'); px(ctx, seam + 2, row * 8 + 3, '#3a2a18');
    }
  }, v),
  water: (v: number) => make('water', (ctx, rng) => {
    noise(ctx, rng, ['#2f6aa3', '#3474b0', '#2a5f94'], [4, 2, 1]);
    for (let i = 0; i < 9; i++) {
      const x = rng.int(0, 31), y = rng.int(0, 31);
      px(ctx, x, y, '#7fb4e0', rng.int(2, 5), 1);
      px(ctx, x + 1, y + 1, '#4f8cc6', 3, 1);
    }
  }, v),
  sand: (v: number) => make('sand', (ctx, rng) => {
    noise(ctx, rng, ['#d4bd86', '#dcc690', '#c7af78', '#e3d09c'], [5, 2, 2, 1]);
  }, v),
  crop: (v: number) => make('crop', (ctx, rng) => {
    noise(ctx, rng, ['#5c432a', '#664b2f', '#523b24'], [4, 2, 2]);
    for (let y = 2; y < 32; y += 8) px(ctx, 0, y, '#3f2d1a', 32, 2);
  }, v),
  lava: (v: number) => make('lava', (ctx, rng) => {
    noise(ctx, rng, ['#e2541c', '#f06e22', '#c83f14', '#ffa13a'], [4, 3, 2, 1]);
    blobs(ctx, rng, '#ffd25a', 4, 1, 3);
    blobs(ctx, rng, '#5a2414', 3, 1, 2);
  }, v),
  swamp: (v: number) => make('swamp', (ctx, rng) => {
    noise(ctx, rng, ['#4a5a2e', '#566a34', '#3e4c26', '#5f6e3a'], [4, 3, 2, 1]);
    blobs(ctx, rng, '#3a5a4a', 4, 2, 4);
    blobs(ctx, rng, '#6a8a3a', 3, 1, 2);
    for (let i = 0; i < 5; i++) px(ctx, rng.int(0, 31), rng.int(0, 31), '#8aa05a');
  }, v),
  cave: (v: number) => make('cave', (ctx, rng) => {
    noise(ctx, rng, ['#5e564e', '#665d54', '#544c45', '#71675d'], [5, 3, 2, 1]);
    for (let i = 0; i < 6; i++) px(ctx, rng.int(0, 30), rng.int(0, 30), '#4a433d', 2, 2);
    for (let i = 0; i < 4; i++) px(ctx, rng.int(0, 31), rng.int(0, 31), '#8a8076');
  }, v),
  jungle: (v: number) => make('jungle', (ctx, rng) => {
    noise(ctx, rng, ['#3f7a2a', '#468530', '#356822', '#529236'], [5, 3, 2, 1]);
    blobs(ctx, rng, '#5b4a2a', 2, 1, 2);
    for (let i = 0; i < 12; i++) {
      const x = rng.int(0, 31), y = rng.int(0, 31);
      px(ctx, x, y, '#6aab3e'); px(ctx, x + 1, y, '#4f8f2e');
    }
  }, v),
  marble: (v: number) => make('marble', (ctx, rng) => {
    px(ctx, 0, 0, '#cfcabe', 32, 32);
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const x0 = sx * 16, y0 = sy * 16;
      px(ctx, x0, y0, (sx + sy) % 2 ? '#e2ddd2' : '#d6d0c4', 16, 16);
      px(ctx, x0, y0, '#a8a296', 16, 1);
      px(ctx, x0, y0, '#a8a296', 1, 16);
      for (let k = 0; k < 6; k++) px(ctx, x0 + rng.int(1, 14), y0 + rng.int(1, 14), '#b9b3a6', rng.int(1, 3), 1);
    }
  }, v),
  deepWater: (v: number) => make('deep', (ctx, rng) => {
    noise(ctx, rng, ['#1f4f86', '#245a94', '#1b467a'], [4, 2, 2]);
    for (let i = 0; i < 6; i++) {
      const x = rng.int(0, 31), y = rng.int(0, 31);
      px(ctx, x, y, '#5a8ac8', rng.int(2, 4), 1);
    }
  }, v),
  ash: (v: number) => make('ash', (ctx, rng) => {
    noise(ctx, rng, ['#4b4440', '#544c47', '#433c38', '#5d544e'], [5, 2, 2, 1]);
    for (let i = 0; i < 3; i++) {
      let x = rng.int(0, 31), y = rng.int(0, 31);
      for (let k = 0; k < 8; k++) {
        px(ctx, x, y, rng.chance(0.3) ? '#a3401c' : '#2e2826');
        x += rng.int(-1, 1); y += rng.int(0, 1);
      }
    }
  }, v),
};

// ------------------------------------------------------------------ objects

/** Light, nearly neutral textures: the instance/material colour tints them. */
export const objTex = {
  plaster: () => make('plaster', (ctx, rng) => {
    noise(ctx, rng, ['#ebe6dc', '#f2eee6', '#ded8cc'], [5, 2, 2]);
    px(ctx, 0, 0, '#6b4a2c', 32, 3);
    px(ctx, 0, 29, '#6b4a2c', 32, 3);
    px(ctx, 0, 0, '#6b4a2c', 3, 32);
    px(ctx, 29, 0, '#6b4a2c', 3, 32);
    for (let i = 0; i < 32; i++) px(ctx, i, i, '#6b4a2c', 2, 1);
  }),
  brick: () => make('brick', (ctx) => {
    px(ctx, 0, 0, '#6f6b66', 32, 32);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let b = -1; b < 2; b++) {
        const x0 = b * 16 + off + 1, y0 = row * 8 + 1;
        px(ctx, x0, y0, '#a19d96', 14, 6);
        px(ctx, x0, y0, '#bab6ae', 14, 1);
        px(ctx, x0, y0 + 5, '#8a867f', 14, 1);
      }
    }
  }),
  logs: () => make('logs', (ctx) => {
    for (let row = 0; row < 4; row++) {
      px(ctx, 0, row * 8, '#8a6a46', 32, 8);
      px(ctx, 0, row * 8 + 1, '#a07c52', 32, 2);
      px(ctx, 0, row * 8 + 6, '#5e4429', 32, 2);
    }
  }),
  shingles: () => make('shingles', (ctx) => {
    px(ctx, 0, 0, '#d8d8d8', 32, 32);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      px(ctx, 0, row * 8 + 6, '#868686', 32, 2);
      for (let x = off; x < 32 + off; x += 8) {
        px(ctx, x, row * 8, '#9a9a9a', 1, 7);
        px(ctx, x + 1, row * 8, '#f0f0f0', 6, 1);
      }
    }
  }),
  leaves: () => make('leaves', (ctx, rng) => {
    noise(ctx, rng, ['#c8c8c8', '#e0e0e0', '#a8a8a8', '#f6f6f6'], [4, 2, 2, 1]);
    blobs(ctx, rng, '#909090', 6, 1, 2);
    blobs(ctx, rng, '#ffffff', 5, 1, 1);
  }),
  bark: () => make('bark', (ctx, rng) => {
    noise(ctx, rng, ['#c8c8c8', '#a8a8a8', '#e0e0e0'], [4, 3, 1]);
    for (let x = 0; x < 32; x += 4) px(ctx, x, 0, '#808080', 1, 32);
  }),
  rock: () => make('rock', (ctx, rng) => {
    noise(ctx, rng, ['#8a847c', '#958f86', '#7c766f', '#a39d93'], [4, 3, 2, 1]);
    for (let i = 0; i < 5; i++) {
      let x = rng.int(0, 31), y = rng.int(0, 31);
      for (let k = 0; k < 7; k++) { px(ctx, x, y, '#5d5852'); x += rng.int(-1, 1); y += 1; }
    }
    blobs(ctx, rng, '#b0aa9f', 3, 1, 1);
  }),
  cliff: () => make('cliff', (ctx, rng) => {
    noise(ctx, rng, ['#5b524c', '#665c55', '#504842', '#71665e'], [4, 3, 2, 1]);
    for (let y = 4; y < 32; y += 9) px(ctx, 0, y, '#3b3430', 32, 1);
    for (let i = 0; i < 6; i++) {
      let x = rng.int(0, 31), y = rng.int(0, 31);
      for (let k = 0; k < 6; k++) { px(ctx, x, y, '#3b3430'); x += rng.int(-1, 1); y += 1; }
    }
    for (let i = 0; i < 3; i++) px(ctx, rng.int(0, 31), rng.int(0, 31), '#b0532a');
  }),
  stakes: () => make('stakes', (ctx) => {
    for (let x = 0; x < 32; x += 8) {
      px(ctx, x, 0, '#7a5a38', 8, 32);
      px(ctx, x + 1, 0, '#93704a', 2, 32);
      px(ctx, x + 7, 0, '#4f3a24', 1, 32);
    }
    px(ctx, 0, 10, '#5a4029', 32, 2);
    px(ctx, 0, 22, '#5a4029', 32, 2);
  }),
};
