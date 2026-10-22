import type { Game, Session } from '../Game';
import type { Player } from '../player/Player';
import { recipeById, STATIONS, type Station } from '../production/recipes';
import { SMITHING_HAMMER } from '../production/smithing';
import { FISH_INTERVAL } from './fishing';
import { MINE_INTERVAL } from './mining';
import { CHOP_INTERVAL } from './woodcutting';

/**
 * What a player is busy with right now (chopping, fishing, mining or working a
 * station), so every client can show the right tool and the right loop.
 * Derived from Player.chop / fish / mine / craft on the server; a mirror game
 * (online client) keeps what the snapshots said (`setNetActivity`).
 * Pure logic: no DOM, no three.js.
 */
export type ActivityKind = 'chop' | 'fish' | 'mine' | Station;

/** Wire codes: the index in this list. Append only (old clients ignore unknown codes). */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'chop', 'fish', 'mine', 'furnace', 'anvil', 'campfire', 'stove', 'tanning', 'knife', 'needle', 'chisel', 'tinderbox',
];

export interface Activity {
  kind: ActivityKind;
  /** The tile worked: tree, water, rock or station (a hand tool: where the player stands). */
  x: number;
  y: number;
  /** Item id of the tool in hand (best axe or pickaxe, rod, hammer, knife…), null when none is needed. */
  tool: string | null;
}

/** Seconds between two strikes / casts / items for an activity (matches the server timers). */
export function activityInterval(kind: ActivityKind): number {
  if (kind === 'chop') return CHOP_INTERVAL;
  if (kind === 'fish') return FISH_INTERVAL;
  if (kind === 'mine') return MINE_INTERVAL;
  return STATIONS[kind].interval;
}

/** Share of the interval already done when an activity starts (gathering hits at half an interval, stations after a full one). */
export function activityStartPhase(kind: ActivityKind): number {
  return kind === 'chop' || kind === 'fish' || kind === 'mine' ? 0.5 : 0;
}

/** The authoritative activity of a session (server / offline game). */
export function computeActivity(game: Game, s: Session): Activity | null {
  const p = s.player;
  if (p.dead) return null;
  if (p.chop) return { kind: 'chop', x: p.chop.x, y: p.chop.y, tool: game.bestAxe(s)?.id ?? null };
  if (p.mine) return { kind: 'mine', x: p.mine.x, y: p.mine.y, tool: game.bestPickaxe(s)?.item ?? null };
  if (p.fish) return { kind: 'fish', x: p.fish.x, y: p.fish.y, tool: 'fishing_rod' };
  if (p.craft) {
    const r = recipeById(p.craft.recipe);
    if (!r) return null;
    const tool = r.tool ?? (r.station === 'anvil' ? SMITHING_HAMMER : STATIONS[r.station].obj === null ? r.station : null);
    return { kind: r.station, x: p.craft.x, y: p.craft.y, tool };
  }
  return null;
}

/** What the snapshots said each mirror player is doing. */
const netActivity = new WeakMap<Player, Activity>();

export function setNetActivity(p: Player, a: Activity | null): void {
  if (a) netActivity.set(p, a);
  else netActivity.delete(p);
}

/** A player's current activity on either side: computed on the server/offline, from snapshots on a mirror. */
export function currentActivity(game: Game, id: number): Activity | null {
  const s = game.session(id);
  if (!s) return null;
  if (!game.simulate) return s.player.dead ? null : netActivity.get(s.player) ?? null;
  return computeActivity(game, s);
}

// ------------------------------------------------------------------ wire format

/** Compact form in a snapshot: [kind code, x, y, tool id or ''], or 0 = idle. */
export type ActivitySnap = [number, number, number, string] | 0;

export function encodeActivity(a: Activity | null): ActivitySnap {
  if (!a) return 0;
  return [ACTIVITY_KINDS.indexOf(a.kind), a.x, a.y, a.tool ?? ''];
}

export function decodeActivity(v: unknown): Activity | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const [k, x, y, tool] = v as unknown[];
  const kind = typeof k === 'number' ? ACTIVITY_KINDS[k] : undefined;
  if (!kind || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { kind, x: Math.floor(x), y: Math.floor(y), tool: typeof tool === 'string' && tool ? tool.slice(0, 48) : null };
}

/** Signature used to send an activity only when it changed. */
export function activityKey(a: Activity | null): string {
  return a ? `${a.kind},${a.x},${a.y},${a.tool ?? ''}` : '';
}
