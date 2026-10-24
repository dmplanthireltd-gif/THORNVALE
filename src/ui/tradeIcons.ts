import type { ItemDef } from '../game/inventory/items';
import { CROP_IDS } from '../game/inventory/tradeItems';
import { HERB_BY_ID } from '../game/trades/herblore';

/**
 * Icons of the trade-skill items (herbs, vials, seeds, crops, traps, lockpicks,
 * stolen goods, boats), drawn in the same 32×32 space and outlined style as
 * ui/icons.ts (which calls `drawTradeIcon` first). Kept in its own file so the
 * main icon painter stays as it was.
 */
type Ctx = CanvasRenderingContext2D;
const OUT = '#120e0a';

function shade(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function paint(x: Ctx, fill: string, line = 1.4): void {
  x.fillStyle = fill;
  x.fill();
  if (line > 0) {
    x.strokeStyle = OUT;
    x.lineWidth = line;
    x.stroke();
  }
}

function poly(x: Ctx, pts: number[], fill: string, line = 1.4): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  paint(x, fill, line);
}

function circle(x: Ctx, cx: number, cy: number, r: number, fill: string, line = 1.4): void {
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  paint(x, fill, line);
}

function ellipse(x: Ctx, cx: number, cy: number, rx: number, ry: number, rot: number, fill: string, line = 1.4): void {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  paint(x, fill, line);
}

function bar(x: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, fill: string): void {
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x1, y1);
  x.strokeStyle = OUT;
  x.lineWidth = w + 2.4;
  x.stroke();
  x.strokeStyle = fill;
  x.lineWidth = w;
  x.stroke();
}

/** A sprig of leaves on a stem (herbs; grimy ones are muddy). */
function herb(x: Ctx, c: string, grimy: boolean): void {
  bar(x, 16, 29, 16, 9, 1.4, grimy ? '#5a4a2a' : shade(c, 0.6));
  const leaf = grimy ? '#6a5a32' : c;
  for (const [lx, ly, r] of [[11, 12, -0.8], [21, 12, 0.8], [10, 20, -1.0], [22, 20, 1.0], [16, 6, 0]] as const) ellipse(x, lx, ly, 5, 2.6, r, leaf);
  if (grimy) for (const [dx, dy] of [[12, 22], [19, 15], [15, 26], [22, 23]]) circle(x, dx, dy, 1.4, '#3a2a14', 0);
  else for (const [lx, ly, r] of [[11, 12, -0.8], [21, 12, 0.8]] as const) ellipse(x, lx, ly - 0.6, 2.4, 0.8, r, shade(c, 1.4), 0);
}

function seeds(x: Ctx, c: string): void {
  // a small paper packet with seeds spilling out
  poly(x, [7, 6, 22, 6, 24, 24, 5, 24], '#d8c8a0');
  poly(x, [9, 10, 20, 10, 21, 18, 8, 18], c, 1);
  for (const [sx, sy] of [[24, 27], [27, 25], [21, 28], [28, 29]]) ellipse(x, sx, sy, 1.6, 1.1, 0.4, '#8a6a3a', 0.8);
}

function vial(x: Ctx, liquid: string | null): void {
  poly(x, [13, 4, 19, 4, 19, 11, 24, 18, 24, 27, 8, 27, 8, 18, 13, 11], 'rgba(200,228,236,0.55)');
  if (liquid) poly(x, [9, 19, 23, 19, 23, 26, 9, 26], liquid, 0);
  poly(x, [12, 2, 20, 2, 20, 5, 12, 5], '#8a6a3a', 1);
  bar(x, 11, 14, 11, 24, 0.8, 'rgba(255,255,255,0.7)');
}

