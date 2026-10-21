import { isItem, type ItemStack } from '../inventory/items';
import type { SaveData } from '../Game';
import { legacySkills } from '../player/skills';
import { isVocation } from '../player/vocations';

/**
 * Save-data versioning. Every save records the version that wrote it, and old
 * saves are upgraded one step at a time when they are loaded, so a big update
 * never wipes anyone's level, experience, loot, bank or depot.
 *
 * When you change the save format:
 *   1. bump SAVE_VERSION,
 *   2. add MIGRATIONS[oldVersion] that turns an old save into the new shape.
 * When you rename an item id, add it to ITEM_RENAMES. When you remove an item,
 * do nothing: players keep it in `lostItems` (stored with their save) and get it
 * back automatically as soon as an item with that id, or a rename for it, exists.
 */
export const SAVE_VERSION = 7;

/** Item ids that were renamed in an update: old id → new id. */
export const ITEM_RENAMES: Record<string, string> = {
  // e.g. 'fire_sword': 'ember_blade',
};

type Raw = Record<string, unknown> & { version: number };

/** MIGRATIONS[n] upgrades a version-n save to version n + 1. */
const MIGRATIONS: Record<number, (d: Raw) => Raw> = {
  // v1 (first prototype, one small village): equipment was stored as plain ids and the
  // old coordinates mean nothing in today's world, so the character starts at the temple.
  1: (d) => {
    const player = { ...(d.player as Record<string, unknown>), x: -1, y: -1, z: 0 };
    return { ...d, player, version: 2 };
  },
  // v2 → v3 (new 640×800 world): old coordinates point somewhere random in the new map,
  // so everyone wakes up at the Thornvale temple. Level, items, bank, depot and quests stay.
  2: (d) => {
    const player = { ...(d.player as Record<string, unknown>), x: -1, y: -1, z: 0, home: 'Thornvale' };
    return { ...d, player, version: 3 };
  },
  // v3 → v4 (PvP): every character starts unmarked, with secure mode on.
  3: (d) => ({ ...d, pvp: { secure: true, whiteSkullUntil: 0, redSkullUntil: 0, unjustKills: [] }, version: 4 }),
  // v4 → v5 (skills, woodcutting, market): fighting skills and magic level are set from the
  // vocation and level so every character hits and heals exactly as hard as before (rounded up);
  // woodcutting starts at level 1 and no market deliveries have been received yet.
  4: (d) => {
    const pl = (d.player ?? {}) as { vocation?: unknown; level?: unknown };
    const voc = isVocation(pl.vocation) ? pl.vocation : 'knight';
    const level = Math.max(1, Math.floor(Number(pl.level)) || 1);
    return { ...d, skills: legacySkills(voc, level), gathering: { woodcutting: 0 }, market: { claimed: [] }, version: 5 };
  },
  // v5 → v6: friends list
  5: (d) => ({ ...d, friends: Array.isArray(d.friends) ? d.friends : [], version: 6 }),
  // v6 → v7: fishing skill; everyone starts at fishing level 1 (woodcutting is kept)
  6: (d) => ({ ...d, gathering: { ...((d.gathering ?? {}) as Record<string, unknown>), fishing: 0 }, version: 7 }),
};

export interface MigrationResult {
  data: SaveData;
  /** Version the save was written with. */
  from: number;
  /** Items that no longer exist in the game (kept, not deleted). */
  lost: ItemStack[];
  /** Items given back because they exist again. */
  restored: ItemStack[];
}

export type MigrationError = 'invalid' | 'newer';

function mapStack(v: unknown, lost: ItemStack[]): ItemStack | null {
  if (!v) return null;
  let id: string;
  let qty = 1;
  if (typeof v === 'string') id = v;
  else if (typeof v === 'object' && typeof (v as ItemStack).id === 'string') {
    id = (v as ItemStack).id;
    qty = Math.max(1, Math.floor(Number((v as ItemStack).qty) || 1));
  } else return null;
  id = ITEM_RENAMES[id] ?? id;
  if (isItem(id)) return { id, qty };
  lost.push({ id, qty });
  return null;
}

/**
 * Upgrades any older save to the current format, renames moved item ids and
 * sets aside items that no longer exist. Returns an error for data that is not
 * a save, or that was written by a NEWER version of the game (which must never
 * be overwritten by this one).
 */
export function migrateSave(raw: unknown): MigrationResult | MigrationError {
  if (!raw || typeof raw !== 'object') return 'invalid';
  let d = JSON.parse(JSON.stringify(raw)) as Raw;
  const from = typeof d.version === 'number' ? d.version : NaN;
  if (!Number.isInteger(from) || from < 1) return 'invalid';
  if (from > SAVE_VERSION) return 'newer';
  for (let v = from; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return 'invalid';
    d = step(d);
  }

  const lost: ItemStack[] = [];
  const inv = (d.inventory ?? {}) as { slots?: unknown[]; equipment?: Record<string, unknown> };
  if (Array.isArray(inv.slots)) inv.slots = inv.slots.map((s) => mapStack(s, lost));
  if (inv.equipment && typeof inv.equipment === 'object') {
    for (const k of Object.keys(inv.equipment)) inv.equipment[k] = mapStack(inv.equipment[k], lost);
  }
  if (Array.isArray(d.depot)) d.depot = (d.depot as unknown[]).map((s) => mapStack(s, lost));

  // items set aside by earlier updates: give back whatever exists again
  const restored: ItemStack[] = [];
  const stillLost: ItemStack[] = [];
  for (const it of Array.isArray(d.lostItems) ? (d.lostItems as ItemStack[]) : []) {
    const id = ITEM_RENAMES[it?.id] ?? it?.id;
    if (typeof id === 'string' && isItem(id)) restored.push({ id, qty: Math.max(1, Math.floor(it.qty) || 1) });
    else if (it && typeof it.id === 'string') stillLost.push({ id: it.id, qty: Math.max(1, Math.floor(it.qty) || 1) });
  }
  d.lostItems = [...stillLost, ...lost];
  return { data: d as unknown as SaveData, from, lost, restored };
}
