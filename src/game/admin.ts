import type { Game, Session } from './Game';
import { ITEMS, type ItemDef } from './inventory/items';
import { addToList } from './inventory/Inventory';
import { SPELL_LIST } from './magic/spells';
import { expForLevel } from './player/Player';
import { gatherXpForLevel, WC_MAX_LEVEL } from './gathering/woodcutting';
import { findNonCombatSkill, NONCOMBAT_IDS, skillDef, type NonCombatSkill } from './gathering/skills';
import { COMBAT_SKILLS, legacySkills, MAGIC_START, SKILL_MAX, SKILL_NAMES, SKILL_START, type CombatSkill } from './player/skills';
import { isVocation, VOCATIONS } from './player/vocations';
import { findRaid, RAIDS, WORLD_BOSSES } from './bosses/bosses';
import { bossTitle } from './bosses/WorldEvents';
import { ENEMIES } from './enemies/enemyDefs';
import type { EnemyKind } from './world/WorldMap';
import { isFounderTier } from './premium/premium';
import { TUTORIAL_LAST, tutorialStep } from './tutorial/tutorial';
import { Climate, WEATHER_NAMES, weatherKindByName } from './world/weather';
import { CAPE_IDS, DUNGEON_BOSS_KINDS, WORLD_BOSS_KINDS } from './inventory/capes';
import { PET_DEFS, PET_MAX_LEVEL, petXpForLevel } from './pets/petDefs';

/**
 * Test / game-master commands, typed in chat with a leading "/".
 * Always available offline; a server enables them per character
 * (see ALLOW_ADMIN and ADMINS in server/server.ts).
 */
export const ADMIN_HELP = [
  '/level N — set your level (1–1000); skills rise to what that level usually has',
  '/exp N — gain N experience',
  '/gold N — get N gold (overflow goes to the bank)',
  '/item name [qty] — get an item by id or name',
  '/spells — learn every spell of your vocation',
  '/heal — full health and mana',
  '/warn Name, message — pop-up warning to a player (game masters only)',
  '/broadcast message — pop-up message to everyone online (game masters only)',
  '/god — toggle invulnerability (full admins only, not in test mode)',
  '/kill — kill your current target (full admins only, not in test mode)',
  '/goto place — teleport to a place (e.g. /goto caldera) or /goto x y z',
  '/vocation name — change vocation',
  '/raid name — start a raid now, after a 30 s warning (game masters; everyone in test mode)',
  '/worldboss name — wake a world boss at one of its spots now (game masters; everyone in test mode)',
  '/boss name — a boss right next to you, for 30 minutes (game masters only)',
  '/events — world boss, raid and dungeon boss timers (game masters only)',
  '/weather — the weather where you stand; /weather rain|storm|snow|blizzard|dust|sandstorm|mist|downpour|cloudy|clear [0–100] sets it everywhere, /weather off goes back to the real weather (game masters; everyone in test mode)',
  '/tutorial — where you are in the tutorial; /tutorial step N, /tutorial done, /tutorial skip, /tutorial reset (back to the island; game masters)',
  '/skill name N — set a skill (fist, club, sword, axe, distance, shielding, magic, woodcutting, fishing, mining, smithing, fletching, crafting, cooking, firemaking); also /fishing N, /mining N, /smithing N, /fletching N, /crafting N, /cooking N, /firemaking N',
  '/maxskills [N] — every fighting skill and magic to N (default 100) and every trade to 99, so all skill capes can be worn',
  '/capes — get all 30 capes and count every boss as slain (deed capes); /pets — get all 8 pet items; /petlevel N — every pet to level N (1–10)',
  '/premium N — give yourself N days of premium for this session (0 = none; game masters only, never saved)',
  '/founder wayfarer|warden|legend|none [number] — try a founder pack\'s looks for this session (game masters only, never saved)',
];

