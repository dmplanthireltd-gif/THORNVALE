import type { Game, Session } from '../Game';
import { chebyshev } from '../core/types';
import type { Player } from '../player/Player';
import { Ground, Obj, type WorldMap } from '../world/WorldMap';
import type { Activity } from '../gathering/activity';
import type { MooringSpot, TradeLayout } from './layout';
import { tileKey } from './layout';
import {
  BOAT_BY_N, BOAT_FISH_XP, bestBoat, BOATS, ENCOUNTER_CHANCE, ENCOUNTER_LIFETIME, encounterFor, FLOTSAM_RESPAWN, SALVAGE_TIME, salvageChance,
  salvageLoot, salvageXp, seaMonsterFor, squallDamage, VOYAGE_MIN, voyageXp, type BoatDef,
} from './sailing';
import { rollEach } from './thieving';

/** A voyage in progress (never saved: a save at sea puts you back on the pier you sailed from). */
export interface Voyage {
  /** Mooring boarded at. */
  from: number;
  /** Tiles sailed so far. */
  tiles: number;
  /** Salvaging: the wreckage tile and seconds left. */
  salvage: { x: number; y: number; timer: number } | null;
}

/** Water a boat may sail over (surface only): open water, or a mooring post to come alongside. */
export function seaTile(m: WorldMap, x: number, y: number, z: number): boolean {
  if (z !== 0 || !m.inBounds(x, y)) return false;
  const g = m.getGround(x, y, z);
  if (g !== Ground.Water && g !== Ground.DeepWater) return false;
  const o = m.getObj(x, y, z);
  if (o !== Obj.None && o !== Obj.Mooring) return false;
  return !m.linkAt(x, y, z);
}

/**
 * Sailing inside the game (owned by TradeSystem, `Game.skillSys.sea`). The boat a
 * player sails is `Player.boat` (sent to everyone as snapshot `bt`, so every
 * client draws it and steps the same way); the voyage itself lives here.
 * No DOM, no three.js.
 */
export class SeaSystem {
  private readonly voyages = new Map<number, Voyage>();

  constructor(private readonly game: Game, private readonly give: (s: Session, list: Array<{ id: string; qty: number }>) => string[]) {}

  private get layout(): TradeLayout | null {
    return this.game.world.trades;
  }

  private level(s: Session): number {
    return this.game.skillLevel(s, 'sailing');
  }

  voyage(s: Session): Voyage | null {
    return this.voyages.get(s.id) ?? null;
  }

  /** The mooring a dock tile belongs to (or −1). */
  private mooringAtDock(x: number, y: number): MooringSpot | null {
    return this.layout?.moorings.find((m) => m.dockX === x && m.dockY === y) ?? null;
  }

  private mooringAt(x: number, y: number, z: number): MooringSpot | null {
    const tt = this.layout?.index.get(tileKey(x, y, z));
    return tt?.t === 'moor' ? this.layout!.moorings[tt.i] : null;
  }

  // ---------------------------------------------------------------- movement (server and every mirror game)

  /** May a player in a boat step from (x, y) by (dx, dy)? Over water, or from a mooring onto its pier. */
  canStep(x: number, y: number, z: number, dx: number, dy: number): boolean {
    if (dx === 0 && dy === 0) return false;
    const m = this.game.world;
    const tx = x + dx, ty = y + dy;
    if (seaTile(m, tx, ty, z)) {
      // never squeeze diagonally between two bits of land
      if (dx !== 0 && dy !== 0 && !seaTile(m, x + dx, y, z) && !seaTile(m, x, y + dy, z)) return false;
      return true;
    }
    // coming ashore: only from a mooring post onto its own pier tile
    const mo = this.mooringAt(x, y, z);
    return !!mo && mo.dockX === tx && mo.dockY === ty && m.isWalkable(tx, ty, z);
  }

  /** Path grid for a boat (Game.pathTo). */
  grid(z: number): { width: number; height: number; canStep(x: number, y: number, dx: number, dy: number): boolean } {
    const m = this.game.world;
    return { width: m.width, height: m.height, canStep: (x, y, dx, dy) => this.canStep(x, y, z, dx, dy) };
  }

  /** May a boat end a path on this tile (clicks while sailing)? */
  canEnter(x: number, y: number, z: number): boolean {
    return seaTile(this.game.world, x, y, z) || !!this.mooringAtDock(x, y);
  }

