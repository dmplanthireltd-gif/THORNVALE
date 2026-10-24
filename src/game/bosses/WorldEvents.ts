import { randInt } from '../core/rng';
import type { Creature } from '../entities/Creature';
import { Enemy } from '../enemies/Enemy';
import { ENEMIES } from '../enemies/enemyDefs';
import { describeStack, type Game, type Session } from '../Game';
import { addToList } from '../inventory/Inventory';
import type { ItemStack } from '../inventory/items';
import { Player } from '../player/Player';
import { onIsle } from '../world/tutorialIsle';
import type { EnemyKind, Region } from '../world/WorldMap';
import {
  BOSS_RESPAWN_JITTER, DUNGEON_BOSSES, ENGAGE_SECONDS, HEAL_WEIGHT, GM_RAID_WARNING, RAID_DURATION, RAID_INTERVAL, RAID_WARNING, RAIDS,
  RAID_MIN_SHARE, RAID_REWARD_SHARE, RAID_SEALS, WORLD_BOSS_INTERVAL, WORLD_BOSS_LIFETIME, WORLD_BOSS_MIN_SHARE, WORLD_BOSSES,
  type RaidDef, type Spot, type WorldBossDef, type WorldMark,
} from './bosses';

interface ActiveWorldBoss {
  def: WorldBossDef;
  spot: Spot;
  enemy: Enemy;
  /** Seconds left before it leaves. */
  left: number;
  /** Healing done by each player to someone fighting it. */
  healing: Map<number, number>;
  /** Game time each player last hit it or was hit by it (or its helpers). */
  engaged: Map<number, number>;
  /** Every monster that came with it or was summoned by it. */
  ids: Set<number>;
}

interface ActiveRaid {
  def: RaidDef;
  /** Seconds since the first wave (negative during the warning). */
  t: number;
  /** Waves spawned so far. */
  waves: number;
  ids: Set<number>;
  boss: Enemy | null;
  where: { x: number; y: number };
  bossDown: boolean;
  /** Damage dealt to raid monsters that died, plus weighted healing of defenders, per player id. */
  contrib: Map<number, number>;
  /** Game time each player last fought a raid monster (healing them counts while it is recent). */
  engaged: Map<number, number>;
  /** Experience and gold the defenders share at the end (grows with every raider slain). */
  expPool: number;
  goldPool: number;
}

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const mins = (s: number) => `${Math.max(0, Math.round(s / 60))} min`;

/** "Hrimgaard, the Rime Wyrm" */
export function bossTitle(kind: EnemyKind): string {
  const d = ENEMIES[kind];
  return d.title ? `${d.name}, ${d.title}` : d.name;
}

/**
 * Runs world bosses and raids on a random schedule and keeps their state:
 * spawns, waves, broadcasts, contribution, loot by contribution, despawns.
 * Lives inside the Game (server or single player); nothing here is saved —
 * after a restart the schedule simply starts again.
 */
export class WorldEvents {
  /** Seconds until the next scheduled world boss / raid. */
  nextWorldBoss = between(WORLD_BOSS_INTERVAL);
  nextRaid = between(RAID_INTERVAL);
  /** Which ones come next (picked when scheduled, so /events can tell). */
  nextWorldBossDef: WorldBossDef = WORLD_BOSSES[Math.floor(Math.random() * WORLD_BOSSES.length)];
  nextRaidDef: RaidDef = RAIDS[Math.floor(Math.random() * RAIDS.length)];
  worldBoss: ActiveWorldBoss | null = null;
  raid: ActiveRaid | null = null;

  constructor(private readonly game: Game) {}

  // ---------------------------------------------------------------- schedule

  update(dt: number): void {
    const wb = this.worldBoss;
    if (wb) {
      wb.left -= dt;
      if (wb.enemy.dead || wb.enemy.gone) {
        if (wb.enemy.gone || wb.enemy.corpseTimer <= 0) this.worldBoss = null;
      } else if (wb.left <= 0) {
        this.endWorldBoss(false);
      }
    } else {
      this.nextWorldBoss -= dt;
      if (this.nextWorldBoss <= 0) this.startWorldBoss(this.nextWorldBossDef);
    }
    if (this.raid) this.updateRaid(dt);
    else {
      this.nextRaid -= dt;
      if (this.nextRaid <= 0) this.startRaid(this.nextRaidDef);
    }
  }

