import type { ItemDef } from '../../game/inventory/items';

/**
 * One drawing of every weapon, shared by its inventory icon (ui/gearIcons.ts) and its
 * 3D model in the hand (models/weapons.ts), so the two can never drift apart again
 * (owner bug 2026-10-23: "knight weapons look different in the inventory than when you
 * put them on"). Pure data, no DOM or three.js.
 *
 * Every outline is in the icon's local frame: the weapon stands upright, its tip/head
 * toward −y, its grip toward +y, the shaft on x = 0, roughly 32 units tall. The icon
 * strokes and fills these paths (then tilts the whole drawing 45°); the 3D model
 * extrudes the same paths (or sweeps a tube along them) and maps local units to metres
 * with the weapon's hand point at the grip (see `PlanFrame`).
 */
export type Cmd = readonly ['M', number, number] | readonly ['L', number, number] | readonly ['Q', number, number, number, number] | readonly ['Z'];
export type Path = readonly Cmd[];

/** A closed polygon from flat x, y pairs. */
export function poly(p: readonly number[]): Path {
  const out: Cmd[] = [['M', p[0], p[1]]];
  for (let i = 2; i < p.length; i += 2) out.push(['L', p[i], p[i + 1]]);
  out.push(['Z']);
  return out;
}

/** An axis-aligned rectangle. */
export function rectPath(x0: number, y0: number, x1: number, y1: number): Path {
  return poly([x0, y0, x1, y0, x1, y1, x0, y1]);
}

/** Where the hand holds a weapon (icon units) and how many metres one icon unit is in 3D. */
export interface PlanFrame {
  /** Hand point (grip centre) in icon units. */
  hx: number;
  hy: number;
  /** Metres per icon unit along the weapon. */
  k: number;
}

// ------------------------------------------------------------------ swords and daggers

export type SwordStyle = 'dagger' | 'short' | 'long' | 'broad' | 'great' | 'curved';

export interface SwordDims {
  len: number; w: number; guardY: number; tip: number; gw: number;
  gripY0: number; gripY1: number; gripW: number; pommelY: number; pommelR: number;
}

export function swordDims(style: SwordStyle): SwordDims {
  const len = style === 'dagger' ? 15 : style === 'short' ? 21 : style === 'great' ? 29 : style === 'broad' ? 26 : 25;
  const w = style === 'broad' ? 4.4 : style === 'dagger' ? 2.8 : style === 'great' ? 3.8 : 3.3;
  const guardY = style === 'dagger' ? 3 : 6.5;
  const gw = style === 'dagger' ? 3.4 : style === 'broad' || style === 'great' ? 6.6 : 5.6;
  const gripLen = style === 'great' ? 9 : style === 'dagger' ? 5 : 6.5;
  return { len, w, guardY, tip: guardY - len, gw, gripY0: guardY + 1, gripY1: guardY + 1 + gripLen, gripW: 1.9, pommelY: guardY + 2.6 + gripLen, pommelR: 1.9 };
}

/** The blade: straight with a point, or the sabre's curve. */
export function swordBlade(d: SwordDims, style: SwordStyle): Path {
  const { w, guardY, tip, len } = d;
  if (style === 'curved') return [['M', -w / 2, guardY], ['Q', -w * 0.9, tip + len * 0.4, w * 0.9, tip], ['Q', w * 0.9, tip + len * 0.45, w / 2, guardY], ['Z']];
  return poly([-w / 2, guardY, -w / 2, tip + w * 1.6, 0, tip, w / 2, tip + w * 1.6, w / 2, guardY]);
}

/** The cross-guard: a bar with upturned, rounded quillons. */
export function swordGuard(d: SwordDims): Path {
  const { gw, guardY: g } = d;
  return [['M', -gw, g + 0.2], ['Q', -gw - 0.8, g - 1.8, -gw + 0.4, g - 1.6], ['L', gw - 0.4, g - 1.6], ['Q', gw + 0.8, g - 1.8, gw, g + 0.2], ['Q', 0, g + 1.6, -gw, g + 0.2], ['Z']];
}

// ------------------------------------------------------------------ axes

export type AxeStyle = 'hatchet' | 'battle' | 'double' | 'cleaver';

export interface AxeDims { small: boolean; top: number; bottom: number; hy: number; s: number; gripY0: number; gripY1: number }

export function axeDims(style: AxeStyle): AxeDims {
  const small = style === 'hatchet';
  return { small, top: small ? -12 : -18, bottom: small ? 19 : 21, hy: small ? -8 : -12, s: small ? 0.7 : 0.85, gripY0: 11, gripY1: 17.5 };
}

