import { chebyshev } from '../core/types';
import { describeStack, type Game, type Session } from '../Game';
import { isItem, itemDef, type Bonus, type ItemStack } from '../inventory/items';
import type { NonCombatSkill } from '../gathering/skills';
import {
  foxChance, FOX_REACH, FOX_SNIFF_SECONDS, isPetId, PET_BY_ID, PET_DEFS, PET_MAX_LEVEL, PET_SKILL, PET_XP_SHARE, petBonus, petForItem, petGatherBoost,
  petLevelForXp, POUCH_SLOTS, ravenRange, RAVEN_REPEAT_MS, SKILL_PETS, type PetDef, type PetId,
} from './petDefs';

/**
 * Everything one character has to do with pets. Saved as `pets` (save v12+):
 * the item of the pet that is out, every pet's experience, and the tortoise pouch.
 *
 * Rules that keep items safe:
 * - The pet that is out carries its own item (`active`), so it is never in the backpack and
 *   never lost on death; pet items in the backpack drop with the backpack like anything else.
 * - The pouch can only hold items while the tortoise is out, and the tortoise cannot be sent
 *   away (or swapped) while the pouch holds something. On death the pouch goes into the body.
 */
export interface PetState {
  /** Item id of the pet that is out, or null. */
  active: string | null;
  /** Pet experience per pet id. */
  xp: Partial<Record<PetId, number>>;
  /** Tortoise pouch (POUCH_SLOTS). */
  pouch: (ItemStack | null)[];
  /** Runtime only: the pouch window is open. */
  pouchOpen: boolean;
  /** Runtime only: seconds to the fox's next sniff. */
  foxT: number;
  /** Runtime only: raven warnings (player id → wall-clock ms of the last warning). */
  warned: Map<number, number>;
}

/** What the player's own client is sent (snapshot `pet`, only when changed). */
export interface PetView {
  /** Pet item that is out ('' = none). */
  a: string;
  /** Experience per pet id (only pets with any). */
  xp: Partial<Record<PetId, number>>;
  /** Pouch contents. */
  pc: (ItemStack | null)[];
  /** Pouch window open. */
  po: 0 | 1;
}

export function emptyPets(): PetState {
  return { active: null, xp: {}, pouch: new Array(POUCH_SLOTS).fill(null), pouchOpen: false, foxT: FOX_SNIFF_SECONDS, warned: new Map() };
}

/** Save block → state. Unknown pets and items never vanish: unknown pouch items go to `lost`. */
export function parsePets(raw: unknown, lost: ItemStack[] = []): PetState {
  const st = emptyPets();
  if (!raw || typeof raw !== 'object') return st;
  const r = raw as { active?: unknown; xp?: unknown; pouch?: unknown };
  if (typeof r.active === 'string') {
    if (petForItem(r.active)) st.active = r.active;
    else lost.push({ id: r.active, qty: 1 });
  }
  if (r.xp && typeof r.xp === 'object') {
    for (const [k, v] of Object.entries(r.xp as Record<string, unknown>)) {
      const n = Number(v);
      if (isPetId(k) && Number.isFinite(n) && n > 0) st.xp[k] = Math.floor(n);
    }
  }
  if (Array.isArray(r.pouch)) {
    let i = 0;
    for (const it of r.pouch) {
      if (!it || typeof it !== 'object' || typeof (it as ItemStack).id !== 'string') { i++; continue; }
      const stack = { id: (it as ItemStack).id, qty: Math.max(1, Math.floor(Number((it as ItemStack).qty)) || 1) };
      if (i < POUCH_SLOTS && isItem(stack.id)) st.pouch[i] = stack;
      else lost.push(stack);
      i++;
    }
  }
  return st;
}

/** State → save block. */
export function savePets(st: PetState): { active: string | null; xp: Partial<Record<PetId, number>>; pouch: (ItemStack | null)[] } {
  return { active: st.active, xp: { ...st.xp }, pouch: st.pouch.map((x) => (x ? { ...x } : null)) };
}

export function petsView(st: PetState): PetView {
  return { a: st.active ?? '', xp: { ...st.xp }, pc: st.pouch.map((x) => (x ? { ...x } : null)), po: st.pouchOpen ? 1 : 0 };
}

