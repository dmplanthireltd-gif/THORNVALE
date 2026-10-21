/**
 * The four classic vocations. They change hit points, mana and capacity per
 * level, how well each damage type scales, and which items and spells they may use.
 */
export type Vocation = 'knight' | 'paladin' | 'sorcerer' | 'druid';

export interface VocationDef {
  id: Vocation;
  name: string;
  blurb: string;
  hpPerLevel: number;
  manaPerLevel: number;
  capPerLevel: number;
  baseHp: number;
  baseMana: number;
  baseCap: number;
  /** Damage multipliers. */
  melee: number;
  distance: number;
  magic: number;
  /** Healing multiplier for spells and runes. */
  healing: number;
}

export const VOCATIONS: Record<Vocation, VocationDef> = {
  knight: {
    id: 'knight', name: 'Knight', blurb: 'Heavy armour, swords, axes and clubs. Huge health, little mana.',
    hpPerLevel: 15, manaPerLevel: 5, capPerLevel: 25, baseHp: 150, baseMana: 40, baseCap: 450,
    melee: 1.0, distance: 0.55, magic: 0.6, healing: 0.9,
  },
  paladin: {
    id: 'paladin', name: 'Paladin', blurb: 'Bows, crossbows and spears from range, with holy magic.',
    hpPerLevel: 10, manaPerLevel: 15, capPerLevel: 20, baseHp: 140, baseMana: 60, baseCap: 420,
    melee: 0.7, distance: 1.0, magic: 0.8, healing: 1.0,
  },
  sorcerer: {
    id: 'sorcerer', name: 'Sorcerer', blurb: 'Wands, fire and energy. Devastating area spells, fragile body.',
    hpPerLevel: 5, manaPerLevel: 30, capPerLevel: 10, baseHp: 130, baseMana: 80, baseCap: 400,
    melee: 0.45, distance: 0.45, magic: 1.2, healing: 1.0,
  },
  druid: {
    id: 'druid', name: 'Druid', blurb: 'Rods, ice and earth. The strongest healer, able to heal others.',
    hpPerLevel: 5, manaPerLevel: 30, capPerLevel: 10, baseHp: 130, baseMana: 80, baseCap: 400,
    melee: 0.45, distance: 0.45, magic: 1.1, healing: 1.3,
  },
};

export const VOCATION_IDS: Vocation[] = ['knight', 'paladin', 'sorcerer', 'druid'];

export function isVocation(v: unknown): v is Vocation {
  return v === 'knight' || v === 'paladin' || v === 'sorcerer' || v === 'druid';
}
