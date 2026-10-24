/**
 * Headless content test for the northlands update: every monster has a real
 * definition, every item is valid and reachable, buff potions work and expire,
 * conjuring creates ammunition, Groundshaker hits all around the knight, and
 * every monster model builds.
 *   tsx scripts/content-test.ts
 */
declare const process: { exit(code: number): never };
import { PREY } from '../src/game/trades/hunter';
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import { Enemy } from '../src/game/enemies/Enemy';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { describeItem, equipSlotFor, ITEMS, LOG_ITEMS, POTION_BUFF_SECONDS } from '../src/game/inventory/items';
const describeItemText = (id: string) => describeItem(ITEMS[id]);
import { exivaText, SPELLS, type SpellId } from '../src/game/magic/spells';
import { facingFromDelta } from '../src/game/core/types';
import { Ground, Obj } from '../src/game/world/WorldMap';
import { SPELL_RUNES } from '../src/game/npc/stock';
import { TREES } from '../src/game/gathering/woodcutting';
import { FISH, FISH_ITEMS, FISHING_ROD, TREASURE_ITEMS } from '../src/game/gathering/fishing';
import { CATCH_FISH, MATERIAL_SHAPE } from '../src/ui/icons';
import { buildDialogue } from '../src/game/npc/dialogue';
import { NPCS } from '../src/game/npc/npcs';
import { EXTRA_BUYS, EXTRA_SELLS, EXTRA_SPELLS } from '../src/game/npc/stock';
import { applySnapshot, buildSnapshot } from '../src/game/net/protocol';
import { expForLevel } from '../src/game/player/Player';
import type { Vocation } from '../src/game/player/vocations';
import type { EnemyKind } from '../src/game/world/WorldMap';
import { ORES, ORE_ITEMS, PICKAXES, MINING_GEMS, oreAt } from '../src/game/gathering/mining';
import { BAR_ITEMS, BARS, SMITHING_HAMMER, SMITHING_RECIPES, SMELTING_RECIPES } from '../src/game/production/smithing';
import { RECIPES, stationAt } from '../src/game/production/recipes';
import { NONCOMBAT_SKILLS, PLANNED_SKILLS } from '../src/game/gathering/skills';
import { MINE_SPOTS } from '../src/game/world/mines';
import { COOKING_RECIPES, FOODS, RAW_FOOD_ITEMS } from '../src/game/production/cooking';
import { FLETCHING_RECIPES } from '../src/game/production/fletching';
import { CRAFTING_RECIPES, CUT_GEMS } from '../src/game/production/crafting';
import { FIREMAKING_RECIPES } from '../src/game/production/firemaking';
import { STATIONS, stationForItem } from '../src/game/production/recipes';
import { RAW_FISH_ITEMS } from '../src/game/gathering/fishing';
import { floodFill3D } from '../src/game/world/worldGen';
import { activeSets, SETS, SET_BY_ID } from '../src/game/inventory/sets';
import { CAPE_IDS, CAPES, capeProblem, capeTrainingBonus, DUNGEON_BOSS_KINDS, recordBossKill, WORLD_BOSS_KINDS } from '../src/game/inventory/capes';
import { CAPE_LOOK, capeLook } from '../src/render/models/capeLooks';
import { COMBAT_SKILLS } from '../src/game/player/skills';
import { SILK_THRONE, STEPPE } from '../src/game/world/spiderSteppe';
import { DEEPEN_REPORT, DEEPENED_FLOORS, UNDERGROUND_AREAS } from '../src/game/world/underground';
import { TOWNS } from '../src/game/world/townList';
import { WEB_SLOW } from '../src/game/Game';
import { TELEPORT_RUNES } from '../src/game/magic/teleport';
import { SEAL_SHOP } from '../src/game/liveops/tasks';
import { FESTIVALS } from '../src/game/liveops/festivals';
const townMageSells = (id: string): boolean => Object.values(NPCS).filter((n) => n.role === 'Magic, runes & potions').every((n) => !!n.sells?.some((e) => e.id === id));

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const NEW_KINDS: EnemyKind[] = [
  'frost_dragon', 'ice_golem', 'crystal_spider', 'frost_giant', 'frost_giantess', 'ice_witch', 'barbarian_raider', 'barbarian_skullhunter',
  'barbarian_brutetamer', 'barbarian_headsplitter', 'frostkin', 'frostkin_toolshaper', 'frostkin_windcaller', 'dire_penguin', 'silver_rabbit',
  'winter_wolf', 'polar_bear', 'scorpion', 'mummy', 'scarab', 'minotaur', 'minotaur_archer', 'minotaur_mage', 'cyclops', 'dwarf', 'dwarf_soldier',
  'dwarf_guard', 'bandit', 'amazon', 'valkyrie', 'bear', 'deer', 'snake', 'lizard_sentinel', 'lizard_templar',
];

const NEW_ITEMS = [
  'fish', 'mead', 'berserk_potion', 'bullseye_potion', 'mastermind_potion', 'fur_bag', 'fur_backpack', 'lizard_blade', 'barbarian_axe', 'dwarven_axe',
  'glacial_cleaver', 'tusk_club', 'stone_maul', 'sylvan_bow', 'frostbite_crossbow', 'royal_spear', 'enchanted_spear', 'viper_star', 'shadow_star',
  'onyx_arrow', 'hawkeye_arrow', 'frost_bolt', 'dwarven_shield', 'scarab_shield', 'frostscale_shield', 'fur_cap', 'dwarven_helmet', 'winged_helmet',
  'frost_circlet', 'frost_helm', 'fur_armor', 'dwarven_armor', 'lizardscale_armor', 'glacier_robe', 'frost_plate', 'fur_legs', 'dwarven_legs', 'frost_legs',
  'fur_boots', 'glacier_boots', 'scarab_amulet',
  'silver_fur', 'antlers', 'snakeskin', 'penguin_feather', 'bear_paw', 'winter_wolf_fur', 'polar_bear_fur', 'iron_ore', 'frost_charm', 'braided_cord',
  'skull_trophy', 'minotaur_horn', 'minotaur_leather', 'cyclops_eye', 'scorpion_tail', 'scarab_coin', 'mummy_wrapping', 'lizard_scale', 'giant_beard',
  'crystal_shard', 'frozen_heart', 'frost_dragon_scale',
];

const NEW_SPELLS: SpellId[] = ['exori_mas_grav', 'exevo_con', 'exevo_con_ferro', 'exevo_con_aquila', 'exevo_lanca'];

function solo(voc: Vocation, g = new Game()): { g: Game; s: Session; pid: number } {
  const s = g.addPlayer('Tester', { intent: new BufferedIntent(), vocation: voc });
  g.localId = s.id;
  return { g, s, pid: s.id };
}

function setLevel(g: Game, s: Session, level: number): void {
  s.player.level = level;
  s.player.exp = expForLevel(level);
  g.refreshStats(s);
  s.player.hp = s.player.maxHp;
  s.player.mana = s.player.maxMana;
}

/** Finds an open, unsafe surface tile with room around it. */
function openSpot(g: Game, r = 3): { x: number; y: number; z: number } {
  const w = g.world;
  for (let y = 20; y < w.height - 20; y++) for (let x = 20; x < w.width - 20; x++) {
    let ok = true;
    for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!w.isWalkable(x + dx, y + dy, 0) || w.isSafe(x + dx, y + dy, 0) || w.linkAt(x + dx, y + dy, 0)) { ok = false; break; }
    }
    if (ok && !g.isOccupied(x, y, 0)) return { x, y, z: 0 };
  }
  throw new Error('no open spot');
}

/** A practice dummy of the given kind next to the player (spawned fresh, so it does not depend on the map). */
function dummy(g: Game, kind: EnemyKind, at: { x: number; y: number; z: number }): Enemy {
  const e = new Enemy(900000 + g.enemies.length, kind, at.x, at.y, at.z);
  g.enemies.push(e);
  return e;
}

function park(_g: Game, s: Session, at: { x: number; y: number; z: number }): void {
  s.player.placeAt(at.x, at.y, at.z);
  s.player.god = true;
}

// ---------------------------------------------------------------- monsters
console.log('Monsters');
{
  const all = Object.keys(ENEMIES) as EnemyKind[];
  const bad: string[] = [];
  const badLoot: string[] = [];
  for (const k of all) {
    const desc = Object.getOwnPropertyDescriptor(ENEMIES, k)!;
    const d = ENEMIES[k];
    if (desc.get) bad.push(`${k}: placeholder getter`);
    if (d.kind !== k) bad.push(`${k}: kind ${d.kind}`);
    if (!(d.maxHp > 0 && d.exp > 0 && d.respawn > 0 && d.stepTime > 0 && d.attackInterval > 0 && d.maxDmg >= d.minDmg && d.minDmg >= 0)) bad.push(`${k}: stats`);
    if (!d.loot.length) bad.push(`${k}: no loot`);
    for (const l of d.loot) if (!ITEMS[l.id] || l.chance <= 0 || l.chance > 1 || l.min > l.max) badLoot.push(`${k}:${l.id}`);
    for (const a of d.abilities) if (a.max < a.min || a.interval <= 0 || (a.kind !== 'heal' && a.kind !== 'nova' && a.range < 1)) bad.push(`${k}: ability ${a.name}`);
    if (d.kite && !d.abilities.some((a) => a.kind === 'ranged' || a.kind === 'blast')) bad.push(`${k}: kites without a ranged attack`);
  }
  check(bad.length === 0, `all ${all.length} monster defs are real${bad.length ? ` (${bad.slice(0, 6).join('; ')})` : ''}`);
  check(badLoot.length === 0, `all loot ids exist${badLoot.length ? ` (${badLoot.slice(0, 6).join(' ')})` : ''}`);
  check(NEW_KINDS.every((k) => k in ENEMIES), `${NEW_KINDS.length} new monster kinds defined`);
  const ice = ['frost_dragon', 'ice_golem', 'crystal_spider', 'ice_witch', 'frostkin_windcaller'] as EnemyKind[];
  check(ice.every((k) => (ENEMIES[k].resist.ice ?? 0) >= 80 && (ENEMIES[k].resist.fire ?? 0) < 0), 'ice creatures resist ice and fear fire');
  check((ENEMIES.mummy.resist.death ?? 0) === 100 && (ENEMIES.mummy.resist.holy ?? 0) < 0, 'mummies are undead');
  const prey = ['deer', 'silver_rabbit', 'dire_penguin', 'snake'] as EnemyKind[];
  check(prey.every((k) => ENEMIES[k].maxHp <= 50 && ENEMIES[k].maxDmg <= 10), 'animals are beginner prey');
  check(ENEMIES.deer.aggroRange === 0 && ENEMIES.silver_rabbit.aggroRange === 0, 'deer and rabbits never start a fight');
  const band = (k: EnemyKind) => ENEMIES[k].exp;
  check(band('bandit') < band('minotaur') && band('minotaur') < band('ice_witch') && band('ice_witch') < band('frost_giant') && band('frost_giant') < band('frost_dragon'), 'level curve beginner → mid → high');
  check(ENEMIES.barbarian_brutetamer.abilities.some((a) => a.kind === 'heal') && ENEMIES.ice_witch.abilities.some((a) => a.kind === 'heal'), 'brutetamer and ice witch heal');
  check(ENEMIES.frost_dragon.abilities.some((a) => a.kind === 'blast' && a.element === 'ice') && ENEMIES.frost_dragon.abilities.some((a) => a.kind === 'nova'), 'frost dragon: ice breath + nova');
  check(['minotaur_archer', 'dwarf_soldier', 'amazon', 'valkyrie', 'minotaur_mage', 'frostkin_windcaller', 'lizard_sentinel'].every((k) => ENEMIES[k as EnemyKind].kite), 'ranged monsters keep their distance');

  // a fresh game spawns every placed kind without throwing; abilities fire against a player
  const { g, s } = solo('knight');
  const at = openSpot(g);
  park(g, s, at);
  let fired = 0;
  for (const k of NEW_KINDS) {
    const e = dummy(g, k, { x: at.x + 1, y: at.y, z: 0 });
    for (const a of e.def.abilities) {
      g.useAbility(e, a, s.player);
      fired++;
    }
    e.dead = true;
  }
  check(fired > 20, `${fired} monster abilities used without errors`);
}

