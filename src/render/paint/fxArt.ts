import * as THREE from 'three';

/**
 * Painted style (render/style.ts): full-resolution art for the spell, rune, hit and
 * missile effects (Effects.ts), the ground marks they leave, standing fields and
 * the magic wall. Same atlas layout as the classic pixel atlas (8 frames per row,
 * one row per animation, missiles in the last rows) at 128 px a frame instead of 32.
 *
 * Every frame is painted on two canvases: an emissive one (fire, sparks, light —
 * added to the scene) and a covering one (smoke, rock, ice, blood, skulls — laid
 * over it). They are combined into ONE premultiplied-alpha texture, drawn with
 * (ONE, ONE − srcAlpha) blending, so glow and smoke share a single draw call.
 * Everything is original and generated in code.
 */
export const FC = 128;
const ACOLS = 8;
const AROWS = 17;
const FRAMES = 8;

type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
const ease = (t: number) => 1 - (1 - t) * (1 - t);
const fadeOut = (t: number, from = 0.55) => (t < from ? 1 : Math.max(0, 1 - (t - from) / (1 - from)));

/** A soft round light (emissive canvas) or puff (cover canvas). */
function blob(g: Ctx, x: number, y: number, r: number, c: RGB, a: number, hard = 0): void {
  if (r <= 0.3 || a <= 0.003) return;
  const gr = g.createRadialGradient(x, y, r * hard, x, y, r);
  gr.addColorStop(0, rgba(c, a));
  gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

/** A puff of smoke with a lit top-left (cover canvas). */
function puff(g: Ctx, x: number, y: number, r: number, c: RGB, a: number): void {
  blob(g, x, y, r, c, a, 0.35);
  blob(g, x - r * 0.25, y - r * 0.3, r * 0.6, [Math.min(255, c[0] * 1.35 + 20), Math.min(255, c[1] * 1.35 + 20), Math.min(255, c[2] * 1.35 + 20)], a * 0.5, 0.2);
}

/** A glowing jagged bolt (emissive). */
function bolt(g: Ctx, pts: Array<[number, number]>, outer: RGB, core: RGB, a: number, w = 1): void {
  if (a <= 0.01) return;
  for (const [lw, c, k] of [[9 * w, outer, 0.22], [4.5 * w, outer, 0.55], [1.8 * w, core, 1]] as const) {
    g.strokeStyle = rgba(c, a * k);
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

/** A four-pointed glint (emissive). */
function glint(g: Ctx, x: number, y: number, s: number, c: RGB, a: number): void {
  blob(g, x, y, s * 0.9, c, a * 0.7);
  g.fillStyle = rgba([255, 255, 255], a);
  for (const [w, h] of [[s * 1.6, s * 0.16], [s * 0.16, s * 1.6]]) {
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
  }
}

/** A crystal / rock shard (cover): a lit polygon. */
function shard(g: Ctx, x: number, y: number, len: number, wid: number, ang: number, dark: RGB, lite: RGB, a: number): void {
  if (a <= 0.01) return;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const gr = g.createLinearGradient(0, -wid, 0, wid);
  gr.addColorStop(0, rgba(lite, a));
  gr.addColorStop(1, rgba(dark, a));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-len * 0.5, 0); g.lineTo(-len * 0.1, -wid); g.lineTo(len * 0.5, -wid * 0.2); g.lineTo(len * 0.55, 0); g.lineTo(len * 0.1, wid); g.closePath();
  g.fill();
  g.strokeStyle = rgba([255, 255, 255], a * 0.5);
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(-len * 0.4, -wid * 0.1); g.lineTo(len * 0.45, -wid * 0.15); g.stroke();
  g.restore();
}

/** A lumpy rock (cover). */
function rock(g: Ctx, x: number, y: number, r: number, rnd: () => number, base: RGB, a: number): void {
  if (a <= 0.01) return;
  g.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.45);
    if (i) g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else g.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
  }
  g.closePath();
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, rgba([base[0] * 1.5, base[1] * 1.5, base[2] * 1.5], a));
  gr.addColorStop(0.5, rgba(base, a));
  gr.addColorStop(1, rgba([base[0] * 0.45, base[1] * 0.45, base[2] * 0.45], a));
  g.fillStyle = gr;
  g.fill();
}

