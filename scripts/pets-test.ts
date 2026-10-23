/**
 * Pets: content (items, icons, models, sources, buyers), logic (call, swap, send away, perks,
 * levels, tortoise pouch, death, fox, raven, finds), saves (migration, round trip, lost items)
 * and the network (own pet view, other players' pets, commands).
 *   npx tsx scripts/pets-test.ts   (part of npm run test:logic)
 */
declare const process: { exit(code: number): never };
import { Game, type Session } from '../src/game/Game';
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { ITEMS } from '../src/game/inventory/items';
import { applySnapshot, buildSnapshot, executeCommand, type MirrorExtras } from '../src/game/net/protocol';
import { NPCS } from '../src/game/npc/npcs';
import {
  foxChance, PET_BY_ID, PET_DEFS, PET_ITEMS, PET_KEEPER, PET_MAX_LEVEL, PET_SELLS, petBonus, petGatherBoost, petLevelForXp, petXpForLevel, POUCH_SLOTS,
  petSizeFactor, ravenRange, SKILL_PETS, type PetId,
} from '../src/game/pets/petDefs';
import { activePet, parsePetLook, petLevel, petLook } from '../src/game/pets/PetSystem';
import { migrateSave, SAVE_VERSION } from '../src/game/save/migrate';
import { animatePet, buildPet, disposePet } from '../src/render/models/pets3d';
import { drawPetIcon } from '../src/ui/petIcons';
import { TOWNS } from '../src/game/world/townList';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

console.log('Pets: content');
{
  check(PET_DEFS.length === 8 && new Set(PET_ITEMS).size === 8, '8 pets, one item each');
  const bad = PET_DEFS.filter((p) => {
    const d = ITEMS[p.item];
    return !d || d.kind !== 'pet' || d.stackable || !(d.weight > 0) || !(d.value > 0) || !d.icon || !d.tint || d.name !== p.name || !p.perk || !p.source;
  });
  check(bad.length === 0, `every pet item is defined (kind pet, not stackable, weight, value, name, perk, source)${bad.length ? ` (${bad.map((p) => p.id).join(' ')})` : ''}`);
  const sold = new Set(Object.values(NPCS).flatMap((n) => (n.sells ?? []).map((e) => e.id)));
  const dropped = new Set(Object.values(ENEMIES).flatMap((d) => d.loot.map((l) => l.id)));
  const found = new Set(Object.values(SKILL_PETS).map((x) => x!.item));
  const noSource = PET_ITEMS.filter((id) => !sold.has(id) && !dropped.has(id) && !found.has(id));
  check(noSource.length === 0, `every pet can be bought, looted or found${noSource.length ? ` (${noSource.join(' ')})` : ''}`);
  const bought = new Set(Object.values(NPCS).flatMap((n) => n.buys ?? []));
  check(PET_ITEMS.every((id) => bought.has(id)), 'every pet item has a buyer');
  const keeper = NPCS[PET_KEEPER];
  check(!!keeper && keeper.name === 'Thistle' && PET_SELLS.every((e) => keeper.sells?.some((x) => x.id === e.id && x.price >= ITEMS[e.id].value)), 'Thistle in Elderglen sells tortoise, fox and owl (never below what she pays)');
  check(TOWNS.find((t) => t.key === 'elderglen')?.staff.outfit?.key === PET_KEEPER, 'the pet keeper is the Elderglen outfitter (not in the starting town)');
  check(PET_ITEMS.every((id) => keeper?.buys?.includes(id)), 'the pet keeper buys every pet back');
  check(dropped.has('pet_whelp') && ENEMIES.boss_ember_matriarch.loot.some((l) => l.id === 'pet_whelp'), 'the dragon whelp comes from the Mother of Flames');
  check(ENEMIES.raid_grave_warden.loot.some((l) => l.id === 'pet_raven'), 'the raven comes from the restless dead raid boss');
  check(SKILL_PETS.woodcutting?.item === 'pet_beaver' && SKILL_PETS.mining?.item === 'pet_mole' && SKILL_PETS.fishing?.item === 'pet_otter' && SKILL_PETS.fishing.chance === 1 / 5000, 'beaver, mole and otter: 1 in 5,000 logs, ores and catches');
  // models: every pet builds, animates, flies (birds) and frees its materials
  let modelsOk = true;
  for (const p of PET_DEFS) {
    try {
      const r = buildPet(p.id, 10);
      let meshes = 0;
      r.root.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
      animatePet(r, 1.2, 1);
      animatePet(r, 2.5, 0);
      if (meshes < 3 || r.materials.length !== 2 || r.root.scale.x <= 1 || ((p.id === 'owl' || p.id === 'raven') !== r.fly > 0)) modelsOk = false;
      disposePet(r);
    } catch (e) {
      console.log(`    ${p.id}: ${String(e)}`);
      modelsOk = false;
    }
  }
  check(modelsOk, 'every pet has a 3D model with idle/walk animation (birds fly), grown a little by level');
  // icons: each pet draws its own portrait (a recording fake canvas)
  let calls = 0;
  const fake: unknown = new Proxy({}, {
    get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : () => { calls++; }),
    set: () => true,
  });
  const drew = PET_ITEMS.every((id) => drawPetIcon(fake as CanvasRenderingContext2D, id));
  check(drew && calls > 200 && !drawPetIcon(fake as CanvasRenderingContext2D, 'gold'), 'every pet item has its own drawn icon');
}