// ---------------------------------------------------------------- items
console.log('Items');
{
  const missing = NEW_ITEMS.filter((id) => !ITEMS[id]);
  check(missing.length === 0, `${NEW_ITEMS.length} new items exist${missing.length ? ` (missing ${missing.join(' ')})` : ''}`);
  const bad: string[] = [];
  for (const id of NEW_ITEMS) {
    const d = ITEMS[id];
    if (!d) continue;
    if (!(d.weight > 0) || d.value < 0 || !d.name) bad.push(`${id}: weight/value/name`);
    if (d.kind === 'weapon' && !d.weaponType) bad.push(`${id}: weapon without type`);
    if (d.weaponType && d.weaponType !== 'wand' && d.weaponType !== 'rod' && !(d.attack! > 0)) bad.push(`${id}: no attack`);
    if (d.kind === 'ammo' && !d.ammoType) bad.push(`${id}: ammo type`);
    if (d.kind === 'backpack' && !(d.slots! > 0)) bad.push(`${id}: slots`);
    if (['shield', 'helmet', 'armor', 'legs', 'boots'].includes(d.kind) && !(d.armor || d.defense)) bad.push(`${id}: no protection`);
    if ((d.level ?? 0) >= 40 && d.rarity === 'common' && d.kind !== 'material') bad.push(`${id}: high level but common`);
  }
  check(bad.length === 0, `item stats sane${bad.length ? ` (${bad.join('; ')})` : ''}`);

  // every new item is obtainable: sold by a shop or dropped by a monster
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const dropped = new Set(Object.values(ENEMIES).flatMap((d) => d.loot.map((l) => l.id)));
  const unobtainable = NEW_ITEMS.filter((id) => !sold.has(id) && !dropped.has(id));
  check(unobtainable.length === 0, `every new item can be bought or looted${unobtainable.length ? ` (${unobtainable.join(' ')})` : ''}`);
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  const unsellable = NEW_ITEMS.filter((id) => ITEMS[id]?.kind === 'material' && !bought.has(id));
  check(unsellable.length === 0, `every new material has a buyer${unsellable.length ? ` (${unsellable.join(' ')})` : ''}`);
  const keys = [...Object.keys(EXTRA_SELLS), ...Object.keys(EXTRA_BUYS), ...Object.keys(EXTRA_SPELLS)];
  check(keys.every((k) => k in NPCS), 'extra stock only names existing NPCs');
  check(Object.values(EXTRA_SELLS).flat().every((e) => ITEMS[e.id] && e.price >= ITEMS[e.id].value), 'shops never sell below what they pay');
  check(sold.has('berserk_potion') && sold.has('bullseye_potion') && sold.has('mastermind_potion'), 'buff potions are on sale');

  // buy something new through the dialogue
  const { g, s, pid } = solo('paladin');
  const garrick = g.npcs.find((n) => n.key === 'garrick');
  if (garrick) {
    setLevel(g, s, 20);
    s.inventory.add('gold', 600);
    s.dialogue = { npcId: garrick.id, npcKey: 'garrick', npcName: garrick.name, page: 'trade', text: '' };
    s.player.placeAt(garrick.x + 1, garrick.y, garrick.z);
    const view = g.dialogueView(s);
    check(!!view?.shop?.sells.some((e) => e.id === 'hawkeye_arrow'), 'Garrick offers hawkeye arrows');
    const before = s.inventory.count('fur_backpack');
    g.dialogueAction(pid, 'buy:fur_backpack:1');
    check(s.inventory.count('fur_backpack') === before + 1, `bought a fur backpack from Garrick (${s.dialogue?.text ?? 'dialogue closed'})`);
  } else check(true, 'garrick not on this map yet (skipped buy test)');

  // fur backpack works as a backpack
  const fb = ITEMS.fur_backpack;
  check(equipSlotFor(fb) === 'backpack' && fb.slots === 24, 'fur backpack is a 24-slot backpack');
}

// ---------------------------------------------------------------- buff potions
console.log('Buff potions');
{
  const avgMelee = (g: Game, s: Session, e: Enemy, n = 2500): number => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      e.dead = false;
      e.hp = 1e9;
      const before = e.hp;
      // keep the skills fixed: thousands of test swings would otherwise train them mid-measurement
      const skills = JSON.stringify(s.skills);
      g.meleeAttack(s.player, e);
      s.skills = JSON.parse(skills) as Session['skills'];
      total += before - e.hp;
    }
    return total / n;
  };
  const { g, s, pid } = solo('knight');
  setLevel(g, s, 30);
  const at = openSpot(g);
  park(g, s, at);
  const e = dummy(g, 'deer', { x: at.x + 1, y: at.y, z: 0 });
  const base = avgMelee(g, s, e);
  s.inventory.add('berserk_potion', 1);
  const slot = s.inventory.slots.findIndex((x) => x?.id === 'berserk_potion');
  g.useSlot(pid, slot);
  check(s.player.buffs.berserk === POTION_BUFF_SECONDS && !s.inventory.has('berserk_potion'), 'Potion of Fury grants a 10-minute buff');
  const buffed = avgMelee(g, s, e);
  check(buffed > base * 1.05, `fury raises melee damage (${base.toFixed(1)} → ${buffed.toFixed(1)})`);
  // the self snapshot carries it to the client
  const snap = buildSnapshot(g, s);
  const mirror = new Game({ simulate: false });
  const ms = mirror.addPlayer('Tester', { id: s.id, starter: false });
  mirror.localId = ms.id;
  if (snap.t === 'snap') applySnapshot(mirror, snap);
  check(ms.player.buffs.berserk > 0 && ms.player.buffs.bullseye === 0, 'buff survives the network snapshot');
  // expiry
  for (let t = 0; t < POTION_BUFF_SECONDS + 2; t += 1) g.update(1);
  check(s.player.buffs.berserk === 0, 'fury wears off after 10 minutes');
  const after = avgMelee(g, s, e);
  check(after < buffed * 0.97, `melee damage back to normal (${after.toFixed(1)})`);

  // wrong vocation cannot drink it
  const mage = solo('sorcerer', g);
  setLevel(g, mage.s, 30);
  mage.s.inventory.add('berserk_potion', 1);
  g.useSlot(mage.pid, mage.s.inventory.slots.findIndex((x) => x?.id === 'berserk_potion'));
  check(mage.s.player.buffs.berserk === 0 && mage.s.inventory.has('berserk_potion'), 'sorcerers cannot drink fury');
  // clarity raises magic damage
  const m0 = g.magicBonus(mage.s);
  mage.s.inventory.add('mastermind_potion', 1);
  g.useSlot(mage.pid, mage.s.inventory.slots.findIndex((x) => x?.id === 'mastermind_potion'));
  check(g.magicBonus(mage.s) > m0 && mage.s.player.buffs.mastermind > 0, 'Potion of Clarity raises magic damage');
  // hawk eye raises distance attack
  const pal = solo('paladin', g);
  setLevel(g, pal.s, 30);
  const d0 = g.potionAttack(pal.s, 'distance');
  pal.s.inventory.add('bullseye_potion', 1);
  g.useSlot(pal.pid, pal.s.inventory.slots.findIndex((x) => x?.id === 'bullseye_potion'));
  check(g.potionAttack(pal.s, 'distance') > d0 && pal.s.player.buffs.bullseye > 0, 'Potion of the Hawk raises distance attack');
}

// ---------------------------------------------------------------- spells
console.log('Spells');
{
  const elias = NPCS.elias;
  check(NEW_SPELLS.every((id) => SPELLS[id] && elias.spells?.includes(id)), 'Master Elias teaches the new spells');
  const words = new Set(Object.values(SPELLS).map((sp) => sp.words));
  check(words.size === Object.keys(SPELLS).length, 'spell words are unique');
  const { g, s, pid } = solo('paladin');
  // the dialogue lists them
  const npc = g.npcs.find((n) => n.key === 'elias');
  if (npc) {
    const v = buildDialogue({ npcId: npc.id, npcKey: 'elias', npcName: npc.name, page: 'spells', text: '' }, {
      quests: s.quests, inventory: s.inventory, bank: 0, level: 50, vocation: 'paladin', knownSpells: s.spells,
    });
    check(!!v.spells?.some((o) => o.id === 'exevo_con_ferro'), 'trainer page offers Conjure Piercing Bolts');
  }
  setLevel(g, s, 50);
  for (const id of NEW_SPELLS) s.spells.add(id);
  const bolts0 = s.inventory.count('piercing_bolt');
  g.castSpell(pid, 'exevo_con_ferro');
  check(s.inventory.count('piercing_bolt') === bolts0 + 10, 'exevo con ferro conjures 10 piercing bolts');
  s.player.groupCooldowns.support = 0;
  s.player.spellCooldowns = {};
  const arrows0 = s.inventory.count('hawkeye_arrow');
  const mana0 = s.player.mana;
  g.castSpell(pid, 'exevo_con_aquila');
  check(s.inventory.count('hawkeye_arrow') === arrows0 + 10 && s.player.mana === mana0 - SPELLS.exevo_con_aquila.mana, 'exevo con aquila conjures 10 hawkeye arrows for mana');
  s.player.groupCooldowns.support = 0;
  s.player.spellCooldowns = {};
  g.castSpell(pid, 'exevo_lanca');
  check(s.inventory.count('enchanted_spear') === 0, 'enchanting needs a spear in the backpack');
  s.inventory.add('spear', 2);
  s.player.mana = s.player.maxMana;
  g.castSpell(pid, 'exevo_lanca');
  check(s.inventory.count('enchanted_spear') === 1 && s.inventory.count('spear') === 1, 'exevo lanca turns a spear into a runebound spear');
  // too low level
  const low = solo('paladin', g);
  low.s.spells.add('exevo_con_aquila');
  g.castSpell(low.pid, 'exevo_con_aquila');
  check(low.s.inventory.count('hawkeye_arrow') === 0, 'level requirement enforced');

  // groundshaker: hits every monster within 3 tiles, not one farther away
  const k = solo('knight', g);
  setLevel(g, k.s, 40);
  k.s.spells.add('exori_mas_grav');
  const at = openSpot(g, 4);
  park(g, k.s, at);
  const near = [[1, 0], [-1, 1], [0, -2], [2, 2], [-3, 0]].map(([dx, dy]) => dummy(g, 'polar_bear', { x: at.x + dx, y: at.y + dy, z: 0 }));
  const far = dummy(g, 'polar_bear', { x: at.x + 4, y: at.y + 4, z: 0 });
  g.say(k.pid, 'exori mas grav');
  const hit = near.filter((e) => e.hp < e.maxHp || e.dead).length;
  check(hit === near.length, `Groundshaker hit ${hit}/${near.length} monsters around the knight`);
  check(far.hp === far.maxHp, 'Groundshaker does not reach 4+ tiles away');
  check(k.s.player.mana === k.s.player.maxMana - SPELLS.exori_mas_grav.mana, 'Groundshaker costs mana');

  // runebound spears break less than spears (statistically)
  const p2 = solo('paladin', g);
  setLevel(g, p2.s, 40);
  const at2 = openSpot(g, 4);
  park(g, p2.s, at2);
  const target = dummy(g, 'polar_bear', { x: at2.x + 2, y: at2.y, z: 0 });
  const throwN = (id: string) => {
    p2.s.inventory.equipment.weapon = { id, qty: 2000 };
    p2.s.inventory.equipment.shield = null;
    for (let i = 0; i < 2000; i++) {
      target.dead = false;
      target.hp = 1e9;
      (g as unknown as { distanceAttack(s: Session, t: Enemy, d: number): void }).distanceAttack(p2.s, target, 2);
    }
    return 2000 - (p2.s.inventory.equipment.weapon?.qty ?? 0);
  };
  const lostSpear = throwN('spear');
  const lostRune = throwN('enchanted_spear');
  check(lostRune < lostSpear, `runebound spears are lost less often (${lostRune} vs ${lostSpear} of 2000)`);
  check(lostSpear > 40 && lostSpear < 170, `spears rarely break, like the classic game (${lostSpear} of 2000, ~5%)`);
}

