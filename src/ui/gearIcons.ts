import type { ItemDef } from '../game/inventory/items';
import { css, gearLook, MAT, rampOf, type Emblem, type GearLook, type Ramp } from '../render/models/gearLooks';
import { BOOTS, HELMETS, LEGS } from '../render/models/humanoid';
import { ARMOR_LOOK, LOOKS, SHIELDS, weaponStyle } from '../render/models/weapons';

/**
 * Detailed equipment icons: metal gradients with specular highlights, dark
 * outlines, rivets, trims, engravings, leather straps and glowing gems. Drawn
 * in a 32×32 space on the 64-px icon canvas (see icons.ts). Every item kind has
 * its own silhouette; tiers differ by material, trim and ornament.
 */
type Ctx = CanvasRenderingContext2D;
const OUT = '#0d0906';
const DARK = '#160f0a';

// ------------------------------------------------------------------ primitives

function rgba(n: number, a: number): string {
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Metal gradient along a line: highlight → base → shadow. */
function grad(x: Ctx, r: Ramp, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, css(r[0]));
  g.addColorStop(0.42, css(r[1]));
  g.addColorStop(1, css(r[2]));
  return g;
}

/** Polished metal: two highlight bands, like light on a curved plate. */
function polish(x: Ctx, r: Ramp, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, css(r[1]));
  g.addColorStop(0.18, css(r[0]));
  g.addColorStop(0.34, css(r[1]));
  g.addColorStop(0.7, css(r[2]));
  g.addColorStop(0.86, css(r[1]));
  g.addColorStop(1, css(r[2]));
  return g;
}

function radial(x: Ctx, r: Ramp, cx: number, cy: number, rad: number): CanvasGradient {
  const g = x.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.05, cx, cy, rad);
  g.addColorStop(0, css(r[0]));
  g.addColorStop(0.5, css(r[1]));
  g.addColorStop(1, css(r[2]));
  return g;
}

function pts(x: Ctx, p: number[]): void {
  x.beginPath();
  x.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
  x.closePath();
}

/** Fill a path, optionally decorate inside it (clipped), then outline it. */
function part(x: Ctx, build: () => void, fill: string | CanvasGradient, decorate?: () => void, line = 1.1): void {
  build();
  x.fillStyle = fill;
  x.fill();
  if (decorate) {
    x.save();
    build();
    x.clip();
    decorate();
    x.restore();
  }
  build();
  x.lineWidth = line;
  x.strokeStyle = OUT;
  x.stroke();
}

function line(x: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x1, y1);
  x.lineWidth = w;
  x.strokeStyle = color;
  x.stroke();
}

/** A thick outlined bar (hafts, grips, straps). */
function rod(x: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, fill: string | CanvasGradient): void {
  line(x, x0, y0, x1, y1, w + 2, OUT);
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x1, y1);
  x.lineWidth = w;
  x.strokeStyle = fill;
  x.stroke();
}

