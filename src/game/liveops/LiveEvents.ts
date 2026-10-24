import { chebyshev } from '../core/types';
import { randInt } from '../core/rng';
import { RAIDS, WORLD_BOSSES, type Spot, type WorldBossDef } from '../bosses/bosses';
import { bossTitle } from '../bosses/WorldEvents';
import type { Enemy } from '../enemies/Enemy';
import type { Game, Session } from '../Game';
import type { ItemDef, ItemStack } from '../inventory/items';
import { TOWNS } from '../world/townList';
import { onIsle } from '../world/tutorialIsle';
import type { Region } from '../world/WorldMap';
import {
  calendarEntries, DOUBLE_HOURS, noticeMs, RANDOM_TREASURE_INTERVAL, TREASURE_MS, type CalendarEntry, type LiveKind,
} from './calendar';
import { FEST_BOSS_LIFETIME, FESTIVAL_BY_ID, festivalByDate, festivalDropChance, festivalWindow, GUISE_MINUTES, type FestivalDef } from './festivals';
import { GUISES } from './liveItems';

/** Hidden caches in a treasure hunt. */
export const TREASURE_CACHES = 6;
/** Seconds between two "Seek" uses of one player. */
export const SEEK_COOLDOWN = 2;
/** Seals in a treasure cache. */
export const CACHE_SEALS = 4;
/** One of these lies in every cache, with the gold: [item id, amount]. */
export const CACHE_LOOT: Array<[string, number]> = [
  ['small_ruby', 1], ['small_sapphire', 1], ['small_emerald', 1], ['small_diamond', 1], ['golden_goblet', 1], ['strong_health_potion', 5], ['strong_mana_potion', 5],
];
/** Tags of monsters that come with world events (never allowed on the tutorial island). */
const EVENT_TAGS = new Set(['raid', 'worldboss', 'festival']);

export interface TreasureCache {
  x: number;
  y: number;
  z: number;
  region: string;
  /** Name of who dug it up, or null while it is hidden. */
  found: string | null;
}

/**
 * The active events and the calendar for clients (snapshot `lv`, sent when it changes).
 * `a`: [kind, id, ends (ms, 0 = open-ended), number (caches left, raid wave…)].
 * `c`: the calendar for the next 7 days: [at (ms), kind, id].
 * `tr`: regions where caches are still hidden. `t`: the server's clock when built.
 */
export interface LiveView {
  t: number;
  a: Array<[LiveKind, string, number, number]>;
  c: Array<[number, LiveKind, string]>;
  tr?: string[];
}

interface Double {
  until: number;
  by: string;
}

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;
/** "The trail leads …" sentences, one per direction (each is translated whole). */
const TRAIL: Record<(typeof DIRS)[number], string> = {
  'east': 'The trail leads east, about {n} tiles away.',
  'south-east': 'The trail leads south-east, about {n} tiles away.',
  'south': 'The trail leads south, about {n} tiles away.',
  'south-west': 'The trail leads south-west, about {n} tiles away.',
  'west': 'The trail leads west, about {n} tiles away.',
  'north-west': 'The trail leads north-west, about {n} tiles away.',
  'north': 'The trail leads north, about {n} tiles away.',
  'north-east': 'The trail leads north-east, about {n} tiles away.',
};

/**
 * World events beyond the random world bosses and raids (`Game.liveEvents`):
 * the calendar (liveops/calendar.ts) with scheduled raids, announced world bosses
 * and treasure hunts; seasonal festivals (token drops, a mini-boss at a town, costume
 * and cape rewards); double experience / double skill set by a game master; random
 * treasure hunts. Server-authoritative; nothing here is saved (after a restart the
 * calendar simply carries on, and a game master's double weekend must be started
 * again). Raids and world bosses themselves still run in bosses/WorldEvents.ts.
 */
