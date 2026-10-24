/**
 * How each cape looks (game/inventory/capes.ts has the rules). Pure data plus a
 * 2D-canvas painter shared by the item icon (ui/capeIcons.ts) and the cloth
 * texture of the 3D cape (models/capes3d.ts), so the icon and the worn cape
 * always match: base cloth, pattern, trim border, emblem and hem shape. The
 * animated effects (`fx`) are drawn by the 3D cape's shader; the icon shows a
 * still frame of them.
 */
export type CapeFx = 'none' | 'stars' | 'embers' | 'flames' | 'frost' | 'storm' | 'wisps' | 'glint' | 'aurora';
export type CapePattern = 'plain' | 'quartered' | 'stripes' | 'chevron' | 'waves' | 'check' | 'speckle' | 'leaves' | 'snow' | 'cracks' | 'scales' | 'rays' | 'pale' | 'web';
export type CapeEmblem =
  | 'fist' | 'mace' | 'swords' | 'axe' | 'target' | 'shield' | 'star' | 'tree' | 'fish' | 'pick' | 'anvil' | 'feather' | 'needle' | 'pot' | 'flame'
  | 'sun' | 'rose' | 'tower' | 'leaf' | 'mountain' | 'hill' | 'wheat' | 'skull' | 'serpent' | 'spider' | 'flake' | 'moon' | 'crown' | 'globe' | 'boulder';
export type CapeHem = 'straight' | 'pointed' | 'tattered' | 'scalloped' | 'swallow';

export interface CapeLook {
  /** Cloth colour, its shadow and the trim (border, clasp). */
  main: number;
  dark: number;
  trim: number;
  pattern: CapePattern;
  patternColor: number;
  emblem: CapeEmblem;
  emblemColor: number;
  hem: CapeHem;
  /** Fur or gold collar on the mantle. */
  collar: 'plain' | 'fur' | 'gold';
  fx: CapeFx;
  /** Colour of the animated effect. */
  fxColor?: number;
}

const L = (main: number, dark: number, trim: number, pattern: CapePattern, patternColor: number, emblem: CapeEmblem, emblemColor: number, hem: CapeHem = 'straight', collar: CapeLook['collar'] = 'plain', fx: CapeFx = 'none', fxColor?: number): CapeLook =>
  ({ main, dark, trim, pattern, patternColor, emblem, emblemColor, hem, collar, fx, fxColor });

