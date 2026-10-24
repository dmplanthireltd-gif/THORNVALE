/**
 * Teleport runes (magic/teleport.ts): every destination is a real, safe spot outside
 * boss lairs, every rune exists and is sold, and the channel rules hold — 3 s of
 * standing still, broken by moving, damage, a fight or death, blocked by a PZ lock,
 * combat, the cooldown, the tutorial island and premium land.
 *   tsx scripts/teleport-test.ts
 */
declare const process: { exit(code: number): never };
import { BufferedIntent, Game, type Session } from '../src/game/Game';
import type { GameEvent } from '../src/game/core/events';
import { chebyshev } from '../src/game/core/types';
import { describeItem, ITEMS, runeGroup, runeIsAimed } from '../src/game/inventory/items';
import {
  NO_TELEPORT_REGIONS, TELEPORT_CAST_SECONDS, TELEPORT_COOLDOWN_SECONDS, TELEPORT_DESTS, TELEPORT_RUNES, teleportForbiddenRegion, teleportRuneId, teleportTarget,
} from '../src/game/magic/teleport';
import { executeCommand, PROTOCOL_VERSION } from '../src/game/net/protocol';
import { NPCS } from '../src/game/npc/npcs';
import { TOWNS } from '../src/game/world/townList';
import { ISLE_START } from '../src/game/world/tutorialIsle';
import { RUNE_LABEL } from '../src/ui/runeIcons';

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

const g = new Game();
const w = g.world;
const bosses = g.enemies.filter((e) => e.def.boss);

console.log('Teleport runes: destinations');
{
  check(TOWNS.every((t) => TELEPORT_DESTS.some((d) => d.town === t.key)), `every town has a teleport rune (${TOWNS.length} towns)`);
  check(TELEPORT_DESTS.some((d) => d.key === 'pearl_pier'), 'the Sunken Reach entrance (Pearl Pier) has a teleport rune');
  check(new Set(TELEPORT_DESTS.map((d) => d.key)).size === TELEPORT_DESTS.length, 'destination keys are unique');
  const bad: string[] = [];
  const nearBoss: string[] = [];
  for (const d of TELEPORT_DESTS) {
    const to = teleportTarget(w, d);
    if (!to || !w.isWalkable(to.x, to.y, to.z) || w.linkAt(to.x, to.y, to.z)) { bad.push(d.key); continue; }
    if (d.town && !w.isSafe(to.x, to.y, to.z)) bad.push(`${d.key} (town arrival not in a protection zone)`);
    if (teleportForbiddenRegion(w.regionAt(to.x, to.y, to.z)?.name)) bad.push(`${d.key} (forbidden region)`);
    // boss lairs: never land within 20 tiles of a dungeon boss on the same floor
    const b = bosses.find((e) => e.spawnZ === to.z && chebyshev(e.spawnX, e.spawnY, to.x, to.y) <= 20);
    if (b) nearBoss.push(`${d.key} near ${b.enemyKind}`);
  }
  check(bad.length === 0, `every destination is an open tile (towns: inside the temple's protection zone)${bad.length ? ` (${bad.join(', ')})` : ''}`);
  check(bosses.length >= 8, `boss spawns found (${bosses.length})`);
  check(nearBoss.length === 0, `no destination is in or near a boss lair${nearBoss.length ? ` (${nearBoss.join(', ')})` : ''}`);
  const t = TELEPORT_DESTS.find((d) => d.key === 'thornvale')!;
  const tv = teleportTarget(w, t)!;
  check(tv.x === w.temple.x && tv.y === w.temple.y && tv.z === w.temple.z, 'the Thornvale rune lands on the Thornvale temple');
  check(NO_TELEPORT_REGIONS.includes("Wayfarer's Isle") && teleportForbiddenRegion('Red Arena') && !teleportForbiddenRegion('Thornvale'), 'the tutorial island and arenas are closed to teleport magic');
}