/** Volume: light on the left, shade on the right, over the current clip. */
function volume(x: Ctx, a = 0.32, b = 0.38): void {
  const g = x.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${b})`);
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
}

function shine(x: Ctx, p: number[], w = 0.9, a = 0.75): void {
  x.beginPath();
  x.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]);
  x.lineWidth = w;
  x.strokeStyle = `rgba(255,255,255,${a})`;
  x.stroke();
}

function rivet(x: Ctx, cx: number, cy: number, r: number, m: Ramp): void {
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = radial(x, m, cx, cy, r);
  x.fill();
  x.lineWidth = 0.45;
  x.strokeStyle = OUT;
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fillRect(cx - r * 0.45, cy - r * 0.55, r * 0.45, r * 0.4);
}

function glowAt(x: Ctx, cx: number, cy: number, r: number, color: number, a = 0.6): void {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** A cut gem with a glow, a facet and a sparkle. */
function gem(x: Ctx, cx: number, cy: number, r: number, color: number, cut: 'round' | 'diamond' | 'oval' = 'round'): void {
  glowAt(x, cx, cy, r * 3.2, color, 0.55);
  const ramp = rampOf(color);
  const shape = () => {
    x.beginPath();
    if (cut === 'diamond') { x.moveTo(cx, cy - r * 1.3); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r * 1.3); x.lineTo(cx - r, cy); x.closePath(); } else if (cut === 'oval') x.ellipse(cx, cy, r * 0.8, r * 1.2, 0, 0, Math.PI * 2);
    else x.arc(cx, cy, r, 0, Math.PI * 2);
  };
  shape();
  const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.3);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, css(ramp[0]));
  g.addColorStop(0.7, css(color));
  g.addColorStop(1, css(ramp[2]));
  x.fillStyle = g;
  x.fill();
  x.lineWidth = 0.6;
  x.strokeStyle = OUT;
  x.stroke();
  line(x, cx - r * 0.5, cy + r * 0.2, cx + r * 0.3, cy - r * 0.5, 0.35, 'rgba(255,255,255,0.6)');
  x.fillStyle = '#ffffff';
  x.fillRect(cx - r * 0.55, cy - r * 0.6, Math.max(0.6, r * 0.38), Math.max(0.6, r * 0.38));
}

/** Leather strap with stitching. */
function strap(x: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, r: Ramp = MAT.leather): void {
  rod(x, x0, y0, x1, y1, w, css(r[1]));
  x.setLineDash([0.8, 0.9]);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w * 0.3), ny = (dx / len) * (w * 0.3);
  line(x, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 0.35, css(r[0]));
  line(x, x0 - nx, y0 - ny, x1 - nx, y1 - ny, 0.35, css(r[0]));
  x.setLineDash([]);
}

function buckle(x: Ctx, cx: number, cy: number, w: number, h: number, m: Ramp): void {
  part(x, () => { x.beginPath(); x.rect(cx - w / 2, cy - h / 2, w, h); }, grad(x, m, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), undefined, 0.8);
  x.fillStyle = DARK;
  x.fillRect(cx - w / 2 + 0.8, cy - h / 2 + 0.8, w - 1.6, h - 1.6);
  line(x, cx, cy - h / 2 + 0.6, cx, cy + h / 2 - 0.6, 0.6, css(m[0]));
}

// ------------------------------------------------------------------ emblems

function emblem(x: Ctx, e: Emblem, cx: number, cy: number, s: number, t: Ramp, gemColor?: number): void {
  const g = grad(x, t, cx - s, cy - s, cx + s, cy + s);
  switch (e) {
    case 'cross':
      part(x, () => pts(x, [cx - s * 0.28, cy - s, cx + s * 0.28, cy - s, cx + s * 0.28, cy - s * 0.28, cx + s * 0.8, cy - s * 0.28, cx + s * 0.8, cy + s * 0.28, cx + s * 0.28, cy + s * 0.28,
        cx + s * 0.28, cy + s * 1.1, cx - s * 0.28, cy + s * 1.1, cx - s * 0.28, cy + s * 0.28, cx - s * 0.8, cy + s * 0.28, cx - s * 0.8, cy - s * 0.28, cx - s * 0.28, cy - s * 0.28]), g, undefined, 0.8);
      break;
    case 'crown':
      part(x, () => pts(x, [cx - s, cy + s * 0.6, cx - s, cy - s * 0.4, cx - s * 0.5, cy + s * 0.1, cx, cy - s * 0.8, cx + s * 0.5, cy + s * 0.1, cx + s, cy - s * 0.4, cx + s, cy + s * 0.6]), g, undefined, 0.8);
      if (gemColor) gem(x, cx, cy + s * 0.2, s * 0.25, gemColor);
      break;
    case 'star': {
      const p: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? s * 0.42 : s;
        p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      if (gemColor) glowAt(x, cx, cy, s * 1.8, gemColor, 0.45);
      part(x, () => pts(x, p), g, undefined, 0.8);
      break;
    }
    case 'moon':
      if (gemColor) glowAt(x, cx, cy, s * 1.8, gemColor, 0.4);
      part(x, () => { x.beginPath(); x.arc(cx, cy, s, Math.PI * 0.3, Math.PI * 1.7); x.arc(cx + s * 0.45, cy, s * 0.75, Math.PI * 1.6, Math.PI * 0.4, true); x.closePath(); }, g, undefined, 0.8);
      break;
    case 'sun':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        part(x, () => pts(x, [cx + Math.cos(a - 0.22) * s * 0.55, cy + Math.sin(a - 0.22) * s * 0.55, cx + Math.cos(a) * s * 1.1, cy + Math.sin(a) * s * 1.1, cx + Math.cos(a + 0.22) * s * 0.55, cy + Math.sin(a + 0.22) * s * 0.55]), g, undefined, 0.6);
      }
      part(x, () => { x.beginPath(); x.arc(cx, cy, s * 0.55, 0, Math.PI * 2); }, radial(x, t, cx, cy, s * 0.55), undefined, 0.7);
      if (gemColor) gem(x, cx, cy, s * 0.28, gemColor);
      break;
    case 'flake':
      if (gemColor) glowAt(x, cx, cy, s * 1.8, gemColor, 0.5);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * s, dy = Math.sin(a) * s;
        rod(x, cx - dx, cy - dy, cx + dx, cy + dy, 0.9, css(t[0]));
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bx = cx + Math.cos(a) * s * 0.6, by = cy + Math.sin(a) * s * 0.6;
        line(x, bx, by, bx + Math.cos(a + 0.8) * s * 0.3, by + Math.sin(a + 0.8) * s * 0.3, 0.6, css(t[0]));
        line(x, bx, by, bx + Math.cos(a - 0.8) * s * 0.3, by + Math.sin(a - 0.8) * s * 0.3, 0.6, css(t[0]));
      }
      break;
    case 'flame':
      glowAt(x, cx, cy, s * 2, 0xff6a10, 0.55);
      part(x, () => { x.beginPath(); x.moveTo(cx, cy - s * 1.2); x.quadraticCurveTo(cx + s * 1.1, cy - s * 0.1, cx + s * 0.6, cy + s * 0.8); x.quadraticCurveTo(cx, cy + s * 1.2, cx - s * 0.6, cy + s * 0.8); x.quadraticCurveTo(cx - s * 1.1, cy - s * 0.1, cx, cy - s * 1.2); }, grad(x, [0xfff2a0, 0xff8a1a, 0xc02a08, 0x400800], cx, cy - s, cx, cy + s), undefined, 0.7);
      part(x, () => { x.beginPath(); x.moveTo(cx, cy - s * 0.2); x.quadraticCurveTo(cx + s * 0.5, cy + s * 0.4, cx, cy + s * 0.85); x.quadraticCurveTo(cx - s * 0.5, cy + s * 0.4, cx, cy - s * 0.2); }, '#fff2a0', undefined, 0);
      break;
    case 'skull':
      part(x, () => { x.beginPath(); x.arc(cx, cy - s * 0.15, s * 0.8, Math.PI, 0); x.lineTo(cx + s * 0.55, cy + s * 0.75); x.lineTo(cx - s * 0.55, cy + s * 0.75); x.closePath(); }, radial(x, MAT.bone, cx, cy, s), undefined, 0.7);
      x.fillStyle = DARK;
      x.beginPath(); x.ellipse(cx - s * 0.32, cy, s * 0.22, s * 0.26, 0, 0, Math.PI * 2); x.ellipse(cx + s * 0.32, cy, s * 0.22, s * 0.26, 0, 0, Math.PI * 2); x.fill();
      if (gemColor) { glowAt(x, cx - s * 0.32, cy, s * 0.5, gemColor, 0.8); glowAt(x, cx + s * 0.32, cy, s * 0.5, gemColor, 0.8); }
      for (let i = -1; i <= 1; i++) line(x, cx + i * s * 0.22, cy + s * 0.5, cx + i * s * 0.22, cy + s * 0.75, 0.4, DARK);
      break;
    case 'dragon':
      // a dragon wing: three ribs and a scalloped membrane
      part(x, () => { x.beginPath(); x.moveTo(cx - s, cy + s * 0.6); x.lineTo(cx - s * 0.2, cy - s); x.lineTo(cx + s, cy - s * 0.6); x.quadraticCurveTo(cx + s * 0.5, cy - s * 0.1, cx + s * 0.7, cy + s * 0.3); x.quadraticCurveTo(cx + s * 0.1, cy + s * 0.1, cx + s * 0.1, cy + s * 0.7); x.quadraticCurveTo(cx - s * 0.4, cy + s * 0.3, cx - s, cy + s * 0.6); }, g, () => {
        line(x, cx - s * 0.2, cy - s, cx + s * 0.7, cy + s * 0.3, 0.5, css(t[2]));
        line(x, cx - s * 0.2, cy - s, cx + s * 0.1, cy + s * 0.7, 0.5, css(t[2]));
      }, 0.7);
      if (gemColor) gem(x, cx - s * 0.2, cy - s * 0.85, s * 0.2, gemColor);
      break;
    case 'leaf':
      part(x, () => { x.beginPath(); x.moveTo(cx, cy - s * 1.1); x.quadraticCurveTo(cx + s * 0.9, cy, cx, cy + s * 1.1); x.quadraticCurveTo(cx - s * 0.9, cy, cx, cy - s * 1.1); }, g, () => {
        line(x, cx, cy - s, cx, cy + s, 0.45, css(t[2]));
        for (let i = -1; i <= 1; i++) { line(x, cx, cy + i * s * 0.4, cx + s * 0.4, cy + i * s * 0.4 - s * 0.3, 0.35, css(t[2])); line(x, cx, cy + i * s * 0.4, cx - s * 0.4, cy + i * s * 0.4 - s * 0.3, 0.35, css(t[2])); }
      }, 0.7);
      break;
    case 'eye':
      part(x, () => { x.beginPath(); x.moveTo(cx - s, cy); x.quadraticCurveTo(cx, cy - s * 0.9, cx + s, cy); x.quadraticCurveTo(cx, cy + s * 0.9, cx - s, cy); }, g, undefined, 0.7);
      gem(x, cx, cy, s * 0.38, gemColor ?? 0xff3a20);
      break;
    case 'bar':
      rod(x, cx - s, cy, cx + s, cy, s * 0.4, grad(x, t, cx - s, cy - 1, cx + s, cy + 1));
      rod(x, cx, cy - s * 1.1, cx, cy + s * 1.1, s * 0.4, grad(x, t, cx - 1, cy - s, cx + 1, cy + s));
      rivet(x, cx, cy, s * 0.3, t);
      break;
    case 'beard': {
      // a little anvil: the mark of the mountain smiths
      part(x, () => pts(x, [cx - s, cy - s * 0.5, cx + s, cy - s * 0.5, cx + s * 0.6, cy, cx + s * 0.25, cy, cx + s * 0.45, cy + s * 0.7, cx - s * 0.45, cy + s * 0.7, cx - s * 0.25, cy, cx - s * 0.6, cy]), g, undefined, 0.7);
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------ helmets

const helmCache = (d: ItemDef): GearLook => {
  const h = HELMETS[d.id];
  return gearLook(d, h?.color, h?.trim);
};

function dome(x: Ctx, l: number, r: number, top: number, bottom: number): void {
  x.beginPath();
  x.moveTo(l, bottom);
  x.lineTo(l, top + 9);
  x.bezierCurveTo(l, top - 2, r, top - 2, r, top + 9);
  x.lineTo(r, bottom);
  x.quadraticCurveTo(16, bottom + 1.5, l, bottom);
  x.closePath();
}

function horns(x: Ctx, lk: GearLook, y: number): void {
  const hr = lk.spikes ? lk.t : MAT.bone;
  for (const s of [-1, 1]) {
    const bx = 16 + s * 9.5;
    part(x, () => { x.beginPath(); x.moveTo(bx, y + 3); x.quadraticCurveTo(16 + s * 16.5, y + 1, 16 + s * 14.5, y - 10); x.quadraticCurveTo(16 + s * 13.5, y - 3, bx - s * 0.5, y - 1.5); x.closePath(); }, grad(x, hr, bx - 4, y - 8, bx + 4, y + 4), () => {
      for (let i = 1; i < 4; i++) line(x, 16 + s * (11 + i * 1.2), y + 2 - i * 2.4, 16 + s * (10 + i * 1.1), y - i * 2.4, 0.4, css(hr[2]));
    }, 0.9);
  }
}

function wings(x: Ctx, lk: GearLook, y: number): void {
  for (const s of [-1, 1]) {
    const bx = 16 + s * 9;
    part(x, () => { x.beginPath(); x.moveTo(bx, y + 4); x.lineTo(16 + s * 15.5, y - 7); x.lineTo(16 + s * 13.5, y - 3); x.lineTo(16 + s * 15, y - 1); x.lineTo(16 + s * 12.5, y + 1); x.lineTo(16 + s * 13.5, y + 3); x.closePath(); }, grad(x, lk.t, bx, y - 6, bx + s * 6, y + 4), () => {
      line(x, bx, y + 3, 16 + s * 14.5, y - 5, 0.4, css(lk.t[2]));
      line(x, bx, y + 3.5, 16 + s * 13, y, 0.4, css(lk.t[2]));
    }, 0.8);
  }
}

function drawHelmet(x: Ctx, d: ItemDef): void {
  const lk = helmCache(d);
  const m = lk.m, t = lk.t;
  const tier = lk.tier;
  const style = lk.helm;
  if (lk.horns && (style === 'horned' || style === 'great' || style === 'med')) horns(x, lk, 13);
  if (style === 'winged') wings(x, lk, 13);
  switch (style) {
    case 'circlet': {
      // a band seen from the front with a raised centrepiece
      for (const [w, c] of [[4.2, OUT], [2.6, null]] as Array<[number, string | null]>) {
        x.beginPath();
        x.ellipse(16, 19, 12, 5, 0, 0, Math.PI * 2);
        x.lineWidth = w;
        x.strokeStyle = c ?? polish(x, m, 4, 0, 28, 0);
        x.stroke();
      }
      shine(x, [7, 17, 11, 15.2], 0.6, 0.8);
      part(x, () => { x.beginPath(); x.moveTo(16, 6); x.quadraticCurveTo(21, 12, 19.5, 15.5); x.lineTo(12.5, 15.5); x.quadraticCurveTo(11, 12, 16, 6); }, grad(x, t, 12, 6, 20, 16), () => {
        line(x, 16, 7, 16, 15, 0.4, css(t[2]));
      }, 0.8);
      gem(x, 16, 13, 2.1, lk.gem ?? 0x7ad08a, 'diamond');
      gem(x, 6.5, 19.5, 1, lk.gem ?? 0x7ad08a);
      gem(x, 25.5, 19.5, 1, lk.gem ?? 0x7ad08a);
      return;
    }
    case 'hat': {
      // pointed wizard hat with a jewelled band
      part(x, () => { x.beginPath(); x.ellipse(16, 24.5, 14.5, 4.5, 0, 0, Math.PI * 2); }, grad(x, m, 2, 20, 30, 29), () => { x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(16, 23.5, 9, 2.4, 0, 0, Math.PI * 2); x.fill(); });
      part(x, () => { x.beginPath(); x.moveTo(8.5, 24); x.quadraticCurveTo(10, 13, 15.5, 8); x.quadraticCurveTo(20, 4, 27, 1.5); x.quadraticCurveTo(23, 6.5, 22, 10.5); x.quadraticCurveTo(22.5, 18, 23.5, 24); x.quadraticCurveTo(16, 26, 8.5, 24); }, grad(x, m, 8, 4, 26, 24), () => {
        volume(x, 0.28, 0.4);
        line(x, 12, 21, 16, 9, 0.5, css(m[2]));
        for (const [sx, sy] of [[13, 15], [18.5, 12], [17, 18.5]]) { x.fillStyle = css(t[0]); x.fillRect(sx - 0.5, sy - 0.5, 1, 1); x.fillRect(sx - 1.2, sy - 0.15, 2.4, 0.3); x.fillRect(sx - 0.15, sy - 1.2, 0.3, 2.4); }
      });
      part(x, () => { x.beginPath(); x.moveTo(8.8, 20.5); x.quadraticCurveTo(16, 22.5, 23.2, 20.5); x.lineTo(23.5, 24); x.quadraticCurveTo(16, 26, 8.5, 24); x.closePath(); }, polish(x, t, 8, 0, 24, 0), undefined, 0.8);
      gem(x, 16, 23, 1.7, lk.gem ?? 0xc080ff, 'diamond');
      return;
    }
    case 'hood': {
      part(x, () => { x.beginPath(); x.moveTo(4.5, 29); x.bezierCurveTo(3, 14, 9, 4, 17, 3); x.bezierCurveTo(24, 2, 28.5, 8, 27.5, 16); x.lineTo(27.5, 29); x.quadraticCurveTo(16, 26.5, 4.5, 29); }, grad(x, m, 4, 3, 28, 29), () => {
        volume(x, 0.3, 0.45);
        line(x, 8, 26, 9, 12, 0.5, css(m[2]));
        line(x, 24, 26, 24, 13, 0.5, css(m[2]));
        line(x, 17, 3.5, 26, 9, 0.6, css(m[0]));
      });
      // face in shadow
      x.beginPath();
      x.ellipse(16, 18.5, 6.2, 7, 0, 0, Math.PI * 2);
      const sh = x.createRadialGradient(16, 20, 1, 16, 18, 7);
      sh.addColorStop(0, '#3a2a20');
      sh.addColorStop(1, '#0a0604');
      x.fillStyle = sh;
      x.fill();
      x.lineWidth = 0.9;
      x.strokeStyle = css(m[2]);
      x.stroke();
      x.fillStyle = lk.gem ? css(lk.gem) : '#d8c8a0';
      x.fillRect(12.8, 18, 2, 1);
      x.fillRect(17.2, 18, 2, 1);
      if (d.setId === 'skyfeather') wings(x, lk, 16);
      if (lk.emblem === 'leaf' || d.setId === 'skyfeather') emblem(x, 'leaf', 16, 26.5, 2, lk.t);
      if (lk.gem && tier >= 3) gem(x, 16, 26.5, 1.5, lk.gem, 'diamond');
      return;
    }
    case 'cap': {
      part(x, () => dome(x, 6, 26, 6, 22), radial(x, m, 14, 14, 13), () => {
        for (const xx of [11, 16, 21]) { x.setLineDash([0.9, 0.8]); line(x, xx, 6, xx + (xx - 16) * 0.3, 21, 0.4, css(m[0])); x.setLineDash([]); }
      });
      part(x, () => { x.beginPath(); x.rect(4.5, 19.5, 23, 4); }, grad(x, t, 4, 19, 28, 24), () => { x.setLineDash([0.9, 0.8]); line(x, 5, 21.5, 27, 21.5, 0.35, css(t[0])); x.setLineDash([]); }, 0.9);
      rivet(x, 16, 6.5, 1.2, MAT.iron);
      return;
    }
    case 'fur': {
      part(x, () => dome(x, 6.5, 25.5, 5, 21), radial(x, MAT.leather, 14, 12, 13), () => volume(x));
      for (let i = 0; i < 9; i++) {
        const cx = 5 + i * 2.75;
        part(x, () => { x.beginPath(); x.arc(cx, 22 + (i % 2) * 0.8, 2.6, 0, Math.PI * 2); }, radial(x, m, cx, 22, 2.6), undefined, 0.6);
      }
      part(x, () => { x.beginPath(); x.arc(16, 5, 2.2, 0, Math.PI * 2); }, radial(x, m, 16, 5, 2.2), undefined, 0.6);
      return;
    }
    case 'coif': {
      part(x, () => { x.beginPath(); x.moveTo(4.5, 29); x.lineTo(5.5, 14); x.bezierCurveTo(5.5, 2, 26.5, 2, 26.5, 14); x.lineTo(27.5, 29); x.quadraticCurveTo(16, 26, 4.5, 29); }, grad(x, m, 4, 4, 28, 29), () => {
        // riveted rings
        for (let yy = 4; yy < 30; yy += 1.8) for (let xx = 4 + ((yy / 1.8) % 2) * 0.9; xx < 29; xx += 1.8) {
          x.beginPath(); x.arc(xx, yy, 0.75, Math.PI, 0); x.lineWidth = 0.35; x.strokeStyle = css(m[0]); x.stroke();
          x.beginPath(); x.arc(xx, yy + 0.2, 0.75, 0, Math.PI); x.strokeStyle = css(m[3]); x.stroke();
        }
        volume(x, 0.2, 0.45);
      });
      x.beginPath();
      x.ellipse(16, 17.5, 5.6, 6.8, 0, 0, Math.PI * 2);
      x.fillStyle = '#1e140e';
      x.fill();
      x.lineWidth = 1.2;
      x.strokeStyle = css(t[1]);
      x.stroke();
      return;
    }
    case 'skull': {
      if (lk.horns) horns(x, { ...lk, spikes: false }, 11);
      part(x, () => { x.beginPath(); x.moveTo(6, 20); x.bezierCurveTo(4.5, 3, 27.5, 3, 26, 20); x.lineTo(24, 25); x.lineTo(8, 25); x.closePath(); }, radial(x, m, 14, 11, 15), () => {
        volume(x, 0.2, 0.35);
        line(x, 19, 5, 21, 9, 0.4, css(m[2]));
        line(x, 21, 9, 20, 12, 0.4, css(m[2]));
      });
      x.fillStyle = DARK;
      for (const s of [-1, 1]) { x.beginPath(); x.ellipse(16 + s * 4.6, 15.5, 2.9, 3.3, s * 0.2, 0, Math.PI * 2); x.fill(); }
      glowAt(x, 11.4, 15.5, 3, 0xff5a20, 0.5);
      glowAt(x, 20.6, 15.5, 3, 0xff5a20, 0.5);
      pts(x, [16, 18.5, 17.3, 21, 14.7, 21]);
      x.fill();
      for (let i = 0; i < 6; i++) part(x, () => { x.beginPath(); x.rect(10.6 + i * 1.8, 24, 1.6, 3); }, css(m[0]), undefined, 0.5);
      return;
    }
    default:
      break;
  }

  // metal helmets: med, full, great, horned, winged, crested, crown
  const great = style === 'great';
  const open = style === 'med' || style === 'winged';
  const build = great
    ? () => { x.beginPath(); x.moveTo(7, 9); x.quadraticCurveTo(16, 2.5, 25, 9); x.lineTo(25.5, 27); x.quadraticCurveTo(16, 29.5, 6.5, 27); x.closePath(); }
    : open
      ? () => dome(x, 6, 26, 5, 22)
      : () => { x.beginPath(); x.moveTo(6, 25); x.lineTo(5.5, 14); x.bezierCurveTo(5.5, 2.5, 26.5, 2.5, 26.5, 14); x.lineTo(26, 25); x.lineTo(21, 29); x.lineTo(11, 29); x.closePath(); };
  if (open) {
    // the face shows under an open helm
    part(x, () => { x.beginPath(); x.rect(8, 19, 16, 9); }, '#2a1c14', undefined, 0.8);
  }
  part(x, build, polish(x, m, 5, 0, 27, 0), () => {
    const g = x.createLinearGradient(0, 3, 0, 29);
    g.addColorStop(0, 'rgba(255,255,255,0.25)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
    // centre ridge
    line(x, 15.3, 4, 15.3, great ? 12 : 13, 0.8, css(m[0]));
    line(x, 16.8, 4, 16.8, great ? 12 : 13, 0.6, css(m[2]));
    if (great) {
      // banded barrel helm with a cross-shaped visor
      for (const yy of [9.5, 25.5]) { line(x, 5, yy, 27, yy, 2, css(t[1])); line(x, 5, yy - 0.8, 27, yy - 0.8, 0.4, css(t[0])); }
      x.fillStyle = DARK;
      x.fillRect(8.5, 13.3, 6, 2.2);
      x.fillRect(17.5, 13.3, 6, 2.2);
      line(x, 16, 9, 16, 26, 2.2, css(t[1]));
      line(x, 15.6, 9, 15.6, 26, 0.4, css(t[0]));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { x.fillStyle = DARK; x.fillRect(19.5 + c * 2, 18 + r * 2, 0.9, 0.9); x.fillRect(11 + c * 2, 18 + r * 2, 0.9, 0.9); }
    } else if (!open) {
      // full helm: visor slit and breaths
      x.fillStyle = DARK;
      x.beginPath();
      x.moveTo(8, 14.2); x.lineTo(24, 14.2); x.lineTo(23.5, 16.6); x.lineTo(17, 16.6); x.lineTo(17, 23); x.lineTo(15, 23); x.lineTo(15, 16.6); x.lineTo(8.5, 16.6);
      x.closePath();
      x.fill();
      line(x, 8.5, 17.2, 14.5, 17.2, 0.5, css(m[0]));
      for (let i = 0; i < 3; i++) { x.fillStyle = DARK; x.fillRect(19.5 + i * 1.6, 20 + i * 0.6, 0.8, 0.8); x.fillRect(11.7 - i * 1.6, 20 + i * 0.6, 0.8, 0.8); }
      line(x, 6.5, 25, 11, 29, 1.4, css(t[1]));
      line(x, 25.5, 25, 21, 29, 1.4, css(t[1]));
    }
  });
  if (open) {
    // brow band and nasal guard
    part(x, () => { x.beginPath(); x.rect(5.5, 17.5, 21, 3.6); }, grad(x, tier >= 2 ? t : m, 5, 17, 27, 21), () => line(x, 6, 18.2, 26, 18.2, 0.4, 'rgba(255,255,255,0.7)'), 0.9);
    part(x, () => pts(x, [14.8, 20, 17.2, 20, 16.9, 27.5, 15.1, 27.5]), grad(x, m, 14, 20, 18, 27), undefined, 0.8);
    for (let i = 0; i < 5; i++) rivet(x, 7.3 + i * 4.35, 19.3, 0.75, tier >= 2 ? m : t === MAT.leather ? MAT.iron : t);
  } else {
    for (const s of [-1, 1]) rivet(x, 16 + s * 8.2, 11.5, 0.85, t);
  }
  if (style === 'crested' || (style === 'great' && lk.plume !== undefined && !lk.horns)) {
    const pc = rampOf(lk.plume ?? t[1]);
    part(x, () => { x.beginPath(); x.moveTo(13.8, great ? 6.5 : 5.5); x.quadraticCurveTo(13, -0.5, 18, 0.2); x.quadraticCurveTo(23, 1, 22, 6); x.quadraticCurveTo(19.5, 3, 18.2, great ? 6.5 : 5.5); x.closePath(); }, grad(x, pc, 13, 0, 22, 6), () => {
      for (let i = 0; i < 5; i++) line(x, 14 + i * 1.6, 6, 15.5 + i * 1.6, 0.5, 0.35, css(pc[2]));
    }, 0.8);
    part(x, () => { x.beginPath(); x.rect(13.6, great ? 5.5 : 4.5, 4.8, 2); }, grad(x, t, 13, 4, 19, 7), undefined, 0.6);
  }
  if (style === 'crown') {
    part(x, () => pts(x, [6.5, 12, 6.5, 6, 9.5, 9, 12.5, 3.5, 16, 8, 19.5, 3.5, 22.5, 9, 25.5, 6, 25.5, 12]), polish(x, t, 6, 0, 26, 0), () => line(x, 6, 11, 26, 11, 0.6, css(t[2])), 0.8);
    gem(x, 16, 10.2, 1.4, lk.gem ?? 0x3a7aff);
    gem(x, 10.8, 10.6, 0.9, 0xff3a3a);
    gem(x, 21.2, 10.6, 0.9, 0xff3a3a);
  }
  if (lk.spikes && style !== 'horned') {
    for (let i = 0; i < 3; i++) part(x, () => pts(x, [12 + i * 3.5, 6, 13.6 + i * 3.5, 0.5 + (i === 1 ? -0.5 : 0.8), 15.2 + i * 3.5, 6]), grad(x, t, 12, 0, 20, 6), undefined, 0.6);
  }
  if (lk.gem && style !== 'crown' && tier >= 2) gem(x, 16, great ? 10.8 : open ? 15.5 : 11.5, tier >= 4 ? 1.6 : 1.2, lk.gem, 'diamond');
}

// ------------------------------------------------------------------ body armour

function torsoPath(x: Ctx): void {
  x.beginPath();
  x.moveTo(10.5, 4);
  x.lineTo(21.5, 4);
  x.lineTo(27, 7);
  x.quadraticCurveTo(29.5, 8, 29.5, 11.5);
  x.lineTo(28.5, 17);
  x.lineTo(25.2, 16);
  x.lineTo(24.8, 28);
  x.quadraticCurveTo(16, 30.5, 7.2, 28);
  x.lineTo(6.8, 16);
  x.lineTo(3.5, 17);
  x.lineTo(2.5, 11.5);
  x.quadraticCurveTo(2.5, 8, 5, 7);
  x.closePath();
}

function robePath(x: Ctx): void {
  x.beginPath();
  x.moveTo(11, 3);
  x.lineTo(21, 3);
  x.lineTo(27, 6.5);
  x.lineTo(30, 17);
  x.lineTo(25.5, 17.5);
  x.lineTo(27, 30);
  x.lineTo(5, 30);
  x.lineTo(6.5, 17.5);
  x.lineTo(2, 17);
  x.lineTo(5, 6.5);
  x.closePath();
}

function neck(x: Ctx): void {
  pts(x, [11.8, 4, 20.2, 4, 16, 9.5]);
  x.fillStyle = DARK;
  x.fill();
}

function cape(x: Ctx, c: number): void {
  const r = rampOf(c);
  part(x, () => pts(x, [5, 8, 27, 8, 30.5, 30.5, 1.5, 30.5]), grad(x, r, 1, 8, 31, 31), () => {
    for (const xx of [4, 8, 24, 28]) line(x, xx, 10, xx + (xx < 16 ? -1 : 1), 30, 0.6, css(r[2]));
  }, 1);
}

function pauldrons(x: Ctx, lk: GearLook): void {
  const m = lk.m, t = lk.t;
  for (const s of [-1, 1]) {
    const cx = 16 + s * 10.5;
    for (let lame = 1; lame >= 0; lame--) {
      const y = 7.5 + lame * 3.2;
      part(x, () => { x.beginPath(); x.ellipse(cx + s * lame * 0.6, y, 6 - lame * 0.6, 3.6, s * 0.35, 0, Math.PI * 2); }, polish(x, m, cx - 6, y - 4, cx + 6, y + 4), () => {
        line(x, cx - 5, y + 2.6, cx + 5, y + 2.6 + s * 1.5, 0.9, css(lk.tier >= 2 ? t[1] : m[2]));
      }, 0.9);
    }
    rivet(x, cx - s * 2, 7, 0.8, lk.tier >= 2 ? t : m);
    if (lk.spikes) part(x, () => pts(x, [cx - 1.6, 5, cx + s * 4.5, -0.5, cx + 1.4, 5.8]), grad(x, t, cx - 3, 0, cx + 3, 6), undefined, 0.7);
  }
}

function belt(x: Ctx, lk: GearLook, y: number): void {
  strap(x, 7.2, y, 24.8, y, 2.3, lk.tier >= 3 && lk.t !== MAT.leather ? MAT.darkleather : MAT.leather);
  buckle(x, 16, y, 3.6, 3, lk.tier >= 2 ? (lk.t === MAT.leather || lk.t === MAT.darkleather ? MAT.gold : lk.t) : MAT.iron);
}

function drawArmor(x: Ctx, d: ItemDef): void {
  const legacy = ARMOR_LOOK[d.id];
  const lk = gearLook(d, legacy?.color);
  const m = lk.m, t = lk.t;
  if (lk.cape && lk.body !== 'robe') cape(x, lk.cape);
  switch (lk.body) {
    case 'robe': {
      part(x, () => robePath(x), grad(x, m, 2, 3, 30, 30), () => {
        volume(x, 0.25, 0.42);
        for (const xx of [9, 12, 20, 23]) line(x, xx, 18, xx + (xx < 16 ? -1.5 : 1.5), 30, 0.5, css(m[2]));
        // embroidered front panel, hem and cuffs
        x.fillStyle = grad(x, t, 13, 0, 19, 0);
        x.fillRect(14.2, 3, 3.6, 27);
        x.fillRect(4, 27.6, 24, 2.4);
        pts(x, [2, 17, 6.5, 17.5, 6.2, 15.3, 2.7, 14.8]); x.fill();
        pts(x, [30, 17, 25.5, 17.5, 25.8, 15.3, 29.3, 14.8]); x.fill();
        for (let yy = 6; yy < 27; yy += 3) { x.fillStyle = css(t[2]); x.fillRect(15.6, yy, 0.8, 1.4); }
        line(x, 14.2, 3, 14.2, 30, 0.4, css(t[2]));
        line(x, 17.8, 3, 17.8, 30, 0.4, css(t[2]));
        // sash
        x.fillStyle = grad(x, rampOf(t[2]), 6, 0, 26, 0);
        x.fillRect(5, 15, 22, 2.4);
        // runes on the hem
        for (let i = 0; i < 4; i++) { const rx = 6 + i * 2.4 + (i > 1 ? 12 : 0); line(x, rx, 25, rx + 1, 26.6, 0.4, css(t[0])); line(x, rx + 1, 25, rx, 26.6, 0.4, css(t[0])); }
      });
      neck(x);
      part(x, () => { x.beginPath(); x.moveTo(11, 3); x.quadraticCurveTo(16, 7, 21, 3); x.lineTo(22.5, 4.5); x.quadraticCurveTo(16, 10, 9.5, 4.5); x.closePath(); }, polish(x, t, 9, 0, 23, 0), undefined, 0.7);
      gem(x, 16, 8.6, 1.6, lk.gem ?? 0xb080ff, 'diamond');
      return;
    }
    case 'fur': {
      part(x, () => torsoPath(x), grad(x, MAT.leather, 3, 4, 29, 29), () => {
        volume(x);
        x.setLineDash([0.9, 0.9]);
        line(x, 16, 9, 16, 28, 0.4, css(MAT.leather[0]));
        x.setLineDash([]);
        for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(9 + (i * 7) % 14, 12 + i * 2.6, 2.6, 0.5); }
      });
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.05 + (i / 10) * 0.9);
        const cx = 16 - Math.cos(a) * 12, cy = 9.5 - Math.sin(a) * 4.5;
        part(x, () => { x.beginPath(); x.arc(cx, cy, 2.8, 0, Math.PI * 2); }, radial(x, m, cx, cy, 2.8), undefined, 0.6);
      }
      for (let i = 0; i < 8; i++) part(x, () => { x.beginPath(); x.arc(8.2 + i * 2.25, 28, 1.6, 0, Math.PI * 2); }, radial(x, m, 8.2 + i * 2.25, 28, 1.6), undefined, 0.5);
      strap(x, 10, 6, 22, 24, 1.6, MAT.darkleather);
      buckle(x, 16, 15, 2.6, 2.4, MAT.iron);
      return;
    }
    case 'bone': {
      part(x, () => torsoPath(x), grad(x, t, 3, 4, 29, 29), () => volume(x, 0.15, 0.4));
      neck(x);
      // sternum and ribs
      part(x, () => { x.beginPath(); x.rect(14.8, 8, 2.4, 15); }, grad(x, m, 14, 8, 18, 23), undefined, 0.7);
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const y = 10 + i * 3.4;
        part(x, () => { x.beginPath(); x.moveTo(16 + s * 1.2, y); x.quadraticCurveTo(16 + s * 9, y - 1.5, 16 + s * 8.5, y + 2.6); x.lineTo(16 + s * 7.6, y + 2.8); x.quadraticCurveTo(16 + s * 7.5, y + 0.4, 16 + s * 1.2, y + 1.5); x.closePath(); }, grad(x, m, 8, y - 2, 24, y + 3), undefined, 0.6);
      }
      for (const s of [-1, 1]) emblem(x, 'skull', 16 + s * 10.5, 9, 3, t);
      strap(x, 7.2, 25, 24.8, 25, 2, MAT.darkleather);
      return;
    }
    case 'chain': {
      part(x, () => torsoPath(x), grad(x, m, 3, 4, 29, 29), () => {
        for (let yy = 5; yy < 30; yy += 1.7) for (let xx = 2 + ((yy / 1.7) % 2) * 0.85; xx < 30; xx += 1.7) {
          x.beginPath(); x.arc(xx, yy, 0.72, Math.PI, 0); x.lineWidth = 0.35; x.strokeStyle = css(m[0]); x.stroke();
          x.beginPath(); x.arc(xx, yy + 0.2, 0.72, 0, Math.PI); x.strokeStyle = css(m[3]); x.stroke();
        }
        volume(x, 0.25, 0.45);
      });
      neck(x);
      part(x, () => { x.beginPath(); x.moveTo(10.5, 4); x.quadraticCurveTo(16, 10.5, 21.5, 4); x.lineTo(23, 5); x.quadraticCurveTo(16, 13, 9, 5); x.closePath(); }, grad(x, t, 9, 4, 23, 10), undefined, 0.7);
      belt(x, lk, 24);
      return;
    }
    case 'leather':
    case 'vest': {
      part(x, () => torsoPath(x), grad(x, m, 3, 4, 29, 29), () => {
        volume(x, 0.25, 0.45);
        x.setLineDash([0.9, 0.8]);
        line(x, 9, 9, 9.3, 28, 0.4, css(m[0]));
        line(x, 23, 9, 22.7, 28, 0.4, css(m[0]));
        x.setLineDash([]);
        // shoulder pieces of darker leather
        x.fillStyle = css(t[1]);
        x.beginPath(); x.ellipse(5.5, 10, 4, 3.2, 0.3, 0, Math.PI * 2); x.ellipse(26.5, 10, 4, 3.2, -0.3, 0, Math.PI * 2); x.fill();
      });
      neck(x);
      if (lk.body === 'vest') {
        // ranger: folded hood behind the neck, laced front, quiver strap
        part(x, () => { x.beginPath(); x.moveTo(9.5, 4.5); x.quadraticCurveTo(16, 1, 22.5, 4.5); x.quadraticCurveTo(16, 11, 9.5, 4.5); }, grad(x, m, 9, 1, 23, 9), undefined, 0.8);
        for (let i = 0; i < 4; i++) { const yy = 11 + i * 2.6; line(x, 14.6, yy, 17.4, yy + 2, 0.5, css(MAT.cloth[0])); line(x, 17.4, yy, 14.6, yy + 2, 0.5, css(MAT.cloth[0])); }
        strap(x, 6, 7, 24, 26, 2, t);
        buckle(x, 12, 13.5, 2.4, 2.2, d.setId === 'skyfeather' ? MAT.gold : MAT.bronze);
        if (lk.gem) gem(x, 16, 7.5, 1.3, lk.gem, 'diamond');
      } else {
        strap(x, 8, 7, 24, 22, 1.8, t);
        strap(x, 24, 7, 8, 22, 1.8, t);
        buckle(x, 16, 14.5, 2.6, 2.4, MAT.iron);
      }
      belt(x, lk, 25);
      return;
    }
    case 'scale': {
      part(x, () => torsoPath(x), css(m[2]), () => {
        for (let row = 0; row < 14; row++) for (let i = 0; i < 12; i++) {
          const cx = 1.5 + i * 2.8 + (row % 2) * 1.4, cy = 4 + row * 1.9;
          x.beginPath();
          x.moveTo(cx - 1.5, cy);
          x.quadraticCurveTo(cx, cy + 3.6, cx + 1.5, cy);
          x.closePath();
          x.fillStyle = grad(x, m, cx - 1.5, cy, cx + 1.5, cy + 2.5);
          x.fill();
          x.lineWidth = 0.35;
          x.strokeStyle = css(m[3]);
          x.stroke();
        }
        volume(x, 0.22, 0.42);
      });
      neck(x);
      part(x, () => { x.beginPath(); x.moveTo(10.5, 4); x.quadraticCurveTo(16, 10.5, 21.5, 4); x.lineTo(23, 5); x.quadraticCurveTo(16, 13, 9, 5); x.closePath(); }, polish(x, t, 9, 0, 23, 0), undefined, 0.7);
      pauldrons(x, { ...lk, m: t, t: m });
      belt(x, lk, 24.5);
      if (lk.gem) gem(x, 16, 10.5, 1.4, lk.gem, 'diamond');
      return;
    }
    default: {
      // plate: polished breastplate, layered lames, pauldrons, gorget, belt
      part(x, () => torsoPath(x), polish(x, m, 3, 0, 29, 0), () => {
        const g = x.createLinearGradient(0, 4, 0, 30);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(0.55, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.3)');
        x.fillStyle = g;
        x.fillRect(0, 0, 32, 32);
        line(x, 15.4, 9, 15.4, 21, 0.9, css(m[0]));
        line(x, 16.8, 9, 16.8, 21, 0.7, css(m[2]));
        x.beginPath(); x.moveTo(8, 13); x.quadraticCurveTo(12, 16.5, 16, 14.5); x.quadraticCurveTo(20, 16.5, 24, 13); x.lineWidth = 0.6; x.strokeStyle = css(m[2]); x.stroke();
        for (const yy of [21, 24.2, 27.4]) {
          line(x, 6, yy, 26, yy, 0.8, css(m[3]));
          line(x, 6, yy + 0.7, 26, yy + 0.7, 0.5, css(m[0]));
        }
        if (lk.tier >= 2) { line(x, 7.4, 12, 7.4, 28, 0.8, css(t[1])); line(x, 24.6, 12, 24.6, 28, 0.8, css(t[1])); }
        // engraving
        if (lk.tier >= 3) { x.beginPath(); x.moveTo(10, 9); x.bezierCurveTo(12, 12, 9, 15, 11.5, 18); x.moveTo(22, 9); x.bezierCurveTo(20, 12, 23, 15, 20.5, 18); x.lineWidth = 0.45; x.strokeStyle = css(t[0]); x.stroke(); }
      });
      neck(x);
      // gorget
      part(x, () => { x.beginPath(); x.moveTo(10.5, 4); x.quadraticCurveTo(16, 10, 21.5, 4); x.lineTo(23, 5.2); x.quadraticCurveTo(16, 12.5, 9, 5.2); x.closePath(); }, polish(x, lk.tier >= 2 ? t : m, 9, 0, 23, 0), undefined, 0.8);
      pauldrons(x, lk);
      belt(x, lk, 20.2);
      if (lk.tier >= 1 && lk.emblem !== 'none') emblem(x, lk.emblem, 16, 14.2, lk.tier >= 3 ? 3 : 2.4, t, lk.gem);
      else if (lk.gem) gem(x, 16, 13.5, 1.5, lk.gem, 'diamond');
      for (const [rx, ry] of [[9, 9.5], [23, 9.5], [8.4, 25.8], [23.6, 25.8]]) rivet(x, rx, ry, 0.7, lk.tier >= 2 ? t : m);
    }
  }
}

// ------------------------------------------------------------------ legs

function legsPath(x: Ctx): void {
  x.beginPath();
  x.moveTo(7, 3);
  x.lineTo(25, 3);
  x.lineTo(26.3, 29.5);
  x.lineTo(18, 29.5);
  x.lineTo(16.6, 12);
  x.lineTo(15.4, 12);
  x.lineTo(14, 29.5);
  x.lineTo(5.7, 29.5);
  x.closePath();
}

function drawLegs(x: Ctx, d: ItemDef): void {
  const lk = gearLook(d, LEGS[d.id]);
  const m = lk.m, t = lk.t;
  switch (lk.legs) {
    case 'skirt':
      part(x, () => pts(x, [9, 3, 23, 3, 28.5, 29.5, 3.5, 29.5]), grad(x, m, 3, 3, 29, 29), () => {
        volume(x, 0.25, 0.45);
        for (const xx of [8, 12, 20, 24]) line(x, 16 + (xx - 16) * 0.5, 6, xx + (xx - 16) * 0.25, 29, 0.55, css(m[2]));
        x.fillStyle = grad(x, t, 0, 0, 32, 0);
        x.fillRect(0, 26.6, 32, 3);
        x.fillRect(14.4, 3, 3.2, 27);
        for (let i = 0; i < 7; i++) { x.fillStyle = css(t[2]); x.fillRect(5 + i * 3.6, 27.6, 1, 1); }
      });
      part(x, () => { x.beginPath(); x.rect(8.5, 2.5, 15, 3.4); }, polish(x, t, 8, 0, 24, 0), undefined, 0.8);
      if (lk.gem) gem(x, 16, 4.2, 1.2, lk.gem, 'diamond');
      return;
    case 'fur':
      part(x, () => legsPath(x), grad(x, m, 5, 3, 27, 29), () => {
        volume(x);
        for (let i = 0; i < 18; i++) line(x, 7 + ((i * 5) % 18), 6 + ((i * 7) % 22), 8 + ((i * 5) % 18), 8 + ((i * 7) % 22), 0.5, css(m[2]));
      });
      strap(x, 7, 4.5, 25, 4.5, 2.6, MAT.leather);
      return;
    case 'bone':
      part(x, () => legsPath(x), grad(x, t, 5, 3, 27, 29), () => volume(x, 0.15, 0.4));
      for (const cx of [10.2, 21.8]) {
        for (const [yy, h] of [[7, 6], [20, 7]]) part(x, () => { x.beginPath(); x.ellipse(cx, yy + h / 2, 3.1, h / 2, 0, 0, Math.PI * 2); }, grad(x, m, cx - 3, yy, cx + 3, yy + h), () => line(x, cx - 1, yy + 1, cx - 1.5, yy + h - 1, 0.45, css(m[2])), 0.7);
        part(x, () => { x.beginPath(); x.arc(cx, 16.5, 2.3, 0, Math.PI * 2); }, radial(x, m, cx, 16.5, 2.3), undefined, 0.7);
      }
      strap(x, 7, 4, 25, 4, 2.4, MAT.darkleather);
      return;
    default:
      break;
  }
  const plate = lk.legs === 'plate';
  part(x, () => legsPath(x), plate ? polish(x, m, 5, 0, 27, 0) : grad(x, m, 5, 3, 27, 29), () => {
    if (lk.legs === 'chain') {
      for (let yy = 4; yy < 30; yy += 1.7) for (let xx = 4 + ((yy / 1.7) % 2) * 0.85; xx < 28; xx += 1.7) {
        x.beginPath(); x.arc(xx, yy, 0.72, Math.PI, 0); x.lineWidth = 0.35; x.strokeStyle = css(m[0]); x.stroke();
        x.beginPath(); x.arc(xx, yy + 0.2, 0.72, 0, Math.PI); x.strokeStyle = css(m[3]); x.stroke();
      }
    } else if (lk.legs === 'scale') {
      for (let row = 0; row < 15; row++) for (let i = 0; i < 10; i++) {
        const cx = 4 + i * 2.6 + (row % 2) * 1.3, cy = 5 + row * 1.7;
        x.beginPath(); x.moveTo(cx - 1.4, cy); x.quadraticCurveTo(cx, cy + 3.2, cx + 1.4, cy); x.closePath();
        x.fillStyle = grad(x, m, cx - 1.4, cy, cx + 1.4, cy + 2.4); x.fill();
        x.lineWidth = 0.32; x.strokeStyle = css(m[3]); x.stroke();
      }
    } else if (lk.legs === 'leather') {
      x.setLineDash([0.9, 0.8]);
      line(x, 10, 7, 9.6, 29, 0.4, css(m[0]));
      line(x, 22, 7, 22.4, 29, 0.4, css(m[0]));
      x.setLineDash([]);
      x.fillStyle = css(t[1]);
      x.beginPath(); x.ellipse(10, 17, 2.8, 2.4, 0, 0, Math.PI * 2); x.ellipse(22, 17, 2.8, 2.4, 0, 0, Math.PI * 2); x.fill();
    } else {
      // plate: cuisses, greaves and bands
      for (const yy of [9, 12.5]) { line(x, 5, yy, 27, yy, 0.8, css(m[3])); line(x, 5, yy + 0.7, 27, yy + 0.7, 0.5, css(m[0])); }
      for (const cx of [10, 22]) { line(x, cx - 3.5, 22.5, cx + 3.5, 22.5, 0.7, css(m[3])); line(x, cx - 1.2, 21, cx - 1.2, 29, 0.7, css(m[0])); }
      if (lk.tier >= 2) { line(x, 6.3, 6, 5.9, 29, 0.9, css(t[1])); line(x, 25.7, 6, 26.1, 29, 0.9, css(t[1])); }
    }
    volume(x, 0.2, 0.42);
  });
  if (plate || lk.legs === 'scale') {
    // knee cops
    for (const cx of [10, 22]) {
      part(x, () => { x.beginPath(); x.ellipse(cx, 17.5, 3.6, 2.9, 0, 0, Math.PI * 2); }, radial(x, lk.legs === 'scale' ? t : m, cx, 17.5, 3.6), () => line(x, cx - 3, 19, cx + 3, 19, 0.6, css((lk.legs === 'scale' ? t : m)[2])), 0.8);
      if (lk.gem && lk.tier >= 3) gem(x, cx, 17.3, 0.9, lk.gem);
      else rivet(x, cx, 17.3, 0.75, lk.tier >= 2 ? t : m);
    }
  }
  belt(x, { ...lk, t: lk.legs === 'chain' ? MAT.leather : lk.t }, 4.6);
}

// ------------------------------------------------------------------ boots

function bootPath(x: Ctx, ox: number, oy: number): void {
  x.beginPath();
  x.moveTo(ox, oy + 4);
  x.lineTo(ox + 8, oy + 4);
  x.lineTo(ox + 8.2, oy + 17);
  x.quadraticCurveTo(ox + 13.5, oy + 18, ox + 14.5, oy + 22.5);
  x.lineTo(ox + 14.5, oy + 25.5);
  x.lineTo(ox - 0.8, oy + 25.5);
  x.lineTo(ox - 0.4, oy + 17);
  x.closePath();
}

function shoePath(x: Ctx, ox: number, oy: number): void {
  x.beginPath();
  x.moveTo(ox, oy + 15);
  x.quadraticCurveTo(ox + 4, oy + 13.5, ox + 8, oy + 15.5);
  x.quadraticCurveTo(ox + 12, oy + 18, ox + 14.5, oy + 18.5);
  x.quadraticCurveTo(ox + 17, oy + 17.5, ox + 16, oy + 15.2);
  x.quadraticCurveTo(ox + 18, oy + 17, ox + 16.5, oy + 21);
  x.quadraticCurveTo(ox + 15, oy + 25, ox + 9, oy + 25.5);
  x.lineTo(ox - 0.5, oy + 25.5);
  x.closePath();
}

function oneBoot(x: Ctx, lk: GearLook, ox: number, oy: number, back: boolean): void {
  const m = back ? (rampOf(lk.m[2]) as Ramp) : lk.m;
  const t = lk.t;
  const sole = () => part(x, () => { x.beginPath(); x.rect(ox - 0.8, oy + 24, 15.3, 2); }, css(MAT.darkleather[2]), undefined, 0.7);
  switch (lk.boots) {
    case 'shoe':
      part(x, () => shoePath(x, ox, oy), grad(x, m, ox, oy + 13, ox + 16, oy + 26), () => {
        x.fillStyle = grad(x, t, ox, 0, ox + 16, 0);
        x.fillRect(ox - 1, oy + 23.5, 18, 2);
        line(x, ox, oy + 15.5, ox + 8, oy + 16.3, 0.8, css(t[1]));
      });
      if (!back) gem(x, ox + 9.5, oy + 18.6, 1.1, lk.gem ?? 0xc080ff, 'diamond');
      return;
    case 'fur':
      part(x, () => bootPath(x, ox, oy), grad(x, back ? rampOf(MAT.leather[2]) : MAT.leather, ox, oy, ox + 15, oy + 26), () => volume(x, 0.2, 0.3));
      sole();
      for (let i = 0; i < 4; i++) part(x, () => { x.beginPath(); x.arc(ox + 0.5 + i * 2.4, oy + 4.5 + (i % 2) * 0.7, 2.3, 0, Math.PI * 2); }, radial(x, back ? rampOf(lk.m[2]) : lk.m, ox + i * 2.4, oy + 4.5, 2.3), undefined, 0.5);
      return;
    case 'wing':
    case 'leather':
    case 'bone':
      part(x, () => bootPath(x, ox, oy), grad(x, lk.boots === 'bone' ? t : m, ox, oy, ox + 15, oy + 26), () => {
        volume(x, 0.2, 0.35);
        if (lk.boots !== 'bone') {
          // folded cuff and laces
          x.fillStyle = css((back ? rampOf(t[2]) : t)[1]);
          x.fillRect(ox - 1, oy + 4, 10, 3.2);
          for (let i = 0; i < 3; i++) { line(x, ox + 6.2, oy + 10 + i * 2.2, ox + 8.6, oy + 11.2 + i * 2.2, 0.45, '#e8dcc0'); }
          x.setLineDash([0.8, 0.8]);
          line(x, ox + 0.6, oy + 8, ox + 0.6, oy + 23, 0.35, css(m[0]));
          x.setLineDash([]);
        }
      });
      sole();
      if (lk.boots === 'bone') {
        for (const yy of [7, 13]) part(x, () => { x.beginPath(); x.ellipse(ox + 4, oy + yy, 3.6, 2.4, 0, 0, Math.PI * 2); }, grad(x, lk.m, ox, oy + yy - 2, ox + 8, oy + yy + 2), undefined, 0.6);
        for (let i = 0; i < 3; i++) part(x, () => pts(x, [ox + 10 + i * 1.6, oy + 21, ox + 12.6 + i * 1.6, oy + 24.5, ox + 9.8 + i * 1.6, oy + 24]), css(lk.m[0]), undefined, 0.5);
      }
      if (lk.boots === 'wing' && !back) {
        part(x, () => { x.beginPath(); x.moveTo(ox + 0.5, oy + 10); x.lineTo(ox - 3.8, oy + 2); x.lineTo(ox - 2, oy + 7); x.lineTo(ox - 4.4, oy + 7); x.lineTo(ox - 1.8, oy + 11); x.lineTo(ox - 4, oy + 12); x.lineTo(ox + 0.5, oy + 14); x.closePath(); }, grad(x, MAT.sky, ox - 4, oy + 2, ox, oy + 14), () => {
          line(x, ox + 0.3, oy + 11, ox - 3, oy + 4, 0.35, css(MAT.sky[2]));
        }, 0.7);
      }
      if (lk.gem && !back) gem(x, ox + 4, oy + 5.6, 1, lk.gem);
      return;
    default: {
      // plate sabatons: shin plate, ankle disc, overlapping toe lames
      part(x, () => bootPath(x, ox, oy), polish(x, m, ox - 1, 0, ox + 9, 0), () => {
        for (let i = 0; i < 4; i++) {
          const lx = ox + 7.4 + i * 1.8;
          x.beginPath(); x.moveTo(lx, oy + 17.5 + i * 0.6); x.quadraticCurveTo(lx + 1.4, oy + 21, lx, oy + 25);
          x.lineWidth = 0.7; x.strokeStyle = css(m[3]); x.stroke();
          x.beginPath(); x.moveTo(lx + 0.6, oy + 17.8 + i * 0.6); x.quadraticCurveTo(lx + 2, oy + 21, lx + 0.6, oy + 25);
          x.lineWidth = 0.45; x.strokeStyle = css(m[0]); x.stroke();
        }
        line(x, ox + 2.6, oy + 5, ox + 2.4, oy + 17, 0.8, css(m[0]));
        x.fillStyle = grad(x, lk.tier >= 2 ? t : m, ox, 0, ox + 9, 0);
        x.fillRect(ox - 1, oy + 4, 10, 2.4);
      });
      sole();
      rivet(x, ox + 6.4, oy + 15.5, 1, lk.tier >= 2 ? t : m);
      if (lk.spikes && !back) part(x, () => pts(x, [ox + 8, oy + 7, ox + 11.5, oy + 5, ox + 8, oy + 10]), grad(x, t, ox + 8, oy + 5, ox + 12, oy + 10), undefined, 0.6);
      if (lk.gem && lk.tier >= 3 && !back) gem(x, ox + 4, oy + 10.5, 1, lk.gem);
    }
  }
}

function drawBoots(x: Ctx, d: ItemDef): void {
  const lk = gearLook(d, BOOTS[d.id]);
  oneBoot(x, lk, 4, -1.5, true);
  oneBoot(x, lk, 13.5, 2.5, false);
}

// ------------------------------------------------------------------ shields

function drawShield(x: Ctx, d: ItemDef): void {
  const s = SHIELDS[d.id];
  const lk = gearLook(d, s?.face, s?.rim);
  const m = lk.m, t = lk.t;
  const wooden = m === MAT.wood || d.id === 'wooden_shield';
  switch (lk.shield) {
    case 'round': {
      part(x, () => { x.beginPath(); x.arc(16, 16, 14, 0, Math.PI * 2); }, polish(x, t, 2, 2, 30, 30));
      part(x, () => { x.beginPath(); x.arc(16, 16, 11.4, 0, Math.PI * 2); }, wooden ? grad(x, MAT.wood, 4, 4, 28, 28) : radial(x, m, 16, 16, 12), () => {
        if (wooden) for (let xx = 6; xx < 28; xx += 4) { line(x, xx, 2, xx, 30, 0.6, css(MAT.wood[3])); line(x, xx + 0.7, 2, xx + 0.7, 30, 0.4, css(MAT.wood[0])); }
        else { x.beginPath(); x.arc(16, 16, 8, 0, Math.PI * 2); x.lineWidth = 0.6; x.strokeStyle = css(m[2]); x.stroke(); }
        volume(x, 0.2, 0.4);
      }, 0.9);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; rivet(x, 16 + Math.cos(a) * 12.7, 16 + Math.sin(a) * 12.7, 0.75, t); }
      if (lk.emblem === 'beard') emblem(x, 'beard', 16, 9.5, 2.2, t);
      part(x, () => { x.beginPath(); x.arc(16, 16, 4.2, 0, Math.PI * 2); }, radial(x, wooden ? MAT.iron : t, 16, 16, 4.2), undefined, 0.9);
      if (lk.gem) gem(x, 16, 16, 1.4, lk.gem);
      else shine(x, [14, 14.2, 15.2, 13.3], 0.8, 0.9);
      return;
    }
    case 'book': {
      part(x, () => { x.beginPath(); x.rect(7.5, 3.5, 19, 26); }, '#efe6cf', () => { for (let yy = 5; yy < 29; yy += 1.4) line(x, 24, yy, 27, yy, 0.3, '#a89878'); }, 0.9);
      part(x, () => { x.beginPath(); x.rect(5, 2.5, 19.5, 27); }, grad(x, m, 5, 2, 25, 30), () => {
        volume(x, 0.2, 0.4);
        x.lineWidth = 0.6; x.strokeStyle = css(t[1]); x.strokeRect(7.4, 5, 14.7, 22);
      });
      part(x, () => { x.beginPath(); x.rect(4, 2.5, 3.5, 27); }, grad(x, t, 4, 0, 8, 0), () => { for (const yy of [7, 15, 23]) line(x, 4, yy, 7.5, yy, 0.6, css(t[2])); }, 0.8);
      for (const [cx, cy] of [[22.5, 4.5], [22.5, 27.5]]) part(x, () => pts(x, [cx - 2, cy - 2, cx + 2, cy - 2, cx + 2, cy + 2]), grad(x, t, cx - 2, cy - 2, cx + 2, cy + 2), undefined, 0.6);
      emblem(x, lk.emblem === 'none' ? 'star' : lk.emblem, 14.8, 15.5, 4.2, t, lk.gem);
      part(x, () => { x.beginPath(); x.rect(23.5, 13.5, 3.5, 4); }, polish(x, t, 23, 0, 27, 0), undefined, 0.6);
      return;
    }
    case 'tower': {
      const build = () => { x.beginPath(); x.moveTo(5, 6); x.quadraticCurveTo(16, 0.5, 27, 6); x.lineTo(27, 26); x.quadraticCurveTo(16, 31.5, 5, 26); x.closePath(); };
      part(x, build, polish(x, t, 4, 0, 28, 0));
      part(x, () => { x.beginPath(); x.moveTo(7.5, 7.5); x.quadraticCurveTo(16, 3.5, 24.5, 7.5); x.lineTo(24.5, 24.8); x.quadraticCurveTo(16, 29, 7.5, 24.8); x.closePath(); }, polish(x, m, 7, 0, 25, 0), () => {
        volume(x, 0.15, 0.4);
        line(x, 16, 3, 16, 30, 2.2, css(t[1]));
        line(x, 15.5, 3, 15.5, 30, 0.4, css(t[0]));
        line(x, 7, 16, 25, 16, 2.2, css(t[1]));
        line(x, 7, 15.5, 25, 15.5, 0.4, css(t[0]));
      }, 0.9);
      for (const [rx, ry] of [[9.5, 9], [22.5, 9], [9.5, 23], [22.5, 23], [9.5, 16], [22.5, 16], [16, 6.5], [16, 26]]) rivet(x, rx, ry, 0.75, t);
      if (lk.emblem !== 'none' && lk.emblem !== 'bar') emblem(x, lk.emblem, 16, 16, 3.4, t, lk.gem);
      else part(x, () => { x.beginPath(); x.arc(16, 16, 2.6, 0, Math.PI * 2); }, radial(x, t, 16, 16, 2.6), undefined, 0.8);
      if (lk.spikes) for (const s2 of [-1, 1]) part(x, () => pts(x, [16 + s2 * 10, 4.5, 16 + s2 * 13.5, -0.5, 16 + s2 * 12.5, 6]), grad(x, t, 14, 0, 18, 6), undefined, 0.6);
      return;
    }
    case 'skull': {
      const build = () => { x.beginPath(); x.moveTo(4, 4); x.lineTo(28, 4); x.lineTo(28, 13); x.quadraticCurveTo(28, 25, 16, 30.5); x.quadraticCurveTo(4, 25, 4, 13); x.closePath(); };
      part(x, build, grad(x, t, 4, 4, 28, 30), () => {
        volume(x, 0.15, 0.35);
        for (let i = 0; i < 6; i++) line(x, 6 + i * 4, 4, 5 + i * 4.2, 28, 0.5, css(MAT.darkleather[3]));
      });
      for (let i = 0; i < 7; i++) part(x, () => pts(x, [5.5 + i * 3.5, 4.5, 7.2 + i * 3.5, 0.5, 8.9 + i * 3.5, 4.5]), grad(x, m, 5, 0, 9, 4), undefined, 0.5);
      emblem(x, 'skull', 16, 15.5, 7, m, 0xff5a20);
      return;
    }
    default: {
      // kite, heater, spiked
      const kite = lk.shield === 'kite';
      const outer = kite
        ? () => { x.beginPath(); x.moveTo(4.5, 4); x.lineTo(27.5, 4); x.quadraticCurveTo(28.5, 15, 16, 31); x.quadraticCurveTo(3.5, 15, 4.5, 4); x.closePath(); }
        : () => { x.beginPath(); x.moveTo(4.2, 3.5); x.lineTo(27.8, 3.5); x.lineTo(27.8, 13); x.quadraticCurveTo(27.8, 25, 16, 30.8); x.quadraticCurveTo(4.2, 25, 4.2, 13); x.closePath(); };
      const inner = kite
        ? () => { x.beginPath(); x.moveTo(7, 6.4); x.lineTo(25, 6.4); x.quadraticCurveTo(25.6, 15, 16, 27.6); x.quadraticCurveTo(6.4, 15, 7, 6.4); x.closePath(); }
        : () => { x.beginPath(); x.moveTo(6.8, 6); x.lineTo(25.2, 6); x.lineTo(25.2, 13.2); x.quadraticCurveTo(25.2, 23, 16, 27.8); x.quadraticCurveTo(6.8, 23, 6.8, 13.2); x.closePath(); };
      if (lk.shield === 'spiked') {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.15 + i * 0.175);
          const bx = 16 - Math.cos(a) * 13, by = 15 + Math.sin(a) * 13;
          part(x, () => pts(x, [bx - 1.6, by - 1, 16 - Math.cos(a) * 17.5, 15 + Math.sin(a) * 17.5, bx + 1.6, by + 1]), grad(x, t, bx - 2, by - 2, bx + 2, by + 2), undefined, 0.6);
        }
        for (const s2 of [-1, 1]) part(x, () => pts(x, [16 + s2 * 9, 4, 16 + s2 * 14, -0.5, 16 + s2 * 12, 6]), grad(x, t, 12, 0, 20, 6), undefined, 0.6);
      }
      part(x, outer, polish(x, t, 3, 0, 29, 0));
      part(x, inner, polish(x, m, 6, 0, 26, 0), () => {
        const g = x.createLinearGradient(0, 4, 0, 30);
        g.addColorStop(0, 'rgba(255,255,255,0.22)');
        g.addColorStop(0.6, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        x.fillStyle = g;
        x.fillRect(0, 0, 32, 32);
        if (lk.tier >= 1 && !wooden) { line(x, 16, 6, 16, 28, 0.5, css(m[2])); line(x, 16.6, 6, 16.6, 28, 0.4, css(m[0])); }
        if (d.id === 'iron_shield') { x.fillStyle = 'rgba(30,60,160,0.75)'; x.fillRect(6, 6, 10, 9); x.fillRect(16, 15, 10, 13); }
      }, 0.9);
      shine(x, [8.5, 8, 12, 8], 0.8, 0.8);
      emblem(x, lk.emblem === 'none' ? 'bar' : lk.emblem, 16, 15, lk.tier >= 3 ? 5 : 4.2, t, lk.gem);
      for (const [rx, ry] of [[6.2, 5.3], [25.8, 5.3], [16, kite ? 29.2 : 29]]) rivet(x, rx, ry, 0.75, t);
      if (lk.gem && lk.tier >= 2 && lk.emblem !== 'eye' && lk.emblem !== 'crown' && lk.emblem !== 'sun') gem(x, 16, 8.2, 1.2, lk.gem, 'diamond');
    }
  }
}

// ------------------------------------------------------------------ weapons

/** Draw a weapon standing up in a local frame (tip at y -20), then tilt it 45°. */
function tilted(x: Ctx, draw: () => void): void {
  x.save();
  x.translate(14.5, 17.5);
  x.rotate(Math.PI / 4);
  // chunkier across, a little shorter along the diagonal, so heads never clip the corners
  x.scale(1.4, 0.8);
  draw();
  x.restore();
}

function weaponRamps(d: ItemDef): { m: Ramp; t: Ramp; glow?: number; gemc?: number } {
  const l = LOOKS[d.id] ?? { c: 0xc9d0da };
  const lk = gearLook(d, l.c, l.t);
  const metalByPrefix = lk.m !== undefined && (d.setId || /^(bronze|iron|steel|starsteel|darkstone|moonsilver|gilded|bone)_/.test(d.id));
  const m = metalByPrefix ? lk.m : rampOf(l.c);
  const t = l.t !== undefined ? rampOf(l.t) : lk.t;
  return { m, t, glow: l.g, gemc: lk.gem ?? (l.g ? l.c : undefined) };
}

function grip(x: Ctx, y0: number, y1: number, w: number, r: Ramp = MAT.leather): void {
  part(x, () => { x.beginPath(); x.rect(-w / 2, y0, w, y1 - y0); }, grad(x, r, -w / 2, 0, w / 2, 0), () => {
    for (let y = y0; y < y1; y += 1.3) line(x, -w, y, w, y + 1, 0.45, css(r[3]));
  }, 0.8);
}

function sword(x: Ctx, d: ItemDef): void {
  const { m, t, glow, gemc } = weaponRamps(d);
  const style = weaponStyle(d);
  const len = style === 'dagger' ? 15 : style === 'short' ? 21 : style === 'great' ? 29 : style === 'broad' ? 26 : 25;
  const w = style === 'broad' ? 4.4 : style === 'dagger' ? 2.8 : style === 'great' ? 3.8 : 3.3;
  const guardY = style === 'dagger' ? 3 : 6.5;
  const tip = guardY - len;
  const gl = glow ?? (gemc && (d.rarity === 'rare' || d.rarity === 'legendary') ? gemc : undefined);
  tilted(x, () => {
    const blade = style === 'curved'
      ? () => { x.beginPath(); x.moveTo(-w / 2, guardY); x.quadraticCurveTo(-w * 0.9, tip + len * 0.4, w * 0.9, tip); x.quadraticCurveTo(w * 0.9, tip + len * 0.45, w / 2, guardY); x.closePath(); }
      : () => pts(x, [-w / 2, guardY, -w / 2, tip + w * 1.6, 0, tip, w / 2, tip + w * 1.6, w / 2, guardY]);
    if (gl) { x.save(); x.shadowColor = rgba(gl, 0.95); x.shadowBlur = 7; blade(); x.fillStyle = css(m[1]); x.fill(); x.restore(); }
    part(x, blade, grad(x, m, -w / 2, 0, w / 2, 0), () => {
      // fuller and edge light
      if (style !== 'curved') {
        line(x, -0.35, guardY - 1, -0.35, tip + len * 0.35, 0.7, css(m[3]));
        line(x, 0.45, guardY - 1, 0.45, tip + len * 0.35, 0.5, css(m[0]));
      }
      line(x, -w / 2 + 0.4, guardY, -w / 2 + 0.4, tip + w * 1.6, 0.5, 'rgba(255,255,255,0.85)');
      if (d.tint && d.rarity === 'legendary') for (let i = 0; i < 4; i++) { x.fillStyle = css(t[0]); x.fillRect(-0.5, guardY - 4 - i * 3, 1, 1.4); }
    }, 0.9);
    // guard
    const gw = style === 'dagger' ? 3.4 : style === 'broad' || style === 'great' ? 6.6 : 5.6;
    part(x, () => { x.beginPath(); x.moveTo(-gw, guardY + 0.2); x.quadraticCurveTo(-gw - 0.8, guardY - 1.8, -gw + 0.4, guardY - 1.6); x.lineTo(gw - 0.4, guardY - 1.6); x.quadraticCurveTo(gw + 0.8, guardY - 1.8, gw, guardY + 0.2); x.quadraticCurveTo(0, guardY + 1.6, -gw, guardY + 0.2); x.closePath(); }, polish(x, t, -gw, 0, gw, 0), undefined, 0.8);
    if (gemc && (d.rarity !== 'common' || d.setId)) gem(x, 0, guardY - 0.4, 1.1, gemc, 'diamond');
    const gripLen = style === 'great' ? 9 : style === 'dagger' ? 5 : 6.5;
    grip(x, guardY + 1, guardY + 1 + gripLen, 1.9, d.rarity === 'legendary' ? MAT.darkleather : MAT.leather);
    part(x, () => { x.beginPath(); x.arc(0, guardY + 2.6 + gripLen, 1.9, 0, Math.PI * 2); }, radial(x, t, 0, guardY + 2.6 + gripLen, 1.9), undefined, 0.8);
  });
}

function axe(x: Ctx, d: ItemDef): void {
  const { m, t, glow, gemc } = weaponRamps(d);
  const style = weaponStyle(d);
  const small = style === 'hatchet';
  tilted(x, () => {
    // haft with grain and a leather grip
    const top = small ? -12 : -18;
    part(x, () => { x.beginPath(); x.rect(-1.2, top, 2.4, 20 - top + (small ? -1 : 1)); }, grad(x, d.id === 'demon_reaver' ? MAT.hell : MAT.wood, -1.2, 0, 1.2, 0), () => {
      for (let y = top; y < 20; y += 3.2) line(x, -0.5, y, 0.2, y + 2, 0.35, css(MAT.wood[3]));
    }, 0.8);
    grip(x, 11, 17.5, 2.6);
    const hy = small ? -8 : -12;
    const s = small ? 0.7 : 0.85;
    const blade = (side: number) => {
      if (style === 'cleaver') {
        part(x, () => pts(x, [side * 1.2, hy - 7, side * 8.5, hy - 9, side * 9.2, hy + 6, side * 1.2, hy + 3]), grad(x, m, 0, hy - 8, side * 11, hy + 6), () => {
          line(x, side * 8.6, hy - 8.6, side * 9.2, hy + 5.6, 0.7, 'rgba(255,255,255,0.85)');
          line(x, side * 3, hy - 4, side * 8, hy - 5, 0.5, css(m[3]));
        }, 0.9);
        return;
      }
      const build = () => { x.beginPath(); x.moveTo(side * 1.2, hy - 3 * s); x.quadraticCurveTo(side * 5 * s, hy - 3.5 * s, side * 7.5 * s, hy - 8 * s); x.quadraticCurveTo(side * 11.5 * s, hy, side * 7.5 * s, hy + 7 * s); x.quadraticCurveTo(side * 5 * s, hy + 2.8 * s, side * 1.2, hy + 2.5 * s); x.closePath(); };
      if (glow) { x.save(); x.shadowColor = rgba(glow, 0.9); x.shadowBlur = 6; build(); x.fillStyle = css(m[1]); x.fill(); x.restore(); }
      part(x, build, grad(x, m, side * 1, hy - 6, side * 10, hy + 6), () => {
        x.beginPath(); x.moveTo(side * 7.5 * s, hy - 8 * s); x.quadraticCurveTo(side * 11.5 * s, hy, side * 7.5 * s, hy + 7 * s);
        x.lineWidth = 1.3; x.strokeStyle = 'rgba(255,255,255,0.75)'; x.stroke();
        if (!small) line(x, side * 3, hy - 1.8, side * 6.5, hy - 2.5, 0.5, css(m[3]));
      }, 0.9);
    };
    blade(1);
    if (style === 'double') blade(-1);
    else if (style === 'battle') part(x, () => pts(x, [-1.2, hy - 1.6, -6, hy - 0.4, -1.2, hy + 1.4]), grad(x, m, -6, hy - 2, -1, hy + 2), undefined, 0.8);
    // socket, bands and a top spike
    part(x, () => { x.beginPath(); x.rect(-2, hy - 3.6 * s, 4, 6.6 * s); }, polish(x, t, -2, 0, 2, 0), undefined, 0.8);
    rivet(x, 0, hy - 0.4, 0.8, t);
    if (!small) part(x, () => pts(x, [-1.1, hy - 3.6, 0, hy - 8, 1.1, hy - 3.6]), grad(x, m, -1, hy - 8, 1, hy - 3), undefined, 0.7);
    if (gemc && d.rarity !== 'common') gem(x, 0, hy + 4, 1, gemc);
  });
}

function club(x: Ctx, d: ItemDef): void {
  const { m, t, glow, gemc } = weaponRamps(d);
  const style = weaponStyle(d);
  tilted(x, () => {
    const metalHaft = style === 'flanged' && d.rarity !== 'common';
    part(x, () => { x.beginPath(); x.rect(-1.2, -10, 2.4, 29); }, grad(x, metalHaft ? t : MAT.wood, -1.2, 0, 1.2, 0), undefined, 0.8);
    grip(x, 10, 17.5, 2.6);
    part(x, () => { x.beginPath(); x.arc(0, 18.6, 1.6, 0, Math.PI * 2); }, radial(x, t, 0, 18.6, 1.6), undefined, 0.7);
    if (glow) glowAt(x, 0, -12, 11, glow, 0.6);
    switch (style) {
      case 'morning': {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          part(x, () => pts(x, [Math.cos(a - 0.3) * 4.6, -12 + Math.sin(a - 0.3) * 4.6, Math.cos(a) * 8.5, -12 + Math.sin(a) * 8.5, Math.cos(a + 0.3) * 4.6, -12 + Math.sin(a + 0.3) * 4.6]), grad(x, t, -8, -20, 8, -4), undefined, 0.6);
        }
        part(x, () => { x.beginPath(); x.arc(0, -12, 5.2, 0, Math.PI * 2); }, radial(x, m, 0, -12, 5.2), undefined, 0.9);
        break;
      }
      case 'hammer': {
        part(x, () => pts(x, [-1.5, -13, -6.5, -10.5, -1.5, -10]), grad(x, t, -7, -13, -1, -10), undefined, 0.7);
        part(x, () => { x.beginPath(); x.rect(-1.8, -17.5, 10.5, 8.5); }, polish(x, m, -2, -18, 9, -9), () => {
          line(x, 6.5, -17.5, 6.5, -9, 0.7, css(m[3]));
          line(x, -1.8, -16.6, 8.7, -16.6, 0.5, 'rgba(255,255,255,0.7)');
        }, 0.9);
        part(x, () => { x.beginPath(); x.rect(6.5, -18.2, 3, 9.9); }, grad(x, t, 6, 0, 10, 0), undefined, 0.8);
        if (d.id === 'thunder_maul') { x.save(); x.shadowColor = '#fff27a'; x.shadowBlur = 5; pts(x, [3, -17, 0, -13, 2.6, -13, 1, -9.5, 5, -14, 2.4, -14]); x.fillStyle = '#fff27a'; x.fill(); x.restore(); }
        break;
      }
      case 'maul': {
        part(x, () => { x.beginPath(); x.rect(-7.5, -20, 15, 11); }, d.id === 'stone_maul' ? radial(x, MAT.iron, -2, -16, 12) : polish(x, m, -8, 0, 8, 0), () => {
          if (d.id === 'stone_maul') for (const [cx, cy] of [[-4, -17], [3, -12], [4, -18]]) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(cx, cy, 1.4, 0, Math.PI * 2); x.fill(); }
          else for (const yy of [-17, -12]) { line(x, -8, yy, 8, yy, 1.4, css(t[1])); line(x, -8, yy - 0.6, 8, yy - 0.6, 0.4, css(t[0])); }
          volume(x, 0.2, 0.4);
        }, 0.9);
        if (d.id !== 'stone_maul') { for (const cx of [-5.5, 5.5]) for (const cy of [-17, -12]) rivet(x, cx, cy, 0.8, t); }
        if (d.setId === 'wardbreaker') { emblem(x, 'bar', 0, -14.5, 3, t); gem(x, 0, -14.5, 1.3, gemc ?? 0xff9a2a); }
        break;
      }
      case 'tusk': {
        part(x, () => { x.beginPath(); x.moveTo(-1.5, -6); x.quadraticCurveTo(-5, -14, -2, -21); x.quadraticCurveTo(4, -19, 4.5, -13); x.quadraticCurveTo(4, -8, 1.5, -6); x.closePath(); }, grad(x, MAT.bone, -5, -21, 5, -6), () => {
          for (let i = 0; i < 4; i++) line(x, -4, -18 + i * 3, 4, -17 + i * 3, 0.4, css(MAT.bone[2]));
        }, 0.9);
        strap(x, -2.2, -7, 2.2, -7, 1.8, MAT.leather);
        break;
      }
      default: {
        // flanged mace: six blades round a core, front ones lit
        for (const [ox, k] of [[-4.6, 0.75], [4.6, 0.55], [-2.4, 0.95], [2.4, 0.8], [0, 1.1]] as Array<[number, number]>) {
          part(x, () => pts(x, [ox, -19.5, ox + (ox >= 0 ? 1.8 : -1.8), -13, ox, -7, ox - (ox >= 0 ? 0.8 : -0.8), -13]), grad(x, m, ox - 2, -19, ox + 2, -7), () => {
            x.fillStyle = `rgba(0,0,0,${(1.1 - k) * 0.6})`;
            x.fillRect(-10, -22, 20, 18);
          }, 0.75);
        }
        part(x, () => pts(x, [-1, -19.5, 0, -22.5, 1, -19.5]), grad(x, t, -1, -22, 1, -19), undefined, 0.6);
        part(x, () => { x.beginPath(); x.rect(-2, -7.5, 4, 2); }, polish(x, t, -2, 0, 2, 0), undefined, 0.6);
      }
    }
    if (gemc && style !== 'hammer' && style !== 'maul' && style !== 'tusk' && d.rarity !== 'common') gem(x, 0, style === 'morning' ? -12 : -13, 1.3, gemc);
  });
}

function bow(x: Ctx, d: ItemDef): void {
  const { m, t, gemc } = weaponRamps(d);
  const wood: Ramp = d.setId === 'skyfeather' ? MAT.sky : m;
  const recurve = d.rarity !== 'common';
  tilted(x, () => {
    // string, then limbs
    line(x, -3.4, -19.5, -3.4, 19.5, 0.5, css(MAT.cloth[0]));
    const limb = () => {
      x.beginPath();
      x.moveTo(recurve ? -1.5 : -3.4, -20.5);
      if (recurve) x.quadraticCurveTo(-4.5, -18, -2, -15);
      x.quadraticCurveTo(7, -7, 4.5, 0);
      x.quadraticCurveTo(7, 7, recurve ? -2 : -3.4, recurve ? 15 : 20.5);
      if (recurve) x.quadraticCurveTo(-4.5, 18, -1.5, 20.5);
    };
    limb(); x.lineWidth = 4.2; x.strokeStyle = OUT; x.stroke();
    limb(); x.lineWidth = 2.4; x.strokeStyle = grad(x, wood, -4, 0, 6, 0); x.stroke();
    limb(); x.lineWidth = 0.6; x.strokeStyle = css(wood[0]); x.stroke();
    // grip and nocks
    part(x, () => { x.beginPath(); x.rect(3.4, -3, 3, 6); }, grad(x, MAT.leather, 3, 0, 7, 0), () => { for (let y = -3; y < 3; y += 1.2) line(x, 3, y, 7, y + 0.8, 0.4, css(MAT.leather[3])); }, 0.7);
    for (const s of [-1, 1]) part(x, () => { x.beginPath(); x.arc(recurve ? -1.6 : -3.4, s * 20.5, 1.2, 0, Math.PI * 2); }, radial(x, t, -2, s * 20.5, 1.2), undefined, 0.6);
    if (d.setId === 'skyfeather' || d.id === 'elven_longbow' || d.id === 'sylvan_bow') for (const s of [-1, 1]) {
      part(x, () => { x.beginPath(); x.moveTo(5, s * 6); x.quadraticCurveTo(10, s * 9, 9.5, s * 13); x.quadraticCurveTo(7, s * 10, 4.5, s * 9); x.closePath(); }, grad(x, d.setId === 'skyfeather' ? MAT.sky : t, 5, s * 6, 10, s * 13), undefined, 0.6);
    }
    if (gemc && d.rarity !== 'common') gem(x, 5, 0, 1.3, gemc, 'diamond');
  });
}

function crossbow(x: Ctx, d: ItemDef): void {
  const { m, t, gemc } = weaponRamps(d);
  tilted(x, () => {
    part(x, () => { x.beginPath(); x.moveTo(-1.6, -14); x.lineTo(1.6, -14); x.lineTo(2, 12); x.lineTo(3.2, 19); x.lineTo(-3.2, 19); x.lineTo(-2, 12); x.closePath(); }, grad(x, m, -3, 0, 3, 0), () => line(x, -0.4, -13, -0.4, 18, 0.5, css(m[0])), 0.9);
    const prod = () => { x.beginPath(); x.moveTo(-11, -7); x.quadraticCurveTo(0, -16, 11, -7); };
    prod(); x.lineWidth = 3.8; x.strokeStyle = OUT; x.stroke();
    prod(); x.lineWidth = 2; x.strokeStyle = grad(x, t, -11, 0, 11, 0); x.stroke();
    line(x, -11, -7, 0, -2, 0.5, css(MAT.cloth[0]));
    line(x, 11, -7, 0, -2, 0.5, css(MAT.cloth[0]));
    rod(x, 0, -16, 0, -3, 0.9, '#7a6050');
    part(x, () => pts(x, [-1.3, -15.5, 0, -19, 1.3, -15.5]), grad(x, MAT.steel, -1, -19, 1, -15), undefined, 0.6);
    part(x, () => { x.beginPath(); x.rect(-2.4, -12, 4.8, 2.6); }, polish(x, t, -2, 0, 2, 0), undefined, 0.6);
    rod(x, 1.5, 5, 3.4, 8, 0.8, css(t[1]));
    if (gemc && d.rarity !== 'common') gem(x, 0, 2, 1.2, gemc);
  });
}

function throwing(x: Ctx, d: ItemDef): void {
  const { m, t } = weaponRamps(d);
  if (d.id.endsWith('_star')) {
    part(x, () => pts(x, [16, 1.5, 19, 13, 30.5, 16, 19, 19, 16, 30.5, 13, 19, 1.5, 16, 13, 13]), polish(x, m, 2, 2, 30, 30), () => {
      line(x, 16, 2, 16, 30, 0.5, css(m[3]));
      line(x, 2, 16, 30, 16, 0.5, css(m[3]));
    }, 0.9);
    part(x, () => { x.beginPath(); x.arc(16, 16, 2.6, 0, Math.PI * 2); }, radial(x, t, 16, 16, 2.6), undefined, 0.8);
    x.fillStyle = DARK;
    x.beginPath(); x.arc(16, 16, 1, 0, Math.PI * 2); x.fill();
    return;
  }
  tilted(x, () => {
    part(x, () => { x.beginPath(); x.rect(-1, -12, 2, 32); }, grad(x, rampOf(LOOKS[d.id]?.t ?? 0x7a5530), -1, 0, 1, 0), undefined, 0.7);
    part(x, () => { x.beginPath(); x.moveTo(0, -21.5); x.quadraticCurveTo(3.4, -16, 1.4, -11); x.lineTo(-1.4, -11); x.quadraticCurveTo(-3.4, -16, 0, -21.5); x.closePath(); }, grad(x, m, -3, 0, 3, 0), () => line(x, 0, -21, 0, -11.5, 0.5, css(m[3])), 0.9);
    strap(x, -1.6, -9.5, 1.6, -9.5, 1.8, d.id === 'royal_spear' || d.id === 'royal_javelin' ? MAT.gold : MAT.leather);
  });
}

function wand(x: Ctx, d: ItemDef, rodLike: boolean): void {
  const { m, t, glow } = weaponRamps(d);
  const orb = LOOKS[d.id]?.c ?? 0x9a7ae0;
  tilted(x, () => {
    const top = rodLike ? -14 : -8;
    if (rodLike) {
      // a twisted staff
      part(x, () => { x.beginPath(); x.moveTo(-1.4, top); x.lineTo(1.4, top); x.lineTo(1.1, 20.5); x.lineTo(-1.1, 20.5); x.closePath(); }, grad(x, t, -1.4, 0, 1.4, 0), () => {
        for (let y = top; y < 20; y += 2.6) line(x, -1.6, y, 1.6, y + 1.8, 0.55, css(t[3]));
      }, 0.8);
      for (const s of [-1, 1]) {
        x.beginPath(); x.moveTo(s * 1, top + 2); x.quadraticCurveTo(s * 6, top - 3, s * 2, top - 9);
        x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
        x.lineWidth = 1.2; x.strokeStyle = css(t[1]); x.stroke();
      }
    } else {
      part(x, () => { x.beginPath(); x.moveTo(-1.5, top); x.lineTo(1.5, top); x.lineTo(0.9, 15); x.lineTo(-0.9, 15); x.closePath(); }, grad(x, t, -1.5, 0, 1.5, 0), undefined, 0.8);
      for (const y of [top + 2, 4, 11]) part(x, () => { x.beginPath(); x.rect(-1.9, y, 3.8, 1.4); }, polish(x, MAT.gold, -2, 0, 2, 0), undefined, 0.5);
      for (const s of [-1, 1]) part(x, () => pts(x, [s * 1.3, top + 1, s * 3.6, top - 4, s * 0.8, top - 1]), grad(x, MAT.gold, -3, top - 4, 3, top + 1), undefined, 0.5);
    }
    const oy = rodLike ? top - 5.5 : top - 4;
    glowAt(x, 0, oy, 10, glow ?? orb, 0.75);
    gem(x, 0, oy, rodLike ? 4.2 : 3.6, orb);
    void m;
  });
}

function drawWeapon(x: Ctx, d: ItemDef): void {
  switch (d.weaponType) {
    case 'sword': return sword(x, d);
    case 'axe': return axe(x, d);
    case 'club': return club(x, d);
    case 'bow': return bow(x, d);
    case 'crossbow': return crossbow(x, d);
    case 'throwing': return throwing(x, d);
    case 'wand': return wand(x, d, false);
    case 'rod': return wand(x, d, true);
    default: return undefined;
  }
}

// ------------------------------------------------------------------ jewellery and backpacks

function jewelGem(d: ItemDef): number {
  const b = d.bonus;
  return b?.resist?.fire ? 0xff2a3a : b?.resist?.ice ? 0x5ab8ff : b?.manaRegen ? 0x3a6aff : b?.resist?.earth && b?.resist?.death ? 0x40c0a0 : b?.resist?.earth ? 0x2ad060
    : b?.light ? 0xffd84a : b?.speed ? 0x9fe8ff : b?.attack ? 0xe02a1a : b?.hpRegen ? 0xff5a8a : b?.resist?.physical ? 0xe8e8f0 : 0xd8b0ff;
}

function drawJewel(x: Ctx, d: ItemDef): void {
  const g = jewelGem(d);
  if (d.kind === 'ring') {
    const metal = d.bonus?.manaRegen || d.bonus?.speed ? MAT.silver : MAT.gold;
    // band in perspective: back half, then front half over the hole
    x.beginPath(); x.ellipse(16, 21, 10, 6.5, 0, Math.PI, Math.PI * 2); x.lineWidth = 5.2; x.strokeStyle = OUT; x.stroke();
    x.lineWidth = 3.2; x.strokeStyle = css(metal[2]); x.stroke();
    x.beginPath(); x.ellipse(16, 21, 10, 6.5, 0, 0, Math.PI); x.lineWidth = 5.6; x.strokeStyle = OUT; x.stroke();
    x.lineWidth = 3.6; x.strokeStyle = polish(x, metal, 6, 0, 26, 0); x.stroke();
    x.beginPath(); x.ellipse(16, 21.6, 9.6, 6, 0, 0.3, Math.PI - 0.3); x.lineWidth = 0.6; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.stroke();
    // setting with four prongs
    part(x, () => { x.beginPath(); x.moveTo(10.5, 16); x.lineTo(21.5, 16); x.lineTo(19.5, 19.5); x.lineTo(12.5, 19.5); x.closePath(); }, polish(x, metal, 10, 0, 22, 0), undefined, 0.8);
    gem(x, 16, 11.5, 4.4, g, d.id === 'ring_of_might' ? 'diamond' : 'round');
    for (const [px, py] of [[12.2, 8.5], [19.8, 8.5], [12.2, 14.5], [19.8, 14.5]]) part(x, () => pts(x, [px - 0.8, py + 0.8, px, py - 0.8, px + 0.8, py + 0.8]), css(metal[0]), undefined, 0.4);
    return;
  }
  // amulet: beaded chain and a jewelled pendant
  for (let i = 0; i <= 16; i++) {
    const tt = i / 16;
    const bx = 5 + tt * 22, by = 3 + Math.sin(tt * Math.PI) * 11;
    x.beginPath(); x.arc(bx, by, 0.95, 0, Math.PI * 2);
    x.fillStyle = css(MAT.gold[i % 2 ? 1 : 0]);
    x.fill();
    x.lineWidth = 0.4; x.strokeStyle = OUT; x.stroke();
  }
  if (d.id === 'demonbone_amulet') {
    emblem(x, 'skull', 16, 21.5, 7.5, MAT.bone, 0xff2a10);
    return;
  }
  if (d.id === 'scarab_amulet') {
    part(x, () => { x.beginPath(); x.ellipse(16, 22, 6.5, 7.8, 0, 0, Math.PI * 2); }, polish(x, MAT.gold, 9, 0, 23, 0), undefined, 0.9);
    part(x, () => { x.beginPath(); x.ellipse(16, 22.5, 4.4, 5.6, 0, 0, Math.PI * 2); }, radial(x, rampOf(g), 16, 22, 5.6), () => line(x, 16, 17, 16, 28, 0.5, OUT), 0.8);
    glowAt(x, 16, 22, 8, g, 0.35);
    return;
  }
  part(x, () => { x.beginPath(); x.moveTo(16, 13); x.quadraticCurveTo(24, 18, 16, 30); x.quadraticCurveTo(8, 18, 16, 13); }, polish(x, MAT.gold, 9, 0, 23, 0), () => {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.fillStyle = css(MAT.gold[2]); x.fillRect(16 + Math.cos(a) * 5 - 0.4, 21.5 + Math.sin(a) * 6 - 0.4, 0.8, 0.8); }
  }, 0.9);
  gem(x, 16, 21.5, 3.6, g, d.id === 'amulet_of_warding' ? 'diamond' : 'oval');
}

function drawBackpack(x: Ctx, d: ItemDef): void {
  const r: Ramp = d.id === 'dragonhide_pack' ? MAT.crimson : d.id === 'explorer_pack' ? MAT.ranger : d.id.startsWith('fur_') ? MAT.fur : d.id === 'bag' ? rampOf(0xa8743f) : MAT.leather;
  const sack = d.id === 'bag' || d.id === 'fur_bag';
  if (sack) {
    part(x, () => { x.beginPath(); x.moveTo(12, 9); x.quadraticCurveTo(3, 14, 4.5, 23); x.quadraticCurveTo(6, 30, 16, 30); x.quadraticCurveTo(26, 30, 27.5, 23); x.quadraticCurveTo(29, 14, 20, 9); x.closePath(); }, grad(x, r, 4, 9, 28, 30), () => {
      volume(x, 0.25, 0.45);
      for (const [x0, y0, x1, y1] of [[13, 11, 9, 24], [19, 11, 23, 25], [16, 11, 16, 26]]) line(x, x0, y0, x1, y1, 0.6, css(r[2]));
    });
    part(x, () => { x.beginPath(); x.moveTo(11.5, 9.5); x.quadraticCurveTo(10, 3, 14, 4.5); x.lineTo(16, 7); x.lineTo(18, 4.5); x.quadraticCurveTo(22, 3, 20.5, 9.5); x.closePath(); }, grad(x, r, 10, 3, 22, 9), undefined, 0.8);
    rod(x, 11, 9.4, 21, 9.4, 1.2, '#c9a26a');
    part(x, () => { x.beginPath(); x.arc(21.5, 11, 1.3, 0, Math.PI * 2); }, '#c9a26a', undefined, 0.6);
    return;
  }
  // carry loop and straps behind
  x.beginPath(); x.moveTo(12, 6); x.quadraticCurveTo(16, 0.5, 20, 6); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke(); x.lineWidth = 1.2; x.strokeStyle = css(MAT.darkleather[1]); x.stroke();
  if (d.id === 'explorer_pack') {
    // bedroll on top
    part(x, () => { x.beginPath(); x.rect(5, 4.5, 22, 5.5); }, grad(x, MAT.cloth, 0, 4, 0, 10), () => { for (const xx of [9, 23]) line(x, xx, 4, xx, 10, 1.2, css(MAT.leather[1])); }, 0.8);
  }
  part(x, () => { x.beginPath(); x.moveTo(6, 10); x.quadraticCurveTo(6, 7, 9, 7); x.lineTo(23, 7); x.quadraticCurveTo(26, 7, 26, 10); x.lineTo(27, 27); x.quadraticCurveTo(27, 30, 24, 30); x.lineTo(8, 30); x.quadraticCurveTo(5, 30, 5, 27); x.closePath(); }, grad(x, r, 5, 7, 27, 30), () => {
    if (d.id === 'dragonhide_pack') for (let row = 0; row < 12; row++) for (let i = 0; i < 9; i++) {
      const cx = 4 + i * 3 + (row % 2) * 1.5, cy = 8 + row * 2;
      x.beginPath(); x.moveTo(cx - 1.5, cy); x.quadraticCurveTo(cx, cy + 3.4, cx + 1.5, cy); x.closePath();
      x.fillStyle = grad(x, r, cx - 1.5, cy, cx + 1.5, cy + 2.4); x.fill(); x.lineWidth = 0.3; x.strokeStyle = css(r[3]); x.stroke();
    }
    if (d.id.startsWith('fur_')) for (let i = 0; i < 14; i++) line(x, 6 + ((i * 5) % 20), 12 + ((i * 7) % 16), 7 + ((i * 5) % 20), 14 + ((i * 7) % 16), 0.5, css(r[2]));
    volume(x, 0.22, 0.45);
    // side pocket
    x.fillStyle = 'rgba(0,0,0,0.2)';
    x.fillRect(8, 21, 16, 7);
    x.setLineDash([0.8, 0.8]);
    line(x, 8, 21, 24, 21, 0.4, css(r[0]));
    x.setLineDash([]);
  });
  // flap
  part(x, () => { x.beginPath(); x.moveTo(5.6, 9); x.quadraticCurveTo(6, 6.5, 9, 6.5); x.lineTo(23, 6.5); x.quadraticCurveTo(26, 6.5, 26.4, 9); x.lineTo(26, 17); x.quadraticCurveTo(16, 20, 6, 17); x.closePath(); }, grad(x, d.id === 'dragonhide_pack' ? MAT.hell : r, 5, 6, 27, 19), () => {
    x.setLineDash([0.8, 0.8]);
    x.beginPath(); x.moveTo(7, 16); x.quadraticCurveTo(16, 18.5, 25, 16); x.lineWidth = 0.4; x.strokeStyle = css(r[0]); x.stroke();
    x.setLineDash([]);
  }, 0.9);
  for (const sx of [11, 21]) {
    strap(x, sx, 8, sx, 22, 1.8, MAT.darkleather);
    buckle(x, sx, 19, 2.6, 2.4, d.id === 'dragonhide_pack' ? MAT.gold : MAT.bronze);
  }
  if (d.id === 'dragonhide_pack') gem(x, 16, 12, 1.4, 0xff8a20);
}

// ------------------------------------------------------------------ entry

/** Draws an equippable item's icon; returns false for kinds this module does not paint. */
export function drawGear(x: Ctx, d: ItemDef): boolean {
  if (d.weaponType) { drawWeapon(x, d); return true; }
  switch (d.kind) {
    case 'helmet': drawHelmet(x, d); return true;
    case 'armor': drawArmor(x, d); return true;
    case 'legs': drawLegs(x, d); return true;
    case 'boots': drawBoots(x, d); return true;
    case 'shield': drawShield(x, d); return true;
    case 'amulet':
    case 'ring': drawJewel(x, d); return true;
    case 'backpack': drawBackpack(x, d); return true;
    default: return false;
  }
}
