/**
 * Arena bots (test servers): two teams of computer players, Red and Blue, fight
 * each other 4 vs 4 on the West Green beside the Thornvale temple plaza, so
 * anyone on the plaza (a protection zone) can watch.
 *
 * - Levels 50–80, one knight, paladin, sorcerer and druid per team, in a party
 *   with their team, wearing the best full gear set for their vocation and level,
 *   carrying runes and potions.
 * - Team tactics: a caller picks a focus target (lowest health, out of position,
 *   a mage…) and every member fires its strongest attack in the same moment
 *   after a short countdown (a "combo"). Healers keep the team alive, mages keep
 *   their distance from the enemy knight, magic walls block a chaser, area runes
 *   and spells go off when enemies bunch up, low members fall back.
 * - Everything goes through executeCommand with the normal cooldowns, mana and
 *   rune stock: no free damage.
 * - They only ever hurt each other: area attacks wait while a monster or a
 *   real player (or another bot) stands in the blast, magic walls are never put
 *   near real players, monsters ignore them (`Player.ignoredByMonsters`) and they
 *   never step into a protection zone or out of the arena.
 * - They never carry a skull, so a death never drops anything; they come back
 *   after 20–30 s on their team's side with full health, mana and supplies, and
 *   their level and experience are restored. Never saved (Session.bot).
 */
import { BufferedIntent, inAreaShape, type Game, type Session } from '../src/game/Game';
import { setLevel } from '../src/game/admin';
import { chebyshev } from '../src/game/core/types';
import { BOSS_UNIQUES, equipSlotFor, ITEMS, itemDef, type EquipSlot, type ItemDef } from '../src/game/inventory/items';
import { SETS } from '../src/game/inventory/sets';
import { SPELLS, type SpellId } from '../src/game/magic/spells';
import { executeCommand } from '../src/game/net/protocol';
import type { OutfitType } from '../src/game/player/outfits';
import { PALETTE } from '../src/game/player/outfits';
import { expForLevel, type Player } from '../src/game/player/Player';
import type { Vocation } from '../src/game/player/vocations';

/** The battle area: open green west of the Thornvale temple plaza (protection-zone tiles inside are left out). */
export const PVP_ARENA = { name: 'West Green', x0: 179, y0: 308, x1: 195, y1: 319, z: 0 } as const;
export const PVP_TEAM_MAX = 4;
export const PVP_LEVEL_MIN = 50;
export const PVP_LEVEL_MAX = 80;
/** Seconds a fallen arena bot waits before it comes back (random in this range). */
export const PVP_RESPAWN_MIN = 20;
export const PVP_RESPAWN_MAX = 30;
/** Seconds between decisions (movement, targets) per bot; heals are checked every HEAL_EVERY. */
export const PVP_THINK = 0.5;
const HEAL_EVERY = 0.2;
/** Countdown from the call to the combo, and the window in which the members fire. */
export const PVP_COMBO_DELAY = 1.2;
const COMBO_WINDOW = 0.8;
/** Members hold their attack cooldown this long before a combo, so it is ready. */
const COMBO_HOLD = 2.1;

const TEAM_INFO = [
  { name: 'Red', colour: 0xc02a20, names: ['Varric', 'Maelis', 'Torvald', 'Seren'] },
  { name: 'Blue', colour: 0x2a5ad0, names: ['Halvard', 'Isolde', 'Brannoc', 'Ylva'] },
] as const;
const ROLES: Vocation[] = ['knight', 'paladin', 'sorcerer', 'druid'];
const OUTFIT_FOR: Record<Vocation, OutfitType> = { knight: 'knight', paladin: 'ranger', sorcerer: 'mage', druid: 'mage' };

type TeamId = 0 | 1;

interface ArenaBot {
  s: Session;
  team: TeamId;
  level: number;
  /** Spawn spot on the team's side. */
  home: { x: number; y: number };
  think: number;
  heal: number;
  dead: boolean;
  /** Personal thresholds (a little randomness so fights differ). */
  healAt: number;
  potionAt: number;
  /** Who hit this bot last, and when (for the score). */
  lastHitBy: TeamId | null;
  lastHitAt: number;
  /** Tiles still to walk (inside the arena). */
  route: Array<{ x: number; y: number }>;
}

interface Team {
  id: TeamId;
  name: string;
  members: ArenaBot[];
  score: number;
  focusId: number | null;
  focusSince: number;
  /** Lowest health fraction the focus reached (to see it "heal out"). */
  focusLow: number;
  /** Since when the focus has been out of reach. */
  farSince: number;
  nextCall: number;
  comboAt: number;
  comboTarget: number | null;
  comboFired: Set<number>;
  nextCombo: number;
  nextWall: number;
  nextChat: number;
}