/** A painted skull (cover), centred at (x, y), `s` = width. */
function skull(g: Ctx, x: number, y: number, s: number, bone: RGB, a: number): void {
  if (a <= 0.01) return;
  g.save();
  g.translate(x, y);
  const gr = g.createRadialGradient(-s * 0.15, -s * 0.25, s * 0.05, 0, 0, s * 0.6);
  gr.addColorStop(0, rgba([Math.min(255, bone[0] + 30), Math.min(255, bone[1] + 30), Math.min(255, bone[2] + 30)], a));
  gr.addColorStop(1, rgba([bone[0] * 0.55, bone[1] * 0.55, bone[2] * 0.55], a));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.5, s * 0.45, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect(-s * 0.28, s * 0.12, s * 0.56, s * 0.3, s * 0.08); g.fill();
  g.fillStyle = rgba([12, 4, 16], a);
  for (const e of [-1, 1]) { g.beginPath(); g.ellipse(e * s * 0.19, -s * 0.06, s * 0.13, s * 0.15, e * 0.3, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(0, s * 0.08); g.lineTo(-s * 0.06, s * 0.2); g.lineTo(s * 0.06, s * 0.2); g.closePath(); g.fill();
  for (let i = -2; i <= 2; i++) g.fillRect(i * s * 0.1 - s * 0.02, s * 0.28, s * 0.04, s * 0.12);
  g.restore();
}

// ------------------------------------------------------------------ tile animations

type Painter = (E: Ctx, C: Ctx, t: number, f: number) => void;
const M = FC / 2;

const ANIMS: Record<string, Painter> = {
  fire: (E, C, t, f) => {
    const r = seeded(11);
    const e = ease(t), fo = fadeOut(t, 0.45);
    // smoke rolls up out of the blast late on
    if (t > 0.3) for (let i = 0; i < 7; i++) {
      const k = (t - 0.3) / 0.7;
      puff(C, M + (r() - 0.5) * 60, M - 10 - k * 36 - r() * 10, 14 + k * 22 + r() * 6, [40, 32, 28], 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.2)));
    }
    // the fireball body: licking tongues of flame (cover, so it reads on bright ground) ...
    const R = 26 + 34 * e;
    for (let i = 0; i < 20; i++) {
      const a = r() * Math.PI * 2, d = R * (0.2 + r() * 0.6);
      const x = M + Math.cos(a) * d, y = M + Math.sin(a) * d * 0.85 - e * 10 - (r() * 10) * t;
      const rr = (18 + r() * 16) * (1 - t * 0.4);
      blob(C, x, y, rr, t < 0.5 ? [240, 104, 22] : [180, 56, 16], 0.92 * fo, 0.55);
    }
    // ... and a white-hot heart with yellow licks (light)
    blob(E, M, M, R * 1.4, [255, 110, 20], 0.5 * fo);
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = R * (0.1 + r() * 0.45);
      blob(E, M + Math.cos(a) * d, M + Math.sin(a) * d * 0.85 - e * 10, (10 + r() * 10) * (1 - t * 0.5), [255, 200, 80], 0.9 * fo, 0.2);
    }
    blob(E, M, M - e * 6, (26 - t * 16) * (t < 0.15 ? 0.6 + t * 3 : 1), [255, 250, 225], Math.max(0, 1 - t * 1.2), 0.3);
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, sp = 24 + r() * 40;
      const x = M + Math.cos(a) * sp * e, y = M + Math.sin(a) * sp * e * 0.7 - t * 34 + t * t * 18;
      blob(E, x, y, 3, [255, 215, 120], (1 - t * 0.8) * (r() < 0.8 ? 1 : 0.4), 0.3);
    }
    void f;
  },
  energy: (E, C, t, f) => {
    const r = seeded(200 + f * 7);
    const fo = fadeOut(t, 0.5);
    blob(C, M, M, 30 * (0.5 + ease(t) * 0.5), [40, 10, 70], 0.35 * fo, 0.2);
    blob(E, M, M, 58 * (0.4 + ease(t) * 0.6), [140, 60, 255], 0.7 * fo);
    blob(E, M, M, 30 * (1 - t), [245, 235, 255], Math.max(0, 1 - t * 1.6), 0.3);
    const nb = [5, 7, 8, 7, 6, 5, 4, 2][f];
    for (let b = 0; b < nb; b++) {
      let a = r() * Math.PI * 2;
      let x = M + Math.cos(a) * 6, y = M + Math.sin(a) * 6;
      const pts: Array<[number, number]> = [[x, y]];
      const len = 30 + r() * (26 + t * 40);
      for (let s = 0; s < len; s += 6) {
        a += (r() - 0.5) * 1.2;
        x += Math.cos(a) * 6; y += Math.sin(a) * 6;
        pts.push([x, y]);
        if (r() < 0.15) bolt(E, [[x, y], [x + Math.cos(a + 1) * 10, y + Math.sin(a + 1) * 10]], [150, 80, 255], [235, 220, 255], fo * 0.7, 0.6);
      }
      bolt(E, pts, [150, 80, 255], [245, 238, 255], fo, 1.5);
    }
    for (let i = 0; i < 10; i++) blob(E, M + (r() - 0.5) * 100, M + (r() - 0.5) * 90, 2.2, [240, 220, 255], fo * r(), 0.4);
    void C;
  },
  ice: (E, C, t, f) => {
    const r = seeded(31);
    const e = ease(t), fo = fadeOut(t, 0.6);
    // a cold mist spreading low
    for (let i = 0; i < 6; i++) puff(C, M + (r() - 0.5) * 70 * (0.4 + e), M + 10 + (r() - 0.5) * 30, 14 + e * 18, [210, 235, 250], 0.32 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
    blob(E, M, M, 40 * (0.5 + e * 0.5), [90, 170, 255], 0.35 * fo);
    // the central spike, then the burst of shards
    if (t < 0.4) shard(C, M, M, 34 + t * 40, 9, -Math.PI / 2, [70, 130, 210], [235, 250, 255], 1 - t * 2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4, d = 6 + e * (34 + r() * 14);
      const len = (16 + r() * 14) * (1 - t * 0.4);
      shard(C, M + Math.cos(a) * d, M + Math.sin(a) * d * 0.85, len, 4 + r() * 2.5, a, [60, 120, 200], [230, 248, 255], fo);
    }
    for (let i = 0; i < 6; i++) glint(E, M + (r() - 0.5) * 90, M + (r() - 0.5) * 80, 5 + r() * 4, [160, 220, 255], fo * (0.5 + 0.5 * Math.sin(f * 1.7 + i * 2)));
  },
  earth: (E, C, t, f) => {
    const r = seeded(47);
    const e = ease(t), fo = fadeOut(t, 0.55);
    // dust ring rolling outward
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + r() * 0.3, d = 8 + e * 44;
      puff(C, M + Math.cos(a) * d, M + 12 + Math.sin(a) * d * 0.55, 10 + e * 12, [120, 100, 72], 0.5 * fo);
    }
    blob(E, M, M + 6, 30 * (1 - t), [110, 230, 80], 0.45 * (1 - t));
    // rocks thrown up and falling back
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r(), sp = 0.7 + r() * 0.5;
      const x = M + Math.cos(a) * (6 + 40 * t) * sp, y = M + 10 + Math.sin(a) * 26 * t * sp - (60 * t - 52 * t * t) * (0.8 + r() * 0.4);
      rock(C, x, y, 5 + r() * 5, seeded(i * 13 + 5), [96, 76, 52], fo);
    }
    // green spores and torn leaves
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d = 10 + 36 * e * (0.5 + r() * 0.6);
      const x = M + Math.cos(a + t) * d, y = M + Math.sin(a + t) * d * 0.7 - t * 14;
      if (i % 2) blob(E, x, y, 3.2, [150, 255, 110], fo * 0.9, 0.3);
      else { C.fillStyle = rgba([70, 150, 40], fo); C.beginPath(); C.ellipse(x, y, 4.5, 2, a + f, 0, Math.PI * 2); C.fill(); }
    }
  },
  death: (E, C, t, f) => {
    const r = seeded(61);
    const e = ease(t), fo = fadeOut(t, 0.5);
    blob(E, M, M, 52 * (0.5 + e * 0.5), [120, 30, 200], 0.4 * fo);
    // black smoke coiling in a vortex
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + t * 3 + r() * 0.5, d = (10 + r() * 30) * (0.5 + e * 0.6);
      puff(C, M + Math.cos(a) * d, M + Math.sin(a) * d * 0.8 - t * 10, 10 + r() * 10, [24, 6, 32], 0.62 * fo);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - t * 4, d = 18 + e * 26;
      blob(E, M + Math.cos(a) * d, M + Math.sin(a) * d * 0.8, 6, [200, 120, 255], 0.6 * fo, 0.2);
    }
    // a skull rises out of the dark and fades
    const sk = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.1) / 0.75)));
    skull(C, M, M - 4 - t * 10, 40, [220, 212, 232], sk * 0.92);
    for (const ex of [-1, 1]) blob(E, M + ex * 7.6, M - 6.4 - t * 10, 7, [210, 120, 255], sk);
    void f;
  },
  holy: (E, C, t, f) => {
    const r = seeded(71);
    const e = ease(t), fo = fadeOut(t, 0.5);
    blob(E, M, M, 54 * (0.4 + e * 0.6), [255, 200, 90], 0.4 * fo);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + t * 0.6, len = (k % 2 ? 34 : 54) * (0.4 + e * 0.6);
      const gr = E.createLinearGradient(M, M, M + Math.cos(a) * len, M + Math.sin(a) * len);
      gr.addColorStop(0, rgba([255, 250, 220], fo));
      gr.addColorStop(1, rgba([255, 200, 80], 0));
      E.strokeStyle = gr;
      E.lineWidth = k % 2 ? 3 : 5;
      E.beginPath(); E.moveTo(M, M); E.lineTo(M + Math.cos(a) * len, M + Math.sin(a) * len); E.stroke();
    }
    blob(E, M, M, 18 * (1 - t * 0.5), [255, 255, 240], fo, 0.3);
    for (let i = 0; i < 8; i++) glint(E, M + (r() - 0.5) * 100, M + (r() - 0.5) * 90 - t * 12, 4 + r() * 4, [255, 220, 120], fo * (0.4 + 0.6 * Math.abs(Math.sin(f + i))));
    void C;
  },
  hit: (E, C, t) => {
    const r = seeded(83);
    // a sharp white impact flash, then a spray of dark blood that falls away
    if (t < 0.4) {
      const k = 1 - t / 0.4;
      blob(E, M, M, 22 * (0.6 + t), [255, 240, 220], k * 0.9, 0.2);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI + 0.4;
        E.strokeStyle = rgba([255, 255, 255], k);
        E.lineWidth = 2.2;
        E.beginPath(); E.moveTo(M - Math.cos(a) * 26 * (0.5 + t), M - Math.sin(a) * 26 * (0.5 + t)); E.lineTo(M + Math.cos(a) * 26 * (0.5 + t), M + Math.sin(a) * 26 * (0.5 + t)); E.stroke();
      }
    }
    const fo = fadeOut(t, 0.6);
    puff(C, M, M + 4, 16 + t * 16, [110, 10, 8], 0.22 * fo);
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, sp = 20 + r() * 34;
      const x = M + Math.cos(a) * sp * ease(t), y = M + Math.sin(a) * sp * ease(t) * 0.7 + t * t * 30;
      const s = (2.2 + r() * 3) * (1 - t * 0.3);
      C.fillStyle = rgba(r() < 0.5 ? [120, 8, 6] : [80, 4, 4], fo);
      C.beginPath(); C.ellipse(x, y, s * 1.5, s, a, 0, Math.PI * 2); C.fill();
      C.fillStyle = rgba([200, 60, 50], fo * 0.5);
      C.beginPath(); C.arc(x - s * 0.3, y - s * 0.3, s * 0.35, 0, Math.PI * 2); C.fill();
    }
  },
  block: (E, C, t) => {
    const r = seeded(97);
    const fo = fadeOut(t, 0.3);
    puff(C, M, M + 6, 12 + t * 20, [120, 116, 110], 0.3 * fo);
    blob(E, M, M, 16 * (1 - t), [255, 250, 220], (1 - t * 1.6), 0.2);
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, d0 = 6 + 40 * ease(t), d1 = d0 + 8 + r() * 8;
      E.strokeStyle = rgba([255, 220, 140], fo);
      E.lineWidth = 2;
      E.beginPath(); E.moveTo(M + Math.cos(a) * d0, M + Math.sin(a) * d0 + t * t * 10); E.lineTo(M + Math.cos(a) * d1, M + Math.sin(a) * d1 + t * t * 14); E.stroke();
    }
  },
  heal: (E, C, t, f) => {
    const r = seeded(101);
    blob(E, M, M + 10, 50, [80, 200, 170], 0.3 * Math.sin(Math.PI * t));
    for (let i = 0; i < 16; i++) {
      const st = (i % 4) * 0.12;
      if (t < st) continue;
      const k = (t - st) / (1 - st);
      const x = M + (r() - 0.5) * 92, y = M + 44 - r() * 30 - k * 64;
      glint(E, x, y, 4 + r() * 4, [140, 220, 255], Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(f * 2 + i)));
    }
    void C;
  },
  mana: (E, C, t) => {
    for (const lag of [0, 0.3]) {
      const k = (t - lag) / (1 - lag);
      if (k <= 0) continue;
      const R = 6 + ease(k) * 50, a = fadeOut(k, 0.4);
      for (const [lw, c, m] of [[10, [60, 100, 255], 0.25], [4, [120, 160, 255], 0.6], [1.6, [230, 240, 255], 1]] as const) {
        E.strokeStyle = rgba(c as RGB, a * m);
        E.lineWidth = lw;
        E.beginPath(); E.ellipse(M, M, R, R * 0.92, 0, 0, Math.PI * 2); E.stroke();
      }
    }
    blob(E, M, M, 30 * (1 - t), [120, 160, 255], 0.5 * (1 - t));
    void C;
  },
  poff: (E, C, t) => {
    const r = seeded(113);
    const fo = fadeOut(t, 0.35);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5, d = 6 + 18 * ease(t);
      puff(C, M + Math.cos(a) * d, M + 4 + Math.sin(a) * d * 0.8 - t * 8, 10 + t * 12 + r() * 4, [150, 146, 140], 0.7 * fo);
    }
    void E;
  },
  buff: (E, C, t, f) => {
    const R = t > 0.7 ? 44 - (t - 0.7) * 60 : 44;
    E.strokeStyle = rgba([255, 210, 100], 0.4 * fadeOut(t, 0.6));
    E.lineWidth = 3;
    E.beginPath(); E.ellipse(M, M, R, R * 0.9, 0, 0, Math.PI * 2); E.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + t * 2.4;
      glint(E, M + Math.cos(a) * R, M + Math.sin(a) * R * 0.9, (f + i) % 2 ? 6 : 4, [255, 220, 120], fadeOut(t, 0.7));
    }
    void C;
  },
  teleport: (E, C, t, f) => {
    const r = seeded(127);
    const R = 8 + ease(t) * 46, fo = fadeOut(t, 0.6);
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 + t * 1.6;
      glint(E, M + Math.cos(a) * R, M + Math.sin(a) * R * 0.9, (f + i) % 2 ? 6 : 4, [140, 230, 255], fo);
    }
    for (let i = 0; i < 6; i++) {
      const x = M + (r() - 0.5) * 70, y0 = M + 30 - t * 60 - r() * 20;
      const gr = E.createLinearGradient(x, y0, x, y0 + 30);
      gr.addColorStop(0, rgba([200, 245, 255], fo)); gr.addColorStop(1, rgba([80, 180, 255], 0));
      E.strokeStyle = gr; E.lineWidth = 2;
      E.beginPath(); E.moveTo(x, y0); E.lineTo(x, y0 + 30); E.stroke();
    }
    void C;
  },
};