export const CAPE_LOOK: Record<string, CapeLook> = {
  // combat skills
  brawler_cape: L(0x9a2420, 0x4a0e0c, 0x1a1210, 'chevron', 0x2a1210, 'fist', 0xf0d8b0, 'straight', 'plain'),
  cudgel_cape: L(0xb0662a, 0x5a2e10, 0x5a5048, 'speckle', 0x7a3a14, 'mace', 0x3a3430, 'scalloped', 'fur'),
  bladesworn_cape: L(0x2e4e86, 0x14223e, 0xd6deec, 'pale', 0x3a5e9a, 'swords', 0xe8eef8, 'pointed', 'plain'),
  axelord_cape: L(0x2f5a2a, 0x142a12, 0xc47c3a, 'quartered', 0x244a20, 'axe', 0xe0a050, 'straight', 'fur'),
  farshot_cape: L(0x3c6c34, 0x1a3216, 0xe0b03c, 'leaves', 0x2c5426, 'target', 0xf0d070, 'swallow', 'plain'),
  bulwark_cape: L(0x1e2e5a, 0x0c1430, 0xc8ccd2, 'check', 0x26386a, 'shield', 0xd6deec, 'straight', 'plain'),
  starweave_cape: L(0x241650, 0x0c0624, 0xc8a8ff, 'plain', 0x241650, 'star', 0xe8dcff, 'pointed', 'plain', 'stars', 0xe8e0ff),
  // trade skills
  timberwright_cape: L(0x6a4424, 0x34200e, 0x6c9a3a, 'stripes', 0x5a3a1e, 'tree', 0x8cc050, 'straight', 'fur'),
  tidecaller_cape: L(0x1e6a7a, 0x0a3440, 0xe8f4f8, 'waves', 0x2a8494, 'fish', 0xf0f8ff, 'scalloped', 'plain'),
  deepdelver_cape: L(0x4a4c52, 0x222428, 0xe8b232, 'speckle', 0xe8c050, 'pick', 0xd8dde6, 'straight', 'plain'),
  forgemaster_cape: L(0x2a2420, 0x100c0a, 0xff7a20, 'cracks', 0xa83a10, 'anvil', 0xff9a3a, 'straight', 'plain', 'embers', 0xff8a2a),
  quillwright_cape: L(0xd2c49c, 0x7a6c4c, 0x3c6c34, 'chevron', 0xb8a87c, 'feather', 0x3c6c34, 'swallow', 'plain'),
  artisan_cape: L(0x5c1e4c, 0x2a0a22, 0xe8b232, 'rays', 0x6e2a5c, 'needle', 0xf0d070, 'scalloped', 'gold'),
  hearthcook_cape: L(0xece4d4, 0x9a8e7a, 0xb8302a, 'check', 0xd8cdb8, 'pot', 0xb8302a, 'straight', 'plain'),
  // the trade skills of 2026-10-24
  windstride_cape: L(0x4a7aa8, 0x1e3a5a, 0xe8eef4, 'waves', 0x5a8ab8, 'feather', 0xf0f4f8, 'swallow', 'plain'),
  apothecary_cape: L(0x3a6a3a, 0x18321a, 0xd8c890, 'leaves', 0x2c582c, 'leaf', 0xe0d8a0, 'scalloped', 'plain'),
  tillers_cape: L(0x6a8a2a, 0x2e4212, 0xc8a050, 'stripes', 0x5a7a22, 'wheat', 0xe8c060, 'straight', 'plain'),
  trappers_cape: L(0x7a5a32, 0x3a2810, 0xd8c8a0, 'speckle', 0x6a4a28, 'hill', 0xe8dcc0, 'tattered', 'fur'),
  banewarden_cape: L(0x4a1214, 0x200608, 0xb8b0a0, 'cracks', 0x2a0a0a, 'skull', 0xe8e0d0, 'pointed', 'plain'),
  tidewalker_cape: L(0x1e4a6e, 0x0e2236, 0xe8d8a8, 'waves', 0x2a6a8e, 'star', 0xf0e4c0, 'swallow', 'plain'),
  shadowpurse_cape: L(0x2a2630, 0x100e14, 0x8a7a5a, 'speckle', 0x3a3442, 'moon', 0xb8a878, 'tattered', 'plain'),
  flamekeeper_cape: L(0x7a1e08, 0x3a0a02, 0xffc040, 'plain', 0x7a1e08, 'flame', 0xffe070, 'tattered', 'plain', 'flames', 0xffa020),
  // mastery
  grandmaster_mantle: L(0xf2ecdc, 0xa89a78, 0xe8b232, 'rays', 0xe8dcc0, 'sun', 0xe8b232, 'pointed', 'gold', 'glint', 0xfff0a0),
  // towns
  thornvale_cape: L(0x2a5a2a, 0x122a12, 0xe8b232, 'pale', 0x346a32, 'rose', 0xe8b232, 'straight', 'plain'),
  westmarch_cape: L(0x2a4a8a, 0x101e44, 0xf0f0f0, 'quartered', 0xe8ecf4, 'tower', 0x2a4a8a, 'straight', 'plain'),
  elderglen_cape: L(0x4a6a2a, 0x223214, 0x7a5a32, 'leaves', 0x5c7c34, 'leaf', 0xc8e090, 'tattered', 'plain'),
  stonedeep_cape: L(0x5a5a60, 0x2a2a30, 0xc47c3a, 'stripes', 0x4a4a50, 'mountain', 0xe0a050, 'straight', 'fur'),
  highmoor_cape: L(0x6a4a7a, 0x34203e, 0xece0c8, 'chevron', 0x7a5a8a, 'hill', 0xece0c8, 'scalloped', 'plain'),
  millbrook_cape: L(0xd0a844, 0x7a5a1a, 0x6a4424, 'stripes', 0xc09030, 'wheat', 0x6a4424, 'straight', 'plain'),
  // boss drops
  ashen_sovereign_mantle: L(0x2a0806, 0x0a0202, 0xb8301a, 'cracks', 0xff5a10, 'skull', 0xff7a30, 'tattered', 'fur', 'embers', 0xff4a10),
  mountainborn_mantle: L(0x5c5c4c, 0x2a2a20, 0x6a8a3a, 'cracks', 0x3a3a30, 'boulder', 0x8aaa4a, 'tattered', 'fur'),
  serpentstorm_cape: L(0x1e5a6a, 0x0a2a34, 0x9fe8ff, 'scales', 0x2a7a8a, 'serpent', 0xbff0ff, 'swallow', 'plain', 'storm', 0x9fe8ff),
  blightsilk_shroud: L(0x26321a, 0x0a1006, 0x8aa040, 'web', 0x5a6a30, 'spider', 0xb0d050, 'tattered', 'plain', 'wisps', 0x3e5a22),
  // deeds
  tyrantbane_cape: L(0x7a1010, 0x340404, 0xe8b232, 'pale', 0x8a1a16, 'crown', 0xe8b232, 'pointed', 'gold'),
  worldbreaker_mantle: L(0x16163a, 0x060618, 0x8ad0c0, 'plain', 0x16163a, 'globe', 0xbff0e0, 'pointed', 'fur', 'aurora', 0x6af0b0),
  // seasons
  frostfall_cape: L(0x9ad0f0, 0x3a7aa8, 0xffffff, 'snow', 0xffffff, 'flake', 0xffffff, 'scalloped', 'fur', 'frost', 0xd8f6ff),
  harvestmoon_cape: L(0xc86a1a, 0x5a2a08, 0x5a3a1a, 'leaves', 0xa84a10, 'moon', 0xffe8a0, 'tattered', 'plain'),
  // rewards: the task boards' seal shop and the festivals (liveops/)
  taskbearer_cape: L(0x5a4a30, 0x2a2014, 0xc9a24a, 'check', 0x4a3c26, 'feather', 0xe8c26a, 'straight', 'plain'),
  wayfinder_mantle: L(0x24384a, 0x0e1a24, 0xe8c26a, 'rays', 0x2e4658, 'globe', 0xe8c26a, 'pointed', 'gold', 'glint', 0xfff0a0),
  hollowmoon_cape: L(0x2a1a2e, 0x100810, 0xe07a1a, 'speckle', 0x3a2440, 'moon', 0xffa030, 'tattered', 'plain', 'embers', 0xff8a20),
  winterhearth_cape: L(0x8a1a1a, 0x3a0808, 0xf0f0f0, 'snow', 0xffffff, 'flake', 0xffffff, 'scalloped', 'fur', 'frost', 0xd8f6ff),
};

