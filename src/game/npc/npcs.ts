import { ITEMS } from '../inventory/items';
import type { SpellId } from '../magic/spells';
import type { Outfit } from '../player/outfits';
import { SPELLS } from '../magic/spells';
import { FERRIES, fare, TOWNS, type StaffRole } from '../world/townList';
import { EXTRA_BUYS, EXTRA_SELLS, EXTRA_SPELLS } from './stock';

export interface ShopEntry {
  id: string;
  price: number;
}

export interface TravelEntry {
  /** Destination key in WorldMap.destinations. */
  key: string;
  name: string;
  price: number;
}

export interface NpcDef {
  key: string;
  name: string;
  /** Shown under the name (what they do). */
  role: string;
  greeting: string;
  look: Outfit;
  /** Held item shown on the model. */
  prop?: 'halberd' | 'hammer' | 'staff' | 'book' | 'bow' | 'oar' | 'ledger';
  sells?: ShopEntry[];
  /** Item ids this NPC buys, at the item's value. */
  buys?: string[];
  bank?: boolean;
  travel?: TravelEntry[];
  spells?: SpellId[];
  quests?: boolean;
}

const s = (id: string, price?: number): ShopEntry => ({ id, price: price ?? Math.max(1, Math.round(ITEMS[id].value * 2.5)) });
const materials = Object.values(ITEMS).filter((d) => d.kind === 'material').map((d) => d.id);
const byKind = (...kinds: string[]) => Object.values(ITEMS).filter((d) => kinds.includes(d.kind) && d.rarity !== 'legendary').map((d) => d.id);