  private scheduleWorldBoss(): void {
    this.nextWorldBoss = between(WORLD_BOSS_INTERVAL);
    this.nextWorldBossDef = WORLD_BOSSES[Math.floor(Math.random() * WORLD_BOSSES.length)];
  }

  private scheduleRaid(): void {
    this.nextRaid = between(RAID_INTERVAL);
    this.nextRaidDef = RAIDS[Math.floor(Math.random() * RAIDS.length)];
  }

  // ---------------------------------------------------------------- world bosses

  /** Wakes a world boss at one of its spots (or the given one). Returns null when one is already up or no spot is free. */
  startWorldBoss(def: WorldBossDef, spot?: Spot): Enemy | null {
    if (this.worldBoss) return null;
    const g = this.game;
    const spots = spot ? [spot] : [...def.spots].sort(() => Math.random() - 0.5);
    for (const sp of spots) {
      const e = g.spawnEnemy(def.kind, sp.x, sp.y, sp.z, { tag: 'worldboss', radius: 8, alwaysAwake: true });
      if (!e) continue;
      const wb: ActiveWorldBoss = { def, spot: sp, enemy: e, left: WORLD_BOSS_LIFETIME, healing: new Map(), engaged: new Map(), ids: new Set([e.id]) };
      for (const [kind, n] of def.adds) {
        for (let i = 0; i < n; i++) {
          const a = g.spawnEnemy(kind, e.x, e.y, e.z, { tag: 'worldboss', radius: 6, masterId: e.id, noReward: true });
          if (a) wb.ids.add(a.id);
        }
      }
      this.worldBoss = wb;
      g.announce('The ground trembles…', `${bossTitle(def.kind)} has awakened near ${sp.name}!`, 'worldboss', true);
      return e;
    }
    return null;
  }

  /** Killed (`slain`) or gone back after 45 minutes. */
  private endWorldBoss(slain: boolean): void {
    const wb = this.worldBoss;
    if (!wb) return;
    const g = this.game;
    for (const e of g.enemies) if (wb.ids.has(e.id) && e !== wb.enemy) g.despawnEnemy(e);
    if (!slain) {
      g.despawnEnemy(wb.enemy);
      g.announce('The danger passes', `${bossTitle(wb.def.kind)} sinks back into the earth near ${wb.spot.name}.`, 'worldboss', true);
      this.worldBoss = null;
    }
    this.scheduleWorldBoss();
  }

  /** Every damaging hit in the game passes here (Game.applyDamage); cheap when no world boss is up. */
  onDamage(target: Creature, source: Creature): void {
    const r = this.raid;
    if (r && r.ids.size) {
      if (source instanceof Player && target instanceof Enemy && r.ids.has(target.id)) r.engaged.set(source.id, this.game.time);
      else if (target instanceof Player && source instanceof Enemy && r.ids.has(source.id)) r.engaged.set(target.id, this.game.time);
    }
    const wb = this.worldBoss;
    if (!wb) return;
    const t = this.game.time;
    if (source instanceof Player && target instanceof Enemy && wb.ids.has(target.id)) wb.engaged.set(source.id, t);
    else if (target instanceof Player && source instanceof Enemy && wb.ids.has(source.id)) wb.engaged.set(target.id, t);
  }