console.log('Teleport runes: items and shops');
{
  const bad = TELEPORT_RUNES.filter((id) => {
    const d = ITEMS[id];
    return !d || d.kind !== 'rune' || d.rune?.type !== 'teleport' || !d.rune.dest || !d.stackable || !(d.value > 0) || !d.note || !RUNE_LABEL[id];
  });
  check(bad.length === 0, `every teleport rune is a stackable rune with a destination, value, note and label${bad.length ? ` (${bad.join(' ')})` : ''}`);
  const r = ITEMS[teleportRuneId('westmarch')].rune!;
  check(!runeIsAimed(r) && runeGroup(r) === 'support', 'teleport runes are used on yourself (no crosshair)');
  check(describeItem(ITEMS[teleportRuneId('westmarch')]).includes('teleports you to Westmarch'), 'the tooltip names the destination');
  const mages = Object.values(NPCS).filter((n) => n.role === 'Magic, runes & potions');
  check(mages.length >= 14 && mages.every((n) => TELEPORT_RUNES.every((id) => n.sells?.some((e) => e.id === id && e.price >= ITEMS[id].value))), `every magic shop sells every teleport rune (${mages.length} shops, never below what they pay)`);
  check(mages.every((n) => TELEPORT_RUNES.every((id) => n.buys?.includes(id))), 'every magic shop buys teleport runes back');
  check(PROTOCOL_VERSION >= 29, `protocol bumped for the teleport events (${PROTOCOL_VERSION})`);
}

const events: GameEvent[] = [];
g.events.on((e) => { if (e.type.startsWith('teleport') || e.type === 'message') events.push(e); });
let n = 0;
function fresh(level = 30): Session {
  const s = g.addPlayer(`Porter${n++}`, { intent: new BufferedIntent(), vocation: 'sorcerer' });
  s.player.level = level;
  g.refreshStats(s);
  s.player.hp = s.player.maxHp;
  return s;
}
function give(s: Session, key: string, qty = 1): number {
  s.inventory.add(teleportRuneId(key), qty);
  return s.inventory.slots.findIndex((x) => x?.id === teleportRuneId(key));
}
function run(sec: number): void {
  for (let t = 0; t < sec; t += 0.05) g.update(0.05);
}
const lastMsg = (s: Session) => {
  for (let i = events.length - 1; i >= 0; i--) { const e = events[i]; if (e.type === 'message' && e.to === s.id) return e.text; }
  return '';
};
const at = (s: Session, key: string) => {
  const to = teleportTarget(w, TELEPORT_DESTS.find((d) => d.key === key)!)!;
  return s.player.z === to.z && chebyshev(s.player.x, s.player.y, to.x, to.y) <= 3;
};