/** One blade of the head (side 1 = right, −1 = left). */
export function axeBlade(d: AxeDims, style: AxeStyle, side: number): Path {
  const { hy, s } = d;
  if (style === 'cleaver') return poly([side * 1.2, hy - 7, side * 8.5, hy - 9, side * 9.2, hy + 6, side * 1.2, hy + 3]);
  return [['M', side * 1.2, hy - 3 * s], ['Q', side * 5 * s, hy - 3.5 * s, side * 7.5 * s, hy - 8 * s], ['Q', side * 11.5 * s, hy, side * 7.5 * s, hy + 7 * s], ['Q', side * 5 * s, hy + 2.8 * s, side * 1.2, hy + 2.5 * s], ['Z']];
}

/** The curved cutting edge of a blade (for the bright edge line / the 3D edge strip). */
export function axeEdge(d: AxeDims, side: number): Path {
  const { hy, s } = d;
  return [['M', side * 7.5 * s, hy - 8 * s], ['Q', side * 11.5 * s, hy, side * 7.5 * s, hy + 7 * s]];
}

/** The battle axe's back spike. */
export const axeBackSpike = (d: AxeDims): Path => poly([-1.2, d.hy - 1.6, -6, d.hy - 0.4, -1.2, d.hy + 1.4]);
/** The socket the head sits on. */
export const axeSocket = (d: AxeDims): Path => rectPath(-2, d.hy - 3.6 * d.s, 2, d.hy - 3.6 * d.s + 6.6 * d.s);
/** The spike on top of the haft. */
export const axeTopSpike = (d: AxeDims): Path => poly([-1.1, d.hy - 3.6, 0, d.hy - 8, 1.1, d.hy - 3.6]);

// ------------------------------------------------------------------ clubs, maces and hammers

export const CLUB = { haftTop: -10, haftBottom: 19, gripY0: 10, gripY1: 17.5, pommelY: 18.6, pommelR: 1.6, headY: -12 } as const;

/** Morning star spike i of 10 (a flat triangle seen from the front). */
export function morningSpike(i: number): Path {
  const a = (i / 10) * Math.PI * 2;
  return poly([Math.cos(a - 0.3) * 4.6, -12 + Math.sin(a - 0.3) * 4.6, Math.cos(a) * 8.5, -12 + Math.sin(a) * 8.5, Math.cos(a + 0.3) * 4.6, -12 + Math.sin(a + 0.3) * 4.6]);
}
export const MORNING_BALL = { y: -12, r: 5.2, spikeR: 8.5 } as const;

/** War hammer: a one-sided block head with a striking plate, a beak spike behind. */
export const HAMMER = { x0: -1.8, x1: 8.7, y0: -17.5, y1: -9, faceX0: 6.5, faceX1: 9.5, faceY0: -18.2, faceY1: -8.3 } as const;
export const hammerSpike: Path = poly([-1.5, -13, -6.5, -10.5, -1.5, -10]);
export const thunderBolt: Path = poly([3, -17, 0, -13, 2.6, -13, 1, -9.5, 5, -14, 2.4, -14]);

/** Maul: a big block head, iron bands at BAND_Y, rivets at RIVETS. */
export const MAUL = { x0: -7.5, x1: 7.5, y0: -20, y1: -9, bands: [-17, -12], rivets: [[-5.5, -17], [5.5, -17], [-5.5, -12], [5.5, -12]] } as const;

/** Tusk club: a curved bone bound to the haft. */
export const tuskPath: Path = [['M', -1.5, -6], ['Q', -5, -14, -2, -21], ['Q', 4, -19, 4.5, -13], ['Q', 4, -8, 1.5, -6], ['Z']];
export const TUSK_STRAP_Y = -7;

/** Flanged mace: one flange's outline at x offset `ox` (the 3D model spins the centre one round the haft). */
export function flange(ox: number): Path {
  const o = ox >= 0 ? 1 : -1;
  return poly([ox, -19.5, ox + o * 1.8, -13, ox, -7, ox - o * 0.8, -13]);
}
/** The flange profile from the haft outwards (x ≥ 0), for the 3D flanges spun round the haft. */
export const flangeProfile: Path = poly([0, -20.8, 3.4, -19.8, 5.6, -17.2, 6.4, -13, 5.6, -9.4, 3.4, -7.2, 0, -6.6]);
export const FLANGE_XS = [-4.6, 4.6, -2.4, 2.4, 0] as const;
export const maceTopSpike: Path = poly([-1, -19.5, 0, -22.5, 1, -19.5]);
export const maceCollar: Path = rectPath(-2, -7.5, 2, -5.5);

