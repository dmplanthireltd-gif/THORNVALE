import type { Bonus, ItemSpec } from '../inventory/items';
import type { NonCombatSkill } from '../gathering/skills';

/**
 * Pets: small companions that follow you, never fight and cannot be hurt. One is out at a time;
 * using its item calls it (the item then travels with the pet, safe from death loot), using another
 * pet item swaps them and the pet window dismisses it. Pets level up slowly from the experience you
 * gain (cap level 10), which raises their small perk a little.
 *
 * This module only imports types (items.ts imports it), so it must not use item data while it loads.
 * Item ids and pet ids are stable forever (they live in saves).
 */
export type PetId = 'tortoise' | 'fox' | 'owl' | 'beaver' | 'mole' | 'otter' | 'whelp' | 'raven';

export interface PetDef {
  id: PetId;
  /** The item that calls this pet. */
  item: string;
  /** Display name of the pet (and its item). */
  name: string;
  /** Short species word for messages ("a pet beaver"). */
  species: string;
  /** One line: what it does for you (tooltips, pet window). */
  perk: string;
  /** One line: where to get it (tooltips, Bible, website later). */
  source: string;
}

export const PET_DEFS: PetDef[] = [
  { id: 'tortoise', item: 'pet_tortoise', name: 'Mossback Tortoise', species: 'tortoise', perk: 'Carries a pouch of 8 items for you and adds +1 health regeneration (+2 at pet level 10).', source: 'Thistle the pet keeper in Elderglen; rarely crocodiles.' },
  { id: 'fox', item: 'pet_fox', name: 'Rustbrush Fox', species: 'fox', perk: 'Now and then fetches gold from loot and bodies near you; +2% walking speed (+3% at pet level 10).', source: 'Thistle the pet keeper in Elderglen; very rarely wolves and winter wolves.' },
  { id: 'owl', item: 'pet_owl', name: 'Duskwing Owl', species: 'owl', perk: '+1 mana regeneration (+2 at pet level 10) and a glow that lights dark caves.', source: 'Thistle the pet keeper in Elderglen; rarely elf arcanists.' },
  { id: 'beaver', item: 'pet_beaver', name: 'Timbertooth Beaver', species: 'beaver', perk: 'Chopping trees succeeds 5% more often (up to 9.5% at pet level 10).', source: 'Found while chopping trees (1 in 5,000 logs).' },
  { id: 'mole', item: 'pet_mole', name: 'Burrowclaw Mole', species: 'mole', perk: 'Mining succeeds 5% more often (up to 9.5% at pet level 10).', source: 'Found while mining (1 in 5,000 ores).' },
  { id: 'otter', item: 'pet_otter', name: 'Riverglint Otter', species: 'otter', perk: 'Fish bite 5% more often (up to 9.5% at pet level 10).', source: 'Found while fishing (1 in 5,000 catches).' },
  { id: 'whelp', item: 'pet_whelp', name: 'Cinderling Whelp', species: 'dragon whelp', perk: '3% fire resistance (up to 5% at pet level 9+).', source: 'Kaerith, Mother of Flames (1 in 25); very rarely dragon lords.' },
  { id: 'raven', item: 'pet_raven', name: 'Gravecall Raven', species: 'raven', perk: 'Caws a warning when a red-skulled player comes within 10 tiles (up to 14 at pet level 10).', source: 'Sexton Morrow of the restless dead raid (1 in 20); rarely Lord Ossric, the Bonebound.' },
];

export const PET_BY_ID: Record<PetId, PetDef> = Object.fromEntries(PET_DEFS.map((d) => [d.id, d])) as Record<PetId, PetDef>;
export const PET_ITEMS: string[] = PET_DEFS.map((d) => d.item);
const BY_ITEM: Record<string, PetDef> = Object.fromEntries(PET_DEFS.map((d) => [d.item, d]));

export function petForItem(itemId: string | null | undefined): PetDef | null {
  return itemId ? BY_ITEM[itemId] ?? null : null;
}

export function isPetId(v: unknown): v is PetId {
  return typeof v === 'string' && v in PET_BY_ID;
}