export class LiveEvents {
  private lastWall: number;
  private tick = 0;
  /** Game-clock seconds to the next random treasure hunt. */
  private nextRandomTreasure: number;
  private doubles: { exp: Double | null; skill: Double | null } = { exp: null, skill: null };
  /** Game master's festival switch: null = follow the calendar. */
  private festOverride: { on: true; id: string } | { on: false } | null = null;
  private lastFestival: string | null = null;
  treasure: { caches: TreasureCache[]; ends: number } | null = null;
  private seekReady = new Map<number, number>();
  miniboss: { enemy: Enemy; festival: string; town: string; ends: number } | null = null;
  /** A world boss the calendar announced: it wakes at `at` (ms). */
  private pendingBoss: { def: WorldBossDef; spot: Spot; at: number } | null = null;
  /** Online mirror: what the server last sent, and the difference between its clock and ours. */
  private net: LiveView | null = null;
  private offset = 0;
  private cache: { time: number; view: LiveView } | null = null;
  private calCache: { minute: number; c: LiveView['c'] } | null = null;

  constructor(private readonly game: Game) {
    this.lastWall = game.now();
    this.lastFestival = this.festival()?.id ?? null;
    this.nextRandomTreasure = RANDOM_TREASURE_INTERVAL[0] + Math.random() * (RANDOM_TREASURE_INTERVAL[1] - RANDOM_TREASURE_INTERVAL[0]);
  }

  // ================================================================ rates and festivals

  /** Multiplier on character experience from monsters, quests and raids (double experience). */
  expRate(): number {
    const d = this.doubles.exp;
    return d && d.until > this.game.now() ? 2 : 1;
  }

  /** Multiplier on skill training, combat and trade skills alike (double skill). */
  skillRate(): number {
    const d = this.doubles.skill;
    return d && d.until > this.game.now() ? 2 : 1;
  }

  /** The festival on right now (by date, or a game master's switch), if any. */
  festival(): FestivalDef | null {
    const o = this.festOverride;
    if (o) return o.on ? FESTIVAL_BY_ID[o.id] ?? null : null;
    if (!this.game.simulate) {
      const f = this.net?.a.find((e) => e[0] === 'festival');
      return f ? FESTIVAL_BY_ID[f[1]] ?? null : null;
    }
    return festivalByDate(this.game.now());
  }

  // ================================================================ the clock

  update(dt: number): void {
    const g = this.game;
    if (!g.simulate) return;
    this.nextRandomTreasure -= dt;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    const now = g.now();
    // a server that slept (no players) does not catch up on what it missed
    const from = Math.max(this.lastWall, now - 120_000);
    if (now > from) this.fire(from, now);
    this.lastWall = now;

    // festivals: begin and end by the date
    const f = this.festival();
    if ((f?.id ?? null) !== this.lastFestival) {
      if (f) g.announce(f.name, f.begins, 'festival', true);
      else if (this.lastFestival) g.announce(FESTIVAL_BY_ID[this.lastFestival]?.name ?? 'Festival', 'The festival is over. Thank you for celebrating!', 'festival', false);
      this.lastFestival = f?.id ?? null;
    }
    for (const k of ['exp', 'skill'] as const) {
      const d = this.doubles[k];
      if (d && d.until <= now) {
        this.doubles[k] = null;
        g.announce(k === 'exp' ? 'Double experience' : 'Double skill', k === 'exp' ? 'Double experience is over.' : 'Double skill training is over.', 'event', false);
      }
    }
    if (this.treasure && this.treasure.ends <= now) this.endTreasure(false);
    if (!this.treasure && this.nextRandomTreasure <= 0) {
      this.startTreasure(TREASURE_MS);
      this.nextRandomTreasure = RANDOM_TREASURE_INTERVAL[0] + Math.random() * (RANDOM_TREASURE_INTERVAL[1] - RANDOM_TREASURE_INTERVAL[0]);
    }
    const mb = this.miniboss;
    if (mb && (mb.enemy.gone || mb.ends <= now)) {
      if (!mb.enemy.dead && !mb.enemy.gone) {
        g.despawnEnemy(mb.enemy);
        const boss = bossTitle(mb.enemy.enemyKind), town = mb.town;
        g.announce(FESTIVAL_BY_ID[mb.festival]?.name ?? 'Festival', `${boss} slinks away from ${town}.`, 'festival', false);
      }
      this.miniboss = null;
    }
    // world-event monsters never set foot on Wayfarer's Isle, where the new players are
    for (const e of g.enemies) if (e.dynamic && !e.dead && !e.gone && !!e.tag && EVENT_TAGS.has(e.tag) && onIsle(e.x, e.y, e.z)) g.despawnEnemy(e);
  }