console.log('Pets: levels and perks');
{
  check(petXpForLevel(1) === 0 && petXpForLevel(2) === 25_000 && petXpForLevel(10) === 2_025_000, 'pet level curve 25,000 × (level − 1)²');
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  check(near(petSizeFactor(1), 1) && near(petSizeFactor(2), 1.02) && near(petSizeFactor(10), 1.18) && near(petSizeFactor(99), 1.18) && near(petSizeFactor(0), 1) && near(petSizeFactor(NaN), 1), 'pets grow 2% a level (×1.18 at 10, clamped)');
  {
    const r1 = buildPet('fox', 1), r10 = buildPet('fox', 10);
    check(near(r10.root.scale.x / r1.root.scale.x, 1.18), 'the pet model is drawn bigger at a higher pet level');
    const tort = buildPet('tortoise', 1), fx = buildPet('fox', 1);
    check(tort.height > 1.6 * fx.height, 'the war tortoise is far bigger than the small pets');
    disposePet(r1); disposePet(r10); disposePet(tort); disposePet(fx);
  }
  check(petLevelForXp(0) === 1 && petLevelForXp(24_999) === 1 && petLevelForXp(25_000) === 2 && petLevelForXp(1e12) === PET_MAX_LEVEL, 'levels from experience, capped at 10');
  check(petBonus('tortoise', 1)?.hpRegen === 1 && petBonus('tortoise', 10)?.hpRegen === 2, 'tortoise: +1 health regeneration, +2 at level 10');
  check(petBonus('owl', 1)?.manaRegen === 1 && petBonus('owl', 1)?.light === 2 && petBonus('owl', 10)?.light === 3, 'owl: mana regeneration and light');
  check(petBonus('fox', 1)?.speed === 2 && petBonus('fox', 10)?.speed === 3, 'fox: +2% speed, +3% at level 10');
  check(petBonus('whelp', 1)?.resist?.fire === 3 && petBonus('whelp', 10)?.resist?.fire === 5, 'dragon whelp: 3–5% fire resistance');
  check(petGatherBoost(1) === 1.05 && Math.abs(petGatherBoost(10) - 1.095) < 1e-9, 'skilling pets: ×1.05 → ×1.095');
  check(foxChance(1) === 0.2 && ravenRange(1) === 10 && ravenRange(10) === 14, 'fox chance and raven range grow with level');
}

const g = new Game({ pvp: true });
const solo = (name: string): Session => {
  const s = g.addPlayer(name, { vocation: 'knight' });
  s.inventory.slots.fill(null);
  return s;
};
const msgs: string[] = [];
const announced: string[] = [];
g.events.on((e) => {
  if (e.type === 'message') msgs.push(e.text);
  if (e.type === 'announce') announced.push(e.text);
});
const lastMsg = () => msgs[msgs.length - 1] ?? '';