function crop(x: Ctx, id: string, c: string): void {
  switch (id) {
    case 'potato':
      ellipse(x, 16, 18, 10, 7, 0.3, c);
      for (const [px, py] of [[12, 16], [19, 20], [17, 14]]) circle(x, px, py, 0.9, shade(c, 0.6), 0);
      return;
    case 'onion':
      circle(x, 16, 19, 9, c);
      poly(x, [14, 10, 18, 10, 17, 4, 15, 4], '#7aa04a', 1);
      bar(x, 16, 12, 16, 26, 0.5, shade(c, 0.75));
      return;
    case 'cabbage':
      circle(x, 16, 17, 11, c);
      for (const r of [7, 4]) circle(x, 16, 17, r, shade(c, 1.2), 0.8);
      return;
    case 'tomato':
    case 'strawberry':
      if (id === 'tomato') circle(x, 16, 18, 9, c);
      else poly(x, [7, 12, 25, 12, 16, 28], c);
      poly(x, [11, 10, 16, 6, 21, 10, 16, 13], '#4a8a2a', 1);
      if (id === 'strawberry') for (const [sx, sy] of [[12, 15], [18, 15], [15, 20], [17, 24], [20, 18]]) circle(x, sx, sy, 0.7, '#f0e080', 0);
      return;
    case 'sweetcorn':
      ellipse(x, 16, 16, 5, 11, 0, c);
      poly(x, [10, 26, 6, 10, 14, 24], '#6a9a3a', 1);
      poly(x, [22, 26, 26, 10, 18, 24], '#6a9a3a', 1);
      return;
    case 'watermelon':
      ellipse(x, 16, 17, 13, 10, 0, c);
      for (const k of [-6, 0, 6]) bar(x, 16 + k, 8, 16 + k * 0.6, 26, 0.9, shade(c, 0.6));
      return;
  }
}

function tool(x: Ctx, d: ItemDef): boolean {
  switch (d.id) {
    case 'pestle':
      poly(x, [5, 17, 27, 17, 23, 28, 9, 28], '#8a847a');
      ellipse(x, 16, 17, 11, 3, 0, '#5a7a3a', 1);
      bar(x, 14, 18, 24, 3, 3.2, '#b0aaa0');
      return true;
    case 'lockpick':
      bar(x, 6, 26, 24, 8, 1.2, '#c8ccd4');
      bar(x, 24, 8, 27, 9, 1.2, '#c8ccd4');
      poly(x, [4, 24, 9, 24, 9, 29, 4, 29], '#7a5a3a', 1);
      bar(x, 9, 28, 26, 14, 1, '#a8aeb8');
      return true;
    case 'trowel':
      bar(x, 6, 27, 14, 19, 3, '#7a5a3a');
      poly(x, [14, 18, 26, 4, 28, 12, 17, 21], '#b8bec8');
      return true;
    case 'box_trap':
      poly(x, [5, 12, 25, 12, 25, 27, 5, 27], '#8a6a3a');
      for (const k of [9, 13, 17, 21]) bar(x, k, 13, k, 26, 0.6, '#5a4426');
      poly(x, [25, 12, 29, 9, 29, 24, 25, 27], '#6a5030', 1);
      bar(x, 15, 12, 22, 4, 1, '#c8b080');
      return true;
    case 'bird_snare':
      x.beginPath();
      x.arc(16, 15, 9, 0, Math.PI * 2);
      x.strokeStyle = OUT;
      x.lineWidth = 3.2;
      x.stroke();
      x.strokeStyle = '#d8c090';
      x.lineWidth = 1.4;
      x.stroke();
      bar(x, 16, 24, 16, 30, 1.6, '#7a5a3a');
      return true;
    case 'skiff_deed':
    case 'sloop_deed':
    case 'cutter_deed': {
      // a little hull; masts by size
      poly(x, [3, 19, 29, 19, 24, 27, 8, 27], d.tint);
      bar(x, 5, 21, 27, 21, 0.6, shade(d.tint, 0.6));
      if (d.id !== 'skiff_deed') {
        bar(x, 16, 19, 16, 4, 1.3, '#5a3a22');
        poly(x, [17, 5, 26, 16, 17, 16], '#efe6cf', 1);
      }
      if (d.id === 'cutter_deed') {
        bar(x, 9, 19, 9, 8, 1.1, '#5a3a22');
        poly(x, [10, 9, 15, 17, 10, 17], '#efe6cf', 1);
      }
      if (d.id === 'skiff_deed') bar(x, 6, 12, 26, 24, 1.2, '#a8804a');
      return true;
    }
  }
  return false;
}

