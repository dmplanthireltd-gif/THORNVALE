/**
 * A player character's own look (render-agnostic): body type, skin, hair, beard, build,
 * eyes and the colours of the plain clothes worn under any armour. Worn gear is drawn on
 * top (render/models/playerModel.ts), so there are no "outfits" for players any more.
 *
 * Ids in the lists below are stable forever (they live in saves). Lists only ever grow:
 * the wire format (`encodeAppearance`) sends list positions, so never reorder or remove.
 */
export type BodyType = 'male' | 'female';
export type Build = 'slim' | 'average' | 'broad';

export interface Appearance {
  body: BodyType;
  /** Index into SKIN_TONES. */
  skin: number;
  /** Id from HAIR_STYLES. */
  hair: string;
  /** Index into HAIR_COLORS (also used for beards and brows). */
  hairColor: number;
  /** Id from BEARDS ('none' for female bodies). */
  beard: string;
  build: Build;
  /** Index into EYE_COLORS. */
  eyes: number;
  /** Indices into CLOTH_COLORS: shirt/tunic and trousers, shown where no armour is worn. */
  top: number;
  bottom: number;
  /** Id from SCARS ('none' = no scar); any body type (save v15+). */
  scar: string;
}

export const BODY_TYPES: Array<{ id: BodyType; name: string }> = [
  { id: 'male', name: 'Male' },
  { id: 'female', name: 'Female' },
];

export const BUILDS: Array<{ id: Build; name: string }> = [
  { id: 'slim', name: 'Slim' },
  { id: 'average', name: 'Average' },
  { id: 'broad', name: 'Broad' },
];

/** Light to dark. */
export const SKIN_TONES: number[] = [0xf6d7c0, 0xefc39f, 0xe7b48a, 0xd59a6c, 0xbb7f52, 0x9a6440, 0x77492c, 0x55331f];

export const HAIR_STYLES: Array<{ id: string; name: string }> = [
  { id: 'bald', name: 'Bald' },
  { id: 'buzz', name: 'Buzz cut' },
  { id: 'short', name: 'Short' },
  { id: 'swept', name: 'Swept' },
  { id: 'curly', name: 'Curly' },
  { id: 'bob', name: 'Bob' },
  { id: 'long', name: 'Long' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'bun', name: 'Bun' },
  { id: 'braids', name: 'Braids' },
  { id: 'mohawk', name: 'Mohawk' },
  { id: 'topknot', name: 'Topknot' },
];

export const HAIR_COLORS: Array<{ name: string; hex: number }> = [
  { name: 'Black', hex: 0x1b1612 },
  { name: 'Dark brown', hex: 0x3b2618 },
  { name: 'Brown', hex: 0x5e3b22 },
  { name: 'Chestnut', hex: 0x7a4425 },
  { name: 'Auburn', hex: 0x8e3a1e },
  { name: 'Copper', hex: 0xb5582a },
  { name: 'Golden', hex: 0xc99a4a },
  { name: 'Ash blonde', hex: 0xb9a57c },
  { name: 'Platinum', hex: 0xe2d9bf },
  { name: 'Grey', hex: 0x8d8a86 },
  { name: 'Crimson', hex: 0x8a1c22 },
  { name: 'Midnight', hex: 0x24304f },
];

export const BEARDS: Array<{ id: string; name: string }> = [
  { id: 'none', name: 'None' },
  { id: 'stubble', name: 'Stubble' },
  { id: 'moustache', name: 'Moustache' },
  { id: 'goatee', name: 'Goatee' },
  { id: 'short', name: 'Short beard' },
  { id: 'full', name: 'Full beard' },
  // 2026-10-23 (grim look): more beards
  { id: 'chinstrap', name: 'Chinstrap' },
  { id: 'mutton', name: 'Mutton chops' },
  { id: 'handlebar', name: 'Handlebar' },
  { id: 'forked', name: 'Forked beard' },
  { id: 'braided', name: 'Braided beard' },
  { id: 'long', name: 'Long beard' },
  { id: 'wild', name: 'Wild beard' },
];

/** Battle scars (2026-10-23, grim look). Any body type. */
export const SCARS: Array<{ id: string; name: string }> = [
  { id: 'none', name: 'None' },
  { id: 'brow', name: 'Split brow' },
  { id: 'cheek', name: 'Cheek slash' },
  { id: 'eye', name: 'Blind eye' },
  { id: 'lip', name: 'Split lip' },
  { id: 'jaw', name: 'Jaw line' },
  { id: 'cross', name: 'Crossed cuts' },
  { id: 'claw', name: 'Claw marks' },
  { id: 'burn', name: 'Burn' },
  { id: 'nose', name: 'Broken nose' },
];