console.log('Pets: calling, swapping, sending away');
{
  const s = solo('Petra');
  s.inventory.add('pet_tortoise', 1);
  s.inventory.add('pet_owl', 1);
  const regen0 = s.player.hpRegen;
  const slotT = s.inventory.slots.findIndex((x) => x?.id === 'pet_tortoise');
  g.useSlot(s.id, slotT);
  check(s.pets.active === 'pet_tortoise' && !s.inventory.has('pet_tortoise'), 'using the tortoise calls it (its item goes with it)');
  check(s.player.hpRegen === regen0 + 1, 'its perk applies (+1 health regeneration)');
  const slotO = s.inventory.slots.findIndex((x) => x?.id === 'pet_owl');
  g.useSlot(s.id, slotO);
  check(s.pets.active === 'pet_owl' && s.inventory.slots[slotO]?.id === 'pet_tortoise' && s.player.manaRegen >= 1, 'using another pet swaps them in the same backpack slot');
  check(g.petSys.light(s) === 2, 'the owl lights caves (light +2)');
  executeCommand(g, s.id, { c: 'pet', a: 'dismiss' });
  check(!s.pets.active && s.inventory.has('pet_owl') && s.player.hpRegen === regen0, 'send away: the owl is back in the backpack, perk gone');
  // full backpack: sending away is refused, nothing is lost
  g.useSlot(s.id, s.inventory.slots.findIndex((x) => x?.id === 'pet_owl'));
  for (let i = 0; i < s.inventory.size(); i++) if (!s.inventory.slots[i]) s.inventory.slots[i] = { id: 'rope', qty: 1 };
  g.petSys.dismiss(s);
  check(s.pets.active === 'pet_owl' && /backpack is full/.test(lastMsg()), 'a full backpack keeps the pet out (nothing lost)');
  s.inventory.slots.fill(null);
  g.petSys.dismiss(s);
}

console.log('Pets: tortoise pouch');
{
  const s = solo('Pouchy');
  s.inventory.add('pet_tortoise', 1);
  s.inventory.add('iron_ore', 10);
  s.inventory.add('pet_fox', 1);
  executeCommand(g, s.id, { c: 'pet', a: 'put', i: 0 });
  check(/Only a Mossback War Tortoise/.test(lastMsg()), 'no pouch without the tortoise');
  g.useSlot(s.id, s.inventory.slots.findIndex((x) => x?.id === 'pet_tortoise'));
  const ore = s.inventory.slots.findIndex((x) => x?.id === 'iron_ore');
  executeCommand(g, s.id, { c: 'pet', a: 'put', i: ore });
  check(s.pets.pouch[0]?.id === 'iron_ore' && s.pets.pouch[0].qty === 10 && !s.inventory.has('iron_ore') && s.pets.pouchOpen, 'a backpack item goes into the pouch');
  executeCommand(g, s.id, { c: 'pet', a: 'put', i: s.inventory.slots.findIndex((x) => x?.id === 'pet_fox') });
  check(s.inventory.has('pet_fox') && /pouch/.test(lastMsg()), 'pets never ride in the pouch');
  g.useSlot(s.id, s.inventory.slots.findIndex((x) => x?.id === 'pet_fox'));
  check(s.pets.active === 'pet_tortoise' && /Empty the pouch/.test(lastMsg()), 'a loaded tortoise cannot be swapped');
  g.petSys.dismiss(s);
  check(s.pets.active === 'pet_tortoise', 'nor sent away');
  for (let i = 0; i < POUCH_SLOTS + 1; i++) { s.inventory.add('rope', 1); executeCommand(g, s.id, { c: 'pet', a: 'put', i: s.inventory.slots.findIndex((x) => x?.id === 'rope') }); }
  check(s.pets.pouch.every(Boolean) && s.inventory.count('rope') === 2 && /pouch is full/.test(lastMsg()), `the pouch holds ${POUCH_SLOTS} items`);
  executeCommand(g, s.id, { c: 'pet', a: 'take', i: 0 });
  check(s.inventory.count('iron_ore') === 10 && !s.pets.pouch[0], `click a pouch item to take it back (${s.inventory.count('iron_ore')}, ${lastMsg()})`);
  // death: the pet (and its item) is safe, the pouch drops into the body like the backpack
  s.inventory.equipment.backpack = { id: 'bag', qty: 1 };
  const kill = () => (g as unknown as { killPlayer(p: unknown, k: null): void }).killPlayer(s.player, null);
  kill();
  const body = g.bags.find((b) => b.corpse === 'Pouchy');
  check(s.pets.active === 'pet_tortoise' && s.pets.pouch.every((x) => !x), 'on death the tortoise stays with you, its pouch is emptied');
  check(!!body && body.items.filter((i) => i.id === 'rope').length >= POUCH_SLOTS - 1 && body.items.some((i) => i.id === 'pet_fox'), 'the pouch and the pet items in the backpack lie in the body');
  g.update(5);
  // the Hearthward Amulet saves the pouch too
  s.player.dead = false;
  s.player.hp = s.player.maxHp;
  s.pets.pouch[3] = { id: 'gold', qty: 50 };
  s.inventory.equipment.amulet = { id: 'hearthward_amulet', qty: 1 };
  kill();
  check(s.pets.pouch[3]?.qty === 50, 'a Hearthward Amulet keeps the pouch as well');
  s.player.dead = false;
}