  /** Step-time factor of the boat sailed (1 when ashore). */
  stepFactor(p: Player): number {
    return p.boat ? BOAT_BY_N[p.boat]?.step ?? 1 : 1;
  }

  // ---------------------------------------------------------------- boarding and landing

  /** A mooring used: board your boat from the pier, come alongside it from the sea, or step ashore from it. */
  useMooring(s: Session, mo: MooringSpot): void {
    const p = s.player;
    if (p.boat) {
      if (p.x === mo.x && p.y === mo.y) {
        // alongside already: step onto the pier
        if (this.game.isOccupied(mo.dockX, mo.dockY, mo.z, p.id, true)) return this.game.msg(s.id, 'Someone is standing on the pier.', 'warn');
        if (!p.moving) this.game.tryStep(p, mo.dockX - p.x, mo.dockY - p.y);
        return;
      }
      if (this.game.isOccupied(mo.x, mo.y, mo.z, p.id, true)) return this.game.msg(s.id, 'Another boat is tied up there.', 'warn');
      p.path = this.game.pathTo(p, mo.x, mo.y, false, 40000) ?? [];
      return;
    }
    const lvl = this.level(s);
    const owned = BOATS.filter((b) => s.inventory.has(b.deed));
    if (!owned.length) return this.game.msg(s.id, 'You need a boat to sail from here. Captain Maren Tallow, the shipwright in Millbrook, sells them.', 'warn');
    const boat = bestBoat(lvl, (id) => s.inventory.has(id));
    if (!boat) return this.game.msg(s.id, `You need sailing level ${Math.min(...owned.map((b) => b.level))} to sail that boat.`, 'warn');
    if (chebyshev(p.x, p.y, mo.x, mo.y) !== 1 || p.z !== mo.z) return;
    if (this.game.isOccupied(mo.x, mo.y, mo.z, p.id, true)) return this.game.msg(s.id, 'Another boat is tied up there.', 'warn');
    this.board(s, mo, boat);
  }

  private board(s: Session, mo: MooringSpot, boat: BoatDef): void {
    const p = s.player;
    this.game.stopAllWork(s);
    p.targetId = null;
    p.path = [];
    p.pending = null;
    p.boat = boat.n;
    this.voyages.set(s.id, { from: mo.id, tiles: 0, salvage: null });
    p.beginStep(mo.x - p.x, mo.y - p.y);
    p.moveDur *= boat.step;
    this.game.msg(s.id, `You climb into your ${boat.name.toLowerCase()} and cast off. Sail anywhere over water; come ashore at any mooring.`, 'info');
    this.game.events.emit({ type: 'sailing', id: p.id, x: mo.x, y: mo.y, z: mo.z, what: 'board' });
  }

  /** Ashore at a pier: the boat is tied up; a voyage from another harbour pays its bonus. */
  private land(s: Session): void {
    const p = s.player;
    const v = this.voyages.get(s.id);
    const boat = BOAT_BY_N[p.boat];
    p.boat = 0;
    this.voyages.delete(s.id);
    const here = this.mooringAtDock(p.x, p.y);
    const from = v ? this.layout?.moorings[v.from] : null;
    if (boat && here && from && here.name !== from.name) {
      const dist = Math.round(Math.hypot(here.x - from.x, here.y - from.y));
      if (dist >= VOYAGE_MIN) {
        const xp = voyageXp(boat, dist);
        this.game.gainSkill(s, 'sailing', xp, p.id);
        this.game.msg(s.id, `You tie up at ${here.name}. A voyage of ${dist} tiles from ${from.name}: ${xp} sailing experience.`, 'info');
      } else this.game.msg(s.id, `You tie up at ${here.name} and step ashore.`, 'info');
    } else this.game.msg(s.id, 'You tie up your boat and step ashore.', 'info');
    this.game.events.emit({ type: 'sailing', id: p.id, x: p.x, y: p.y, z: p.z, what: 'land' });
  }

  /** Teleported, died or logged out at sea: the boat goes back to its mooring. */
  cancel(s: Session): void {
    s.player.boat = 0;
    this.voyages.delete(s.id);
  }

