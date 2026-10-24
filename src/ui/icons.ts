import { ITEMS, type ItemDef } from '../game/inventory/items';
import { SPELLS, type SpellDef, type SpellId } from '../game/magic/spells';
import { drawGear } from './gearIcons';
import { drawRuneStone } from './runeIcons';
import { drawPetIcon } from './petIcons';
import { drawTradeIcon, TRADE_MATERIAL_SHAPES } from './tradeIcons';
import { drawLiveIcon, LIVE_MATERIAL_SHAPES } from './liveIcons';

/**
 * Hand-drawn item and spell icons, painted once on a canvas and cached as
 * image URLs. Drawn in a 32×32 coordinate space at 2× resolution with a dark
 * outline, so they stay readable at any slot size. Equipment (weapons, armour,
 * jewellery, backpacks) is painted in detail by gearIcons.ts.
 */
const SIZE = 64;
const cache = new Map<string, string>();
const OUT = '#120e0a';

type Ctx = CanvasRenderingContext2D;


function shade(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function canvas(): { c: HTMLCanvasElement; x: Ctx } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  if (!x) return null;
  x.scale(SIZE / 32, SIZE / 32);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  return { c, x };
}

/** Fills the current path with an outline and a soft top highlight. */
function paint(x: Ctx, fill: string, line = 1.4): void {
  x.fillStyle = fill;
  x.fill();
  x.strokeStyle = OUT;
  x.lineWidth = line;
  x.stroke();
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

function rect(x: Ctx, a: number, b: number, w: number, h: number, fill: string, line = 1.4): void {
  x.beginPath();
  x.rect(a, b, w, h);
  paint(x, fill, line);
}

/** A thick line with an outline (handles, shafts). */
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

function glow(x: Ctx, cx: number, cy: number, r: number, color: string): void {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function glyph(x: Ctx, text: string, cx: number, cy: number, size: number, fill: string): void {
  x.font = `900 ${size}px Verdana, 'Segoe UI Symbol', sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 2.4;
  x.strokeStyle = OUT;
  x.strokeText(text, cx, cy + 0.5);
  x.fillStyle = fill;
  x.fillText(text, cx, cy + 0.5);
}

// ------------------------------------------------------------------ other items

function drawMead(x: Ctx): void {
  x.beginPath();
  x.moveTo(4, 6);
  x.quadraticCurveTo(8, 26, 26, 28);
  x.quadraticCurveTo(28, 22, 24, 20);
  x.quadraticCurveTo(14, 18, 12, 4);
  x.closePath();
  paint(x, '#e8dcc0');
  poly(x, [4, 6, 12, 4, 11, 8, 5, 9], '#f0c040', 1);
  bar(x, 9, 13, 14, 12, 1.2, '#8a6a3e');
  bar(x, 13, 21, 18, 18, 1.2, '#8a6a3e');
}

function drawPotion(x: Ctx, d: ItemDef): void {
  const liquid = d.tint;
  rect(x, 13, 3, 6, 4, '#8a6a3e');
  x.beginPath();
  x.moveTo(13, 7);
  x.lineTo(19, 7);
  x.lineTo(19, 11);
  x.arc(16, 20, 9, -Math.PI / 2 + 0.35, Math.PI * 1.5 - 0.35);
  x.closePath();
  paint(x, 'rgba(220,235,255,0.55)');
  x.beginPath();
  x.arc(16, 20, 7.6, 0.1, Math.PI - 0.1);
  x.closePath();
  x.fillStyle = liquid;
  x.fill();
  circle(x, 12.5, 17, 1.6, 'rgba(255,255,255,0.8)', 0);
  if (d.buff) glyph(x, d.buff === 'berserk' ? '⚔' : d.buff === 'bullseye' ? '◎' : '✦', 16, 21, 8, '#ffffff');
}

export { RUNE_LABEL } from './runeIcons';

function drawGold(x: Ctx): void {
  for (const [cx, cy] of [[11, 22], [21, 22], [16, 15], [12, 9], [21, 9]]) {
    x.beginPath();
    x.ellipse(cx, cy, 6, 4.2, 0, 0, Math.PI * 2);
    paint(x, '#e8b923');
    x.beginPath();
    x.ellipse(cx - 1, cy - 1, 2.5, 1.4, 0, 0, Math.PI * 2);
    x.fillStyle = '#fff2a0';
    x.fill();
  }
}

/** Fishing catches other than the plain fish: same body, own colour, a few marks per kind. */
export const CATCH_FISH = new Set(['trout', 'pike', 'salmon', 'ice_fish', 'swordfish']);

function drawFood(x: Ctx, d: ItemDef): void {
  if (d.id === 'fish') {
    poly(x, [3, 16, 9, 10, 20, 9, 26, 15, 20, 22, 9, 22], '#8ab0c8');
    poly(x, [25, 15, 31, 9, 30, 22], '#6a90a8');
    circle(x, 9, 15, 1.5, '#121212', 0);
    bar(x, 13, 12, 13, 19, 0.6, '#5a7a90');
    return;
  }
  if (CATCH_FISH.has(d.id)) {
    const c = d.tint;
    if (d.id === 'swordfish') bar(x, 1, 13, 8, 15, 1.4, shade(c, 1.3));
    const long = d.id === 'pike' || d.id === 'swordfish';
    poly(x, long ? [4, 16, 8, 11, 21, 10, 26, 15, 21, 21, 8, 21] : [5, 16, 10, 9, 19, 8, 25, 15, 19, 23, 10, 23], c);
    poly(x, [25, 15, 31, 8, 30, 23], shade(c, 0.78));
    if (d.id === 'swordfish') poly(x, [13, 10, 17, 3, 20, 10], shade(c, 0.78), 1);
    circle(x, long ? 9 : 10, 15, 1.4, '#121212', 0);
    if (d.id === 'trout') for (const [sx, sy] of [[14, 13], [18, 17], [21, 13], [15, 19]]) circle(x, sx, sy, 0.9, '#3a4a2a', 0);
    if (d.id === 'pike') for (let i = 0; i < 3; i++) bar(x, 13 + i * 4, 12, 12 + i * 4, 19, 0.8, shade(c, 0.7));
    if (d.id === 'salmon') bar(x, 9, 18, 24, 17, 1.2, '#f0c0b0');
    if (d.id === 'ice_fish') bar(x, 12, 15, 24, 15, 0.8, '#ffffff');
    return;
  }
  if (d.id === 'cheese') {
    poly(x, [4, 24, 28, 24, 28, 14, 4, 20], '#f0c840');
    poly(x, [4, 20, 28, 14, 22, 9], '#ffe070');
    circle(x, 12, 22, 1.5, '#c9a020', 0);
    circle(x, 21, 20, 1.8, '#c9a020', 0);
    return;
  }
  bar(x, 22, 24, 28, 29, 3, '#f0e6c8');
  x.beginPath();
  x.ellipse(13, 13, 10, 8, -0.6, 0, Math.PI * 2);
  paint(x, d.id === 'ham' ? '#d07a6a' : '#a8513d');
  x.beginPath();
  x.ellipse(11, 11, 4, 2.5, -0.6, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.fill();
}

function drawTool(x: Ctx, d: ItemDef): void {
  if (d.tool === 'fishing') {
    // a bent rod with its line and a red float
    bar(x, 4, 29, 25, 4, 2, '#a8804a');
    bar(x, 4, 29, 8, 24, 3, '#5a3a22');
    x.beginPath();
    x.moveTo(25, 4);
    x.quadraticCurveTo(29, 14, 26, 22);
    x.strokeStyle = '#e8e8e8';
    x.lineWidth = 0.8;
    x.stroke();
    circle(x, 26, 24, 2.2, '#d8302a', 1);
    return;
  }
  if (d.tool === 'mining') {
    // a pickaxe: wooden haft, curved metal head in the item's colour
    bar(x, 7, 28, 22, 9, 2.4, '#7a5530');
    x.beginPath();
    x.moveTo(9, 6);
    x.quadraticCurveTo(20, 3, 29, 14);
    x.lineTo(26, 15);
    x.quadraticCurveTo(20, 8, 10, 9);
    x.closePath();
    paint(x, d.tint);
    return;
  }
  if (d.tool === 'hammer') {
    // a smith's hammer: short haft, heavy square head
    bar(x, 8, 28, 20, 12, 2.6, '#7a5530');
    poly(x, [14, 5, 26, 13, 21, 20, 9, 12], d.tint);
    poly(x, [14, 5, 17, 7, 12, 14, 9, 12], shade(d.tint, 1.3), 0.8);
    return;
  }
  if (d.tool === 'knife') {
    // a small carving knife: wooden handle, short bright blade
    bar(x, 6, 27, 14, 19, 3, '#7a5530');
    poly(x, [13, 17, 27, 4, 29, 6, 17, 21], d.tint);
    bar(x, 15, 18, 26, 6, 0.6, shade(d.tint, 1.35));
    return;
  }
  if (d.tool === 'needle') {
    // a long needle with thread curling from its eye
    bar(x, 6, 27, 26, 5, 1.4, d.tint);
    x.beginPath();
    x.moveTo(25, 6);
    x.bezierCurveTo(31, 14, 14, 18, 12, 28);
    x.strokeStyle = '#c84a3a';
    x.lineWidth = 1.2;
    x.stroke();
    return;
  }
  if (d.tool === 'chisel') {
    // a stone chisel: wooden grip, flat steel head
    bar(x, 6, 26, 16, 16, 3.4, '#7a5530');
    poly(x, [15, 14, 25, 4, 29, 8, 19, 18], d.tint);
    bar(x, 25, 4, 29, 8, 1, shade(d.tint, 1.4));
    return;
  }
  if (d.tool === 'tinderbox') {
    // a little box with a flint and a spark
    rect(x, 5, 14, 18, 12, d.tint);
    rect(x, 5, 14, 18, 3, shade(d.tint, 1.3), 1);
    poly(x, [20, 10, 27, 8, 26, 14, 21, 14], '#8a8f9a');
    glow(x, 25, 7, 6, 'rgba(255,190,60,0.9)');
    poly(x, [25, 2, 26.5, 6, 30, 7, 26.5, 8, 25, 12, 23.5, 8, 20, 7, 23.5, 6], '#ffd84a', 0.8);
    return;
  }
  if (d.tool === 'rope') {
    for (const r of [11, 8, 5]) {
      x.beginPath();
      x.arc(16, 17, r, 0, Math.PI * 2);
      x.strokeStyle = OUT;
      x.lineWidth = 4.2;
      x.stroke();
      x.strokeStyle = '#c9a26a';
      x.lineWidth = 2.2;
      x.stroke();
    }
    bar(x, 25, 20, 29, 28, 2.2, '#c9a26a');
    return;
  }
  bar(x, 6, 26, 21, 11, 2.4, '#7a5530');
  rect(x, 3, 24, 6, 3, '#7a5530');
  poly(x, [19, 9, 24, 4, 30, 10, 25, 15], '#9aa4b2');
}

export const MATERIAL_SHAPE: Record<string, [string, string]> = {
  rat_tail: ['tail', '#c48a8a'], wolf_pelt: ['pelt', '#7a7a82'], bone: ['bone', '#efe6cc'], orc_tooth: ['fang', '#f0e6c8'],
  orc_charm: ['orb', '#7affb0'], orc_banner: ['flag', '#a8281f'], elvish_talisman: ['orb', '#9ad0a0'], elven_scroll: ['scroll', '#efe6cf'],
  crocodile_leather: ['pelt', '#5a7a3a'], spider_silk: ['spiral', '#f0f0f0'], dread_silk: ['spiral', '#9a8fb8'], venom_gland: ['blob', '#7ac84a'], colossus_eye: ['orb', '#c83a2a'], troll_hair: ['pelt', '#3a4a2a'], hydra_head: ['head', '#2f7a5a'],
  hydra_egg: ['egg', '#b0c070'], ghoul_snack: ['blob', '#6a8a4a'], fiery_heart: ['heart', '#ff6a1a'], behemoth_claw: ['fang', '#d8d0b8'],
  demon_horn: ['horn', '#3a1a14'], demonic_essence: ['orb', '#c040ff'], dragon_scale: ['scale', '#3f9a52'], red_dragon_scale: ['scale', '#c0281f'],
  small_ruby: ['gem', '#e8243a'], small_sapphire: ['gem', '#2a6ae8'], small_emerald: ['gem', '#24c060'], small_diamond: ['gem', '#e8f4ff'],
  golden_goblet: ['cup', '#e8b923'],
  silver_fur: ['pelt', '#d8dce4'], antlers: ['antler', '#c8a878'], snakeskin: ['tail', '#8aa040'], penguin_feather: ['feather', '#2a2a34'],
  bear_paw: ['paw', '#6a4a2a'], winter_wolf_fur: ['pelt', '#dfe6ee'], polar_bear_fur: ['pelt', '#f0ece0'], iron_ore: ['ore', '#8a7060'],
  frost_charm: ['orb', '#9fe6ff'], braided_cord: ['tail', '#c0402a'], skull_trophy: ['skull', '#efe6cc'], minotaur_horn: ['horn', '#d8c8a0'],
  minotaur_leather: ['pelt', '#8a5a32'], cyclops_eye: ['eye', '#f0f0e8'], scorpion_tail: ['tail', '#c08a3a'], scarab_coin: ['coin', '#40c0a0'],
  mummy_wrapping: ['scroll', '#d8ccb0'], lizard_scale: ['scale', '#5a9a4a'], giant_beard: ['pelt', '#c8d8e8'], crystal_shard: ['crystal', '#9fe6ff'],
  frozen_heart: ['heart', '#6ac8ff'], frost_dragon_scale: ['scale', '#bfe6f5'],
  logs: ['logs', '#9a6a3a'], pine_logs: ['logs', '#b08850'], palm_logs: ['logs', '#c8a870'], teak_logs: ['logs', '#7a4a28'],
  old_boot: ['boot', '#6a5038'],
  // mining and blacksmithing
  copper_ore: ['ore', '#c8743a'], tin_ore: ['ore', '#b8bcc4'], coal: ['ore', '#2a2a30'], silver_ore: ['ore', '#e4e8f0'], gold_ore: ['ore', '#f0c030'],
  starsteel_ore: ['ore', '#5a8ad8'], darkstone_ore: ['ore', '#6a3a7a'],
  bronze_bar: ['bar', '#c8843a'], iron_bar: ['bar', '#9aa0aa'], silver_bar: ['bar', '#e4e8f0'], steel_bar: ['bar', '#c9d0da'], gold_bar: ['bar', '#f0c030'],
  starsteel_bar: ['bar', '#5a8ad8'], darkstone_bar: ['bar', '#6a3a7a'],
  bronze_arrowheads: ['tips', '#c8843a'], iron_arrowheads: ['tips', '#9aa0aa'], steel_arrowheads: ['tips', '#c9d0da'],
  starsteel_arrowheads: ['tips', '#5a8ad8'], darkstone_arrowheads: ['tips', '#6a3a7a'],
  // fletching, crafting and cooking
  thread: ['spiral', '#e8e0c6'], feather: ['feather', '#f0f0f0'], arrow_shaft: ['shafts', '#c9b28a'], wooden_stock: ['stock', '#9a6a3a'],
  teak_stock: ['stock', '#7a4a28'], bear_hide: ['pelt', '#6a4a2a'], leather: ['hide', '#a8743f'], tanned_fur: ['hide', '#e4e0d4'],
  cut_sapphire: ['cutgem', '#2a6ae8'], cut_emerald: ['cutgem', '#24c060'], cut_ruby: ['cutgem', '#e8243a'], cut_diamond: ['cutgem', '#e8f4ff'],
  raw_meat: ['rawmeat', '#c0605a'], raw_ham: ['rawmeat', '#d88a7a'], raw_fish: ['rawfish', '#9ab8cc'], raw_trout: ['rawfish', '#a8b47a'],
  raw_pike: ['rawfish', '#7a9a5a'], raw_salmon: ['rawfish', '#f09a80'], raw_ice_fish: ['rawfish', '#cfeef8'], raw_swordfish: ['rawfish', '#6a8ac0'],
  burnt_food: ['burnt', '#2a2018'],
  // the Sunken Reach
  pearl: ['pearl', '#f2ede2'], black_pearl: ['pearl', '#4a3a5a'], red_coral: ['coral', '#d8443a'], ironshell_claw: ['claw', '#7a5a44'],
  glowing_jelly: ['jelly', '#8adcff'], deepfin_scale: ['scale', '#3a8a8a'], tide_shell: ['conch', '#e8c8a8'], gloom_eel_skin: ['pelt', '#2a3a4a'],
};

// herbs, seeds, stolen goods, pelts… of the trade skills (ui/tradeIcons.ts)
Object.assign(MATERIAL_SHAPE, TRADE_MATERIAL_SHAPES);
// festival tokens (ui/liveIcons.ts)
Object.assign(MATERIAL_SHAPE, LIVE_MATERIAL_SHAPES);

function drawMaterial(x: Ctx, d: ItemDef): void {
  const [shape, c] = MATERIAL_SHAPE[d.id] ?? ['orb', d.tint];
  switch (shape) {
    case 'gem':
      poly(x, [16, 4, 27, 13, 16, 29, 5, 13], c);
      poly(x, [16, 4, 22, 13, 16, 13, 10, 13], shade(c, 1.4), 0.8);
      break;
    case 'scale':
      for (const [cx, cy] of [[11, 12], [21, 12], [16, 20]]) {
        x.beginPath();
        x.moveTo(cx - 6, cy - 4);
        x.quadraticCurveTo(cx, cy + 12, cx + 6, cy - 4);
        x.closePath();
        paint(x, c);
      }
      break;
    case 'fang':
      poly(x, [10, 4, 22, 4, 17, 29], c);
      break;
    case 'horn':
      x.beginPath();
      x.moveTo(6, 28);
      x.quadraticCurveTo(4, 8, 26, 3);
      x.quadraticCurveTo(14, 12, 14, 28);
      x.closePath();
      paint(x, c);
      break;
    case 'pelt':
      poly(x, [6, 6, 12, 3, 20, 3, 26, 6, 27, 17, 23, 28, 9, 28, 5, 17], c);
      for (let i = 0; i < 4; i++) bar(x, 10 + i * 4, 9, 9 + i * 4, 24, 0.6, shade(c, 0.7));
      break;
    case 'bone':
      bar(x, 8, 24, 24, 8, 4, c);
      for (const [cx, cy] of [[6, 24], [9, 27], [23, 5], [26, 8]]) circle(x, cx, cy, 2.8, c);
      break;
    case 'tail':
      x.beginPath();
      x.moveTo(5, 26);
      x.bezierCurveTo(10, 4, 22, 30, 28, 6);
      x.strokeStyle = OUT;
      x.lineWidth = 5;
      x.stroke();
      x.strokeStyle = c;
      x.lineWidth = 2.8;
      x.stroke();
      break;
    case 'flag':
      bar(x, 7, 3, 7, 30, 2, '#7a5530');
      poly(x, [8, 4, 27, 6, 22, 11, 27, 17, 8, 17], c);
      glyph(x, '☠', 16, 11, 8, '#f0e6c8');
      break;
    case 'scroll':
      rect(x, 7, 7, 18, 18, c);
      circle(x, 7, 16, 3, shade(c, 0.85));
      circle(x, 25, 16, 3, shade(c, 0.85));
      for (let i = 0; i < 3; i++) bar(x, 11, 11 + i * 5, 21, 11 + i * 5, 0.6, '#8a7a5a');
      break;
    case 'spiral':
      x.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.2) x.lineTo(16 + Math.cos(a) * a * 0.7, 16 + Math.sin(a) * a * 0.7);
      x.strokeStyle = OUT;
      x.lineWidth = 3.2;
      x.stroke();
      x.strokeStyle = c;
      x.lineWidth = 1.4;
      x.stroke();
      break;
    case 'pearl': {
      // a pearl resting in half an oyster shell
      x.beginPath();
      x.ellipse(16, 22, 13, 7, 0, 0, Math.PI);
      paint(x, '#8a8478');
      x.beginPath();
      x.ellipse(16, 22, 11, 4, 0, 0, Math.PI * 2);
      paint(x, '#e8dccc', 1);
      const g = x.createRadialGradient(13, 14, 1, 16, 17, 8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.45, c);
      g.addColorStop(1, shade(c, 0.55));
      circle(x, 16, 17, 7, '#000');
      x.beginPath();
      x.arc(16, 17, 6.3, 0, Math.PI * 2);
      x.fillStyle = g;
      x.fill();
      circle(x, 13.5, 14.5, 1.6, 'rgba(255,255,255,0.9)', 0);
      break;
    }
    case 'coral':
      bar(x, 16, 29, 16, 16, 3, c);
      bar(x, 16, 20, 8, 10, 2.6, c);
      bar(x, 16, 18, 25, 8, 2.6, c);
      bar(x, 9, 12, 6, 4, 2, shade(c, 1.25));
      bar(x, 10, 12, 13, 5, 2, shade(c, 1.25));
      bar(x, 23, 10, 27, 4, 2, shade(c, 1.25));
      bar(x, 16, 16, 17, 6, 2.2, shade(c, 1.15));
      break;
    case 'claw':
      x.beginPath();
      x.moveTo(5, 27);
      x.quadraticCurveTo(6, 13, 17, 9);
      x.quadraticCurveTo(26, 6, 29, 11);
      x.quadraticCurveTo(22, 11, 19, 16);
      x.quadraticCurveTo(25, 17, 27, 22);
      x.quadraticCurveTo(18, 19, 13, 25);
      x.closePath();
      paint(x, c);
      for (const [a, b] of [[12, 15], [16, 13], [9, 20]]) circle(x, a, b, 1.2, shade(c, 1.5), 0);
      break;
    case 'jelly':
      glow(x, 16, 13, 14, 'rgba(120,220,255,0.55)');
      for (let i = 0; i < 4; i++) bar(x, 10 + i * 4, 16, 9 + i * 4.5 + (i % 2), 28, 1.2, shade(c, 0.8));
      x.beginPath();
      x.moveTo(5, 17);
      x.quadraticCurveTo(5, 4, 16, 4);
      x.quadraticCurveTo(27, 4, 27, 17);
      x.quadraticCurveTo(16, 14, 5, 17);
      paint(x, c);
      circle(x, 16, 11, 2.6, '#ffffff', 0);
      break;
    case 'conch':
      x.beginPath();
      x.moveTo(6, 25);
      x.quadraticCurveTo(4, 10, 18, 5);
      x.quadraticCurveTo(28, 4, 27, 14);
      x.quadraticCurveTo(22, 26, 6, 25);
      paint(x, c);
      x.beginPath();
      x.arc(18, 13, 5, 0, Math.PI * 1.6);
      x.strokeStyle = shade(c, 0.6);
      x.lineWidth = 1.4;
      x.stroke();
      poly(x, [6, 25, 3, 29, 10, 26], shade(c, 1.2), 1);
      break;
    case 'heart':
      glow(x, 16, 16, 15, 'rgba(255,140,40,0.6)');
      x.beginPath();
      x.moveTo(16, 28);
      x.bezierCurveTo(2, 18, 6, 4, 16, 11);
      x.bezierCurveTo(26, 4, 30, 18, 16, 28);
      paint(x, c);
      break;
    case 'egg':
      x.beginPath();
      x.ellipse(16, 17, 9, 12, 0, 0, Math.PI * 2);
      paint(x, c);
      circle(x, 13, 12, 1.8, shade(c, 0.6), 0);
      circle(x, 19, 20, 2.2, shade(c, 0.6), 0);
      break;
    case 'head':
      x.beginPath();
      x.ellipse(15, 17, 11, 8, -0.3, 0, Math.PI * 2);
      paint(x, c);
      circle(x, 19, 13, 2, '#ffe040');
      poly(x, [22, 20, 29, 18, 24, 23], '#f0e6c8', 1);
      break;
    case 'cup':
      x.beginPath();
      x.moveTo(7, 5);
      x.lineTo(25, 5);
      x.quadraticCurveTo(25, 18, 16, 18);
      x.quadraticCurveTo(7, 18, 7, 5);
      paint(x, c);
      rect(x, 15, 18, 2, 6, c, 1);
      rect(x, 9, 24, 14, 4, c);
      circle(x, 16, 10, 2, '#e8243a');
      break;
    case 'antler':
      bar(x, 8, 29, 12, 6, 2.2, c);
      bar(x, 10, 18, 4, 12, 1.6, c);
      bar(x, 11, 12, 18, 6, 1.6, c);
      bar(x, 22, 29, 20, 8, 2.2, c);
      bar(x, 21, 16, 28, 11, 1.6, c);
      break;
    case 'feather':
      x.beginPath();
      x.moveTo(6, 28);
      x.quadraticCurveTo(8, 6, 26, 4);
      x.quadraticCurveTo(22, 22, 6, 28);
      paint(x, c);
      bar(x, 7, 27, 24, 6, 0.6, '#f0f0f0');
      break;
    case 'paw':
      circle(x, 16, 20, 8, c);
      for (const [cx, cy] of [[8, 10], [13, 7], [19, 7], [24, 10]]) circle(x, cx, cy, 3, shade(c, 0.8));
      break;
    case 'ore':
      if (d.id === 'iron_ore') {
        poly(x, [5, 20, 9, 9, 18, 5, 27, 11, 28, 22, 18, 28, 8, 27], c);
        for (const [cx, cy] of [[12, 14], [20, 18], [15, 22]]) circle(x, cx, cy, 2, '#d8d0c8', 0);
        break;
      }
      // grey stone with lumps of the ore's colour
      poly(x, [5, 20, 9, 9, 18, 5, 27, 11, 28, 22, 18, 28, 8, 27], '#7a746c');
      for (const [cx, cy, r] of [[12, 14, 3.2], [20, 18, 3], [15, 23, 2.4], [21, 10, 2]]) circle(x, cx, cy, r, c, 1);
      circle(x, 11, 13, 0.9, 'rgba(255,255,255,0.7)', 0);
      break;
    case 'bar':
      // an ingot seen from the side: wide base, narrower top
      poly(x, [3, 22, 8, 12, 24, 12, 29, 22], c);
      poly(x, [8, 12, 24, 12, 22, 9, 10, 9], shade(c, 1.35), 1);
      bar(x, 6, 21, 26, 21, 0.8, shade(c, 0.7));
      break;
    case 'tips':
      // a little pile of arrowheads
      for (const [tx, ty] of [[8, 22], [16, 24], [23, 20], [12, 13], [20, 11]]) poly(x, [tx, ty - 6, tx + 3.5, ty + 2, tx - 3.5, ty + 2], c, 1);
      break;
    case 'skull':
      circle(x, 16, 14, 10, c);
      rect(x, 11, 20, 10, 8, c);
      circle(x, 12, 14, 2.6, '#1a1612', 0);
      circle(x, 20, 14, 2.6, '#1a1612', 0);
      break;
    case 'eye':
      circle(x, 16, 16, 11, c);
      circle(x, 16, 16, 6, '#8a4a20');
      circle(x, 16, 16, 3, '#121212', 0);
      circle(x, 14, 13, 1.4, '#ffffff', 0);
      break;
    case 'coin':
      circle(x, 16, 16, 12, '#e8b923');
      circle(x, 16, 16, 9, shade('#e8b923', 0.8), 1);
      x.beginPath();
      x.ellipse(16, 16, 4, 6, 0, 0, Math.PI * 2);
      paint(x, c, 1);
      break;
    case 'crystal':
      glow(x, 16, 16, 15, `${c}88`);
      poly(x, [16, 2, 22, 12, 19, 29, 12, 29, 10, 12], c);
      poly(x, [7, 14, 11, 10, 12, 26, 6, 25], shade(c, 0.85), 1);
      poly(x, [16, 2, 18, 12, 16, 28], shade(c, 1.4), 0.6);
      break;
    case 'blob':
      x.beginPath();
      x.ellipse(16, 18, 11, 8, 0.3, 0, Math.PI * 2);
      paint(x, c);
      break;
    case 'boot':
      // a soggy old boot, sole worn through, dripping
      poly(x, [9, 4, 18, 4, 18, 18, 27, 21, 27, 27, 7, 27, 8, 16], c);
      bar(x, 7, 27, 27, 27, 1.6, shade(c, 0.6));
      bar(x, 10, 9, 17, 9, 0.8, shade(c, 0.7));
      circle(x, 20, 30, 1, '#7ab0e0', 0);
      break;
    case 'shafts':
      // a bundle of bare wooden shafts tied in the middle
      for (let i = 0; i < 5; i++) bar(x, 5 + i * 2.5, 28, 22 + i * 2.5, 4, 1.1, c);
      bar(x, 12, 19, 19, 13, 1.8, '#8a5a32');
      break;
    case 'stock':
      // a crossbow stock: long body, wider butt, a groove on top
      poly(x, [3, 22, 9, 17, 27, 6, 30, 9, 13, 22, 10, 29, 4, 28], c);
      bar(x, 11, 18, 27, 8, 0.6, shade(c, 0.65));
      break;
    case 'hide':
      // a tanned skin, stretched flat, with stitch marks round the edge
      poly(x, [5, 8, 11, 4, 21, 4, 27, 8, 28, 20, 23, 28, 9, 28, 4, 20], c);
      for (const [sx, sy] of [[8, 10], [24, 10], [25, 22], [8, 22], [16, 6], [16, 26]]) circle(x, sx, sy, 0.7, shade(c, 0.55), 0);
      break;
    case 'cutgem':
      // a faceted brilliant: crown, table and pavilion
      glow(x, 16, 15, 14, `${c}88`);
      poly(x, [5, 12, 10, 6, 22, 6, 27, 12, 16, 28], c);
      poly(x, [10, 6, 22, 6, 19, 12, 13, 12], shade(c, 1.45), 0.8);
      bar(x, 5, 12, 27, 12, 0.6, shade(c, 0.7));
      bar(x, 13, 12, 16, 28, 0.5, shade(c, 0.75));
      bar(x, 19, 12, 16, 28, 0.5, shade(c, 0.75));
      break;
    case 'rawmeat':
      // raw red meat with white fat marbling and a bone
      bar(x, 22, 24, 28, 29, 3, '#f0e6c8');
      x.beginPath();
      x.ellipse(13, 13, 10, 8, -0.6, 0, Math.PI * 2);
      paint(x, c);
      bar(x, 7, 15, 17, 9, 0.8, '#f4dcd0');
      bar(x, 10, 19, 19, 13, 0.6, '#f4dcd0');
      break;
    case 'rawfish':
      // a pale, glistening raw fish
      poly(x, [4, 16, 9, 10, 20, 9, 26, 15, 20, 22, 9, 22], c);
      poly(x, [25, 15, 31, 9, 30, 22], shade(c, 0.8));
      circle(x, 9, 15, 1.5, '#121212', 0);
      bar(x, 11, 13, 21, 13, 0.7, 'rgba(255,255,255,0.75)');
      break;
    case 'burnt':
      // a charred lump with a wisp of smoke
      x.beginPath();
      x.ellipse(16, 20, 11, 7, 0.2, 0, Math.PI * 2);
      paint(x, c);
      circle(x, 12, 19, 1.6, '#4a3020', 0);
      circle(x, 20, 21, 1.4, '#4a3020', 0);
      x.beginPath();
      x.moveTo(16, 12);
      x.bezierCurveTo(12, 8, 20, 6, 16, 2);
      x.strokeStyle = 'rgba(160,160,160,0.8)';
      x.lineWidth = 1.4;
      x.stroke();
      break;
    case 'logs':
      // three logs stacked, cut ends showing their rings
      for (const [lx, ly] of [[5, 20], [13, 20], [9, 12]]) {
        x.beginPath();
        x.rect(lx, ly - 4, 14, 8);
        paint(x, c);
        x.beginPath();
        x.ellipse(lx + 14, ly, 3, 4, 0, 0, Math.PI * 2);
        paint(x, shade(c, 1.5), 1);
        circle(x, lx + 14, ly, 1.3, shade(c, 0.8), 0);
      }
      break;
    default:
      glow(x, 16, 16, 15, `${c}99`);
      circle(x, 16, 16, 8, c);
      circle(x, 13.5, 13.5, 2.4, 'rgba(255,255,255,0.8)', 0);
  }
}

function drawAmmo(x: Ctx, d: ItemDef): void {
  const head = d.element === 'fire' ? '#ff7a1a' : d.element === 'earth' ? '#6ad040' : d.element === 'ice' ? '#9fe6ff'
    : d.id === 'onyx_arrow' ? '#3a3a4a' : d.id === 'hawkeye_arrow' ? '#6ad0a0' : d.id === 'piercing_bolt' ? '#a8b0c0'
    : d.id === 'starsteel_arrow' || d.id === 'darkstone_arrow' ? d.tint : '#d8dde6';
  for (let i = 0; i < 3; i++) {
    const o = i * 6 - 6;
    bar(x, 6 + o, 28, 24 + o, 6, 1.4, d.ammoType === 'bolt' ? '#6a5040' : '#c9b28a');
    poly(x, [24 + o, 6, 26 + o, 2, 27.5 + o, 8], head, 1);
    if (d.ammoType === 'arrow') poly(x, [5 + o, 25, 8 + o, 29, 4 + o, 30], '#f0f0f0', 0.8);
  }
}

function draw(x: Ctx, d: ItemDef): void {
  if (drawGear(x, d)) return;
  // festival tokens, sweets and costumes (ui/liveIcons.ts)
  if (drawLiveIcon(x, d)) return;
  if (drawTradeIcon(x, d)) return;
  switch (d.kind) {
    case 'gold': return drawGold(x);
    case 'consumable':
      if (d.id === 'mead') return drawMead(x);
      return d.heal && !d.mana && !d.id.includes('potion') ? drawFood(x, d) : drawPotion(x, d);
    case 'rune': return drawRuneStone(x, d);
    case 'tool': return drawTool(x, d);
    case 'ammo': return drawAmmo(x, d);
    case 'material': return d.id === 'blank_rune' ? drawRuneStone(x, d) : drawMaterial(x, d);
    case 'pet': if (!drawPetIcon(x, d.id)) glyph(x, d.icon, 16, 16, 18, d.tint); return;
    default: glyph(x, d.icon, 16, 16, 18, d.tint);
  }
}

/** Image URL of an item's icon (cached). */
export function itemIcon(id: string): string {
  const key = `i:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const d = ITEMS[id];
  const cv = canvas();
  if (!d || !cv) return '';
  draw(cv.x, d);
  const url = cv.c.toDataURL();
  cache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ spells

const ELEMENT_BG: Record<string, [string, string]> = {
  physical: ['#8a7a6a', '#3a3028'], fire: ['#ff8a2a', '#6a1a08'], energy: ['#c890ff', '#2a104a'], ice: ['#9fe6ff', '#123a5a'],
  earth: ['#7ad04a', '#1a3a10'], death: ['#a050c8', '#1a0a20'], holy: ['#fff0a0', '#6a5010'],
};

function spellLook(sp: SpellDef): { bg: [string, string]; sym: string } {
  if (sp.kind === 'heal' || sp.kind === 'healFriend' || sp.kind === 'massHeal') return { bg: ['#7dff9a', '#0a4a1a'], sym: sp.kind === 'healFriend' ? '✚→' : sp.kind === 'massHeal' ? '✚✚' : '✚' };
  if (sp.kind === 'cure') return { bg: ['#c8f070', '#2a4a0a'], sym: '✙' };
  if (sp.kind === 'conjure') {
    const made = ITEMS[sp.conjure?.item ?? ''];
    if (made?.rune) return { bg: [made.tint, '#2a1a3a'], sym: made.icon };
    if (made?.kind === 'consumable') return { bg: ['#e0b080', '#4a2a10'], sym: '▼' };
    return { bg: ['#d8c8ff', '#2a1a5a'], sym: sp.conjure?.from ? '↟' : '➶' };
  }
  if (sp.kind === 'find') return { bg: ['#f0e0a0', '#3a3010'], sym: '⌖' };
  if (sp.kind === 'rope' || sp.kind === 'levitate') return { bg: ['#c8e0ff', '#1a2a4a'], sym: sp.dir === 'down' ? '⇩' : '⇧' };
  if (sp.kind === 'challenge') return { bg: ['#ff9a7a', '#4a1008'], sym: '!' };
  if (sp.kind === 'illusion') return { bg: ['#e0a0ff', '#2a0a3a'], sym: '◐' };
  if (sp.kind === 'buff') {
    if (sp.buff === 'haste' || sp.buff === 'strongHaste') return { bg: ['#9fe8ff', '#103a4a'], sym: sp.buff === 'strongHaste' ? '»»' : '»' };
    if (sp.buff === 'magicShield') return { bg: ['#7fb2ff', '#101a4a'], sym: '◈' };
    if (sp.buff === 'invisible') return { bg: ['#b8b8d8', '#1a1a2a'], sym: '◌' };
    return { bg: ['#fff2b0', '#5a4a10'], sym: sp.buff === 'light' ? '☀' : '☼' };
  }
  const bg = ELEMENT_BG[sp.element ?? 'physical'] ?? ELEMENT_BG.physical;
  const sym = sp.kind === 'wave' ? '◢' : sp.kind === 'beam' ? '═' : sp.kind === 'selfArea' ? '✷' : sp.element === 'fire' ? '♨' : sp.element === 'energy' ? 'ϟ' : sp.element === 'ice' ? '❄'
    : sp.element === 'earth' ? '♣' : sp.element === 'holy' ? '✦' : sp.element === 'death' ? '☠' : '⚔';
  return { bg, sym };
}

/** Image URL of a spell's icon (cached). */
export function spellIcon(id: SpellId): string {
  const key = `s:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = canvas();
  const sp = SPELLS[id];
  if (!cv || !sp) return '';
  const x = cv.x;
  const { bg, sym } = spellLook(sp);
  const g = x.createRadialGradient(16, 12, 2, 16, 16, 20);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  x.fillStyle = g;
  x.fillRect(1, 1, 30, 30);
  x.strokeStyle = OUT;
  x.lineWidth = 2;
  x.strokeRect(1, 1, 30, 30);
  glyph(x, sym, 16, 16, sym.length > 1 ? 13 : 19, '#ffffff');
  const url = cv.c.toDataURL();
  cache.set(key, url);
  return url;
}
