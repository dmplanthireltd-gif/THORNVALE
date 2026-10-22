import type { ItemSpec } from './items';

/**
 * Items of the Sunken Reach (world/sea.ts): sea-creature materials sold to Nerissa
 * the pearl diver, traders and quest givers (pearls also to bankers), and the two
 * unique items of Ulmaroth, the Drowned Tyrant. The Tidewrought gear set lives in
 * sets.ts with the other sets.
 *
 * Like sets.ts, this module only imports types from items.ts (items.ts imports it).
 */
export const SEA_MATERIALS: Array<[id: string, name: string, value: number, tint: string, note: string]> = [
  ['pearl', 'Pearl', 180, '#f2ede2', 'A lustrous sea pearl from the Sunken Reach. Bankers and pearl divers pay well.'],
  ['black_pearl', 'Black Pearl', 650, '#3a3448', 'A rare dark pearl with a green-violet sheen.'],
  ['red_coral', 'Red Coral', 85, '#d8443a', 'A branch of deep-sea coral, prized by jewellers.'],
  ['ironshell_claw', 'Ironshell Claw', 140, '#7a6a5a', 'The great pincer of an ironshell crab, hard as plate.'],
  ['glowing_jelly', 'Glowing Jelly', 28, '#8adcff', 'It still glows faintly. Alchemists buy it.'],
  ['deepfin_scale', 'Deepfin Scale', 60, '#3a8a8a', 'A hand-sized scale from a deepfin raider.'],
  ['tide_shell', 'Tidecaller Shell', 120, '#e8c8a8', 'A spiral shell the deepfin tidecallers sing into.'],
  ['gloom_eel_skin', 'Gloom Eel Skin', 160, '#2a3a4a', 'Slick dark hide that crackles with stored lightning.'],
];

/** Every Sunken Reach material id (shops: Nerissa buys them all). */
export const SEA_MATERIAL_IDS: string[] = SEA_MATERIALS.map(([id]) => id);

/** Ulmaroth's two uniques (also listed in items.ts BOSS_UNIQUES). */
export const SEA_UNIQUES = ['brinecrown', 'tidebreaker'];

export const SEA_ITEM_SPECS: ItemSpec[] = [
  ...SEA_MATERIALS.map(([id, name, value, tint, note]): ItemSpec => ({
    id, name, kind: 'material', weight: id === 'ironshell_claw' ? 9 : id === 'gloom_eel_skin' ? 5 : 1, value, tint, note,
    rarity: id === 'black_pearl' ? 'uncommon' : undefined,
  })),
  {
    id: 'brinecrown', name: 'Brinecrown', kind: 'helmet', armor: 8, level: 60, weight: 34, value: 9000, rarity: 'legendary',
    bonus: { hp: 80, mana: 80, resist: { ice: 6, energy: 4 } }, note: 'Unique: the coral crown of Ulmaroth, the Drowned Tyrant.',
  },
  {
    id: 'tidebreaker', name: 'Tidebreaker', kind: 'weapon', weaponType: 'axe', attack: 46, defense: 22, level: 70, weight: 72, value: 12000,
    vocations: ['knight'], element: 'ice', elementDamage: 10, rarity: 'legendary', note: 'Unique: the barbed trident-axe of Ulmaroth, the Drowned Tyrant.',
  },
];