/** Draws a trade-skill item; false = not one of ours (icons.ts draws it). */
export function drawTradeIcon(x: Ctx, d: ItemDef): boolean {
  if (d.kind === 'tool' && tool(x, d)) return true;
  if (d.id.startsWith('grimy_') && HERB_BY_ID[d.id.slice(6)]) { herb(x, HERB_BY_ID[d.id.slice(6)].color, true); return true; }
  if (HERB_BY_ID[d.id]) { herb(x, HERB_BY_ID[d.id].color, false); return true; }
  if (d.id.endsWith('_seed')) { seeds(x, d.tint); return true; }
  if (CROP_IDS.includes(d.id)) { crop(x, d.id, d.tint); return true; }
  switch (d.id) {
    case 'empty_vial': vial(x, null); return true;
    case 'vigour_potion': vial(x, '#e0a030'); return true;
    case 'silk_cloth':
      poly(x, [5, 10, 25, 8, 27, 22, 7, 25], d.tint);
      bar(x, 7, 16, 26, 14, 0.8, shade(d.tint, 1.4));
      bar(x, 8, 20, 26, 18, 0.6, shade(d.tint, 0.7));
      return true;
    case 'spice_pouch':
      ellipse(x, 16, 20, 10, 8, 0, '#a8804a');
      poly(x, [12, 12, 20, 12, 18, 7, 14, 7], '#8a6a3a', 1);
      bar(x, 11, 13, 21, 13, 1, '#c0402a');
      for (const [sx, sy] of [[13, 19], [18, 22], [16, 17]]) circle(x, sx, sy, 1.2, '#e08a2a', 0);
      return true;
    case 'silver_trinket':
      circle(x, 16, 16, 9, '#d8dce4');
      circle(x, 16, 16, 5, '#b0b6c0', 1);
      circle(x, 16, 16, 2, '#3a6ae8', 0.8);
      return true;
    case 'compost':
      poly(x, [7, 10, 25, 10, 23, 28, 9, 28], '#6a6a72');
      ellipse(x, 16, 10, 9, 3, 0, '#4a3a20', 1);
      bar(x, 8, 9, 24, 9, 0.6, '#8a8a92');
      return true;
  }
  return false;
}

/** Material shapes for the content checks (ui/icons.ts MATERIAL_SHAPE): our own drawings, or the shared ones. */
export const TRADE_MATERIAL_SHAPES: Record<string, [string, string]> = {
  empty_vial: ['vial', '#c8e0e8'], silk_cloth: ['silk', '#c8507a'], spice_pouch: ['pouch', '#c0601a'], silver_trinket: ['brooch', '#d8dce4'],
  compost: ['bucket', '#5a4a2a'],
  hare_pelt: ['pelt', '#b8a080'], ferret_pelt: ['pelt', '#6a625a'], skink_hide: ['scale', '#d8b070'], stoat_fur: ['pelt', '#f0f0f4'],
  marten_pelt: ['pelt', '#a8401a'], bright_plume: ['feather', '#f0a020'], raw_bird: ['rawmeat', '#e0a090'], pet_morsel: ['blob', '#c87a4a'],
};
for (const id of Object.keys(HERB_BY_ID)) {
  TRADE_MATERIAL_SHAPES[id] = ['herb', HERB_BY_ID[id].color];
  TRADE_MATERIAL_SHAPES[`grimy_${id}`] = ['herb', '#6a5a32'];
  TRADE_MATERIAL_SHAPES[`${id}_seed`] = ['seeds', HERB_BY_ID[id].color];
}
for (const id of CROP_IDS) TRADE_MATERIAL_SHAPES[`${id}_seed`] = ['seeds', '#a08050'];