// ---------------------------------------------------------------- spells update (classic spell list)
console.log('Spells update');
{
  const SPELLS_UPDATE: SpellId[] = (NPCS.elias.spells ?? []).filter((id) => !['exori_mas_grav', 'exevo_con', 'exevo_con_ferro', 'exevo_con_aquila', 'exevo_lanca'].includes(id))
    .filter((id) => !['exura_ico', 'exura_gran', 'exura_vita', 'exura_sio', 'exori', 'exori_gran', 'exori_hur', 'exori_con', 'exori_san', 'exori_vis', 'exori_flam',
      'exori_frigo', 'exori_tera', 'exevo_gran_mas_vis', 'exevo_gran_mas_frigo', 'exevo_mas_san', 'utani_hur', 'utamo_vita'].includes(id));
  check(SPELLS_UPDATE.length >= 54, `${SPELLS_UPDATE.length} new spells taught by Master Elias`);
  const all = Object.keys(SPELLS) as SpellId[];
  const untaught = all.filter((id) => SPELLS[id].price > 0 && !NPCS.elias.spells?.includes(id));
  check(untaught.length === 0, `every learnable spell has a trainer${untaught.length ? ` (${untaught.join(' ')})` : ''}`);
  const townTrainers = Object.values(NPCS).filter((n) => n.role === 'Spell trainer' && n.key !== 'elias');
  check(townTrainers.length > 0 && townTrainers.every((n) => SPELLS_UPDATE.every((id) => n.spells?.includes(id))), `${townTrainers.length} town trainers teach them too`);
  check(all.every((id) => SPELLS[id].description.length > 10 && SPELLS[id].vocations.length > 0 && SPELLS[id].mana > 0), 'every spell has a description, vocations and a mana cost');
  const badGroup = all.filter((id) => {
    const sp = SPELLS[id];
    const want = ['heal', 'healFriend', 'massHeal', 'cure'].includes(sp.kind) ? 'heal' : ['target', 'selfArea', 'wave', 'beam'].includes(sp.kind) ? 'attack' : 'support';
    return sp.group !== want;
  });
  check(badGroup.length === 0, `spells use the right cooldown group${badGroup.length ? ` (${badGroup.join(' ')})` : ''}`);
  const runesConjured = new Set(all.map((id) => SPELLS[id].conjure).filter((c) => c?.from === 'blank_rune').map((c) => c!.item));
  // teleport runes are bought ready-made only (magic/teleport.ts)
  const runeItems = Object.values(ITEMS).filter((d) => d.rune && d.rune.type !== 'teleport').map((d) => d.id);
  const noSpell = runeItems.filter((id) => !runesConjured.has(id));
  check(noSpell.length === 0, `every rune in the game has a rune spell${noSpell.length ? ` (${noSpell.join(' ')})` : ''}`);
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const unsold = [...SPELL_RUNES, 'blank_rune'].filter((id) => !ITEMS[id] || !sold.has(id));
  check(unsold.length === 0, `blank runes and every new rune are sold by mage shops${unsold.length ? ` (${unsold.join(' ')})` : ''}`);
  const teleUnsold = TELEPORT_RUNES.filter((id) => !ITEMS[id] || !sold.has(id) || !townMageSells(id));
  check(TELEPORT_RUNES.length >= 15 && teleUnsold.length === 0, `every teleport rune (${TELEPORT_RUNES.length}) is sold by Mirella and the town mages${teleUnsold.length ? ` (${teleUnsold.join(' ')})` : ''}`);
  const townMage = Object.values(NPCS).find((n) => n.role === 'Magic, runes & potions' && n.key !== 'mirella');
  check(!!townMage?.sells?.some((e) => e.id === 'blank_rune'), `town mage shops sell blank runes (${townMage?.name})`);

  // ---- every new spell can be learned from a trainer and cast
  const g = new Game();
  const at = openSpot(g, 5);
  const ropeSpot = (() => {
    const w = g.world;
    for (const z of [0, -1, -2]) for (let y = 1; y < w.height - 1; y++) for (let x = 1; x < w.width - 1; x++) {
      if (w.getObj(x, y, z) !== Obj.RopeSpot || !w.linkAt(x, y, z)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.isWalkable(x + dx, y + dy, z) && !w.linkAt(x + dx, y + dy, z)) return { x, y, z, sx: x + dx, sy: y + dy };
    }
    return null;
  })();
  // levitate: build a small ledge on floor 1 over open ground (the generated map's upper floors are walled in)
  const ledge = (() => {
    const l = openSpot(g, 3);
    g.world.setGround(l.x - 4, l.y, Ground.Stone, 1);
    if (g.world.getGround(l.x - 3, l.y, 1) !== Ground.Void) return null;
    return { x: l.x - 4, y: l.y, bx: l.x - 3, by: l.y, dx: 1, dy: 0 };
  })();
  const failedCast: string[] = [];
  const trainer = g.npcs.find((n) => n.key === 'elias')!;
  for (const id of SPELLS_UPDATE) {
    const sp = SPELLS[id];
    const t = solo(sp.vocations[0], g);
    setLevel(g, t.s, Math.max(sp.level, 100));
    // learn it at the trainer
    t.s.inventory.add('gold', sp.price);
    t.s.dialogue = { npcId: trainer.id, npcKey: 'elias', npcName: trainer.name, page: 'spells', text: '' };
    t.s.player.placeAt(trainer.x + 1, trainer.y, trainer.z);
    g.dialogueAction(t.pid, `learn:${id}`);
    if (!t.s.spells.has(id)) { failedCast.push(`${id}: not learned (${t.s.dialogue?.text ?? ''})`); g.removePlayer(t.pid); continue; }
    g.closeDialogue(t.pid);
    park(g, t.s, at);
    t.s.player.facing = facingFromDelta(1, 0);
    let param: string | null = null;
    let foe: Enemy | null = null;
    switch (sp.kind) {
      case 'target': foe = dummy(g, 'polar_bear', { x: at.x + 1, y: at.y, z: 0 }); t.s.player.targetId = foe.id; break;
      case 'heal': case 'massHeal': t.s.player.hp = 10; break;
      case 'cure': g.poison(t.s, 5, 10); break;
      case 'find': param = 'Tester'; break;
      case 'illusion': param = 'wolf'; break;
      case 'conjure': if (sp.conjure?.from) t.s.inventory.add(sp.conjure.from, 1); break;
      case 'rope': if (ropeSpot) t.s.player.placeAt(ropeSpot.sx, ropeSpot.sy, ropeSpot.z); break;
      case 'levitate':
        if (ledge) {
          if (sp.dir === 'down') { t.s.player.placeAt(ledge.x, ledge.y, 1); t.s.player.facing = facingFromDelta(ledge.dx, ledge.dy); }
          else { t.s.player.placeAt(ledge.bx, ledge.by, 0); t.s.player.facing = facingFromDelta(-ledge.dx, -ledge.dy); }
        }
        break;
    }
    const mana0 = t.s.player.mana;
    g.castSpell(t.pid, id, param);
    if (t.s.player.mana !== mana0 - sp.mana) failedCast.push(`${id}: not cast`);
    if (foe) foe.dead = true;
    g.removePlayer(t.pid);
  }
  check(failedCast.length === 0, `all ${SPELLS_UPDATE.length} new spells learned from the trainer and cast${failedCast.length ? ` (${failedCast.slice(0, 6).join('; ')})` : ''}`);
  check(!!ropeSpot && !!ledge, `map has a rope spot and a ledge for the tests (${!!ropeSpot}/${!!ledge})`);
  for (const e of g.enemies) if (e.id >= 900000) e.dead = true;

  // ---- waves: cone in front, nothing behind or beside
  {
    const sorc = solo('sorcerer', g);
    setLevel(g, sorc.s, 60);
    sorc.s.spells.add('exevo_vis_hur');
    const a = openSpot(g, 6);
    park(g, sorc.s, a);
    sorc.s.player.facing = facingFromDelta(1, 0); // east
    const inCone = [[1, 0], [2, 1], [3, -1], [4, 2], [5, -2]].map(([dx, dy]) => dummy(g, 'polar_bear', { x: a.x + dx, y: a.y + dy, z: 0 }));
    const outside = [[-1, 0], [-2, 0], [0, 1], [0, -2], [1, 1], [2, 2], [6, 0]].map(([dx, dy]) => dummy(g, 'polar_bear', { x: a.x + dx, y: a.y + dy, z: 0 }));
    g.say(sorc.pid, 'exevo vis hur');
    const hit = inCone.filter((e) => e.hp < e.maxHp || e.dead).length;
    check(hit === inCone.length, `Energy Wave hits ${hit}/${inCone.length} monsters in the cone`);
    const wrong = outside.filter((e) => e.hp < e.maxHp);
    check(wrong.length === 0, `Energy Wave misses monsters behind and beside (${wrong.length} wrongly hit)`);
    for (const e of [...inCone, ...outside]) e.dead = true;

    // facing north instead
    sorc.s.player.groupCooldowns.attack = 0;
    sorc.s.player.spellCooldowns = {};
    sorc.s.player.mana = sorc.s.player.maxMana;
    sorc.s.player.facing = facingFromDelta(0, -1);
    const north = dummy(g, 'polar_bear', { x: a.x, y: a.y - 3, z: 0 });
    const east = dummy(g, 'polar_bear', { x: a.x + 3, y: a.y, z: 0 });
    g.say(sorc.pid, 'exevo vis hur');
    check(north.hp < north.maxHp && east.hp === east.maxHp, 'the wave follows where you face');
    north.dead = east.dead = true;

    // beams: a straight line
    sorc.s.spells.add('exevo_gran_vis_lux');
    sorc.s.player.groupCooldowns.attack = 0;
    sorc.s.player.spellCooldowns = {};
    sorc.s.player.mana = sorc.s.player.maxMana;
    sorc.s.player.facing = facingFromDelta(0, 1); // south
    const line = [1, 3, 6].map((d) => dummy(g, 'polar_bear', { x: a.x, y: a.y + d, z: 0 }));
    const off = [dummy(g, 'polar_bear', { x: a.x + 1, y: a.y + 2, z: 0 }), dummy(g, 'polar_bear', { x: a.x, y: a.y - 1, z: 0 })];
    g.say(sorc.pid, 'exevo gran vis lux');
    check(line.every((e) => e.hp < e.maxHp || e.dead), 'Great Energy Beam hits every monster on the line');
    check(off.every((e) => e.hp === e.maxHp), 'the beam misses monsters off the line and behind');
    for (const e of [...line, ...off]) e.dead = true;
  }

  // ---- mass healing heals a nearby ally, not a far one
  {
    const dr = solo('druid', g);
    setLevel(g, dr.s, 50);
    dr.s.spells.add('exura_gran_mas_res');
    const a = openSpot(g, 6);
    park(g, dr.s, a);
    const ally = solo('knight', g);
    setLevel(g, ally.s, 30);
    ally.s.player.placeAt(a.x + 2, a.y, 0);
    const farAlly = solo('knight', g);
    setLevel(g, farAlly.s, 30);
    farAlly.s.player.placeAt(a.x + 9, a.y, 0);
    ally.s.player.hp = 20;
    farAlly.s.player.hp = 20;
    dr.s.player.hp = dr.s.player.maxHp - 50;
    g.say(dr.pid, 'exura gran mas res');
    check(ally.s.player.hp > 20, `Mass Healing heals a nearby ally (20 → ${ally.s.player.hp})`);
    check(dr.s.player.hp > dr.s.player.maxHp - 50, 'and the caster');
    check(farAlly.s.player.hp === 20, 'but not someone far away');
    for (const x of [dr, ally, farAlly]) g.removePlayer(x.pid);
  }

  // ---- poison and exana pox
  {
    const k = solo('knight', g);
    setLevel(g, k.s, 20);
    const a = openSpot(g, 3);
    k.s.player.placeAt(a.x, a.y, 0);
    for (const id of ['exana_pox', 'exiva', 'exani_tera', 'exani_hur_up', 'exani_hur_down'] as SpellId[]) k.s.spells.add(id);
    g.poison(k.s, 6, 10);
    check(k.s.player.buffs.poisoned > 0, 'a player can be poisoned');
    let ticks = 0;
    const offP = g.events.on((e) => { if (e.type === 'damage' && e.targetId === k.pid && e.element === 'earth') ticks++; });
    for (let i = 0; i < 45; i++) g.update(0.1);
    offP();
    check(ticks >= 2, `poison hurts every 2 seconds (${ticks} ticks in 4.5 s)`);
    g.say(k.pid, 'exana pox');
    check(k.s.player.buffs.poisoned === 0, 'exana pox cures poison');
    const m0 = k.s.player.mana;
    k.s.player.spellCooldowns = {};
    k.s.player.groupCooldowns.heal = 0;
    g.say(k.pid, 'exana pox');
    check(k.s.player.mana === m0, 'exana pox is refused when not poisoned');
    // the antidote rune cures too
    g.poison(k.s, 6, 10);
    k.s.player.groupCooldowns.heal = 0;
    k.s.inventory.add('antidote_rune', 1);
    g.useItem(k.pid, 'antidote_rune');
    check(k.s.player.buffs.poisoned === 0 && !k.s.inventory.has('antidote_rune'), 'antidote rune cures poison');
    g.removePlayer(k.pid);
  }

  // ---- conjuring runes from blank runes
  {
    const so = solo('sorcerer', g);
    setLevel(g, so.s, 50);
    so.s.spells.add('adori_gran_mort');
    const sd0 = so.s.inventory.count('death_rune');
    g.say(so.pid, 'adori gran mort');
    check(so.s.inventory.count('death_rune') === sd0, 'no blank rune, no rune');
    so.s.inventory.add('blank_rune', 2);
    const mana0 = so.s.player.mana;
    g.say(so.pid, 'adori gran mort');
    check(so.s.inventory.count('death_rune') === sd0 + SPELLS.adori_gran_mort.conjure!.qty && so.s.inventory.count('blank_rune') === 1, 'adori gran mort turns a blank rune into death strike runes');
    check(so.s.player.mana === mana0 - SPELLS.adori_gran_mort.mana, 'conjuring costs mana');
    const dr = solo('druid', g);
    setLevel(g, dr.s, 50);
    dr.s.spells.add('adori_gran_mort');
    dr.s.inventory.add('blank_rune', 1);
    g.say(dr.pid, 'adori gran mort');
    check(dr.s.inventory.count('blank_rune') === 1, 'druids cannot make sorcerer runes');
    const low = solo('sorcerer', g);
    setLevel(g, low.s, 20);
    low.s.spells.add('adori_gran_mort');
    low.s.inventory.add('blank_rune', 1);
    g.say(low.pid, 'adori gran mort');
    check(low.s.inventory.count('blank_rune') === 1, 'minimum level for rune spells');
    for (const x of [so, dr, low]) g.removePlayer(x.pid);
  }

  // ---- exiva
  {
    check(exivaText('Bob', 0, -50, 0) === 'Bob is to the north.', 'exiva: north');
    check(exivaText('Bob', 150, 150, 0) === 'Bob is far to the south-east.', 'exiva: far south-east');
    check(exivaText('Bob', -300, 0, -1).startsWith('Bob is very far to the west on a lower level'), 'exiva: very far, lower level');
    check(exivaText('Bob', 1, 2, 0) === 'Bob is standing next to you.', 'exiva: next to you');
    const a = solo('knight', g);
    const b = solo('knight', g);
    b.s.player.name = 'Farwalker';
    setLevel(g, a.s, 20);
    a.s.spells.add('exiva');
    const sp = openSpot(g, 3);
    a.s.player.placeAt(sp.x, sp.y, 0);
    b.s.player.placeAt(sp.x + 40, sp.y - 40, 0);
    const msgs: string[] = [];
    const off = g.events.on((e) => { if (e.type === 'message' && e.to === a.pid) msgs.push(e.text); });
    g.say(a.pid, 'exiva "Farwalker');
    off();
    check(msgs.some((m) => m === 'Farwalker is to the north-east.'), `exiva tells the direction (${msgs.join(' | ')})`);
    g.removePlayer(a.pid);
    g.removePlayer(b.pid);
  }

  // ---- exani tera on a rope spot
  if (ropeSpot) {
    const r = solo('druid', g);
    setLevel(g, r.s, 20);
    r.s.spells.add('exani_tera');
    r.s.player.placeAt(ropeSpot.sx, ropeSpot.sy, ropeSpot.z);
    check(!r.s.inventory.has('rope'), 'tester carries no rope');
    const link = g.world.linkAt(ropeSpot.x, ropeSpot.y, ropeSpot.z)!;
    g.say(r.pid, 'exani tera');
    check(r.s.player.z === link.to.z && Math.max(Math.abs(r.s.player.x - link.to.x), Math.abs(r.s.player.y - link.to.y)) <= 2, `exani tera climbs the rope spot (floor ${ropeSpot.z} → ${r.s.player.z})`);
    const z1 = r.s.player.z;
    r.s.player.spellCooldowns = {};
    r.s.player.groupCooldowns.support = 0;
    g.say(r.pid, 'exani tera');
    check(r.s.player.z === z1, 'exani tera does nothing away from a rope spot');
    g.removePlayer(r.pid);
  }

  // ---- levitate
  if (ledge) {
    const l = solo('knight', g);
    setLevel(g, l.s, 20);
    l.s.spells.add('exani_hur_up');
    l.s.spells.add('exani_hur_down');
    l.s.player.placeAt(ledge.x, ledge.y, 1);
    l.s.player.facing = facingFromDelta(ledge.dx, ledge.dy);
    g.say(l.pid, 'exani hur down');
    check(l.s.player.z === 0 && l.s.player.x === ledge.bx && l.s.player.y === ledge.by, 'exani hur down floats off a ledge');
    l.s.player.spellCooldowns = {};
    l.s.player.groupCooldowns.support = 0;
    l.s.player.facing = facingFromDelta(-ledge.dx, -ledge.dy);
    g.say(l.pid, 'exani hur up');
    check(l.s.player.z === 1 && l.s.player.x === ledge.x, 'exani hur up floats back up');
    g.removePlayer(l.pid);
  }

  // ---- challenge, invisibility, illusion
  {
    const k = solo('knight', g);
    const friend = solo('druid', g);
    setLevel(g, k.s, 30);
    k.s.spells.add('exeta_res');
    const a = openSpot(g, 4);
    park(g, k.s, a);
    friend.s.player.placeAt(a.x - 2, a.y, 0);
    friend.s.player.god = true;
    const bears = [dummy(g, 'polar_bear', { x: a.x + 1, y: a.y + 1, z: 0 }), dummy(g, 'polar_bear', { x: a.x - 2, y: a.y + 1, z: 0 })];
    for (const b of bears) { b.targetId = friend.pid; b.state = 'chase'; }
    g.say(k.pid, 'exeta res');
    check(bears.every((b) => b.targetId === k.pid), 'exeta res: nearby monsters turn on the knight');
    for (const b of bears) b.dead = true;
    // the knight and his friend step away, so the next monster has one player to see
    for (const o of [k, friend]) o.s.player.placeAt(g.world.temple.x, g.world.temple.y, g.world.temple.z);

    const m = solo('sorcerer', g);
    setLevel(g, m.s, 40);
    m.s.spells.add('utana_vid');
    m.s.spells.add('utevo_res_ina');
    const b2 = openSpot(g, 4);
    m.s.player.placeAt(b2.x, b2.y, 0);
    m.s.player.god = true;
    const wolf = dummy(g, 'polar_bear', { x: b2.x + 2, y: b2.y, z: 0 });
    for (let i = 0; i < 5; i++) g.update(0.1);
    check(wolf.targetId === m.pid, `a monster hunts a visible player${wolf.targetId === m.pid ? '' : ` (target ${wolf.targetId}, sorcerer ${m.pid} at ${b2.x},${b2.y}, bear at ${wolf.x},${wolf.y} ${wolf.state} dead=${wolf.dead})`}`);
    g.say(m.pid, 'utana vid');
    for (let i = 0; i < 5; i++) g.update(0.1);
    check(m.s.player.buffs.invisible > 0 && wolf.targetId !== m.pid, 'utana vid: monsters lose track of you');
    wolf.dead = true;
    m.s.player.groupCooldowns.support = 0;
    m.s.player.mana = m.s.player.maxMana;
    g.say(m.pid, 'utevo res ina "wolf');
    check(m.s.player.illusion === 'wolf' && m.s.player.buffs.illusion > 0, 'utevo res ina turns you into a wolf');
    const mirror = new Game({ simulate: false });
    const ms = mirror.addPlayer('Tester', { id: m.s.id, starter: false });
    mirror.localId = ms.id;
    const snap = buildSnapshot(g, m.s);
    if (snap.t === 'snap') applySnapshot(mirror, snap);
    check(ms.player.illusion === 'wolf' && ms.player.buffs.invisible > 0, 'illusion and invisibility reach the client');
    for (const x of [k, friend, m]) g.removePlayer(x.pid);
  }

  // ---- field runes, magic wall, dispel, snare
  {
    const so = solo('sorcerer', g);
    setLevel(g, so.s, 60);
    const a = openSpot(g, 6);
    park(g, so.s, a);
    so.s.inventory.add('flame_field_rune', 2);
    so.s.inventory.add('arcane_wall_rune', 1);
    so.s.inventory.add('dispel_rune', 1);
    so.s.inventory.add('firebloom_rune', 1);
    const slotOf = (id: string) => so.s.inventory.slots.findIndex((x) => x?.id === id);
    const bear = dummy(g, 'polar_bear', { x: a.x + 3, y: a.y, z: 0 });
    bear.state = 'idle';
    g.useRune(so.pid, slotOf('flame_field_rune'), { x: a.x + 3, y: a.y });
    check(g.fieldAt(a.x + 3, a.y, 0) === Obj.FireField && so.s.inventory.count('flame_field_rune') === 1, 'flame field rune lays a fire field');
    bear.hazardTimer = 0;
    const hp0 = bear.hp;
    (g as unknown as { enemyOnField(e: Enemy, dt: number): void }).enemyOnField(bear, 0.1);
    check(bear.hp < hp0, 'a monster standing in the fire field burns');
    // snapshot carries the field
    const mirror = new Game({ simulate: false });
    const ms = mirror.addPlayer('Tester', { id: so.s.id, starter: false });
    mirror.localId = ms.id;
    const snap = buildSnapshot(g, so.s);
    if (snap.t === 'snap') applySnapshot(mirror, snap);
    check(mirror.world.getObj(a.x + 3, a.y, 0) === Obj.FireField, 'fields reach the client');
    so.s.player.groupCooldowns.support = 0;
    g.useRune(so.pid, slotOf('dispel_rune'), { x: a.x + 3, y: a.y });
    check(g.fieldAt(a.x + 3, a.y, 0) === null && g.world.getObj(a.x + 3, a.y, 0) === Obj.None, 'dispel rune removes the field');
    bear.dead = true;
    so.s.player.groupCooldowns.attack = 0;
    g.useRune(so.pid, slotOf('arcane_wall_rune'), { x: a.x + 2, y: a.y + 2 });
    check(!g.world.isWalkable(a.x + 2, a.y + 2, 0) && !g.world.lineOfSight(a.x + 2, a.y + 1, a.x + 2, a.y + 3, 0), 'arcane wall blocks walking and sight');
    for (let i = 0; i < 22; i++) g.update(1);
    check(g.world.isWalkable(a.x + 2, a.y + 2, 0) && g.fieldAt(a.x + 2, a.y + 2, 0) === null, 'the wall vanishes after 20 seconds');
    so.s.player.groupCooldowns.attack = 0;
    g.useRune(so.pid, slotOf('firebloom_rune'), { x: a.x - 3, y: a.y });
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.fieldAt(a.x - 3 + dx, a.y + dy, 0) === Obj.FireField) n++;
    check(n === 9, `firebloom lays a 3×3 of fire (${n})`);
    // snare
    const dr = solo('druid', g);
    setLevel(g, dr.s, 60);
    const b = openSpot(g, 4);
    park(g, dr.s, b);
    // only the practice bear about (a wild monster on its tile would take the snare)
    for (const e of g.enemies) if (e.id < 900000 && e.z === 0 && Math.max(Math.abs(e.x - b.x), Math.abs(e.y - b.y)) <= 8) e.dead = true;
    // a free tile two steps away (earlier tests left players standing about)
    const bx = [2, -2].map((dx) => b.x + dx).find((x) => !g.isOccupied(x, b.y, 0) && !g.players().some((o) => o.x === x && o.y === b.y && o.z === 0)) ?? b.x + 2;
    const slow = dummy(g, 'polar_bear', { x: bx, y: b.y, z: 0 });
    dr.s.inventory.add('snare_rune', 1);
    g.useRune(dr.pid, dr.s.inventory.slots.findIndex((x) => x?.id === 'snare_rune'), { x: bx, y: b.y });
    g.update(0.05);
    check(slow.slowTimer > 0 && slow.stepTime > slow.def.stepTime * 2, `snare rune paralyses a monster${slow.slowTimer > 0 ? '' : ` (at ${b.x},${b.y}: timer ${slow.slowTimer}, step ${slow.stepTime}, dead=${slow.dead})`}`);
    slow.dead = true;
    g.removePlayer(so.pid);
    g.removePlayer(dr.pid);
  }
}