export interface PvpBotStats {
  kills: [number, number];
  combos: number;
  walls: number;
  areaAttacks: number;
  heals: number;
  teamHeals: number;
  deaths: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Closest palette index to a colour (outfit colours are palette indices). */
function paletteIndex(rgb: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const c = PALETTE[i];
    const d = ((c >> 16) - (rgb >> 16)) ** 2 + (((c >> 8) & 255) - ((rgb >> 8) & 255)) ** 2 + ((c & 255) - (rgb & 255)) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const UNIQUE = new Set(BOSS_UNIQUES);

/** Gear a bot may wear: right level and vocation, no legendary or boss items (those stay something players chase). */
function usable(d: ItemDef, voc: Vocation, lvl: number): boolean {
  return (!d.level || d.level <= lvl) && (!d.vocations || d.vocations.includes(voc)) && d.rarity !== 'legendary' && !UNIQUE.has(d.id);
}

function itemScore(d: ItemDef): number {
  const b = d.bonus;
  return (d.attack ?? 0) * 2 + (d.armor ?? 0) * 3 + (d.defense ?? 0) + (d.magicDamage ? d.magicDamage[1] : 0)
    + (b ? (b.hp ?? 0) / 15 + (b.mana ?? 0) / 15 + (b.magic ?? 0) * 2 + (b.attack ?? 0) * 3 + (b.speed ?? 0) : 0);
}

const BODY: EquipSlot[] = ['head', 'armor', 'legs', 'feet'];

/**
 * Equipment for an arena bot: the best full gear set its vocation can wear at
 * this level (all four body pieces, so the 4-piece bonus counts; near-equal sets
 * are picked at random for variety), then the best item for every other slot.
 */
export function arenaKit(voc: Vocation, lvl: number): { gear: Partial<Record<EquipSlot, { id: string; qty: number }>>; set: string | null } {
  const gear: Partial<Record<EquipSlot, { id: string; qty: number }>> = {};
  // 1) the set
  const options: Array<{ id: string; score: number; pieces: ItemDef[] }> = [];
  for (const set of SETS) {
    if (set.vocations && !set.vocations.includes(voc)) continue;
    const pieces = set.pieces.map((id) => ITEMS[id]).filter((d): d is ItemDef => !!d);
    const body = pieces.filter((d) => BODY.includes(equipSlotFor(d)!));
    if (body.length < 4 || !body.every((d) => usable(d, voc, lvl))) continue;
    const own = set.vocations && set.vocations.length <= 2 && set.vocations.includes(voc) ? (set.vocations.length === 1 ? 12 : 6) : 0;
    options.push({ id: set.id, score: set.level + own + rand(0, 5), pieces });
  }
  options.sort((a, b) => b.score - a.score);
  const chosen = options[0] ?? null;
  if (chosen) for (const d of chosen.pieces) {
    const slot = equipSlotFor(d)!;
    if (BODY.includes(slot) && usable(d, voc, lvl)) gear[slot] = { id: d.id, qty: 1 };
  }
  // 2) the weapon
  const weaponOk = (d: ItemDef) => voc === 'knight' ? (d.weaponType === 'sword' || d.weaponType === 'axe' || d.weaponType === 'club') && !d.twoHanded
    : voc === 'paladin' ? d.weaponType === 'bow' || d.weaponType === 'crossbow'
    : voc === 'sorcerer' ? d.weaponType === 'wand' : d.weaponType === 'rod';
  const best = new Map<EquipSlot, ItemDef>();
  for (const d of Object.values(ITEMS)) {
    const slot = equipSlotFor(d);
    if (!slot || slot === 'backpack' || slot === 'ammo' || gear[slot] || !usable(d, voc, lvl)) continue;
    if (slot === 'weapon' && !weaponOk(d)) continue;
    if (slot === 'shield' && voc === 'paladin') continue; // bows take both hands
    const cur = best.get(slot);
    if (!cur || itemScore(d) > itemScore(cur)) best.set(slot, d);
  }
  for (const [slot, d] of best) gear[slot] = { id: d.id, qty: 1 };
  // 3) ammunition for the bow or crossbow
  const w = gear.weapon ? itemDef(gear.weapon.id) : null;
  if (w?.ammoType) {
    const ammo = Object.values(ITEMS).filter((d) => d.kind === 'ammo' && d.ammoType === w.ammoType && usable(d, voc, lvl))
      .sort((a, b) => (b.attack ?? 0) + (b.elementDamage ?? 0) - (a.attack ?? 0) - (a.elementDamage ?? 0))[0];
    if (ammo) gear.ammo = { id: ammo.id, qty: 400 };
  }
  gear.backpack = { id: 'explorer_pack', qty: 1 };
  return { gear, set: chosen?.id ?? null };
}

/** The best item of a list this character may use. */
function firstUsable(ids: string[], voc: Vocation, lvl: number): string | null {
  for (const id of ids) {
    const d = ITEMS[id];
    if (d && (!d.level || d.level <= lvl) && (!d.vocations || d.vocations.includes(voc))) return id;
  }
  return null;
}

/** Runes and potions in the backpack (restocked at every respawn). */
export function arenaSupplies(voc: Vocation, lvl: number): Array<[string, number]> {
  const hp = firstUsable(['great_health_potion', 'strong_health_potion', 'health_potion'], voc, lvl)!;
  const mp = firstUsable(['great_mana_potion', 'strong_mana_potion', 'mana_potion'], voc, lvl)!;
  const list: Array<[string, number]> = voc === 'knight' ? [[hp, 25], [mp, 12]]
    : voc === 'paladin' ? [[hp, 18], [mp, 22], ['sunlance_rune', 25], ['arcane_wall_rune', 3], ['healing_rune', 4]]
    : voc === 'sorcerer' ? [[mp, 26], [hp, 10], ['death_rune', 35], ['fireball_rune', 12], ['arcane_wall_rune', 5], ['healing_rune', 6]]
    : [[mp, 26], [hp, 8], ['death_rune', 22], ['avalanche_rune', 12], ['healing_rune', 25], ['arcane_wall_rune', 4]];
  return list.filter(([id]) => usable(itemDef(id), voc, lvl));
}

export class PvpBots {
  readonly bots: ArenaBot[] = [];
  readonly teams: [Team, Team];
  readonly stats: PvpBotStats = { kills: [0, 0], combos: 0, walls: 0, areaAttacks: 0, heals: 0, teamHeals: 0, deaths: 0 };
  /** Every bot's player id. */
  readonly ids = new Set<number>();
  private t = 0;
  /** Monsters and other players near the arena, refreshed once a second (area attacks wait while one is in the blast). */
  private outsiders: Array<{ x: number; y: number; z: number; ok: boolean }> = [];
  private outsiderTimer = 0;
  /** Tile key → id of whoever stands there (-2 = not a bot). */
  private readonly occ = new Map<number, number>();
  private prev = new Int16Array(0);
  private readonly unsubscribe: () => void;

  constructor(private readonly game: Game, perTeam: number = PVP_TEAM_MAX) {
    const n = Math.max(1, Math.min(PVP_TEAM_MAX, Math.floor(perTeam)));
    const mk = (id: TeamId): Team => ({
      id, name: TEAM_INFO[id].name, members: [], score: 0, focusId: null, focusSince: 0, focusLow: 1, farSince: -1,
      nextCall: 0, comboAt: 0, comboTarget: null, comboFired: new Set(), nextCombo: rand(3, 6), nextWall: 0, nextChat: 0,
    });
    this.teams = [mk(0), mk(1)];
    const A = PVP_ARENA;
    const midY = Math.round((A.y0 + A.y1) / 2);
    // random levels, but each role's opponent is within a few levels, so neither side is stacked
    const roleLevel = ROLES.map(() => Math.floor(rand(PVP_LEVEL_MIN, PVP_LEVEL_MAX + 1)));
    for (const team of [0, 1] as TeamId[]) {
      const info = TEAM_INFO[team];
      const homeX = team === 0 ? A.x0 + 2 : A.x1 - 2;
      for (let i = 0; i < n; i++) {
        const voc = ROLES[i];
        const level = Math.max(PVP_LEVEL_MIN, Math.min(PVP_LEVEL_MAX, roleLevel[i] + (team === 0 ? 0 : Math.round(rand(-4, 4)))));
        const s = game.addPlayer(`${info.names[i]} [${info.name} Bot]`, { intent: new BufferedIntent(), vocation: voc });
        s.bot = true;
        s.player.ignoredByMonsters = true;
        setLevel(game, s, level);
        for (const id of Object.keys(SPELLS) as SpellId[]) if (SPELLS[id].vocations.includes(voc)) s.spells.add(id);
        const home = { x: homeX + (voc === 'knight' ? (team === 0 ? 2 : -2) : 0), y: midY - 3 + i * 2 };
        const b: ArenaBot = {
          s, team, level, home, think: rand(0, PVP_THINK), heal: rand(0, HEAL_EVERY), dead: false,
          healAt: rand(0.55, 0.7), potionAt: rand(0.35, 0.48), lastHitBy: null, lastHitAt: -99, route: [],
        };
        this.bots.push(b);
        this.ids.add(s.id);
        this.teams[team].members.push(b);
        const col = paletteIndex(info.colour);
        executeCommand(game, s.id, { c: 'outfit', outfit: { ...s.player.outfit, type: OUTFIT_FOR[voc], body: col, legs: col, head: s.player.outfit.head, feet: s.player.outfit.feet } });
        // they fight bots only, so secure mode off; "stand": they walk themselves (and never into a protection zone)
        executeCommand(game, s.id, { c: 'secureMode', on: false });
        executeCommand(game, s.id, { c: 'fightMode', mode: voc === 'knight' ? 'offensive' : 'balanced', chase: false });
        this.restock(b);
        this.placeAtHome(b);
      }
      // the team is a party (no friendly fire)
      const [lead, ...rest] = this.teams[team].members;
      for (const m of rest) {
        executeCommand(game, lead.s.id, { c: 'partyInvite', id: m.s.id });
        executeCommand(game, m.s.id, { c: 'partyJoin', id: lead.s.id });
      }
    }
    this.unsubscribe = game.events.on((e) => {
      if (e.type !== 'damage' || e.result !== 'hit') return;
      const v = this.byId(e.targetId), a = this.byId(e.sourceId);
      if (v && a && v.team !== a.team) {
        v.lastHitBy = a.team;
        v.lastHitAt = this.t;
      }
    });
  }

  /** Removes the bots from the game (tests). */
  dispose(): void {
    this.unsubscribe();
    for (const b of this.bots) this.game.removePlayer(b.s.id);
  }

  /** "Red 3 : 2 Blue". */
  scoreLine(): string {
    return `${this.teams[0].name} ${this.teams[0].score} : ${this.teams[1].score} ${this.teams[1].name}`;
  }

  private byId(id: number): ArenaBot | null {
    if (!this.ids.has(id)) return null;
    return this.bots.find((b) => b.s.id === id) ?? null;
  }

  // ------------------------------------------------------------------ arena geometry

  inArena(x: number, y: number, z: number = PVP_ARENA.z): boolean {
    const A = PVP_ARENA;
    return z === A.z && x >= A.x0 && x <= A.x1 && y >= A.y0 && y <= A.y1 && !this.game.world.isSafe(x, y, z);
  }

  /** Free arena tile to stand on (walkable, no stairs, nobody there). */
  private standable(x: number, y: number, selfId: number): boolean {
    const g = this.game;
    if (!this.inArena(x, y) || !g.world.isWalkable(x, y, PVP_ARENA.z) || g.world.linkAt(x, y, PVP_ARENA.z)) return false;
    const who = this.occ.get(y * g.world.width + x);
    return who === undefined || who === selfId;
  }

  /** Who stands where in and around the arena (bots every tick, everyone else from the once-a-second list). */
  private rebuildOccupancy(): void {
    const W = this.game.world.width;
    this.occ.clear();
    for (const o of this.outsiders) this.occ.set(o.y * W + o.x, -2);
    for (const b of this.bots) {
      const p = b.s.player;
      if (!p.dead) this.occ.set(p.y * W + p.x, p.id);
    }
  }

  /**
   * Shortest route inside the arena (8 directions, no corner cutting, around
   * anyone standing in the way) to the tile, or next to it with `adjacent`. A
   * tiny breadth-first search over the arena only, so it can never lead out of
   * it or through a protection zone.
   */
  private route(b: ArenaBot, tx: number, ty: number, adjacent: boolean): Array<{ x: number; y: number }> | null {
    const A = PVP_ARENA, p = b.s.player;
    const w = A.x1 - A.x0 + 1, h = A.y1 - A.y0 + 1;
    if (!this.inArena(p.x, p.y)) return null;
    const prev = this.prev.length === w * h ? this.prev : (this.prev = new Int16Array(w * h));
    prev.fill(-1);
    const idx = (x: number, y: number) => (y - A.y0) * w + (x - A.x0);
    const start = idx(p.x, p.y);
    prev[start] = start;
    const queue = [start];
    const goal = (x: number, y: number) => adjacent ? chebyshev(x, y, tx, ty) === 1 : x === tx && y === ty;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const cx = (cur % w) + A.x0, cy = Math.floor(cur / w) + A.y0;
      if (cur !== start && goal(cx, cy)) {
        const out: Array<{ x: number; y: number }> = [];
        for (let k = cur; k !== start; k = prev[k]) out.push({ x: (k % w) + A.x0, y: Math.floor(k / w) + A.y0 });
        return out.reverse();
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < A.x0 || nx > A.x1 || ny < A.y0 || ny > A.y1 || prev[idx(nx, ny)] !== -1) continue;
        if (!this.standable(nx, ny, p.id)) continue;
        if (dx && dy && (!this.standable(cx + dx, cy, p.id) || !this.standable(cx, cy + dy, p.id))) continue;
        prev[idx(nx, ny)] = cur;
        queue.push(idx(nx, ny));
      }
    }
    return null;
  }