/** Boss kinds by name, title or id ("hrimgaard", "rime wyrm", "boss_rime_wyrm", "mountain"). */
export function findBoss(q: string, only?: 'dungeon' | 'world' | 'raid'): EnemyKind | null {
  const n = q.trim().toLowerCase();
  if (!n) return null;
  const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].boss && (!only || ENEMIES[k].boss === only));
  return kinds.find((k) => k === n.replace(/\s+/g, '_') || ENEMIES[k].name.toLowerCase() === n)
    ?? kinds.find((k) => k.includes(n.replace(/\s+/g, '_')) || bossTitle(k).toLowerCase().includes(n))
    ?? null;
}

/** Short names accepted by /skill. */
const SKILL_ALIASES: Record<string, CombatSkill> = {
  fist: 'fist', club: 'club', sword: 'sword', axe: 'axe', distance: 'distance', dist: 'distance', shielding: 'shielding', shield: 'shielding',
  magic: 'magic', ml: 'magic', mlvl: 'magic',
};

/** A combat skill or a non-combat skill (gathering/skills.ts) by name or alias. */
function findSkill(q: string): CombatSkill | NonCombatSkill | null {
  return SKILL_ALIASES[q.toLowerCase()] ?? findNonCombatSkill(q);
}

export function findItem(query: string): ItemDef | null | ItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const id = q.replace(/\s+/g, '_');
  if (ITEMS[id]) return ITEMS[id];
  const all = Object.values(ITEMS);
  const byName = all.find((d) => d.name.toLowerCase() === q);
  if (byName) return byName;
  const partial = all.filter((d) => d.id.includes(id) || d.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  return partial.length ? partial.slice(0, 8) : null;
}

/** Sets a character's level (with matching experience and at least the usual skills for it). */
export function setLevel(game: Game, s: Session, lvl: number): void {
  const p = s.player;
  p.level = lvl;
  p.exp = expForLevel(lvl);
  // characters get at least the skills a character of that level would have
  const typical = legacySkills(p.vocation, lvl);
  for (const k of COMBAT_SKILLS) if (s.skills[k].level < typical[k].level) s.skills[k] = { level: typical[k].level, tries: 0 };
  game.refreshStats(s);
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  game.events.emit({ type: 'levelUp', id: p.id, level: lvl });
  s.wantsSave = true;
}