const MISSILES: Record<string, (E: Ctx, C: Ctx, f: number) => void> = {
  fireball: (E, C, f) => {
    const r = seeded(300 + f);
    blob(E, M, M, 30, [220, 70, 10], 0.6);
    for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = 6 + r() * 10; blob(E, M + Math.cos(a) * d, M + Math.sin(a) * d, 9 + r() * 6, [255, 140, 40], 0.7); }
    blob(E, M, M, 12, [255, 250, 220], 1, 0.3);
    void C;
  },
  energyball: (E, C, f) => {
    const r = seeded(310 + f);
    blob(E, M, M, 30, [130, 60, 240], 0.55);
    blob(E, M, M, 12, [245, 238, 255], 1, 0.3);
    for (let k = 0; k < 4; k++) {
      const a = (f * Math.PI) / 4 + (k * Math.PI) / 2;
      bolt(E, [[M + Math.cos(a) * 10, M + Math.sin(a) * 10], [M + Math.cos(a + 0.3) * 18 + (r() - 0.5) * 4, M + Math.sin(a + 0.3) * 18], [M + Math.cos(a + 0.5) * 26, M + Math.sin(a + 0.5) * 26]], [150, 80, 255], [240, 230, 255], 0.9, 0.6);
    }
    void C;
  },
  iceshard: (E, C, f) => {
    const a = (f * Math.PI) / 4;
    blob(E, M, M, 26, [90, 170, 255], 0.35);
    shard(C, M, M, 40, 8, a, [60, 120, 200], [235, 250, 255], 1);
    shard(C, M, M, 22, 5, a + Math.PI / 2, [60, 120, 200], [235, 250, 255], 0.9);
    glint(E, M + Math.cos(a) * 12, M + Math.sin(a) * 12, 5, [200, 240, 255], 0.9);
  },
  stone: (E, C, f) => {
    rock(C, M, M, 14, seeded(320 + (f % 2)), [120, 100, 76], 1);
    void E;
  },
  earthball: (E, C, f) => {
    blob(E, M, M, 26, [110, 230, 80], 0.35);
    rock(C, M, M, 13, seeded(330 + (f % 2)), [86, 110, 52], 1);
    for (let k = 0; k < 3; k++) { const a = (f * Math.PI) / 4 + k * 2.1; C.fillStyle = 'rgba(80,170,50,0.95)'; C.beginPath(); C.ellipse(M + Math.cos(a) * 20, M + Math.sin(a) * 20, 4.5, 2, a, 0, Math.PI * 2); C.fill(); }
  },
  skull: (E, C, f) => {
    blob(E, M, M, 34, [140, 40, 220], 0.55 + (f % 2) * 0.1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + f; puff(C, M + Math.cos(a) * 14, M + Math.sin(a) * 14, 9, [30, 8, 40], 0.5); }
    skull(C, M, M, 34, [225, 215, 235], 1);
    for (const e of [-1, 1]) blob(E, M + e * 6.5, M - 2, 6, [220, 140, 255], 0.9);
  },
  holystar: (E, C, f) => {
    const a0 = (f * Math.PI) / 8;
    blob(E, M, M, 30, [255, 200, 90], 0.45);
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      E.strokeStyle = rgba([255, 240, 190], 1); E.lineWidth = 4;
      E.beginPath(); E.moveTo(M, M); E.lineTo(M + Math.cos(a) * 26, M + Math.sin(a) * 26); E.stroke();
    }
    blob(E, M, M, 12, [255, 255, 240], 1, 0.3);
    void C;
  },
  healorb: (E, C, f) => {
    blob(E, M, M, 30, [90, 180, 255], 0.45);
    glint(E, M, M, 10, [160, 220, 255], 1);
    for (let k = 0; k < 4; k++) { const a = (f * Math.PI) / 4 + (k * Math.PI) / 2; blob(E, M + Math.cos(a) * 20, M + Math.sin(a) * 20, 4, [220, 245, 255], 0.9, 0.3); }
    void C;
  },
};

