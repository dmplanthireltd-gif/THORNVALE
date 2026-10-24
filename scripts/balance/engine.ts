/**
 * The balance simulator's engine: one headless Game with an open arena carved into the sea,
 * one fighter per vocation (re-dressed for any level), a competent-player brain, and the
 * measurements (hunts, training-dummy damage, duels). Used by scripts/balance-sim.ts.
 */
import { BufferedIntent, Game, inAreaShape, type Session } from '../../src/game/Game';
import { Enemy } from '../../src/game/enemies/Enemy';
import { ENEMIES, type EnemyDef } from '../../src/game/enemies/enemyDefs';
import { BOSS_UNIQUES, equipSlotFor, ITEMS, itemDef, type EquipSlot, type ItemDef } from '../../src/game/inventory/items';
import { SPELLS, SPELL_LIST, waveTiles, beamTiles, type SpellDef, type SpellId } from '../../src/game/magic/spells';
import { VOCATIONS, type Vocation } from '../../src/game/player/vocations';
import { addTries, COMBAT_SKILLS, skillForWeapon, startSkills, type CombatSkill, type Skills } from '../../src/game/player/skills';
import { combatSkillRate, expRate, SEASON_STAGES } from '../../src/game/progression/stages';
import { expForLevel, Player } from '../../src/game/player/Player';
import { NPCS } from '../../src/game/npc/npcs';
import { Ground, Obj, type EnemyKind } from '../../src/game/world/WorldMap';
import { chebyshev } from '../../src/game/core/types';
import { SETS } from '../../src/game/inventory/sets';