  /** Runs every calendar warning and start that falls in (from, to]. */
  private fire(from: number, to: number): void {
    const ids = RAIDS.map((r) => r.id);
    for (const e of calendarEntries(from - 3_600_000, to + 3_600_000, ids, WORLD_BOSSES.length)) {
      const lead = noticeMs(e.kind);
      const notice = e.at - lead;
      if (lead > 0 && notice > from && notice <= to) this.notice(e);
      if (e.at > from && e.at <= to) this.begin(e);
    }
    const pb = this.pendingBoss;
    if (pb && pb.at <= to) {
      this.pendingBoss = null;
      if (!this.game.worldEvents.worldBoss) this.game.worldEvents.startWorldBoss(pb.def, pb.spot);
    }
  }

  private notice(e: CalendarEntry): void {
    const g = this.game;
    switch (e.kind) {
      case 'raid': {
        // the raid's own five-minute warning is the notice
        const def = RAIDS.find((r) => r.id === e.id);
        if (def && !g.worldEvents.raid) g.worldEvents.startRaid(def);
        return;
      }
      case 'worldboss': {
        const def = WORLD_BOSSES[Number(e.id)];
        if (!def || g.worldEvents.worldBoss || this.pendingBoss) return;
        const spot = def.spots[Math.floor(Math.random() * def.spots.length)];
        this.pendingBoss = { def, spot, at: e.at };
        const boss = bossTitle(def.kind), place = spot.name;
        g.announce('A world boss stirs', `${boss} will awaken near ${place} in 10 minutes!`, 'worldboss', true);
        return;
      }
      case 'treasure':
        if (!this.treasure) g.announce('Treasure hunt', 'A treasure hunt begins in 5 minutes: caches will be hidden all over the realm.', 'event', false);
        return;
      case 'miniboss': {
        const f = this.festival();
        if (f && f.id === e.id && !this.miniboss) g.announce(f.name, f.coming, 'festival', false);
        return;
      }
    }
  }

  private begin(e: CalendarEntry): void {
    switch (e.kind) {
      case 'treasure':
        if (!this.treasure) this.startTreasure(TREASURE_MS);
        return;
      case 'miniboss': {
        const f = this.festival();
        if (f && f.id === e.id && !this.miniboss) this.startMiniboss(f);
        return;
      }
    }
  }

  // ================================================================ game master switches

  /** Double experience or skill for `hours` (default a weekend: 48 h). */
  startDouble(kind: 'exp' | 'skill', hours = DOUBLE_HOURS, by = 'a game master'): void {
    const g = this.game;
    const h = Math.max(0.1, Math.min(24 * 14, hours));
    this.doubles[kind] = { until: g.now() + h * 3_600_000, by };
    const days = Math.round((h / 24) * 10) / 10, span = Math.round(h * 10) / 10;
    const text = kind === 'exp'
      ? (h >= 24 ? `Double experience from monsters and quests for the next ${days} days!` : `Double experience from monsters and quests for the next ${span} hours!`)
      : (h >= 24 ? `Double skill training, fighting and trade skills alike, for the next ${days} days!` : `Double skill training, fighting and trade skills alike, for the next ${span} hours!`);
    g.announce(kind === 'exp' ? 'Double experience' : 'Double skill', text, 'event', true);
  }

  stopDouble(kind: 'exp' | 'skill'): boolean {
    if (!this.doubles[kind]) return false;
    this.doubles[kind] = null;
    this.game.announce(kind === 'exp' ? 'Double experience' : 'Double skill', kind === 'exp' ? 'Double experience is over.' : 'Double skill training is over.', 'event', false);
    return true;
  }

  /** Game master: festival on (a festival id), off, or back to the calendar ('auto'). */
  setFestival(mode: string): FestivalDef | null | 'auto' {
    if (mode === 'auto') {
      this.festOverride = null;
      return 'auto';
    }
    if (mode === 'off') {
      this.festOverride = { on: false };
      return null;
    }
    const f = FESTIVAL_BY_ID[mode];
    if (!f) return null;
    this.festOverride = { on: true, id: f.id };
    return f;
  }

