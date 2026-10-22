import type { Vocation } from '../player/vocations';
import type { Bonus, ItemSpec } from './items';

/**
 * Gear sets. Wearing several pieces of one set adds a bonus on top of the
 * pieces' own stats: one at 2 pieces and a further one at 4 (they stack).
 * Each item belongs to at most one set (`ItemDef.setId`, filled in from this
 * table). Set ids and item ids are stable forever; names may change.
 *
 * This module only imports types from items.ts (items.ts imports it), so it
 * must not use item data while it loads.
 */
export interface GearSet {
  id: string;
  name: string;
  /** Item ids, helmet → armour → legs → boots → shield/weapon. */
  pieces: string[];
  /** Level of the lightest piece (shown in lists). */
  level: number;
  vocations?: Vocation[];
  /** Bonus with 2 or more pieces worn. */
  two: Bonus;
  /** Extra bonus with 4 or more pieces worn (on top of `two`). */
  four: Bonus;
  /** Where the pieces come from, for players and the Bible. */
  source: string;
}

const KNIGHT: Vocation[] = ['knight'];
const PALADIN: Vocation[] = ['paladin'];
const MAGES: Vocation[] = ['sorcerer', 'druid'];
const FIGHTERS: Vocation[] = ['knight', 'paladin'];

export const SETS: GearSet[] = [
  // --- starter and classic shop sets ---------------------------------------------------------
  {
    id: 'leather', name: 'Leather', level: 1, pieces: ['leather_helmet', 'leather_armor', 'leather_legs', 'leather_boots'],
    two: { hp: 10 }, four: { speed: 3, hpRegen: 1 }, source: 'Smiths sell it; bandits, orcs and elves drop it',
  },
  {
    id: 'chain', name: 'Chain', level: 1, pieces: ['chain_helmet', 'chain_armor', 'chain_legs', 'chain_boots'],
    two: { hp: 15 }, four: { hp: 15, resist: { physical: 2 } }, source: 'Smiths sell it; bronze at the anvil; orcs and skeletons drop it',
  },
  {
    id: 'fur', name: 'Furclad', level: 1, pieces: ['fur_cap', 'fur_armor', 'fur_legs', 'fur_boots'],
    two: { resist: { ice: 3 } }, four: { hp: 30, resist: { ice: 5 } }, source: 'Barbarians and frostkin; Warden Brann sells cap and boots',
  },
  // --- smithed metal progression -------------------------------------------------------------
  {
    id: 'bronze', name: 'Bronze', level: 1, pieces: ['bronze_helmet', 'bronze_armor', 'bronze_legs', 'bronze_boots', 'bronze_shield'],
    two: { hp: 15 }, four: { hp: 25, hpRegen: 1 }, source: 'Anvil (bronze); smiths sell it; bandits and dwarves drop it',
  },
  {
    id: 'iron', name: 'Iron', level: 8, pieces: ['iron_helmet', 'iron_armor', 'iron_legs', 'iron_boots', 'iron_shield'],
    two: { hp: 25 }, four: { hp: 35, resist: { physical: 2 } }, source: 'Anvil (iron); smiths sell it; dwarf soldiers, orc warriors and minotaurs drop it',
  },
  {
    id: 'plate', name: 'Plate', level: 20, vocations: FIGHTERS, pieces: ['plate_helmet', 'plate_armor', 'plate_legs', 'plate_boots', 'tower_shield'],
    two: { hp: 40 }, four: { hp: 40, resist: { physical: 4 } }, source: 'Anvil (iron and steel); smiths sell it; orc leaders, dwarf guards and behemoths drop it',
  },
  {
    id: 'steel', name: 'Steel', level: 18, vocations: FIGHTERS, pieces: ['steel_helmet', 'steel_plate', 'steel_legs', 'steel_boots', 'steel_shield'],
    two: { hp: 50 }, four: { hp: 60, resist: { physical: 3 }, hpRegen: 1 }, source: 'Anvil (steel); smiths sell it; barbarian brutetamers and behemoths drop it',
  },
  {
    id: 'moonsilver', name: 'Moonsilver', level: 35, vocations: FIGHTERS, pieces: ['moonsilver_helm', 'moonsilver_armor', 'moonsilver_legs', 'moonsilver_boots', 'moonsilver_shield'],
    two: { resist: { death: 4, holy: 3 } }, four: { mana: 60, hp: 60, resist: { death: 6, holy: 4 } }, source: 'Anvil (silver); mummies and ghouls drop it',
  },
  {
    id: 'starsteel', name: 'Starsteel', level: 45, vocations: FIGHTERS, pieces: ['starsteel_helm', 'starsteel_plate', 'starsteel_legs', 'starsteel_boots', 'starsteel_shield'],
    two: { hp: 80 }, four: { hp: 70, resist: { energy: 5, physical: 3 } }, source: 'Anvil (starsteel); fire elementals and behemoths drop it',
  },
  {
    id: 'gilded', name: 'Gilded', level: 55, vocations: FIGHTERS, pieces: ['gilded_helmet', 'gilded_armor', 'gilded_legs', 'gilded_boots', 'gilded_shield'],
    two: { hp: 100 }, four: { hp: 50, resist: { physical: 4, fire: 5 }, hpRegen: 2 }, source: 'Anvil (gold); mummies, scarabs and behemoths drop it',
  },
  {
    id: 'darkstone', name: 'Darkstone', level: 60, vocations: FIGHTERS, pieces: ['darkstone_helm', 'darkstone_plate', 'darkstone_legs', 'darkstone_boots', 'darkstone_shield'],
    two: { hp: 120 }, four: { hp: 80, resist: { death: 6, physical: 4 } }, source: 'Anvil (darkstone); demons and dragon lords drop it',
  },
  // --- creature sets ---------------------------------------------------------------------------------
  {
    id: 'dwarven', name: 'Dwarven', level: 12, pieces: ['dwarven_helmet', 'dwarven_armor', 'dwarven_legs', 'dwarven_boots', 'dwarven_shield'],
    two: { hpRegen: 1 }, four: { hp: 60, resist: { earth: 4 } }, source: 'Dwarves of Stonedeep',
  },
  {
    id: 'bone', name: 'Boneguard', level: 15, pieces: ['bone_helm', 'bone_armor', 'bone_legs', 'bone_boots', 'bone_shield'],
    two: { resist: { death: 4 } }, four: { hpRegen: 2, resist: { death: 5, earth: 3 } }, source: 'Skeletons, ghouls and mummies',
  },
  {
    id: 'knights_vow', name: "Knight's Vow", level: 40, vocations: KNIGHT, pieces: ['vow_helm', 'vow_armor', 'vow_legs', 'vow_boots', 'vow_blade'],
    two: { hp: 100 }, four: { hp: 100, hpRegen: 3, resist: { holy: 6, death: 4 } }, source: 'Lizard templars, valkyries and orc warlords',
  },
  {
    id: 'crownguard', name: 'Crownguard', level: 50, vocations: FIGHTERS, pieces: ['crownguard_helm', 'crownguard_armor', 'crownguard_legs', 'crownguard_boots', 'crownguard_shield'],
    two: { hp: 80, mana: 40 }, four: { speed: 5, hpRegen: 2, resist: { physical: 4 } }, source: 'Orc warlords, frost giantesses, valkyries and minotaur mages',
  },
  {
    id: 'frostforged', name: 'Frostforged', level: 50, vocations: FIGHTERS, pieces: ['frost_helm', 'frost_plate', 'frost_legs', 'frostforged_boots', 'frostscale_shield'],
    two: { resist: { ice: 5 } }, four: { hp: 120, resist: { ice: 6, physical: 2 } }, source: 'Frost dragons, ice golems and frost giants',
  },
  {
    id: 'dragonscale', name: 'Dragonscale', level: 35, vocations: FIGHTERS, pieces: ['dragon_helm', 'dragon_scale_mail', 'dragonscale_legs', 'dragonscale_boots', 'dragon_shield'],
    two: { resist: { fire: 5 } }, four: { hp: 120, resist: { fire: 6, earth: 3 } }, source: 'Dragons and dragon lords',
  },
  {
    id: 'hellforged', name: 'Hellforged', level: 80, vocations: KNIGHT, pieces: ['demon_helm', 'demonplate', 'demon_legs', 'hellforged_boots', 'demon_shield'],
    two: { resist: { fire: 5, death: 5 } }, four: { hp: 250, hpRegen: 3, resist: { physical: 5 } }, source: 'Demons',
  },
  // --- vocation sets -----------------------------------------------------------------------------------
  {
    id: 'ranger', name: "Ranger's", level: 20, vocations: PALADIN, pieces: ['ranger_hood', 'ranger_jerkin', 'ranger_leggings', 'ranger_boots'],
    two: { attack: 1 }, four: { attack: 1, speed: 4, hp: 40 }, source: 'Outfitters sell it; elf scouts and amazons drop it',
  },
  {
    id: 'elven', name: 'Silverbough', level: 30, vocations: PALADIN, pieces: ['elven_circlet', 'elven_mail', 'elven_leggings', 'elven_boots', 'elven_longbow'],
    two: { attack: 1, resist: { earth: 4 } }, four: { attack: 2, speed: 5, manaRegen: 1 }, source: 'Elf wardens and scouts',
  },
  {
    id: 'spellwoven', name: 'Spellwoven', level: 25, vocations: MAGES, pieces: ['spellwoven_hat', 'spellwoven_robe', 'spellwoven_skirt', 'spellwoven_shoes'],
    two: { mana: 60, magic: 2 }, four: { magic: 3, manaRegen: 2 }, source: 'Magic shops sell it; elf arcanists, orc shamans and minotaur mages drop it',
  },
  {
    id: 'rimeweave', name: 'Rimeweave', level: 40, vocations: MAGES, pieces: ['frost_circlet', 'glacier_robe', 'glacier_kilt', 'glacier_boots'],
    two: { mana: 50, resist: { ice: 5 } }, four: { magic: 4, manaRegen: 2 }, source: 'Ice witches, frostkin windcallers and crystal spiders',
  },
  // --- rare endgame sets ---------------------------------------------------------------------------------
  {
    id: 'wardbreaker', name: 'Wardbreaker', level: 100, vocations: KNIGHT, pieces: ['wardbreaker_helm', 'wardbreaker_plate', 'wardbreaker_legs', 'wardbreaker_boots', 'wardbreaker_maul'],
    two: { hp: 200, attack: 2 }, four: { attack: 4, hpRegen: 4, resist: { physical: 6 } }, source: 'Very rare: demons, behemoths, dragon lords and frost dragons',
  },
  {
    id: 'skyfeather', name: 'Skyfeather', level: 90, vocations: PALADIN, pieces: ['skyfeather_cowl', 'skyfeather_vest', 'skyfeather_legs', 'skyfeather_boots', 'skyfeather_bow'],
    two: { attack: 2, speed: 5 }, four: { attack: 3, speed: 5, hp: 150 }, source: 'Very rare: demons, hydras, dragon lords and frost dragons',
  },
  {
    id: 'voidweave', name: 'Voidweave', level: 90, vocations: MAGES, pieces: ['voidweave_hood', 'voidweave_robe', 'voidweave_skirt', 'voidweave_boots', 'void_codex'],
    two: { magic: 4, mana: 150 }, four: { magic: 6, manaRegen: 4, resist: { death: 6 } }, source: 'Very rare: demons, ice witches, hydras and frost dragons',
  },
  // --- the Sunken Reach (world/sea.ts): deepfin-forged sea gear, any vocation -----------------
  {
    id: 'tidewrought', name: 'Tidewrought', level: 50, pieces: ['tidewrought_helm', 'tidewrought_mail', 'tidewrought_legs', 'tidewrought_boots', 'tidewrought_shield'],
    two: { resist: { ice: 4, energy: 3 } }, four: { hp: 70, mana: 50, speed: 4 }, source: 'Deepfins, ironshell crabs and gloom eels of the Sunken Reach; Ulmaroth, the Drowned Tyrant',
  },
];