  /** Feeds the next step of the bot's route to the game, one tile at a time (the game's own pathing never runs). */
  private stepRoute(b: ArenaBot): void {
    const p = b.s.player;
    if (p.moving) return;
    while (b.route.length && b.route[0].x === p.x && b.route[0].y === p.y) b.route.shift();
    const next = b.route[0];
    if (!next) return;
    const dx = next.x - p.x, dy = next.y - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1 || !this.standable(next.x, next.y, p.id)
      || (dx && dy && (!this.standable(p.x + dx, p.y, p.id) || !this.standable(p.x, p.y + dy, p.id)))) {
      b.route = [];
      return;
    }
    p.path = [];
    (b.s.intent as BufferedIntent).queued = { dx, dy };
  }

  private placeAtHome(b: ArenaBot): void {
    const p = b.s.player;
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = b.home.x + dx, y = b.home.y + dy;
        if (this.standable(x, y, p.id)) {
          this.game.teleport(p, x, y, PVP_ARENA.z);
          return;
        }
      }
    }
    this.game.teleport(p, b.home.x, b.home.y, PVP_ARENA.z);
  }

  /** Walks to a tile (or next to it) inside the arena. */
  private walkTo(b: ArenaBot, x: number, y: number, adjacent = false): void {
    const dest = b.route[b.route.length - 1];
    if (dest && (adjacent ? chebyshev(dest.x, dest.y, x, y) === 1 : dest.x === x && dest.y === y)) return;
    b.route = this.route(b, x, y, adjacent) ?? [];
  }

  // ------------------------------------------------------------------ supplies

  private restock(b: ArenaBot): void {
    const s = b.s;
    const inv = s.inventory;
    const { gear } = arenaKit(s.player.vocation, b.level);
    for (const slot of Object.keys(inv.equipment) as EquipSlot[]) inv.equipment[slot] = gear[slot] ? { ...gear[slot]! } : null;
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
    for (const [id, qty] of arenaSupplies(s.player.vocation, b.level)) inv.add(id, qty);
    this.game.refreshStats(s);
    s.player.hp = s.player.maxHp;
    s.player.mana = s.player.maxMana;
    this.game.events.emit({ type: 'inventoryChanged', to: s.id });
    this.game.events.emit({ type: 'equipmentChanged', id: s.id });
  }

  private slotOf(b: ArenaBot, id: string): number {
    const inv = b.s.inventory;
    const n = inv.size();
    for (let i = 0; i < n; i++) if (inv.slots[i]?.id === id) return i;
    return -1;
  }

  // ------------------------------------------------------------------ main loop

  update(dt: number): void {
    const g = this.game;
    this.t += dt;
    this.outsiderTimer -= dt;
    if (this.outsiderTimer <= 0) {
      this.outsiderTimer = 1;
      this.refreshOutsiders();
    }
    this.rebuildOccupancy();
    for (const b of this.bots) {
      const p = b.s.player;
      if (!g.sessions.has(b.s.id)) continue;
      // never marked: no skull means a death never drops the backpack
      p.whiteSkullUntil = 0;
      p.redSkullUntil = 0;
      if (p.unjustKills.length) p.unjustKills.length = 0;
      if (p.dead) {
        if (!b.dead) this.onDeath(b);
        continue;
      }
      if (b.dead) {
        this.onRespawn(b);
        continue;
      }
      b.heal -= dt;
      if (b.heal <= 0) {
        b.heal = HEAL_EVERY;
        this.healStep(b);
      }
      this.comboStep(b);
      this.stepRoute(b);
      b.think -= dt;
      if (b.think <= 0) {
        b.think = PVP_THINK + rand(0, 0.25);
        this.think(b);
      }
    }
    for (const team of this.teams) {
      if (this.t >= team.nextCall) {
        team.nextCall = this.t + 0.5;
        this.callFocus(team);
      }
      if (team.comboAt > 0 && this.t > team.comboAt + COMBO_WINDOW) {
        if (team.comboFired.size >= 2) this.stats.combos++;
        team.comboAt = 0;
        team.comboTarget = null;
        team.nextCombo = this.t + rand(5, 9);
      }
    }
  }

  private refreshOutsiders(): void {
    const g = this.game, A = PVP_ARENA, M = 8;
    const near = (x: number, y: number, z: number) => z === A.z && x >= A.x0 - M && x <= A.x1 + M && y >= A.y0 - M && y <= A.y1 + M;
    const out: typeof this.outsiders = [];
    for (const e of g.enemies) if (!e.dead && near(e.x, e.y, e.z)) out.push({ x: e.x, y: e.y, z: e.z, ok: false });
    for (const n of g.npcs) if (near(n.x, n.y, n.z)) out.push({ x: n.x, y: n.y, z: n.z, ok: true });
    for (const s of g.sessions.values()) {
      const p = s.player;
      if (p.dead || this.ids.has(p.id) || !near(p.x, p.y, p.z)) continue;
      // someone in a protection zone cannot be hurt anyway
      out.push({ x: p.x, y: p.y, z: p.z, ok: g.world.isSafe(p.x, p.y, p.z) });
    }
    this.outsiders = out;
  }

  /** No monster, real player or other bot in (or right next to) a blast of radius r around (cx, cy). */
  private areaClear(cx: number, cy: number, r: number): boolean {
    for (const o of this.outsiders) if (!o.ok && inAreaShape(o.x - cx, o.y - cy, r + 1)) return false;
    // a monster or player that walked in since the last refresh
    for (const e of this.game.enemies) if (!e.dead && e.z === PVP_ARENA.z && Math.abs(e.x - cx) <= r + 1 && Math.abs(e.y - cy) <= r + 1) return false;
    return true;
  }

  private nearHuman(x: number, y: number, r: number): boolean {
    for (const s of this.game.sessions.values()) {
      const p = s.player;
      if (!p.dead && !this.ids.has(p.id) && p.z === PVP_ARENA.z && chebyshev(p.x, p.y, x, y) <= r) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ death and respawn

  private onDeath(b: ArenaBot): void {
    const p = b.s.player;
    b.dead = true;
    this.stats.deaths++;
    p.respawnTimer = rand(PVP_RESPAWN_MIN, PVP_RESPAWN_MAX);
    const killer = b.lastHitBy !== null && this.t - b.lastHitAt < 10 ? b.lastHitBy : null;
    if (killer !== null) {
      this.teams[killer].score++;
      this.stats.kills[killer]++;
      const team = this.teams[killer];
      const total = this.teams[0].score + this.teams[1].score;
      const speaker = team.members.find((m) => !m.s.player.dead);
      if (speaker && (total % 3 === 0 || Math.random() < 0.5)) this.chat(team, speaker, Math.random() < 0.5 ? this.scoreLine() : `${shortName(p.name)} is down! ${this.scoreLine()}`, true);
    }
    for (const t of this.teams) if (t.focusId === p.id) t.focusId = null;
  }

  private onRespawn(b: ArenaBot): void {
    const p = b.s.player;
    b.dead = false;
    b.lastHitBy = null;
    // the arena costs nothing: level and experience come back
    p.level = b.level;
    p.exp = expForLevel(b.level);
    this.restock(b);
    this.placeAtHome(b);
    p.path = [];
    b.route = [];
    p.targetId = null;
  }

  // ------------------------------------------------------------------ team tactics

  private alive(team: Team): ArenaBot[] {
    return team.members.filter((m) => !m.dead && !m.s.player.dead && this.inArena(m.s.player.x, m.s.player.y, m.s.player.z));
  }

  private centroid(list: ArenaBot[]): { x: number; y: number } | null {
    if (!list.length) return null;
    let x = 0, y = 0;
    for (const m of list) { x += m.s.player.x; y += m.s.player.y; }
    return { x: x / list.length, y: y / list.length };
  }

  /** Lower is a better target: low health, a mage, out of position, close to us, light armour. */
  private targetScore(t: ArenaBot, ours: { x: number; y: number }, theirs: { x: number; y: number }): number {
    const p = t.s.player;
    const hp = p.hp / Math.max(1, p.maxHp);
    const mage = p.vocation === 'sorcerer' || p.vocation === 'druid';
    const away = Math.hypot(p.x - theirs.x, p.y - theirs.y);
    const dist = Math.hypot(p.x - ours.x, p.y - ours.y);
    return hp * 100 + (mage ? -12 : 0) + (away >= 4 ? -18 : 0) + dist * 4 + this.game.armor(t.s) * 0.5 + (p.buffs.magicShield > 0 ? 15 : 0) + rand(0, 8);
  }

  private callFocus(team: Team): void {
    const ours = this.alive(team), theirs = this.alive(this.teams[1 - team.id]);
    if (!ours.length || !theirs.length) {
      team.focusId = null;
      return;
    }
    const oc = this.centroid(ours)!, ec = this.centroid(theirs)!;
    const cur = theirs.find((m) => m.s.id === team.focusId) ?? null;
    let swap = !cur;
    if (cur) {
      const p = cur.s.player;
      const hp = p.hp / p.maxHp;
      team.focusLow = Math.min(team.focusLow, hp);
      // healed out of danger, or ran off: pick someone else
      if (team.focusLow < 0.45 && hp > 0.85 && this.t - team.focusSince > 4) swap = true;
      const far = Math.hypot(p.x - oc.x, p.y - oc.y) > 8;
      if (far && team.farSince < 0) team.farSince = this.t;
      if (!far) team.farSince = -1;
      if (team.farSince >= 0 && this.t - team.farSince > 2.5) swap = true;
    }
    let best = cur, bestScore = cur ? this.targetScore(cur, oc, ec) : Infinity;
    for (const m of theirs) {
      if (m === cur) continue;
      const sc = this.targetScore(m, oc, ec);
      // stick to the current focus unless the new one is clearly better
      if (sc < bestScore - (swap ? 0 : 25)) { best = m; bestScore = sc; }
    }
    if (swap && best === cur) {
      best = theirs.filter((m) => m !== cur).sort((a, b) => this.targetScore(a, oc, ec) - this.targetScore(b, oc, ec))[0] ?? cur;
    }
    if (!best) return;
    if (best.s.id !== team.focusId) {
      team.focusId = best.s.id;
      team.focusSince = this.t;
      team.focusLow = best.s.player.hp / best.s.player.maxHp;
      team.farSince = -1;
      if (team.comboAt > 0) team.comboTarget = best.s.id;
      const caller = ours[0];
      if (Math.random() < 0.4) this.chat(team, caller, pick([`focus ${shortName(best.s.player.name)}!`, `on ${shortName(best.s.player.name)}`, `${shortName(best.s.player.name)}, now`]));
    }
    // plan the next combo: a short countdown, then everyone fires together
    if (team.comboAt === 0 && this.t >= team.nextCombo) {
      team.comboAt = this.t + PVP_COMBO_DELAY;
      team.comboTarget = team.focusId;
      team.comboFired = new Set();
      if (Math.random() < 0.35) this.chat(team, ours[0], `combo on ${shortName(best.s.player.name)}, 3... 2... 1...`);
    }
  }

  private inHold(team: Team): boolean {
    return team.comboAt > 0 || (team.focusId !== null && team.nextCombo - this.t < COMBO_HOLD);
  }

  private comboStep(b: ArenaBot): void {
    const team = this.teams[b.team];
    if (team.comboAt <= 0 || this.t < team.comboAt || team.comboFired.has(b.s.id) || team.comboTarget === null) return;
    const t = this.game.getPlayer(team.comboTarget);
    if (!t || t.dead) return;
    if (this.strongAttack(b, t)) team.comboFired.add(b.s.id);
  }

  // ------------------------------------------------------------------ actions

  private ready(p: Player, id: SpellId): boolean {
    const sp = SPELLS[id];
    return p.level >= sp.level && p.mana >= sp.mana && (p.spellCooldowns[id] ?? 0) <= 0 && p.groupCooldowns[sp.group] <= 0;
  }

  private cast(b: ArenaBot, id: SpellId, param?: string): boolean {
    const p = b.s.player;
    if (!this.ready(p, id)) return false;
    const before = p.mana;
    executeCommand(this.game, p.id, param ? { c: 'cast', spell: id, param } : { c: 'cast', spell: id });
    return p.mana < before || (p.spellCooldowns[id] ?? 0) > 0;
  }

  /** Throws a rune at a creature or a tile; true when it went off. */
  private rune(b: ArenaBot, id: string, at: { x: number; y: number }): boolean {
    const p = b.s.player;
    const d = ITEMS[id];
    if (!d?.rune) return false;
    const grp = d.rune.type === 'heal' || d.rune.type === 'cure' ? 'heal' : 'attack';
    if (p.groupCooldowns[grp] > 0) return false;
    if (chebyshev(p.x, p.y, at.x, at.y) > d.rune.range || !this.game.world.lineOfSight(p.x, p.y, at.x, at.y, p.z)) return false;
    const slot = this.slotOf(b, id);
    if (slot < 0) return false;
    const before = b.s.inventory.count(id);
    executeCommand(this.game, p.id, { c: 'useRuneAt', slot, x: at.x, y: at.y });
    return b.s.inventory.count(id) < before;
  }

  private potion(b: ArenaBot, kind: 'hp' | 'mp'): boolean {
    const p = b.s.player;
    if (p.groupCooldowns.potion > 0) return false;
    const ids = kind === 'hp' ? ['great_health_potion', 'strong_health_potion', 'health_potion'] : ['great_mana_potion', 'strong_mana_potion', 'mana_potion'];
    for (const id of ids) {
      if (b.s.inventory.count(id) <= 0) continue;
      executeCommand(this.game, p.id, { c: 'useItem', item: id });
      return p.groupCooldowns.potion > 0;
    }
    return false;
  }

  private inReach(p: Player, t: Player, range: number): boolean {
    return chebyshev(p.x, p.y, t.x, t.y) <= range && this.game.canSee(p, t);
  }

  private aim(b: ArenaBot, t: Player): void {
    const p = b.s.player;
    if (p.targetId !== t.id) executeCommand(this.game, p.id, { c: 'attack', id: t.id });
  }

  /** The hardest single hit this bot has ready (the combo shot). */
  private strongAttack(b: ArenaBot, t: Player): boolean {
    const p = b.s.player;
    if (p.groupCooldowns.attack > 0) return false;
    this.aim(b, t);
    switch (p.vocation) {
      case 'sorcerer':
        if (this.rune(b, 'death_rune', t)) return true;
        return this.inReach(p, t, 3) && (this.cast(b, 'exori_mort') || this.cast(b, 'exori_vis'));
      case 'druid': {
        // a dying teammate comes first
        if (this.alive(this.teams[b.team]).some((m) => m.s.player.hp < m.s.player.maxHp * 0.3)) return false;
        if (this.rune(b, 'death_rune', t)) return true;
        return this.inReach(p, t, 3) && (this.cast(b, 'exori_frigo') || this.cast(b, 'exori_tera'));
      }
      case 'paladin':
        if (this.inReach(p, t, 4) && this.cast(b, 'exori_san')) return true;
        if (this.inReach(p, t, 7) && this.cast(b, 'exori_con')) return true;
        return this.rune(b, 'sunlance_rune', t);
      case 'knight':
        if (this.inReach(p, t, 5) && this.cast(b, 'exori_hur')) return true;
        if (chebyshev(p.x, p.y, t.x, t.y) <= 1 && this.areaClear(p.x, p.y, 1) && this.cast(b, 'exori')) return true;
        return false;
    }
  }

  private healStep(b: ArenaBot): void {
    const p = b.s.player;
    const hp = p.hp / p.maxHp, mp = p.mana / Math.max(1, p.maxMana);
    const mage = p.vocation === 'sorcerer' || p.vocation === 'druid';
    // potions (their own cooldown)
    if (hp < b.potionAt) this.potion(b, 'hp') || (mp < 0.9 && this.potion(b, 'mp'));
    else if (mp < (mage ? 0.55 : 0.35)) this.potion(b, 'mp');
    // magic shield when the enemy is on us
    if (mage && hp < 0.5 && p.buffs.magicShield <= 0 && this.teams[1 - b.team].focusId === p.id) this.cast(b, 'utamo_vita');
    if (p.groupCooldowns.heal > 0) return;
    const team = this.teams[b.team];
    // druids look after the team first
    if (p.vocation === 'druid' && hp > 0.45) {
      const mates = this.alive(team).filter((m) => m !== b);
      const hurt = mates.filter((m) => m.s.player.hp < m.s.player.maxHp * 0.75 && chebyshev(m.s.player.x, m.s.player.y, p.x, p.y) <= 4);
      if (hurt.length >= 2 && this.cast(b, 'exura_gran_mas_res')) { this.stats.teamHeals++; return; }
      const low = mates.filter((m) => m.s.player.hp < m.s.player.maxHp * 0.6 && this.inReach(p, m.s.player, 7))
        .sort((a, c) => a.s.player.hp / a.s.player.maxHp - c.s.player.hp / c.s.player.maxHp)[0];
      if (low) {
        if (this.cast(b, 'exura_sio', low.s.player.name) || this.rune(b, 'healing_rune', low.s.player)) { this.stats.teamHeals++; return; }
      }
    }
    if (hp < b.healAt) {
      const ok = p.vocation === 'knight' ? this.cast(b, 'exura_ico')
        : p.vocation === 'paladin' ? (hp < 0.45 && this.cast(b, 'exura_san')) || this.cast(b, 'exura_gran')
        : this.cast(b, 'exura_vita') || this.rune(b, 'healing_rune', p) || this.cast(b, 'exura_gran');
      if (ok) { this.stats.heals++; return; }
    }
    // anyone with a mending rune helps a teammate close to death
    if (p.vocation !== 'druid' && b.s.inventory.count('healing_rune') > 0) {
      const dying = this.alive(team).find((m) => m !== b && m.s.player.hp < m.s.player.maxHp * 0.3 && this.inReach(p, m.s.player, 5));
      if (dying && this.rune(b, 'healing_rune', dying.s.player)) this.stats.teamHeals++;
    }
  }

  private think(b: ArenaBot): void {
    const g = this.game;
    const p = b.s.player;
    // outside the arena (should not happen): walk back
    if (!this.inArena(p.x, p.y, p.z)) {
      if (p.z !== PVP_ARENA.z || chebyshev(p.x, p.y, b.home.x, b.home.y) > 30) this.placeAtHome(b);
      else if (!p.path.length) g.commandMoveTo(p.id, b.home.x, b.home.y, 1500);
      return;
    }
    const team = this.teams[b.team], foes = this.teams[1 - b.team];
    const enemies = this.alive(foes);
    const focus = team.focusId !== null ? enemies.find((m) => m.s.id === team.focusId)?.s.player ?? null : null;
    if (!enemies.length || !focus) {
      if (p.targetId !== null) executeCommand(g, p.id, { c: 'clearTarget' });
      if (chebyshev(p.x, p.y, b.home.x, b.home.y) > 2 && !b.route.length) this.walkTo(b, b.home.x, b.home.y, true);
      return;
    }
    this.aim(b, focus);
    if (!this.inHold(team)) this.freeAttack(b, focus, enemies);
    this.support(b, focus, enemies);
    this.position(b, focus, enemies);
  }

  /** Attacks between combos: area attacks when enemies bunch up, otherwise the focus. */
  private freeAttack(b: ArenaBot, focus: Player, enemies: ArenaBot[]): void {
    const p = b.s.player;
    if (p.groupCooldowns.attack > 0) return;
    const ep = enemies.map((m) => m.s.player);
    const around = (cx: number, cy: number, r: number) => ep.filter((e) => inAreaShape(e.x - cx, e.y - cy, r) && this.game.world.lineOfSight(cx, cy, e.x, e.y, p.z)).length;
    const bestBlast = (r: number) => {
      let best: { x: number; y: number; n: number } | null = null;
      for (const e of ep) {
        const n = around(e.x, e.y, r);
        if (n >= 2 && (!best || n > best.n) && this.areaClear(e.x, e.y, r)) best = { x: e.x, y: e.y, n };
      }
      return best;
    };
    const area = () => { this.stats.areaAttacks++; return true; };
    switch (p.vocation) {
      case 'sorcerer': {
        if (around(p.x, p.y, 5) >= 3 && this.areaClear(p.x, p.y, 5) && p.mana > 1400 && (this.cast(b, 'exevo_gran_mas_flam') || this.cast(b, 'exevo_gran_mas_vis')) && area()) return;
        const blast = bestBlast(3);
        if (blast && Math.random() < 0.6 && this.rune(b, 'fireball_rune', blast) && area()) return;
        if (this.rune(b, 'death_rune', focus)) return;
        if (p.mana > 400 && this.inReach(p, focus, 3)) this.cast(b, 'exori_mort');
        return;
      }
      case 'druid': {
        if (this.alive(this.teams[b.team]).some((m) => m.s.player.hp < m.s.player.maxHp * 0.45)) return; // healing first
        if (around(p.x, p.y, 5) >= 3 && this.areaClear(p.x, p.y, 5) && p.mana > 1200 && (this.cast(b, 'exevo_gran_mas_frigo') || this.cast(b, 'exevo_gran_mas_tera')) && area()) return;
        const blast = bestBlast(3);
        if (blast && Math.random() < 0.6 && this.rune(b, 'avalanche_rune', blast) && area()) return;
        if (Math.random() < 0.7) this.rune(b, 'death_rune', focus);
        return;
      }
      case 'paladin':
        if (around(p.x, p.y, 3) >= 2 && this.areaClear(p.x, p.y, 3) && this.cast(b, 'exevo_mas_san') && area()) return;
        if (this.inReach(p, focus, 4) && p.mana > 300 && this.cast(b, 'exori_san')) return;
        if (this.inReach(p, focus, 7) && this.cast(b, 'exori_con')) return;
        if (Math.random() < 0.5) this.rune(b, 'sunlance_rune', focus);
        return;
      case 'knight': {
        const adj = ep.filter((e) => chebyshev(e.x, e.y, p.x, p.y) <= 1).length;
        if (adj >= 2 && this.areaClear(p.x, p.y, 2)) {
          if ((this.cast(b, 'exori_gran') || this.cast(b, 'exori_mas') || this.cast(b, 'exori')) && area()) return;
        }
        if (this.inReach(p, focus, 5) && p.mana > 120) this.cast(b, 'exori_hur');
        return;
      }
    }
  }

  /** Haste for the chaser, magic walls in front of the enemy knight, strong haste to get away. */
  private support(b: ArenaBot, focus: Player, enemies: ArenaBot[]): void {
    const p = b.s.player;
    const team = this.teams[b.team];
    if (p.vocation === 'knight') {
      if (chebyshev(p.x, p.y, focus.x, focus.y) >= 3 && p.buffs.haste <= 0) this.cast(b, 'utani_hur');
      return;
    }
    const knight = enemies.find((m) => m.s.player.vocation === 'knight')?.s.player ?? null;
    if (!knight) return;
    const mage = p.vocation === 'sorcerer' || p.vocation === 'druid';
    if (mage && chebyshev(knight.x, knight.y, p.x, p.y) <= 2 && p.hp < p.maxHp * 0.6 && p.buffs.strongHaste <= 0) this.cast(b, 'utani_gran_hur');
    // magic wall between the enemy knight and the teammate it is chasing
    if (this.t < team.nextWall || this.inHold(team) || p.groupCooldowns.attack > 0 || b.s.inventory.count('arcane_wall_rune') <= 0) return;
    const enemyFocus = this.teams[1 - b.team].focusId;
    for (const m of this.alive(team)) {
      const mp = m.s.player;
      const weak = mp.vocation === 'sorcerer' || mp.vocation === 'druid' || mp.hp < mp.maxHp * 0.5;
      const chased = knight.targetId === mp.id || enemyFocus === mp.id;
      const d = chebyshev(knight.x, knight.y, mp.x, mp.y);
      if (!weak || !chased || d < 2 || d > 3) continue;
      const wx = mp.x + Math.sign(knight.x - mp.x), wy = mp.y + Math.sign(knight.y - mp.y);
      // never wall anyone in who is not part of the fight
      if (!this.standable(wx, wy, -1) || this.nearHuman(wx, wy, 4)) continue;
      if (this.rune(b, 'arcane_wall_rune', { x: wx, y: wy })) {
        this.stats.walls++;
        team.nextWall = this.t + rand(7, 11);
        if (Math.random() < 0.4) this.chat(team, b, `wall on ${shortName(knight.name)}`);
        return;
      }
    }
  }

  /** Knights close in; the others keep their distance, stay in range and near the team; hurt members fall back. */
  private position(b: ArenaBot, focus: Player, enemies: ArenaBot[]): void {
    const g = this.game;
    const p = b.s.player;
    const hp = p.hp / p.maxHp;
    const ours = this.alive(this.teams[b.team]);
    const oc = this.centroid(ours)!, ec = this.centroid(enemies)!;
    // outnumbered (someone of ours is still waiting to come back): fall back to our side and fight from there
    const mates = this.teams[b.team].members;
    const homeSpot = { x: mates.reduce((a, m) => a + m.home.x, 0) / mates.length, y: mates.reduce((a, m) => a + m.home.y, 0) / mates.length };
    const regroup = ours.length < enemies.length;
    if (p.vocation === 'knight' && hp > 0.3) {
      // the knight guards the team instead of diving in alone
      const tooFar = regroup && Math.hypot(focus.x - homeSpot.x, focus.y - homeSpot.y) > 6;
      if (tooFar) {
        if (Math.hypot(p.x - homeSpot.x, p.y - homeSpot.y) > 3) this.walkTo(b, Math.round(homeSpot.x), Math.round(homeSpot.y), true);
      } else if (chebyshev(p.x, p.y, focus.x, focus.y) > 1) this.walkTo(b, focus.x, focus.y, true);
      else b.route = [];
      return;
    }
    if (b.route.length > 1) return;
    const knights = enemies.filter((m) => m.s.player.vocation === 'knight').map((m) => m.s.player);
    const threats = knights.length ? knights : enemies.map((m) => m.s.player);
    const keep = p.vocation === 'paladin' ? 3 : 4;
    const reach = p.vocation === 'paladin' ? 4 : 5;
    const retreat = hp < 0.35;
    const score = (x: number, y: number): number => {
      let s = 0;
      for (const k of threats) {
        const d = chebyshev(x, y, k.x, k.y);
        if (d < keep) s -= (keep - d) * 10;
      }
      const df = chebyshev(x, y, focus.x, focus.y);
      if (df > reach) s -= (df - reach) * 6;
      if (!g.world.lineOfSight(x, y, focus.x, focus.y, p.z)) s -= 8;
      s -= Math.max(0, Math.hypot(x - oc.x, y - oc.y) - 3) * 3;
      if (retreat) s += Math.hypot(x - ec.x, y - ec.y) * 4;
      if (regroup) s -= Math.hypot(x - homeSpot.x, y - homeSpot.y) * 1.5;
      return s;
    };
    let best = { x: p.x, y: p.y }, bestScore = score(p.x, p.y) + 1.5;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (!dx && !dy) continue;
      const x = p.x + dx, y = p.y + dy;
      if (!this.standable(x, y, p.id)) continue;
      const sc = score(x, y) - Math.max(Math.abs(dx), Math.abs(dy)) * 0.7 + rand(0, 1);
      if (sc > bestScore) { best = { x, y }; bestScore = sc; }
    }
    if (best.x !== p.x || best.y !== p.y) this.walkTo(b, best.x, best.y);
  }

  private chat(team: Team, b: ArenaBot, text: string, force = false): void {
    if (!force && this.t < team.nextChat) return;
    team.nextChat = this.t + 5;
    this.game.say(b.s.player.id, text);
  }
}

/** "Varric [Red Bot]" → "Varric". */
function shortName(name: string): string {
  return name.replace(/\s*\[.*\]$/, '');
}

/** Used by the server log and tests. */
export function isArenaTile(game: Game, x: number, y: number, z: number): boolean {
  const A = PVP_ARENA;
  return z === A.z && x >= A.x0 && x <= A.x1 && y >= A.y0 && y <= A.y1 && !game.world.isSafe(x, y, z);
}