  /** Healing a player who is fighting the world boss earns a share of its loot. */
  onHeal(healer: Player, target: Player, amount: number): void {
    // healing a raid's defenders earns a share of the raid's reward
    const r = this.raid;
    if (r && amount > 0) {
      const last = r.engaged.get(target.id);
      if (last !== undefined && this.game.time - last <= ENGAGE_SECONDS) {
        r.contrib.set(healer.id, (r.contrib.get(healer.id) ?? 0) + amount * HEAL_WEIGHT);
        r.engaged.set(healer.id, this.game.time);
      }
    }
    const wb = this.worldBoss;
    if (!wb || amount <= 0 || wb.enemy.dead) return;
    const last = wb.engaged.get(target.id);
    if (last === undefined || this.game.time - last > ENGAGE_SECONDS) return;
    wb.healing.set(healer.id, (wb.healing.get(healer.id) ?? 0) + amount * HEAL_WEIGHT);
    wb.engaged.set(healer.id, this.game.time);
  }

  /**
   * Shares out a slain world boss: everyone who damaged it or healed its
   * fighters gets a personal bag (backpack first, then depot) by their share.
   */
  private shareWorldBossLoot(e: Enemy, damage: Map<number, number>): void {
    const wb = this.worldBoss!;
    const g = this.game;
    const contrib = new Map<number, number>(damage);
    for (const [pid, h] of wb.healing) contrib.set(pid, (contrib.get(pid) ?? 0) + h);
    const total = [...contrib.values()].reduce((a, b) => a + b, 0) || 1;
    const ranked = [...contrib.entries()].sort((a, b) => b[1] - a[1]);
    const names: string[] = [];
    ranked.forEach(([pid, amount], rank) => {
      const s = g.sessions.get(pid);
      if (!s) return;
      const share = amount / total;
      if (share < WORLD_BOSS_MIN_SHARE) {
        g.msg(pid, `Your part in the fight against ${e.def.name} was too small for a share of the spoils.`, 'loot');
        return;
      }
      if (names.length < 5) names.push(s.player.name);
      const items = this.rollShare(e, share, rank === 0);
      this.deliver(s, items, `Your share of the spoils of ${e.def.name} (${Math.max(1, Math.round(share * 100))}%)`);
    });
    g.announce('Victory!', `${bossTitle(e.enemyKind)} has been slain${names.length ? ` by ${names.join(', ')}${ranked.length > names.length ? ' and others' : ''}` : ''}!`, 'worldboss', true);
  }

  /** One personal bag: gold by share, and the boss's table rolled more often the bigger the share. */
  rollShare(e: Enemy, share: number, top: boolean): ItemStack[] {
    const rolls = Math.min(5, 1 + Math.floor(share * 20)) + (top ? 1 : 0);
    const items: ItemStack[] = [];
    for (const l of e.def.loot) {
      if (l.id === 'gold') {
        // gold from monsters follows the server's exp stages (progression/stages.ts)
        const qty = Math.max(50, Math.round(randInt(l.min, l.max) * Math.min(1.5, Math.max(0.1, share * 4)) * this.game.stages.gold));
        items.push({ id: 'gold', qty });
        continue;
      }
      const p = 1 - Math.pow(1 - l.chance, rolls);
      if (Math.random() < p) items.push({ id: l.id, qty: randInt(l.min, l.max) });
    }
    return items;
  }

  /** Puts items in the backpack, then the depot, then (if both are full) at the player's feet. */
  deliver(s: Session, items: ItemStack[], why: string): void {
    const g = this.game;
    const toDepot: ItemStack[] = [];
    const toGround: ItemStack[] = [];
    for (const it of items) {
      let left = s.inventory.add(it.id, it.qty);
      if (left > 0) {
        const d = addToList(s.depot, it.id, left);
        if (d < left) toDepot.push({ id: it.id, qty: left - d });
        left = d;
      }
      if (left > 0) toGround.push({ id: it.id, qty: left });
    }
    if (toGround.length) g.dropItemsAt(s.player.x, s.player.y, s.player.z, toGround);
    g.msg(s.id, `${why}: ${items.length ? items.map(describeStack).join(', ') : 'nothing'}.`, 'loot');
    if (toDepot.length) g.msg(s.id, `Your backpack was full: ${toDepot.map(describeStack).join(', ')} went to your depot.`, 'loot');
    if (toGround.length) g.msg(s.id, 'Your depot is full too: the rest lies at your feet.', 'warn');
    g.events.emit({ type: 'inventoryChanged', to: s.id });
    g.events.emit({ type: 'depotChanged', to: s.id });
    s.wantsSave = true;
  }