export const SET_BY_ID: Record<string, GearSet> = Object.fromEntries(SETS.map((s) => [s.id, s]));

/** Item id → set id. */
export const PIECE_SET: Record<string, string> = Object.fromEntries(SETS.flatMap((s) => s.pieces.map((p) => [p, s.id])));

/** How many pieces of each set the given item ids include. */
export function countSetPieces(ids: Iterable<string>): Map<string, number> {
  const n = new Map<string, number>();
  for (const id of ids) {
    const set = PIECE_SET[id];
    if (set) n.set(set, (n.get(set) ?? 0) + 1);
  }
  return n;
}

export interface ActiveSet {
  set: GearSet;
  count: number;
  bonuses: Bonus[];
}

/** Every set with at least 2 pieces among the given ids, with the bonuses it grants. */
export function activeSets(ids: Iterable<string>): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const [id, count] of countSetPieces(ids)) {
    if (count < 2) continue;
    const set = SET_BY_ID[id];
    out.push({ set, count, bonuses: count >= 4 ? [set.two, set.four] : [set.two] });
  }
  return out;
}

/** Short text for a bonus: "+40 hp, physical 4%". */
export function bonusParts(b: Bonus): string[] {
  const parts: string[] = [];
  if (b.hp) parts.push(`+${b.hp} hp`);
  if (b.mana) parts.push(`+${b.mana} mana`);
  if (b.speed) parts.push(`speed +${b.speed}%`);
  if (b.hpRegen) parts.push(`hp regen +${b.hpRegen}`);
  if (b.manaRegen) parts.push(`mana regen +${b.manaRegen}`);
  if (b.magic) parts.push(`magic +${b.magic}%`);
  if (b.attack) parts.push(`attack +${b.attack}`);
  if (b.light) parts.push(`light +${b.light}`);
  if (b.resist) for (const [k, v] of Object.entries(b.resist)) parts.push(`${k} ${v}%`);
  return parts;
}