console.log('Teleport runes: the channel');
{
  const s = fresh();
  const slot = give(s, 'westmarch', 2);
  const before = events.length;
  executeCommand(g, s.id, { c: 'useSlot', slot });
  check(!!s.teleport && events.slice(before).some((e) => e.type === 'teleportCast' && e.id === s.player.id && e.dur === TELEPORT_CAST_SECONDS), 'using the rune starts a 3 s channel (teleportCast event)');
  check(s.inventory.count(teleportRuneId('westmarch')) === 2, 'the rune is not used up while channelling');
  run(TELEPORT_CAST_SECONDS - 0.3);
  check(at(s, 'thornvale') && !!s.teleport, 'still home just before the channel ends');
  run(0.5);
  check(at(s, 'westmarch') && !s.teleport, 'after 3 s the player stands at the Westmarch temple');
  check(s.inventory.count(teleportRuneId('westmarch')) === 1, 'one rune used up');
  const seq = events.slice(before).filter((e) => e.type === 'teleportDone' || e.type === 'teleport').map((e) => e.type);
  check(seq[0] === 'teleportDone' && seq[1] === 'teleport', 'teleportDone is sent before the jump\'s teleport event');
  // cooldown
  const s2slot = give(s, 'thornvale');
  executeCommand(g, s.id, { c: 'useSlot', slot: s2slot });
  check(!s.teleport && /need rest/.test(lastMsg(s)), `cooldown: a second rune right away is refused ("${lastMsg(s)}")`);
  run(TELEPORT_COOLDOWN_SECONDS + 0.5);
  executeCommand(g, s.id, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === teleportRuneId('thornvale')) });
  check(!!s.teleport, `after ${TELEPORT_COOLDOWN_SECONDS} s another teleport may start`);
  run(TELEPORT_CAST_SECONDS + 0.2);
  check(at(s, 'thornvale'), 'and it brings the player home');
}
{
  // moving breaks it off and keeps the rune
  const s = fresh();
  const slot = give(s, 'elderglen');
  executeCommand(g, s.id, { c: 'useSlot', slot });
  run(0.5);
  (s.intent as BufferedIntent).queued = { dx: 0, dy: 1 };
  run(0.6);
  check(!s.teleport && /moved/.test(lastMsg(s)) && s.inventory.count(teleportRuneId('elderglen')) === 1, 'walking breaks the channel; the rune is kept');
  check(events.some((e) => e.type === 'teleportCancel' && e.id === s.player.id), 'a teleportCancel event is sent');
  run(TELEPORT_CAST_SECONDS);
  check(at(s, 'thornvale') || !at(s, 'elderglen'), 'and nobody is moved');
}
{
  // damage breaks it off
  const s = fresh();
  executeCommand(g, s.id, { c: 'useSlot', slot: give(s, 'elderglen') });
  run(1);
  s.player.hp -= 10;
  run(0.1);
  check(!s.teleport && /pain/.test(lastMsg(s)) && s.inventory.count(teleportRuneId('elderglen')) === 1, 'taking damage breaks the channel; the rune is kept');
}
{
  // a fight starting (dealing or taking damage) breaks it off
  const s = fresh();
  executeCommand(g, s.id, { c: 'useSlot', slot: give(s, 'elderglen') });
  run(1);
  s.player.sinceCombat = 0;
  run(0.1);
  check(!s.teleport && /fight/.test(lastMsg(s)), 'a fight breaking out breaks the channel');
}
{
  // blocked: PZ lock, combat, near the destination, tutorial island, dead
  const s = fresh();
  const slot = give(s, 'westmarch');
  s.player.pzLock = 30;
  executeCommand(g, s.id, { c: 'useSlot', slot });
  check(!s.teleport && /PZ-locked/.test(lastMsg(s)), 'a PZ-locked player cannot teleport');
  s.player.pzLock = 0;
  s.player.sinceCombat = 2;
  executeCommand(g, s.id, { c: 'useSlot', slot });
  check(!s.teleport && /during a fight/.test(lastMsg(s)), 'nobody teleports in the middle of a fight');
  s.player.sinceCombat = 99;
  executeCommand(g, s.id, { c: 'useSlot', slot: give(s, 'thornvale') });
  check(!s.teleport && /already at Thornvale/.test(lastMsg(s)) && s.inventory.count(teleportRuneId('thornvale')) === 1, 'a rune to where you already stand is refused and kept');
  s.player.placeAt(ISLE_START.x, ISLE_START.y, ISLE_START.z);
  executeCommand(g, s.id, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === teleportRuneId('westmarch')) });
  check(!s.teleport && /does not work here/.test(lastMsg(s)), "teleport magic does not work on Wayfarer's Isle");
}
{
  // level requirement for hub runes
  const s = fresh(10);
  executeCommand(g, s.id, { c: 'useSlot', slot: give(s, 'scorched_crags') });
  check(!s.teleport && /level 80/.test(lastMsg(s)), 'hub runes ask for their level (Scorched Crags 80)');
}
{
  // dying while channelling cancels quietly
  const s = fresh();
  executeCommand(g, s.id, { c: 'useSlot', slot: give(s, 'westmarch') });
  run(0.5);
  s.player.hp = 1;
  (g as unknown as { killPlayer(p: unknown, k: unknown): void }).killPlayer(s.player, null);
  check(!s.teleport, 'death cancels the channel');
}
{
  // premium land: enforced premium refuses the island towns
  const gp = new Game({ premium: true });
  const s = gp.addPlayer('Islander', { intent: new BufferedIntent(), vocation: 'knight' });
  const texts: string[] = [];
  gp.events.on((e) => { if (e.type === 'message' && e.to === s.id) texts.push(e.text); });
  s.inventory.add(teleportRuneId('aurelion'), 1);
  executeCommand(gp, s.id, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === teleportRuneId('aurelion')) });
  check(!s.teleport && /premium/.test(texts[texts.length - 1] ?? ''), 'without premium the runes to premium towns are refused');
  s.inventory.add(teleportRuneId('millbrook'), 1);
  executeCommand(gp, s.id, { c: 'useSlot', slot: s.inventory.slots.findIndex((x) => x?.id === teleportRuneId('millbrook')) });
  check(!!s.teleport, 'free towns work without premium');
}

console.log(failures ? `\n${failures} teleport check(s) FAILED` : '\nAll teleport checks passed.');
process.exit(failures ? 1 : 0);
