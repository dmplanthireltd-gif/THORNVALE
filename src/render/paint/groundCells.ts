import {
  base, blades, blotches, CELL, cracks, dots, earthy, hex, mixC, pebbles, SPAN, sstep, wrapped,
  type Paint, type RGB,
} from '../paintTextures';

/**
 * Painted style (render/style.ts), owner 2026-10-23 "grim, brutal, detailed":
 * extra hand-painted ground cells for the cave regions and the shore bands the
 * liquid shader (paintGround.ts) lays along water, swamp and lava, plus grimmer
 * versions of the swamp and the sea floor. Everything is original and drawn in
 * code on canvases at load (no image files).
 *
 * Cells (see paintTextures.ts): 16 underground flagstones, 24 crypt flagstones, 17 volcanic basalt,
 * 18 sandstone floor, 19 cave ice, 20 tomb marble, 21 wet shore pebbles,
 * 22 mud, 23 scorched rock.
 */

/** Flagstones laid in rows (running bond), worn edges, per-slab tone. `per` = slabs per tile edge. */
function slabs(p: Paint, per: number, tones: RGB[], groove: RGB, wear: number): void {
  const rows = SPAN * per, cols = SPAN * per;
  const sh = CELL / rows, sw = CELL / cols;
  const tone: RGB[] = [];
  for (let i = 0; i < rows * cols; i++) tone.push(tones[p.rng.int(0, tones.length - 1)]);
  base(p, (x, y) => {
    const r = Math.floor(y / sh);
    const off = r % 2 ? sw * 0.5 : 0;
    const xx = (x + off) % CELL;
    const c = Math.floor(xx / sw);
    const lx = xx - c * sw, ly = y - r * sh;
    // worn, slightly wobbly joints
    const wob = (p.n.fbm(x, y, 16, 2) - 0.5) * wear;
    const edge = Math.min(lx, ly, sw - 1 - lx, sh - 1 - ly) + wob;
    const n = p.n.fbm(x, y, 8, 4);
    let col = mixC(tone[r * cols + c], [0, 0, 0], (1 - n) * 0.22);
    // lit upper-left lips, dark lower-right lips
    if (edge < 1.8) col = mixC(groove, [0, 0, 0], 0.2);
    else if (edge < 4) {
      const lit = lx < 4 || ly < 4 ? 0.16 : -0.22;
      col = mixC(col, lit > 0 ? [235, 225, 205] : [0, 0, 0], Math.abs(lit));
    }
    const gr = (p.rng.next() - 0.5) * 10;
    return [col[0] + gr, col[1] + gr, col[2] + gr * 0.9];
  });
}