export function runAdminCommand(game: Game, s: Session, text: string): void {
  const pid = s.id;
  const p = s.player;
  const say = (t: string, kind: 'info' | 'warn' | 'loot' = 'info') => game.msg(pid, t, kind);
  const [cmdRaw, ...rest] = text.slice(1).trim().split(/\s+/);
  const cmd = (cmdRaw ?? '').toLowerCase();
  const arg = rest.join(' ');
  const num = (v: string | undefined, def: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : def;
  };
  const invChanged = () => {
    game.events.emit({ type: 'inventoryChanged', to: pid });
    s.wantsSave = true;
  };

  switch (cmd) {
    case 'help':
    case '?':
      for (const l of ADMIN_HELP) say(l);
      return;
    case 'level':
    case 'lvl': {
      const lvl = Math.max(1, Math.min(1000, num(rest[0], p.level)));
      setLevel(game, s, lvl);
      say(`You are now level ${lvl}.`);
      return;
    }
    case 'exp': {
      const n = Math.max(0, num(rest[0], 0));
      const before = p.level;
      p.gainExp(n);
      game.refreshStats(s);
      if (p.level > before) {
        p.hp = p.maxHp;
        p.mana = p.maxMana;
        game.events.emit({ type: 'levelUp', id: pid, level: p.level });
      }
      s.wantsSave = true;
      say(`+${n} experience (level ${p.level}).`);
      return;
    }
    case 'gold':
    case 'money': {
      const n = Math.max(1, Math.min(10_000_000, num(rest[0], 1000)));
      // carry what your capacity allows (gold weighs 0.1 oz a coin), bank the rest
      const canCarry = Math.max(0, Math.floor((p.capacity - s.inventory.weight()) / 0.1));
      const carry = Math.min(n, canCarry);
      const left = (carry ? s.inventory.add('gold', carry) : 0) + (n - carry);
      if (left) s.bank += left;
      invChanged();
      say(left ? `You get ${n - left} gold; ${left} went to your bank account (withdraw it at any banker).` : `You get ${n} gold.`, 'loot');
      return;
    }
    case 'item':
    case 'i': {
      let qty = 1;
      let name = arg;
      const last = rest[rest.length - 1];
      if (rest.length > 1 && /^\d+$/.test(last ?? '')) {
        qty = Math.max(1, Math.min(1000, Number(last)));
        name = rest.slice(0, -1).join(' ');
      }
      const found = findItem(name);
      if (!found) return say(`No item matches "${name}".`, 'warn');
      if (Array.isArray(found)) return say(`Which one? ${found.map((d) => d.id).join(', ')}`, 'warn');
      const left = s.inventory.add(found.id, qty);
      invChanged();
      if (left === qty) return say('Your backpack is full. Equip a bigger backpack or make room.', 'warn');
      say(`You get ${qty - left}× ${found.name}${left ? ` (${left} did not fit)` : ''}.`, 'loot');
      return;
    }
    case 'spells': {
      for (const sp of SPELL_LIST) if (sp.vocations.includes(p.vocation)) s.spells.add(sp.id);
      game.events.emit({ type: 'spellsChanged', to: pid });
      s.wantsSave = true;
      say(`You know every ${VOCATIONS[p.vocation].name.toLowerCase()} spell now.`);
      return;
    }
    case 'heal':
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      game.events.emit({ type: 'heal', targetId: pid, amount: p.maxHp });
      return;
    case 'warn':
    case 'broadcast': {
      if (s.testOnly) return say('Only game masters can send warnings.', 'warn');
      const all = rest.join(' ').trim();
      if (cmd === 'broadcast') {
        if (!all) return say('Usage: /broadcast message', 'warn');
        for (const o of game.sessions.values()) game.events.emit({ type: 'adminNotice', title: 'Message from the Admin', text: all, to: o.id });
        return say('Broadcast sent to everyone online.');
      }
      // "/warn Name, message" (or "/warn Name message" for one-word names)
      const comma = all.indexOf(',');
      const name = (comma >= 0 ? all.slice(0, comma) : all.split(/\s+/)[0] ?? '').trim();
      const text = (comma >= 0 ? all.slice(comma + 1) : all.slice(name.length)).trim() || 'Please follow the rules.';
      const target = [...game.sessions.values()].find((o) => o.player.name.toLowerCase() === name.toLowerCase());
      if (!target) return say(`${name || 'That player'} is not online.`, 'warn');
      game.events.emit({ type: 'adminNotice', title: 'Warning from the Admin', text, to: target.id });
      game.msg(target.id, `Warning from the Admin: ${text}`, 'warn');
      return say(`Warning sent to ${target.player.name}.`);
    }
    case 'premium': {
      // session-only: the account's real premium lives in the database and comes back at the next login
      if (s.testOnly) return say('/premium is for game masters only.', 'warn');
      const days = Math.max(0, Math.min(3650, num(rest[0], 30)));
      game.setPerks(pid, { ...s.perks, premiumUntil: days > 0 ? game.now() + days * 86_400_000 : 0 });
      return say(days > 0 ? `Premium for ${days} day${days === 1 ? '' : 's'} (this session only).` : 'Premium removed (this session only).');
    }
    case 'founder': {
      if (s.testOnly) return say('/founder is for game masters only.', 'warn');
      const t = (rest[0] ?? '').toLowerCase();
      if (t === 'none') {
        game.setPerks(pid, { ...s.perks, founderTier: null, founderNo: 0 });
        return say('Founder looks removed (this session only).');
      }
      if (!isFounderTier(t)) return say('Usage: /founder wayfarer|warden|legend|none [number]', 'warn');
      game.setPerks(pid, { ...s.perks, founderTier: t, founderNo: t === 'legend' ? Math.max(1, Math.min(999, num(rest[1], 1))) : 0 });
      return say(`Founder looks: ${t} (this session only).`);
    }
    case 'god':
      if (s.testOnly) return say('God mode is not available in test mode.', 'warn');
      p.god = !p.god;
      say(p.god ? 'God mode on: nothing can hurt you.' : 'God mode off.');
      return;
    case 'kill': {
      if (s.testOnly) return say('/kill is not available in test mode.', 'warn');
      const t = game.getEnemy(p.targetId);
      if (!t || t.dead) return say('Target a monster first.', 'warn');
      game.adminKill(p, t);
      return;
    }
    case 'raid': {
      // game masters always; everyone on a test server
      if (s.testOnly && !game.testMode) return say('Only game masters can start raids.', 'warn');
      const r = findRaid(arg);
      if (!r) return say(`Raids: ${RAIDS.map((x) => `${x.id} (${x.town})`).join(', ')}. Example: /raid orc`, 'warn');
      if (game.worldEvents.raid) return say(`A raid is already running: ${game.worldEvents.raid.def.name}.`, 'warn');
      game.worldEvents.startRaidNow(r);
      return say(`Raid "${r.name}" on ${r.town} starts in 30 seconds.`);
    }
    case 'worldboss':
    case 'wb': {
      if (s.testOnly && !game.testMode) return say('Only game masters can wake world bosses.', 'warn');
      const k = findBoss(arg, 'world');
      const def = WORLD_BOSSES.find((w) => w.kind === k);
      if (!def) return say(`World bosses: ${WORLD_BOSSES.map((w) => ENEMIES[w.kind].name.toLowerCase()).join(', ')}. Example: /worldboss ${ENEMIES[WORLD_BOSSES[0].kind].name.toLowerCase()}`, 'warn');
      if (game.worldEvents.worldBoss) return say(`A world boss is already up: ${ENEMIES[game.worldEvents.worldBoss.def.kind].name}.`, 'warn');
      const e = game.worldEvents.startWorldBoss(def);
      if (!e) return say('No room for it at any of its spots right now.', 'warn');
      return say(`${bossTitle(def.kind)} is up at ${e.x}, ${e.y}, ${e.z}.`);
    }
    case 'boss': {
      if (s.testOnly) return say('Only game masters can call bosses.', 'warn');
      const k = findBoss(arg);
      if (!k) return say(`Bosses: ${(Object.keys(ENEMIES) as EnemyKind[]).filter((x) => ENEMIES[x].boss).map((x) => ENEMIES[x].name.toLowerCase()).join(', ')}. Example: /boss ironjaw`, 'warn');
      const e = game.spawnBossNear(p, k);
      if (!e) return say('There is no room for it next to you.', 'warn');
      return say(`${bossTitle(k)} appears next to you (it leaves in 30 minutes).`);
    }
    case 'weather': {
      const w = game.weatherView(pid);
      if (!rest[0]) {
        const pct = (v: number) => `${Math.round(v * 100)}%`;
        return say(`Weather here: ${WEATHER_NAMES[w.kind]}${w.kind ? ` ${pct(w.amount)}` : ''}${w.prevAmount > 0 ? ` (clearing ${WEATHER_NAMES[w.prev]} ${pct(w.prevAmount)})` : ''}, wind ${pct(w.wind)}, ${Climate[w.climate].toLowerCase()} zone ${w.zone}${game.weather.forcedKind !== null ? ' — set by /weather' : ''}.`);
      }
      if (s.testOnly && !game.testMode) return say('Only game masters can change the weather.', 'warn');
      if (rest[0].toLowerCase() === 'off' || rest[0].toLowerCase() === 'real') {
        game.weather.force(null);
        return say('The weather follows the sky again.');
      }
      const k = weatherKindByName(rest[0]);
      if (k === null) return say(`Weather kinds: ${Object.values(WEATHER_NAMES).join(', ')}, off.`, 'warn');
      const amt = Math.max(5, Math.min(100, num(rest[1], 100))) / 100;
      game.weather.force(k, amt);
      return say(`Weather everywhere: ${WEATHER_NAMES[k]} ${Math.round(amt * 100)}% (until /weather off or a restart).`);
    }
    case 'events': {
      if (s.testOnly) return say('Only game masters can see the event timers.', 'warn');
      for (const l of game.worldEvents.upcoming()) say(l);
      return;
    }
    case 'goto':
    case 'tp': {
      const nums = rest.map(Number);
      if (rest.length >= 2 && nums.every((n) => Number.isFinite(n))) {
        const [x, y, z = p.z] = nums;
        if (!game.world.inBounds(x, y)) return say('That is outside the world.', 'warn');
        game.teleport(p, x, y, z);
        return;
      }
      const q = arg.toLowerCase();
      if (!q) return say(`Places: ${game.world.regions.filter((r) => (r.x1 - r.x0) * (r.y1 - r.y0) > 60).map((r) => r.name).join(', ')}`);
      const r = game.world.regions.find((x) => x.name.toLowerCase() === q) ?? game.world.regions.find((x) => x.name.toLowerCase().includes(q));
      if (!r) return say(`No place called "${arg}".`, 'warn');
      const t = r.temple ?? { x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2), z: r.z0 };
      game.teleport(p, t.x, t.y, t.z);
      say(`Teleported to ${r.name}.`);
      return;
    }
    case 'vocation':
    case 'voc': {
      const v = arg.toLowerCase();
      if (!isVocation(v)) return say('Vocations: knight, paladin, sorcerer, druid.', 'warn');
      p.vocation = v;
      game.refreshStats(s);
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      game.events.emit({ type: 'spellsChanged', to: pid });
      game.events.emit({ type: 'equipmentChanged', id: pid });
      s.wantsSave = true;
      say(`You are now a ${VOCATIONS[v].name.toLowerCase()}.`);
      return;
    }
    case 'fishing':
    case 'woodcutting':
    case 'mining':
    case 'smithing':
    case 'fletching':
    case 'crafting':
    case 'cooking':
    case 'firemaking':
    case 'skill':
    case 'skills': {
      // "/fishing 30" is short for "/skill fishing 30"
      if (cmd !== 'skill' && cmd !== 'skills') rest.unshift(cmd);
      const which = findSkill(rest[0] ?? '');
      if (!which) return say(`Skills: ${[...COMBAT_SKILLS, ...NONCOMBAT_IDS].join(', ')}. Example: /skill sword 50`, 'warn');
      if ((NONCOMBAT_IDS as string[]).includes(which)) {
        const id = which as NonCombatSkill;
        const lvl = Math.max(1, Math.min(WC_MAX_LEVEL, num(rest[1], 1)));
        s.gathering[id] = gatherXpForLevel(lvl);
        say(`${skillDef(id).name} is now level ${lvl}.`);
      } else {
        const k = which as CombatSkill;
        const min = k === 'magic' ? MAGIC_START : SKILL_START;
        const lvl = Math.max(min, Math.min(SKILL_MAX, num(rest[1], min)));
        s.skills[k] = { level: lvl, tries: 0 };
        say(`${SKILL_NAMES[k]} is now ${lvl}.`);
      }
      game.events.emit({ type: 'skillUp', skill: which, level: 0, to: pid });
      game.refreshStats(s);
      s.wantsSave = true;
      return;
    }
    case 'maxskills': {
      const lvl = Math.max(SKILL_START, Math.min(SKILL_MAX, num(rest[0], 100)));
      for (const k of COMBAT_SKILLS) s.skills[k] = { level: Math.max(lvl, k === 'magic' ? MAGIC_START : SKILL_START), tries: 0 };
      for (const id of NONCOMBAT_IDS) s.gathering[id] = gatherXpForLevel(WC_MAX_LEVEL);
      for (const k of [...COMBAT_SKILLS, ...NONCOMBAT_IDS]) game.events.emit({ type: 'skillUp', skill: k, level: 0, to: pid });
      game.refreshStats(s);
      s.wantsSave = true;
      say(`Every fighting skill and magic is now ${lvl}, every trade ${WC_MAX_LEVEL}.`);
      return;
    }
    case 'capes': {
      for (const k of [...DUNGEON_BOSS_KINDS, ...WORLD_BOSS_KINDS]) if (!s.bossKills.includes(k)) s.bossKills.push(k);
      let missed = 0;
      for (const id of CAPE_IDS) missed += s.inventory.add(id, 1);
      invChanged();
      say(`You get ${CAPE_IDS.length - missed} capes${missed ? ` (${missed} did not fit: make room and use /capes again)` : ''}. Every boss counts as slain, so the deed capes can be worn. Use /maxskills to wear the skill capes.`, 'loot');
      return;
    }
    case 'pets': {
      let missed = 0;
      for (const d of PET_DEFS) missed += s.inventory.add(d.item, 1);
      invChanged();
      say(`You get ${PET_DEFS.length - missed} pet items${missed ? ` (${missed} did not fit)` : ''}. Use one to call the pet; /petlevel 10 makes them all level 10.`, 'loot');
      return;
    }
    case 'petlevel': {
      const lvl = Math.max(1, Math.min(PET_MAX_LEVEL, num(rest[0], PET_MAX_LEVEL)));
      for (const d of PET_DEFS) s.pets.xp[d.id] = petXpForLevel(lvl);
      game.events.emit({ type: 'inventoryChanged', to: pid });
      s.wantsSave = true;
      say(`Every pet is now level ${lvl}.`);
      return;
    }
    case 'tutorial': {
      const t = s.tutorial;
      const sub = (rest[0] ?? '').toLowerCase();
      if (!sub) return say(t.state === 'active' ? `Tutorial step ${t.step}/${TUTORIAL_LAST}: ${tutorialStep(t.step)?.title ?? '?'} (flags ${t.flags}, count ${t.count}).` : `Tutorial ${t.state}.`);
      if (sub === 'reset') {
        // never loses anything: what you carry and wear goes to your depot first
        if (s.testOnly) return say('/tutorial reset is for game masters only.', 'warn');
        const inv = s.inventory;
        const all = [...inv.slots, ...Object.values(inv.equipment)].filter((x): x is NonNullable<typeof x> => !!x);
        const free = s.depot.filter((x) => !x).length;
        if (all.length > free) return say(`Make room in your depot first (${all.length} stacks to store, ${free} free).`, 'warn');
        for (const it of all) addToList(s.depot, it.id, it.qty);
        game.beginTutorial(pid);
        return say("Back to Wayfarer's Isle, step 1. Everything you carried is in your depot.", 'warn');
      }
      // finishing, skipping or jumping steps would set the account flag or repeat the step gifts: game masters only
      if (s.testOnly) return say('Only game masters can change tutorial progress.', 'warn');
      if (t.state !== 'active') return say('You are not on the tutorial. Use /tutorial reset first.', 'warn');
      if (sub === 'done') {
        game.completeTutorial(s, false);
        return say('Tutorial marked as finished.');
      }
      if (sub === 'skip') {
        const was = t.canSkip;
        t.canSkip = true;
        if (!game.skipTutorial(pid)) t.canSkip = was;
        return;
      }
      if (sub === 'step') {
        const n = Math.max(1, Math.min(TUTORIAL_LAST, num(rest[1], t.step)));
        t.step = n;
        t.flags = 0;
        t.count = 0;
        game.events.emit({ type: 'tutorialChanged', to: pid });
        s.wantsSave = true;
        return say(`Tutorial step ${n}: ${tutorialStep(n)?.title}.`);
      }
      return say('Usage: /tutorial, /tutorial step N, /tutorial done, /tutorial skip, /tutorial reset', 'warn');
    }
    default:
      say(`Unknown command "/${cmd}". Type /help.`, 'warn');
  }
}