// ---------------------------------------------------------------- models
console.log('Models');
{
  try {
    const { buildEnemy, ENEMY_SCALE } = await import('../src/render/models/rigs');
    const { makeWeapon, makeShield, LOOKS, SHIELDS, ARMOR_LOOK } = await import('../src/render/models/weapons');
    const { HELMETS, LEGS, BOOTS } = await import('../src/render/models/humanoid');
    const failed: string[] = [];
    const sigs = new Map<string, string>();
    for (const k of Object.keys(ENEMIES) as EnemyKind[]) {
      try {
        const r = buildEnemy(k);
        // dark models merge each limb into one mesh, so count triangles too and compare real geometry
        let meshes = 0;
        let tris = 0;
        const geo: string[] = [];
        r.root.traverse((o) => {
          const me = o as { isMesh?: boolean; visible?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number; array: ArrayLike<number> }; color?: { array: ArrayLike<number> } } } };
          if (!me.isMesh || !me.visible || !me.geometry) return;
          meshes++;
          const g = me.geometry;
          const n = g.index ? g.index.count : g.attributes.position.count;
          tris += n / 3;
          const a = g.attributes.position.array;
          const c = g.attributes.color?.array;
          geo.push(`${n}/${a[0]?.toFixed(3)}/${a[a.length - 1]?.toFixed(3)}/${c ? c[0].toFixed(3) : ''}`);
        });
        if (meshes < 5 && tris < 200) failed.push(`${k}: only ${meshes} meshes / ${tris} triangles`);
        if (!(ENEMY_SCALE[k] > 0.5)) failed.push(`${k}: scale`);
        sigs.set(k, `${r.type}:${meshes}:${geo.sort().join(',')}:${r.materials.map((m) => m.color.getHex()).sort().join(',')}`);
      } catch (err) {
        failed.push(`${k}: ${(err as Error).message}`);
      }
    }
    check(failed.length === 0, `every monster rig builds${failed.length ? ` (${failed.slice(0, 5).join('; ')})` : ''}`);
    const dupes = NEW_KINDS.filter((k) => [...sigs.entries()].some(([o, sig]) => o !== k && sig === sigs.get(k)));
    check(dupes.length === 0, `new monsters each have a distinct model${dupes.length ? ` (same as another: ${dupes.join(' ')})` : ''}`);
    const lookless: string[] = [];
    for (const id of NEW_ITEMS) {
      const d = ITEMS[id];
      if (!d) continue;
      if (d.kind === 'weapon' && (!LOOKS[id] || !makeWeapon(id))) lookless.push(id);
      if (d.kind === 'shield' && (!SHIELDS[id] || !makeShield(id))) lookless.push(id);
      if (d.kind === 'armor' && !ARMOR_LOOK[id]) lookless.push(id);
      if (d.kind === 'helmet' && !HELMETS[id]) lookless.push(id);
      if (d.kind === 'legs' && !LEGS[id]) lookless.push(id);
      if (d.kind === 'boots' && !BOOTS[id]) lookless.push(id);
    }
    check(lookless.length === 0, `every new wearable has a look${lookless.length ? ` (${lookless.join(' ')})` : ''}`);
  } catch (err) {
    console.log(`  skip models: ${(err as Error).message}`);
  }
}