  // ================================================================ treasure hunts

  private cacheRegions(): Region[] {
    const g = this.game;
    return g.world.regions.filter((r) => {
      // out in the wilds: never a town (its streets are not a protection zone everywhere) or a small place
      if (r.safe || r.z0 > 0 || r.z1 < 0 || (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) < 100 || TOWNS.some((t) => t.name === r.name)) return false;
      const cx = (r.x0 + r.x1) >> 1, cy = (r.y0 + r.y1) >> 1;
      const lvl = Number(/(\d+)/.exec(r.level ?? '')?.[1] ?? NaN);
      return !onIsle(cx, cy, 0) && !g.premiumLand(cx, cy) && Number.isFinite(lvl) && lvl <= 80;
    });
  }

  /** An open surface tile in a region where a cache may lie (bounded tries). */
  private cacheTile(r: Region): { x: number; y: number } | null {
    const w = this.game.world;
    for (let i = 0; i < 200; i++) {
      const x = randInt(r.x0, r.x1), y = randInt(r.y0, r.y1);
      if (!w.inBounds(x, y) || !w.isWalkable(x, y, 0) || w.isSafe(x, y, 0) || w.linkAt(x, y, 0) || onIsle(x, y, 0) || this.game.premiumLand(x, y)) continue;
      if (w.regionAt(x, y, 0)?.safe) continue;
      return { x, y };
    }
    return null;
  }

  /** Hides the caches and tells everyone. Returns false when a hunt is already on or no place was found. */
  startTreasure(ms = TREASURE_MS): boolean {
    if (this.treasure) return false;
    const g = this.game;
    const regions = [...this.cacheRegions()].sort(() => Math.random() - 0.5);
    const caches: TreasureCache[] = [];
    for (const r of regions) {
      if (caches.length >= TREASURE_CACHES) break;
      if (caches.some((c) => c.region === r.name)) continue;
      const t = this.cacheTile(r);
      if (t) caches.push({ x: t.x, y: t.y, z: 0, region: r.name, found: null });
    }
    if (!caches.length) return false;
    this.treasure = { caches, ends: g.now() + ms };
    this.seekReady.clear();
    const count = caches.length, minutes = Math.round(ms / 60_000);
    g.announce('Treasure hunt', `${count} treasure caches are hidden across the realm! Open the Events window and use Seek to follow the trail. ${minutes} minutes to find them.`, 'event', true);
    return true;
  }

  endTreasure(gm: boolean): boolean {
    const tr = this.treasure;
    if (!tr) return false;
    this.treasure = null;
    const left = tr.caches.filter((c) => !c.found).length;
    this.game.announce('Treasure hunt', left ? `The treasure hunt is over: ${left} caches stay hidden for another day.` : 'The treasure hunt is over: every cache was found!', 'event', false);
    void gm;
    return true;
  }

