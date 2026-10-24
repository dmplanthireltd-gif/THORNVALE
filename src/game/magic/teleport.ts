import type { WorldMap } from '../world/WorldMap';

/**
 * Teleport runes (owner request 2026-10-24): one consumable rune per important place.
 * Using one starts a short channel (`TELEPORT_CAST_SECONDS`); moving, taking damage,
 * dying or a fight breaking out cancels it, and the rune is only used up when the
 * jump happens. Pure data and rules here; Game.ts runs the channel.
 *
 * Destinations are fixed: every town temple, plus the entrances of the big hunting
 * grounds (never inside a boss lair — scripts/teleport-test.ts checks every spot).
 */
export interface TeleportDest {
  /** Stable key (part of the item id `teleport_rune_<key>`). */
  key: string;
  /** Place name shown to players (an existing town or region name). */
  name: string;
  /** Short plate on the rune stone (ui/runeIcons.ts). */
  label: string;
  /** Character level needed to use the rune. */
  level: number;
  /** Gold an NPC pays back (shops sell it for 2.5×). */
  value: number;
  /** Town key in world/townList.ts: arrive on that town's temple. */
  town?: string;
  /** Otherwise: the arrival tile (the nearest free tile is used, see Game.teleport). */
  at?: { x: number; y: number; z: number };
  /** One line for the item note (English; translated in i18n/tables/texts.ts). */
  note: string;
}

const TOWN = (key: string, name: string, label: string): TeleportDest => ({
  key, name, label, level: 1, value: 50, town: key, note: `Channel it for a few breaths to step out at the temple of ${name}.`,
});

export const TELEPORT_DESTS: TeleportDest[] = [
  TOWN('thornvale', 'Thornvale', 'THRN'),
  TOWN('westmarch', 'Westmarch', 'WEST'),
  TOWN('elderglen', 'Elderglen', 'ELDR'),
  TOWN('stonedeep', 'Stonedeep', 'STON'),
  TOWN('highmoor', 'Highmoor', 'HIGH'),
  TOWN('millbrook', 'Millbrook', 'MILL'),
  TOWN('valdrheim', 'Valdrheim', 'VALD'),
  TOWN('aurelion', 'Aurelion', 'AURE'),
  TOWN('briarwatch', 'Briarwatch', 'BRIA'),
  TOWN('corvane', 'Corvane', 'CORV'),
  TOWN('saltmere', 'Saltmere', 'SALT'),
  TOWN('palmreach', 'Palmreach', 'PALM'),
  TOWN('sunspire', 'Sunspire', 'SUNS'),
  TOWN('dunewatch', 'Dunewatch', 'DUNE'),
  // hunting hubs: the doorstep, never the lair
  { key: 'pearl_pier', name: 'Pearl Pier', label: 'PIER', level: 25, value: 100, at: { x: 350, y: 561, z: 0 }, note: 'Steps out on Pearl Pier, above the whirlpool into the Sunken Reach.' },
  { key: 'dragonspire', name: 'Dragonspire Plateau', label: 'DRGN', level: 45, value: 100, at: { x: 287, y: 326, z: 0 }, note: 'Steps out on the Dragonspire Plateau, beside the way down into the Dragon Lair.' },
  { key: 'minotaur_hold', name: 'Minotaur Hold', label: 'MINO', level: 15, value: 100, at: { x: 486, y: 188, z: 0 }, note: 'Steps out at the gates of the Minotaur Hold.' },
  { key: 'gravewind', name: 'Gravewind Steppe', label: 'STEP', level: 55, value: 100, at: { x: 574, y: 70, z: 0 }, note: 'Steps out on the road through the Gravewind Steppe.' },
  { key: 'scorched_crags', name: 'Scorched Crags', label: 'CRAG', level: 80, value: 100, at: { x: 509, y: 640, z: 0 }, note: 'Steps out in the Scorched Crags, beside the way down into the Behemoth Halls.' },
];

export const TELEPORT_BY_KEY: Record<string, TeleportDest> = Object.fromEntries(TELEPORT_DESTS.map((d) => [d.key, d]));

/** Item id of a destination's rune. */
export const teleportRuneId = (key: string): string => `teleport_rune_${key}`;

/** Every teleport rune item id (shops, tests). */
export const TELEPORT_RUNES: string[] = TELEPORT_DESTS.map((d) => teleportRuneId(d.key));

/** Seconds of channelling before the jump. */
export const TELEPORT_CAST_SECONDS = 3;
/** Seconds before another teleport rune can be used (counted from the jump). */
export const TELEPORT_COOLDOWN_SECONDS = 60;
/** A fight (dealing or taking damage) blocks teleporting for this many seconds. */
export const TELEPORT_COMBAT_SECONDS = 6;
/** Already this close to the destination (same floor): the rune is not wasted. */
export const TELEPORT_NEAR_TILES = 8;

/**
 * Regions teleport magic cannot leave: the tutorial island (its own little instance)
 * and any arena. Named here so a future instance only needs a line.
 */
export const NO_TELEPORT_REGIONS = ["Wayfarer's Isle", "Wayfarer's Rest"];

export function teleportForbiddenRegion(name: string | undefined | null): boolean {
  if (!name) return false;
  return NO_TELEPORT_REGIONS.includes(name) || /\barena\b/i.test(name);
}

/** Where a destination's rune lands (before Game.teleport looks for a free tile), or null if the world lacks it. */
export function teleportTarget(world: WorldMap, d: TeleportDest): { x: number; y: number; z: number } | null {
  if (d.at) return { ...d.at };
  if (!d.town) return null;
  const name = d.name.toLowerCase();
  const r = world.regions.find((x) => x.temple && x.name.toLowerCase() === name);
  if (r?.temple) return { x: r.temple.x, y: r.temple.y, z: r.temple.z };
  return d.town === 'thornvale' ? { ...world.temple } : null;
}

/** A channel in progress (Session.teleport; never saved). */
export interface TeleportCast {
  dest: string;
  /** Item id being channelled (the rune is taken only when the jump happens). */
  item: string;
  /** Seconds left. */
  left: number;
  x: number;
  y: number;
  z: number;
}

export type TeleportCancel = 'moved' | 'hurt' | 'fight' | 'died' | 'gone';

/** Player-facing reason a channel broke off (English; translated on the client). */
export const TELEPORT_CANCEL_TEXT: Record<TeleportCancel, string> = {
  moved: 'You moved. The teleport fizzles.',
  hurt: 'The pain breaks your focus. The teleport fizzles.',
  fight: 'You are in a fight. The teleport fizzles.',
  died: 'The teleport fizzles.',
  gone: 'The rune is gone. The teleport fizzles.',
};
