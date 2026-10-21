/**
 * Outfit data (render-agnostic). An outfit is a type plus four colour parts,
 * each an index into the shared palette — compact enough to send over a network.
 */
export type OutfitType = 'knight' | 'ranger' | 'mage' | 'citizen' | 'noble' | 'barbarian';
export type OutfitPart = 'head' | 'body' | 'legs' | 'feet';

export interface Outfit {
  type: OutfitType;
  head: number;
  body: number;
  legs: number;
  feet: number;
}

export const OUTFIT_TYPES: Array<{ id: OutfitType; name: string }> = [
  { id: 'knight', name: 'Knight' },
  { id: 'ranger', name: 'Ranger' },
  { id: 'mage', name: 'Mage' },
  { id: 'citizen', name: 'Citizen' },
  { id: 'noble', name: 'Noble' },
  { id: 'barbarian', name: 'Barbarian' },
];

export const OUTFIT_PARTS: Array<{ id: OutfitPart; name: string }> = [
  { id: 'head', name: 'Head' },
  { id: 'body', name: 'Primary' },
  { id: 'legs', name: 'Secondary' },
  { id: 'feet', name: 'Detail' },
];

export const PALETTE_COLS = 19;
export const PALETTE_ROWS = 7;

/** 19 columns (greys + 18 hues) × 7 brightness rows = 133 colours. */
export const PALETTE: number[] = buildPalette();

function hsvToHex(h: number, s: number, v: number): number {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const r = Math.round(f(5) * 255);
  const g = Math.round(f(3) * 255);
  const b = Math.round(f(1) * 255);
  return (r << 16) | (g << 8) | b;
}

function buildPalette(): number[] {
  const out: number[] = [];
  const rows: Array<[number, number]> = [
    [0.25, 1.0], [0.5, 1.0], [0.75, 1.0], [1.0, 1.0], [1.0, 0.8], [1.0, 0.6], [1.0, 0.4],
  ];
  for (let r = 0; r < PALETTE_ROWS; r++) {
    const [s, v] = rows[r];
    // first column: greys from white to near-black
    const grey = Math.round(255 * (1 - r / (PALETTE_ROWS - 1) * 0.92));
    out.push((grey << 16) | (grey << 8) | grey);
    for (let c = 0; c < PALETTE_COLS - 1; c++) out.push(hsvToHex(c * 20, s, v));
  }
  return out;
}

export function paletteIndex(row: number, col: number): number {
  return row * PALETTE_COLS + col;
}

export const DEFAULT_OUTFIT: Outfit = {
  type: 'knight',
  head: paletteIndex(3, 1), // red plume
  body: paletteIndex(4, 12), // blue surcoat
  legs: paletteIndex(5, 13), // dark blue
  feet: paletteIndex(5, 3), // brown boots
};

export function isOutfit(o: unknown): o is Outfit {
  if (!o || typeof o !== 'object') return false;
  const x = o as Partial<Outfit>;
  const okIdx = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < PALETTE.length;
  return OUTFIT_TYPES.some((t) => t.id === x.type) && okIdx(x.head) && okIdx(x.body) && okIdx(x.legs) && okIdx(x.feet);
}