console.log('Pets: experience, finds, fox, raven, skilling boost');
{
  const s = solo('Raiser');
  s.inventory.add('pet_beaver', 1);
  g.useSlot(s.id, 0);
  check(petLevel(s.pets, 'beaver') === 1, 'a new pet starts at level 1');
  (g as unknown as { grantExp(s: unknown, n: number, at: number, why: string): void }).grantExp(s, 30_000, s.id, 'for a test');
  check(s.pets.xp.beaver === 30_000 && petLevel(s.pets, 'beaver') === 2 && msgs.some((m) => m.includes('pet level 2')), 'the pet that is out learns from your experience (level 2)');
  g.gainSkill(s, 'woodcutting', 25, s.id);
  check(s.pets.xp.beaver === 30_025, 'and from trade skill experience');
  check(g.petSys.gatherBoost(s, 'woodcutting') === petGatherBoost(2) && g.petSys.gatherBoost(s, 'mining') === 1, 'the beaver helps chopping only');
  // a find: forced roll
  const before = s.inventory.count('pet_mole');
  g.petSys.onSkill(s, 'mining', 18, () => 0);
  check(s.inventory.count('pet_mole') === before + 1 && announced.some((t) => t.includes('Raiser found a pet mole while mining')), 'mining can turn up a mole, announced to everyone');
  g.petSys.onSkill(s, 'cooking', 30, () => 0);
  check(s.inventory.count('pet_mole') === before + 1, 'production skills find no pets');
  g.petSys.onLoot([s.id], [{ id: 'pet_whelp', qty: 1 }], 'Kaerith');
  check(announced.some((t) => t.includes('found a pet dragon whelp in the loot of Kaerith')), 'a pet in monster loot is announced');

  // fox: fetches gold from a pile next to you
  g.petSys.dismiss(s);
  s.inventory.slots.fill(null);
  s.inventory.add('pet_fox', 1);
  g.useSlot(s.id, 0);
  const p = s.player;
  g.dropItemsAt(p.x + 1, p.y, p.z, [{ id: 'gold', qty: 40 }, { id: 'bone', qty: 1 }]);
  const gold0 = s.inventory.count('gold');
  for (let i = 0; i < 400 && s.inventory.count('gold') === gold0; i++) g.petSys.update(1);
  check(s.inventory.count('gold') === gold0 + 40 && g.bags.some((b) => b.items.some((x) => x.id === 'bone')), 'the fox fetches the gold of a nearby pile (and leaves the rest)');
  // raven: warns about a red skull close by
  g.petSys.dismiss(s);
  s.inventory.add('pet_raven', 1);
  g.useSlot(s.id, s.inventory.slots.findIndex((x) => x?.id === 'pet_raven'));
  const red = solo('Redmane');
  red.player.placeAt(p.x + 6, p.y, p.z);
  g.petSys.update(0.1);
  check(!msgs.some((m) => m.includes('Redmane')), 'no warning for an unmarked player');
  red.player.redSkullUntil = Date.now() + 60_000;
  g.petSys.update(0.1);
  g.petSys.update(0.1);
  check(msgs.filter((m) => m.includes('raven caws') && m.includes('Redmane')).length === 1, 'the raven warns once when a red skull comes within 10 tiles');
  g.removePlayer(red.id);
}