export const EYE_COLORS: Array<{ name: string; hex: number }> = [
  { name: 'Brown', hex: 0x4a2c16 },
  { name: 'Hazel', hex: 0x7a5a2a },
  { name: 'Green', hex: 0x3f7a3a },
  { name: 'Blue', hex: 0x3a6aa8 },
  { name: 'Grey', hex: 0x7a8088 },
  { name: 'Amber', hex: 0xb07a20 },
];

/** Plain dyed cloth, muted to sit with the bronze-and-earth world. */
export const CLOTH_COLORS: Array<{ name: string; hex: number }> = [
  { name: 'Undyed', hex: 0xcdbb98 },
  { name: 'Oat', hex: 0xa8946c },
  { name: 'Umber', hex: 0x6a4a30 },
  { name: 'Charcoal', hex: 0x34302c },
  { name: 'Ash', hex: 0x8a8682 },
  { name: 'White', hex: 0xe8e2d4 },
  { name: 'Madder', hex: 0x9a2e24 },
  { name: 'Rust', hex: 0xb05a2a },
  { name: 'Ochre', hex: 0xc0922e },
  { name: 'Moss', hex: 0x5e6a2e },
  { name: 'Forest', hex: 0x2f5a36 },
  { name: 'Teal', hex: 0x2c6a6a },
  { name: 'Woad', hex: 0x2e4a7a },
  { name: 'Navy', hex: 0x222a4a },
  { name: 'Plum', hex: 0x5a2a4e },
  { name: 'Wine', hex: 0x5e1a26 },
];

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'male', skin: 2, hair: 'short', hairColor: 2, beard: 'none', build: 'average', eyes: 0, top: 12, bottom: 2, scar: 'none',
};