/** Look of any cape id (unknown ids get a plain brown cape). */
export function capeLook(id: string): CapeLook {
  return CAPE_LOOK[id] ?? L(0x7a5a3a, 0x3a2a1a, 0xc8a060, 'plain', 0x7a5a3a, 'star', 0xc8a060);
}

type Ctx = CanvasRenderingContext2D;
export const capeCss = (n: number, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

/** Small deterministic noise for patterns (same picture every time). */
function rnd(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The hem outline along the bottom edge, as points from right to left (y measured from the top). */
export function hemPoints(hem: CapeHem, w: number, h: number): number[] {
  const out: number[] = [];
  if (hem === 'tattered') {
    // a torn, fringed hem: ragged strips of uneven length with deep narrow rents between them
    const n = 22;
    for (let i = n; i >= 0; i--) {
      const u = i / n;
      const x = w * Math.min(1, Math.max(0, u + (rnd(i * 5.3) - 0.5) * (0.6 / n)));
      const cut = i % 2 ? 0.1 + rnd(i * 2.7) * 0.14 : rnd(i * 3.1) * 0.05;
      out.push(x, h - cut * h);
    }
    return out;
  }
  const n = 8;
  for (let i = n; i >= 0; i--) {
    const x = (w * i) / n;
    const u = i / n;
    let y = h;
    if (hem === 'pointed') y = h - Math.abs(u - 0.5) * h * 0.18;
    else if (hem === 'swallow') y = h - (0.5 - Math.abs(u - 0.5)) * h * 0.22;
    else if (hem === 'scalloped') y = h - (i % 2 ? h * 0.05 : 0);
    out.push(x, y);
  }
  return out;
}

function pattern(x: Ctx, lk: CapeLook, w: number, h: number): void {
  const c = capeCss(lk.patternColor);
  x.fillStyle = c;
  x.strokeStyle = c;
  const s = w / 32;
  switch (lk.pattern) {
    case 'quartered':
      x.fillRect(w / 2, 0, w / 2, h / 2);
      x.fillRect(0, h / 2, w / 2, h / 2);
      break;
    case 'pale':
      x.fillRect(w * 0.36, 0, w * 0.28, h);
      break;
    case 'stripes':
      for (let i = 0; i < 6; i++) if (i % 2) x.fillRect(0, (h * i) / 6, w, h / 12);
      break;
    case 'chevron':
      x.lineWidth = 3 * s;
      for (let k = 0; k < 3; k++) {
        const y = h * (0.55 + k * 0.13);
        x.beginPath(); x.moveTo(0, y - h * 0.1); x.lineTo(w / 2, y); x.lineTo(w, y - h * 0.1); x.stroke();
      }
      break;
    case 'waves':
      x.lineWidth = 2.2 * s;
      for (let k = 0; k < 5; k++) {
        const y0 = h * (0.5 + k * 0.1);
        x.beginPath();
        for (let i = 0; i <= 16; i++) { const px = (w * i) / 16; const py = y0 + Math.sin(i * 1.2) * h * 0.02; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.stroke();
      }
      break;
    case 'check': {
      const n = 8;
      for (let j = 0; j < n * 1.5; j++) for (let i = 0; i < n; i++) if ((i + j) % 2) x.fillRect((w * i) / n, (w * j) / n, w / n, w / n);
      break;
    }
    case 'speckle':
      for (let i = 0; i < 70; i++) x.fillRect(rnd(i) * w, rnd(i + 99) * h, 1.6 * s, 1.6 * s);
      break;
    case 'leaves':
      for (let i = 0; i < 26; i++) {
        const px = rnd(i) * w, py = rnd(i + 7) * h;
        x.beginPath(); x.ellipse(px, py, 2.4 * s, 1.1 * s, rnd(i + 3) * Math.PI, 0, Math.PI * 2); x.fill();
      }
      break;
    case 'snow':
      for (let i = 0; i < 40; i++) x.fillRect(rnd(i) * w, rnd(i + 51) * h, 1.4 * s, 1.4 * s);
      break;
    case 'cracks':
      x.lineWidth = 1.2 * s;
      for (let k = 0; k < 7; k++) {
        let px = rnd(k) * w, py = h;
        x.beginPath(); x.moveTo(px, py);
        for (let i = 0; i < 5; i++) { px += (rnd(k * 9 + i) - 0.5) * w * 0.2; py -= h * (0.05 + rnd(k + i * 3) * 0.08); x.lineTo(px, py); }
        x.stroke();
      }
      break;
    case 'scales':
      x.lineWidth = 1.1 * s;
      for (let j = 0; j < 14; j++) for (let i = 0; i < 9; i++) {
        x.beginPath(); x.arc((w * (i + (j % 2) * 0.5)) / 8, (h * j) / 13, w / 16, 0, Math.PI); x.stroke();
      }
      break;
    case 'rays':
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2, a1 = a0 + Math.PI / 12;
        x.beginPath(); x.moveTo(w / 2, h * 0.42);
        x.lineTo(w / 2 + Math.cos(a0) * h, h * 0.42 + Math.sin(a0) * h);
        x.lineTo(w / 2 + Math.cos(a1) * h, h * 0.42 + Math.sin(a1) * h);
        x.fill();
      }
      break;
    case 'web':
      x.lineWidth = 0.9 * s;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        x.beginPath(); x.moveTo(w / 2, h * 0.42); x.lineTo(w / 2 + Math.cos(a) * h, h * 0.42 + Math.sin(a) * h); x.stroke();
      }
      for (let r = 1; r < 6; r++) { x.beginPath(); x.arc(w / 2, h * 0.42, r * w * 0.12, 0, Math.PI * 2); x.stroke(); }
      break;
    default:
      break;
  }
}

/** Draws an emblem centred at cx, cy, about `s` wide. */
export function drawCapeEmblem(x: Ctx, e: CapeEmblem, cx: number, cy: number, s: number, color: number, outline: number): void {
  const k = s / 10;
  x.save();
  x.translate(cx, cy);
  x.scale(k, k);
  x.fillStyle = capeCss(color);
  x.strokeStyle = capeCss(outline);
  x.lineWidth = 1.1;
  x.lineJoin = 'round';
  const P = (pts: number[], close = true) => { x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); if (close) x.closePath(); };
  const F = () => { x.fill(); x.stroke(); };
  const C = (px: number, py: number, r: number) => { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); };
  switch (e) {
    case 'fist': P([-4, -2, 4, -2, 4.5, 3, 2, 5, -3, 5, -4.5, 2]); F(); x.beginPath(); for (const fx of [-2, 0, 2]) { x.moveTo(fx, -2); x.lineTo(fx, 1); } x.stroke(); break;
    case 'mace': P([-0.8, 5, 0.8, 5, 0.8, -1, -0.8, -1]); F(); C(0, -3, 3); F(); for (const [a, b] of [[0, -7], [3.6, -3], [-3.6, -3]]) { P([a - 1, b + 1, a + 1, b + 1, a, b - 0.6]); F(); } break;
    case 'swords': for (const sgn of [-1, 1]) { x.save(); x.rotate(sgn * 0.6); P([-0.8, -6, 0.8, -6, 0.8, 3, -0.8, 3]); F(); P([-2.6, 3, 2.6, 3, 2.6, 4, -2.6, 4]); F(); x.restore(); } break;
    case 'axe': P([-0.7, 6, 0.7, 6, 0.7, -6, -0.7, -6]); F(); P([0.7, -5, 5, -6.5, 5.5, -1, 0.7, -2]); F(); break;
    case 'target': for (const r of [5, 3.4, 1.8]) { C(0, 0, r); x.fillStyle = r === 3.4 ? capeCss(outline) : capeCss(color); F(); } x.beginPath(); x.moveTo(-6, 6); x.lineTo(1, -1); x.stroke(); break;
    case 'shield': P([-4.5, -5, 4.5, -5, 4, 1.5, 0, 6, -4, 1.5]); F(); x.beginPath(); x.moveTo(0, -4); x.lineTo(0, 4.5); x.moveTo(-3.5, -1); x.lineTo(3.5, -1); x.stroke(); break;
    case 'star': { const pts: number[] = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 2.4 : 6; pts.push(Math.cos(a) * r, Math.sin(a) * r); } P(pts); F(); break; }
    case 'tree': P([-0.9, 6, 0.9, 6, 0.9, 1, -0.9, 1]); F(); P([0, -6.5, 5, 1.5, -5, 1.5]); F(); P([0, -4, 3.5, -0.5, -3.5, -0.5]); x.fill(); break;
    case 'fish': x.beginPath(); x.ellipse(-0.5, 0, 4.5, 2.6, 0, 0, Math.PI * 2); F(); P([3.5, 0, 6.5, -3, 6.5, 3]); F(); C(-2.6, -0.6, 0.6); x.fillStyle = capeCss(outline); x.fill(); break;
    case 'pick': x.save(); x.rotate(0.5); P([-0.7, -2, 0.7, -2, 0.7, 7, -0.7, 7]); F(); P([-6, -2.5, 0, -4.5, 6, -2.5, 0, -2.8]); F(); x.restore(); break;
    case 'anvil': P([-6, -3, 5, -3, 6.5, -2, 3, -0.5, 2, 2, 4, 4, -4, 4, -2, 2, -3, -0.5, -6, -1.5]); F(); break;
    case 'feather': x.save(); x.rotate(0.4); x.beginPath(); x.ellipse(0, -1, 2.6, 6, 0, 0, Math.PI * 2); F(); x.beginPath(); x.moveTo(0, -6); x.lineTo(0, 7); x.stroke(); x.restore(); break;
    case 'needle': x.save(); x.rotate(0.7); P([-0.6, -6, 0.6, -6, 0.3, 6, -0.3, 6]); F(); x.restore(); x.beginPath(); x.moveTo(-3, -5); x.bezierCurveTo(5, -5, -5, 3, 4, 5); x.lineWidth = 1.4; x.strokeStyle = capeCss(color); x.stroke(); break;
    case 'pot': P([-5, -2, 5, -2, 4, 4, -4, 4]); F(); P([-6, -3, 6, -3, 6, -2, -6, -2]); F(); x.beginPath(); for (const fx of [-2, 0.5, 3]) { x.moveTo(fx, -4); x.quadraticCurveTo(fx + 1.5, -6, fx, -8); } x.stroke(); break;
    case 'flame': P([0, -7, 3, -2, 4.5, 2, 2.5, 6, -2.5, 6, -4.5, 2, -2, -1, -1, -3.5]); F(); x.fillStyle = capeCss(outline, 0.45); P([0, -1, 2, 2.5, 1, 5, -1, 5, -2, 2.5]); x.fill(); break;
    case 'sun': C(0, 0, 3.2); F(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; x.save(); x.rotate(a); P([-1, -4.2, 1, -4.2, 0, -7]); F(); x.restore(); } break;
    case 'rose': for (let i = 0; i < 5; i++) { const a = (i * Math.PI * 2) / 5; C(Math.cos(a) * 2.4, Math.sin(a) * 2.4 - 1, 2.2); F(); } C(0, -1, 1.4); x.fillStyle = capeCss(outline); x.fill(); x.beginPath(); x.moveTo(0, 2); x.lineTo(0, 7); x.moveTo(0, 5); x.lineTo(2.5, 3.5); x.stroke(); break;
    case 'tower': P([-3, 6, 3, 6, 3, -3, 4, -3, 4, -6, 2.5, -6, 2.5, -4.5, 0.8, -4.5, 0.8, -6, -0.8, -6, -0.8, -4.5, -2.5, -4.5, -2.5, -6, -4, -6, -4, -3, -3, -3]); F(); x.fillStyle = capeCss(outline); x.fillRect(-0.8, 2.5, 1.6, 3.5); break;
    case 'leaf': x.save(); x.rotate(-0.5); x.beginPath(); x.ellipse(0, 0, 3.4, 6.5, 0, 0, Math.PI * 2); F(); x.beginPath(); x.moveTo(0, -6); x.lineTo(0, 7); x.stroke(); x.restore(); break;
    case 'mountain': P([-6.5, 5, -1.5, -4, 1, 0, 3, -2.5, 6.5, 5]); F(); x.fillStyle = capeCss(0xffffff, 0.8); P([-1.5, -4, -3, -1.3, -0.3, -1.6]); x.fill(); break;
    case 'hill': x.beginPath(); x.moveTo(-6.5, 5); x.quadraticCurveTo(-2, -5, 2, 0); x.quadraticCurveTo(4.5, -3, 6.5, 5); x.closePath(); F(); break;
    case 'wheat': x.beginPath(); x.moveTo(0, 7); x.lineTo(0, -6); x.stroke(); for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { x.beginPath(); x.ellipse(sg * 1.6, -4 + i * 2.4, 1.2, 2, sg * 0.6, 0, Math.PI * 2); F(); } break;
    case 'skull': C(0, -1.5, 4.6); F(); P([-2.6, 2, 2.6, 2, 2, 5.5, -2, 5.5]); F(); x.fillStyle = capeCss(outline); C(-1.8, -1.6, 1.3); x.fill(); C(1.8, -1.6, 1.3); x.fill(); break;
    case 'serpent': x.beginPath(); x.moveTo(-5, 6); x.bezierCurveTo(-6, 1, 5, 2, 3, -2); x.bezierCurveTo(1, -6, -4, -4, -2, -6); x.lineWidth = 2.4; x.strokeStyle = capeCss(color); x.stroke(); C(-2, -6, 1.6); F(); break;
    case 'spider': x.beginPath(); for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { x.moveTo(0, 0); x.lineTo(sg * 4, -3 + i * 2); x.lineTo(sg * 6, -1 + i * 2.6); } x.lineWidth = 1.2; x.strokeStyle = capeCss(color); x.stroke(); x.beginPath(); x.ellipse(0, 1.5, 2.4, 3.2, 0, 0, Math.PI * 2); F(); C(0, -2.2, 1.6); F(); break;
    case 'flake': x.lineWidth = 1.6; x.strokeStyle = capeCss(color); for (let i = 0; i < 3; i++) { x.save(); x.rotate((i * Math.PI) / 3); x.beginPath(); x.moveTo(0, -6.5); x.lineTo(0, 6.5); for (const sy of [-4, 4]) { x.moveTo(-1.8, sy - Math.sign(sy) * 1.5); x.lineTo(0, sy); x.lineTo(1.8, sy - Math.sign(sy) * 1.5); } x.stroke(); x.restore(); } break;
    case 'moon': x.beginPath(); x.arc(0, 0, 5.5, 0, Math.PI * 2); x.fill(); x.stroke(); x.fillStyle = capeCss(outline, 0.35); C(2.5, -1.5, 1.1); x.fill(); C(-1.8, 2, 1.4); x.fill(); C(-1.5, -2.5, 0.7); x.fill(); break;
    case 'crown': P([-5.5, 4, 5.5, 4, 6, -4, 3, -0.5, 0, -5.5, -3, -0.5, -6, -4]); F(); x.beginPath(); x.moveTo(0, 6); x.lineTo(0, -1); x.lineWidth = 1.6; x.stroke(); break;
    case 'globe': C(0, 0, 5.5); F(); x.beginPath(); x.ellipse(0, 0, 2.4, 5.5, 0, 0, Math.PI * 2); x.moveTo(-5.5, 0); x.lineTo(5.5, 0); x.stroke(); x.beginPath(); x.moveTo(-6.5, -6); x.lineTo(6.5, 6); x.lineWidth = 1.8; x.stroke(); break;
    case 'boulder': P([-5.5, 4.5, -6, -0.5, -3, -4.5, 2, -5.5, 5.5, -1.5, 6, 3.5, 2, 5.5]); F(); x.beginPath(); x.moveTo(-3, -1); x.lineTo(0, 1); x.lineTo(3, -2); x.moveTo(0, 1); x.lineTo(0.5, 4); x.stroke(); break;
  }
  x.restore();
}