  // ---------------------------------------------------------------- raids

  /** Announces a raid; its first wave comes after `warning` seconds. Returns false when one is already running. */
  startRaid(def: RaidDef, warning = RAID_WARNING): boolean {
    if (this.raid) return false;
    const area = this.region(def.area.region);
    if (!area) {
      this.scheduleRaid();
      return false;
    }
    const target = this.region(def.target) ?? area;
    this.raid = {
      def, t: -warning, waves: 0, ids: new Set(), boss: null, where: { x: (target.x0 + target.x1) >> 1, y: (target.y0 + target.y1) >> 1 }, bossDown: false,
      contrib: new Map(), engaged: new Map(), expPool: 0, goldPool: 0,
    };
    this.game.announce('A raid is coming', def.warning, 'raid', true);
    return true;
  }

  /** /raid by a game master: a short warning instead of five minutes. */
  startRaidNow(def: RaidDef): boolean {
    return this.startRaid(def, GM_RAID_WARNING);
  }

  private region(name: string): Region | null {
    return this.game.world.regions.find((r) => r.name === name && r.z0 <= 0 && r.z1 >= 0) ?? null;
  }

  private updateRaid(dt: number): void {
    const r = this.raid!;
    const g = this.game;
    const before = r.t;
    r.t += dt;
    if (before < 0 && r.t >= 0) g.announce(`Raid: ${r.def.name}`, r.def.start, 'raid', true);
    while (r.t >= 0 && r.waves < r.def.waves.length && r.t >= r.def.waves[r.waves].at) {
      this.spawnWave(r, r.waves);
      r.waves++;
    }
    if (r.t < 0) return;
    const allSpawned = r.waves >= r.def.waves.length;
    const left = allSpawned ? this.raidAlive(r) : 1;
    if (r.t >= RAID_DURATION || (allSpawned && left === 0)) this.endRaid(left === 0 || r.bossDown);
  }

  /** Seconds until the running raid ends (warning included). */
  raidSecondsLeft(): number {
    const r = this.raid;
    return r ? Math.max(0, RAID_DURATION - r.t) : 0;
  }

  private raidAlive(r: ActiveRaid): number {
    let n = 0;
    for (const e of this.game.enemies) if (r.ids.has(e.id) && !e.dead) n++;
    return n;
  }

  private spawnWave(r: ActiveRaid, i: number): void {
    const g = this.game;
    const area = this.region(r.def.area.region);
    if (!area) return;
    const wave = r.def.waves[i];
    const last = i === r.def.waves.length - 1;
    // each wave comes from two or three sides at once
    const anchors = [0, 1, 2].map(() => this.raidTile(area, r.def.area.mode)).filter((a): a is { x: number; y: number } => !!a);
    if (!anchors.length) return;
    let k = 0;
    const put = (kind: EnemyKind): Enemy | null => {
      const a = anchors[k++ % anchors.length];
      const e = g.spawnEnemy(kind, a.x, a.y, 0, { tag: 'raid', radius: 5, alwaysAwake: true, lifetime: RAID_DURATION + 60 });
      if (e) {
        r.ids.add(e.id);
        e.marchTo = { x: r.where.x, y: r.where.y };
      }
      return e;
    };
    for (const [kind, n] of wave.monsters) for (let j = 0; j < n; j++) put(kind);
    if (last) {
      r.boss = put(r.def.boss);
      g.announce(`Raid: ${r.def.name}`, `${bossTitle(r.def.boss)} leads the last wave on ${r.def.town}!`, 'raid', true);
    } else if (i > 0) {
      g.announce(`Raid: ${r.def.name}`, `Another wave reaches ${r.def.town}!`, 'raid', false);
    }
  }