// ------------------------------------------------------------------ bows and crossbows

/** Bows are recurved from uncommon up. */
export const isRecurve = (d: ItemDef): boolean => d.rarity !== 'common';

/** The bow stave's centre line (stroked in the icon, a tube in 3D). */
export function bowLimb(recurve: boolean): Path {
  const out: Cmd[] = [['M', recurve ? -1.5 : -3.4, -20.5]];
  if (recurve) out.push(['Q', -4.5, -18, -2, -15]);
  out.push(['Q', 7, -7, 4.5, 0], ['Q', 7, 7, recurve ? -2 : -3.4, recurve ? 15 : 20.5]);
  if (recurve) out.push(['Q', -4.5, 18, -1.5, 20.5]);
  return out;
}
export const BOW = { stringX: -3.4, stringY: 19.5, limbW: 2.4, gripX0: 3.4, gripX1: 6.4, gripY0: -3, gripY1: 3, nockR: 1.2, gemX: 5 } as const;
export const bowNockX = (recurve: boolean): number => (recurve ? -1.6 : -3.4);
/** Feathered wing ornament on elven bows (side ±1). */
export function bowWing(side: number): Path {
  return [['M', 5, side * 6], ['Q', 10, side * 9, 9.5, side * 13], ['Q', 7, side * 10, 4.5, side * 9], ['Z']];
}
/** Bows that carry the wing ornaments. */
export const hasBowWings = (d: ItemDef): boolean => d.setId === 'skyfeather' || d.id === 'elven_longbow' || d.id === 'sylvan_bow';

export const crossbowStock: Path = poly([-1.6, -14, 1.6, -14, 2, 12, 3.2, 19, -3.2, 19, -2, 12]);
/** The prod (bow arms) centre line. */
export const crossbowProd: Path = [['M', -11, -7], ['Q', 0, -16, 11, -7]];
export const CROSSBOW = { prodW: 2, boltY0: -16, boltY1: -3, latchY0: -12, latchY1: -9.4, gemY: 2, stringTo: -2 } as const;
export const crossbowBoltHead: Path = poly([-1.3, -15.5, 0, -19, 1.3, -15.5]);

// ------------------------------------------------------------------ thrown weapons

/** Four-pointed throwing star, centred on 0, 0. */
export const starPath: Path = poly([0, -14.5, 3, -3, 14.5, 0, 3, 3, 0, 14.5, -3, 3, -14.5, 0, -3, -3]);
export const STAR_HUB = 2.6;
export const SPEAR = { shaftY0: -12, shaftY1: 20, shaftW: 2, strapY: -9.5 } as const;
export const spearHead: Path = [['M', 0, -21.5], ['Q', 3.4, -16, 1.4, -11], ['L', -1.4, -11], ['Q', -3.4, -16, 0, -21.5], ['Z']];

// ------------------------------------------------------------------ wands and rods

export const WAND = { top: -8, bottom: 15, wTop: 1.5, wBottom: 0.9, rings: [-6, 4, 11], ringH: 1.4, ringW: 1.9, orbY: -12, orbR: 3.6 } as const;
export const wandShaft: Path = poly([-1.5, -8, 1.5, -8, 0.9, 15, -0.9, 15]);
export const wandProng = (side: number): Path => poly([side * 1.3, -7, side * 3.6, -12, side * 0.8, -9]);

export const ROD = { top: -14, bottom: 20.5, orbY: -19.5, orbR: 4.2, curlW: 1.2 } as const;
export const rodShaft: Path = poly([-1.4, -14, 1.4, -14, 1.1, 20.5, -1.1, 20.5]);
/** One of the two curling prongs that cradle the rod's orb (centre line). */
export const rodCurl = (side: number): Path => [['M', side * 1, -12], ['Q', side * 6, -17, side * 2, -23]];

// ------------------------------------------------------------------ hand points

/** Where the hand holds each family (icon units). */
export const HAND = {
  sword: (d: SwordDims) => ({ hx: 0, hy: (d.gripY0 + d.gripY1) / 2 }),
  axe: (d: AxeDims) => ({ hx: 0, hy: (d.gripY0 + d.gripY1) / 2 }),
  club: { hx: 0, hy: (CLUB.gripY0 + CLUB.gripY1) / 2 },
  bow: { hx: (BOW.gripX0 + BOW.gripX1) / 2, hy: 0 },
  crossbow: { hx: 0, hy: 9 },
  spear: { hx: 0, hy: 15 },
  star: { hx: 0, hy: 12 },
  wand: { hx: 0, hy: 10 },
  rod: { hx: 0, hy: 13 },
} as const;
