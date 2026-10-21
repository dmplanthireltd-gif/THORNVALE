import type { Vocation } from '../player/vocations';

export type ItemKind =
  | 'gold' | 'consumable' | 'rune' | 'tool' | 'material'
  | 'weapon' | 'shield' | 'helmet' | 'armor' | 'legs' | 'boots' | 'amulet' | 'ring' | 'backpack' | 'ammo';

export type EquipSlot = 'head' | 'amulet' | 'backpack' | 'armor' | 'weapon' | 'shield' | 'legs' | 'ring' | 'ammo' | 'feet';
export const EQUIP_SLOTS: EquipSlot[] = ['head', 'amulet', 'backpack', 'armor', 'weapon', 'shield', 'legs', 'ring', 'ammo', 'feet'];

export type Element = 'physical' | 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy';
export const ELEMENTS: Element[] = ['physical', 'fire', 'energy', 'ice', 'earth', 'death', 'holy'];

export type WeaponType = 'sword' | 'axe' | 'club' | 'bow' | 'crossbow' | 'throwing' | 'wand' | 'rod';
export type AmmoType = 'arrow' | 'bolt';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface Bonus {
  hp?: number;
  mana?: number;
  /** Added to walking speed (percent). */
  speed?: number;
  hpRegen?: number;
  manaRegen?: number;
  /** Extra light radius in tiles (underground). */
  light?: number;
  /** Damage reduction per element, in percent. */
  resist?: Partial<Record<Element, number>>;
  /** Spell and rune damage bonus, in percent. */
  magic?: number;
  /** Flat bonus to melee/distance attack. */
  attack?: number;
}

/** Timed potion buffs (see Player.buffs). */
export type PotionBuff = 'berserk' | 'bullseye' | 'mastermind';
export const POTION_BUFF_SECONDS = 600;
/** What each potion buff adds: melee attack, distance attack, spell/rune/wand damage percent. */
export const POTION_BUFF_POWER = { berserk: 8, bullseye: 7, mastermind: 12 } as const;

/** Ground fields runes can create (temporary map objects, see Game.placeField). */
export type FieldKind = 'fire' | 'energy' | 'poison' | 'wall';

export interface RuneEffect {
  /**
   * damage/heal: hits or heals; field: lays fields on the ground; destroyField: removes them;
   * paralyze: slows a monster; cure: cures poison.
   */
  type: 'damage' | 'heal' | 'field' | 'destroyField' | 'paralyze' | 'cure';
  element?: Element;
  /** 0 = single target, otherwise area radius around the target tile. */
  radius: number;
  min: number;
  max: number;
  perLevel: number;
  range: number;
  field?: FieldKind;
  /** Field layout: one tile, a 3×3 bomb, or a 5-tile wall across the throw. */
  shape?: 'tile' | 'bomb' | 'wall';
  /** Field lifetime or paralysis, seconds. */
  duration?: number;
}

/** Exhaustion group a rune shares (see magic/spells GROUP_COOLDOWN). */
export function runeGroup(r: RuneEffect): 'attack' | 'heal' | 'support' {
  if (r.type === 'heal' || r.type === 'cure') return 'heal';
  if (r.type === 'destroyField') return 'support';
  return 'attack';
}

/** Runes thrown with the crosshair (everything but self-use healing and curing). */
export function runeIsAimed(r: RuneEffect): boolean {
  return r.type !== 'heal' && r.type !== 'cure';
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  stackable: boolean;
  maxStack: number;
  icon: string;
  tint: string;
  rarity: Rarity;
  /** Ounces. */
  weight: number;
  /** Gold an NPC pays for it (0 = nobody buys it). */
  value: number;
  note?: string;
  level?: number;
  vocations?: Vocation[];
  // combat
  attack?: number;
  defense?: number;
  armor?: number;
  range?: number;
  weaponType?: WeaponType;
  twoHanded?: boolean;
  ammoType?: AmmoType;
  /** Elemental part of a weapon or ammo hit, or wand/rod element. */
  element?: Element;
  elementDamage?: number;
  /** Wands and rods: damage range per shot and mana per shot. */
  magicDamage?: [number, number];
  manaPerShot?: number;
  bonus?: Bonus;
  // backpacks
  slots?: number;
  // consumables
  heal?: number;
  mana?: number;
  rune?: RuneEffect;
  tool?: 'rope' | 'shovel' | 'fishing' | 'mining' | 'hammer';
  /** Buff potions: which timed buff drinking it grants. */
  buff?: PotionBuff;
  /** Throwing weapons: chance a throw uses one up (default 0.85). */
  breakChance?: number;
}

const KNIGHT: Vocation[] = ['knight'];
const PALADIN: Vocation[] = ['paladin'];
const MAGES: Vocation[] = ['sorcerer', 'druid'];
const SORC: Vocation[] = ['sorcerer'];
const DRUID: Vocation[] = ['druid'];
const FIGHTERS: Vocation[] = ['knight', 'paladin'];

type Partial2 = Omit<ItemDef, 'stackable' | 'maxStack' | 'rarity' | 'icon' | 'tint'> &
  Partial<Pick<ItemDef, 'stackable' | 'maxStack' | 'rarity' | 'icon' | 'tint'>>;

const ICONS: Record<string, string> = {
  gold: '●', consumable: '♥', rune: '◆', tool: '⚒', material: '◈', weapon: '†', shield: '◗', helmet: '∩',
  armor: '▦', legs: '‖', boots: '⌐', amulet: '♁', ring: '○', backpack: '▤', ammo: '➶',
};
const WEAPON_ICONS: Record<WeaponType, string> = {
  sword: '†', axe: '¶', club: '♣', bow: '⟆', crossbow: '⊢', throwing: '↗', wand: '⁄', rod: '∤',
};
const RARITY_TINT: Record<Rarity, string> = { common: '#a7adb6', uncommon: '#62b35e', rare: '#4f8fe0', legendary: '#e08a2f' };

function def(d: Partial2): ItemDef {
  const stack = d.stackable ?? (d.kind === 'gold' || d.kind === 'material' || d.kind === 'consumable' || d.kind === 'rune' || d.kind === 'ammo' || d.weaponType === 'throwing');
  const rarity = d.rarity ?? 'common';
  return {
    ...d,
    stackable: stack,
    maxStack: d.maxStack ?? (stack ? 100 : 1),
    rarity,
    icon: d.icon ?? (d.weaponType ? WEAPON_ICONS[d.weaponType] : ICONS[d.kind] ?? '?'),
    tint: d.tint ?? RARITY_TINT[rarity],
  };
}

const W = (id: string, name: string, weaponType: WeaponType, attack: number, defense: number, level: number, value: number, weight: number, extra: Partial<Partial2> = {}) =>
  def({ id, name, kind: 'weapon', weaponType, attack, defense, level, value, weight, ...extra });