  /** "Seek": the direction and distance to the nearest hidden cache; dig it up when standing on or beside it. */
  seek(s: Session): void {
    const g = this.game;
    const tr = this.treasure;
    if (!tr) return g.msg(s.id, 'There is no treasure hunt on just now. The Events window shows when the next one starts.', 'warn');
    const p = s.player;
    if (p.dead) return;
    if ((this.seekReady.get(s.id) ?? 0) > g.time) return;
    this.seekReady.set(s.id, g.time + SEEK_COOLDOWN);
    if (p.z !== 0) return g.msg(s.id, 'The trail cannot be followed from here: the caches lie out in the open, on the surface.', 'warn');
    let best: TreasureCache | null = null, bd = Infinity;
    for (const c of tr.caches) {
      if (c.found) continue;
      const d = chebyshev(c.x, c.y, p.x, p.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return g.msg(s.id, 'Every cache has been found.', 'info');
    if (bd <= 1) return this.dig(s, best, tr);
    const dx = best.x - p.x, dy = best.y - p.y;
    const dir = DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
    const n = bd > 100 ? Math.round(bd / 50) * 50 : bd > 30 ? Math.round(bd / 10) * 10 : bd;
    g.msg(s.id, bd <= 5 ? 'Very close now: dig within a step or two of here.' : TRAIL[dir].replace('{n}', String(n)), 'event');
  }

  private dig(s: Session, c: TreasureCache, tr: { caches: TreasureCache[] }): void {
    const g = this.game;
    const p = s.player;
    c.found = p.name;
    const [id, qty] = CACHE_LOOT[Math.floor(Math.random() * CACHE_LOOT.length)];
    const items: ItemStack[] = [{ id: 'gold', qty: Math.min(20_000, 200 + 25 * p.level) }, { id, qty }];
    const f = this.festival();
    if (f) items.push({ id: f.token, qty: 5 });
    g.events.emit({ type: 'area', x: c.x, y: c.y, z: c.z, radius: 0, effect: 'stone' });
    g.worldEvents.deliver(s, items, 'You dig up a treasure cache');
    g.taskSys.addSeals(s, CACHE_SEALS);
    const seals = CACHE_SEALS;
    g.msg(s.id, `The cache also holds ${seals} task seals.`, 'loot');
    const left = tr.caches.filter((x) => !x.found).length;
    const who = p.name, place = c.region;
    g.announce('Treasure hunt', left ? `${who} dug up a cache in ${place}! ${left} still hidden.` : `${who} dug up the last cache, in ${place}!`, 'event', false);
    if (!left) this.endTreasure(false);
  }

  // ================================================================ festival mini-boss

  /** Sends the festival's mini-boss at a free town. Returns the town, or null when nowhere had room. */
  startMiniboss(f: FestivalDef): string | null {
    const g = this.game;
    if (this.miniboss) return null;
    const towns = [...TOWNS].filter((t) => !g.premiumLand(t.x, t.y)).sort(() => Math.random() - 0.5);
    for (const t of towns) {
      const area = g.world.regions.find((r) => r.name === t.name && r.z0 <= 0 && r.z1 >= 0);
      if (!area) continue;
      const at = g.worldEvents.raidTile(area, 'ring');
      if (!at || onIsle(at.x, at.y, 0)) continue;
      const e = g.spawnEnemy(f.boss, at.x, at.y, 0, { tag: 'festival', radius: 4, alwaysAwake: true, lifetime: FEST_BOSS_LIFETIME + 60 });
      if (!e) continue;
      e.marchTo = { x: (area.x0 + area.x1) >> 1, y: (area.y0 + area.y1) >> 1 };
      for (const [kind, n] of f.adds) {
        for (let i = 0; i < n; i++) {
          const a = g.spawnEnemy(kind, e.x, e.y, 0, { tag: 'festival', radius: 5, masterId: e.id, alwaysAwake: true, lifetime: FEST_BOSS_LIFETIME + 60 });
          if (a) a.marchTo = { ...e.marchTo };
        }
      }
      this.miniboss = { enemy: e, festival: f.id, town: t.name, ends: g.now() + FEST_BOSS_LIFETIME * 1000 };
      g.announce(f.name, f.arrives.replace('{town}', t.name), 'festival', true);
      return t.name;
    }
    return null;
  }

  /**
   * Extra loot of a slain monster while a festival is on (Game.killEnemy): the festival
   * token now and then; the mini-boss is announced when it falls.
   */
  festivalLoot(e: Enemy): ItemStack[] {
    const g = this.game;
    const mb = this.miniboss;
    if (mb && e === mb.enemy) {
      this.miniboss = null;
      const f = FESTIVAL_BY_ID[mb.festival];
      if (f) g.announce(f.name, f.slain, 'festival', true);
      return [];
    }
    const f = this.festival();
    if (!f || e.noReward || e.def.loot.some((l) => l.id === f.token)) return [];
    if (Math.random() >= festivalDropChance(e.def.exp)) return [];
    return [{ id: f.token, qty: e.def.exp >= 2000 ? 2 : 1 }];
  }

  // ================================================================ costumes

  /** Festival costumes: put one on (the look of a creature for 20 minutes) or take it off. Returns true when handled. */
  useItem(s: Session, _slot: number, d: ItemDef): boolean {
    const look = GUISES[d.id];
    if (!look) return false;
    const g = this.game;
    const p = s.player;
    if (p.illusion === look && p.buffs.illusion > 0) {
      p.illusion = null;
      p.buffs.illusion = 0;
      g.events.emit({ type: 'buff', id: p.id, buff: 'illusion', on: false });
      g.events.emit({ type: 'lookChanged', id: p.id });
      g.msg(s.id, 'You take the costume off.', 'info');
      return true;
    }
    p.illusion = look;
    p.buffs.illusion = GUISE_MINUTES * 60;
    g.events.emit({ type: 'buff', id: p.id, buff: 'illusion', on: true });
    g.events.emit({ type: 'lookChanged', id: p.id });
    g.events.emit({ type: 'area', x: p.x, y: p.y, z: p.z, radius: 0, effect: 'holy' });
    const item = d.name, minutes = GUISE_MINUTES;
    g.msg(s.id, `You put on the ${item}. It lasts ${minutes} minutes; use it again to take it off.`, 'info');
    return true;
  }

  // ================================================================ views

  /** The calendar for the next 7 days (worked out once a minute). */
  private calendarView(now: number): LiveView['c'] {
    const minute = Math.floor(now / 60_000);
    if (this.calCache?.minute === minute) return this.calCache.c;
    const fest = this.festOverride;
    const c = calendarEntries(now, now + 7 * 86_400_000, RAIDS.map((r) => r.id), WORLD_BOSSES.length)
      // a festival switched off by a game master shows no mini-boss times
      .filter((e) => !(fest && !fest.on && (e.kind === 'miniboss' || e.kind === 'festival')))
      .slice(0, 60)
      .map((e): [number, LiveKind, string] => [e.at, e.kind, e.id]);
    this.calCache = { minute, c };
    return c;
  }

  /** What is on now, and the calendar (built once per game tick). */
  view(): LiveView {
    const g = this.game;
    if (this.cache && this.cache.time === g.time) return this.cache.view;
    const now = g.now();
    const a: LiveView['a'] = [];
    const f = this.festival();
    if (f) a.push(['festival', f.id, this.festOverride ? 0 : festivalWindow(f, now).end, 0]);
    if (this.doubles.exp && this.doubles.exp.until > now) a.push(['double_exp', '', this.doubles.exp.until, 0]);
    if (this.doubles.skill && this.doubles.skill.until > now) a.push(['double_skill', '', this.doubles.skill.until, 0]);
    const we = g.worldEvents;
    const r = we.raid;
    // game-clock times become wall-clock ends rounded to the minute, so the view stays still between minutes
    const round = (ms: number) => Math.round(ms / 60_000) * 60_000;
    if (r) a.push(['raid', r.def.id, round(now + we.raidSecondsLeft() * 1000), r.waves]);
    const wb = we.worldBoss;
    if (wb && !wb.enemy.dead) a.push(['worldboss', wb.def.kind, round(now + wb.left * 1000), 0]);
    else if (this.pendingBoss) a.push(['worldboss', this.pendingBoss.def.kind, 0, 0]);
    const mb = this.miniboss;
    if (mb) a.push(['miniboss', mb.festival, mb.ends, 0]);
    const tr = this.treasure;
    const view: LiveView = { t: now, a, c: this.calendarView(now) };
    if (tr) {
      const hidden = tr.caches.filter((c) => !c.found);
      a.push(['treasure', '', tr.ends, hidden.length]);
      view.tr = [...new Set(hidden.map((c) => c.region))];
    }
    this.cache = { time: g.time, view };
    return view;
  }

  /** Online mirror: the server's view. */
  applyNet(v: LiveView): void {
    this.net = v;
    this.offset = v.t - Date.now();
  }

  /** What the HUD shows: the view and "now" on the clock it was made with. */
  clientView(): { v: LiveView | null; now: number } {
    if (this.game.simulate) return { v: this.view(), now: this.game.now() };
    return { v: this.net, now: Date.now() + this.offset };
  }

  /** What /event shows game masters (liveops/commands.ts words it). */
  status(): { festOverride: boolean; doubleExp: number; doubleSkill: number; nextRandomTreasure: number } {
    return {
      festOverride: !!this.festOverride,
      doubleExp: this.doubles.exp?.until ?? 0,
      doubleSkill: this.doubles.skill?.until ?? 0,
      nextRandomTreasure: this.nextRandomTreasure,
    };
  }
}