/** Little bones lying around: shafts with knobbed ends, a few skulls (seen from above). */
function boneLitter(p: Paint, count: number, skulls: number): void {
  const { ctx, rng } = p;
  const ivory = 'rgba(196,184,156,0.95)', dark = 'rgba(30,24,18,0.45)';
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL, l = 5 + rng.next() * 9, a = rng.next() * Math.PI;
    wrapped(p, x, y, l + 4, (xx, yy) => {
      ctx.save();
      ctx.translate(xx, yy);
      ctx.rotate(a);
      ctx.fillStyle = dark;
      ctx.fillRect(-l / 2 + 1, -0.6, l, 2.6);
      ctx.fillStyle = ivory;
      ctx.fillRect(-l / 2, -1, l, 2);
      for (const e of [-l / 2, l / 2]) {
        ctx.beginPath(); ctx.arc(e, -1.2, 1.6, 0, Math.PI * 2); ctx.arc(e, 1.2, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }
  for (let i = 0; i < skulls; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL, r = 4 + rng.next() * 1.5;
    wrapped(p, x, y, r * 2, (xx, yy) => {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(xx + 1.5, yy + 2, r * 1.05, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(xx - r * 0.3, yy - r * 0.4, 0.5, xx, yy, r * 1.2);
      g.addColorStop(0, 'rgb(222,212,188)');
      g.addColorStop(1, 'rgb(150,138,112)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(xx, yy, r, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(24,18,14,0.9)';
      ctx.beginPath(); ctx.ellipse(xx - r * 0.38, yy + r * 0.2, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(xx + r * 0.38, yy + r * 0.2, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    });
  }
}

/** Old, dried stains: irregular dark splotches built from overlapping blots. */
function stains(p: Paint, count: number, col: RGB, size: number, alpha: number): void {
  const { rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL;
    const sub = 4 + rng.int(0, 5);
    for (let k = 0; k < sub; k++) {
      const r = size * (0.3 + rng.next() * 0.6);
      const ox = (rng.next() - 0.5) * size * 1.4, oy = (rng.next() - 0.5) * size * 1.4;
      wrapped(p, x + ox, y + oy, r, (xx, yy) => {
        const g = p.ctx.createRadialGradient(xx, yy, 0, xx, yy, r);
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${alpha})`);
        g.addColorStop(0.7, `rgba(${col[0]},${col[1]},${col[2]},${alpha * 0.7})`);
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        p.ctx.fillStyle = g;
        p.ctx.beginPath(); p.ctx.arc(xx, yy, r, 0, Math.PI * 2); p.ctx.fill();
      });
    }
    // a few drips flung away from the stain
    dotsAround(p, x, y, size * 2, col, alpha);
  }
}
function dotsAround(p: Paint, x: number, y: number, spread: number, col: RGB, alpha: number): void {
  for (let k = 0; k < 6; k++) {
    const a = p.rng.next() * Math.PI * 2, d = spread * (0.5 + p.rng.next() * 0.7), r = 0.6 + p.rng.next() * 1.4;
    wrapped(p, x + Math.cos(a) * d, y + Math.sin(a) * d, r, (xx, yy) => {
      p.ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${alpha})`;
      p.ctx.beginPath(); p.ctx.arc(xx, yy, r, 0, Math.PI * 2); p.ctx.fill();
    });
  }
}

/** Glossy wet puddles: a dark pool with a pale rim of reflected sky on its far edge. */
function puddles(p: Paint, count: number, col: RGB, rMin: number, rMax: number): void {
  const { ctx, rng } = p;
  for (let i = 0; i < count; i++) {
    const x = rng.next() * CELL, y = rng.next() * CELL, r = rMin + rng.next() * (rMax - rMin), sq = 0.5 + rng.next() * 0.4;
    wrapped(p, x, y, r * 1.3, (xx, yy) => {
      ctx.fillStyle = 'rgba(14,12,8,0.35)';
      ctx.beginPath(); ctx.ellipse(xx, yy + 1, r * 1.12, r * sq * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(xx, yy - r * sq, xx, yy + r * sq);
      g.addColorStop(0, `rgba(${col[0] + 40},${col[1] + 46},${col[2] + 44},0.9)`);
      g.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},0.95)`);
      g.addColorStop(1, `rgba(${col[0] * 0.7},${col[1] * 0.7},${col[2] * 0.7},0.95)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(xx, yy, r, r * sq, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(220,230,220,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(xx, yy, r * 0.8, r * sq * 0.7, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    });
  }
}

/** Painters for the extra cells, by cell index (called by paintedAtlas). */
export const EXTRA_PAINTERS: Record<number, (p: Paint) => void> = {
  // 9 swamp: dark olive mud, sodden tussocks, black puddles, dead reeds
  9: (p) => {
    earthy(p, 0x3c4426, 0x48502c, 0x2c321c, 14);
    blotches(p, 12, hex(0x1c2014), 10, 26, 0.45);
    blotches(p, 8, hex(0x5a5a2c), 8, 20, 0.2);
    puddles(p, 9, hex(0x1e2a24), 5, 13);
    blades(p, 900, hex(0x7a7a3e), hex(0x262c16), 8);
    blades(p, 160, hex(0xa09a5a), hex(0x4a4422), 10);
    dots(p, 40, [hex(0x2a3a1a), hex(0x5a6a2a)], 1.5, 3.2, 0.6);
  },
  // 13 sea bed: cold grey-green silt with ripples, broken shells, the odd bone
  13: (p) => {
    earthy(p, 0x6e705c, 0x7c7e68, 0x5a5c4a, 9);
    const { ctx, rng } = p;
    for (let i = 0; i < 34; i++) {
      const y = rng.next() * CELL, x = rng.next() * CELL, l = 24 + rng.next() * 44;
      wrapped(p, x, y, l, (xx, yy) => {
        ctx.strokeStyle = 'rgba(40,44,34,0.32)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + l * 0.3, yy - 4, xx + l * 0.6, yy + 4, xx + l, yy); ctx.stroke();
        ctx.strokeStyle = 'rgba(190,196,170,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx, yy - 2); ctx.bezierCurveTo(xx + l * 0.3, yy - 6, xx + l * 0.6, yy + 2, xx + l, yy - 2); ctx.stroke();
      });
    }
    blotches(p, 8, hex(0x2c3a2a), 8, 18, 0.35);
    pebbles(p, 22, [hex(0xc8c4b0), hex(0x8a8a74), hex(0x5a5c4c)], 1, 2.6);
    boneLitter(p, 2, 0);
    dots(p, 260, [hex(0x484a3a), hex(0xa0a28a)], 0.4, 1.0, 0.6);
  },
  // 16 underground flagstones: cold, cracked, grimy joints
  16: (p) => {
    slabs(p, 2, [0x77726a, 0x6c6860, 0x807a70, 0x66625a, 0x726b62].map(hex), hex(0x1c1a15), 3.5);
    cracks(p, 12, hex(0x141210), 7, 0.6);
    blotches(p, 10, hex(0x1a1d14), 8, 22, 0.35);
    blotches(p, 6, hex(0x8a8274), 10, 22, 0.08);
    dots(p, 240, [hex(0x2a2622), hex(0x77706a)], 0.4, 1.1, 0.6);
  },
  // 24 crypt flagstones: the same slabs, darker, with old blood and bone litter
  24: (p) => {
    slabs(p, 2, [0x6a6660, 0x605c56, 0x726c64, 0x5a5650, 0x67605a].map(hex), hex(0x14120e), 4);
    cracks(p, 16, hex(0x100e0c), 7, 0.65);
    blotches(p, 12, hex(0x161a10), 8, 24, 0.4);
    stains(p, 3, hex(0x3a120c), 9, 0.55);
    boneLitter(p, 8, 1);
    dots(p, 240, [hex(0x24201c), hex(0x6a645e)], 0.4, 1.1, 0.6);
  },
  // 17 volcanic basalt: charcoal rock, a crack network with dull heat in it, ash dust
  17: (p) => {
    earthy(p, 0x2a2624, 0x34302c, 0x1c1918, 12);
    cracks(p, 16, hex(0x5a2010), 9, 0.7);
    cracks(p, 12, hex(0x0e0c0b), 7, 0.75);
    blotches(p, 10, hex(0x6a6460), 8, 22, 0.12);
    pebbles(p, 40, [hex(0x2e2a28), hex(0x403a36), hex(0x1e1c1a)], 1.2, 3.6);
    dots(p, 50, [hex(0x9a3a12), hex(0x5a2410)], 0.5, 1.2, 0.8);
  },
  // 18 sandstone floor: broken sandstone plates with drifted sand in the gaps
  18: (p) => {
    const { rng } = p;
    const pts: Array<[number, number, RGB]> = [];
    const tones = [0x8a6c46, 0x957650, 0x7c603e, 0x9c7e56].map(hex);
    const G = 5;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.2 + rng.next() * 0.6) * (CELL / G), (j + 0.2 + rng.next() * 0.6) * (CELL / G), tones[rng.int(0, 3)]]);
    const sand = hex(0xa88a5e);
    base(p, (x, y) => {
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let k = 0; k < pts.length; k++) {
        let dx = x - pts[k][0], dy = y - pts[k][1];
        dx -= Math.round(dx / CELL) * CELL; dy -= Math.round(dy / CELL) * CELL;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
      }
      const e = Math.sqrt(d2) - Math.sqrt(d1) + (p.n.fbm(x, y, 16, 2) - 0.5) * 5;
      const n = p.n.fbm(x, y, 8, 4);
      if (e < 3.5) return mixC(sand, [60, 44, 26], (1 - sstep(0, 3.5, e)) * 0.5 + n * 0.15);
      const c = mixC(pts[best][2], [0, 0, 0], (1 - n) * 0.25);
      const g = (p.rng.next() - 0.5) * 9;
      return [c[0] + g, c[1] + g, c[2] + g * 0.8];
    });
    cracks(p, 8, hex(0x3a2a18), 6, 0.5);
    blotches(p, 8, hex(0xb89a6a), 10, 24, 0.18);
    blotches(p, 6, hex(0x3a2a1a), 8, 18, 0.25);
    boneLitter(p, 1, 0);
  },
  // 19 cave ice: dark blue-grey ice, frost crust, trapped bubbles, white cracks
  19: (p) => {
    earthy(p, 0x8aa6b8, 0x9cbacb, 0x6e8ea2, 8);
    blotches(p, 14, hex(0xe4eef4), 8, 22, 0.35);
    cracks(p, 12, hex(0xe8f4fa), 9, 0.55);
    cracks(p, 6, hex(0x24384a), 8, 0.5);
    dots(p, 90, [hex(0xd8eaf4), hex(0x9ab8cc)], 0.5, 1.6, 0.5);
  },
  // 20 tomb marble: grey stained slabs, cracked, tarnished joints
  20: (p) => {
    const T = CELL / SPAN;
    const A = hex(0x8a867e), B = hex(0x7a766e), V = hex(0x4a4640);
    base(p, (x, y) => {
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      const lx = x - tx * T, ly = y - ty * T;
      const n = p.n.fbm(x, y, 4, 5);
      const alt = (tx + ty) % 2 === 0;
      let c = mixC(alt ? A : B, alt ? B : A, n * 0.5);
      const v = Math.abs(Math.sin((x * 0.6 + y * 0.35) * 0.05 + p.n.fbm(x + 40, y + 9, 4, 5) * 9 + tx * 1.7));
      c = mixC(c, V, (1 - sstep(0.0, 0.07, v)) * 0.6);
      const edge = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
      if (edge < 2) c = mixC(c, [26, 24, 20], 0.8);
      else if (edge < 3.5) c = mixC(c, [200, 196, 186], 0.18);
      c = mixC(c, [20, 22, 16], sstep(0.55, 0.9, p.n.fbm(x + 9, y + 5, 4, 3)) * 0.5);
      const gr = (p.rng.next() - 0.5) * 6;
      return [c[0] + gr, c[1] + gr, c[2] + gr];
    });
    cracks(p, 10, hex(0x1a1814), 9, 0.6);
    stains(p, 2, hex(0x34100a), 8, 0.4);
    boneLitter(p, 3, 0);
  },
  // 21 wet shore pebbles: dark gravel and rounded stones, glistening
  21: (p) => {
    earthy(p, 0x5a5444, 0x666050, 0x48443a, 12);
    pebbles(p, 180, [hex(0x7a766a), hex(0x8e887a), hex(0x5e5a50), hex(0x9a907c), hex(0x6a5e4c)], 1.6, 4.6);
    pebbles(p, 60, [hex(0x8a8476), hex(0x4e4a42)], 0.8, 2);
    dots(p, 160, [hex(0xd8dcd4)], 0.4, 0.8, 0.5);
  },
  // 22 mud: black-brown sludge with a wet sheen and dragged streaks
  22: (p) => {
    earthy(p, 0x3a2e20, 0x463828, 0x2a2018, 10);
    const { ctx, rng } = p;
    for (let i = 0; i < 30; i++) {
      const x = rng.next() * CELL, y = rng.next() * CELL, l = 14 + rng.next() * 30, a = (rng.next() - 0.5) * 0.8;
      wrapped(p, x, y, l, (xx, yy) => {
        ctx.strokeStyle = 'rgba(20,14,8,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke();
        ctx.strokeStyle = 'rgba(170,160,130,0.16)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx, yy - 1.5); ctx.lineTo(xx + Math.cos(a) * l, yy - 1.5 + Math.sin(a) * l); ctx.stroke();
      });
    }
    puddles(p, 10, hex(0x1e1a12), 4, 11);
    dots(p, 30, [hex(0x5a5a30)], 1, 2.5, 0.5);
  },
  // 23 scorched rock: black crust with rust-red burn lines and ash
  23: (p) => {
    earthy(p, 0x1e1714, 0x281e1a, 0x140f0d, 10);
    cracks(p, 18, hex(0x7a2e10), 8, 0.6);
    blotches(p, 10, hex(0x5a5250), 8, 20, 0.15);
    dots(p, 160, [hex(0x6a6260), hex(0x3a1608)], 0.4, 1.2, 0.6);
  },
};
