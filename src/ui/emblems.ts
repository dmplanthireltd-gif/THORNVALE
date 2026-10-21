/** Brand marks drawn as inline SVG (see BRAND.md §2 and §7). Static strings only, never player text. */

export const CREST_SVG = (size: number, stroke = 1.5): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" transform="rotate(45 10 10)" fill="#2b2621" stroke="#c9a24a" stroke-width="${stroke}"/><path d="M6.5 6.5h7v2h-2.5v6h-2v-6H6.5z" fill="#e8c26a"/></svg>`;

const VOC: Record<string, string> = {
  knight: '<path d="M32 6l18 7v14c0 13-8 22-18 27C22 49 14 40 14 27V13z"/><path d="M32 16v30M24 24h16"/>',
  paladin: '<path d="M18 52C40 46 46 26 40 10"/><path d="M14 30h34M48 30l-7-5M48 30l-7 5"/>',
  sorcerer: '<path d="M32 8c6 10 14 15 14 27a14 14 0 0 1-28 0c0-7 4-11 7-15 1 6 4 8 6 8-2-8 1-15 1-20z"/>',
  druid: '<path d="M32 56V30M32 30C20 30 12 20 12 8c12 0 20 8 20 22zM32 38c10 0 18-8 18-20-10 0-18 8-18 20z"/>',
};

/** A vocation's line emblem (shield, bow, flame, leaf). */
export const VOCATION_SVG = (vocation: string, size: number): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" aria-hidden="true">${VOC[vocation] ?? VOC.knight}</svg>`;