/** Online mirror: applies the own-player view. */
export function applyPetsView(st: PetState, v: PetView): void {
  st.active = v.a && petForItem(v.a) ? v.a : null;
  st.xp = {};
  for (const [k, n] of Object.entries(v.xp ?? {})) if (isPetId(k) && typeof n === 'number') st.xp[k] = n;
  st.pouch = new Array(POUCH_SLOTS).fill(null);
  (v.pc ?? []).slice(0, POUCH_SLOTS).forEach((x, i) => { if (x && isItem(x.id)) st.pouch[i] = { id: x.id, qty: x.qty }; });
  st.pouchOpen = v.po === 1;
}

/** The pet that is out, or null. */
export function activePet(st: PetState): PetDef | null {
  return petForItem(st.active);
}

export function petLevel(st: PetState, id: PetId): number {
  return petLevelForXp(st.xp[id] ?? 0);
}

/** Compact look field for other players: "pet_fox:3" ('' = no pet). */
export function petLook(st: PetState): string {
  const d = activePet(st);
  return d ? `${d.item}:${petLevel(st, d.id)}` : '';
}

export function parsePetLook(v: unknown): { item: string; level: number } | null {
  if (typeof v !== 'string' || !v) return null;
  const [item, lv] = v.split(':');
  if (!petForItem(item)) return null;
  return { item, level: Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(Number(lv)) || 1)) };
}

const pouchEmpty = (st: PetState) => st.pouch.every((x) => !x);

export class PetSystem {
  constructor(private readonly game: Game) {}

  // ---------------------------------------------------------------- calling and sending away

  /** Using a pet item from the backpack: call it, or swap it with the pet that is out. */
  useSlot(s: Session, slot: number): void {
    const g = this.game;
    const st = s.inventory.slots[slot];
    const def = petForItem(st?.id);
    if (!st || !def || s.player.dead) return;
    const pets = s.pets;
    const cur = activePet(pets);
    if (cur && cur.id === 'tortoise' && !pouchEmpty(pets)) {
      return g.msg(s.id, `Your ${cur.name} still carries things in its pouch. Empty the pouch first.`, 'warn');
    }
    // swap: the pet that was out takes the used item's place in the backpack (no free slot needed)
    s.inventory.slots[slot] = cur ? { id: cur.item, qty: 1 } : null;
    pets.active = def.item;
    pets.pouchOpen = false;
    this.changed(s);
    g.msg(s.id, cur ? `${cur.name} goes back in your backpack and ${def.name} comes out to follow you.` : `${def.name} comes out to follow you. Open the pet window to see what it does.`, 'info');
    g.events.emit({ type: 'area', x: s.player.x, y: s.player.y, z: s.player.z, radius: 0, effect: 'light' });
  }

  /** Sends the pet back into the backpack. */
  dismiss(s: Session): void {
    const g = this.game;
    const pets = s.pets;
    const cur = activePet(pets);
    if (!cur) return;
    if (cur.id === 'tortoise' && !pouchEmpty(pets)) return g.msg(s.id, `Your ${cur.name} still carries things in its pouch. Empty the pouch first.`, 'warn');
    const left = s.inventory.add(cur.item, 1);
    if (left > 0) return g.msg(s.id, 'Your backpack is full. Make room before you send your pet away.', 'warn');
    pets.active = null;
    pets.pouchOpen = false;
    this.changed(s);
    g.msg(s.id, `${cur.name} climbs back into your backpack.`, 'info');
  }

  // ---------------------------------------------------------------- tortoise pouch

  private tortoise(s: Session): boolean {
    if (activePet(s.pets)?.id === 'tortoise') return true;
    this.game.msg(s.id, 'Only a Mossback Tortoise carries a pouch. Call one first.', 'warn');
    return false;
  }

  setPouchOpen(s: Session, open: boolean): void {
    if (open && !this.tortoise(s)) return;
    s.pets.pouchOpen = open;
  }

  /** Backpack slot → pouch. */
  put(s: Session, slot: number): void {
    const g = this.game;
    if (s.player.dead || !this.tortoise(s)) return;
    const st = s.inventory.slots[slot];
    if (!st) return;
    const d = itemDef(st.id);
    if (d.kind === 'pet') return g.msg(s.id, 'A pet will not ride in a pouch.', 'warn');
    const pouch = s.pets.pouch;
    let left = st.qty;
    if (d.stackable) {
      for (const p of pouch) {
        if (!p || p.id !== st.id || left <= 0) continue;
        const n = Math.min(left, d.maxStack - p.qty);
        p.qty += n;
        left -= n;
      }
    }
    if (left > 0) {
      const i = pouch.findIndex((x) => !x);
      if (i >= 0) {
        pouch[i] = { id: st.id, qty: left };
        left = 0;
      }
    }
    const moved = st.qty - left;
    if (moved <= 0) return g.msg(s.id, 'The pouch is full.', 'warn');
    s.inventory.removeFromSlot(slot, moved);
    s.pets.pouchOpen = true;
    this.changed(s, false);
    g.msg(s.id, `Your tortoise carries ${describeStack({ id: st.id, qty: moved })}.`, 'loot');
  }