const ANIM_ORDER = ['fire', 'energy', 'ice', 'earth', 'death', 'holy', 'hit', 'block', 'heal', 'mana', 'poff', 'buff', 'teleport'];
const MISSILE_AT: Record<string, [number, number]> = {
  fireball: [13, 0], energyball: [13, 4], iceshard: [14, 0], stone: [14, 4], skull: [15, 0], holystar: [15, 4], healorb: [16, 0], earthball: [16, 4],
};

interface Frames { E: HTMLCanvasElement; C: HTMLCanvasElement; e: Ctx; c: Ctx }
function frameCanvases(w: number, h: number): Frames {
  const E = document.createElement('canvas'), C = document.createElement('canvas');
  E.width = C.width = w; E.height = C.height = h;
  return { E, C, e: E.getContext('2d', { willReadFrequently: true })!, c: C.getContext('2d', { willReadFrequently: true })! };
}

/** Writes the combined premultiplied frame into `out` (rows bottom-up so the classic UV maths holds). */
function combine(F: Frames, w: number, h: number, out: Uint8Array, ow: number, oh: number, ox: number, oy: number): void {
  const e = F.e.getImageData(0, 0, w, h).data, c = F.c.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ca = c[i + 3] / 255;
    // canvas pixels are not premultiplied: emission comes with its own alpha as strength
    const ea = e[i + 3] / 255;
    const o = ((oh - 1 - (oy + y)) * ow + ox + x) * 4;
    out[o] = Math.min(255, c[i] * ca + e[i] * ea * (1 - ca * 0.5));
    out[o + 1] = Math.min(255, c[i + 1] * ca + e[i + 1] * ea * (1 - ca * 0.5));
    out[o + 2] = Math.min(255, c[i + 2] * ca + e[i + 2] * ea * (1 - ca * 0.5));
    out[o + 3] = Math.round(ca * 255);
  }
}

