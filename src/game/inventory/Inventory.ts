import { EQUIP_SLOTS, isItem, itemDef, type EquipSlot, type ItemStack } from './items';

/** Slots you always have (belt pouches); a backpack adds its own slots on top. */
export const POCKET_SLOTS = 8;
export const MAX_SLOTS = POCKET_SLOTS + 36;
/** Depot slots a free account can fill (premium: PREMIUM_DEPOT_SLOTS in premium/premium.ts). */
export const DEPOT_SLOTS = 60;
/** Length of every depot list: room for a premium depot, so nothing is ever cut off when premium ends. */
export const DEPOT_MAX_SLOTS = 120;

export type Equipment = Record<EquipSlot, ItemStack | null>;

export function emptyEquipment(): Equipment {
  return { head: null, amulet: null, backpack: null, armor: null, weapon: null, shield: null, legs: null, ring: null, ammo: null, feet: null, cape: null };
}

/** Backpack + equipment. Pure data with no rendering knowledge. */
export class Inventory {
  slots: (ItemStack | null)[] = new Array(MAX_SLOTS).fill(null);
  equipment: Equipment = emptyEquipment();

  /** Usable backpack slots right now. */
  size(): number {
    const bp = this.equipment.backpack;
    return POCKET_SLOTS + (bp ? itemDef(bp.id).slots ?? 0 : 0);
  }

  equipped(slot: EquipSlot): string | null {
    return this.equipment[slot]?.id ?? null;
  }

  /** Adds items, stacking where possible. Returns how many did not fit. */
  add(id: string, qty: number): number {
    const d = itemDef(id);
    let left = qty;
    const n = this.size();
    if (d.stackable) {
      for (let i = 0; i < n && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.qty < d.maxStack) {
          const take = Math.min(d.maxStack - s.qty, left);
          s.qty += take;
          left -= take;
        }
      }
    }
    for (let i = 0; i < n && left > 0; i++) {
      if (!this.slots[i]) {
        const take = d.stackable ? Math.min(d.maxStack, left) : 1;
        this.slots[i] = { id, qty: take };
        left -= take;
      }
    }
    return left;
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  has(id: string): boolean {
    return this.count(id) > 0 || Object.values(this.equipment).some((e) => e?.id === id);
  }

  removeById(id: string, qty: number): number {
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.qty, left);
        s.qty -= take;
        left -= take;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    return qty - left;
  }

  removeFromSlot(slot: number, qty: number): ItemStack | null {
    const s = this.slots[slot];
    if (!s) return null;
    const take = Math.min(qty, s.qty);
    s.qty -= take;
    if (s.qty <= 0) this.slots[slot] = null;
    return { id: s.id, qty: take };
  }

  freeSlots(): number {
    let n = 0;
    for (let i = 0; i < this.size(); i++) if (!this.slots[i]) n++;
    return n;
  }

  canFit(id: string, qty: number): boolean {
    const d = itemDef(id);
    let room = 0;
    for (let i = 0; i < this.size(); i++) {
      const s = this.slots[i];
      if (!s) room += d.stackable ? d.maxStack : 1;
      else if (d.stackable && s.id === id) room += d.maxStack - s.qty;
      if (room >= qty) return true;
    }
    return room >= qty;
  }

  /** Total weight carried, in ounces. */
  weight(): number {
    let w = 0;
    for (const s of this.slots) if (s) w += itemDef(s.id).weight * s.qty;
    for (const e of Object.values(this.equipment)) if (e) w += itemDef(e.id).weight * e.qty;
    return Math.round(w * 10) / 10;
  }

  /** Moves everything that sits outside the usable slot range back inside, where possible. */
  compact(): void {
    const n = this.size();
    for (let i = n; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s) continue;
      const free = this.slots.findIndex((x, j) => !x && j < n);
      if (free < 0) break;
      this.slots[free] = s;
      this.slots[i] = null;
    }
  }

  /** Items currently stranded beyond the usable slots (after swapping to a smaller backpack). */
  overflow(): number {
    let k = 0;
    for (let i = this.size(); i < this.slots.length; i++) if (this.slots[i]) k++;
    return k;
  }

  toJSON(): { slots: (ItemStack | null)[]; equipment: Equipment } {
    const eq = emptyEquipment();
    for (const k of EQUIP_SLOTS) eq[k] = this.equipment[k] ? { ...this.equipment[k]! } : null;
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), equipment: eq };
  }

  load(data: { slots: (ItemStack | null)[]; equipment: Record<string, ItemStack | string | null> }): void {
    this.slots = new Array(MAX_SLOTS).fill(null);
    data.slots.slice(0, MAX_SLOTS).forEach((s, i) => {
      if (s && isItem(s.id) && s.qty > 0) this.slots[i] = { id: s.id, qty: Math.floor(s.qty) };
    });
    this.equipment = emptyEquipment();
    for (const k of EQUIP_SLOTS) {
      const v = data.equipment?.[k];
      if (typeof v === 'string' && isItem(v)) this.equipment[k] = { id: v, qty: 1 };
      else if (v && typeof v === 'object' && isItem(v.id) && v.qty > 0) this.equipment[k] = { id: v.id, qty: Math.floor(v.qty) };
    }
  }
}

/** Plain list storage (depot lockers). */
/**
 * Like addToList, but new slots are only taken while fewer than `cap` slots are in
 * use. Topping up an existing stack is always allowed, and items already above the
 * cap stay where they are (a depot that shrank when premium ended keeps everything).
 */
export function addToCapped(list: (ItemStack | null)[], id: string, qty: number, cap: number): number {
  const d = itemDef(id);
  let left = qty;
  if (d.stackable) {
    for (const s of list) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < d.maxStack) {
        const take = Math.min(d.maxStack - s.qty, left);
        s.qty += take;
        left -= take;
      }
    }
  }
  let used = 0;
  for (const s of list) if (s) used++;
  for (let i = 0; i < list.length && left > 0 && used < cap; i++) {
    if (!list[i]) {
      const take = d.stackable ? Math.min(d.maxStack, left) : 1;
      list[i] = { id, qty: take };
      left -= take;
      used++;
    }
  }
  return left;
}

export function addToList(list: (ItemStack | null)[], id: string, qty: number): number {
  const d = itemDef(id);
  let left = qty;
  if (d.stackable) {
    for (const s of list) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < d.maxStack) {
        const take = Math.min(d.maxStack - s.qty, left);
        s.qty += take;
        left -= take;
      }
    }
  }
  for (let i = 0; i < list.length && left > 0; i++) {
    if (!list[i]) {
      const take = d.stackable ? Math.min(d.maxStack, left) : 1;
      list[i] = { id, qty: take };
      left -= take;
    }
  }
  return left;
}
