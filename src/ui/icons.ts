import { ITEMS, type ItemDef } from '../game/inventory/items';
import { SPELLS, type SpellDef, type SpellId } from '../game/magic/spells';
import { BOOTS, HELMETS, LEGS } from '../render/models/humanoid';
import { ARMOR_LOOK, LOOKS, SHIELDS } from '../render/models/weapons';

/**
 * Hand-drawn item and spell icons, painted once on a canvas and cached as
 * image URLs. Drawn in a 32×32 coordinate space at 2× resolution with a dark
 * outline, so they stay readable at any slot size.
 */
const SIZE = 64;
const cache = new Map<string, string>();
const OUT = '#120e0a';

type Ctx = CanvasRenderingContext2D;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

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

// ------------------------------------------------------------------ weapons

function drawWeapon(x: Ctx, d: ItemDef): void {
  const l = LOOKS[d.id] ?? { c: 0xc9d0da };
  const main = hex(l.c);
  const trim = hex(l.t ?? 0x6b7380);
  if (l.g) glow(x, 18, 14, 14, shade(hex(l.g), 1.6).replace('rgb', 'rgba').replace(')', ',0.55)'));
  switch (d.weaponType) {
    case 'sword': {
      const s = l.s ?? 1;
      const tip = 4 + (1 - s) * 8;
      poly(x, [tip, tip, tip + 4, tip - 1, 21, 17, 17, 21, tip - 1, tip + 4], main);
      bar(x, tip + 2, tip + 2, 18, 18, 0.8, shade(main, 1.3));
      bar(x, 15, 23, 23, 15, 2.6, trim);
      bar(x, 21, 21, 26, 26, 2.6, '#5a3a22');
      circle(x, 27, 27, 2, trim);
      break;
    }
    case 'axe': {
      bar(x, 7, 27, 24, 6, 2.6, '#7a5530');
      const twin = d.id === 'double_axe' || d.id === 'demon_reaver';
      poly(x, [18, 6, 22, 2, 29, 8, 29, 16, 24, 14, 20, 10], main);
      if (twin) poly(x, [18, 6, 14, 3, 10, 6, 12, 13, 16, 12], main);
      bar(x, 21, 9, 26, 13, 0.8, shade(main, 1.35));
      circle(x, 21, 9, 1.6, trim);
      break;
    }
    case 'club': {
      bar(x, 6, 27, 20, 12, 2.8, '#7a5530');
      if (d.id === 'war_hammer' || d.id === 'thunder_maul' || d.id === 'stone_maul') {
        poly(x, [14, 6, 22, 1, 30, 9, 22, 14], main);
        bar(x, 17, 6, 23, 3, 0.8, shade(main, 1.35));
        if (d.id === 'thunder_maul') glyph(x, 'ϟ', 22, 8, 9, '#fff27a');
      } else {
        const n = d.id === 'morning_star' ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          poly(x, [22 + Math.cos(a) * 5, 10 + Math.sin(a) * 5, 22 + Math.cos(a + 0.25) * 9, 10 + Math.sin(a + 0.25) * 9, 22 + Math.cos(a + 0.5) * 5, 10 + Math.sin(a + 0.5) * 5], trim, 1);
        }
        circle(x, 22, 10, 6, main);
        circle(x, 20, 8, 1.8, shade(main, 1.4), 0);
      }
      break;
    }
    case 'bow': {
      x.beginPath();
      x.arc(4, 28, 25, -Math.PI / 2 + 0.05, -0.05);
      x.strokeStyle = OUT;
      x.lineWidth = 4.4;
      x.stroke();
      x.strokeStyle = main;
      x.lineWidth = 2.2;
      x.stroke();
      bar(x, 4.5, 3.5, 28.5, 27.5, 0.5, hex(l.t ?? 0xe8e0c6));
      bar(x, 9, 23, 22, 10, 1, '#c9b28a');
      poly(x, [22, 10, 25, 6, 26, 11], '#d8dde6', 1);
      break;
    }
    case 'crossbow':
      bar(x, 6, 26, 24, 8, 3.6, main);
      x.beginPath();
      x.arc(23, 9, 11, Math.PI * 0.25, Math.PI * 1.25);
      x.strokeStyle = OUT;
      x.lineWidth = 4.4;
      x.stroke();
      x.strokeStyle = trim;
      x.lineWidth = 2.2;
      x.stroke();
      bar(x, 15, 1, 31, 17, 0.5, '#e8e0c6');
      break;
    case 'throwing':
      if (d.id.endsWith('_star')) {
        poly(x, [16, 2, 19, 13, 30, 16, 19, 19, 16, 30, 13, 19, 2, 16, 13, 13], main);
        circle(x, 16, 16, 2.4, trim);
      } else {
        bar(x, 4, 28, 23, 9, 2.2, trim);
        poly(x, [21, 11, 21, 6, 29, 3, 26, 11], main);
        if (d.id === 'royal_spear') poly(x, [17, 13, 15, 11, 19, 15], '#e0b03c', 1);
      }
      break;
    case 'wand':
      bar(x, 7, 26, 21, 12, 2.4, trim);
      glow(x, 23, 9, 9, shade(main, 1.2).replace('rgb', 'rgba').replace(')', ',0.7)'));
      circle(x, 23, 9, 4.2, main);
      circle(x, 22, 8, 1.4, '#ffffff', 0);
      break;
    case 'rod':
      bar(x, 4, 29, 21, 12, 2.4, trim);
      bar(x, 21, 12, 27, 8, 1.6, trim);
      glow(x, 23, 8, 10, shade(main, 1.2).replace('rgb', 'rgba').replace(')', ',0.7)'));
      circle(x, 23, 8, 5, main);
      circle(x, 21.5, 6.5, 1.6, '#ffffff', 0);
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ armour

function drawShield(x: Ctx, d: ItemDef): void {
  const s = SHIELDS[d.id];
  const face = hex(s?.face ?? 0x8a5a2c);
  const rim = hex(s?.rim ?? 0x6b7380);
  const boss = hex(s?.boss ?? 0xc9d0da);
  switch (s?.shape) {
    case 'round':
      circle(x, 16, 16, 13, rim);
      circle(x, 16, 16, 10.5, face, 1);
      for (const a of [0, Math.PI / 2]) bar(x, 16 + Math.cos(a) * 10, 16 + Math.sin(a) * 10, 16 - Math.cos(a) * 10, 16 - Math.sin(a) * 10, 1, shade(face, 0.7));
      circle(x, 16, 16, 3.5, boss);
      break;
    case 'tower':
      poly(x, [5, 3, 27, 3, 27, 24, 16, 30, 5, 24], rim);
      poly(x, [8, 6, 24, 6, 24, 22, 16, 27, 8, 22], face, 1);
      circle(x, 16, 15, 3, boss);
      break;
    case 'book':
      rect(x, 6, 4, 21, 25, face);
      rect(x, 9, 6, 16, 21, '#efe6cf', 1);
      bar(x, 7, 4, 7, 29, 2, rim);
      glyph(x, '✦', 17, 16, 10, rim);
      break;
    default:
      poly(x, [4, 4, 28, 4, 27, 17, 16, 30, 5, 17], rim);
      poly(x, [7, 7, 25, 7, 24, 16, 16, 26, 8, 16], face, 1);
      bar(x, 16, 8, 16, 24, 2, boss);
      bar(x, 9, 13, 23, 13, 2, boss);
  }
}

function drawHelmet(x: Ctx, d: ItemDef): void {
  const h = HELMETS[d.id];
  const c = hex(h?.color ?? 0x8a5a32);
  const t = hex(h?.trim ?? 0x3a3028);
  switch (h?.shape) {
    case 'circlet':
      x.beginPath();
      x.ellipse(16, 18, 12, 6, 0, 0, Math.PI * 2);
      x.strokeStyle = OUT;
      x.lineWidth = 5;
      x.stroke();
      x.strokeStyle = c;
      x.lineWidth = 2.6;
      x.stroke();
      poly(x, [16, 6, 20, 12, 16, 15, 12, 12], t);
      return;
    case 'horned':
      poly(x, [7, 16, 2, 4, 6, 6, 10, 13], '#e8dcc0');
      poly(x, [25, 16, 30, 4, 26, 6, 22, 13], '#e8dcc0');
      break;
    case 'crested':
      poly(x, [9, 8, 16, 1, 23, 8, 16, 6], t);
      break;
    case 'winged':
      poly(x, [6, 14, 1, 5, 4, 4, 9, 11], t);
      poly(x, [26, 14, 31, 5, 28, 4, 23, 11], t);
      break;
    default:
      break;
  }
  x.beginPath();
  x.moveTo(5, 24);
  x.bezierCurveTo(5, 6, 27, 6, 27, 24);
  x.closePath();
  paint(x, c);
  bar(x, 9, 12, 13, 9, 1, shade(c, 1.4));
  if (h?.shape === 'cap') rect(x, 4, 21, 24, 4, t);
  else if (h?.shape === 'coif') rect(x, 5, 22, 22, 6, c);
  else {
    rect(x, 4, 21, 24, 5, t);
    rect(x, 9, 15, 14, 3, '#1a1612', 1);
  }
}

function drawArmor(x: Ctx, d: ItemDef): void {
  const look = ARMOR_LOOK[d.id];
  const c = hex(look?.color ?? 0x8a5a32);
  const robe = d.id.includes('robe');
  if (robe) {
    poly(x, [10, 3, 22, 3, 27, 8, 24, 12, 23, 29, 9, 29, 8, 12, 5, 8], c);
    bar(x, 16, 5, 16, 28, 2, '#e0c060');
    return;
  }
  poly(x, [9, 3, 23, 3, 30, 8, 27, 15, 24, 13, 24, 28, 8, 28, 8, 13, 5, 15, 2, 8], c);
  poly(x, [12, 3, 20, 3, 16, 8], shade(c, 0.6), 1);
  if (look?.plate) {
    bar(x, 11, 13, 21, 13, 1, shade(c, 0.7));
    bar(x, 11, 19, 21, 19, 1, shade(c, 0.7));
    bar(x, 12, 9, 14, 7, 1, shade(c, 1.45));
  } else {
    for (let yy = 12; yy < 27; yy += 4) bar(x, 10, yy, 22, yy, 0.6, shade(c, 0.75));
  }
}

function drawLegs(x: Ctx, d: ItemDef): void {
  const c = hex(LEGS[d.id] ?? 0x8a5a32);
  poly(x, [7, 3, 25, 3, 26, 29, 18, 29, 16, 12, 14, 29, 6, 29], c);
  rect(x, 7, 3, 18, 4, shade(c, 0.65), 1);
  bar(x, 9, 18, 13, 18, 1.2, shade(c, 1.35));
  bar(x, 19, 18, 23, 18, 1.2, shade(c, 1.35));
}

function drawBoots(x: Ctx, d: ItemDef): void {
  const c = hex(BOOTS[d.id] ?? 0x6a4426);
  const boot = (ox: number) => poly(x, [ox, 4, ox + 7, 4, ox + 7, 20, ox + 12, 23, ox + 12, 28, ox - 1, 28, ox, 20], c);
  boot(4);
  boot(16);
  if (d.id === 'windstride_boots') glyph(x, '≈', 16, 12, 10, '#ffffff');
  if (d.id === 'emberwalk_boots') glyph(x, '♨', 16, 12, 9, '#ffd84a');
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

/** Short labels so every rune can be told apart at a glance (also on the action bar). */
const RUNE_LABEL: Record<string, string> = {
  spark_rune: 'SPRK', fireball_rune: 'FIRE', avalanche_rune: 'AVA', stoneshower_rune: 'STON', death_rune: 'DEATH',
  healing_rune: 'MEND', blank_rune: '', thunderbolt_rune: 'BOLT', ember_rune: 'EMBR', icicle_rune: 'ICE', rockspike_rune: 'ROCK',
  stormcloud_rune: 'STRM', blast_rune: 'BLST', sunlance_rune: 'SUN', soothing_rune: 'HEAL', antidote_rune: 'CURE', snare_rune: 'SNAR',
  flame_field_rune: 'FF', static_field_rune: 'EF', venom_field_rune: 'PF', firebloom_rune: 'FB', stormbloom_rune: 'EB', venombloom_rune: 'PB',
  flame_barrier_rune: 'FW', static_barrier_rune: 'EW', venom_barrier_rune: 'PW', arcane_wall_rune: 'MW', dispel_rune: 'DISP',
};

const RUNE_COLORS: Record<string, [string, string]> = {
  fire: ['#ff7a1a', '#5a1404'], energy: ['#b070ff', '#240a4a'], ice: ['#7fdcff', '#0a2e4a'], earth: ['#6ad040', '#123208'],
  death: ['#9a50c8', '#180820'], holy: ['#ffe680', '#5a4008'], physical: ['#d8c8a0', '#3a3020'],
};

/** Big clear pictogram per rune family, drawn with shapes (no font symbols). */
function runeSymbol(x: Ctx, d: ItemDef, c: string): void {
  const r = d.rune;
  const id = d.id;
  const W = '#ffffff';
  if (!r) return;
  if (id === 'arcane_wall_rune') {
    // brick wall
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
      const ox = 6 + i * 7 + (row % 2 ? 3.5 : 0) - (row % 2 && i === 2 ? 7 : 0);
      rect(x, ox, 6 + row * 5, 6, 4, row % 2 && i === 2 ? c : W, 1);
    }
    return;
  }
  if (r.type === 'field') {
    if (r.shape === 'wall') { for (let i = 0; i < 3; i++) rect(x, 6 + i * 7, 7, 5, 13, W, 1); return; }
    if (r.shape === 'bomb') { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) rect(x, 7 + xx * 6, 6 + yy * 5, 5, 4, W, 1); return; }
    rect(x, 10, 7, 12, 11, W, 1.2);
    return;
  }
  if (r.type === 'heal' || r.type === 'cure') {
    rect(x, 13, 5, 6, 16, W, 1.2);
    rect(x, 8, 10, 16, 6, W, 1.2);
    return;
  }
  if (r.type === 'paralyze') { circle(x, 16, 13, 7, 'rgba(0,0,0,0)', 0); x.lineWidth = 3; x.strokeStyle = W; x.beginPath(); x.arc(16, 13, 6.5, 0, Math.PI * 2); x.stroke(); bar(x, 11, 8, 21, 18, 2.4, W); return; }
  if (r.type === 'destroyField') { x.lineWidth = 3; x.strokeStyle = W; x.beginPath(); x.arc(16, 13, 6.5, 0, Math.PI * 2); x.stroke(); bar(x, 11, 18, 21, 8, 2.4, W); return; }
  if (r.element === 'death') {
    // skull
    circle(x, 16, 11, 6.5, W, 1);
    rect(x, 12.5, 15, 7, 4, W, 0);
    circle(x, 13.5, 11, 1.8, '#180820', 0);
    circle(x, 18.5, 11, 1.8, '#180820', 0);
    return;
  }
  if (r.radius > 0) {
    // area burst: rays around a core
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bar(x, 16 + Math.cos(a) * 3, 13 + Math.sin(a) * 3, 16 + Math.cos(a) * 9, 13 + Math.sin(a) * 8, 1.8, W);
    }
    circle(x, 16, 13, 3.6, W, 1);
    return;
  }
  // single target: a missile / bolt
  if (r.element === 'energy') { poly(x, [18, 4, 10, 14, 15, 14, 12, 22, 22, 11, 17, 11], W, 1); return; }
  if (r.element === 'ice') { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; bar(x, 16 - Math.cos(a) * 8, 13 - Math.sin(a) * 8, 16 + Math.cos(a) * 8, 13 + Math.sin(a) * 8, 2, W); } return; }
  if (r.element === 'earth') { poly(x, [8, 21, 16, 5, 24, 21], W, 1); return; }
  if (r.element === 'holy') { poly(x, [16, 4, 19, 11, 26, 13, 19, 15, 16, 22, 13, 15, 6, 13, 13, 11], W, 1); return; }
  // fire and others: a flame / orb
  x.beginPath();
  x.moveTo(16, 4);
  x.quadraticCurveTo(24, 12, 21, 18);
  x.quadraticCurveTo(16, 23, 11, 18);
  x.quadraticCurveTo(8, 12, 16, 4);
  paint(x, W);
}