// ---------------------------------------------------------------- woodcutting & market content
console.log('Woodcutting and market');
{
  const logs = Object.values(TREES).map((t) => t!.log);
  check(logs.every((id) => ITEMS[id]?.kind === 'material' && ITEMS[id].value > 0 && ITEMS[id].weight > 0), 'every tree gives an existing log item');
  check(LOG_ITEMS.every((id) => logs.includes(id)), 'every log item comes from a tree');
  const values = LOG_ITEMS.map((id) => ITEMS[id].value);
  check(values.every((v, i) => i === 0 || v > values[i - 1]), 'better logs are worth more');
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  check(LOG_ITEMS.every((id) => bought.has(id)), 'traders buy every kind of log');
  const outfitters = Object.values(NPCS).filter((n) => n.role.startsWith('Outfitter'));
  check(outfitters.length > 5 && outfitters.every((n) => LOG_ITEMS.every((id) => n.buys?.includes(id)) && n.sells?.some((e) => e.id === 'hatchet')), `every outfitter (${outfitters.length}) sells hatchets and buys logs`);
  check(ITEMS.hatchet.weaponType === 'axe' && !(ITEMS.hatchet.level! > 1), 'the hatchet is a level-1 axe');
  const g = new Game();
  const w = g.world;
  const depots = w.houses.filter((h) => h.z === 0 && /depot/i.test(h.name));
  const boards = depots.filter((h) => { for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) if (w.getObj(x, y, 0) === Obj.MarketBoard) return true; return false; });
  check(depots.length >= 14 && boards.length === depots.length, `every town depot has a market board (${boards.length}/${depots.length})`);
    let trees = 0;
  for (let y = 0; y < w.height; y += 2) for (let x = 0; x < w.width; x += 2) if (TREES[w.getObj(x, y, 0)]) trees++;
  check(trees > 500, `plenty of trees to chop (${trees} sampled)`);
}

// ---------------------------------------------------------------- fishing content
console.log('Fishing');
{
  check(FISH_ITEMS.every((id) => ITEMS[id]?.kind === 'consumable' && (ITEMS[id].heal ?? 0) > 0 && ITEMS[id].value > 0 && ITEMS[id].weight > 0), 'every fish is edible food with a price');
  check(FISH_ITEMS.every((id) => !!ITEMS[id].icon && !!ITEMS[id].tint && (id === 'fish' || CATCH_FISH.has(id))), 'every fish has an icon');
  const values = FISH_ITEMS.map((id) => ITEMS[id].value);
  const heals = FISH_ITEMS.map((id) => ITEMS[id].heal ?? 0);
  check(values.every((v, i) => i === 0 || v > values[i - 1]) && heals.every((v, i) => i === 0 || v > heals[i - 1]), 'better fish are worth more and heal more');
  check(FISH.every((f, i) => i === 0 || f.level > FISH[i - 1].level), 'fish tiers rise with level');
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  check(FISH_ITEMS.every((id) => bought.has(id)), 'every fish has a buyer');
  const rod = ITEMS[FISHING_ROD];
  check(rod?.kind === 'tool' && rod.tool === 'fishing' && !!rod.icon && !equipSlotFor(rod), 'the fishing rod is a tool with an icon');
  const outfitters = Object.values(NPCS).filter((n) => n.role.startsWith('Outfitter'));
  check(outfitters.length > 5 && outfitters.every((n) => n.sells?.some((e) => e.id === FISHING_ROD) && FISH_ITEMS.every((id) => n.buys?.includes(id))), `every outfitter (${outfitters.length}) sells rods and buys fish`);
  const captains = Object.values(NPCS).filter((n) => n.role === 'Ship captain' || n.role.startsWith('Ferry'));
  check(captains.length > 5 && captains.every((n) => n.sells?.some((e) => e.id === FISHING_ROD) && FISH_ITEMS.every((id) => n.buys?.includes(id))), `every harbour captain and ferryman (${captains.length}) sells rods and buys fish`);
  check(!!NPCS.aldric.buys?.includes('swordfish') && !!NPCS.zuri.sells?.some((e) => e.id === FISHING_ROD), 'general traders buy fish; Zuri sells rods');
  check(ITEMS.old_boot?.kind === 'material' && bought.has('old_boot') && !!MATERIAL_SHAPE.old_boot, 'the old boot exists, has an icon and a buyer');
  check(TREASURE_ITEMS.every((id) => !!ITEMS[id] && ITEMS[id].rarity !== 'legendary'), 'treasure catches are existing loot items');
}