/** A still frame of the animated effect (icon only; the 3D cape animates it in its shader). */
function fxStill(x: Ctx, lk: CapeLook, w: number, h: number): void {
  if (lk.fx === 'none' || lk.fxColor === undefined) return;
  const s = w / 32;
  const c = capeCss(lk.fxColor);
  x.fillStyle = c;
  switch (lk.fx) {
    case 'stars':
      for (let i = 0; i < 18; i++) { const px = rnd(i + 5) * w, py = rnd(i + 40) * h, r = (rnd(i) > 0.7 ? 1.3 : 0.7) * s; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
      break;
    case 'embers':
    case 'flames': {
      const g = x.createLinearGradient(0, h, 0, h * (lk.fx === 'flames' ? 0.55 : 0.75));
      g.addColorStop(0, capeCss(lk.fxColor, 0.9)); g.addColorStop(1, capeCss(lk.fxColor, 0));
      x.fillStyle = g; x.fillRect(0, h * 0.5, w, h * 0.5);
      x.fillStyle = capeCss(0xffe080);
      for (let i = 0; i < 12; i++) x.fillRect(rnd(i * 2) * w, h * (0.35 + rnd(i + 17) * 0.6), 1.2 * s, 1.2 * s);
      break;
    }
    case 'frost':
      x.fillStyle = capeCss(lk.fxColor, 0.5);
      x.beginPath(); x.moveTo(0, h * 0.25); x.lineTo(w, h * 0.45); x.lineTo(w, h * 0.55); x.lineTo(0, h * 0.35); x.fill();
      break;
    case 'storm':
      x.strokeStyle = c; x.lineWidth = 1.3 * s;
      x.beginPath(); x.moveTo(w * 0.3, h * 0.05); x.lineTo(w * 0.42, h * 0.3); x.lineTo(w * 0.32, h * 0.45); x.lineTo(w * 0.5, h * 0.75); x.stroke();
      break;
    case 'wisps':
      for (let i = 0; i < 5; i++) { x.fillStyle = capeCss(lk.fxColor, 0.25); x.beginPath(); x.ellipse(rnd(i + 3) * w, h * (0.2 + rnd(i) * 0.7), 3 * s, 6 * s, 0.3, 0, Math.PI * 2); x.fill(); }
      break;
    case 'glint': {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0.35, capeCss(lk.fxColor, 0)); g.addColorStop(0.45, capeCss(lk.fxColor, 0.55)); g.addColorStop(0.55, capeCss(lk.fxColor, 0));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      break;
    }
    case 'aurora': {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, capeCss(0x6af0b0, 0.45)); g.addColorStop(0.5, capeCss(0x9a6aff, 0.45)); g.addColorStop(1, capeCss(0x6af0b0, 0.45));
      x.fillStyle = g;
      x.beginPath(); x.moveTo(0, h * 0.2); x.bezierCurveTo(w * 0.3, h * 0.05, w * 0.6, h * 0.4, w, h * 0.2); x.lineTo(w, h * 0.45); x.bezierCurveTo(w * 0.6, h * 0.6, w * 0.3, h * 0.3, 0, h * 0.45); x.fill();
      break;
    }
  }
}