function drawRune(x: Ctx, d: ItemDef): void {
  const r = d.rune;
  const el = r?.type === 'heal' || r?.type === 'cure' ? 'heal' : r?.element ?? 'physical';
  const [light, dark] = el === 'heal' ? ['#5ae07a', '#0a3a18'] as [string, string] : RUNE_COLORS[el] ?? RUNE_COLORS.physical;
  const blank = d.id === 'blank_rune';
  // the stone: solid element colour, dark rim, bevel
  x.beginPath();
  x.moveTo(7, 2); x.lineTo(25, 2); x.quadraticCurveTo(30, 2, 30, 7); x.lineTo(30, 25); x.quadraticCurveTo(30, 30, 25, 30);
  x.lineTo(7, 30); x.quadraticCurveTo(2, 30, 2, 25); x.lineTo(2, 7); x.quadraticCurveTo(2, 2, 7, 2); x.closePath();
  if (blank) { paint(x, '#9a9080'); rect(x, 6, 6, 20, 20, '#7e7666', 0.8); return; }
  const g = x.createLinearGradient(0, 2, 0, 30);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  x.fillStyle = g;
  x.fill();
  x.lineWidth = 1.6;
  x.strokeStyle = '#0b0805';
  x.stroke();
  rect(x, 4, 4, 24, 1.2, 'rgba(255,255,255,0.35)', 0);
  // pictogram on a dark plate so it pops
  x.fillStyle = 'rgba(0,0,0,0.35)';
  x.fillRect(5, 4, 22, 19);
  runeSymbol(x, d, dark);
  // short name strip
  const label = RUNE_LABEL[d.id] ?? d.name.slice(0, 4).toUpperCase();
  if (label) {
    x.fillStyle = '#0b0805';
    x.fillRect(3, 22.5, 26, 7);
    x.font = `900 ${label.length > 4 ? 5.6 : 6.8}px Verdana, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#ffffff';
    x.fillText(label, 16, 26.3);
  }
}

function drawBackpack(x: Ctx, d: ItemDef): void {
  const c = d.id === 'dragonhide_pack' ? '#a8281f' : d.id === 'explorer_pack' ? '#4a6a3a' : d.id === 'bag' ? '#a8743f'
    : d.id.startsWith('fur_') ? '#d8ccb4' : '#8a5a32';
  if (d.id !== 'bag' && d.id !== 'fur_bag') bar(x, 10, 10, 10, 4, 1.6, '#5a3a22');
  x.beginPath();
  x.moveTo(6, 12);
  x.quadraticCurveTo(16, 4, 26, 12);
  x.lineTo(27, 27);
  x.quadraticCurveTo(16, 31, 5, 27);
  x.closePath();
  paint(x, c);
  poly(x, [7, 12, 25, 12, 24, 19, 8, 19], shade(c, 0.75), 1);
  circle(x, 16, 19, 1.6, '#e0b03c', 1);
  if (d.id.startsWith('fur_')) for (let i = 0; i < 4; i++) bar(x, 9 + i * 5, 21, 8 + i * 5, 26, 0.6, '#a89878');
}

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
  crocodile_leather: ['pelt', '#5a7a3a'], spider_silk: ['spiral', '#f0f0f0'], troll_hair: ['pelt', '#3a4a2a'], hydra_head: ['head', '#2f7a5a'],
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
};

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
      poly(x, [5, 20, 9, 9, 18, 5, 27, 11, 28, 22, 18, 28, 8, 27], c);
      for (const [cx, cy] of [[12, 14], [20, 18], [15, 22]]) circle(x, cx, cy, 2, '#d8d0c8', 0);
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

function drawJewel(x: Ctx, d: ItemDef): void {
  const gem = d.bonus?.resist?.fire ? '#e8243a' : d.bonus?.resist?.ice || d.bonus?.manaRegen ? '#3a8ae8' : d.bonus?.resist?.earth ? '#24c060'
    : d.bonus?.light ? '#ffd84a' : d.bonus?.speed ? '#9fe8ff' : d.bonus?.attack ? '#c0281f' : d.bonus?.hpRegen ? '#ff6a8a' : d.tint;
  if (d.kind === 'ring') {
    x.beginPath();
    x.ellipse(16, 20, 9, 7, 0, 0, Math.PI * 2);
    x.strokeStyle = OUT;
    x.lineWidth = 5.4;
    x.stroke();
    x.strokeStyle = '#e8b923';
    x.lineWidth = 3;
    x.stroke();
    glow(x, 16, 11, 9, `${gem}aa`);
    poly(x, [16, 6, 21, 11, 16, 16, 11, 11], gem);
    return;
  }
  x.beginPath();
  x.moveTo(5, 3);
  x.quadraticCurveTo(16, 22, 27, 3);
  x.strokeStyle = OUT;
  x.lineWidth = 3.6;
  x.stroke();
  x.strokeStyle = '#d8c070';
  x.lineWidth = 1.6;
  x.stroke();
  glow(x, 16, 21, 11, `${gem}aa`);
  if (d.id === 'demonbone_amulet') {
    circle(x, 16, 21, 7, '#efe6cc');
    glyph(x, '☠', 16, 21, 9, '#5a1010');
  } else {
    circle(x, 16, 21, 6.5, '#e8b923');
    circle(x, 16, 21, 4, gem, 1);
  }
}

function drawAmmo(x: Ctx, d: ItemDef): void {
  const head = d.element === 'fire' ? '#ff7a1a' : d.element === 'earth' ? '#6ad040' : d.element === 'ice' ? '#9fe6ff'
    : d.id === 'onyx_arrow' ? '#3a3a4a' : d.id === 'hawkeye_arrow' ? '#6ad0a0' : d.id === 'piercing_bolt' ? '#a8b0c0' : '#d8dde6';
  for (let i = 0; i < 3; i++) {
    const o = i * 6 - 6;
    bar(x, 6 + o, 28, 24 + o, 6, 1.4, d.ammoType === 'bolt' ? '#6a5040' : '#c9b28a');
    poly(x, [24 + o, 6, 26 + o, 2, 27.5 + o, 8], head, 1);
    if (d.ammoType === 'arrow') poly(x, [5 + o, 25, 8 + o, 29, 4 + o, 30], '#f0f0f0', 0.8);
  }
}

function draw(x: Ctx, d: ItemDef): void {
  if (d.weaponType) return drawWeapon(x, d);
  switch (d.kind) {
    case 'gold': return drawGold(x);
    case 'consumable':
      if (d.id === 'mead') return drawMead(x);
      return d.heal && !d.mana && !d.id.includes('potion') ? drawFood(x, d) : drawPotion(x, d);
    case 'rune': return drawRune(x, d);
    case 'tool': return drawTool(x, d);
    case 'shield': return drawShield(x, d);
    case 'helmet': return drawHelmet(x, d);
    case 'armor': return drawArmor(x, d);
    case 'legs': return drawLegs(x, d);
    case 'boots': return drawBoots(x, d);
    case 'amulet':
    case 'ring': return drawJewel(x, d);
    case 'backpack': return drawBackpack(x, d);
    case 'ammo': return drawAmmo(x, d);
    case 'material': return d.id === 'blank_rune' ? drawRune(x, d) : drawMaterial(x, d);
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