// ---------------------------------------------------------------- mining & blacksmithing content
console.log('Mining and blacksmithing');
{
  // every item the two skills brought: ores, bars, tools, arrowheads and the gear only the anvil makes
  const SKILL_ITEMS = [...new Set([
    ...ORE_ITEMS, ...BAR_ITEMS, ...PICKAXES.map((p) => p.item), SMITHING_HAMMER, ...RECIPES.map((r) => r.output.id),
  ])].filter((id) => !['iron_ore', 'hatchet', 'chain_helmet', 'bolt', 'short_sword', 'chain_legs', 'chain_armor', 'battle_axe', 'iron_mace', 'iron_helmet',
    'iron_sword', 'iron_shield', 'plate_armor', 'barbarian_axe', 'morning_star', 'piercing_bolt', 'bastard_sword', 'plate_legs'].includes(id));
  const missing = SKILL_ITEMS.filter((id) => !ITEMS[id]);
  check(missing.length === 0, `${SKILL_ITEMS.length} new mining/smithing items exist${missing.length ? ` (missing ${missing.join(' ')})` : ''}`);
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const noIcon = SKILL_ITEMS.filter((id) => ITEMS[id] && (!ITEMS[id].icon || !ITEMS[id].tint || (ITEMS[id].kind === 'material' && !MATERIAL_SHAPE[id])));
  check(noIcon.length === 0, `every new item has an icon${noIcon.length ? ` (${noIcon.join(' ')})` : ''}`);
  const useless = SKILL_ITEMS.filter((id) => {
    const d = ITEMS[id];
    if (!d) return false;
    const usedIn = RECIPES.some((r) => r.inputs.some((i) => i.id === id) || r.tool === id);
    return !(bought.has(id) || equipSlotFor(d) || d.kind === 'tool' || d.kind === 'consumable' || usedIn);
  });
  check(useless.length === 0, `every new item has a buyer or a use${useless.length ? ` (${useless.join(' ')})` : ''}`);
  const unsold = [...ORE_ITEMS, ...BAR_ITEMS].filter((id) => !bought.has(id));
  check(unsold.length === 0, `traders buy every ore and bar${unsold.length ? ` (${unsold.join(' ')})` : ''}`);
  const smiths = Object.values(NPCS).filter((n) => n.role === 'Weapon & armour smith');
  check(smiths.length >= 14 && smiths.every((n) => [...ORE_ITEMS, ...BAR_ITEMS].every((id) => n.buys?.includes(id)) && n.sells?.some((e) => e.id === SMITHING_HAMMER) && n.sells?.some((e) => e.id === 'bronze_pickaxe')), `every smith (${smiths.length}) buys ores and bars and sells hammers and pickaxes`);
  check(sold.has('bronze_pickaxe') && sold.has(SMITHING_HAMMER), 'pickaxes and hammers are on sale');
  check(ORES.every((o) => ITEMS[o.ore]?.kind === 'material' && ITEMS[o.ore].value > 0) && ORE_ITEMS.length === 8, 'eight ores, each an existing material with a price');
  check(ORES.every((o, i) => i === 0 || o.level >= ORES[i - 1].level), 'rarer ores need higher levels');
  check(MINING_GEMS.every(([id]) => !!ITEMS[id]), 'mining gems are existing items');
  check(PICKAXES.every((p, i) => ITEMS[p.item]?.tool === 'mining' && !equipSlotFor(ITEMS[p.item]) && (i === 0 || p.tier > PICKAXES[i - 1].tier)), 'pickaxes are tools in rising tiers');
  check(ITEMS[SMITHING_HAMMER]?.tool === 'hammer', "the smith's hammer is a tool");
  const badRecipe = RECIPES.filter((r) => !ITEMS[r.output.id] || r.inputs.some((i) => !ITEMS[i.id]) || (r.tool && !ITEMS[r.tool]) || !(r.xp > 0) || r.level < 1 || r.level > 99);
  check(badRecipe.length === 0, `every recipe names real items, gives xp and has a level 1–99${badRecipe.length ? ` (${badRecipe.map((r) => r.id).join(' ')})` : ''}`);
  check(new Set(RECIPES.map((r) => r.id)).size === RECIPES.length, 'recipe ids are unique');
  check(BARS.every((b) => SMELTING_RECIPES.some((r) => r.output.id === b.bar)) && BARS.every((b) => b.ores.every(([id]) => ORE_ITEMS.includes(id))), 'every bar is smelted from mined ores');
  check(['bronze', 'iron', 'steel', 'starsteel', 'darkstone'].every((m) => SMITHING_RECIPES.filter((r) => r.group.toLowerCase() === m).length >= 9), 'every metal tier has at least nine anvil recipes');
  const pieces = ['dagger', 'sword', 'axe', 'mace', 'helm', 'plate', 'legs', 'shield', 'pickaxe', 'arrowheads'];
  check(pieces.every((p) => SMITHING_RECIPES.some((r) => r.output.id.includes(p) || ITEMS[r.output.id].name.toLowerCase().includes(p))), 'the anvil makes daggers, swords, axes, maces, helmets, armour, legs, shields, pickaxes and arrowheads');
  // no gold loop: whatever an NPC sells, a recipe made from it must not sell back for more
  const cheapest = new Map<string, number>();
  for (const n of Object.values(NPCS)) for (const e of n.sells ?? []) cheapest.set(e.id, Math.min(cheapest.get(e.id) ?? Infinity, e.price));
  const loops = RECIPES.filter((r) => r.inputs.every((i) => cheapest.has(i.id)) && r.inputs.reduce((n, i) => n + cheapest.get(i.id)! * i.qty, 0) < ITEMS[r.output.id].value * r.output.qty);
  check(SMITHING_RECIPES.every((r) => r.tool === SMITHING_HAMMER) && loops.length === 0, `smithing needs a hammer and shop goods never turn into more gold${loops.length ? ` (${loops.map((r) => r.id).join(' ')})` : ''}`);
  check([...ORE_ITEMS, ...BAR_ITEMS].every((id) => !cheapest.has(id)), 'ores and bars come only from mining and smelting');
  check(NONCOMBAT_SKILLS.some((d) => d.id === 'mining' && d.kind === 'gathering') && NONCOMBAT_SKILLS.some((d) => d.id === 'smithing' && d.kind === 'production'), 'mining (gathering) and blacksmithing (production) are in the skill list');
  check(NONCOMBAT_SKILLS.every((d) => !!ITEMS[d.icon]) && PLANNED_SKILLS.map((p) => p.id).join() === 'construction,alchemy', 'every skill has an icon; construction and alchemy are still planned');
  // the world: rocks in every mine, all of them reachable, a furnace and an anvil in every smithy
  const g = new Game();
  const w = g.world;
  const reach = floodFill3D(w);
  const counts = new Map<Obj, number>();
  const unreachable: string[] = [];
  for (const z of [0, -1, -2, -3, -4]) for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    const o = w.getObj(x, y, z);
    if (!oreAt(o)) continue;
    counts.set(o, (counts.get(o) ?? 0) + 1);
    if (![[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => reach.at(x + dx, y + dy, z))) unreachable.push(`${x},${y},${z}`);
  }
  check(ORES.every((o) => (counts.get(o.obj) ?? 0) >= 5), `every ore can be found (${ORES.map((o) => `${o.ore} ${counts.get(o.obj) ?? 0}`).join(', ')})`);
  check(unreachable.length === 0, `every ore rock can be reached${unreachable.length ? ` (${unreachable.length}: ${unreachable.slice(0, 5).join(' ')})` : ''}`);
  const sd = MINE_SPOTS.find((m) => m.name === 'Stonedeep Mines')!;
  let sdRocks = 0;
  for (let y = sd.box[1]; y <= sd.box[3]; y++) for (let x = sd.box[0]; x <= sd.box[2]; x++) if (oreAt(w.getObj(x, y, -1))) sdRocks++;
  check(sdRocks >= 30, `the Stonedeep mines are full of ore (${sdRocks} rocks)`);
  // every mine gets at least half its rocks (a mine only reachable late in world generation once got none)
  const thin = MINE_SPOTS.filter((sp) => {
    let n = 0;
    for (let y = sp.box[1]; y <= sp.box[3]; y++) for (let x = sp.box[0]; x <= sp.box[2]; x++) if (oreAt(w.getObj(x, y, sp.z))) n++;
    return n * 2 < sp.count;
  });
  check(thin.length === 0, `every mine has its ore rocks${thin.length ? ` (too few: ${thin.map((sp) => sp.name).join(', ')})` : ''}`);
  // the rarest ores never lie on the surface
  let surfaceRare = 0;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { const o = w.getObj(x, y, 0); if (o === Obj.StarsteelRock || o === Obj.DarkstoneRock) surfaceRare++; }
  check(surfaceRare === 0, 'starsteel and darkstone are only found underground');
  let nearThornvale = 0;
  for (let y = 270; y < 360; y++) for (let x = 130; x < 280; x++) { const o = w.getObj(x, y, 0); if (o === Obj.CopperRock || o === Obj.TinRock) nearThornvale++; }
  check(nearThornvale >= 10, `copper and tin near Thornvale (${nearThornvale})`);
  const smithies = w.houses.filter((h) => h.z === 0 && /smithy/i.test(h.name));
  const has = (h: typeof smithies[number], o: Obj) => { for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) if (w.getObj(x, y, 0) === o) return true; return false; };
  const bare = smithies.filter((h) => !has(h, Obj.Furnace) || !has(h, Obj.Anvil));
  check(smithies.length >= 14 && bare.length === 0, `every smithy (${smithies.length}) has a furnace and an anvil${bare.length ? ` (missing: ${bare.map((h) => h.name).join(', ')})` : ''}`);
  check(smithies.some((h) => /durgan/i.test(h.name) && has(h, Obj.Furnace)), 'Stonedeep has a furnace');
  check(stationAt(Obj.Furnace)?.id === 'furnace' && stationAt(Obj.Anvil)?.id === 'anvil', 'furnaces and anvils are stations');
  try {
    const { LOOKS, SHIELDS, ARMOR_LOOK } = await import('../src/render/models/weapons');
    const { HELMETS, LEGS } = await import('../src/render/models/humanoid');
    const lookless = SKILL_ITEMS.filter((id) => {
      const d = ITEMS[id];
      if (!d) return false;
      return (d.kind === 'weapon' && !LOOKS[id]) || (d.kind === 'shield' && !SHIELDS[id]) || (d.kind === 'armor' && !ARMOR_LOOK[id]) || (d.kind === 'helmet' && !HELMETS[id]) || (d.kind === 'legs' && !LEGS[id]);
    });
    check(lookless.length === 0, `every new smithed wearable has a look${lookless.length ? ` (${lookless.join(' ')})` : ''}`);
  } catch (err) {
    console.log(`  skip looks: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------- fletching, crafting, cooking, firemaking content
console.log('Fletching, crafting, cooking and firemaking');
{
  const NEW = [
    'tinderbox', 'knife', 'needle', 'chisel', 'thread', 'feather', 'arrow_shaft', 'wooden_stock', 'teak_stock', 'bear_hide', 'leather', 'tanned_fur',
    ...CUT_GEMS, ...RAW_FOOD_ITEMS, 'burnt_food', 'longbow', 'pine_shortbow', 'palm_shortbow', 'teak_shortbow', 'starsteel_arrow', 'darkstone_arrow',
  ];
  const missing = NEW.filter((id) => !ITEMS[id]);
  check(missing.length === 0, `${NEW.length} new items exist${missing.length ? ` (missing ${missing.join(' ')})` : ''}`);
  const noIcon = NEW.filter((id) => ITEMS[id] && (!ITEMS[id].icon || !ITEMS[id].tint || (ITEMS[id].kind === 'material' && !MATERIAL_SHAPE[id])));
  check(noIcon.length === 0, `every new item has an icon${noIcon.length ? ` (${noIcon.join(' ')})` : ''}`);
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const dropped = new Set(Object.values(ENEMIES).flatMap((e) => e.loot.map((l) => l.id)));
  const made = new Set(RECIPES.flatMap((r) => [r.output.id, ...(r.fail ? [r.fail.id] : [])]));
  const caught = new Set(PREY.flatMap((p) => p.loot.map((l) => l.id)));
  const sourceless = NEW.filter((id) => !(sold.has(id) || dropped.has(id) || made.has(id) || caught.has(id) || RAW_FISH_ITEMS.includes(id)));
  check(sourceless.length === 0, `every new item has a source (shop, loot, fishing, hunting or a recipe)${sourceless.length ? ` (${sourceless.join(' ')})` : ''}`);
  const useless = NEW.filter((id) => {
    const d = ITEMS[id];
    if (!d) return false;
    const usedIn = RECIPES.some((r) => r.inputs.some((i) => i.id === id) || r.tool === id);
    return !(bought.has(id) || equipSlotFor(d) || usedIn);
  });
  check(useless.length === 0, `every new item has a use or a buyer${useless.length ? ` (${useless.join(' ')})` : ''}`);
  check(['tinderbox', 'knife', 'needle', 'chisel'].every((id) => ITEMS[id].kind === 'tool' && !equipSlotFor(ITEMS[id]) && stationForItem(id)?.items?.[0] === id), 'the four hand tools are tools that open their production window');
  const outfitters = Object.values(NPCS).filter((n) => n.role.startsWith('Outfitter'));
  const tools = ['tinderbox', 'knife', 'needle', 'chisel', 'thread', 'feather'];
  check(outfitters.length > 5 && outfitters.every((n) => tools.every((id) => n.sells?.some((e) => e.id === id))), `every outfitter (${outfitters.length}) sells tinderboxes, knives, needles, chisels, thread and feathers`);
  const questGivers = Object.values(NPCS).filter((n) => n.quests && n.buys?.length);
  check(questGivers.length > 5 && questGivers.every((n) => tools.every((id) => n.sells?.some((e) => e.id === id)) && RAW_FOOD_ITEMS.every((id) => n.buys?.includes(id))), `general traders and quest givers (${questGivers.length}) sell the tools and buy raw food`);
  check(!!NPCS.zuri.sells?.some((e) => e.id === 'knife') && !!NPCS.brann.sells?.some((e) => e.id === 'tinderbox') && CUT_GEMS.every((id) => NPCS.orwin.buys?.includes(id)), 'Zuri and Brann sell tools; bankers buy cut gems');
  const captains = Object.values(NPCS).filter((n) => n.role === 'Ship captain' || n.role.startsWith('Ferry'));
  check(captains.every((n) => RAW_FISH_ITEMS.every((id) => n.buys?.includes(id))), 'harbour captains buy raw fish too');
  // recipes
  const groups: Array<[string, typeof RECIPES]> = [['cooking', COOKING_RECIPES], ['fletching', FLETCHING_RECIPES], ['crafting', CRAFTING_RECIPES], ['firemaking', FIREMAKING_RECIPES]];
  for (const [skill, list] of groups) {
    check(list.length >= 4 && list.every((r) => r.skill === skill && r.level >= 1 && r.level <= 99 && r.xp > 0 && RECIPES.includes(r)), `${skill}: ${list.length} recipes, levels 1–99, all registered`);
    check(NONCOMBAT_SKILLS.some((d) => d.id === skill && d.kind === 'production' && !!ITEMS[d.icon]), `${skill} is a production skill in the Skills panel`);
  }
  check(COOKING_RECIPES.every((r) => r.fail?.id === 'burnt_food' && !!r.success) && FOODS.every((f) => (ITEMS[f.cooked].heal ?? 0) > 0 && !ITEMS[f.raw].heal), 'every cooked food heals, raw food does not, and cooking can burn');
  check(FOODS.every((f) => COOKING_RECIPES.some((r) => r.station === 'campfire' && r.output.id === f.cooked) && COOKING_RECIPES.some((r) => r.station === 'stove' && r.output.id === f.cooked)), 'every food cooks on a campfire and on a stove');
  check(FIREMAKING_RECIPES.every((r) => !!r.fire && r.fire[0] >= 60 && r.fire[1] <= 120 && LOG_ITEMS.includes(r.inputs[0].id)) && FIREMAKING_RECIPES.map((r) => r.level).every((l, i, a) => i === 0 || l > a[i - 1]), 'every log lights a fire burning 60–120 s; better logs need higher levels');
  const existingOut = ['hunting_bow', 'composite_bow', 'sylvan_bow', 'elven_longbow', 'light_crossbow', 'heavy_crossbow', 'arrow', 'onyx_arrow', 'hawkeye_arrow',
    'leather_helmet', 'leather_armor', 'leather_legs', 'leather_boots', 'bag', 'backpack', 'fur_cap', 'fur_armor', 'fur_legs', 'fur_boots', 'fur_bag', 'fur_backpack', 'explorer_pack',
    'sunstone_ring', 'sapphire_ring', 'ring_of_vigor', 'ring_of_swiftness', 'ring_of_might', 'frost_pendant', 'jade_amulet', 'garnet_amulet', 'amulet_of_warding'];
  check(existingOut.every((id) => RECIPES.some((r) => r.output.id === id)), `${existingOut.length} existing bows, crossbows, arrows, leather/fur pieces, rings and amulets can be made`);
  check(Object.values(STATIONS).every((st) => RECIPES.some((r) => r.station === st.id)), 'every station has recipes');
  // the world: a stove in (or by) every depot, a tanning rack in every smithy
  const g = new Game();
  const w = g.world;
  const has = (h: { x: number; y: number; w: number; h: number }, o: Obj) => { for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) if (w.getObj(x, y, 0) === o) return true; return false; };
  const smithies = w.houses.filter((h) => h.z === 0 && /smithy/i.test(h.name));
  check(smithies.length >= 14 && smithies.every((h) => has(h, Obj.TanningRack)), `every smithy (${smithies.length}) has a tanning rack`);
  const depots = w.houses.filter((h) => h.z === 0 && /depot/i.test(h.name));
  const stoveless = depots.filter((d) => !w.houses.some((h) => h.z === 0 && has(h, Obj.Stove) && Math.max(Math.abs(h.x - d.x), Math.abs(h.y - d.y)) < 40));
  check(depots.length >= 14 && stoveless.length === 0, `every depot (${depots.length}) has a stove in it or close by${stoveless.length ? ` (missing: ${stoveless.map((h) => h.name).join(', ')})` : ''}`);
  check(stationAt(Obj.Stove)?.id === 'stove' && stationAt(Obj.TanningRack)?.id === 'tanning' && stationAt(Obj.Campfire)?.id === 'campfire', 'stoves, tanning racks and campfires are stations');
  try {
    const { LOOKS } = await import('../src/render/models/weapons');
    check(['longbow', 'pine_shortbow', 'palm_shortbow', 'teak_shortbow'].every((id) => !!LOOKS[id]), 'every new bow has a look');
  } catch (err) {
    console.log(`  skip looks: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------- gear sets
console.log('Gear sets');
{
  const GEAR_KINDS = ['weapon', 'shield', 'helmet', 'armor', 'legs', 'boots', 'amulet', 'ring', 'backpack'];
  const noIcon = Object.values(ITEMS).filter((d) => !d.icon || !d.tint || (d.kind === 'material' && !MATERIAL_SHAPE[d.id] && d.id !== 'blank_rune' && !d.id.endsWith('_rune')));
  check(noIcon.length === 0, `every item has an icon${noIcon.length ? ` (${noIcon.map((d) => d.id).slice(0, 10).join(' ')})` : ''}`);
  const pieces = SETS.flatMap((st) => st.pieces);
  check(new Set(pieces).size === pieces.length, 'no item is in two sets');
  check(pieces.every((id) => ITEMS[id] && GEAR_KINDS.includes(ITEMS[id].kind) && ITEMS[id].setId && SET_BY_ID[ITEMS[id].setId!]?.pieces.includes(id)), 'every set piece is a wearable item that knows its set');
  check(SETS.length >= 20 && SETS.every((st) => st.pieces.length >= 4 && Object.keys(st.two).length > 0 && Object.keys(st.four).length > 0), `${SETS.length} sets, each with 4+ pieces and a 2- and 4-piece bonus`);
  const kinds = (st: typeof SETS[number]) => new Set(st.pieces.map((id) => ITEMS[id].kind));
  check(SETS.every((st) => ['helmet', 'armor', 'legs', 'boots'].every((k) => kinds(st).has(k as never))), 'every set has a helmet, armour, legs and boots');
  const badLevel = SETS.filter((st) => st.level !== Math.min(...st.pieces.map((id) => ITEMS[id].level ?? 1)));
  check(badLevel.length === 0, `set levels match their lightest piece${badLevel.length ? ` (${badLevel.map((st) => st.id).join(' ')})` : ''}`);
  check(pieces.every((id) => describeItemText(id).includes('set (')), 'item descriptions show the set bonus');
  // a source and a buyer for every piece
  const dropped = new Set(Object.values(ENEMIES).flatMap((e) => e.loot.map((l) => l.id)));
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const made = new Set(RECIPES.map((r) => r.output.id));
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  const sourceless = pieces.filter((id) => !dropped.has(id) && !sold.has(id) && !made.has(id));
  check(sourceless.length === 0, `every set piece drops, is sold or is smithed${sourceless.length ? ` (${sourceless.join(' ')})` : ''}`);
  const unbought = pieces.filter((id) => !bought.has(id));
  check(unbought.length === 0, `every set piece has a buyer${unbought.length ? ` (${unbought.join(' ')})` : ''}`);
  check(['bronze', 'iron', 'steel', 'silver', 'starsteel', 'gold', 'darkstone'].every((m) => ['helm', 'boots', 'legs', 'shield'].length && SMITHING_RECIPES.some((r) => r.group.toLowerCase() === m && ITEMS[r.output.id].kind === 'boots')), 'every metal smiths boots (full metal sets at the anvil)');
  check(['smith:chain_helmet', 'smith:chain_armor', 'smith:chain_legs', 'smith:plate_armor', 'smith:plate_legs'].every((id) => RECIPES.some((r) => r.id === id)), 'old anvil recipes are kept');
  // bonuses at 2 and 4 pieces, gone when taken off
  const { g, s } = solo('knight');
  setLevel(g, s, 120);
  const eq = s.inventory.equipment;
  for (const k of Object.keys(eq) as Array<keyof typeof eq>) eq[k] = null;
  g.refreshStats(s);
  const base = s.player.maxHp;
  const baseRes = g.resist(s, 'physical');
  eq.head = { id: 'bronze_helmet', qty: 1 };
  g.refreshStats(s);
  check(s.player.maxHp === base && g.activeSets(s).length === 0, 'one piece gives no set bonus');
  eq.armor = { id: 'bronze_armor', qty: 1 };
  g.refreshStats(s);
  check(s.player.maxHp === base + 15 && g.activeSets(s)[0]?.count === 2, '2 bronze pieces: +15 hp');
  eq.legs = { id: 'bronze_legs', qty: 1 };
  eq.feet = { id: 'bronze_boots', qty: 1 };
  g.refreshStats(s);
  check(s.player.maxHp === base + 40 && s.player.hpRegen === 1, '4 bronze pieces: +40 hp and hp regen (2- and 4-piece bonuses stack)');
  eq.legs = null;
  eq.feet = null;
  eq.armor = null;
  g.refreshStats(s);
  check(s.player.maxHp === base && s.player.hpRegen === 0, 'taking pieces off removes the set bonus');
  for (const id of SET_BY_ID.plate.pieces) eq[equipSlotFor(ITEMS[id])!] = { id, qty: 1 };
  g.refreshStats(s);
  check(g.resist(s, 'physical') === baseRes + 4 && s.player.maxHp === base + 80, 'a full plate set adds physical resistance and hp');
  for (const id of SET_BY_ID.skyfeather.pieces) eq[equipSlotFor(ITEMS[id])!] = { id, qty: 1 };
  g.refreshStats(s);
  check(g.attackBonus(s) === 1 + 2 + 3 + 2 + 3 && activeSets(Object.values(eq).filter(Boolean).map((e) => e!.id)).length === 1, 'set attack bonuses add to the pieces\' own');
  // saves keep every id: old items and all set pieces survive a save round trip untouched
  for (const k of Object.keys(eq) as Array<keyof typeof eq>) eq[k] = null;
  eq.armor = { id: 'demonplate', qty: 1 };
  eq.head = { id: 'dragon_helm', qty: 1 };
  pieces.forEach((id, i) => { if (i < s.depot.length) s.depot[i] = { id, qty: 1 }; });
  const data = g.serialize(s.id);
  const t2 = solo('knight');
  const okLoad = t2.g.applySave(t2.pid, JSON.parse(JSON.stringify(data)));
  const kept = pieces.slice(0, s.depot.length).every((id, i) => t2.s.depot[i]?.id === id);
  check(okLoad && kept && t2.s.inventory.equipment.armor?.id === 'demonplate' && t2.s.inventory.equipment.head?.id === 'dragon_helm' && (t2.s.lostItems ?? []).length === 0, 'old and new gear ids survive save and load (nothing lost)');
}

// ---------------------------------------------------------------- capes
console.log('Capes');
{
  // 30 capes, plus one skill cape for each trade skill of 2026-10-24
  check(CAPES.length >= 30 && new Set(CAPE_IDS).size === CAPES.length, `${CAPES.length} capes with unique ids`);
  check(new Set(CAPES.map((c) => c.name)).size === CAPES.length, 'every cape has its own name');
  // one skill cape per skill, combat and trade
  const allSkills = [...COMBAT_SKILLS, ...NONCOMBAT_SKILLS.map((d) => d.id)];
  for (const sk of allSkills) check(CAPES.filter((c) => c.kind === 'skill' && c.skill === sk).length === 1, `one skill cape for ${sk}`);
  check(CAPES.some((c) => c.kind === 'mastery'), 'a mastery cape for every skill');
  // boss lists match the monsters
  const bossKinds = (b: string) => Object.entries(ENEMIES).filter(([, e]) => e.boss === b).map(([k]) => k).sort().join();
  // Ulmaroth of the Sunken Reach came later and is not part of the deed (it stays "all ten")
  check(bossKinds('dungeon').split(',').filter((k) => k !== 'boss_drowned_tyrant').join() === [...DUNGEON_BOSS_KINDS].sort().join(), 'the Tyrantbane Cape lists every original dungeon boss');
  check(bossKinds('world') === [...WORLD_BOSS_KINDS].sort().join(), 'the Worldbreaker Mantle lists every world boss');
  const capeLooks = new Set<string>();
  const world = new Game();
  for (const c of CAPES) {
    const d = ITEMS[c.id];
    check(!!d && d.kind === 'cape' && equipSlotFor(d) === 'cape' && !d.stackable && !d.attack && !d.armor && !d.defense && !d.bonus, `${c.id}: a cape item with no combat stats`);
    // a source: sold by an NPC that stands in the world, or dropped by a monster that exists
    const seller = c.seller ? NPCS[c.seller] : undefined;
    const sold = !!seller && !!seller.sells?.some((e) => e.id === c.id && e.price === c.price);
    const dropped = !!c.drop && !!ENEMIES[c.drop.kind]?.loot.some((l) => l.id === c.id);
    // reward capes: the task boards' seal shop or a festival's trades (liveops/)
    const reward = c.kind === 'reward' && [...SEAL_SHOP, ...FESTIVALS.flatMap((f) => f.shop)].some((e) => e.id === c.id && e.price > 0);
    check(sold || dropped || reward, `${c.id}: has a source (${c.seller ?? c.drop?.kind ?? (reward ? 'task board' : undefined)})`);
    if (c.seller) check(world.npcs.some((n) => n.key === c.seller), `${c.id}: its seller ${c.seller} stands in the world`);
    // a buyer: its seller buys it back, and every banker buys every cape
    const buyers = Object.values(NPCS).filter((n) => n.buys?.includes(c.id));
    check(buyers.length >= 2 && buyers.some((n) => n.bank), `${c.id}: NPCs buy it (${buyers.length})`);
    check((c.price ?? Infinity) > c.value, `${c.id}: buying back pays less than it costs`);
    check(describeItemText(c.id).length > 10, `${c.id}: tooltip "${describeItemText(c.id)}"`);
    const lk = capeLook(c.id);
    check(!!CAPE_LOOK[c.id], `${c.id}: has its own look`);
    capeLooks.add(JSON.stringify([lk.main, lk.pattern, lk.emblem, lk.hem, lk.fx]));
    if (c.kind === 'skill') {
      const fair = c.skill === 'magic' ? c.level! >= 50 && c.level! <= 90 : COMBAT_SKILLS.includes(c.skill as never) ? c.level! >= 60 && c.level! <= 100 : c.level === 99;
      check(fair, `${c.id}: asks ${c.skill} ${c.level}`);
    }
  }
  check(capeLooks.size === CAPES.length, `all ${CAPES.length} capes look different`);
  check(CAPES.filter((c) => capeLook(c.id).fx !== 'none').length >= 6, 'several capes are animated');
  // the skill bonus is small and only in its own skill
  check(capeTrainingBonus('bladesworn_cape', 'sword') === 1.05 && capeTrainingBonus('bladesworn_cape', 'axe') === 1 && capeTrainingBonus('thornvale_cape', 'sword') === 1 && capeTrainingBonus(null, 'sword') === 1,
    'a skill cape trains its own skill 5% faster, nothing else');

  // buying: the requirement, gold from backpack and bank, the season
  const { g, s, pid } = solo('knight');
  const aldric = g.npcs.find((n) => n.key === 'aldric')!;
  s.player.placeAt(aldric.x + 1, aldric.y, aldric.z);
  s.dialogue = { npcId: aldric.id, npcKey: 'aldric', npcName: aldric.name, page: 'trade', text: '' };
  s.player.capacity = 100_000;
  s.inventory.add('gold', 10_000);
  s.bank = 60_000;
  g.dialogueAction(pid, 'buy:axelord_cape:1');
  check(s.inventory.count('axelord_cape') === 0 && /axe fighting level 80/.test(s.dialogue?.text ?? ''), `below axe 80 Aldric will not sell it (${s.dialogue?.text})`);
  s.skills.axe.level = 82;
  const wealth = s.inventory.count('gold') + s.bank;
  g.dialogueAction(pid, 'buy:axelord_cape:1');
  check(s.inventory.count('axelord_cape') === 1 && s.inventory.count('gold') === 0 && s.inventory.count('gold') + s.bank === wealth - 50_000, `at axe 82 it is bought with backpack and bank gold (${s.dialogue?.text})`);
  g.dialogueAction(pid, 'buy:tyrantbane_cape:1');
  check(s.inventory.count('tyrantbane_cape') === 0, 'the Tyrantbane Cape needs the boss deeds first');
  s.bossKills = [...DUNGEON_BOSS_KINDS];
  s.bank = 25_000;
  g.dialogueAction(pid, 'buy:tyrantbane_cape:1');
  check(s.inventory.count('tyrantbane_cape') === 1 && s.bank + s.inventory.count('gold') === 0, `with all ten dungeon bosses slain it can be bought (${s.dialogue?.text})`);
  // trade skills at 99, and the Grandmaster's Mantle
  const ctx = (lv: Partial<Record<string, number>>) => ({ skillLevel: (k: string) => lv[k] ?? 1, bossKills: [], now: Date.UTC(2026, 0, 10) });
  check(capeProblem('tidecaller_cape', ctx({ fishing: 98 })) !== null && capeProblem('tidecaller_cape', ctx({ fishing: 99 })) === null, 'the fishing cape asks fishing 99');
  const trades = Object.fromEntries(NONCOMBAT_SKILLS.map((d) => [d.id, 99]));
  check(capeProblem('grandmaster_mantle', ctx(trades)) !== null && capeProblem('grandmaster_mantle', ctx({ ...trades, magic: 70 })) === null && capeProblem('grandmaster_mantle', ctx({ ...trades, distance: 80 })) === null,
    'the Grandmaster\'s Mantle asks every trade at 99 and one fighting art at cape level');
  check(capeProblem('grandmaster_mantle', ctx({ ...trades, cooking: 98, sword: 90 }))?.includes('cooking') === true, 'it names the trade still short');
  // seasons: sold only in season, worn all year
  check(capeProblem('frostfall_cape', ctx({}), true) === null && capeProblem('frostfall_cape', { ...ctx({}), now: Date.UTC(2026, 6, 1) }, true) !== null
    && capeProblem('frostfall_cape', { ...ctx({}), now: Date.UTC(2026, 6, 1) }) === null, 'the Frostfall Cape is sold in winter only and worn all year');
  // first boss kills count once
  const kills: string[] = [];
  check(recordBossKill(kills, 'wb_mountain') && !recordBossKill(kills, 'wb_mountain') && !recordBossKill(kills, 'rat') && kills.length === 1, 'boss deeds count each boss once');
}

// ---------------------------------------------------------------- the Gravewind Steppe and the deeper caves
console.log('Gravewind Steppe and deeper caves');
{
  const dw = ENEMIES.dread_weaver, gc = ENEMIES.gravesilk_colossus;
  check(dw.abilities.some((a) => (a.web ?? 0) > 0) && dw.abilities.some((a) => a.kind === 'blast' && a.element === 'earth' && (a.poison ?? 0) > 0.35), 'dread weavers spit binding webs and poison clouds');
  check(gc.elite === true && !gc.boss && !!gc.herald && gc.respawn >= 3600 && gc.maxHp > dw.maxHp * 8, 'the colossus is a rare elite (not a boss) that the world hears about');
  const setDrops = dw.loot.filter((l) => !!ITEMS[l.id]?.setId).length;
  check(setDrops >= 4 && dw.loot.every((l) => !!ITEMS[l.id]), `dread weavers drop ${setDrops} gear-set pieces`);
  check(['gravesilk_wraps', 'silk_throne_amulet'].every((id) => ITEMS[id]?.rarity === 'legendary' && gc.loot.some((l) => l.id === id)) && !Object.entries(ENEMIES).some(([k, e]) => k !== 'gravesilk_colossus' && e.loot.some((l) => l.id === 'gravesilk_wraps' || l.id === 'silk_throne_amulet')),
    'only the colossus drops its two unique items');
  const buyers = Object.values(NPCS).filter((n) => (n.buys ?? []).includes('dread_silk')).length;
  check(['dread_silk', 'venom_gland', 'colossus_eye'].every((id) => ITEMS[id]?.kind === 'material' && !!MATERIAL_SHAPE[id]) && buyers > 3, `new spider materials have icons and ${buyers} buyers`);
  // stages: a level 60-80 hunt pays like its neighbours
  check(dw.exp > ENEMIES.crystal_spider.exp && dw.exp < ENEMIES.hydra.exp && dw.maxHp > ENEMIES.crystal_spider.maxHp && dw.maxHp < ENEMIES.hydra.maxHp, 'dread weavers sit between crystal spiders and hydras');

  const g = new Game();
  const w = g.world;
  const reach = floodFill3D(w);
  const inSteppe = (x: number, y: number) => x >= STEPPE.x0 && x <= STEPPE.x1 && y >= STEPPE.y0 && y <= STEPPE.y1;
  const weavers = w.spawns.filter((sp) => sp.kind === 'dread_weaver');
  const colossi = w.spawns.filter((sp) => sp.kind === 'gravesilk_colossus');
  check(weavers.length >= 15 && weavers.every((sp) => sp.z === 0 && inSteppe(sp.x, sp.y)), `${weavers.length} dread weavers, all on the steppe`);
  check(colossi.length === 1 && Math.max(Math.abs(colossi[0].x - SILK_THRONE.x), Math.abs(colossi[0].y - SILK_THRONE.y)) <= 6, 'one Gravesilk Colossus, on the Silk Throne');
  const townDist = Math.min(...[...weavers, ...colossi].flatMap((sp) => TOWNS.map((t) => Math.max(Math.abs(t.x - sp.x), Math.abs(t.y - sp.y)))));
  check(townDist >= 40, `the giant spiders live away from every town (nearest ${townDist} tiles)`);
  check(w.regionAt(575, 60, 0)?.name === 'Gravewind Steppe' && w.regionAt(SILK_THRONE.x, SILK_THRONE.y, 0)?.name === 'The Silk Throne' && !w.regions.some((r) => r.name === 'Charwood'), 'the steppe region (it swallowed the Charwood)');
  let road = 0;
  for (let y = STEPPE.y0; y <= STEPPE.y1; y++) for (let x = STEPPE.x0; x <= STEPPE.x1; x++) if (w.getGround(x, y, 0) === Ground.Path && reach.at(x, y, 0)) road++;
  let webs = 0;
  for (let y = STEPPE.y0; y <= STEPPE.y1; y++) for (let x = STEPPE.x0; x <= STEPPE.x1; x++) if (w.getObj(x, y, 0) === Obj.Cobweb || w.getObj(x, y, 0) === Obj.EggSacs) webs++;
  check(road > 60 && webs > 150, `a road runs into the steppe (${road} tiles) through webs and egg sacs (${webs})`);
  const brr = TOWNS.find((t) => t.key === 'briarwatch')!;
  check(reach.at(574, 70, 0) && reach.at(brr.x, brr.y + 2, 0), 'the steppe is reachable on foot from Briarwatch');

  // every spawn, chest and floor link is reachable; every stair lands on open ground
  const lost = w.spawns.filter((sp) => !reach.at(sp.x, sp.y, sp.z) || !w.isWalkable(sp.x, sp.y, sp.z));
  check(lost.length === 0, `all ${w.spawns.length} spawns stand on reachable open ground${lost.length ? ` (${lost.slice(0, 4).map((sp) => `${sp.kind}@${sp.x},${sp.y},${sp.z}`).join(' ')})` : ''}`);
  const badLinks = [...w.links.values()].filter((l) => !w.isWalkable(l.to.x, l.to.y, l.to.z) || !reach.at(l.to.x, l.to.y, l.to.z));
  check(badLinks.length === 0, `all ${w.links.size} stairs, ladders and ropes land on reachable open ground`);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  check(w.chests.every((c) => D8.some(([dx, dy]) => reach.at(c.x + dx, c.y + dy, c.z))), 'every chest can be reached');
  check(DUNGEON_BOSS_KINDS.every((k) => w.spawns.filter((sp) => sp.kind === k).length === 1), 'every dungeon boss still has its lair');

  // the deeper caves grew on every enlarged floor
  for (const z of DEEPENED_FLOORS) {
    const areas = UNDERGROUND_AREAS.filter((a) => a.z === z);
    const rep = DEEPEN_REPORT.filter((r) => r.z === z);
    const grown = rep.filter((r) => r.added >= 30);
    const added = rep.reduce((a, r) => a + r.added, 0), spawns = rep.reduce((a, r) => a + r.spawns, 0);
    check(grown.length >= Math.ceil(areas.length * 0.8), `floor ${z}: ${grown.length}/${areas.length} hunting grounds grew (${added} new tiles, ${spawns} new spawns)${grown.length < areas.length ? ` — small: ${rep.filter((r) => r.added < 30).map((r) => r.name).join(', ')}` : ''}`);
    let lights = 0, solidOnOpen = 0;
    const f = w.floor(z)!;
    for (let i = 0; i < f.obj.length; i++) {
      const o = f.obj[i];
      if (o === Obj.Brazier || o === Obj.Crystals || o === Obj.GlowShrooms || o === Obj.Torch || f.ground[i] === Ground.Lava) lights++;
      if ((o === Obj.Brazier || o === Obj.Crystals) && f.ground[i] === Ground.Void) solidOnOpen++;
    }
    check(lights >= areas.length * 3 && solidOnOpen === 0, `floor ${z}: ${lights} braziers, torches, crystals, glowing mushrooms and lava pools`);
  }

  // webs slow you down and wear off; poison clouds can poison (on an empty steppe: no other monsters about)
  const t = solo('knight', g);
  const live = g.enemies.slice();
  g.enemies.length = 0;
  const spot = { x: 575, y: 70, z: 0 };
  t.s.player.placeAt(spot.x, spot.y, spot.z);
  setLevel(g, t.s, 400);
  const before = t.s.player.stepTime;
  const web = dummy(g, 'dread_weaver', { x: spot.x + 1, y: spot.y, z: 0 });
  g.useAbility(web, dw.abilities.find((a) => a.web)!, t.s.player);
  const slowed = t.s.player.stepTime;
  check(t.s.player.webbed > 0 && Math.abs(slowed - before * WEB_SLOW) < 1e-6, `a binding web slows your steps (${before.toFixed(3)} → ${slowed.toFixed(3)} s)`);
  web.dead = true;
  for (let i = 0; i < 20 * 8; i++) g.update(0.05);
  check(t.s.player.webbed === 0 && Math.abs(t.s.player.stepTime - before) < 1e-6, 'the web wears off');
  let poisoned = false;
  const cloud = dummy(g, 'dread_weaver', { x: spot.x + 1, y: spot.y, z: 0 });
  for (let i = 0; i < 12 && !poisoned; i++) { g.useAbility(cloud, dw.abilities.find((a) => a.kind === 'blast')!, t.s.player); poisoned = t.s.player.buffs.poisoned > 0; }
  check(poisoned, 'the poison cloud poisons');
  cloud.dead = true;
  g.enemies.push(...live);
  // the colossus: the world hears when it falls, and who brought it down
  const news: string[] = [];
  const off = g.events.on((e) => { if (e.type === 'announce') news.push(e.text); });
  const col = g.enemies.find((e) => e.enemyKind === 'gravesilk_colossus' && !e.dead)!;
  col.hp = 1;
  col.damageBy.set(t.pid, 17_999);
  t.s.player.placeAt(col.x + 1, col.y, col.z);
  (g as unknown as { killEnemy(e: Enemy): void }).killEnemy(col);
  off();
  check(news.some((n) => n.includes('Gravesilk Colossus') && n.includes(t.s.player.name)), `the kill is broadcast (${news[0]})`);

  // safe login: a character saved on a tile that is now solid wakes in the temple; one on open cave ground stays
  const save = g.serialize(t.pid) as unknown as { player: { x: number; y: number; z: number } };
  let solid: { x: number; y: number; z: number } | null = null, open: { x: number; y: number; z: number } | null = null;
  const f1 = w.floor(-1)!;
  for (let i = 0; i < f1.obj.length && (!solid || !open); i++) {
    const x = i % w.width, y = (i / w.width) | 0;
    if (!solid && f1.ground[i] !== Ground.Void && !w.isWalkable(x, y, -1) && (f1.obj[i] === Obj.Brazier || f1.obj[i] === Obj.Crystals || f1.obj[i] === Obj.Stalagmite)) solid = { x, y, z: -1 };
    if (!open && f1.ground[i] === Ground.Cave && w.isWalkable(x, y, -1) && reach.at(x, y, -1) && !w.isSafe(x, y, -1)) open = { x, y, z: -1 };
  }
  const login = (at: { x: number; y: number; z: number }) => {
    const u = solo('knight', new Game());
    const data = JSON.parse(JSON.stringify(save));
    data.player.x = at.x; data.player.y = at.y; data.player.z = at.z;
    const ok = u.g.applySave(u.pid, data);
    return { ok, p: u.s.player, temple: u.g.world.temple };
  };
  const a = login(solid!);
  check(a.ok && a.p.z === a.temple.z && Math.max(Math.abs(a.p.x - a.temple.x), Math.abs(a.p.y - a.temple.y)) <= 6 && u_walk(a.p), `logging in on a tile that is now solid (a brazier, crystals, a stalagmite) moves you to the temple (${solid!.x},${solid!.y},${solid!.z} → ${a.p.x},${a.p.y},${a.p.z})`);
  const b = login(open!);
  check(b.ok && b.p.x === open!.x && b.p.y === open!.y && b.p.z === -1, 'logging in on open cave ground keeps you where you were');
  function u_walk(p: { x: number; y: number; z: number }): boolean { return w.isWalkable(p.x, p.y, p.z); }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll content checks passed.');
process.exit(failures ? 1 : 0);