  /** Where a save made at sea puts the character: the pier they sailed from. */
  savePosition(s: Session): { x: number; y: number } | null {
    const p = s.player;
    const m = this.game.world;
    // in a boat, or somehow left standing on open water: never saved out at sea
    if (!p.boat && !(seaTile(m, p.x, p.y, p.z) && !m.isWalkable(p.x, p.y, p.z))) return null;
    const v = this.voyages.get(s.id);
    const l = this.layout;
    if (!l?.moorings.length) return null;
    let mo = v ? l.moorings[v.from] : null;
    if (!mo) for (const o of l.moorings) if (!mo || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(mo.x - p.x, mo.y - p.y)) mo = o;
    return mo ? { x: mo.dockX, y: mo.dockY } : null;
  }

  /** The player left the game. */
  forget(id: number): void {
    this.voyages.delete(id);
  }

  // ---------------------------------------------------------------- every step and tick (server)

  /** A step at sea has begun (server): experience per tile, and now and then something happens. */
  onStep(s: Session): void {
    const p = s.player;
    const boat = BOAT_BY_N[p.boat];
    const v = this.voyages.get(s.id);
    if (!boat || !v) return;
    if (!seaTile(this.game.world, p.x, p.y, p.z)) return;
    v.tiles++;
    v.salvage = null;
    this.game.gainSkill(s, 'sailing', boat.tileXp, p.id);
    if (Math.random() < ENCOUNTER_CHANCE && this.openSea(p.x, p.y, p.z)) this.encounter(s);
  }