export const NPCS: Record<string, NpcDef> = {
  aldric: {
    key: 'aldric', name: 'Captain Aldric', role: 'Captain of the Guard', quests: true, prop: 'halberd',
    greeting: 'Hail, {name}. Thornvale is glad of a sword arm. What brings you to me?',
    look: { type: 'knight', head: 45, body: 46, legs: 108, feet: 98 },
    sells: [s('health_potion', 45), s('mana_potion', 50)],
    buys: materials,
  },
  brunhild: {
    key: 'brunhild', name: 'Brunhild', role: 'Weapon & armour smith', prop: 'hammer',
    greeting: 'Steel for the bold, {name}. Buying or selling?',
    look: { type: 'barbarian', head: 61, body: 62, legs: 79, feet: 98 },
    sells: [
      s('short_sword', 30), s('iron_sword', 160), s('bastard_sword', 900), s('hatchet', 70), s('battle_axe', 450), s('iron_mace', 120),
      s('morning_star', 400), s('war_hammer', 1200), s('wooden_shield', 25), s('iron_shield', 220), s('tower_shield', 2500),
      s('leather_helmet', 12), s('chain_helmet', 70), s('iron_helmet', 260), s('leather_armor', 25), s('chain_armor', 230), s('plate_armor', 1200),
      s('leather_legs', 15), s('chain_legs', 120), s('plate_legs', 2600), s('leather_boots', 8), s('steel_boots', 4000),
    ],
    buys: byKind('weapon', 'shield', 'helmet', 'armor', 'legs', 'boots').filter((id) => !['wand', 'rod'].includes(ITEMS[id].weaponType ?? '')),
  },
  mirella: {
    key: 'mirella', name: 'Mirella', role: 'Magic, runes & potions', prop: 'staff',
    greeting: 'Welcome to my little shop of wonders, {name}.',
    look: { type: 'mage', head: 108, body: 107, legs: 31, feet: 98 },
    sells: [
      s('health_potion', 45), s('strong_health_potion', 100), s('great_health_potion', 190), s('mana_potion', 50), s('strong_mana_potion', 90), s('great_mana_potion', 120),
      s('spark_rune', 8), s('fireball_rune', 40), s('avalanche_rune', 45), s('stoneshower_rune', 45), s('death_rune', 110), s('healing_rune', 70),
      s('wand_of_sparks', 500), s('wand_of_embers', 5000), s('wand_of_storms', 10000), s('rod_of_frost', 500), s('rod_of_thorns', 5000), s('rod_of_glaciers', 10000),
      s('apprentice_book', 150), s('mage_robe', 600), s('sunstone_ring', 900),
    ],
    buys: [...byKind('rune'), 'wand_of_sparks', 'wand_of_embers', 'wand_of_storms', 'rod_of_frost', 'rod_of_thorns', 'rod_of_glaciers', 'mage_robe', 'arcane_robe', 'storm_tome', 'elven_scroll', 'orc_charm', 'fiery_heart', 'demonic_essence'],
  },
  garrick: {
    key: 'garrick', name: 'Garrick', role: 'Outfitter — bows, ammo & tools', prop: 'bow',
    greeting: 'Arrows, ropes, packs — everything an adventurer forgets, {name}.',
    look: { type: 'ranger', head: 70, body: 69, legs: 79, feet: 98 },
    sells: [
      s('rope', 50), s('shovel', 50), s('bag', 12), s('backpack', 30), s('explorer_pack', 600),
      s('hunting_bow', 120), s('composite_bow', 1500), s('light_crossbow', 400), s('heavy_crossbow', 6000),
      s('arrow', 3), s('poison_arrow', 6), s('flaming_arrow', 12), s('bolt', 4), s('piercing_bolt', 9), s('infernal_bolt', 20),
      s('spear', 10), s('throwing_star', 14), s('royal_javelin', 30), s('traveler_boots', 1200), s('meat', 6), s('ham', 12),
    ],
    buys: ['hunting_bow', 'composite_bow', 'elven_longbow', 'light_crossbow', 'heavy_crossbow', 'wolf_pelt', 'crocodile_leather', 'spider_silk', 'troll_hair', 'rat_tail', 'bone', 'orc_tooth', 'elvish_talisman'],
  },
  orwin: {
    key: 'orwin', name: 'Orwin', role: 'Banker', bank: true, prop: 'ledger',
    greeting: 'Good day, {name}. Your gold is safe with the Thornvale Bank.',
    look: { type: 'noble', head: 4, body: 125, legs: 107, feet: 99 },
    buys: ['small_ruby', 'small_sapphire', 'small_emerald', 'small_diamond', 'golden_goblet'],
  },
  elias: {
    key: 'elias', name: 'Master Elias', role: 'Spell trainer', prop: 'book',
    greeting: 'Knowledge is the sharpest blade, {name}. Which words would you learn?',
    look: { type: 'mage', head: 6, body: 106, legs: 5, feet: 100 },
    spells: [
      'exura_ico', 'exura_gran', 'exura_vita', 'exura_sio', 'exori', 'exori_gran', 'exori_hur', 'exori_con', 'exori_san',
      'exori_vis', 'exori_flam', 'exori_frigo', 'exori_tera', 'exevo_gran_mas_vis', 'exevo_gran_mas_frigo', 'exevo_mas_san', 'utani_hur', 'utamo_vita',
    ],
  },
  hask: {
    key: 'hask', name: 'Ferryman Hask', role: 'Ship to Palmreach', prop: 'oar',
    greeting: 'Sea\'s calm today, {name}. Fancy a trip south to the jungle?',
    look: { type: 'citizen', head: 3, body: 31, legs: 108, feet: 98 },
    travel: [{ key: 'palmreach', name: 'Palmreach', price: 120 }],
  },
  brann: {
    key: 'brann', name: 'Warden Brann', role: 'Watchpost quartermaster', quests: true, prop: 'halberd',
    greeting: 'Keep your voice down, {name}. The elves in Silverbough have sharp ears.',
    look: { type: 'ranger', head: 79, body: 80, legs: 80, feet: 98 },
    sells: [s('health_potion', 50), s('mana_potion', 55), s('arrow', 3), s('bolt', 4), s('rope', 55), s('shovel', 55)],
    buys: materials,
  },
  mara: {
    key: 'mara', name: 'Captain Mara', role: 'Ship to Thornvale', prop: 'oar',
    greeting: 'Ahoy, {name}! The Saltwind sails north whenever you\'re ready.',
    look: { type: 'noble', head: 1, body: 27, legs: 107, feet: 98 },
    travel: [{ key: 'thornvale', name: 'Thornvale', price: 120 }],
  },
  zuri: {
    key: 'zuri', name: 'Zuri', role: 'Jungle trader', prop: 'bow',
    greeting: 'Welcome to Palmreach, {name}. Hunters sell to me first.',
    look: { type: 'ranger', head: 84, body: 83, legs: 4, feet: 98 },
    sells: [
      s('health_potion', 50), s('strong_health_potion', 110), s('mana_potion', 55), s('strong_mana_potion', 100),
      s('arrow', 4), s('poison_arrow', 7), s('bolt', 5), s('piercing_bolt', 10), s('spear', 12), s('rope', 55), s('shovel', 55),
      s('avalanche_rune', 50), s('stoneshower_rune', 50), s('healing_rune', 75), s('jade_amulet', 2000), s('frost_pendant', 2000),
    ],
    buys: materials,
  },
  tomas: {
    key: 'tomas', name: 'Old Tomas', role: 'Retired hydra hunter', quests: true, prop: 'staff',
    greeting: 'Sit down, {name}. Let an old hunter tell you about the swamps.',
    look: { type: 'citizen', head: 0, body: 61, legs: 99, feet: 98 },
  },
  pell: {
    key: 'pell', name: 'Pell', role: 'Banker', bank: true, prop: 'ledger',
    greeting: 'The Palmreach branch of the Thornvale Bank, at your service, {name}.',
    look: { type: 'noble', head: 3, body: 22, legs: 107, feet: 99 },
  },
};

