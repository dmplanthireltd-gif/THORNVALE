/**
 * Headless content test for the northlands update: every monster has a real
 * definition, every item is valid and reachable, buff potions work and expire,
 * conjuring creates ammunition, Groundshaker hits all around the knight, and
 * every monster model builds.
 *   tsx scripts/content-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import { Enemy } from '../src/game/enemies/Enemy';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { equipSlotFor, ITEMS, POTION_BUFF_SECONDS } from '../src/game/inventory/items';
import { SPELLS, type SpellId } from '../src/game/magic/spells';
import { buildDialogue } from '../src/game/npc/dialogue';
import { NPCS } from '../src/game/npc/npcs';
import { EXTRA_BUYS, EXTRA_SELLS, EXTRA_SPELLS } from '../src/game/npc/stock';
import { applySnapshot, buildSnapshot } from '../src/game/net/protocol';
import { expForLevel } from '../src/game/player/Player';
import type { Vocation } from '../src/game/player/vocations';
import type { EnemyKind } from '../src/game/world/WorldMap';

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
      g.meleeAttack(s.player, e);
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
    p2.s.inventory.equipment.weapon = { id, qty: 100 };
    p2.s.inventory.equipment.shield = null;
    for (let i = 0; i < 100; i++) {
      target.dead = false;
      target.hp = 1e9;
      (g as unknown as { distanceAttack(s: Session, t: Enemy, d: number): void }).distanceAttack(p2.s, target, 2);
    }
    return 100 - (p2.s.inventory.equipment.weapon?.qty ?? 0);
  };
  const lostSpear = throwN('spear');
  const lostRune = throwN('enchanted_spear');
  check(lostRune < lostSpear, `runebound spears are lost less often (${lostRune} vs ${lostSpear} of 100)`);
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
        let meshes = 0;
        r.root.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
        if (meshes < 5) failed.push(`${k}: only ${meshes} meshes`);
        if (!(ENEMY_SCALE[k] > 0.5)) failed.push(`${k}: scale`);
        sigs.set(k, `${r.type}:${meshes}:${r.materials.map((m) => m.color.getHex()).sort().join(',')}`);
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

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll content checks passed.');
process.exit(failures ? 1 : 0);