  /** Pouch slot → backpack. */
  take(s: Session, index: number): void {
    const g = this.game;
    if (s.player.dead || !this.tortoise(s)) return;
    const it = s.pets.pouch[index];
    if (!it) return;
    const d = itemDef(it.id);
    const capLeft = s.player.capacity - s.inventory.weight();
    const want = Math.min(it.qty, d.weight > 0 ? Math.max(0, Math.floor(capLeft / d.weight)) : it.qty);
    if (want <= 0) return g.msg(s.id, 'It is too heavy for you to carry.', 'warn');
    const left = s.inventory.add(it.id, want);
    const taken = want - left;
    if (taken <= 0) return g.msg(s.id, 'Your backpack is full.', 'warn');
    it.qty -= taken;
    if (it.qty <= 0) s.pets.pouch[index] = null;
    this.changed(s, false);
    g.msg(s.id, `You take ${describeStack({ id: it.id, qty: taken })} from the pouch.`, 'loot');
  }

  /** Death: the pouch empties into the body, like the backpack. */
  takePouch(s: Session): ItemStack[] {
    const out = s.pets.pouch.filter((x): x is ItemStack => !!x).map((x) => ({ ...x }));
    if (out.length) {
      s.pets.pouch = new Array(POUCH_SLOTS).fill(null);
      s.pets.pouchOpen = false;
    }
    return out;
  }

  // ---------------------------------------------------------------- perks

  level(s: Session): number {
    const d = activePet(s.pets);
    return d ? petLevel(s.pets, d.id) : 0;
  }

  /** Stat bonus of the pet that is out (joins the gear bonuses: regen, speed, light, resistance). */
  bonus(s: Session): Bonus | null {
    const d = activePet(s.pets);
    return d ? petBonus(d.id, petLevel(s.pets, d.id)) : null;
  }

  /** Multiplier on the chop / mine / bite chance. */
  gatherBoost(s: Session, skill: NonCombatSkill): number {
    const d = activePet(s.pets);
    return d && PET_SKILL[d.id] === skill ? petGatherBoost(petLevel(s.pets, d.id)) : 1;
  }

  /** Light radius the pet adds underground (render reads it for the local player). */
  light(s: Session): number {
    return this.bonus(s)?.light ?? 0;
  }

  // ---------------------------------------------------------------- experience and finds

  /** Character experience gained (after stages): the pet that is out learns along. */
  onExp(s: Session, amount: number): void {
    const d = activePet(s.pets);
    if (!d || amount <= 0) return;
    const before = petLevel(s.pets, d.id);
    s.pets.xp[d.id] = Math.min(1e12, (s.pets.xp[d.id] ?? 0) + Math.floor(amount * PET_XP_SHARE));
    const after = petLevel(s.pets, d.id);
    if (after > before) {
      this.game.msg(s.id, `Your ${d.name} advanced to pet level ${after}${after >= PET_MAX_LEVEL ? ' (the highest)' : ''}.`, 'level');
      this.changed(s);
    }
  }

  /** A trade-skill gain: pet experience, and for logs, ores and catches a tiny chance to find a pet. */
  onSkill(s: Session, skill: NonCombatSkill, xp: number, rnd: () => number = Math.random): void {
    this.onExp(s, xp);
    const find = SKILL_PETS[skill];
    if (!find || xp <= 0 || s.bot || rnd() >= find.chance) return;
    this.givePet(s, find.item, skill === 'woodcutting' ? 'while chopping' : skill === 'mining' ? 'while mining' : 'while fishing');
  }