const defs: ItemDef[] = [
  // --- currency & consumables ------------------------------------------------
  def({ id: 'gold', name: 'Gold Coin', kind: 'gold', weight: 0.1, value: 0, maxStack: 10000, tint: '#e8b923', icon: '●' }),
  def({ id: 'health_potion', name: 'Health Potion', kind: 'consumable', weight: 2, value: 10, heal: 90, tint: '#d33b3b', icon: '♥' }),
  def({ id: 'strong_health_potion', name: 'Strong Health Potion', kind: 'consumable', weight: 2.5, value: 25, heal: 220, level: 50, vocations: FIGHTERS, tint: '#b8202a', icon: '♥', rarity: 'uncommon' }),
  def({ id: 'great_health_potion', name: 'Great Health Potion', kind: 'consumable', weight: 3, value: 50, heal: 480, level: 80, vocations: KNIGHT, tint: '#8a1020', icon: '♥', rarity: 'rare' }),
  def({ id: 'mana_potion', name: 'Mana Potion', kind: 'consumable', weight: 2, value: 12, mana: 75, tint: '#3b6fd3', icon: '✦' }),
  def({ id: 'strong_mana_potion', name: 'Strong Mana Potion', kind: 'consumable', weight: 2.5, value: 30, mana: 140, level: 50, vocations: ['paladin', 'sorcerer', 'druid'], tint: '#2a4fb8', icon: '✦', rarity: 'uncommon' }),
  def({ id: 'great_mana_potion', name: 'Great Mana Potion', kind: 'consumable', weight: 3, value: 60, mana: 230, level: 80, vocations: MAGES, tint: '#1a2f8a', icon: '✦', rarity: 'rare' }),
  def({ id: 'cheese', name: 'Cheese', kind: 'consumable', weight: 4, value: 2, heal: 15, tint: '#e6c84f', icon: '◆' }),
  def({ id: 'meat', name: 'Meat', kind: 'consumable', weight: 13, value: 3, heal: 30, tint: '#a8513d', icon: '▼' }),
  def({ id: 'ham', name: 'Ham', kind: 'consumable', weight: 20, value: 5, heal: 45, tint: '#c4705a', icon: '▼' }),
  def({ id: 'fish', name: 'Fish', kind: 'consumable', weight: 5, value: 2, heal: 25, tint: '#8ab0c8', icon: '◆' }),
  def({ id: 'mead', name: 'Horn of Mead', kind: 'consumable', weight: 6, value: 6, heal: 40, mana: 25, tint: '#d8a030', icon: '♥', note: 'Warms the bones of any northerner.' }),
  // buff potions: ten minutes of extra power for one fighting style
  def({ id: 'berserk_potion', name: 'Potion of Fury', kind: 'consumable', weight: 2, value: 160, level: 20, vocations: KNIGHT, buff: 'berserk', tint: '#e0402a', icon: '♥', rarity: 'uncommon', note: `+${POTION_BUFF_POWER.berserk} melee attack for 10 minutes.` }),
  def({ id: 'bullseye_potion', name: 'Potion of the Hawk', kind: 'consumable', weight: 2, value: 160, level: 20, vocations: PALADIN, buff: 'bullseye', tint: '#40c070', icon: '♥', rarity: 'uncommon', note: `+${POTION_BUFF_POWER.bullseye} distance attack and steadier aim for 10 minutes.` }),
  def({ id: 'mastermind_potion', name: 'Potion of Clarity', kind: 'consumable', weight: 2, value: 240, level: 20, vocations: MAGES, buff: 'mastermind', tint: '#a050e0', icon: '✦', rarity: 'uncommon', note: `+${POTION_BUFF_POWER.mastermind}% spell, rune and wand damage for 10 minutes.` }),

  // --- runes (charges) -----------------------------------------------------------
  def({ id: 'spark_rune', name: 'Spark Rune', kind: 'rune', weight: 0.7, value: 3, tint: '#9a7ae0', icon: 'ϟ', rune: { type: 'damage', element: 'energy', radius: 0, min: 12, max: 26, perLevel: 1.2, range: 6 } }),
  def({ id: 'fireball_rune', name: 'Fireball Rune', kind: 'rune', weight: 0.7, value: 10, level: 20, tint: '#e0602a', icon: '✺', rune: { type: 'damage', element: 'fire', radius: 3, min: 20, max: 45, perLevel: 1.5, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'avalanche_rune', name: 'Avalanche Rune', kind: 'rune', weight: 0.7, value: 12, level: 30, tint: '#6fc6f0', icon: '❄', rune: { type: 'damage', element: 'ice', radius: 3, min: 25, max: 55, perLevel: 1.7, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'stoneshower_rune', name: 'Stoneshower Rune', kind: 'rune', weight: 0.7, value: 12, level: 28, tint: '#7fa04a', icon: '✷', rune: { type: 'damage', element: 'earth', radius: 3, min: 25, max: 55, perLevel: 1.7, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'death_rune', name: 'Death Strike Rune', kind: 'rune', weight: 0.7, value: 30, level: 45, tint: '#6a4a8a', icon: '☠', rune: { type: 'damage', element: 'death', radius: 0, min: 90, max: 150, perLevel: 3.2, range: 6 }, rarity: 'rare' }),
  def({ id: 'healing_rune', name: 'Mending Rune', kind: 'rune', weight: 0.7, value: 20, level: 24, tint: '#5ad06a', icon: '✚', rune: { type: 'heal', radius: 0, min: 120, max: 200, perLevel: 3, range: 5 }, rarity: 'uncommon' }),
  // runes of the spells update: conjured from blank runes (see magic/spells) and sold by mage shops
  def({ id: 'blank_rune', name: 'Blank Rune', kind: 'material', weight: 1.2, value: 4, tint: '#8a8070', icon: '◇', note: 'Say a rune spell while carrying it to bind magic into it.' }),
  def({ id: 'thunderbolt_rune', name: 'Thunderbolt Rune', kind: 'rune', weight: 0.7, value: 8, level: 15, tint: '#7a6af0', icon: 'ϟ', rune: { type: 'damage', element: 'energy', radius: 0, min: 30, max: 55, perLevel: 1.8, range: 6 } }),
  def({ id: 'ember_rune', name: 'Ember Rune', kind: 'rune', weight: 0.7, value: 8, level: 15, tint: '#f08a3a', icon: '✹', rune: { type: 'damage', element: 'fire', radius: 1, min: 18, max: 34, perLevel: 1.2, range: 6 } }),
  def({ id: 'icicle_rune', name: 'Icicle Rune', kind: 'rune', weight: 0.7, value: 10, level: 20, tint: '#9fe6ff', icon: '❆', rune: { type: 'damage', element: 'ice', radius: 0, min: 40, max: 70, perLevel: 2, range: 6 } }),
  def({ id: 'rockspike_rune', name: 'Rockspike Rune', kind: 'rune', weight: 0.7, value: 9, level: 18, tint: '#6aa040', icon: '▲', rune: { type: 'damage', element: 'earth', radius: 0, min: 34, max: 62, perLevel: 1.9, range: 6 } }),
  def({ id: 'stormcloud_rune', name: 'Stormcloud Rune', kind: 'rune', weight: 0.7, value: 12, level: 28, tint: '#b07aff', icon: '☁', rune: { type: 'damage', element: 'energy', radius: 3, min: 25, max: 55, perLevel: 1.7, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'blast_rune', name: 'Blast Rune', kind: 'rune', weight: 0.7, value: 14, level: 31, tint: '#d8c8a0', icon: '✸', rune: { type: 'damage', element: 'physical', radius: 1, min: 40, max: 80, perLevel: 2, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'sunlance_rune', name: 'Sunlance Rune', kind: 'rune', weight: 0.7, value: 12, level: 27, vocations: PALADIN, tint: '#fff0a0', icon: '✦', rune: { type: 'damage', element: 'holy', radius: 0, min: 45, max: 80, perLevel: 2.2, range: 6 }, rarity: 'uncommon' }),
  def({ id: 'soothing_rune', name: 'Soothing Rune', kind: 'rune', weight: 0.7, value: 8, level: 15, tint: '#8ae08a', icon: '✚', rune: { type: 'heal', radius: 0, min: 60, max: 110, perLevel: 2, range: 5 } }),
  def({ id: 'antidote_rune', name: 'Antidote Rune', kind: 'rune', weight: 0.7, value: 10, level: 15, tint: '#b0e050', icon: '✙', rune: { type: 'cure', radius: 0, min: 0, max: 0, perLevel: 0, range: 5 } }),
  def({ id: 'snare_rune', name: 'Snare Rune', kind: 'rune', weight: 0.7, value: 60, level: 54, tint: '#c0a0ff', icon: '⌘', rune: { type: 'paralyze', radius: 0, min: 0, max: 0, perLevel: 0, range: 6, duration: 10 }, rarity: 'rare' }),
  def({ id: 'flame_field_rune', name: 'Flame Field Rune', kind: 'rune', weight: 0.7, value: 6, level: 15, tint: '#ff7a1a', icon: '♨', rune: { type: 'field', field: 'fire', shape: 'tile', element: 'fire', radius: 0, min: 0, max: 0, perLevel: 0, range: 6, duration: 45 } }),
  def({ id: 'static_field_rune', name: 'Static Field Rune', kind: 'rune', weight: 0.7, value: 8, level: 18, tint: '#c890ff', icon: '⌁', rune: { type: 'field', field: 'energy', shape: 'tile', element: 'energy', radius: 0, min: 0, max: 0, perLevel: 0, range: 6, duration: 30 } }),
  def({ id: 'venom_field_rune', name: 'Venom Field Rune', kind: 'rune', weight: 0.7, value: 5, level: 14, tint: '#6ad040', icon: '☣', rune: { type: 'field', field: 'poison', shape: 'tile', element: 'earth', radius: 0, min: 0, max: 0, perLevel: 0, range: 6, duration: 60 } }),
  def({ id: 'firebloom_rune', name: 'Firebloom Rune', kind: 'rune', weight: 0.7, value: 15, level: 27, tint: '#ff5a1a', icon: '✺', rune: { type: 'field', field: 'fire', shape: 'bomb', element: 'fire', radius: 1, min: 0, max: 0, perLevel: 0, range: 6, duration: 45 }, rarity: 'uncommon' }),
  def({ id: 'stormbloom_rune', name: 'Stormbloom Rune', kind: 'rune', weight: 0.7, value: 20, level: 37, tint: '#a060ff', icon: '✺', rune: { type: 'field', field: 'energy', shape: 'bomb', element: 'energy', radius: 1, min: 0, max: 0, perLevel: 0, range: 6, duration: 30 }, rarity: 'uncommon' }),
  def({ id: 'venombloom_rune', name: 'Venombloom Rune', kind: 'rune', weight: 0.7, value: 12, level: 25, tint: '#4ab030', icon: '✺', rune: { type: 'field', field: 'poison', shape: 'bomb', element: 'earth', radius: 1, min: 0, max: 0, perLevel: 0, range: 6, duration: 60 }, rarity: 'uncommon' }),
  def({ id: 'flame_barrier_rune', name: 'Flame Barrier Rune', kind: 'rune', weight: 0.7, value: 18, level: 33, tint: '#ff7a1a', icon: '☰', rune: { type: 'field', field: 'fire', shape: 'wall', element: 'fire', radius: 2, min: 0, max: 0, perLevel: 0, range: 6, duration: 45 }, rarity: 'uncommon' }),
  def({ id: 'static_barrier_rune', name: 'Static Barrier Rune', kind: 'rune', weight: 0.7, value: 22, level: 41, tint: '#c890ff', icon: '☰', rune: { type: 'field', field: 'energy', shape: 'wall', element: 'energy', radius: 2, min: 0, max: 0, perLevel: 0, range: 6, duration: 30 }, rarity: 'uncommon' }),
  def({ id: 'venom_barrier_rune', name: 'Venom Barrier Rune', kind: 'rune', weight: 0.7, value: 15, level: 29, tint: '#6ad040', icon: '☰', rune: { type: 'field', field: 'poison', shape: 'wall', element: 'earth', radius: 2, min: 0, max: 0, perLevel: 0, range: 6, duration: 60 }, rarity: 'uncommon' }),
  def({ id: 'arcane_wall_rune', name: 'Magic Wall Rune', kind: 'rune', weight: 0.7, value: 40, level: 32, tint: '#7fb2ff', icon: '▣', rune: { type: 'field', field: 'wall', shape: 'tile', radius: 0, min: 0, max: 0, perLevel: 0, range: 6, duration: 20 }, rarity: 'rare' }),
  def({ id: 'dispel_rune', name: 'Dispel Rune', kind: 'rune', weight: 0.7, value: 5, level: 17, tint: '#d8d8e8', icon: '⊘', rune: { type: 'destroyField', radius: 0, min: 0, max: 0, perLevel: 0, range: 6 } }),

  // --- tools -----------------------------------------------------------------------
  def({ id: 'rope', name: 'Rope', kind: 'tool', tool: 'rope', weight: 18, value: 8, tint: '#b08a5a', icon: '§', note: 'Use on a rope spot to climb up.' }),
  def({ id: 'shovel', name: 'Shovel', kind: 'tool', tool: 'shovel', weight: 35, value: 8, tint: '#8f98a6', icon: '⚒', note: 'Dig loose stones open to find a way down.' }),
  def({ id: 'fishing_rod', name: 'Fishing Rod', kind: 'tool', tool: 'fishing', weight: 8, value: 20, tint: '#a8804a', icon: '⌐', note: 'Click open water within 3 tiles to fish.' }),

  // --- backpacks ---------------------------------------------------------------------
  def({ id: 'bag', name: 'Bag', kind: 'backpack', slots: 12, weight: 8, value: 4, tint: '#a8743f', icon: '▤' }),
  def({ id: 'backpack', name: 'Backpack', kind: 'backpack', slots: 20, weight: 18, value: 10, tint: '#8a5a32', icon: '▤' }),
  def({ id: 'fur_bag', name: 'Fur Bag', kind: 'backpack', slots: 16, weight: 9, value: 25, tint: '#d8d0c0', icon: '▤' }),
  def({ id: 'fur_backpack', name: 'Fur Backpack', kind: 'backpack', slots: 24, weight: 16, value: 90, rarity: 'uncommon', icon: '▤', bonus: { resist: { ice: 2 } } }),
  def({ id: 'explorer_pack', name: "Explorer's Pack", kind: 'backpack', slots: 28, weight: 20, value: 120, rarity: 'uncommon', icon: '▤' }),
  def({ id: 'dragonhide_pack', name: 'Dragonhide Pack', kind: 'backpack', slots: 36, weight: 18, value: 900, rarity: 'legendary', icon: '▤', bonus: { resist: { fire: 3 } } }),

  // --- swords ------------------------------------------------------------------------
  W('short_sword', 'Short Sword', 'sword', 10, 8, 1, 10, 35),
  W('iron_sword', 'Iron Longsword', 'sword', 15, 11, 6, 60, 45),
  W('bastard_sword', 'Knightly Bastard Sword', 'sword', 21, 13, 15, 300, 58, { vocations: KNIGHT }),
  W('frostbrand', 'Frostbrand', 'sword', 26, 16, 30, 900, 55, { vocations: KNIGHT, element: 'ice', elementDamage: 8, rarity: 'uncommon' }),
  W('ember_blade', 'Ember Blade', 'sword', 31, 18, 45, 1800, 52, { vocations: KNIGHT, element: 'fire', elementDamage: 10, rarity: 'rare' }),
  W('lizard_blade', 'Scaleguard Sabre', 'sword', 34, 19, 55, 3200, 50, { vocations: KNIGHT, element: 'earth', elementDamage: 8, rarity: 'rare' }),
  W('kings_edge', "King's Edge", 'sword', 44, 26, 80, 9000, 60, { vocations: KNIGHT, element: 'holy', elementDamage: 12, rarity: 'legendary', bonus: { hp: 100 } }),
  // axes
  W('hatchet', "Woodcutter's Axe", 'axe', 12, 6, 1, 25, 40),
  W('battle_axe', 'Bearded Battle Axe', 'axe', 19, 10, 12, 160, 60, { vocations: KNIGHT }),
  W('barbarian_axe', 'Northman Axe', 'axe', 22, 9, 18, 280, 65, { vocations: KNIGHT }),
  W('dwarven_axe', 'Dwarven Axe', 'axe', 26, 12, 25, 520, 70, { vocations: KNIGHT, rarity: 'uncommon' }),
  W('glacial_cleaver', 'Glacial Cleaver', 'axe', 40, 16, 65, 5200, 90, { vocations: KNIGHT, element: 'ice', elementDamage: 11, rarity: 'rare' }),
  W('double_axe', 'Twinmoon Greataxe', 'axe', 30, 12, 25, 700, 120, { vocations: KNIGHT, twoHanded: true, rarity: 'uncommon' }),
  W('dragonbone_cleaver', 'Dragonbone Cleaver', 'axe', 38, 18, 60, 3500, 85, { vocations: KNIGHT, rarity: 'rare' }),
  W('demon_reaver', 'Demon Reaver', 'axe', 52, 20, 100, 15000, 140, { vocations: KNIGHT, twoHanded: true, element: 'death', elementDamage: 14, rarity: 'legendary' }),
  // clubs
  W('iron_mace', 'Iron Mace', 'club', 14, 8, 3, 45, 55),
  W('morning_star', 'Morning Star', 'club', 18, 10, 10, 150, 65, { vocations: KNIGHT }),
  W('tusk_club', 'Tusk Club', 'club', 16, 7, 8, 90, 55),
  W('stone_maul', 'Cyclops Maul', 'club', 29, 8, 30, 650, 115, { vocations: KNIGHT, twoHanded: true, rarity: 'uncommon' }),
  W('war_hammer', 'War Hammer', 'club', 24, 10, 20, 450, 85, { vocations: KNIGHT, twoHanded: true }),
  W('thunder_maul', 'Thunder Maul', 'club', 42, 14, 70, 6000, 130, { vocations: KNIGHT, twoHanded: true, element: 'energy', elementDamage: 14, rarity: 'rare' }),
  // bows & crossbows (two-handed, need ammunition)
  W('hunting_bow', 'Hunting Bow', 'bow', 1, 0, 1, 40, 31, { twoHanded: true, range: 5, ammoType: 'arrow' }),
  W('composite_bow', 'Composite Bow', 'bow', 4, 0, 20, 400, 33, { twoHanded: true, range: 6, ammoType: 'arrow', vocations: PALADIN, rarity: 'uncommon' }),
  W('sylvan_bow', 'Sylvan Bow', 'bow', 6, 0, 32, 1400, 30, { twoHanded: true, range: 6, ammoType: 'arrow', vocations: PALADIN, rarity: 'uncommon', bonus: { attack: 1 } }),
  W('elven_longbow', 'Elven Longbow', 'bow', 8, 0, 45, 2500, 30, { twoHanded: true, range: 7, ammoType: 'arrow', vocations: PALADIN, rarity: 'rare', bonus: { attack: 2 } }),
  W('light_crossbow', 'Light Crossbow', 'crossbow', 2, 0, 8, 120, 40, { twoHanded: true, range: 5, ammoType: 'bolt' }),
  W('heavy_crossbow', 'Heavy Crossbow', 'crossbow', 6, 0, 40, 1800, 52, { twoHanded: true, range: 6, ammoType: 'bolt', vocations: PALADIN, rarity: 'uncommon' }),
  W('frostbite_crossbow', 'Frostbite Crossbow', 'crossbow', 8, 0, 55, 4200, 48, { twoHanded: true, range: 6, ammoType: 'bolt', vocations: PALADIN, rarity: 'rare', bonus: { resist: { ice: 5 } } }),
  W('dragonbane_crossbow', 'Dragonbane Crossbow', 'crossbow', 10, 0, 80, 12000, 50, { twoHanded: true, range: 7, ammoType: 'bolt', vocations: PALADIN, rarity: 'legendary', bonus: { resist: { fire: 5 } } }),
  // throwing weapons (the stack in your hand is used up)
  W('spear', 'Spear', 'throwing', 25, 0, 1, 3, 20, { range: 4 }),
  W('throwing_star', 'Throwing Star', 'throwing', 28, 0, 15, 4, 2, { range: 4 }),
  W('royal_spear', 'Royal Spear', 'throwing', 30, 0, 20, 6, 20, { range: 4, breakChance: 0.7 }),
  W('enchanted_spear', 'Runebound Spear', 'throwing', 34, 0, 30, 18, 20, { range: 5, vocations: PALADIN, breakChance: 0.3, rarity: 'uncommon', note: 'Its runes keep it whole: it is rarely lost when thrown.' }),
  W('viper_star', 'Viper Star', 'throwing', 30, 0, 20, 8, 2, { range: 4, element: 'earth', elementDamage: 8, rarity: 'uncommon' }),
  W('shadow_star', 'Shadow Star', 'throwing', 42, 0, 45, 25, 2, { range: 4, vocations: PALADIN, rarity: 'rare' }),
  W('royal_javelin', 'Royal Javelin', 'throwing', 36, 0, 30, 10, 15, { range: 5, vocations: PALADIN, rarity: 'uncommon' }),
  // wands (sorcerer) and rods (druid)
  W('wand_of_sparks', 'Wand of Sparks', 'wand', 0, 0, 7, 100, 23, { vocations: SORC, range: 4, element: 'energy', magicDamage: [13, 25], manaPerShot: 2 }),
  W('wand_of_embers', 'Wand of Embers', 'wand', 0, 0, 19, 500, 23, { vocations: SORC, range: 4, element: 'fire', magicDamage: [25, 40], manaPerShot: 4, rarity: 'uncommon' }),
  W('wand_of_storms', 'Wand of Storms', 'wand', 0, 0, 33, 2000, 22, { vocations: SORC, range: 4, element: 'energy', magicDamage: [40, 62], manaPerShot: 7, rarity: 'rare' }),
  W('wand_of_inferno', 'Wand of Inferno', 'wand', 0, 0, 65, 9000, 22, { vocations: SORC, range: 4, element: 'fire', magicDamage: [65, 90], manaPerShot: 11, rarity: 'legendary' }),
  W('rod_of_frost', 'Rod of Frost', 'rod', 0, 0, 7, 100, 29, { vocations: DRUID, range: 4, element: 'ice', magicDamage: [13, 25], manaPerShot: 2 }),
  W('rod_of_thorns', 'Rod of Thorns', 'rod', 0, 0, 19, 500, 29, { vocations: DRUID, range: 4, element: 'earth', magicDamage: [25, 40], manaPerShot: 4, rarity: 'uncommon' }),
  W('rod_of_glaciers', 'Rod of Glaciers', 'rod', 0, 0, 33, 2000, 29, { vocations: DRUID, range: 4, element: 'ice', magicDamage: [40, 62], manaPerShot: 7, rarity: 'rare' }),
  W('rod_of_wilds', 'Rod of the Wilds', 'rod', 0, 0, 65, 9000, 29, { vocations: DRUID, range: 4, element: 'earth', magicDamage: [65, 90], manaPerShot: 11, rarity: 'legendary' }),

  // --- ammunition ---------------------------------------------------------------------
  def({ id: 'arrow', name: 'Arrow', kind: 'ammo', ammoType: 'arrow', attack: 18, weight: 0.7, value: 1, tint: '#c9b28a' }),
  def({ id: 'poison_arrow', name: 'Venom Arrow', kind: 'ammo', ammoType: 'arrow', attack: 20, element: 'earth', elementDamage: 6, weight: 0.8, value: 2, level: 10, rarity: 'uncommon' }),
  def({ id: 'flaming_arrow', name: 'Flaming Arrow', kind: 'ammo', ammoType: 'arrow', attack: 24, element: 'fire', elementDamage: 10, weight: 0.8, value: 4, level: 30, rarity: 'rare' }),
  def({ id: 'onyx_arrow', name: 'Onyx Arrow', kind: 'ammo', ammoType: 'arrow', attack: 26, weight: 0.8, value: 3, level: 25, tint: '#3a3a4a', rarity: 'uncommon' }),
  def({ id: 'hawkeye_arrow', name: 'Hawkeye Arrow', kind: 'ammo', ammoType: 'arrow', attack: 30, weight: 0.7, value: 5, level: 35, tint: '#6ad0a0', rarity: 'uncommon' }),
  def({ id: 'bolt', name: 'Bolt', kind: 'ammo', ammoType: 'bolt', attack: 25, weight: 0.9, value: 2, tint: '#9aa0a8' }),
  def({ id: 'piercing_bolt', name: 'Piercing Bolt', kind: 'ammo', ammoType: 'bolt', attack: 32, weight: 0.9, value: 4, level: 25, rarity: 'uncommon' }),
  def({ id: 'frost_bolt', name: 'Rime Bolt', kind: 'ammo', ammoType: 'bolt', attack: 34, element: 'ice', elementDamage: 10, weight: 0.9, value: 7, level: 45, rarity: 'rare' }),
  def({ id: 'infernal_bolt', name: 'Infernal Bolt', kind: 'ammo', ammoType: 'bolt', attack: 38, element: 'fire', elementDamage: 12, weight: 0.9, value: 8, level: 60, rarity: 'rare' }),

  // --- shields & spellbooks -------------------------------------------------------------
  def({ id: 'wooden_shield', name: 'Wooden Shield', kind: 'shield', defense: 12, weight: 40, value: 8, tint: '#a8743f' }),
  def({ id: 'iron_shield', name: 'Iron Kite Shield', kind: 'shield', defense: 18, level: 8, weight: 60, value: 80 }),
  def({ id: 'dwarven_shield', name: 'Dwarven Shield', kind: 'shield', defense: 20, level: 12, weight: 70, value: 200 }),
  def({ id: 'scarab_shield', name: 'Scarab Shield', kind: 'shield', defense: 22, level: 28, vocations: FIGHTERS, weight: 55, value: 1000, rarity: 'uncommon', bonus: { resist: { earth: 4 } } }),
  def({ id: 'frostscale_shield', name: 'Frostscale Shield', kind: 'shield', defense: 30, level: 60, vocations: FIGHTERS, weight: 62, value: 5500, rarity: 'rare', bonus: { resist: { ice: 7 } } }),
  def({ id: 'tower_shield', name: 'Tower Shield', kind: 'shield', defense: 27, level: 30, vocations: KNIGHT, weight: 90, value: 900, rarity: 'uncommon' }),
  def({ id: 'dragon_shield', name: 'Dragon Scale Shield', kind: 'shield', defense: 24, level: 35, vocations: FIGHTERS, weight: 60, value: 1200, rarity: 'uncommon', bonus: { resist: { fire: 5 } } }),
  def({ id: 'elven_aegis', name: 'Elven Aegis', kind: 'shield', defense: 29, level: 50, vocations: FIGHTERS, weight: 45, value: 3500, rarity: 'rare', bonus: { resist: { earth: 6 } } }),
  def({ id: 'demon_shield', name: 'Demonwall Shield', kind: 'shield', defense: 36, level: 80, vocations: KNIGHT, weight: 75, value: 12000, rarity: 'legendary', bonus: { resist: { fire: 8, death: 8 } } }),
  def({ id: 'apprentice_book', name: "Apprentice's Spellbook", kind: 'shield', defense: 10, vocations: MAGES, weight: 25, value: 40, icon: '▭', bonus: { magic: 3 } }),
  def({ id: 'storm_tome', name: 'Tome of Storms', kind: 'shield', defense: 16, level: 40, vocations: MAGES, weight: 25, value: 3000, icon: '▭', rarity: 'rare', bonus: { magic: 8, mana: 80, resist: { energy: 5 } } }),

  // --- helmets ----------------------------------------------------------------------------
  def({ id: 'leather_helmet', name: 'Leather Cap', kind: 'helmet', armor: 1, weight: 22, value: 4 }),
  def({ id: 'chain_helmet', name: 'Chain Coif', kind: 'helmet', armor: 2, weight: 42, value: 25 }),
  def({ id: 'iron_helmet', name: 'Iron Helmet', kind: 'helmet', armor: 3, level: 8, weight: 30, value: 90 }),
  def({ id: 'fur_cap', name: 'Fur Cap', kind: 'helmet', armor: 1, weight: 12, value: 25, bonus: { resist: { ice: 3 } } }),
  def({ id: 'dwarven_helmet', name: 'Dwarven Helmet', kind: 'helmet', armor: 4, level: 15, weight: 42, value: 320, rarity: 'uncommon' }),
  def({ id: 'winged_helmet', name: 'Winged Helmet', kind: 'helmet', armor: 4, level: 22, vocations: FIGHTERS, weight: 34, value: 500, rarity: 'uncommon', bonus: { speed: 3 } }),
  def({ id: 'frost_circlet', name: 'Rime Circlet', kind: 'helmet', armor: 2, level: 40, vocations: MAGES, weight: 9, value: 2200, rarity: 'rare', bonus: { mana: 60, magic: 3, resist: { ice: 4 } } }),
  def({ id: 'frost_helm', name: 'Glacier Helm', kind: 'helmet', armor: 6, level: 50, vocations: FIGHTERS, weight: 52, value: 3200, rarity: 'rare', bonus: { resist: { ice: 6 } } }),
  def({ id: 'orc_warhelm', name: 'Orc Warhelm', kind: 'helmet', armor: 5, level: 20, vocations: FIGHTERS, weight: 45, value: 400, rarity: 'uncommon' }),
  def({ id: 'elven_circlet', name: 'Elven Circlet', kind: 'helmet', armor: 2, level: 30, vocations: ['paladin', 'sorcerer', 'druid'], weight: 10, value: 1500, rarity: 'rare', bonus: { mana: 60, magic: 4, manaRegen: 1 } }),
  def({ id: 'dragon_helm', name: 'Dragon Helm', kind: 'helmet', armor: 7, level: 60, vocations: FIGHTERS, weight: 60, value: 4000, rarity: 'rare', bonus: { resist: { fire: 6 } } }),
  def({ id: 'demon_helm', name: 'Horned Demon Helm', kind: 'helmet', armor: 9, level: 90, vocations: KNIGHT, weight: 55, value: 14000, rarity: 'legendary', bonus: { resist: { death: 8, fire: 4 }, hp: 80 } }),

  // --- body armour ----------------------------------------------------------------------------
  def({ id: 'leather_armor', name: 'Leather Armour', kind: 'armor', armor: 3, weight: 60, value: 8 }),
  def({ id: 'fur_armor', name: 'Fur Coat', kind: 'armor', armor: 5, weight: 75, value: 120, bonus: { resist: { ice: 4 } } }),
  def({ id: 'dwarven_armor', name: 'Dwarven Mail', kind: 'armor', armor: 8, level: 25, vocations: FIGHTERS, weight: 110, value: 900, rarity: 'uncommon', bonus: { hpRegen: 1 } }),
  def({ id: 'mage_robe', name: 'Mage Robe', kind: 'armor', armor: 3, level: 10, vocations: MAGES, weight: 35, value: 150, bonus: { mana: 60, manaRegen: 1 } }),
  def({ id: 'chain_armor', name: 'Chain Mail', kind: 'armor', armor: 6, weight: 100, value: 80 }),
  def({ id: 'plate_armor', name: 'Plate Armour', kind: 'armor', armor: 9, level: 20, vocations: FIGHTERS, weight: 120, value: 400 }),
  def({ id: 'elven_mail', name: 'Elven Mail', kind: 'armor', armor: 9, level: 40, vocations: PALADIN, weight: 70, value: 2500, rarity: 'rare', bonus: { attack: 2, resist: { earth: 5 } } }),
  def({ id: 'arcane_robe', name: 'Robe of the Arcane', kind: 'armor', armor: 6, level: 50, vocations: MAGES, weight: 40, value: 4000, rarity: 'rare', bonus: { mana: 150, magic: 6, manaRegen: 2 } }),
  def({ id: 'lizardscale_armor', name: 'Lizardscale Armour', kind: 'armor', armor: 9, level: 45, vocations: PALADIN, weight: 65, value: 3000, rarity: 'rare', bonus: { attack: 1, resist: { earth: 6 } } }),
  def({ id: 'glacier_robe', name: 'Glacier Robe', kind: 'armor', armor: 5, level: 40, vocations: MAGES, weight: 38, value: 3500, rarity: 'rare', bonus: { mana: 100, magic: 4, resist: { ice: 6 } } }),
  def({ id: 'frost_plate', name: 'Frostforged Plate', kind: 'armor', armor: 12, level: 60, vocations: FIGHTERS, weight: 120, value: 6200, rarity: 'rare', bonus: { resist: { ice: 8 } } }),
  def({ id: 'dragon_scale_mail', name: 'Dragon Scale Mail', kind: 'armor', armor: 12, level: 60, vocations: FIGHTERS, weight: 110, value: 6000, rarity: 'rare', bonus: { resist: { fire: 8 } } }),
  def({ id: 'demonplate', name: 'Demonplate', kind: 'armor', armor: 15, level: 100, vocations: KNIGHT, weight: 150, value: 20000, rarity: 'legendary', bonus: { hp: 150, resist: { physical: 4, fire: 6, death: 6 } } }),

  // --- legs -----------------------------------------------------------------------------------
  def({ id: 'leather_legs', name: 'Leather Legs', kind: 'legs', armor: 1, weight: 18, value: 5 }),
  def({ id: 'chain_legs', name: 'Chain Legs', kind: 'legs', armor: 3, weight: 50, value: 40 }),
  def({ id: 'fur_legs', name: 'Fur Trousers', kind: 'legs', armor: 2, weight: 25, value: 40, bonus: { resist: { ice: 3 } } }),
  def({ id: 'dwarven_legs', name: 'Dwarven Legs', kind: 'legs', armor: 4, level: 20, weight: 55, value: 420, rarity: 'uncommon' }),
  def({ id: 'plate_legs', name: 'Plate Legs', kind: 'legs', armor: 6, level: 30, vocations: FIGHTERS, weight: 70, value: 900, rarity: 'uncommon' }),
  def({ id: 'elven_leggings', name: 'Elven Leggings', kind: 'legs', armor: 5, level: 40, vocations: ['paladin', 'sorcerer', 'druid'], weight: 30, value: 2000, rarity: 'rare', bonus: { speed: 5, mana: 40 } }),
  def({ id: 'hydra_legs', name: 'Hydrascale Legs', kind: 'legs', armor: 7, level: 60, weight: 55, value: 5000, rarity: 'rare', bonus: { resist: { ice: 6, earth: 6 } } }),
  def({ id: 'frost_legs', name: 'Frostforged Legs', kind: 'legs', armor: 7, level: 55, vocations: FIGHTERS, weight: 65, value: 4500, rarity: 'rare', bonus: { resist: { ice: 6 } } }),
  def({ id: 'demon_legs', name: 'Infernal Greaves', kind: 'legs', armor: 9, level: 90, vocations: KNIGHT, weight: 75, value: 14000, rarity: 'legendary', bonus: { resist: { fire: 8 } } }),

  // --- boots ----------------------------------------------------------------------------------
  def({ id: 'leather_boots', name: 'Leather Boots', kind: 'boots', armor: 1, weight: 9, value: 2 }),
  def({ id: 'fur_boots', name: 'Fur Boots', kind: 'boots', armor: 1, weight: 12, value: 50, bonus: { resist: { ice: 4 } } }),
  def({ id: 'traveler_boots', name: "Traveller's Boots", kind: 'boots', armor: 1, level: 10, weight: 9, value: 300, rarity: 'uncommon', bonus: { speed: 10 } }),
  def({ id: 'steel_boots', name: 'Steel Boots', kind: 'boots', armor: 3, level: 30, vocations: FIGHTERS, weight: 29, value: 1500, rarity: 'uncommon' }),
  def({ id: 'glacier_boots', name: 'Glacier Boots', kind: 'boots', armor: 2, level: 40, weight: 16, value: 2600, rarity: 'rare', bonus: { speed: 5, resist: { ice: 8 } } }),
  def({ id: 'emberwalk_boots', name: 'Emberwalk Boots', kind: 'boots', armor: 2, level: 50, weight: 15, value: 3000, rarity: 'rare', bonus: { resist: { fire: 10 } }, note: 'Fire fields cannot burn you.' }),
  def({ id: 'windstride_boots', name: 'Windstride Boots', kind: 'boots', armor: 1, level: 60, weight: 7, value: 10000, rarity: 'legendary', bonus: { speed: 30 } }),

  // --- amulets & rings ----------------------------------------------------------------------
  def({ id: 'amulet_of_warding', name: 'Amulet of Warding', kind: 'amulet', weight: 6, value: 400, rarity: 'uncommon', bonus: { resist: { physical: 6 } } }),
  def({ id: 'garnet_amulet', name: 'Garnet Amulet', kind: 'amulet', weight: 5, value: 600, rarity: 'uncommon', bonus: { resist: { fire: 10 } } }),
  def({ id: 'frost_pendant', name: 'Frost Pendant', kind: 'amulet', weight: 5, value: 600, rarity: 'uncommon', bonus: { resist: { ice: 10 } } }),
  def({ id: 'jade_amulet', name: 'Jade Amulet', kind: 'amulet', weight: 5, value: 600, rarity: 'uncommon', bonus: { resist: { earth: 10 } } }),
  def({ id: 'scarab_amulet', name: 'Scarab Amulet', kind: 'amulet', level: 25, weight: 6, value: 900, rarity: 'uncommon', bonus: { resist: { earth: 6, death: 6 } } }),
  def({ id: 'demonbone_amulet', name: 'Demonbone Amulet', kind: 'amulet', level: 80, weight: 8, value: 15000, rarity: 'legendary', bonus: { hp: 120, resist: { physical: 4, fire: 4, ice: 4, energy: 4, earth: 4, death: 4 } } }),
  def({ id: 'ring_of_vigor', name: 'Ring of Vigour', kind: 'ring', weight: 1, value: 500, rarity: 'uncommon', bonus: { hpRegen: 4 } }),
  def({ id: 'sapphire_ring', name: 'Sapphire Ring', kind: 'ring', weight: 1, value: 500, rarity: 'uncommon', bonus: { manaRegen: 4 } }),
  def({ id: 'ring_of_swiftness', name: 'Ring of Swiftness', kind: 'ring', weight: 1, value: 700, rarity: 'uncommon', bonus: { speed: 15 } }),
  def({ id: 'ring_of_might', name: 'Ring of Might', kind: 'ring', level: 40, weight: 1, value: 2500, rarity: 'rare', bonus: { attack: 4 } }),
  def({ id: 'sunstone_ring', name: 'Sunstone Ring', kind: 'ring', weight: 1, value: 300, bonus: { light: 3 } }),

  // --- creature products (sold to traders) -------------------------------------------------
  ...([
    ['rat_tail', 'Rat Tail', 3], ['wolf_pelt', 'Wolf Pelt', 12], ['bone', 'Old Bone', 6], ['orc_tooth', 'Orc Tooth', 15],
    ['orc_charm', 'Shaman Charm', 25], ['orc_banner', 'Tattered Warbanner', 120], ['elvish_talisman', 'Elvish Talisman', 45],
    ['elven_scroll', 'Elven Scroll', 90], ['crocodile_leather', 'Crocodile Leather', 40], ['spider_silk', 'Spider Silk', 35],
    ['troll_hair', 'Troll Hair', 30], ['hydra_head', 'Hydra Head', 600], ['hydra_egg', 'Hydra Egg', 400],
    ['ghoul_snack', 'Rotten Morsel', 8], ['fiery_heart', 'Fiery Heart', 300], ['behemoth_claw', 'Behemoth Claw', 1200],
    ['demon_horn', 'Demon Horn', 2500], ['demonic_essence', 'Demonic Essence', 1000], ['dragon_scale', 'Dragon Scale', 90],
    ['red_dragon_scale', 'Crimson Dragon Scale', 400], ['small_ruby', 'Small Ruby', 250], ['small_sapphire', 'Small Sapphire', 250],
    ['small_emerald', 'Small Emerald', 250], ['small_diamond', 'Small Diamond', 300], ['golden_goblet', 'Golden Goblet', 800],
    // northlands, mountains and desert
    ['silver_fur', 'Silver Rabbit Fur', 8], ['antlers', 'Antlers', 15], ['snakeskin', 'Snakeskin', 10], ['penguin_feather', 'Penguin Feather', 6],
    ['bear_paw', 'Bear Paw', 30], ['winter_wolf_fur', 'Winter Wolf Fur', 25], ['polar_bear_fur', 'Polar Bear Fur', 60], ['iron_ore', 'Iron Ore', 20],
    ['frost_charm', 'Frost Charm', 35], ['braided_cord', 'Braided Warrior Cord', 30], ['skull_trophy', 'Skull Trophy', 140],
    ['minotaur_horn', 'Minotaur Horn', 45], ['minotaur_leather', 'Minotaur Leather', 55], ['cyclops_eye', 'Eye of a Cyclops', 160],
    ['scorpion_tail', 'Scorpion Tail', 40], ['scarab_coin', 'Scarab Coin', 100], ['mummy_wrapping', 'Mummy Wrapping', 35],
    ['lizard_scale', 'Lizard Scale', 70], ['giant_beard', 'Frost Giant Beard', 180], ['crystal_shard', 'Ice Crystal Shard', 150],
    ['frozen_heart', 'Frozen Heart', 500], ['frost_dragon_scale', 'Frost Dragon Scale', 220],
  ] as Array<[string, string, number]>).map(([id, name, value]) => def({ id, name, kind: 'material', weight: id === 'golden_goblet' ? 30 : id === 'iron_ore' ? 12 : id === 'skull_trophy' ? 20 : id === 'polar_bear_fur' ? 15 : 2, value })),

  // --- woodcutting: logs from felled trees (traders buy them) ------------------------------
  def({ id: 'logs', name: 'Logs', kind: 'material', weight: 8, value: 4, tint: '#9a6a3a', note: 'Cut from an ordinary tree.' }),
  def({ id: 'pine_logs', name: 'Pine Logs', kind: 'material', weight: 8, value: 12, tint: '#b08850', note: 'Resinous pine wood. Woodcutting 15.' }),
  def({ id: 'palm_logs', name: 'Palm Logs', kind: 'material', weight: 8, value: 22, tint: '#c8a870', note: 'Light, fibrous palm wood. Woodcutting 25.' }),
  def({ id: 'teak_logs', name: 'Teak Logs', kind: 'material', weight: 9, value: 38, tint: '#7a4a28', rarity: 'uncommon', note: 'Hard jungle teak. Woodcutting 35.' }),

  // --- fishing: catches you can eat or sell (the plain 'fish' above is the small fish) ------
  def({ id: 'trout', name: 'Trout', kind: 'consumable', weight: 6, value: 6, heal: 40, tint: '#9aa86a', icon: '◆', note: 'A speckled river fish. Fishing 10.' }),
  def({ id: 'pike', name: 'Pike', kind: 'consumable', weight: 8, value: 12, heal: 60, tint: '#6a8a4a', icon: '◆', note: 'A toothy lake hunter. Fishing 20.' }),
  def({ id: 'salmon', name: 'Salmon', kind: 'consumable', weight: 9, value: 22, heal: 90, tint: '#e08a70', icon: '◆', note: 'Rich pink flesh from the shallows. Fishing 30.' }),
  def({ id: 'ice_fish', name: 'Ice Fish', kind: 'consumable', weight: 8, value: 35, heal: 120, tint: '#bfe6f5', icon: '◆', rarity: 'uncommon', note: 'Nearly see-through; lives under the northern ice. Fishing 40.' }),
  def({ id: 'swordfish', name: 'Swordfish', kind: 'consumable', weight: 14, value: 60, heal: 180, tint: '#5a7ab0', icon: '◆', rarity: 'uncommon', note: 'A fighter of the deep sea. Fishing 50.' }),
  def({ id: 'old_boot', name: 'Old Boot', kind: 'material', weight: 6, value: 1, tint: '#6a5038', note: 'Soggy, smelly, and somebody\'s loss.' }),

  // --- mining: ores (iron_ore is the old loot item above), pickaxes -------------------------
  def({ id: 'copper_ore', name: 'Copper Ore', kind: 'material', weight: 10, value: 3, tint: '#c8743a', note: 'Smelt with tin ore into bronze. Mining 1.' }),
  def({ id: 'tin_ore', name: 'Tin Ore', kind: 'material', weight: 10, value: 3, tint: '#b8bcc4', note: 'Smelt with copper ore into bronze. Mining 1.' }),
  def({ id: 'coal', name: 'Coal', kind: 'material', weight: 8, value: 10, tint: '#2a2a30', note: 'Feeds the furnace for steel and finer metals. Mining 30.' }),
  def({ id: 'silver_ore', name: 'Silver Ore', kind: 'material', weight: 10, value: 45, tint: '#e4e8f0', note: 'Mining 40.' }),
  def({ id: 'gold_ore', name: 'Gold Ore', kind: 'material', weight: 12, value: 90, tint: '#f0c030', note: 'Mining 50.' }),
  def({ id: 'starsteel_ore', name: 'Starsteel Ore', kind: 'material', weight: 12, value: 120, tint: '#5a8ad8', rarity: 'uncommon', note: 'Blue-veined ore said to fall from the night sky. Mining 60.' }),
  def({ id: 'darkstone_ore', name: 'Darkstone Ore', kind: 'material', weight: 14, value: 300, tint: '#6a3a7a', rarity: 'rare', note: 'Heavy, cold and nearly black. Found only in the deepest rock. Mining 75.' }),
  def({ id: 'bronze_pickaxe', name: 'Bronze Pickaxe', kind: 'tool', tool: 'mining', weight: 40, value: 10, tint: '#c8843a', note: 'Use an ore rock to mine it.' }),
  def({ id: 'iron_pickaxe', name: 'Iron Pickaxe', kind: 'tool', tool: 'mining', weight: 42, value: 60, tint: '#9aa0aa', note: 'Mines faster than bronze. Mining 10.' }),
  def({ id: 'steel_pickaxe', name: 'Steel Pickaxe', kind: 'tool', tool: 'mining', weight: 42, value: 250, tint: '#c9d0da', rarity: 'uncommon', note: 'Mines faster than iron. Mining 25.' }),
  def({ id: 'starsteel_pickaxe', name: 'Starsteel Pickaxe', kind: 'tool', tool: 'mining', weight: 38, value: 900, tint: '#5a8ad8', rarity: 'rare', note: 'The best pickaxe a smith can make. Mining 45.' }),

  // --- blacksmithing: bars, the hammer, and smithed gear the shops never had ----------------
  def({ id: 'smithing_hammer', name: "Smith's Hammer", kind: 'tool', tool: 'hammer', weight: 25, value: 8, tint: '#8a8f9a', note: 'Use an anvil with bars to smith.' }),
  def({ id: 'bronze_bar', name: 'Bronze Bar', kind: 'material', weight: 10, value: 8, tint: '#c8843a', note: 'Smelted from copper and tin. Blacksmithing 1.' }),
  def({ id: 'iron_bar', name: 'Iron Bar', kind: 'material', weight: 10, value: 30, tint: '#9aa0aa', note: 'Blacksmithing 15.' }),
  def({ id: 'silver_bar', name: 'Silver Bar', kind: 'material', weight: 10, value: 60, tint: '#e4e8f0', note: 'Precious metal for jewellers. Blacksmithing 20.' }),
  def({ id: 'steel_bar', name: 'Steel Bar', kind: 'material', weight: 10, value: 55, tint: '#c9d0da', note: 'Iron hardened with coal. Blacksmithing 30.' }),
  def({ id: 'gold_bar', name: 'Gold Bar', kind: 'material', weight: 12, value: 110, tint: '#f0c030', note: 'Precious metal for jewellers. Blacksmithing 40.' }),
  def({ id: 'starsteel_bar', name: 'Starsteel Bar', kind: 'material', weight: 10, value: 220, tint: '#5a8ad8', rarity: 'uncommon', note: 'Blacksmithing 50.' }),
  def({ id: 'darkstone_bar', name: 'Darkstone Bar', kind: 'material', weight: 12, value: 520, tint: '#6a3a7a', rarity: 'rare', note: 'Blacksmithing 80.' }),
  def({ id: 'bronze_arrowheads', name: 'Bronze Arrowheads', kind: 'material', weight: 0.2, value: 1, tint: '#c8843a', note: 'For fletchers.' }),
  def({ id: 'iron_arrowheads', name: 'Iron Arrowheads', kind: 'material', weight: 0.2, value: 2, tint: '#9aa0aa', note: 'For fletchers.' }),
  def({ id: 'steel_arrowheads', name: 'Steel Arrowheads', kind: 'material', weight: 0.2, value: 4, tint: '#c9d0da', note: 'For fletchers.' }),
  def({ id: 'starsteel_arrowheads', name: 'Starsteel Arrowheads', kind: 'material', weight: 0.2, value: 15, tint: '#5a8ad8', rarity: 'uncommon', note: 'For fletchers.' }),
  def({ id: 'darkstone_arrowheads', name: 'Darkstone Arrowheads', kind: 'material', weight: 0.2, value: 35, tint: '#6a3a7a', rarity: 'rare', note: 'For fletchers.' }),
  W('bronze_dagger', 'Bronze Dagger', 'sword', 8, 4, 1, 6, 15),
  W('iron_dagger', 'Iron Dagger', 'sword', 11, 6, 4, 22, 18),
  W('steel_dagger', 'Steel Dagger', 'sword', 14, 8, 10, 40, 18),
  W('starsteel_dagger', 'Starsteel Dagger', 'sword', 20, 10, 30, 180, 15, { rarity: 'uncommon' }),
  W('darkstone_dagger', 'Darkstone Dagger', 'sword', 26, 12, 45, 450, 16, { rarity: 'rare' }),
  W('bronze_mace', 'Bronze Mace', 'club', 11, 6, 1, 12, 45),
  W('starsteel_sword', 'Starsteel Sword', 'sword', 30, 18, 40, 700, 48, { vocations: KNIGHT, rarity: 'uncommon' }),
  W('starsteel_axe', 'Starsteel Axe', 'axe', 31, 14, 40, 400, 60, { vocations: KNIGHT, rarity: 'uncommon' }),
  W('starsteel_mace', 'Starsteel Mace', 'club', 30, 14, 40, 400, 70, { vocations: KNIGHT, rarity: 'uncommon' }),
  W('darkstone_sword', 'Darkstone Sword', 'sword', 38, 22, 60, 1800, 52, { vocations: KNIGHT, rarity: 'rare' }),
  W('darkstone_axe', 'Darkstone Axe', 'axe', 39, 16, 60, 1100, 66, { vocations: KNIGHT, rarity: 'rare' }),
  W('darkstone_mace', 'Darkstone Mace', 'club', 38, 16, 60, 1100, 75, { vocations: KNIGHT, rarity: 'rare' }),
  def({ id: 'bronze_shield', name: 'Bronze Shield', kind: 'shield', defense: 14, weight: 50, value: 20 }),
  def({ id: 'steel_shield', name: 'Steel Kite Shield', kind: 'shield', defense: 23, level: 25, weight: 65, value: 400 }),
  def({ id: 'starsteel_shield', name: 'Starsteel Shield', kind: 'shield', defense: 28, level: 45, vocations: FIGHTERS, weight: 55, value: 1200, rarity: 'uncommon' }),
  def({ id: 'darkstone_shield', name: 'Darkstone Shield', kind: 'shield', defense: 32, level: 65, vocations: FIGHTERS, weight: 62, value: 2800, rarity: 'rare' }),
  def({ id: 'steel_helmet', name: 'Steel Helmet', kind: 'helmet', armor: 4, level: 18, weight: 36, value: 150 }),
  def({ id: 'starsteel_helm', name: 'Starsteel Helm', kind: 'helmet', armor: 6, level: 45, vocations: FIGHTERS, weight: 36, value: 600, rarity: 'uncommon' }),
  def({ id: 'darkstone_helm', name: 'Darkstone Helm', kind: 'helmet', armor: 7, level: 60, vocations: FIGHTERS, weight: 40, value: 1500, rarity: 'rare' }),
  def({ id: 'steel_plate', name: 'Steel Plate', kind: 'armor', armor: 10, level: 30, vocations: FIGHTERS, weight: 125, value: 600 }),
  def({ id: 'starsteel_plate', name: 'Starsteel Plate', kind: 'armor', armor: 12, level: 50, vocations: FIGHTERS, weight: 100, value: 2400, rarity: 'uncommon' }),
  def({ id: 'darkstone_plate', name: 'Darkstone Plate', kind: 'armor', armor: 13, level: 70, vocations: FIGHTERS, weight: 110, value: 5500, rarity: 'rare' }),
  def({ id: 'iron_legs', name: 'Iron Legs', kind: 'legs', armor: 4, level: 12, weight: 55, value: 70 }),
  def({ id: 'starsteel_legs', name: 'Starsteel Legs', kind: 'legs', armor: 7, level: 45, vocations: FIGHTERS, weight: 55, value: 1300, rarity: 'uncommon' }),
  def({ id: 'darkstone_legs', name: 'Darkstone Legs', kind: 'legs', armor: 8, level: 65, vocations: FIGHTERS, weight: 60, value: 3000, rarity: 'rare' }),
];

/** Logs from woodcutting, cheapest first. */
export const LOG_ITEMS = ['logs', 'pine_logs', 'palm_logs', 'teak_logs'];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  return d;
}

export function isItem(id: unknown): id is string {
  return typeof id === 'string' && id in ITEMS;
}

/** Which equipment slot an item goes in, if any. */
export function equipSlotFor(d: ItemDef): EquipSlot | null {
  switch (d.kind) {
    case 'weapon': return 'weapon';
    case 'shield': return 'shield';
    case 'helmet': return 'head';
    case 'armor': return 'armor';
    case 'legs': return 'legs';
    case 'boots': return 'feet';
    case 'amulet': return 'amulet';
    case 'ring': return 'ring';
    case 'backpack': return 'backpack';
    case 'ammo': return 'ammo';
    default: return null;
  }
}

export interface ItemStack {
  id: string;
  qty: number;
}

function runeSummary(r: RuneEffect): string {
  switch (r.type) {
    case 'heal': return 'healing rune';
    case 'cure': return 'cures poison';
    case 'paralyze': return `slows a monster for ${r.duration ?? 10} s`;
    case 'destroyField': return 'removes a magic field';
    case 'field': {
      const what = r.field === 'wall' ? 'a magic wall' : `${r.field} field${r.shape === 'tile' ? '' : 's'}`;
      return `${r.shape === 'bomb' ? '3×3 ' : r.shape === 'wall' ? '5-tile wall of ' : ''}${what}, ${r.duration ?? 30} s`;
    }
    default: return `${r.element} ${r.radius ? 'area ' : ''}rune`;
  }
}

/** One-line stat summary used by tooltips and shop lists. */
export function describeItem(d: ItemDef): string {
  const parts: string[] = [];
  if (d.weaponType) {
    if (d.magicDamage) parts.push(`${d.element} ${d.magicDamage[0]}–${d.magicDamage[1]} · ${d.manaPerShot} mana/shot`);
    else if (d.weaponType === 'bow' || d.weaponType === 'crossbow') parts.push(`${d.weaponType}, +${d.attack} attack, uses ${d.ammoType}s`);
    else parts.push(`${d.weaponType}, Atk ${d.attack}${d.elementDamage ? ` +${d.elementDamage} ${d.element}` : ''}${d.defense ? `, Def ${d.defense}` : ''}`);
    if (d.range) parts.push(`range ${d.range}`);
    if (d.twoHanded) parts.push('two-handed');
  }
  if (d.kind === 'ammo') parts.push(`${d.ammoType}, Atk ${d.attack}${d.elementDamage ? ` +${d.elementDamage} ${d.element}` : ''}`);
  if (d.kind === 'shield') parts.push(`Def ${d.defense}`);
  if (d.armor) parts.push(`Arm ${d.armor}`);
  if (d.slots) parts.push(`${d.slots} slots`);
  if (d.heal) parts.push(`heals ${d.heal}`);
  if (d.mana) parts.push(`restores ${d.mana} mana`);
  if (d.rune) parts.push(runeSummary(d.rune));
  const b = d.bonus;
  if (b) {
    if (b.hp) parts.push(`+${b.hp} hp`);
    if (b.mana) parts.push(`+${b.mana} mana`);
    if (b.speed) parts.push(`speed +${b.speed}%`);
    if (b.hpRegen) parts.push(`hp regen +${b.hpRegen}`);
    if (b.manaRegen) parts.push(`mana regen +${b.manaRegen}`);
    if (b.magic) parts.push(`magic +${b.magic}%`);
    if (b.attack) parts.push(`attack +${b.attack}`);
    if (b.light) parts.push(`light +${b.light}`);
    if (b.resist) for (const [k, v] of Object.entries(b.resist)) parts.push(`${k} ${v}%`);
  }
  if (d.level) parts.push(`lvl ${d.level}+`);
  if (d.vocations) parts.push(d.vocations.map((v) => v[0].toUpperCase() + v.slice(1) + 's').join('/') + ' only');
  parts.push(`${d.weight} oz`);
  return parts.join(' · ') + (d.note ? `. ${d.note}` : '');
}
