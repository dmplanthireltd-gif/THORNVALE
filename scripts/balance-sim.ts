/**
 * Balance simulator: headless fights with the real Game code (combat, spells,
 * runes, potions, monster AI, exp stages, loot), driven by a "competent player"
 * brain for each vocation. It measures, per hunting area and vocation:
 * experience per hour (after stages), gold and loot per hour, supply cost per
 * hour, damage taken per second and deaths; damage per second against a
 * training dummy (single target, 4 and 8 targets); duels between vocations at
 * equal level and gear; and the levelling time curve (best safe area per level).
 *
 *   npx tsx scripts/balance-sim.ts              full report (markdown on stdout, ~15 min)
 *   npx tsx scripts/balance-sim.ts --quick      CI sanity mode (a few seconds of work): small checks, exit 1 on failure
 *   options: --minutes=N (hunt length, default 8), --seed=N, --only=areas|dps|duels|curve|bosses (comma list)
 *
 * Everything is seeded (Math.random is replaced), so two runs of the same code agree.
 * Assumptions (gear, skills, the player's choices) are written down in BIBLE §7 "Balance".
 */
declare const process: { exit(code: number): never; argv: string[] };
import { BufferedIntent, Game, inAreaShape, type Session } from '../src/game/Game';
import { Enemy } from '../src/game/enemies/Enemy';
import { ENEMIES, type EnemyDef } from '../src/game/enemies/enemyDefs';
import { ITEMS, itemDef, type ItemDef } from '../src/game/inventory/items';
import { SPELLS, SPELL_LIST, waveTiles, beamTiles, type SpellDef, type SpellId } from '../src/game/magic/spells';
import { VOCATIONS, VOCATION_IDS, type Vocation } from '../src/game/player/vocations';
import { addTries, COMBAT_SKILLS, skillForWeapon, startSkills, type CombatSkill, type Skills } from '../src/game/player/skills';
import { combatSkillRate, expRate, SEASON_STAGES } from '../src/game/progression/stages';
import { expForLevel, Player } from '../src/game/player/Player';
import { NPCS } from '../src/game/npc/npcs';
import { Ground, Obj, type EnemyKind } from '../src/game/world/WorldMap';
import { chebyshev } from '../src/game/core/types';
import { arenaKit } from '../server/pvpBots';

// ------------------------------------------------------------------ options & seeded randomness
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const opt = (k: string, d: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const HUNT_MIN = Number(opt('minutes', QUICK ? '1.5' : '8'));
const ONLY = new Set(opt('only', 'areas,dps,duels,curve,bosses').split(','));
let seed = Number(opt('seed', '12345')) >>> 0;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const out: string[] = [];
const T0 = Date.now();
const say = (s = '') => { out.push(s); console.log(s); };
const lap = (what: string) => console.error(`[${Math.round((Date.now() - T0) / 1000)} s] ${what}`);
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '—');
const f1 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : '—');
const pct = (n: number) => `${Math.round(n * 100)}%`;