function premultTexture(data: Uint8Array<ArrayBuffer>, w: number, h: number, mip = true): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}

let fxAtlas: THREE.DataTexture | null = null;
/** The painted effect atlas: 8 × 17 frames of 128 px, premultiplied alpha. */
export function paintedFxAtlas(): THREE.DataTexture {
  if (fxAtlas) return fxAtlas;
  const W = ACOLS * FC, H = AROWS * FC;
  const data = new Uint8Array(W * H * 4);
  const F = frameCanvases(FC, FC);
  const clear = () => { F.e.clearRect(0, 0, FC, FC); F.c.clearRect(0, 0, FC, FC); F.e.globalCompositeOperation = 'lighter'; };
  ANIM_ORDER.forEach((name, row) => {
    for (let f = 0; f < FRAMES; f++) {
      clear();
      ANIMS[name](F.e, F.c, f / (FRAMES - 1), f);
      combine(F, FC, FC, data, W, H, f * FC, row * FC);
    }
  });
  for (const [name, [row, col]] of Object.entries(MISSILE_AT)) {
    for (let f = 0; f < 4; f++) {
      clear();
      MISSILES[name](F.e, F.c, f);
      combine(F, FC, FC, data, W, H, (col + f) * FC, row * FC);
    }
  }
  fxAtlas = premultTexture(data, W, H);
  return fxAtlas;
}