/** Item definitions (merged into items.ts). Pet items do not stack and weigh little: the pet walks. */
export const PET_ITEM_SPECS: ItemSpec[] = [
  { id: 'pet_tortoise', name: 'Mossback Tortoise', kind: 'pet', weight: 5, value: 2000, rarity: 'uncommon', tint: '#7f9a4a', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_fox', name: 'Rustbrush Fox', kind: 'pet', weight: 5, value: 2500, rarity: 'uncommon', tint: '#d0702a', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_owl', name: 'Duskwing Owl', kind: 'pet', weight: 5, value: 2500, rarity: 'uncommon', tint: '#a08a6a', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_beaver', name: 'Timbertooth Beaver', kind: 'pet', weight: 5, value: 5000, rarity: 'rare', tint: '#8a5a32', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_mole', name: 'Burrowclaw Mole', kind: 'pet', weight: 5, value: 5000, rarity: 'rare', tint: '#5a5058', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_otter', name: 'Riverglint Otter', kind: 'pet', weight: 5, value: 5000, rarity: 'rare', tint: '#6a4a30', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_whelp', name: 'Cinderling Whelp', kind: 'pet', weight: 5, value: 15000, rarity: 'legendary', tint: '#c04a28', icon: '◒', note: 'Use it to call or swap your pet.' },
  { id: 'pet_raven', name: 'Gravecall Raven', kind: 'pet', weight: 5, value: 12000, rarity: 'rare', tint: '#3a3a48', icon: '◒', note: 'Use it to call or swap your pet.' },
];

/** Rare monster drops (merged into the loot tables in enemyDefs.ts): monster kind → [item, chance]. */
export const PET_DROPS: Record<string, Array<[string, number]>> = {
  crocodile: [['pet_tortoise', 1 / 2500]],
  wolf: [['pet_fox', 1 / 4000]],
  winter_wolf: [['pet_fox', 1 / 4000]],
  elf_arcanist: [['pet_owl', 1 / 3000]],
  boss_ember_matriarch: [['pet_whelp', 1 / 25]],
  dragon_lord: [['pet_whelp', 1 / 8000]],
  raid_grave_warden: [['pet_raven', 1 / 20]],
  boss_bonebound: [['pet_raven', 1 / 40]],
};

/** Gathering skills that can turn up a pet: one roll per log / ore / catch. */
export const SKILL_PETS: Partial<Record<NonCombatSkill, { item: string; chance: number }>> = {
  woodcutting: { item: 'pet_beaver', chance: 1 / 5000 },
  mining: { item: 'pet_mole', chance: 1 / 5000 },
  fishing: { item: 'pet_otter', chance: 1 / 5000 },
};

/** The pet keeper: Thistle, the Elderglen outfitter (outside the starting town). */
export const PET_KEEPER = 'elderglen_outfit';
export const PET_KEEPER_ROLE = 'Outfitter & pet keeper';
/** What she sells (price ≥ what any NPC pays back). Every pet item is bought back by her. */
export const PET_SELLS: Array<{ id: string; price: number }> = [
  { id: 'pet_tortoise', price: 6000 },
  { id: 'pet_fox', price: 8000 },
  { id: 'pet_owl', price: 8000 },
];

// ---------------------------------------------------------------- levels and perks

export const PET_MAX_LEVEL = 10;
/** Pet experience for a level: 25,000 × (level − 1)² (level 10 = 2,025,000, slow on purpose). */
export function petXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(level)));
  return 25_000 * (l - 1) * (l - 1);
}

export function petLevelForXp(xp: number): number {
  let l = 1;
  while (l < PET_MAX_LEVEL && xp >= petXpForLevel(l + 1)) l++;
  return l;
}

/** 0..1 towards the next pet level (1 at the cap). */
export function petProgress(xp: number): number {
  const l = petLevelForXp(xp);
  if (l >= PET_MAX_LEVEL) return 1;
  const a = petXpForLevel(l);
  return (xp - a) / (petXpForLevel(l + 1) - a);
}

/** Tortoise pouch size. */
export const POUCH_SLOTS = 8;

/** Stat bonus of the pet that is out (joins the gear bonuses). */
export function petBonus(id: PetId, level: number): Bonus | null {
  const top = level >= PET_MAX_LEVEL;
  switch (id) {
    case 'tortoise': return { hpRegen: top ? 2 : 1 };
    case 'fox': return { speed: top ? 3 : 2 };
    case 'owl': return { manaRegen: top ? 2 : 1, light: top ? 3 : 2 };
    case 'whelp': return { resist: { fire: level >= 9 ? 5 : level >= 5 ? 4 : 3 } };
    default: return null;
  }
}

/** Gathering skill a pet helps with. */
export const PET_SKILL: Partial<Record<PetId, NonCombatSkill>> = { beaver: 'woodcutting', mole: 'mining', otter: 'fishing' };

/** Success-chance multiplier for chopping / mining / fishing: ×1.05, +0.5% per pet level above 1. */
export function petGatherBoost(level: number): number {
  return 1.05 + 0.005 * (Math.max(1, Math.min(PET_MAX_LEVEL, level)) - 1);
}

/** Fox: seconds between sniffs, chance to fetch a pile's gold on a sniff, reach in tiles. */
export const FOX_SNIFF_SECONDS = 3;
export const FOX_REACH = 4;
export function foxChance(level: number): number {
  return 0.2 + 0.02 * (Math.max(1, Math.min(PET_MAX_LEVEL, level)) - 1);
}

/** Raven: warning range in tiles, and how long before the same player is announced again. */
export function ravenRange(level: number): number {
  return 10 + Math.floor((Math.max(1, Math.min(PET_MAX_LEVEL, level)) - 1) / 2);
}
export const RAVEN_REPEAT_MS = 60_000;

/** Share of the experience you gain that your pet gains (character exp and trade-skill xp, after stages). */
export const PET_XP_SHARE = 1;