// ------------------------------------------------------------------ the target season curve (hours played → level)
/** Hours of hunting to reach a level: the season goal (owner, 2026-10-23). Used to derive typical skills too. */
export const TARGET_HOURS: Array<[number, number]> = [
  [1, 0], [8, 0.4], [20, 2], [30, 4], [40, 6.5], [50, 9.5], [60, 13], [80, 21], [100, 32], [125, 55], [150, 85], [175, 140], [200, 215], [250, 420], [300, 700],
];
function targetHours(level: number): number {
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
const SELL_PRICE = new Map<string, number>();
for (const n of Object.values(NPCS)) for (const e of n.sells ?? []) {
  const cur = SELL_PRICE.get(e.id);
  if (cur === undefined || e.price < cur) SELL_PRICE.set(e.id, e.price);
}
const GOLD_PER_MANA = (SELL_PRICE.get('great_mana_potion') ?? 120) / (ITEMS.great_mana_potion.mana ?? 230);
/** What a supply costs the player: shop price, else conjured (blank rune + mana bought as potions). */
function supplyPrice(id: string): number {
  const p = SELL_PRICE.get(id);
  if (p !== undefined) return p;
  const sp = SPELL_LIST.find((x) => x.conjure?.item === id);
  if (sp?.conjure) return ((sp.conjure.from === 'blank_rune' ? SELL_PRICE.get('blank_rune') ?? 10 : 0) + sp.mana * GOLD_PER_MANA) / sp.conjure.qty;
  return ITEMS[id]?.value ?? 0;
}

// ------------------------------------------------------------------ the game and its arena
const g = new Game({ stages: SEASON_STAGES, testMode: true });
g.enemies.length = 0;
g.npcs.length = 0;
(g.worldEvents as unknown as { update: (dt: number) => void }).update = () => {};
const W = g.world;
const ARENA_R = 20;
/** An open grass square carved into empty sea far from everything (no regions, no traps, no hazards). */
const ARENA = (() => {
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

// ------------------------------------------------------------------ fighters
interface Fighter {
  s: Session;
  voc: Vocation;
  level: number;
  skills: Skills;
  brain: Brain;
  park: { x: number; y: number };
}

function weaponSkillOf(gear: ReturnType<typeof arenaKit>['gear']): CombatSkill {
  const w = gear.weapon ? itemDef(gear.weapon.id) : null;
  return skillForWeapon(w?.weaponType);
}

const POTIONS = {
  hp: ['great_health_potion', 'strong_health_potion', 'health_potion'],
  mp: ['great_mana_potion', 'strong_mana_potion', 'mana_potion'],
};
function bestUsable(ids: string[], voc: Vocation, level: number): string {
  for (const id of ids) {
    const d = ITEMS[id];
    if (d && (!d.level || d.level <= level) && (!d.vocations || d.vocations.includes(voc))) return id;
  }
  return ids[ids.length - 1];
}
/** Attack runes a hunting character of this vocation carries (the AI picks among them). */
function runesFor(voc: Vocation, level: number): string[] {
  const list = voc === 'paladin' ? ['sunlance_rune']
    : voc === 'sorcerer' ? ['death_rune', 'thunderbolt_rune', 'fireball_rune', 'stormcloud_rune', 'spark_rune']
      : voc === 'druid' ? ['death_rune', 'icicle_rune', 'rockspike_rune', 'avalanche_rune', 'stoneshower_rune', 'spark_rune'] : [];
  return list.filter((id) => {
    const d = ITEMS[id];
    return d && (!d.level || d.level <= level) && (!d.vocations || d.vocations.includes(voc));
  }).slice(0, 4);
}

/** One session per vocation, re-dressed for every level asked for (keeps the tick cheap). */
const fighters = new Map<Vocation, Fighter>();
let parkNo = 0;
function fighter(voc: Vocation, level: number): Fighter {
  let f = fighters.get(voc);
  if (!f) {
    const s = g.addPlayer(`Sim ${voc}`, { intent: new BufferedIntent(), vocation: voc });
    s.bot = true;
    f = { s, voc, level: -1, skills: startSkills(), brain: null as unknown as Brain, park: { x: ARENA.x - ARENA_R + 1 + parkNo++ * 2, y: ARENA.y + ARENA_R - 1 } };
    f.brain = new Brain(f);
    fighters.set(voc, f);
    g.setFightMode(s.id, voc === 'knight' ? 'offensive' : 'balanced', voc === 'knight');
  }
  if (f.level !== level) {
    const s = f.s;
    f.level = level;
    const kit = arenaKit(voc, level);
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
function park(f: Fighter): void {
  resetFighter(f, f.park);
  f.s.player.ignoredByMonsters = true;
}
function parkAll(): void {
  for (const f of fighters.values()) park(f);
}

function cloneSkills(k: Skills): Skills {
  const o = {} as Skills;
  for (const n of COMBAT_SKILLS) o[n] = { ...k[n] };
  return o;
}

/** Back to the fighter's level, skills, full health and mana, fresh supplies, at the arena centre. */
function resetFighter(f: Fighter, at = { x: ARENA.x, y: ARENA.y }): void {
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

const STOCK = 100;
function restock(f: Fighter): void {
  const inv = f.s.inventory;
  for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
  inv.add(bestUsable(POTIONS.hp, f.voc, f.level), STOCK);
  inv.add(bestUsable(POTIONS.mp, f.voc, f.level), STOCK);
  for (const r of runesFor(f.voc, f.level)) inv.add(r, STOCK);
  const ammo = inv.equipment.ammo;
  if (ammo) ammo.qty = 400;
}

/** Supplies used since the last restock, in gold. */
function suppliesUsed(f: Fighter): number {
  const inv = f.s.inventory;
  let gold = 0;
  for (const id of [bestUsable(POTIONS.hp, f.voc, f.level), bestUsable(POTIONS.mp, f.voc, f.level), ...runesFor(f.voc, f.level)]) gold += (STOCK - inv.count(id)) * supplyPrice(id);
  const ammo = inv.equipment.ammo;
  if (ammo) gold += (400 - ammo.qty) * supplyPrice(ammo.id);
  return gold;
}

// ------------------------------------------------------------------ the brain (a competent player)
type Foe = Enemy | Player;
const avgFormula = (min: number, max: number, perLevel: number, power: number, mult: number) =>
  ((min + perLevel * power * 0.7) * mult + (max + perLevel * power) * mult) / 2;

class Brain {
  /** Players to fight (duels) instead of monsters. */
  foes: Player[] | null = null;
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
    if (hpf < 0.7 && p.groupCooldowns.heal <= 0) {
      const opts: SpellId[] = v === 'knight' ? ['exura_ico', 'exura'] : v === 'paladin' ? ['exura_san', 'exura_gran', 'exura'] : ['exura_vita', 'exura_gran', 'exura'];
      // light heals only while it is not urgent
      for (const id of opts) {
        if (!this.s.spells.has(id)) continue;
        if (id === 'exura_vita' && hpf > 0.55 && p.maxHp < 600) continue;
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
    if (mage && p.buffs.magicShield <= 0 && this.s.spells.has('utamo_vita') && p.mana > p.maxMana * 0.5) { this.cast('utamo_vita'); return; }
    if (v !== 'knight' && p.buffs.haste <= 0 && p.buffs.strongHaste <= 0 && p.mana > this.manaReserve() * 2) {
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
      if (r.radius > 0) {
        for (const c of foes) {
          if (chebyshev(p.x, p.y, c.x, c.y) > r.range || !g.world.lineOfSight(p.x, p.y, c.x, c.y, p.z)) continue;
          const hit = foes.filter((e) => inAreaShape(e.x - c.x, e.y - c.y, r.radius));
          const val = this.value(per, el, hit);
          if (val > v) { v = val; at = { x: c.x, y: c.y }; }
        }
      } else if (dT <= r.range && sees) v = this.value(per, el, [t]);
      if (v > spellBest * 1.15) consider(v, () => g.useRune(s.id, slot, at));
    }
    if (best) (best as { go: () => void }).go();
  }

  /** Ranged characters keep monsters at arm's length; knights stand and fight. */
  move(t: Foe): void {
    const p = this.p;
    if (this.f.voc === 'knight' || p.moving) return;
    const foes = this.enemies().filter((e) => e instanceof Player ? e.vocation === 'knight' : !e.def.kite);
    const near = foes.filter((e) => chebyshev(e.x, e.y, p.x, p.y) <= 1);
    if (!near.length) return;
    const range = g.weaponRange(this.s);
    let best: { x: number; y: number; v: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = p.x + dx, y = p.y + dy;
      if (!g.world.canStep(p.x, p.y, p.z, dx, dy) || g.isOccupied(x, y, p.z, p.id, true)) continue;
      let md = 9;
      for (const e of foes) md = Math.min(md, chebyshev(e.x, e.y, x, y));
      const off = Math.max(0, chebyshev(x, y, ARENA.x, ARENA.y) - (ARENA_R - 6));
      const v = md * 10 - off * 6 - (chebyshev(x, y, t.x, t.y) > range ? 8 : 0) + Math.random();
      if (!best || v > best.v) best = { x, y, v };
    }
    if (best && best.v > 10) g.commandMoveTo(this.s.id, best.x, best.y, 200);
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
const DT = 0.05;
interface Tally { exp: number; gold: number; loot: number; taken: number; dealt: number; deaths: number; kills: number; time: number; cost: number; timeouts: number }
const newTally = (): Tally => ({ exp: 0, gold: 0, loot: 0, taken: 0, dealt: 0, deaths: 0, kills: 0, time: 0, cost: 0, timeouts: 0 });
let tally: Tally | null = null;
let watched = new Set<number>();

g.events.on((e) => {
  if (!tally) return;
  if (e.type === 'xp' && watched.has(e.to)) tally.exp += e.amount;
  else if (e.type === 'damage' && e.result === 'hit') {
    if (watched.has(e.targetId)) tally.taken += e.amount + (e.manaShield ?? 0);
    if (watched.has(e.sourceId)) tally.dealt += e.amount;
  } else if (e.type === 'bagCreated') {
    const i = g.bags.findIndex((b) => b.id === e.bagId);
    if (i < 0) return;
    const b = g.bags[i];
    if (!b.corpse) for (const it of b.items) {
      if (it.id === 'gold') tally.gold += it.qty;
      else tally.loot += (ITEMS[it.id]?.value ?? 0) * it.qty;
    }
    g.bags.splice(i, 1);
  } else if (e.type === 'death' && watched.has(e.id)) tally.deaths++;
  else if (e.type === 'death') tally.kills++;
});

function clearMonsters(): void {
  for (const e of g.enemies) g.despawnEnemy(e);
  g.update(DT);
  g.enemies.length = 0;
}

/** One tick for everyone; keeps fighters at their level (no level-up heals, no lost levels). */
function step(fs: Fighter[]): void {
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
  if (tally) tally.time += DT;
}

function spawnPack(kinds: EnemyKind[], around: { x: number; y: number }, dist: number): Enemy[] {
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
interface Area { name: string; z: number; band: number; kinds: Map<EnemyKind, number>; capacity: number }
function areaList(): Area[] {
  const m = new Map<string, Area>();
  for (const sp of W.spawns) {
    const d = ENEMIES[sp.kind];
    if (d.boss) continue;
    const r = W.regionAt(sp.x, sp.y, sp.z);
    if (!r || r.safe) continue;
    const band = parseInt(r.level, 10);
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

function pickKinds(a: Area, n: number): EnemyKind[] {
  const all = [...a.kinds.entries()];
  const total = all.reduce((x, [, c]) => x + c, 0);
  const out: EnemyKind[] = [];
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total;
    for (const [k, c] of all) { r -= c; if (r <= 0) { out.push(k); break; } }
  }
  return out;
}

interface HuntResult { expH: number; goldH: number; lootH: number; costH: number; profitH: number; dtps: number; deathsH: number; killsH: number; capped: boolean }

/** Hunts an area for `minutes` of game time: packs of `group` monsters, a walk of `walk` seconds between packs. */
function hunt(f: Fighter, a: Area, group: number, minutes: number): HuntResult {
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
    expH, goldH: tl.gold / h, lootH: tl.loot / h, costH: tl.cost / h, profitH: (tl.gold + tl.loot - tl.cost) / h,
    dtps: tl.taken / tl.time, deathsH: tl.deaths / h, killsH: tl.kills / h, capped: tl.exp / h > capH,
  };
}

// ------------------------------------------------------------------ dummy DPS
const DUMMY: EnemyDef = { ...ENEMIES.rat, name: 'Training Dummy', maxHp: 1e9, minDmg: 0, maxDmg: 0, armor: 0, abilities: [], resist: {}, aggroRange: 0, wanderRadius: 0, stepTime: 1e6, exp: 0, loot: [], kite: undefined };
// dummies never take a step
const plainStep = g.tryStep.bind(g);
g.tryStep = (c, dx, dy) => (c instanceof Enemy && c.tag === 'dummy' ? false : plainStep(c, dx, dy));

function dps(f: Fighter, n: number, armor: number, seconds: number): number {
  const tl = (tally = newTally());
  watched = new Set([f.s.id]);
  parkAll();
  resetFighter(f);
  clearMonsters();
  const p = f.s.player;
  const def = { ...DUMMY, armor };
  // knights: a ring around them; ranged: a tight block three tiles away (where a lured pack stands)
  const spots: Array<[number, number]> = f.voc === 'knight'
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    : [[3, 0], [3, 1], [4, 0], [4, 1], [3, -1], [4, -1], [5, 0], [5, 1]];
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
  return tl.dealt / tl.time;
}

// ------------------------------------------------------------------ duels
function duel(a: Fighter, b: Fighter, maxSec: number): number {
  g.pvp = true;
  parkAll();
  clearMonsters();
  resetFighter(a, { x: ARENA.x - 3, y: ARENA.y });
  resetFighter(b, { x: ARENA.x + 3, y: ARENA.y });
  for (const f of [a, b]) { f.s.player.secure = false; }
  a.brain.foes = [b.s.player];
  b.brain.foes = [a.s.player];
  let t = 0;
  while (!a.s.player.dead && !b.s.player.dead && t < maxSec) { step([a, b]); t += DT; }
  const r = a.s.player.dead && !b.s.player.dead ? 0 : b.s.player.dead && !a.s.player.dead ? 1
    : a.s.player.hp / a.s.player.maxHp > b.s.player.hp / b.s.player.maxHp ? 0.75 : 0.25;
  a.brain.foes = b.brain.foes = null;
  g.pvp = false;
  resetFighter(a);
  resetFighter(b);
  return r;
}

// ------------------------------------------------------------------ run
const LEVELS = QUICK ? [60] : [8, 20, 40, 60, 80, 100, 150, 200, 250, 300];
let failures = 0;
const check = (ok: boolean, label: string) => { if (!ok) failures++; say(`${ok ? '  ok  ' : '  FAIL'} ${label}`); };

say(`# Thornvale balance report`);
say('');
say(`Seeded run (seed ${opt('seed', '12345')}), hunts of ${HUNT_MIN} game minutes, season stages. Arena at ${ARENA.x},${ARENA.y}.`);
say('');

// --- typical skills and gear
say('## Typical character (skills from the target curve, gear as arena bots wear it)');
say('');
say('| Level | ' + VOCATION_IDS.map((v) => `${v}: skill / ML / shield · set · weapon`).join(' | ') + ' |');
say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|');
for (const L of LEVELS) {
  const cells = VOCATION_IDS.map((v) => {
    const f = fighter(v, L);
    const ws = g.weaponSkill(f.s);
    const kit = arenaKit(v, L);
    return `${ws === 'magic' ? '—' : f.skills[ws].level} / ${f.skills.magic.level} / ${f.skills.shielding.level} · ${kit.set ?? '—'} · ${f.s.inventory.equipment.weapon?.id ?? '—'}`;
  });
  say(`| ${L} | ${cells.join(' | ')} |`);
}
say('');

lap('DPS vs dummy');
// --- DPS vs dummy
if (ONLY.has('dps')) {
  say('## Damage per second against a training dummy (armour = level/5)');
  say('');
  say('| Level | ' + VOCATION_IDS.map((v) => `${v} 1 / 4 / 8`).join(' | ') + ' | single spread |');
  say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|');
  for (const L of LEVELS) {
    const res = VOCATION_IDS.map((v) => [1, 4, 8].map((n) => dps(fighter(v, L), n, Math.round(L / 5), QUICK ? 20 : 60)));
    const singles = res.map((r) => r[0]);
    const mean = singles.reduce((a, b) => a + b, 0) / singles.length;
    const spread = Math.max(...singles.map((x) => Math.abs(x / mean - 1)));
    say(`| ${L} | ${res.map((r) => r.map(f0).join(' / ')).join(' | ')} | ±${pct(spread)} |`);
    if (QUICK) check(singles.every((x) => x > 0), `level ${L}: every vocation deals damage`);
  }
  say('');
}

lap('duels');
// --- duels
if (ONLY.has('duels')) {
  const DL = QUICK ? [60] : [20, 60, 100, 150, 200];
  const N = QUICK ? 2 : 16;
  say(`## Duels (equal level and gear, ${N} fights per pair, a 3-minute fight without a death goes to the healthier side)`);
  say('');
  say('| Level | ' + VOCATION_IDS.flatMap((a, i) => VOCATION_IDS.slice(i + 1).map((b) => `${a[0].toUpperCase()} v ${b[0].toUpperCase()}`)).join(' | ') + ' |');
  say('|---|' + VOCATION_IDS.flatMap((_a, i) => VOCATION_IDS.slice(i + 1).map(() => '---')).join('|') + '|');
  for (const L of DL) {
    const cells: string[] = [];
    for (let i = 0; i < VOCATION_IDS.length; i++) for (let j = i + 1; j < VOCATION_IDS.length; j++) {
      const A = fighter(VOCATION_IDS[i], L), B = fighter(VOCATION_IDS[j], L);
      let w = 0;
      for (let k = 0; k < N; k++) w += k % 2 ? 1 - duel(B, A, 180) : duel(A, B, 180);
      cells.push(pct(w / N));
    }
    say(`| ${L} | ${cells.join(' | ')} |`);
  }
  say('');
  say('(share of fights won by the first-named vocation: K knight, P paladin, S sorcerer, D druid)');
  say('');
}

lap('hunting areas');
// --- hunting areas
const areas = areaList();
const areaRes = new Map<string, Map<string, HuntResult>>();
if (ONLY.has('areas')) {
  const list = QUICK ? areas.filter((a) => a.band >= 40 && a.band <= 60).slice(0, 2) : areas;
  say('## Hunting areas at their recommended level (best of single pulls and packs of 4; exp after stages)');
  say('');
  say('| Area | Band | Monsters | ' + VOCATION_IDS.map((v) => `${v} exp/h · profit/h · dmg/s · deaths/h`).join(' | ') + ' | exp spread | at band−20: deaths/h K/P/S/D |');
  say('|---|---|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|---|');
  for (const a of list) {
    const L = Math.max(8, a.band);
    const row = new Map<string, HuntResult>();
    for (const v of VOCATION_IDS) {
      const f = fighter(v, L);
      const single = hunt(f, a, 1, HUNT_MIN);
      const pack = hunt(f, a, 4, HUNT_MIN);
      // a competent player takes packs when they are safe and pay more
      const best = pack.deathsH < 0.5 && pack.expH > single.expH ? pack : single;
      row.set(v, best);
    }
    areaRes.set(a.name, row);
    const exps = VOCATION_IDS.map((v) => row.get(v)!.expH);
    const mean = exps.reduce((x, y) => x + y, 0) / exps.length;
    const spread = Math.max(...exps.map((x) => Math.abs(x / mean - 1)));
    let low = '—';
    if (!QUICK && a.band >= 28) {
      low = VOCATION_IDS.map((v) => f1(hunt(fighter(v, Math.max(8, a.band - 20)), a, 4, HUNT_MIN / 2).deathsH)).join(' / ');
    }
    const mons = [...a.kinds.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}×${n}`).join(' ');
    say(`| ${a.name} | ${a.band}+ | ${mons} | ${VOCATION_IDS.map((v) => { const r = row.get(v)!; return `${f0(r.expH)}${r.capped ? '*' : ''} · ${f0(r.profitH)} · ${f0(r.dtps)} · ${f1(r.deathsH)}`; }).join(' | ')} | ±${pct(spread)} | ${low} |`);
    if (QUICK) check(exps.every((x) => x > 0), `${a.name}: every vocation earns experience`);
  }
  say('');
  say('(* = capped by how fast the area respawns)');
  say('');
}


lap('levelling curve');
// --- levelling curve
if (ONLY.has('curve') && !QUICK) {
  say('## Levelling time (best safe area for the level; season stages; deaths/h < 0.3 and profit ≥ −20% of loot)');
  say('');
  const grid = [8, 14, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 225, 250, 275, 300];
  const perVoc = new Map<Vocation, number[]>();
  for (const v of VOCATION_IDS) {
    const rates: number[] = [];
    for (const L of grid) {
      const cands = areas.filter((a) => a.band <= L + 5).sort((x, y) => y.band - x.band).slice(0, 6);
      let best = 0;
      for (const a of cands) {
        const f = fighter(v, L);
        const r = [hunt(f, a, 1, HUNT_MIN / 2), hunt(f, a, 4, HUNT_MIN / 2)].filter((x) => x.deathsH < 0.3 && x.profitH > -0.2 * (x.goldH + x.lootH));
        for (const x of r) best = Math.max(best, x.expH);
      }
      rates.push(best);
    }
    perVoc.set(v, rates);
  }
  say('| Level | ' + VOCATION_IDS.map((v) => `${v} exp/h · hours`).join(' | ') + ' | target hours |');
  say('|---|' + VOCATION_IDS.map(() => '---').join('|') + '|---|');
  const hours = new Map<Vocation, number>(VOCATION_IDS.map((v) => [v, 0]));
  for (let i = 0; i < grid.length; i++) {
    const L = grid[i];
    const cells = VOCATION_IDS.map((v) => {
      const rates = perVoc.get(v)!;
      if (i > 0) {
        // integrate level by level between grid points with the rate interpolated
        for (let l = grid[i - 1]; l < L; l++) {
          const t = (l - grid[i - 1]) / (L - grid[i - 1]);
          const rate = rates[i - 1] * (1 - t) + rates[i] * t;
          hours.set(v, hours.get(v)! + (rate > 0 ? (expForLevel(l + 1) - expForLevel(l)) / rate : Infinity));
        }
      } else hours.set(v, (expForLevel(L) / Math.max(1, rates[0])));
      return `${f0(rates[i])} · ${f1(hours.get(v)!)}`;
    });
    say(`| ${L} | ${cells.join(' | ')} | ${f1(targetHours(L))} |`);
  }
  say('');
}

lap('bosses: solo');
// --- bosses: solo should fail, a group of four should win
if (ONLY.has('bosses') && !QUICK) {
  say('## Bosses (solo at band+20 vs a party of four, one of each vocation, at the band)');
  say('');
  say('| Boss | Level | Solo knight / paladin / sorcerer / druid | Party of four |');
  say('|---|---|---|---|');
  const bossLevel: Array<[EnemyKind, number]> = [];
  for (const sp of W.spawns) {
    const d = ENEMIES[sp.kind];
    if (d.boss !== 'dungeon' || bossLevel.some(([k]) => k === sp.kind)) continue;
    const r = W.regionAt(sp.x, sp.y, sp.z);
    bossLevel.push([sp.kind, parseInt(r?.level ?? '50', 10) || 50]);
  }
  for (const k of ['wb_mountain', 'wb_storm_serpent', 'wb_blight_mother'] as EnemyKind[]) bossLevel.push([k, 200]);
  for (const [k, L0] of bossLevel) {
    const L = Math.max(30, L0);
    const fight = (fs: Fighter[], sec: number) => {
      tally = newTally();
      watched = new Set(fs.map((f) => f.s.id));
      parkAll();
      fs.forEach((f, i) => resetFighter(f, { x: ARENA.x + (i % 2) * 2, y: ARENA.y + Math.floor(i / 2) * 2 }));
      clearMonsters();
      const b = spawnPack([k], ARENA, 6)[0];
      let t = 0, deaths = 0;
      while (b && !b.dead && t < sec && fs.some((f) => !f.s.player.dead)) {
        step(fs);
        t += DT;
      }
      deaths = tally.deaths;
      const won = !!b?.dead;
      const hp = b ? b.hp / b.maxHp : 1;
      tally = null;
      clearMonsters();
      fs.forEach((f) => resetFighter(f));
      return `${won ? 'won' : `lost (${pct(hp)} left)`} ${f0(t)} s${deaths ? `, ${deaths} died` : ''}`;
    };
    const solo = VOCATION_IDS.map((v) => fight([fighter(v, L + 20)], 300).replace(/ s.*$/, ' s'));
    const party = fight(VOCATION_IDS.map((v) => fighter(v, L)), 600);
    say(`| ${ENEMIES[k].name} | ${L} | ${solo.join(' / ')} | ${party} |`);
  }
  say('');
}

if (QUICK) {
  say(failures ? `${failures} balance sanity check(s) failed` : 'balance sanity: ok');
  process.exit(failures ? 1 : 0);
}