/** "Bronze set (5): 2 pieces +15 hp; 4 pieces +25 hp, hp regen +1". */
export function setSummary(set: GearSet): string {
  return `${set.name} set (${set.pieces.length}): 2 pieces ${bonusParts(set.two).join(', ')}; 4 pieces ${bonusParts(set.four).join(', ')}`;
}

// ------------------------------------------------------------------------- new set items

type Kind = 'helmet' | 'armor' | 'legs' | 'boots' | 'shield';
/** One wearable: armour (or shield defence), level, gold value, weight. */
const P = (id: string, name: string, kind: Kind, arm: number, level: number, value: number, weight: number, extra: Partial<ItemSpec> = {}): ItemSpec => ({
  id, name, kind, ...(kind === 'shield' ? { defense: arm } : { armor: arm }), ...(level > 1 ? { level } : {}), value, weight, ...extra,
});

export const SET_ITEM_SPECS: ItemSpec[] = [
  // chain
  P('chain_boots', 'Chain Boots', 'boots', 1, 1, 12, 20),
  // bronze
  P('bronze_helmet', 'Bronze Helm', 'helmet', 2, 1, 10, 32),
  P('bronze_armor', 'Bronze Cuirass', 'armor', 5, 1, 35, 95),
  P('bronze_legs', 'Bronze Greaves', 'legs', 2, 1, 20, 45),
  P('bronze_boots', 'Bronze Sabatons', 'boots', 1, 1, 8, 18),
  // iron
  P('iron_armor', 'Iron Cuirass', 'armor', 7, 12, 140, 110),
  P('iron_boots', 'Iron Sabatons', 'boots', 2, 10, 35, 24),
  // plate
  P('plate_helmet', 'Plate Helm', 'helmet', 4, 20, 180, 40, { vocations: FIGHTERS }),
  P('plate_boots', 'Plate Sabatons', 'boots', 2, 20, 120, 28, { vocations: FIGHTERS }),
  // steel
  P('steel_legs', 'Steel Greaves', 'legs', 6, 25, 450, 60, { vocations: FIGHTERS }),
  // dwarven
  P('dwarven_boots', 'Dwarven Boots', 'boots', 2, 15, 260, 22, { rarity: 'uncommon' }),
  // moonsilver (smithed silver, good against the undead)
  P('moonsilver_helm', 'Moonsilver Helm', 'helmet', 5, 35, 420, 34, { vocations: FIGHTERS, rarity: 'uncommon', bonus: { resist: { death: 2 } } }),
  P('moonsilver_armor', 'Moonsilver Hauberk', 'armor', 11, 40, 1500, 95, { vocations: FIGHTERS, rarity: 'uncommon', bonus: { resist: { death: 3 } } }),
  P('moonsilver_legs', 'Moonsilver Greaves', 'legs', 6, 38, 850, 52, { vocations: FIGHTERS, rarity: 'uncommon', bonus: { resist: { death: 2 } } }),
  P('moonsilver_boots', 'Moonsilver Sabatons', 'boots', 2, 35, 380, 24, { vocations: FIGHTERS, rarity: 'uncommon' }),
  P('moonsilver_shield', 'Moonsilver Kite', 'shield', 26, 38, 850, 55, { vocations: FIGHTERS, rarity: 'uncommon', bonus: { resist: { holy: 2 } } }),
  // starsteel / darkstone boots
  P('starsteel_boots', 'Starsteel Sabatons', 'boots', 3, 45, 700, 24, { vocations: FIGHTERS, rarity: 'uncommon' }),
  P('darkstone_boots', 'Darkstone Sabatons', 'boots', 3, 60, 1600, 26, { vocations: FIGHTERS, rarity: 'rare' }),
  // gilded (smithed gold)
  P('gilded_helmet', 'Gilded Helm', 'helmet', 6, 55, 1600, 44, { vocations: FIGHTERS, rarity: 'rare' }),
  P('gilded_armor', 'Gilded Cuirass', 'armor', 12, 60, 4200, 120, { vocations: FIGHTERS, rarity: 'rare', bonus: { resist: { fire: 3 } } }),
  P('gilded_legs', 'Gilded Greaves', 'legs', 7, 58, 2400, 64, { vocations: FIGHTERS, rarity: 'rare' }),
  P('gilded_boots', 'Gilded Sabatons', 'boots', 3, 55, 1300, 28, { vocations: FIGHTERS, rarity: 'rare' }),
  P('gilded_shield', 'Gilded Aegis', 'shield', 29, 58, 2400, 62, { vocations: FIGHTERS, rarity: 'rare' }),
  // boneguard
  P('bone_helm', 'Skullcap Helm', 'helmet', 3, 15, 110, 26, { bonus: { resist: { death: 2 } } }),
  P('bone_armor', 'Ribcage Cuirass', 'armor', 7, 18, 280, 80, { bonus: { resist: { death: 2 } } }),
  P('bone_legs', 'Bone Greaves', 'legs', 4, 15, 170, 40),
  P('bone_boots', 'Bone Boots', 'boots', 2, 15, 80, 18),
  P('bone_shield', 'Bone Shield', 'shield', 19, 15, 140, 45),
  // knight's vow
  P('vow_helm', 'Vowkeeper Helm', 'helmet', 6, 40, 1300, 42, { vocations: KNIGHT, rarity: 'rare' }),
  P('vow_armor', 'Vowkeeper Hauberk', 'armor', 11, 45, 3200, 115, { vocations: KNIGHT, rarity: 'rare', bonus: { hp: 40 } }),
  P('vow_legs', 'Vowkeeper Greaves', 'legs', 7, 42, 1800, 62, { vocations: KNIGHT, rarity: 'rare' }),
  P('vow_boots', 'Vowkeeper Sabatons', 'boots', 3, 40, 1100, 28, { vocations: KNIGHT, rarity: 'rare' }),
  { id: 'vow_blade', name: 'Oathblade', kind: 'weapon', weaponType: 'sword', attack: 33, defense: 19, level: 45, value: 3000, weight: 54, vocations: KNIGHT, rarity: 'rare', element: 'holy', elementDamage: 6 },
  // crownguard (royal)
  P('crownguard_helm', 'Crowned Helm', 'helmet', 6, 50, 1800, 40, { vocations: FIGHTERS, rarity: 'rare', bonus: { mana: 30 } }),
  P('crownguard_armor', 'Crownguard Mail', 'armor', 11, 50, 4000, 105, { vocations: FIGHTERS, rarity: 'rare', bonus: { hp: 50 } }),
  P('crownguard_legs', 'Crownguard Greaves', 'legs', 7, 50, 2400, 58, { vocations: FIGHTERS, rarity: 'rare' }),
  P('crownguard_boots', 'Crownguard Sabatons', 'boots', 3, 50, 1500, 26, { vocations: FIGHTERS, rarity: 'rare', bonus: { speed: 3 } }),
  P('crownguard_shield', 'Royal Kite Shield', 'shield', 28, 50, 2600, 58, { vocations: FIGHTERS, rarity: 'rare' }),
  // frostforged / dragonscale / hellforged extra pieces
  P('frostforged_boots', 'Frostforged Sabatons', 'boots', 3, 55, 2400, 28, { vocations: FIGHTERS, rarity: 'rare', bonus: { resist: { ice: 4 } } }),
  P('dragonscale_legs', 'Dragonscale Legs', 'legs', 7, 55, 4000, 58, { vocations: FIGHTERS, rarity: 'rare', bonus: { resist: { fire: 4 } } }),
  P('dragonscale_boots', 'Dragonscale Boots', 'boots', 3, 50, 2400, 24, { vocations: FIGHTERS, rarity: 'rare', bonus: { resist: { fire: 4 } } }),
  P('hellforged_boots', 'Hellforged Sabatons', 'boots', 4, 90, 9000, 32, { vocations: KNIGHT, rarity: 'legendary', bonus: { resist: { fire: 5 } } }),
  // ranger (paladin, leather)
  P('ranger_hood', "Ranger's Hood", 'helmet', 2, 20, 160, 14, { vocations: PALADIN }),
  P('ranger_jerkin', "Ranger's Jerkin", 'armor', 6, 20, 420, 50, { vocations: PALADIN, bonus: { attack: 1 } }),
  P('ranger_leggings', "Ranger's Leggings", 'legs', 3, 20, 240, 24, { vocations: PALADIN }),
  P('ranger_boots', "Ranger's Boots", 'boots', 1, 20, 160, 10, { vocations: PALADIN, bonus: { speed: 3 } }),
  P('elven_boots', 'Silverbough Boots', 'boots', 2, 35, 1600, 9, { vocations: PALADIN, rarity: 'rare', bonus: { speed: 5 } }),
  // spellwoven / rimeweave (mages)
  P('spellwoven_hat', 'Spellwoven Hat', 'helmet', 1, 25, 300, 8, { vocations: MAGES, bonus: { mana: 30, magic: 1 } }),
  P('spellwoven_robe', 'Spellwoven Robe', 'armor', 4, 30, 900, 32, { vocations: MAGES, rarity: 'uncommon', bonus: { mana: 80, magic: 2 } }),
  P('spellwoven_skirt', 'Spellwoven Skirt', 'legs', 2, 25, 450, 18, { vocations: MAGES, bonus: { mana: 30 } }),
  P('spellwoven_shoes', 'Spellwoven Slippers', 'boots', 1, 25, 300, 6, { vocations: MAGES, bonus: { manaRegen: 1 } }),
  P('glacier_kilt', 'Rimeweave Kilt', 'legs', 3, 40, 2200, 20, { vocations: MAGES, rarity: 'rare', bonus: { mana: 40, resist: { ice: 4 } } }),
  // wardbreaker (knight endgame)
  P('wardbreaker_helm', 'Wardbreaker Helm', 'helmet', 10, 100, 16000, 60, { vocations: KNIGHT, rarity: 'legendary', bonus: { hp: 60 } }),
  P('wardbreaker_plate', 'Wardbreaker Plate', 'armor', 16, 110, 26000, 155, { vocations: KNIGHT, rarity: 'legendary', bonus: { hp: 120, resist: { physical: 3 } } }),
  P('wardbreaker_legs', 'Wardbreaker Greaves', 'legs', 10, 105, 18000, 80, { vocations: KNIGHT, rarity: 'legendary', bonus: { hp: 60 } }),
  P('wardbreaker_boots', 'Wardbreaker Sabatons', 'boots', 4, 100, 12000, 34, { vocations: KNIGHT, rarity: 'legendary', bonus: { speed: 4 } }),
  { id: 'wardbreaker_maul', name: 'Wardbreaker Maul', kind: 'weapon', weaponType: 'club', attack: 56, defense: 16, level: 110, value: 22000, weight: 150, vocations: KNIGHT, twoHanded: true, rarity: 'legendary', note: 'Breaks shields and bones alike.' },
  // skyfeather (paladin endgame)
  P('skyfeather_cowl', 'Skyfeather Cowl', 'helmet', 4, 90, 12000, 14, { vocations: PALADIN, rarity: 'legendary', bonus: { attack: 1 } }),
  P('skyfeather_vest', 'Skyfeather Vest', 'armor', 10, 100, 20000, 55, { vocations: PALADIN, rarity: 'legendary', bonus: { attack: 2, resist: { earth: 4, energy: 4 } } }),
  P('skyfeather_legs', 'Skyfeather Chaps', 'legs', 6, 95, 14000, 28, { vocations: PALADIN, rarity: 'legendary', bonus: { speed: 4 } }),
  P('skyfeather_boots', 'Skyfeather Boots', 'boots', 3, 90, 12000, 9, { vocations: PALADIN, rarity: 'legendary', bonus: { speed: 10 } }),
  { id: 'skyfeather_bow', name: 'Skyfeather Bow', kind: 'weapon', weaponType: 'bow', attack: 11, defense: 0, level: 100, value: 22000, weight: 30, vocations: PALADIN, twoHanded: true, range: 7, ammoType: 'arrow', rarity: 'legendary', bonus: { attack: 3 } },
  // voidweave (mage endgame)
  P('voidweave_hood', 'Voidweave Hood', 'helmet', 3, 90, 12000, 9, { vocations: MAGES, rarity: 'legendary', bonus: { mana: 120, magic: 4 } }),
  P('voidweave_robe', 'Voidweave Robe', 'armor', 8, 100, 22000, 40, { vocations: MAGES, rarity: 'legendary', bonus: { mana: 250, magic: 8, manaRegen: 2 } }),
  P('voidweave_skirt', 'Voidweave Skirt', 'legs', 5, 95, 14000, 22, { vocations: MAGES, rarity: 'legendary', bonus: { mana: 120, magic: 3 } }),
  P('voidweave_boots', 'Voidweave Slippers', 'boots', 2, 90, 12000, 7, { vocations: MAGES, rarity: 'legendary', bonus: { speed: 5, manaRegen: 2 } }),
  P('void_codex', 'Void Codex', 'shield', 20, 95, 18000, 25, { vocations: MAGES, rarity: 'legendary', bonus: { magic: 6, mana: 100, resist: { death: 4 } } }),
  // tidewrought (the Sunken Reach): scale-and-coral armour worked by the deepfins, any vocation
  P('tidewrought_helm', 'Tidewrought Helm', 'helmet', 5, 50, 1500, 30, { rarity: 'rare', bonus: { resist: { ice: 2 } } }),
  P('tidewrought_mail', 'Tidewrought Scalemail', 'armor', 10, 55, 3800, 80, { rarity: 'rare', bonus: { resist: { ice: 3, energy: 2 } } }),
  P('tidewrought_legs', 'Tidewrought Greaves', 'legs', 6, 50, 2200, 44, { rarity: 'rare' }),
  P('tidewrought_boots', 'Tidewrought Boots', 'boots', 2, 50, 1200, 16, { rarity: 'rare', bonus: { speed: 3 } }),
  P('tidewrought_shield', 'Tidewrought Shell', 'shield', 27, 55, 2400, 50, { rarity: 'rare', bonus: { resist: { energy: 2 } } }),
];