/** Gold an NPC pays for an item. */
// merge stock added by content updates (see stock.ts)
for (const [key, list] of Object.entries(EXTRA_SELLS)) {
  const n = NPCS[key];
  if (n) n.sells = [...(n.sells ?? []), ...list.filter((e) => ITEMS[e.id] && !(n.sells ?? []).some((x) => x.id === e.id))];
}
for (const [key, list] of Object.entries(EXTRA_BUYS)) {
  const n = NPCS[key];
  if (n) n.buys = [...new Set([...(n.buys ?? []), ...list.filter((id) => ITEMS[id])])];
}

// ---------------------------------------------------------------- the towns of the new world
// Generated from the town table, after the stock merge above so every smith,
// magic shop and outfitter carries the same (extended) wares as Thornvale's.
{
  const hashKey = (k: string) => [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const ROLE: Record<StaffRole, { role: string; prop: NpcDef['prop']; type: Outfit['type'] }> = {
    smith: { role: 'Weapon & armour smith', prop: 'hammer', type: 'barbarian' },
    mage: { role: 'Magic, runes & potions', prop: 'staff', type: 'mage' },
    outfit: { role: 'Outfitter — bows, ammo & tools', prop: 'bow', type: 'ranger' },
    bank: { role: 'Banker', prop: 'ledger', type: 'noble' },
    travel: { role: 'Ship captain', prop: 'oar', type: 'citizen' },
    quest: { role: 'Quest giver', prop: 'halberd', type: 'knight' },
    trainer: { role: 'Spell trainer', prop: 'book', type: 'mage' },
  };
  const QUEST_ROLES: Record<string, string> = {
    westmarch_marshal: 'Marshal of Westmarch', stonedeep_thane: 'Thane of Stonedeep', highmoor_reeve: 'Reeve of Highmoor', millbrook_elder: 'Village elder',
    valdrheim_jarl: 'Jarl of Valdrheim', aurelion_magistrate: 'High Magistrate', briarwatch_ranger: 'Ranger captain', corvane_reeve: 'Reeve of Corvane',
    saltmere_abbot: 'Abbot of Saltmere', sunspire_vizier: 'Vizier of Sunspire', dunewatch_sergeant: 'Sergeant of the watch',
  };
  const trainerSpells = [...new Set([...(NPCS.elias.spells ?? []), ...(EXTRA_SPELLS.elias ?? []).filter((id) => id in SPELLS)])];
  const ports = TOWNS.filter((t) => t.travel === 'ship');
  const central = ['thornvale', 'westmarch', 'elderglen', 'highmoor', 'millbrook'];
  const routesFor = (key: string): TravelEntry[] => {
    const me = TOWNS.find((t) => t.key === key)!;
    if (me.travel === 'cart') return central.map((k) => TOWNS.find((t) => t.key === k)!).map((t) => ({ key: t.key, name: t.name, price: Math.round(fare(me.x, me.y, t.x, t.y) / 2 / 10) * 10 }));
    const list: TravelEntry[] = ports.filter((t) => t.key !== key).map((t) => ({ key: t.key, name: t.name, price: fare(me.x, me.y, t.x, t.y) }));
    if (central.includes(key)) {
      const sd = TOWNS.find((t) => t.key === 'stonedeep')!;
      list.push({ key: 'stonedeep', name: 'Stonedeep (by cart)', price: Math.round(fare(me.x, me.y, sd.x, sd.y) / 2 / 10) * 10 });
    }
    for (const f of FERRIES) if (f.home === key) list.push({ key: f.key, name: f.name, price: 40 });
    return list.sort((a, b) => a.price - b.price);
  };
  for (const t of TOWNS) {
    for (const [role, st] of Object.entries(t.staff) as Array<[StaffRole, { key: string; name: string }]>) {
      if (!st) continue;
      const existing = NPCS[st.key];
      if (role === 'travel') {
        const travel = routesFor(t.key);
        if (existing) {
          existing.travel = travel;
          existing.role = 'Ship captain';
          continue;
        }
      }
      if (existing) continue;
      const r = ROLE[role];
      const h = hashKey(st.key);
      const def: NpcDef = {
        key: st.key, name: st.name, role: role === 'quest' ? QUEST_ROLES[st.key] ?? r.role : role === 'travel' && t.travel === 'cart' ? 'Mine-cart master' : r.role,
        prop: r.prop, greeting: '', look: { type: r.type, head: h % 133, body: (h >> 7) % 133, legs: (h >> 14) % 133, feet: 98 },
      };
      switch (role) {
        case 'smith':
          def.sells = NPCS.brunhild.sells?.map((e) => ({ ...e }));
          def.buys = [...(NPCS.brunhild.buys ?? [])];
          def.greeting = `Steel and leather, {name}. Best forge in ${t.name}.`;
          break;
        case 'mage':
          def.sells = NPCS.mirella.sells?.map((e) => ({ ...e }));
          def.buys = [...(NPCS.mirella.buys ?? [])];
          def.greeting = `Runes, potions and wands, {name}. Mind the shelves.`;
          break;
        case 'outfit':
          def.sells = NPCS.garrick.sells?.map((e) => ({ ...e }));
          def.buys = [...(NPCS.garrick.buys ?? [])];
          def.greeting = `Rope, arrows, a spare backpack? You look like you need all three, {name}.`;
          break;
        case 'bank':
          def.bank = true;
          def.buys = [...(NPCS.orwin.buys ?? [])];
          def.greeting = `Welcome to the ${t.name} branch of the bank, {name}. Your gold is kept in every town.`;
          break;
        case 'travel':
          def.travel = routesFor(t.key);
          def.greeting = t.travel === 'cart' ? `The carts run through the mountain to every town of the heartland, {name}. Where to?` : `Fair winds, {name}. Where shall we sail from ${t.name}?`;
          break;
        case 'quest':
          def.quests = true;
          def.sells = [s('health_potion', 50), s('mana_potion', 55)];
          def.buys = materials;
          def.greeting = `Well met, {name}. ${t.flavour[0].toUpperCase()}${t.flavour.slice(1)} could use someone like you.`;
          break;
        case 'trainer':
          def.spells = trainerSpells;
          def.greeting = 'The words of power are not given lightly, {name}. Which would you learn?';
          break;
      }
      NPCS[st.key] = def;
    }
  }
  for (const f of FERRIES) {
    const home = TOWNS.find((t) => t.key === f.home)!;
    const h = hashKey(f.npc.key);
    NPCS[f.npc.key] = {
      key: f.npc.key, name: f.npc.name, role: `Ferry to ${home.name}`, prop: 'oar',
      greeting: `Only a little boat, {name}, but she floats. Back to ${home.name}?`,
      look: { type: 'citizen', head: h % 133, body: (h >> 7) % 133, legs: (h >> 14) % 133, feet: 98 },
      travel: [{ key: home.key, name: home.name, price: 40 }],
    };
  }
  NPCS.brann.greeting = 'Keep your voice down, {name}. The elves of Silverbough have sharp ears, and their fortress lies just west of Elderglen.';
  NPCS.hask.greeting = "Sea's calm today, {name}. Where can the old Gull take you?";
  NPCS.mara.greeting = "Ahoy, {name}! The Saltwind sails wherever there's a harbour.";
}

export function buyPrice(id: string): number {
  return ITEMS[id]?.value ?? 0;
}