const inRange = (n: unknown, len: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < len;

/** Strict check: every field present and in range (commands and network input). */
export function isAppearance(a: unknown): a is Appearance {
  if (!a || typeof a !== 'object') return false;
  const x = a as Partial<Appearance>;
  return BODY_TYPES.some((b) => b.id === x.body)
    && inRange(x.skin, SKIN_TONES.length)
    && HAIR_STYLES.some((h) => h.id === x.hair)
    && inRange(x.hairColor, HAIR_COLORS.length)
    && BEARDS.some((b) => b.id === x.beard)
    && (x.body === 'male' || x.beard === 'none')
    && BUILDS.some((b) => b.id === x.build)
    && inRange(x.eyes, EYE_COLORS.length)
    && inRange(x.top, CLOTH_COLORS.length)
    && inRange(x.bottom, CLOTH_COLORS.length)
    && SCARS.some((c) => c.id === x.scar);
}

/** Lenient: keeps every valid field of a stored appearance and fills the rest from the default (saves). */
export function sanitizeAppearance(a: unknown): Appearance {
  const x = (a && typeof a === 'object' ? a : {}) as Partial<Appearance>;
  const d = DEFAULT_APPEARANCE;
  const body = BODY_TYPES.some((b) => b.id === x.body) ? x.body! : d.body;
  const beard = body === 'male' && BEARDS.some((b) => b.id === x.beard) ? x.beard! : 'none';
  return {
    body,
    skin: inRange(x.skin, SKIN_TONES.length) ? x.skin : d.skin,
    hair: HAIR_STYLES.some((h) => h.id === x.hair) ? x.hair! : d.hair,
    hairColor: inRange(x.hairColor, HAIR_COLORS.length) ? x.hairColor : d.hairColor,
    beard,
    build: BUILDS.some((b) => b.id === x.build) ? x.build! : d.build,
    eyes: inRange(x.eyes, EYE_COLORS.length) ? x.eyes : d.eyes,
    top: inRange(x.top, CLOTH_COLORS.length) ? x.top : d.top,
    bottom: inRange(x.bottom, CLOTH_COLORS.length) ? x.bottom : d.bottom,
    scar: SCARS.some((c) => c.id === x.scar) ? x.scar! : 'none',
  };
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return encodeAppearance(a).every((v, i) => v === encodeAppearance(b)[i]);
}

/** Compact wire form: ten small numbers (list positions), e.g. [0,2,2,2,0,1,0,12,2,0] (the scar was added in protocol 28). */
export function encodeAppearance(a: Appearance): number[] {
  return [
    BODY_TYPES.findIndex((b) => b.id === a.body), a.skin, HAIR_STYLES.findIndex((h) => h.id === a.hair), a.hairColor,
    BEARDS.findIndex((b) => b.id === a.beard), BUILDS.findIndex((b) => b.id === a.build), a.eyes, a.top, a.bottom,
    Math.max(0, SCARS.findIndex((c) => c.id === a.scar)),
  ];
}

/** Reverse of encodeAppearance; null when the array is not a valid appearance. Nine numbers (no scar) still decode. */
export function decodeAppearance(v: unknown): Appearance | null {
  if (!Array.isArray(v) || v.length < 9) return null;
  const a = {
    body: BODY_TYPES[v[0]]?.id, skin: v[1], hair: HAIR_STYLES[v[2]]?.id, hairColor: v[3], beard: BEARDS[v[4]]?.id,
    build: BUILDS[v[5]]?.id, eyes: v[6], top: v[7], bottom: v[8], scar: v.length > 9 ? SCARS[v[9]]?.id : 'none',
  };
  return isAppearance(a) ? a : null;
}

/** A random look (bots, the designer's Random button). `rnd` returns 0 ≤ x < 1. */
export function randomAppearance(rnd: () => number = Math.random, body?: BodyType): Appearance {
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const b = body ?? pick(BODY_TYPES).id;
  // natural hair colours most of the time, the dyed ones now and then
  const hairColor = rnd() < 0.85 ? Math.floor(rnd() * 10) % 10 : 10 + (Math.floor(rnd() * 2) % 2);
  const hairPool = b === 'male'
    ? ['bald', 'buzz', 'short', 'short', 'swept', 'curly', 'long', 'ponytail', 'braids', 'mohawk', 'topknot']
    : ['short', 'bob', 'bob', 'long', 'long', 'ponytail', 'ponytail', 'bun', 'braids', 'braids', 'curly', 'swept', 'mohawk'];
  return {
    body: b,
    skin: Math.floor(rnd() * SKIN_TONES.length) % SKIN_TONES.length,
    hair: pick(hairPool),
    hairColor,
    beard: b === 'male' && rnd() < 0.6 ? pick(BEARDS.slice(1)).id : 'none',
    build: pick(BUILDS).id,
    eyes: Math.floor(rnd() * EYE_COLORS.length) % EYE_COLORS.length,
    top: Math.floor(rnd() * CLOTH_COLORS.length) % CLOTH_COLORS.length,
    bottom: Math.floor(rnd() * CLOTH_COLORS.length) % CLOTH_COLORS.length,
    // drawn last, so the other picks stay what they were before scars existed
    scar: rnd() < 0.3 ? pick(SCARS.slice(1)).id : 'none',
  };
}

// ------------------------------------------------------------------ old outfits → appearance

function nearest(hex: number, list: Array<{ hex: number }>, skip: number[] = []): number {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  let best = 0;
  let bd = Infinity;
  list.forEach((c, i) => {
    if (skip.includes(i)) return;
    const dr = ((c.hex >> 16) & 255) - r, dg = ((c.hex >> 8) & 255) - g, db = (c.hex & 255) - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

/**
 * Save v10 → v11: a character's old outfit becomes an appearance that keeps its colours
 * (primary → shirt, secondary → trousers, head colour → hair) and the spirit of its type.
 * `palette` is the old 133-colour outfit palette (player/outfits.ts PALETTE).
 */
export function appearanceFromOutfit(o: unknown, palette: number[]): Appearance {
  const x = (o && typeof o === 'object' ? o : {}) as { type?: unknown; head?: unknown; body?: unknown; legs?: unknown };
  const col = (i: unknown, fallback: number) => (typeof i === 'number' && Number.isInteger(i) && palette[i] !== undefined ? palette[i] : fallback);
  const type = typeof x.type === 'string' ? x.type : 'knight';
  const STYLE: Record<string, [string, string, Build]> = {
    knight: ['short', 'none', 'average'],
    ranger: ['ponytail', 'stubble', 'average'],
    mage: ['long', 'full', 'slim'],
    citizen: ['swept', 'none', 'average'],
    noble: ['swept', 'moustache', 'average'],
    barbarian: ['braids', 'full', 'broad'],
    warlord: ['mohawk', 'short', 'broad'],
    mystic: ['long', 'goatee', 'slim'],
    warden: ['short', 'short', 'average'],
  };
  const [hair, beard, build] = STYLE[type] ?? STYLE.knight;
  const top = nearest(col(x.body, 0x2e4a7a), CLOTH_COLORS);
  // trousers in a different swatch than the shirt when the colours were close, so the two still read apart
  const bottomRaw = nearest(col(x.legs, 0x222a4a), CLOTH_COLORS);
  const bottom = bottomRaw === top ? nearest(col(x.legs, 0x222a4a), CLOTH_COLORS, [top]) : bottomRaw;
  return { body: 'male', skin: DEFAULT_APPEARANCE.skin, hair, hairColor: nearest(col(x.head, 0x5e3b22), HAIR_COLORS), beard, build, eyes: 0, top, bottom, scar: 'none' };
}