// ------------------------------------------------------------------------- where pieces come from

/** Monster kind → [item, drop chance] added to its loot table (see enemyDefs.ts). */
export const SET_DROPS: Record<string, Array<[string, number]>> = {
  skeleton: [['bone_helm', 0.015], ['bone_boots', 0.02], ['bone_shield', 0.012], ['chain_boots', 0.03]],
  ghoul: [['bone_armor', 0.012], ['bone_legs', 0.02], ['bone_helm', 0.02], ['moonsilver_boots', 0.004]],
  mummy: [['bone_armor', 0.01], ['bone_shield', 0.02], ['moonsilver_helm', 0.006], ['moonsilver_legs', 0.004], ['gilded_helmet', 0.003], ['gilded_boots', 0.003]],
  scarab: [['gilded_boots', 0.002], ['gilded_shield', 0.002]],
  bandit: [['bronze_helmet', 0.04], ['bronze_boots', 0.04], ['leather_legs', 0.06], ['leather_boots', 0.06]],
  dwarf: [['bronze_legs', 0.03], ['bronze_armor', 0.02], ['bronze_shield', 0.03]],
  dwarf_soldier: [['iron_boots', 0.03], ['iron_legs', 0.02], ['iron_armor', 0.01]],
  dwarf_guard: [['dwarven_boots', 0.02], ['plate_helmet', 0.015], ['plate_boots', 0.015], ['crownguard_boots', 0.002]],
  orc: [['leather_helmet', 0.05], ['leather_boots', 0.05]],
  orc_warrior: [['chain_boots', 0.04], ['iron_boots', 0.02], ['iron_armor', 0.008]],
  orc_leader: [['plate_helmet', 0.02], ['plate_boots', 0.02], ['steel_legs', 0.006]],
  orc_warlord: [['vow_boots', 0.02], ['vow_helm', 0.012], ['crownguard_helm', 0.012], ['crownguard_legs', 0.01]],
  orc_shaman: [['spellwoven_hat', 0.01], ['spellwoven_shoes', 0.012]],
  elf: [['leather_boots', 0.04]],
  elf_scout: [['ranger_hood', 0.02], ['ranger_boots', 0.02], ['elven_boots', 0.004]],
  elf_arcanist: [['spellwoven_robe', 0.008], ['spellwoven_skirt', 0.012], ['spellwoven_hat', 0.015]],
  elf_warden: [['elven_boots', 0.03], ['ranger_jerkin', 0.03]],
  amazon: [['ranger_leggings', 0.02], ['ranger_hood', 0.02], ['ranger_jerkin', 0.008]],
  valkyrie: [['vow_legs', 0.006], ['vow_helm', 0.006], ['crownguard_boots', 0.006]],
  minotaur: [['iron_boots', 0.03], ['iron_legs', 0.02]],
  minotaur_mage: [['spellwoven_robe', 0.006], ['crownguard_helm', 0.004]],
  barbarian_brutetamer: [['steel_legs', 0.01], ['steel_helmet', 0.012]],
  frostkin_windcaller: [['glacier_kilt', 0.006]],
  crystal_spider: [['glacier_kilt', 0.004]],
  ice_witch: [['glacier_kilt', 0.012], ['voidweave_boots', 0.0015]],
  frost_giant: [['frostforged_boots', 0.008]],
  frost_giantess: [['crownguard_armor', 0.006], ['crownguard_shield', 0.008]],
  ice_golem: [['frostforged_boots', 0.01], ['frost_legs', 0.006]],
  frost_dragon: [['frostforged_boots', 0.012], ['frost_helm', 0.01], ['wardbreaker_boots', 0.002], ['skyfeather_cowl', 0.002], ['voidweave_hood', 0.002]],
  lizard_sentinel: [['vow_boots', 0.008]],
  lizard_templar: [['vow_armor', 0.008], ['vow_legs', 0.01], ['vow_blade', 0.006], ['vow_helm', 0.012]],
  dragon: [['dragonscale_boots', 0.012], ['dragonscale_legs', 0.006]],
  dragon_lord: [['dragonscale_legs', 0.015], ['dragonscale_boots', 0.02], ['dragon_helm', 0.01], ['darkstone_boots', 0.006], ['wardbreaker_helm', 0.0015], ['skyfeather_bow', 0.0015]],
  fire_elemental: [['starsteel_boots', 0.008], ['starsteel_helm', 0.005]],
  behemoth: [['plate_boots', 0.04], ['steel_helmet', 0.03], ['starsteel_legs', 0.008], ['gilded_legs', 0.004], ['gilded_armor', 0.002], ['wardbreaker_legs', 0.0015]],
  hydra: [['skyfeather_legs', 0.002], ['voidweave_skirt', 0.002]],
  // the Sunken Reach
  deepfin_raider: [['tidewrought_helm', 0.008], ['tidewrought_mail', 0.004]],
  deepfin_harpooner: [['tidewrought_legs', 0.008], ['tidewrought_boots', 0.01]],
  deepfin_tidecaller: [['tidewrought_helm', 0.01], ['tidewrought_boots', 0.01]],
  ironshell_crab: [['tidewrought_shield', 0.01], ['tidewrought_legs', 0.005]],
  gloom_eel: [['tidewrought_boots', 0.01], ['tidewrought_mail', 0.004]],
  boss_drowned_tyrant: [['tidewrought_mail', 0.35], ['tidewrought_shield', 0.35]],
  demon: [
    ['hellforged_boots', 0.01], ['darkstone_helm', 0.01], ['darkstone_shield', 0.008],
    ['wardbreaker_plate', 0.0015], ['wardbreaker_maul', 0.0015], ['skyfeather_vest', 0.0015], ['skyfeather_boots', 0.002], ['voidweave_robe', 0.0015], ['void_codex', 0.0015],
  ],
};

/** NPC key → set pieces it sells (prices: value × 2.5) — the lower sets only. */
export const SET_SELLS: Record<string, string[]> = {
  brunhild: [
    'chain_boots', 'bronze_helmet', 'bronze_armor', 'bronze_legs', 'bronze_boots', 'bronze_shield',
    'iron_armor', 'iron_legs', 'iron_boots', 'plate_helmet', 'plate_boots', 'steel_helmet', 'steel_legs', 'steel_shield',
  ],
  garrick: ['ranger_hood', 'ranger_jerkin', 'ranger_leggings', 'ranger_boots'],
  mirella: ['spellwoven_hat', 'spellwoven_robe', 'spellwoven_skirt', 'spellwoven_shoes'],
};

/** NPC key → set pieces it buys that its shop list does not already cover (mage gear, legendaries). */
export const SET_BUYS: Record<string, string[]> = {
  mirella: [...SETS.filter((s) => s.vocations === MAGES).flatMap((s) => s.pieces)],
  // the smith pays for legendary set pieces too (its general list leaves legendaries out)
  brunhild: SETS.filter((s) => s.vocations !== MAGES).flatMap((s) => s.pieces),
};
