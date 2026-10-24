import type { ItemSpec } from '../inventory/items';

/**
 * Items of the festivals and world events (2026-10-24): festival tokens, sweets and
 * the costumes. Every one is decorative or a small snack: nothing with stats. The
 * festival and seal-shop capes live in inventory/capes.ts with the other capes.
 * Ids are stable forever (they live in saves). Like tradeItems.ts this module only
 * imports types from items.ts (items.ts imports it).
 */
export const LIVE_ITEM_SPECS: ItemSpec[] = [
  // --- Hollow Moon (late October) -------------------------------------------------------------
  {
    id: 'hollow_pumpkin', name: 'Hollow Pumpkin', kind: 'material', weight: 1, value: 1, tint: '#e07a1a',
    note: 'A small carved pumpkin with a candle stub inside. During the Hollow Moon festival the task boards trade them for festival rewards.',
  },
  { id: 'candied_apple', name: 'Candied Apple', kind: 'consumable', weight: 2, value: 2, heal: 35, tint: '#c8202a', icon: '◆', note: 'Sticky, sweet and gone in three bites.' },
  {
    id: 'hollow_guise', name: 'Hollow Moon Guise', kind: 'tool', weight: 3, value: 50, tint: '#e8e0c8', rarity: 'uncommon',
    note: 'A costume of bleached bones and rags. Use it to walk as a skeleton for 20 minutes; use it again to take it off. It is never used up.',
  },
  // --- Winterhearth (December) ----------------------------------------------------------------
  {
    id: 'frost_bauble', name: 'Frost Bauble', kind: 'material', weight: 0.5, value: 1, tint: '#9ad0f0',
    note: 'A glass bauble with frost painted inside. During the Winterhearth festival the task boards trade them for festival rewards.',
  },
  { id: 'gingerbread_knight', name: 'Gingerbread Knight', kind: 'consumable', weight: 2, value: 2, heal: 35, tint: '#b8742a', icon: '◆', note: 'A brave little biscuit with a currant for a heart.' },
  {
    id: 'snowfellow_guise', name: 'Snowfellow Guise', kind: 'tool', weight: 3, value: 50, tint: '#e8f4ff', rarity: 'uncommon',
    note: 'A costume of white furs and a carrot nose. Use it to walk as a frostkin for 20 minutes; use it again to take it off. It is never used up.',
  },
];

/** Costume item → the creature it makes you look like. */
export const GUISES: Record<string, 'skeleton' | 'frostkin'> = { hollow_guise: 'skeleton', snowfellow_guise: 'frostkin' };