console.log('Pets: saves');
{
  const s = solo('Saver');
  s.inventory.add('pet_tortoise', 1);
  g.useSlot(s.id, 0);
  s.pets.xp = { tortoise: 100_000, owl: 7 };
  s.pets.pouch[1] = { id: 'iron_ore', qty: 5 };
  const data = JSON.parse(JSON.stringify(g.serialize(s.id)));
  check(data.version === SAVE_VERSION && SAVE_VERSION >= 12 && data.pets.active === 'pet_tortoise' && data.pets.pouch[1].qty === 5, `save v${SAVE_VERSION} stores the pet, its experience and the pouch`);
  const t = solo('Loader');
  check(g.applySave(t.id, data) && t.pets.active === 'pet_tortoise' && petLevel(t.pets, 'tortoise') === 3 && t.pets.pouch[1]?.id === 'iron_ore' && t.player.hpRegen >= 1, 'loading restores pet, level, pouch and perk');
  // an old (v11) save: no pets yet
  const v11 = { ...data, version: 11 } as Record<string, unknown>;
  delete v11.pets;
  const m = migrateSave(v11);
  check(typeof m !== 'string' && m.from === 11 && m.data.version === SAVE_VERSION && m.data.pets?.active === null && Array.isArray(m.data.pets?.pouch), 'a v11 save migrates with no pet out and an empty pouch');
  const u = solo('Old');
  check(g.applySave(u.id, v11) && !u.pets.active && u.pets.pouch.every((x) => !x) && u.inventory.count('pet_tortoise') === 0, 'a migrated character loads with no pet');
  // items that no longer exist in a pouch are kept, never deleted
  const odd = JSON.parse(JSON.stringify(data));
  odd.pets.pouch[4] = { id: 'removed_thing', qty: 2 };
  const w = solo('Keeper');
  check(g.applySave(w.id, odd) && w.lostItems.some((x) => x.id === 'removed_thing' && x.qty === 2) && w.pets.pouch[1]?.qty === 5, 'unknown pouch items go to the lost items (kept, not deleted)');
}

console.log('Pets: network');
{
  const a = solo('Netta');
  const b = solo('Netbo');
  b.inventory.add('pet_whelp', 1);
  g.useSlot(b.id, 0);
  b.pets.xp.whelp = petXpForLevel(4);
  a.inventory.add('pet_tortoise', 1);
  g.useSlot(a.id, 0);
  a.pets.pouch[0] = { id: 'rope', qty: 1 };
  const mirror = new Game({ simulate: false });
  mirror.addPlayer('Netta', { id: a.id, starter: false });
  mirror.localId = a.id;
  const extras: MirrorExtras = { depot: null, trade: null };
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  const ma = mirror.session(a.id)!;
  const mb = mirror.session(b.id)!;
  check(ma.pets.active === 'pet_tortoise' && ma.pets.pouch[0]?.id === 'rope', 'own pet and pouch reach the client');
  check(mb.pets.active === 'pet_whelp' && petLevel(mb.pets, 'whelp') === 4, "other players' pets (and their level) reach the client");
  check(petLook(b.pets) === 'pet_whelp:4' && parsePetLook('pet_whelp:4')?.level === 4 && parsePetLook('nonsense') === null, 'compact pet look field');
  const snap2 = buildSnapshot(g, a) as { self: { pet?: unknown }; c: Array<{ id: number; pe?: string }> };
  check(snap2.self.pet === undefined && snap2.c.find((c) => c.id === b.id)?.pe === undefined, 'unchanged pets are not sent again');
  executeCommand(g, b.id, { c: 'pet', a: 'dismiss' });
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  check(!mb.pets.active && !activePet(mb.pets), 'a pet sent away disappears for others too');
  executeCommand(g, a.id, { c: 'pet', a: 'take', i: 0 });
  applySnapshot(mirror, JSON.parse(JSON.stringify(buildSnapshot(g, a))), extras);
  check(!ma.pets.pouch[0] && mirror.session(a.id)!.inventory.has('rope'), 'pouch commands work over the protocol');
  executeCommand(g, a.id, { c: 'pet', a: 'bogus' as 'dismiss' });
  check(a.pets.active === 'pet_tortoise', 'unknown pet commands are ignored');
}

// every pet id is covered by the tables above
check((Object.keys(PET_BY_ID) as PetId[]).every((id) => PET_DEFS.some((d) => d.id === id)), 'pet table complete');

if (failures) {
  console.log(`\n${failures} pet check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll pet checks passed.');