  /** A walkable, unprotected surface tile in the raid area: around a town's walls, or inside a graveyard. Bounded tries, no map-sized scans. */
  raidTile(area: Region, mode: 'ring' | 'inside'): { x: number; y: number } | null {
    const w = this.game.world;
    const R = 14, M = 3;
    for (let tries = 0; tries < 200; tries++) {
      let x: number, y: number;
      if (mode === 'inside') {
        x = randInt(area.x0, area.x1);
        y = randInt(area.y0, area.y1);
      } else {
        x = randInt(area.x0 - R, area.x1 + R);
        y = randInt(area.y0 - R, area.y1 + R);
        if (x >= area.x0 - M && x <= area.x1 + M && y >= area.y0 - M && y <= area.y1 + M) continue;
      }
      // never in a protection zone (temples, depots, the Gilded Exchange) and never on Wayfarer's Isle
      if (!w.inBounds(x, y) || !w.isWalkable(x, y, 0) || w.isSafe(x, y, 0) || w.linkAt(x, y, 0) || onIsle(x, y, 0)) continue;
      if (w.regionAt(x, y, 0)?.safe) continue;
      return { x, y };
    }
    return null;
  }

  private endRaid(won: boolean): void {
    const r = this.raid;
    if (!r) return;
    const g = this.game;
    for (const e of g.enemies) if (r.ids.has(e.id) && !e.dead) g.despawnEnemy(e);
    g.announce(`Raid: ${r.def.name}`, won ? `${r.def.town} is safe again: the raid is over.` : r.def.end, 'raid', true);
    this.raid = null;
    this.rewardRaid(r, won);
    this.scheduleRaid();
  }

  /** Abandons the running raid (game master): its monsters leave, nobody is rewarded. */
  stopRaid(): boolean {
    const r = this.raid;
    if (!r) return false;
    const g = this.game;
    for (const e of g.enemies) if (r.ids.has(e.id) && !e.dead) g.despawnEnemy(e);
    g.announce(`Raid: ${r.def.name}`, r.def.end, 'raid', false);
    this.raid = null;
    this.scheduleRaid();
    return true;
  }

  /** Sends the world boss back early (game master). */
  stopWorldBoss(): boolean {
    if (!this.worldBoss || this.worldBoss.enemy.dead) return false;
    this.endWorldBoss(false);
    return true;
  }