/** Replaces Math.random with a seeded generator (every run of the same code gives the same numbers). */
export function seedRandom(n: number): void {
  let seed = n >>> 0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the target season curve (hours played → level)
/** Hours of hunting to reach a level: the season goal (owner, 2026-10-23). Used to derive typical skills too. */
export const TARGET_HOURS: Array<[number, number]> = [
  [1, 0], [8, 0.25], [20, 1.5], [30, 3.2], [40, 5.5], [50, 8.5], [60, 12.5], [80, 21], [100, 32], [125, 55], [150, 85], [175, 140], [200, 215], [250, 420], [300, 700],
];
export function targetHours(level: number): number {
  const T = TARGET_HOURS;
  if (level <= T[0][0]) return 0;
  for (let i = 1; i < T.length; i++) {
    if (level <= T[i][0]) {
      const [l0, h0] = T[i - 1], [l1, h1] = T[i];
      return h0 + ((level - l0) / (l1 - l0)) * (h1 - h0);
    }
  }
  const [lA, hA] = T[T.length - 2], [lB, hB] = T[T.length - 1];
  return hB + ((level - lB) / (lB - lA)) * (hB - hA);
}

// ------------------------------------------------------------------ typical skills for a level
/**
 * Skills a character has after levelling on the target curve, hunting all the time:
 * weapon attacks 1,900 per hour (one swing or shot every 1.5 s, 80% of the time),
 * mana spent per hour = maxMana × (knight 6, paladin 12, mage 20), shield blows per
 * hour knight 1,600 / mage 400 (paladins hold a bow in both hands); every try is
 * multiplied by the season skill stages at the skill's level, like Game.trainSkill.
 */
export function typicalSkills(voc: Vocation, level: number, weaponSkill: CombatSkill): Skills {
  const s = startSkills();
  const v = VOCATIONS[voc];
  const manaRate = voc === 'knight' ? 6 : voc === 'paladin' ? 12 : 20;
  const shieldRate = voc === 'knight' ? 1600 : voc === 'paladin' ? 0 : 400;
  for (let l = 1; l < level; l++) {
    const dh = targetHours(l + 1) - targetHours(l);
    const maxMana = v.baseMana + (l - 1) * v.manaPerLevel;
    const add = (k: CombatSkill, n: number) => {
      // apply in small chunks so the stage follows the skill level
      for (let i = 0; i < 4; i++) addTries(s, k, (n / 4) * combatSkillRate(SEASON_STAGES, k, s[k].level), voc);
    };
    if (weaponSkill !== 'magic') add(weaponSkill, 1900 * dh);
    add('magic', maxMana * manaRate * dh + (weaponSkill === 'magic' ? 0 : 0));
    if (shieldRate) add('shielding', shieldRate * dh);
  }
  return s;
}

// ------------------------------------------------------------------ prices
export const SELL_PRICE = new Map<string, number>();
for (const n of Object.values(NPCS)) for (const e of n.sells ?? []) {
  const cur = SELL_PRICE.get(e.id);
  if (cur === undefined || e.price < cur) SELL_PRICE.set(e.id, e.price);
}
export const GOLD_PER_MANA = (SELL_PRICE.get('great_mana_potion') ?? 120) / (ITEMS.great_mana_potion.mana ?? 230);
/** What a supply costs the player: shop price, else conjured (blank rune + mana bought as potions). */
export function supplyPrice(id: string): number {
  const p = SELL_PRICE.get(id);
  if (p !== undefined) return p;
  const sp = SPELL_LIST.find((x) => x.conjure?.item === id);
  if (sp?.conjure) return ((sp.conjure.from === 'blank_rune' ? SELL_PRICE.get('blank_rune') ?? 10 : 0) + sp.mana * GOLD_PER_MANA) / sp.conjure.qty;
  return ITEMS[id]?.value ?? 0;
}

// ------------------------------------------------------------------ the game and its arena
seedRandom(12345);
export const g = new Game({ stages: SEASON_STAGES, testMode: true });
g.enemies.length = 0;
g.npcs.length = 0;
(g.worldEvents as unknown as { update: (dt: number) => void }).update = () => {};
export const W = g.world;
export const ARENA_R = 20;
/** An open grass square carved into empty sea far from everything (no regions, no traps, no hazards). */
export const ARENA = (() => {
  for (let cy = W.height - 30; cy > 30; cy -= 7) for (let cx = 30; cx < W.width - 30; cx += 7) {
    let ok = true;
    for (let dy = -ARENA_R - 4; dy <= ARENA_R + 4 && ok; dy += 2) for (let dx = -ARENA_R - 4; dx <= ARENA_R + 4 && ok; dx += 2) {
      const x = cx + dx, y = cy + dy;
      if (W.getGround(x, y, 0) !== Ground.DeepWater || W.regionAt(x, y, 0)) ok = false;
    }
    if (!ok) continue;
    for (let dy = -ARENA_R; dy <= ARENA_R; dy++) for (let dx = -ARENA_R; dx <= ARENA_R; dx++) {
      W.setGround(cx + dx, cy + dy, Ground.Grass, 0);
      W.setObj(cx + dx, cy + dy, Obj.None, 0);
    }
    return { x: cx, y: cy };
  }
  throw new Error('no open sea for the arena');
})();

// ------------------------------------------------------------------ gear
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
 * Equipment a typical character wears (was the arena bots' kit): the best full gear set its vocation can wear at
 * this level (all four body pieces, so the 4-piece bonus counts; near-equal sets
 * are picked at random for variety), then the best item for every other slot.
 */
export function typicalKit(voc: Vocation, lvl: number): { gear: Partial<Record<EquipSlot, { id: string; qty: number }>>; set: string | null } {
  const gear: Partial<Record<EquipSlot, { id: string; qty: number }>> = {};
  // 1) the set
  const options: Array<{ id: string; score: number; pieces: ItemDef[] }> = [];
  for (const set of SETS) {
    if (set.vocations && !set.vocations.includes(voc)) continue;
    const pieces = set.pieces.map((id) => ITEMS[id]).filter((d): d is ItemDef => !!d);
    const body = pieces.filter((d) => BODY.includes(equipSlotFor(d)!));
    if (body.length < 4 || !body.every((d) => usable(d, voc, lvl))) continue;
    const own = set.vocations && set.vocations.length <= 2 && set.vocations.includes(voc) ? (set.vocations.length === 1 ? 12 : 6) : 0;
    options.push({ id: set.id, score: set.level + own + Math.random() * 5, pieces });
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

// ------------------------------------------------------------------ fighters
export interface Fighter {
  s: Session;
  voc: Vocation;
  level: number;
  skills: Skills;
  brain: Brain;
  park: { x: number; y: number };
}

export function weaponSkillOf(gear: ReturnType<typeof typicalKit>['gear']): CombatSkill {
  const w = gear.weapon ? itemDef(gear.weapon.id) : null;
  return skillForWeapon(w?.weaponType);
}

export const POTIONS = {
  hp: ['great_health_potion', 'strong_health_potion', 'health_potion'],
  mp: ['great_mana_potion', 'strong_mana_potion', 'mana_potion'],
};
export function bestUsable(ids: string[], voc: Vocation, level: number): string {
  for (const id of ids) {
    const d = ITEMS[id];
    if (d && (!d.level || d.level <= level) && (!d.vocations || d.vocations.includes(voc))) return id;
  }
  return ids[ids.length - 1];
}
/** Attack runes a hunting character of this vocation carries (the AI picks among them). */
export function runesFor(voc: Vocation, level: number): string[] {
  const list = voc === 'paladin' ? ['sunlance_rune']
    : voc === 'sorcerer' ? ['death_rune', 'thunderbolt_rune', 'fireball_rune', 'stormcloud_rune', 'spark_rune']
      : voc === 'druid' ? ['death_rune', 'icicle_rune', 'rockspike_rune', 'avalanche_rune', 'stoneshower_rune', 'spark_rune'] : [];
  return list.filter((id) => {
    const d = ITEMS[id];
    return d && (!d.level || d.level <= level) && (!d.vocations || d.vocations.includes(voc));
  }).slice(0, 4);
}

/** One session per vocation, re-dressed for every level asked for (keeps the tick cheap). */
export const fighters = new Map<Vocation, Fighter>();
let parkNo = 0;
export function fighter(voc: Vocation, level: number): Fighter {
  let f = fighters.get(voc);
  if (!f) {
    const s = g.addPlayer(`Sim ${voc}`, { intent: new BufferedIntent(), vocation: voc });
    s.bot = true;
    f = { s, voc, level: -1, skills: startSkills(), brain: null as unknown as Brain, park: { x: ARENA.x - ARENA_R + 1 + parkNo++ * 2, y: ARENA.y + ARENA_R - 1 } };
    f.brain = new Brain(f);
    fighters.set(voc, f);
    g.setFightMode(s.id, voc === 'knight' ? 'offensive' : 'balanced', true);
  }
  if (f.level !== level) {
    const s = f.s;
    f.level = level;
    const kit = typicalKit(voc, level);
    f.skills = typicalSkills(voc, level, weaponSkillOf(kit.gear));
    s.spells.clear();
    for (const id of Object.keys(SPELLS) as SpellId[]) if (SPELLS[id].vocations.includes(voc) && SPELLS[id].level <= level) s.spells.add(id);
    for (const k of Object.keys(s.inventory.equipment) as Array<keyof typeof s.inventory.equipment>) s.inventory.equipment[k] = null;
    for (const [slot, st] of Object.entries(kit.gear)) (s.inventory.equipment as Record<string, { id: string; qty: number } | null>)[slot] = { ...st! };
    resetFighter(f);
  }
  return f;
}

/** Out of the way: monsters ignore it, it stands at the arena's edge. */
export function park(f: Fighter): void {
  resetFighter(f, f.park);
  f.s.player.ignoredByMonsters = true;
}
export function parkAll(): void {
  for (const f of fighters.values()) park(f);
}

export function cloneSkills(k: Skills): Skills {
  const o = {} as Skills;
  for (const n of COMBAT_SKILLS) o[n] = { ...k[n] };
  return o;
}

/** Back to the fighter's level, skills, full health and mana, fresh supplies, at the arena centre. */
export function resetFighter(f: Fighter, at = { x: ARENA.x, y: ARENA.y }): void {
  const { s } = f;
  const p = s.player;
  p.level = f.level;
  p.exp = expForLevel(f.level);
  s.skills = cloneSkills(f.skills);
  p.dead = false;
  p.ignoredByMonsters = false;
  p.buffs = { ...p.buffs, haste: 0, magicShield: 0, strongHaste: 0, poisoned: 0, rooted: 0, berserk: 0, bullseye: 0, mastermind: 0 };
  p.poisonDamage = 0;
  p.webbed = 0;
  p.targetId = null;
  p.path = [];
  p.pzLock = 0;
  p.whiteSkullUntil = 0;
  p.attackedBy.clear();
  for (const k of Object.keys(p.spellCooldowns)) p.spellCooldowns[k] = 0;
  for (const k of Object.keys(p.groupCooldowns) as Array<keyof typeof p.groupCooldowns>) p.groupCooldowns[k] = 0;
  g.refreshStats(s);
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  g.teleport(p, at.x, at.y, 0);
  restock(f);
}

export const STOCK = 100;
/** Potions and runes of each kind carried into a duel. */
export const DUEL_STOCK = 30;
export function restock(f: Fighter, n = STOCK): void {
  const inv = f.s.inventory;
  for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
  inv.add(bestUsable(POTIONS.hp, f.voc, f.level), n);
  inv.add(bestUsable(POTIONS.mp, f.voc, f.level), n);
  for (const r of runesFor(f.voc, f.level)) inv.add(r, n);
  const ammo = inv.equipment.ammo;
  if (ammo) ammo.qty = 400;
}

/** Supplies used since the last restock, in gold. */
export function suppliesUsed(f: Fighter): number {
  const inv = f.s.inventory;
  let gold = 0;
  for (const id of [bestUsable(POTIONS.hp, f.voc, f.level), bestUsable(POTIONS.mp, f.voc, f.level), ...runesFor(f.voc, f.level)]) gold += (STOCK - inv.count(id)) * supplyPrice(id);
  const ammo = inv.equipment.ammo;
  if (ammo) gold += (400 - ammo.qty) * supplyPrice(ammo.id);
  return gold;
}

// ------------------------------------------------------------------ the brain (a competent player)
export type Foe = Enemy | Player;
export const avgFormula = (min: number, max: number, perLevel: number, power: number, mult: number) =>
  ((min + perLevel * power * 0.7) * mult + (max + perLevel * power) * mult) / 2;

export class Brain {
  /** Players to fight (duels) instead of monsters. */
  foes: Player[] | null = null;
  /**
   * hunt: what pays on a hunting trip (spells; area runes only into a crowd of 3+);
   * burst: everything, single-target runes too (duels, bosses).
   */
  mode: 'hunt' | 'burst' = 'hunt';
  constructor(readonly f: Fighter) {}

  private get s() { return this.f.s; }
  private get p() { return this.f.s.player; }

  enemies(): Foe[] {
    if (this.foes) return this.foes.filter((o) => !o.dead);
    return g.enemies.filter((e) => !e.dead && !e.gone && e.z === this.p.z);
  }

  resist(t: Foe, el: string): number {
    return g.targetResist(t, el as never);
  }

  magicMult(): number {
    return VOCATIONS[this.f.voc].magic * (1 + g.magicBonus(this.s) / 100);
  }

  spellAvg(sp: SpellDef): number {
    const s = this.s;
    const voc = VOCATIONS[this.f.voc];
    if (sp.weaponScale) {
      const w = s.inventory.equipped('weapon');
      const atk = (w ? itemDef(w).attack ?? 4 : 4) + g.attackBonus(s);
      const physical = sp.element === 'physical';
      const mult = physical ? Math.max(voc.melee, voc.distance) : this.magicMult();
      const skill: CombatSkill = voc.distance > voc.melee ? 'distance' : g.weaponSkill(s) === 'magic' ? 'fist' : g.weaponSkill(s);
      const power = physical ? g.weaponPower(s, skill) : g.magicPower(s);
      return avgFormula(sp.min! + atk * sp.weaponScale, sp.max! + atk * sp.weaponScale * 1.6, sp.perLevel!, power, mult);
    }
    return avgFormula(sp.min!, sp.max!, sp.perLevel!, g.magicPower(s), this.magicMult());
  }

  runeAvg(d: ItemDef): number {
    const r = d.rune!;
    return avgFormula(r.min, r.max, r.perLevel, g.magicPower(this.s), this.magicMult());
  }

  /** Sum of damage over the creatures hit (capped at their health). */
  value(per: number, el: string, hit: Foe[]): number {
    let v = 0;
    for (const t of hit) v += Math.min(t.hp, per * (1 - this.resist(t, el) / 100));
    return v;
  }

  manaReserve(): number {
    const v = this.f.voc;
    const heal = v === 'knight' ? 'exura_ico' : v === 'paladin' ? (this.f.level >= 35 ? 'exura_san' : 'exura_gran') : this.f.level >= 30 ? 'exura_vita' : 'exura_gran';
    return (SPELLS[heal as SpellId]?.mana ?? 20) * 1.5;
  }

  target(): Foe | null {
    const p = this.p;
    const list = this.enemies();
    let best: Foe | null = null, score = Infinity;
    for (const e of list) {
      const d = chebyshev(p.x, p.y, e.x, e.y);
      const sc = d * 50 + e.hp / Math.max(1, e.maxHp) * 100;
      if (sc < score) { score = sc; best = e; }
    }
    return best;
  }

  potion(kind: 'hp' | 'mp'): boolean {
    const p = this.p;
    if (p.groupCooldowns.potion > 0) return false;
    const id = bestUsable(POTIONS[kind], this.f.voc, this.f.level);
    const slot = this.s.inventory.slots.findIndex((x) => x?.id === id);
    if (slot < 0) return false;
    g.useSlot(this.s.id, slot);
    return true;
  }

  cast(id: SpellId): boolean {
    const p = this.p;
    const sp = SPELLS[id];
    if (!this.s.spells.has(id) || (p.spellCooldowns[id] ?? 0) > 0 || p.groupCooldowns[sp.group] > 0 || p.mana < sp.mana) return false;
    const before = p.mana;
    g.castSpell(this.s.id, id);
    return p.mana < before || sp.mana === 0;
  }

  heal(): void {
    const p = this.p;
    const v = this.f.voc;
    const hpf = p.hp / p.maxHp;
    // mages have the thinnest health: they heal earlier
    if (hpf < (v === 'sorcerer' || v === 'druid' ? 0.8 : 0.7) && p.groupCooldowns.heal <= 0) {
      const opts: SpellId[] = v === 'knight' ? ['exura_ico', 'exura'] : v === 'paladin' ? ['exura_san', 'exura_gran', 'exura'] : ['exura_vita', 'exura_gran', 'exura'];
      // light heals only while it is not urgent
      for (const id of opts) {
        if (!this.s.spells.has(id)) continue;
        if (this.cast(id)) break;
      }
    }
    const shielded = p.buffs.magicShield > 0;
    if (p.hp / p.maxHp < 0.45 && !(shielded && p.mana > p.maxMana * 0.2)) { if (this.potion('hp')) return; }
    if (p.mana / p.maxMana < (shielded ? 0.6 : 0.4) && p.hp / p.maxHp > 0.35) this.potion('mp');
  }

  support(engaged: boolean): void {
    const p = this.p;
    const v = this.f.voc;
    if (!engaged || p.groupCooldowns.support > 0) return;
    const mage = v === 'sorcerer' || v === 'druid';
    // no magic shield: Ultimate Healing gives about five hitpoints per mana point, the shield only one
    // ranged characters keep a haste up to kite; a knight hastes to run down a fleeing player
    if ((v !== 'knight' || this.foes) && p.buffs.haste <= 0 && p.buffs.strongHaste <= 0 && p.mana > this.manaReserve() * 2) {
      if (mage && this.cast('utani_gran_hur')) return;
      this.cast('utani_hur');
    }
  }

  /** Best attack spell or rune for this moment, by damage dealt (runes need a clear edge, they cost money). */
  attack(t: Foe): void {
    const p = this.p;
    const s = this.s;
    if (p.groupCooldowns.attack > 0) return;
    const foes = this.enemies();
    const reserve = this.manaReserve();
    let best: { v: number; go: () => void } | null = null;
    const consider = (v: number, go: () => void) => { if (v > 0 && (!best || v > best.v)) best = { v, go }; };
    const dT = chebyshev(p.x, p.y, t.x, t.y);
    const sees = g.canSee(p, t);
    for (const id of s.spells) {
      const sp = SPELLS[id];
      if (sp.group !== 'attack' || (p.spellCooldowns[id] ?? 0) > 0 || p.mana - sp.mana < (sp.mana > 100 ? reserve : reserve * 0.5) || sp.min === undefined) continue;
      const per = this.spellAvg(sp);
      const el = sp.element ?? 'energy';
      if (sp.kind === 'target') {
        if (dT <= (sp.range ?? 3) && sees) consider(this.value(per, el, [t]), () => g.castSpell(s.id, id));
      } else if (sp.kind === 'selfArea') {
        const r = sp.radius ?? 1;
        const hit = foes.filter((e) => (r > 1 ? inAreaShape(e.x - p.x, e.y - p.y, r) : chebyshev(e.x, e.y, p.x, p.y) <= r) && g.world.lineOfSight(p.x, p.y, e.x, e.y, p.z));
        // a big mana spell only for a crowd
        if (sp.mana >= 300 && hit.length < 3) continue;
        consider(this.value(per, el, hit), () => g.castSpell(s.id, id));
      } else if (sp.kind === 'wave' || sp.kind === 'beam') {
        for (const d of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
          const tiles = new Set((sp.kind === 'wave' ? waveTiles(p.x, p.y, d, sp.length ?? 4) : beamTiles(p.x, p.y, d, sp.length ?? 4)).map(([x, y]) => `${x},${y}`));
          const hit = foes.filter((e) => tiles.has(`${e.x},${e.y}`));
          consider(this.value(per, el, hit), () => { g.commandTurn(s.id, d.dx, d.dy); g.castSpell(s.id, id); });
        }
      }
    }
    const spellBest = best ? (best as { v: number }).v : 0;
    for (const rid of runesFor(this.f.voc, this.f.level)) {
      const slot = s.inventory.slots.findIndex((x) => x?.id === rid);
      if (slot < 0) continue;
      const d = ITEMS[rid];
      const r = d.rune!;
      const per = this.runeAvg(d);
      const el = r.element ?? 'energy';
      let v = 0, at = { x: t.x, y: t.y };
      // single-target runes cost too much for a hunting trip, except the cheap spark rune
      if (r.radius === 0 && this.mode === 'hunt' && supplyPrice(rid) > 10) continue;
      if (r.radius > 0) {
        for (const c of foes) {
          if (chebyshev(p.x, p.y, c.x, c.y) > r.range || !g.world.lineOfSight(p.x, p.y, c.x, c.y, p.z)) continue;
          const hit = foes.filter((e) => inAreaShape(e.x - c.x, e.y - c.y, r.radius));
          if (this.mode === 'hunt' && hit.length < 3) continue;
          const val = this.value(per, el, hit);
          if (val > v) { v = val; at = { x: c.x, y: c.y }; }
        }
      } else if (dT <= r.range && sees) v = this.value(per, el, [t]);
      if (v > spellBest * 1.15) consider(v, () => g.useRune(s.id, slot, at));
    }
    if (best) (best as { go: () => void }).go();
  }

  /** Ranged characters keep monsters at arm's length (circling the open ground); knights stand and fight. */
  move(t: Foe): void {
    const p = this.p;
    if (this.f.voc === 'knight' || p.moving) return;
    const foes = this.enemies().filter((e) => e instanceof Player ? e.vocation === 'knight' : !e.def.kite);
    const near = foes.filter((e) => chebyshev(e.x, e.y, p.x, p.y) <= 2);
    if (!near.length) return;
    const range = g.weaponRange(this.s);
    let best: { x: number; y: number; v: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = p.x + dx, y = p.y + dy;
      if (!g.world.canStep(p.x, p.y, p.z, dx, dy) || g.isOccupied(x, y, p.z, p.id, true)) continue;
      let md = 9, sum = 0;
      for (const e of foes) { const d = chebyshev(e.x, e.y, x, y); md = Math.min(md, d); sum += Math.min(6, d); }
      // stay well inside the open ground: corners are where kiting dies
      const off = Math.max(0, Math.hypot(x - ARENA.x, y - ARENA.y) - (ARENA_R - 9));
      const v = md * 10 + sum / foes.length * 3 - off * 8 - (chebyshev(x, y, t.x, t.y) > range ? 6 : 0) + Math.random();
      if (!best || v > best.v) best = { x, y, v };
    }
    let here = 9;
    for (const e of foes) here = Math.min(here, chebyshev(e.x, e.y, p.x, p.y));
    if (best && best.v > here * 10) g.commandMoveTo(this.s.id, best.x, best.y, 200);
  }

  tick(): void {
    const p = this.p;
    if (p.dead) return;
    this.heal();
    const t = this.target();
    this.support(!!t);
    if (!t) return;
    if (p.targetId !== t.id) g.commandAttack(this.s.id, t.id);
    this.attack(t);
    this.move(t);
  }
}

// ------------------------------------------------------------------ simulation core
export const DT = 0.05;
export interface Tally { exp: number; gold: number; loot: number; taken: number; dealt: number; deaths: number; kills: number; time: number; cost: number; timeouts: number }
export const newTally = (): Tally => ({ exp: 0, gold: 0, loot: 0, taken: 0, dealt: 0, deaths: 0, kills: 0, time: 0, cost: 0, timeouts: 0 });
let tally: Tally | null = null;
let watched = new Set<number>();
/** Starts counting for these players (boss fights in the report). */
export function setTally(ids: number[]): Tally {
  watched = new Set(ids);
  return (tally = newTally());
}
/** Stops counting and returns what was counted. */
export function takeTally(): Tally {
  const t = tally ?? newTally();
  tally = null;
  return t;
}

g.events.on((e) => {
  if (!tally) return;
  if (e.type === 'xp' && watched.has(e.to)) tally.exp += e.amount;
  else if (e.type === 'damage' && e.result === 'hit') {
    if (watched.has(e.targetId)) tally.taken += e.amount + (e.manaShield ?? 0);
    if (watched.has(e.sourceId)) tally.dealt += e.amount;
  } else if (e.type === 'death' && watched.has(e.id)) tally.deaths++;
  else if (e.type === 'death') tally.kills++;
});

export function clearMonsters(): void {
  for (const e of g.enemies) g.despawnEnemy(e);
  g.update(DT);
  g.enemies.length = 0;
}

/** One tick for everyone; keeps fighters at their level (no level-up heals, no lost levels). */
export function step(fs: Fighter[]): void {
  for (const f of fs) f.brain.tick();
  g.update(DT);
  for (const f of fs) {
    const p = f.s.player;
    if (p.level !== f.level) {
      const hp = p.hp, mp = p.mana;
      p.level = f.level;
      g.refreshStats(f.s);
      p.hp = Math.min(hp, p.maxHp);
      p.mana = Math.min(mp, p.maxMana);
    }
    p.exp = expForLevel(f.level);
  }
  // loot: monster bags are counted (gold, and items at what a trader pays) and cleared away
  for (let i = g.bags.length - 1; i >= 0; i--) {
    const b = g.bags[i];
    if (tally && !b.corpse) for (const it of b.items) {
      if (it.id === 'gold') tally.gold += it.qty;
      else tally.loot += (ITEMS[it.id]?.value ?? 0) * it.qty;
    }
    g.bags.splice(i, 1);
  }
  if (tally) tally.time += DT;
}

export function spawnPack(kinds: EnemyKind[], around: { x: number; y: number }, dist: number): Enemy[] {
  const out: Enemy[] = [];
  kinds.forEach((k, i) => {
    const a = (i / kinds.length) * Math.PI * 2 + Math.random() * 0.8;
    const e = g.spawnEnemy(k, Math.round(around.x + Math.cos(a) * dist), Math.round(around.y + Math.sin(a) * dist), 0, { tag: 'sim', radius: 3, alwaysAwake: true });
    if (e) {
      e.state = 'chase';
      e.targetId = null;
      out.push(e);
    }
  });
  return out;
}

// ------------------------------------------------------------------ hunting areas
/**
 * Recommended level of each floor of the regions that span several floors (their label shows a
 * range such as "15–35"); single-floor regions use their label. Written by the 2026-10-24 tuning.
 */
export const FLOOR_BANDS: Record<string, number> = {
  'Grimtusk Fortress|0': 15, 'Grimtusk Fortress|-1': 35, 'Grimtusk Fortress|1': 20, "Smugglers' Cove|0": 5, "Smugglers' Cove|-1": 5,
  'Silverbough Fortress|0': 15, 'Silverbough Fortress|1': 20, 'Bonecrag|0': 15, 'Bonecrag|-1': 105, 'Cyclops Isle|0': 30, 'Cyclops Isle|-1': 30,
  'Minotaur Hold|0': 15, 'Minotaur Hold|-1': 20, 'Cinder Isle|0': 40, 'Cinder Isle|-1': 105, 'Jotun Isle|0': 60, 'Jotun Isle|-1': 60,
};
export interface Area { name: string; z: number; band: number; kinds: Map<EnemyKind, number>; capacity: number }
export function areaList(): Area[] {
  const m = new Map<string, Area>();
  for (const sp of W.spawns) {
    const d = ENEMIES[sp.kind];
    if (d.boss) continue;
    const r = W.regionAt(sp.x, sp.y, sp.z);
    if (!r || r.safe) continue;
    const band = FLOOR_BANDS[`${r.name}|${sp.z}`] ?? parseInt(r.level, 10);
    if (!Number.isFinite(band)) continue;
    const key = `${r.name}|${sp.z}`;
    let a = m.get(key);
    if (!a) m.set(key, (a = { name: sp.z === 0 || r.z0 === r.z1 ? r.name : `${r.name} (${sp.z})`, z: sp.z, band, kinds: new Map(), capacity: 0 }));
    a.kinds.set(sp.kind, (a.kinds.get(sp.kind) ?? 0) + 1);
  }
  const list = [...m.values()].filter((a) => [...a.kinds.values()].reduce((x, y) => x + y, 0) >= 4);
  for (const a of list) for (const [k, n] of a.kinds) a.capacity += (n * ENEMIES[k].exp * 3600) / ENEMIES[k].respawn;
  return list.sort((a, b) => a.band - b.band || a.name.localeCompare(b.name));
}

export function pickKinds(a: Area, n: number): EnemyKind[] {
  const all = [...a.kinds.entries()];
  const total = all.reduce((x, [, c]) => x + c, 0);
  const out: EnemyKind[] = [];
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total;
    for (const [k, c] of all) { r -= c; if (r <= 0) { out.push(k); break; } }
  }
  return out;
}

export interface HuntResult { expH: number; rawExpH: number; costPerKill: number; goldH: number; lootH: number; costH: number; profitH: number; dtps: number; deathsH: number; killsH: number; capped: boolean }

/** Hunts an area for `minutes` of game time: packs of `group` monsters, a walk of `walk` seconds between packs. */
export function hunt(f: Fighter, a: Area, group: number, minutes: number): HuntResult {
  const tl = (tally = newTally());
  watched = new Set([f.s.id]);
  parkAll();
  resetFighter(f);
  const walk = group > 1 ? 14 : 7;
  while (tl.time < minutes * 60) {
    clearMonsters();
    g.teleport(f.s.player, ARENA.x, ARENA.y, 0);
    const pack = spawnPack(pickKinds(a, group), ARENA, 5);
    let t = 0;
    while (pack.some((e) => !e.dead) && !f.s.player.dead && t < 150) { step([f]); t += DT; }
    if (t >= 150) tl.timeouts++;
    if (f.s.player.dead) {
      // a death: back to full, a minute lost walking back from the temple
      tl.time += 60;
      tl.cost += suppliesUsed(f);
      resetFighter(f);
    }
    clearMonsters();
    for (let w = 0; w < walk; w += DT) step([f]);
    tl.cost += suppliesUsed(f);
    restock(f);
  }
  tally = null;
  const h = tl.time / 3600;
  const capH = a.capacity * expRate(SEASON_STAGES, f.level);
  const expH = Math.min(tl.exp / h, capH);
  return {
    expH, rawExpH: tl.exp / h, costPerKill: tl.cost / Math.max(1, tl.kills), goldH: tl.gold / h, lootH: tl.loot / h, costH: tl.cost / h, profitH: (tl.gold + tl.loot - tl.cost) / h,
    dtps: tl.taken / tl.time, deathsH: tl.deaths / h, killsH: tl.kills / h, capped: tl.exp / h > capH,
  };
}

// ------------------------------------------------------------------ dummy DPS
export const DUMMY: EnemyDef = { ...ENEMIES.rat, name: 'Training Dummy', maxHp: 1e9, minDmg: 0, maxDmg: 0, armor: 0, abilities: [], resist: {}, aggroRange: 0, wanderRadius: 0, stepTime: 1e6, exp: 0, loot: [], kite: undefined };
// dummies never take a step
export const plainStep = g.tryStep.bind(g);
g.tryStep = (c, dx, dy) => (c instanceof Enemy && c.tag === 'dummy' ? false : plainStep(c, dx, dy));

export function dps(f: Fighter, n: number, armor: number, seconds: number, mode: 'hunt' | 'burst' = 'hunt'): number {
  f.brain.mode = mode;
  const tl = (tally = newTally());
  watched = new Set([f.s.id]);
  parkAll();
  resetFighter(f);
  clearMonsters();
  const p = f.s.player;
  const def = { ...DUMMY, armor };
  // knights: a ring around them; ranged: a tight block two to four tiles away (where a lured pack stands)
  const spots: Array<[number, number]> = f.voc === 'knight'
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    : [[2, 0], [2, 1], [3, 0], [3, 1], [2, -1], [3, -1], [4, 0], [4, 1]];
  for (let i = 0; i < n; i++) {
    const e = g.spawnEnemy('rat', p.x + spots[i][0], p.y + spots[i][1], 0, { tag: 'dummy', radius: 0, alwaysAwake: true });
    if (!e) continue;
    (e as unknown as { def: EnemyDef }).def = def;
    e.maxHp = e.hp = 1e9;
    e.stepTime = 1e6;
  }
  for (let t = 0; t < seconds; t += DT) step([f]);
  tally = null;
  clearMonsters();
  f.brain.mode = 'hunt';
  return tl.dealt / tl.time;
}

// ------------------------------------------------------------------ duels
export function duel(a: Fighter, b: Fighter, maxSec: number): number {
  g.pvp = true;
  parkAll();
  clearMonsters();
  resetFighter(a, { x: ARENA.x - 3, y: ARENA.y });
  resetFighter(b, { x: ARENA.x + 3, y: ARENA.y });
  // a duel is fought with what a character carries into a fight: 30 of each potion and rune
  for (const f of [a, b]) { f.s.player.secure = false; restock(f, DUEL_STOCK); }
  a.brain.foes = [b.s.player];
  b.brain.foes = [a.s.player];
  a.brain.mode = b.brain.mode = 'burst';
  let t = 0;
  while (!a.s.player.dead && !b.s.player.dead && t < maxSec) { step([a, b]); t += DT; }
  const r = a.s.player.dead && !b.s.player.dead ? 0 : b.s.player.dead && !a.s.player.dead ? 1
    : a.s.player.hp / a.s.player.maxHp > b.s.player.hp / b.s.player.maxHp ? 0.75 : 0.25;
  a.brain.foes = b.brain.foes = null;
  a.brain.mode = b.brain.mode = 'hunt';
  g.pvp = false;
  resetFighter(a);
  resetFighter(b);
  return r;
}

/** Experience per hour (after stages) a character of this level needs to follow the target curve. */
export function targetExpH(level: number): number {
  return (expForLevel(level + 1) - expForLevel(level)) / Math.max(1e-6, targetHours(level + 1) - targetHours(level));
}