  /** Puts a found pet in the backpack (or at your feet) and tells the world. */
  givePet(s: Session, item: string, how: string): void {
    const g = this.game;
    const d = petForItem(item);
    if (!d) return;
    const p = s.player;
    if (s.inventory.add(item, 1) > 0) {
      g.dropItemsAt(p.x, p.y, p.z, [{ id: item, qty: 1 }]);
      g.msg(s.id, `You found a pet ${d.species} ${how}! Your backpack is full, so it waits at your feet.`, 'loot');
    } else {
      g.msg(s.id, `You found a pet ${d.species} ${how}! ${d.name} is in your backpack.`, 'loot');
      g.events.emit({ type: 'inventoryChanged', to: s.id });
    }
    g.announce('A pet!', `${p.name} found a pet ${d.species} ${how}!`, 'boss', false);
    s.wantsSave = true;
  }

  /** Monster loot rolled a pet: tell the world. */
  onLoot(looters: number[], items: ItemStack[], who: string): void {
    for (const it of items) {
      const d = petForItem(it.id);
      if (!d) continue;
      const names = looters.map((id) => this.game.getPlayer(id)?.name).filter(Boolean);
      this.game.announce('A pet!', `${names.length ? names.join(', ') : 'Someone'} found a pet ${d.species} in the loot of ${who}!`, 'boss', false);
    }
  }

  // ---------------------------------------------------------------- every tick

  update(dt: number): void {
    const g = this.game;
    if (!g.simulate) return;
    for (const s of g.sessions.values()) {
      const d = activePet(s.pets);
      if (!d || s.player.dead) {
        if (s.pets.pouchOpen && d?.id !== 'tortoise') s.pets.pouchOpen = false;
        continue;
      }
      if (d.id === 'fox') this.fox(s, dt);
      else if (d.id === 'raven') this.raven(s);
    }
  }

  /** The fox fetches gold from piles and bodies near you that you could loot yourself. */
  private fox(s: Session, dt: number): void {
    const pets = s.pets;
    pets.foxT -= dt;
    if (pets.foxT > 0) return;
    pets.foxT = FOX_SNIFF_SECONDS;
    const g = this.game;
    const p = s.player;
    const lvl = petLevel(pets, 'fox');
    for (const b of g.bags) {
      if (b.z !== p.z || chebyshev(b.x, b.y, p.x, p.y) > FOX_REACH) continue;
      const gi = b.items.findIndex((x) => x.id === 'gold');
      if (gi < 0 || !g.world.lineOfSight(p.x, p.y, b.x, b.y, p.z)) continue;
      if (Math.random() >= foxChance(lvl)) return;
      const it = b.items[gi];
      const w = itemDef('gold').weight;
      const capLeft = p.capacity - s.inventory.weight();
      const want = Math.min(it.qty, w > 0 ? Math.max(0, Math.floor(capLeft / w)) : it.qty);
      if (want <= 0) return;
      const taken = want - s.inventory.add('gold', want);
      if (taken <= 0) return;
      it.qty -= taken;
      if (it.qty <= 0) b.items.splice(gi, 1);
      if (b.corpse) g.events.emit({ type: 'bagChanged', bagId: b.id });
      if (!b.items.length && !b.corpse) {
        const i = g.bags.indexOf(b);
        if (i >= 0) g.bags.splice(i, 1);
        g.events.emit({ type: 'bagRemoved', bagId: b.id });
      }
      g.msg(s.id, `Your fox fetches ${describeStack({ id: 'gold', qty: taken })}.`, 'loot');
      g.events.emit({ type: 'inventoryChanged', to: s.id });
      return;
    }
  }

  /** The raven caws when a red-skulled player comes near (once a minute per player). */
  private raven(s: Session): void {
    const g = this.game;
    const p = s.player;
    const range = ravenRange(petLevel(s.pets, 'raven'));
    const now = g.now();
    for (const o of g.sessions.values()) {
      const q = o.player;
      if (o === s || q.dead || q.z !== p.z || chebyshev(q.x, q.y, p.x, p.y) > range || g.skullOf(q) !== 2) continue;
      const last = s.pets.warned.get(q.id) ?? 0;
      if (now - last < RAVEN_REPEAT_MS) continue;
      s.pets.warned.set(q.id, now);
      g.msg(s.id, `Your raven caws a warning: ${q.name} (red skull) is ${chebyshev(q.x, q.y, p.x, p.y)} tiles away!`, 'warn');
    }
  }

  private changed(s: Session, stats = true): void {
    if (stats) this.game.refreshStats(s);
    this.game.events.emit({ type: 'inventoryChanged', to: s.id });
    this.game.events.emit({ type: 'equipmentChanged', id: s.id });
    s.wantsSave = true;
  }
}

/** Every pet (UI lists, tests). */
export const ALL_PETS = PET_DEFS;
export { PET_BY_ID };