/** Premultiplied blending (glow adds, smoke covers) for painted effect materials. */
export function premultBlend<T extends THREE.Material>(m: T): T {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.transparent = true;
  m.depthWrite = false;
  return m;
}

// ------------------------------------------------------------------ ground marks, glow, fields

function canvasTex(w: number, h: number, paint: (g: Ctx, r: () => number) => void, seed: number, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const D = 128;
/** Smooth painted versions of the effect textures (same keys as Effects' classic ones). */
export function paintedEffectTextures(): Record<string, THREE.Texture> {
  const out: Record<string, THREE.Texture> = {};
  out.glow = canvasTex(64, 64, (g) => blob(g, 32, 32, 32, [255, 255, 255], 1, 0), 1);
  out.scorch = canvasTex(D, D, (g, r) => {
    for (let i = 0; i < 14; i++) blob(g, 64 + (r() - 0.5) * 50, 64 + (r() - 0.5) * 50, 18 + r() * 22, [20, 16, 12], 0.75, 0.3);
    for (let i = 0; i < 26; i++) blob(g, 64 + (r() - 0.5) * 70, 64 + (r() - 0.5) * 70, 1.5 + r() * 2, [255, 120, 30], r() < 0.6 ? 0.9 : 0.4, 0.4);
    for (let i = 0; i < 40; i++) blob(g, 64 + (r() - 0.5) * 80, 64 + (r() - 0.5) * 80, 1 + r() * 1.5, [60, 50, 40], 0.7);
  }, 7);
  out.burn = canvasTex(D, D, (g, r) => {
    for (let i = 0; i < 10; i++) blob(g, 64 + (r() - 0.5) * 40, 64 + (r() - 0.5) * 40, 14 + r() * 18, [30, 24, 40], 0.7, 0.3);
    g.strokeStyle = 'rgba(30,20,44,0.8)'; g.lineWidth = 2;
    for (let k = 0; k < 9; k++) { let x = 64, y = 64, a = r() * Math.PI * 2; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); } g.stroke(); }
  }, 8);
  out.frost = canvasTex(D, D, (g, r) => {
    blob(g, 64, 64, 60, [200, 235, 255], 0.5, 0.2);
    g.strokeStyle = 'rgba(240,252,255,0.85)';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + r() * 0.2; let x = 64, y = 64;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += Math.cos(a) * 8; y += Math.sin(a) * 8; g.lineTo(x, y);
        if (s > 1 && s % 2 === 0) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + 0.8) * 7, y + Math.sin(a + 0.8) * 7); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.8) * 7, y + Math.sin(a - 0.8) * 7); g.moveTo(x, y); }
      }
      g.stroke();
    }
  }, 11);
  out.crack = canvasTex(D, D, (g, r) => {
    blob(g, 64, 64, 34, [40, 30, 22], 0.6, 0.2);
    for (let k = 0; k < 8; k++) {
      let x = 64, y = 64, a = (k / 8) * Math.PI * 2 + r() * 0.5;
      g.lineCap = 'round';
      for (let s = 0; s < 12; s++) {
        const nx = x + Math.cos(a) * 5, ny = y + Math.sin(a) * 5;
        g.strokeStyle = 'rgba(16,12,8,0.9)'; g.lineWidth = Math.max(0.8, 4 - s * 0.3);
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = 'rgba(190,170,140,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 1.5, y + 1.5); g.lineTo(nx + 1.5, ny + 1.5); g.stroke();
        x = nx; y = ny; a += (r() - 0.5) * 0.9;
      }
    }
    for (let i = 0; i < 10; i++) blob(g, 64 + (r() - 0.5) * 60, 64 + (r() - 0.5) * 60, 3 + r() * 3, [90, 76, 60], 0.9, 0.6);
  }, 3);
  out.deathMark = canvasTex(D, D, (g, r) => {
    for (let i = 0; i < 12; i++) blob(g, 64 + (r() - 0.5) * 40, 64 + (r() - 0.5) * 40, 20 + r() * 20, [14, 4, 20], 0.7, 0.3);
    g.strokeStyle = 'rgba(120,40,170,0.75)'; g.lineWidth = 3;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(120,40,170,0.4)'; g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  }, 5);
  out.sigil = canvasTex(D, D, (g) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 45, 64 + Math.sin(a) * 45); g.lineTo(64 + Math.cos(a + 0.12) * 54, 64 + Math.sin(a + 0.12) * 54); g.stroke(); }
    g.beginPath();
    for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2 * 2 - Math.PI / 2; const px = 64 + Math.cos(a) * 38, py = 64 + Math.sin(a) * 38; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
    blob(g, 64, 64, 14, [255, 255, 255], 1, 0.4);
  }, 9);
  out.wall = canvasTex(D, D, (g, r) => {
    const gr = g.createLinearGradient(0, 0, 0, D);
    gr.addColorStop(0, '#2a4aa0'); gr.addColorStop(0.5, '#1a2c6a'); gr.addColorStop(1, '#30509a');
    g.fillStyle = gr; g.fillRect(0, 0, D, D);
    for (let i = 0; i < 30; i++) blob(g, r() * D, r() * D, 8 + r() * 20, [90, 140, 255], 0.25, 0);
    // carved glowing runes
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const ox = gx * 42 + 10, oy = gy * 42 + 10;
      for (const [lw, c] of [[6, 'rgba(120,170,255,0.35)'], [2, 'rgba(235,245,255,0.95)']] as const) {
        g.strokeStyle = c; g.lineWidth = lw; g.lineCap = 'round';
        const rr = seeded(gx * 7 + gy * 31 + 3);
        g.beginPath();
        for (let s = 0; s < 3; s++) { g.moveTo(ox + rr() * 22, oy + rr() * 22); g.lineTo(ox + rr() * 22, oy + rr() * 22); }
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(170,200,255,0.9)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, D - 3, D - 3);
  }, 19, true);
  out.fieldFire = canvasTex(64, 64, (g, r) => {
    for (let i = 0; i < 18; i++) blob(g, 32 + (r() - 0.5) * 36, 32 + (r() - 0.5) * 36, 8 + r() * 10, [180, 40, 6], 0.7, 0.2);
    for (let i = 0; i < 24; i++) blob(g, 32 + (r() - 0.5) * 44, 32 + (r() - 0.5) * 44, 2 + r() * 4, r() < 0.5 ? [255, 200, 90] : [255, 120, 30], 0.95, 0.3);
  }, 23);
  out.fieldEnergy = canvasTex(64, 64, (g, r) => {
    blob(g, 32, 32, 30, [90, 40, 180], 0.7, 0.3);
    for (let k = 0; k < 6; k++) { let x = 32, y = 32; g.strokeStyle = 'rgba(230,210,255,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); let a = r() * Math.PI * 2; for (let s = 0; s < 6; s++) { a += (r() - 0.5); x += Math.cos(a) * 5; y += Math.sin(a) * 5; g.lineTo(x, y); } g.stroke(); }
  }, 29);
  out.fieldPoison = canvasTex(64, 64, (g, r) => {
    for (let i = 0; i < 12; i++) blob(g, 32 + (r() - 0.5) * 30, 32 + (r() - 0.5) * 30, 10 + r() * 8, [40, 110, 20], 0.85, 0.5);
    for (let i = 0; i < 10; i++) blob(g, 32 + (r() - 0.5) * 36, 32 + (r() - 0.5) * 36, 2 + r() * 2.5, [190, 255, 120], 0.9, 0.6);
  }, 31);
  return out;
}