  /** Three tiles of water all round (no shore in sight). */
  private openSea(x: number, y: number, z: number): boolean {
    const m = this.game.world;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const g = m.getGround(x + dx, y + dy, z);
      if (g !== Ground.Water && g !== Ground.DeepWater) return false;
    }
    return true;
  }

  private encounter(s: Session): void {
    const p = s.player;
    const kind = encounterFor(Math.random(), p.level);
    if (kind === 'drift') {
      const loot = salvageLoot(Math.min(80, this.level(s)));
      const got = this.give(s, [{ id: 'gold', qty: loot.gold[0] + Math.floor(Math.random() * (loot.gold[1] - loot.gold[0] + 1)) }, ...rollEach(loot.loot)]);
      this.game.gainSkill(s, 'sailing', salvageXp(this.level(s)), p.id);
      this.game.msg(s.id, `A crate drifts past and you haul it aboard: ${got.join(', ')}.`, 'loot');
      this.game.events.emit({ type: 'sailing', id: p.id, x: p.x, y: p.y, z: p.z, what: 'drift' });
      return;
    }
    if (kind === 'squall') {
      this.game.msg(s.id, 'A sudden squall slams into your boat!', 'warn');
      this.game.events.emit({ type: 'sailing', id: p.id, x: p.x, y: p.y, z: p.z, what: 'squall' });
      this.game.hurtPlayerByEnvironment(s, squallDamage(p.maxHp), 'physical', 'The squall throws you against the side of the boat.');
      return;
    }
    // something comes up out of the deep, a few tiles off
    const m = this.game.world;
    const spots: Array<{ x: number; y: number }> = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) continue;
      const x = p.x + dx, y = p.y + dy;
      if (seaTile(m, x, y, p.z) && m.getObj(x, y, p.z) === Obj.None && !this.game.isOccupied(x, y, p.z, -1, false)) spots.push({ x, y });
    }
    if (!spots.length) return;
    const at = spots[Math.floor(Math.random() * spots.length)];
    const e = this.game.spawnEnemy(seaMonsterFor(p.level, Math.random()), at.x, at.y, p.z, { tag: 'sea', at, lifetime: ENCOUNTER_LIFETIME, alwaysAwake: true });
    if (!e) return;
    this.game.msg(s.id, `Something rises out of the deep: a ${e.name.toLowerCase()}!`, 'warn');
    this.game.events.emit({ type: 'sailing', id: p.id, x: at.x, y: at.y, z: p.z, what: 'monster' });
  }

  /** Every tick (server): landing on a pier, salvaging, a boat that lost its sea. */
  update(s: Session, dt: number): void {
    const p = s.player;
    if (!p.boat) return;
    if (p.dead) return this.cancel(s);
    const m = this.game.world;
    if (!seaTile(m, p.x, p.y, p.z)) {
      // stepped onto a pier from a mooring: ashore; anywhere else (a teleport): the boat goes home
      if (this.mooringAtDock(p.x, p.y) && p.z === 0) this.land(s);
      else this.cancel(s);
      return;
    }
    const v = this.voyages.get(s.id);
    const w = v?.salvage;
    if (!v || !w) return;
    if (p.moving || p.path.length || p.targetId !== null || chebyshev(p.x, p.y, w.x, w.y) > 1 || m.getObj(w.x, w.y, 0) !== Obj.Flotsam) {
      v.salvage = null;
      return;
    }
    w.timer -= dt;
    if (w.timer > 0) return;
    v.salvage = null;
    this.finishSalvage(s, w.x, w.y);
  }

  // ---------------------------------------------------------------- salvage and fishing

  /** Floating wreckage used: salvage it from your boat. */
  useFlotsam(s: Session, i: number): void {
    const l = this.layout!;
    const f = l.flotsam[i];
    const p = s.player;
    const o = this.game.world.getObj(f.x, f.y, f.z);
    if (o === Obj.FlotsamGone) return this.game.msg(s.id, 'Only a few splinters are left. The sea will bring more.', 'info');
    if (!p.boat) return this.game.msg(s.id, 'The wreckage floats out of reach. You need a boat.', 'info');
    if (this.level(s) < f.level) return this.game.msg(s.id, `You need sailing level ${f.level} to haul in this wreckage.`, 'warn');
    if (s.inventory.freeSlots() === 0) return this.game.msg(s.id, 'Your backpack is full.', 'warn');
    if (chebyshev(p.x, p.y, f.x, f.y) > 1) {
      // sail up beside it first
      p.path = this.game.pathTo(p, f.x, f.y, true, 20000) ?? [];
      p.pending = { type: 'use', x: f.x, y: f.y, z: f.z };
      return;
    }
    const v = this.voyages.get(s.id);
    if (!v) return;
    this.game.stopAllWork(s);
    p.targetId = null;
    p.faceTowards(f.x, f.y);
    v.salvage = { x: f.x, y: f.y, timer: SALVAGE_TIME };
    this.game.msg(s.id, 'You lean over the side and reach for the wreckage...', 'info');
  }

  private finishSalvage(s: Session, x: number, y: number): void {
    const l = this.layout!;
    const tt = l.index.get(tileKey(x, y, 0));
    if (!tt || tt.t !== 'flot') return;
    const f = l.flotsam[tt.i];
    const p = s.player;
    if (Math.random() >= salvageChance(this.level(s), f.level)) {
      this.game.msg(s.id, 'The wreckage bobs away from your hands. Try again.', 'info');
      this.voyages.get(s.id)!.salvage = { x, y, timer: SALVAGE_TIME };
      return;
    }
    const loot = salvageLoot(f.level);
    const got = this.give(s, [{ id: 'gold', qty: loot.gold[0] + Math.floor(Math.random() * (loot.gold[1] - loot.gold[0] + 1)) }, ...rollEach(loot.loot)]);
    this.game.msg(s.id, `You salvage ${got.join(', ')}.`, 'loot');
    this.game.gainSkill(s, 'sailing', salvageXp(f.level), p.id);
    this.game.holdTile(x, y, 0, Obj.FlotsamGone, FLOTSAM_RESPAWN[0] + Math.random() * (FLOTSAM_RESPAWN[1] - FLOTSAM_RESPAWN[0]));
    this.game.events.emit({ type: 'sailing', id: p.id, x, y, z: 0, what: 'salvage' });
  }

  /** A fish caught from the boat also teaches a little sailing. */
  onFishCaught(s: Session): void {
    if (s.player.boat) this.game.gainSkill(s, 'sailing', BOAT_FISH_XP, s.player.id);
  }

  /** What the player is doing at sea, for every client's animations. */
  activity(s: Session): Activity | null {
    const p = s.player;
    if (!p.boat) return null;
    const v = this.voyages.get(s.id);
    if (v?.salvage) return { kind: 'salvage', x: v.salvage.x, y: v.salvage.y, tool: null };
    if (p.fish) return null;
    return { kind: 'sail', x: p.x, y: p.y, tool: BOAT_BY_N[p.boat]?.deed ?? null };
  }
}