/**
 * Paints the cloth face of a cape into a w×h box at the origin: shading, pattern,
 * trim border, emblem and (for icons) a still of the effect. The hem shape is cut
 * out (transparent), so the 3D cape gets its pointed or tattered edge from alpha.
 */
export function paintCapeFace(x: Ctx, lk: CapeLook, w: number, h: number, still = false): void {
  x.save();
  // the cape silhouette: straight sides, the hem below
  const hem = hemPoints(lk.hem, w, h);
  x.beginPath();
  x.moveTo(0, 0); x.lineTo(w, 0);
  for (let i = 0; i < hem.length; i += 2) x.lineTo(hem[i], hem[i + 1]);
  x.closePath();
  x.clip();
  // cloth: lighter in the middle (folds), darker at the edges and the bottom
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, capeCss(lk.dark)); g.addColorStop(0.3, capeCss(lk.main)); g.addColorStop(0.7, capeCss(lk.main)); g.addColorStop(1, capeCss(lk.dark));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  pattern(x, lk, w, h);
  // vertical fold shadows
  for (const fx of [0.22, 0.5, 0.78]) {
    const f = x.createLinearGradient(w * (fx - 0.08), 0, w * (fx + 0.08), 0);
    f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.5, 'rgba(0,0,0,0.22)'); f.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = f; x.fillRect(w * (fx - 0.08), h * 0.15, w * 0.16, h);
  }
  const v = x.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(255,255,255,0.10)'); v.addColorStop(0.6, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.30)');
  x.fillStyle = v; x.fillRect(0, 0, w, h);
  if (still) fxStill(x, lk, w, h);
  else {
    // worn cloth on the 3D cape: a coarse weave, road grime rising from the hem, a few darker stains
    const s = w / 64;
    x.fillStyle = 'rgba(0,0,0,0.07)';
    for (let yy = 0; yy < h; yy += 2 * s) x.fillRect(0, yy, w, 0.7 * s);
    x.fillStyle = 'rgba(255,255,255,0.035)';
    for (let xx = 0; xx < w; xx += 2 * s) x.fillRect(xx, 0, 0.7 * s, h);
    const grime = x.createLinearGradient(0, h * 0.62, 0, h);
    grime.addColorStop(0, 'rgba(30,20,10,0)'); grime.addColorStop(1, 'rgba(30,20,10,0.38)');
    x.fillStyle = grime; x.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = `rgba(20,12,6,${0.08 + rnd(i + 70) * 0.1})`;
      x.beginPath(); x.ellipse(rnd(i + 30) * w, h * (0.35 + rnd(i + 50) * 0.6), (2 + rnd(i) * 5) * s, (1.5 + rnd(i + 9) * 3) * s, rnd(i + 2) * 3, 0, Math.PI * 2); x.fill();
    }
  }
  drawCapeEmblem(x, lk.emblem, w / 2, h * 0.42, w * 0.46, lk.emblemColor, lk.dark);
  // trim: both edges and the hem
  const t = Math.max(1.5, w * 0.07);
  x.fillStyle = capeCss(lk.trim);
  x.fillRect(0, 0, t, h);
  x.fillRect(w - t, 0, t, h);
  x.strokeStyle = capeCss(lk.trim);
  x.lineWidth = t * 1.6;
  x.beginPath();
  for (let i = 0; i < hem.length; i += 2) i ? x.lineTo(hem[i], hem[i + 1]) : x.moveTo(hem[i], hem[i + 1]);
  x.stroke();
  x.restore();
}