  /**
   * Shares a finished raid's reward among its defenders by contribution (damage to the raiders
   * that fell, and weighted healing of those fighting them): experience and gold from the pools,
   * task seals, and a mention for the three who did most. A lost raid pays half.
   */
  private rewardRaid(r: ActiveRaid, won: boolean): void {
    const g = this.game;
    const total = [...r.contrib.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const ranked = [...r.contrib.entries()].filter(([pid]) => g.sessions.has(pid)).sort((a, b) => b[1] - a[1]);
    const k = won ? 1 : 0.5;
    const best: string[] = [];
    ranked.forEach(([pid, amount], rank) => {
      const s = g.sessions.get(pid)!;
      const share = amount / total;
      if (share < RAID_MIN_SHARE) {
        g.msg(pid, `Your part in the defence of ${r.def.town} was too small for a reward.`, 'loot');
        return;
      }
      if (rank < 3) best.push(s.player.name);
      const exp = Math.round(r.expPool * RAID_REWARD_SHARE * share * k);
      const gold = Math.max(10, Math.round(r.goldPool * share * k));
      const seals = Math.max(1, Math.round((won ? RAID_SEALS : RAID_SEALS / 2) * Math.min(1, share * 5))) + (won && rank < 3 ? 2 : 0);
      if (exp > 0) g.grantExp(s, exp, s.id, `for defending ${r.def.town}`);
      const town = r.def.town, pct = Math.max(1, Math.round(share * 100));
      this.deliver(s, [{ id: 'gold', qty: gold }], `Your reward for defending ${town} (${pct}%)`);
      g.taskSys.addSeals(s, seals);
      g.msg(pid, `You earn ${seals} task seals for the defence.`, 'loot');
    });
    const town = r.def.town, names = best.join(', ');
    if (best.length) g.announce(`Raid: ${r.def.name}`, `The bravest defenders of ${town}: ${names}.`, 'raid', false);
  }

  // ---------------------------------------------------------------- deaths

  /**
   * A monster died (Game.killEnemy, after experience was shared). Returns true
   * when its loot was handled here (world bosses share it by contribution).
   */
  onKilled(e: Enemy, damage: Map<number, number>): boolean {
    const g = this.game;
    // helpers fall with their master
    if (e.def.boss) for (const o of g.enemies) if (o.masterId === e.id && !o.dead) g.despawnEnemy(o);
    const wb = this.worldBoss;
    if (wb && e === wb.enemy) {
      this.shareWorldBossLoot(e, damage);
      this.endWorldBoss(true);
      return true;
    }
    const r = this.raid;
    if (r && r.ids.has(e.id)) {
      for (const [pid, d] of damage) r.contrib.set(pid, (r.contrib.get(pid) ?? 0) + d);
      r.expPool += e.def.exp;
      r.goldPool += Math.round(e.def.exp * (e === r.boss ? 0.5 : 0.25));
    }
    if (r && e === r.boss) {
      r.bossDown = true;
      g.announce(`Raid: ${r.def.name}`, r.def.victory, 'raid', true);
    }
    if (e.def.boss === 'dungeon') {
      const who = [...damage.keys()].map((id) => g.getPlayer(id)?.name).filter((n): n is string => !!n).slice(0, 4);
      g.announce('Boss slain', `${bossTitle(e.enemyKind)} has been slain${who.length ? ` by ${who.join(', ')}` : ''}!`, 'boss', false);
    }
    return false;
  }

  /** Respawn delay of a slain map monster: dungeon bosses vary a little. */
  respawnDelay(e: Enemy): number {
    return e.def.boss ? e.def.respawn * (1 - BOSS_RESPAWN_JITTER + Math.random() * 2 * BOSS_RESPAWN_JITTER) : e.def.respawn;
  }

  // ---------------------------------------------------------------- views

  /** Active world boss and raid for the world map. */
  marks(): WorldMark[] {
    const out: WorldMark[] = [];
    const wb = this.worldBoss;
    if (wb && !wb.enemy.dead && !wb.enemy.gone) out.push({ kind: 'worldboss', name: bossTitle(wb.def.kind), x: wb.enemy.x, y: wb.enemy.y, z: wb.enemy.z });
    const r = this.raid;
    if (r) out.push({ kind: 'raid', name: `${r.def.name} (${r.t < 0 ? 'coming' : 'raid'})`, x: r.where.x, y: r.where.y, z: 0 });
    return out;
  }

  /** What /events shows game masters. */
  upcoming(): string[] {
    const g = this.game;
    const out: string[] = [];
    const wb = this.worldBoss;
    if (wb && !wb.enemy.dead) out.push(`World boss: ${bossTitle(wb.def.kind)} near ${wb.spot.name} (${wb.enemy.x}, ${wb.enemy.y}), ${Math.round((wb.enemy.hp / wb.enemy.maxHp) * 100)}% health, leaves in ${mins(wb.left)}.`);
    else out.push(`Next world boss in ${mins(this.nextWorldBoss)}: ${bossTitle(this.nextWorldBossDef.kind)}.`);
    const r = this.raid;
    if (r) out.push(r.t < 0 ? `Raid: ${r.def.name} on ${r.def.town}, first wave in ${mins(-r.t)}.` : `Raid: ${r.def.name} on ${r.def.town}, wave ${r.waves}/${r.def.waves.length}, ${this.raidAlive(r)} raiders left, ends in ${mins(RAID_DURATION - r.t)}.`);
    else out.push(`Next raid in ${mins(this.nextRaid)}: ${this.nextRaidDef.name} on ${this.nextRaidDef.town}.`);
    for (const b of DUNGEON_BOSSES) {
      const e = g.enemies.find((x) => x.enemyKind === b.kind && !x.dynamic);
      if (!e) continue;
      out.push(`${bossTitle(b.kind)} (${b.region}): ${e.dead ? `respawns in ${mins(e.respawnTimer)}` : 'alive'}.`);
    }
    return out;
  }
}