/** Standing field frames at full resolution: flame tongues, crackling arcs (premultiplied) and bubbling slime. */
export function paintedFieldFrames(): { flame: THREE.Texture[]; arc: THREE.Texture[]; slime: THREE.Texture[] } {
  const W = 64, H = 80;
  const flame: THREE.Texture[] = [], arc: THREE.Texture[] = [], slime: THREE.Texture[] = [];
  const F = frameCanvases(W, H);
  for (let f = 0; f < 4; f++) {
    // tall flames (canvas y down: the ground is the bottom row)
    F.e.clearRect(0, 0, W, H); F.c.clearRect(0, 0, W, H); F.e.globalCompositeOperation = 'lighter';
    const r = seeded(101 + f * 17);
    for (let i = 0; i < 4; i++) puff(F.c, 10 + r() * 44, H - 52 - r() * 22, 8 + r() * 6, [34, 30, 28], 0.3);
    blob(F.e, W / 2, H - 8, 34, [200, 50, 10], 0.6, 0.1);
    for (let k = 0; k < 6; k++) {
      const cx = 6 + k * 10.5 + (r() - 0.5) * 4, hgt = 28 + r() * 40;
      for (let s = 0; s < 9; s++) {
        const u = s / 8, y = H - 6 - u * hgt, x = cx + Math.sin(u * 5 + f * 1.7 + k) * 3.5 * u;
        // flame body (covers), hot core (light)
        blob(F.c, x, y, (10 - u * 8) * (0.8 + r() * 0.3), u < 0.5 ? [240, 110, 24] : [180, 46, 10], 0.8 * (1 - u * 0.6), 0.5);
        if (u < 0.6) blob(F.e, x, y + 2, (6 - u * 6) * (0.8 + r() * 0.3), u < 0.3 ? [255, 240, 170] : [255, 170, 60], 0.85, 0.2);
      }
    }
    for (let i = 0; i < 6; i++) blob(F.e, r() * W, H - 30 - r() * 46, 1.8, [255, 210, 120], 0.9, 0.4);
    const fd = new Uint8Array(W * H * 4);
    combine(F, W, H, fd, W, H, 0, 0);
    flame.push(premultTexture(fd, W, H, false));
    // arcs
    F.e.clearRect(0, 0, W, H); F.c.clearRect(0, 0, W, H);
    const ra = seeded(301 + f * 23);
    blob(F.e, W / 2, H - 6, 30, [110, 50, 220], 0.5, 0.1);
    for (let b = 0; b < 3; b++) {
      let x = 8 + ra() * 48;
      const top = 30 + ra() * 44;
      const pts: Array<[number, number]> = [];
      for (let y = 0; y < top; y += 5) { x += (ra() - 0.5) * 10; x = Math.max(4, Math.min(W - 4, x)); pts.push([x, H - 2 - y]); }
      bolt(F.e, pts, [150, 80, 255], [245, 240, 255], 1, 0.7);
    }
    const ad = new Uint8Array(W * H * 4);
    combine(F, W, H, ad, W, H, 0, 0);
    arc.push(premultTexture(ad, W, H, false));
    // slime (ordinary alpha)
    slime.push(canvasTex(64, 64, (g) => {
      const rs = seeded(501);
      for (let i = 0; i < 9; i++) blob(g, 32 + (rs() - 0.5) * 30, 32 + (rs() - 0.5) * 30, 12 + rs() * 8, [40, 100, 18], 0.9, 0.55);
      blob(g, 30, 30, 18, [70, 150, 30], 0.6, 0.2);
      for (let i = 0; i < 7; i++) {
        const st = (i + f) % 4, bx = 14 + rs() * 36, by = 14 + rs() * 36;
        if (st === 0) blob(g, bx, by, 3, [190, 255, 120], 0.9, 0.5);
        if (st === 1) { blob(g, bx, by, 5.5, [150, 230, 90], 0.95, 0.7); blob(g, bx - 1.5, by - 1.5, 1.6, [240, 255, 220], 1, 0.3); }
        if (st === 2) { g.strokeStyle = 'rgba(200,255,140,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.stroke(); }
      }
    }, 600 + f));
  }
  return { flame, arc, slime };
}
