/**
 * Item tooltips and shop lines in the player's language: the same facts as `describeItem` in
 * game/inventory/items.ts (keep the two in step), built from translated pieces.
 */
import type { Bonus, ItemDef, RuneEffect } from '../game/inventory/items';
import { CAPE_BY_ID, CAPE_TRAINING_BONUS, TRADE_CAPE_LEVEL } from '../game/inventory/capes';
import { SET_BY_ID, type GearSet } from '../game/inventory/sets';
import { petForItem } from '../game/pets/petDefs';
import { SKILL_NAMES } from '../game/player/skills';
import { VOCATIONS } from '../game/player/vocations';
import { fmtNum, getLang, k, t } from './i18n';
import { trName, trText } from './gameText';

/** An element's name as an adjective-free word ("fire", "ogień", "fogo"). */
export function elementName(e: string | undefined): string {
  return e ? t(e) : '';
}

export function bonusPartsL(b: Bonus): string[] {
  const parts: string[] = [];
  if (b.hp) parts.push(t('+{n} hp', { n: b.hp }));
  if (b.mana) parts.push(t('+{n} mana', { n: b.mana }));
  if (b.speed) parts.push(t('speed +{n}%', { n: b.speed }));
  if (b.hpRegen) parts.push(t('hp regen +{n}', { n: b.hpRegen }));
  if (b.manaRegen) parts.push(t('mana regen +{n}', { n: b.manaRegen }));
  if (b.magic) parts.push(t('magic +{n}%', { n: b.magic }));
  if (b.attack) parts.push(t('attack +{n}', { n: b.attack }));
  if (b.light) parts.push(t('light +{n}', { n: b.light }));
  if (b.resist) for (const [k, v] of Object.entries(b.resist)) parts.push(`${elementName(k)} ${fmtNum(v ?? 0)}%`);
  return parts;
}

export function setSummaryL(set: GearSet): string {
  return t('{set} ({n}): 2 pieces {two}; 4 pieces {four}', {
    set: trName(`${set.name} set`), n: set.pieces.length, two: bonusPartsL(set.two).join(', '), four: bonusPartsL(set.four).join(', '),
  });
}

const skillWord = (sk: string): string => trName(SKILL_NAMES[sk as keyof typeof SKILL_NAMES] ?? sk).toLocaleLowerCase(getLang());

export function capeSummaryL(id: string): string {
  const c = CAPE_BY_ID[id];
  if (!c) return '';
  const pct = Math.round(CAPE_TRAINING_BONUS * 100);
  if (c.kind === 'skill' && c.skill) {
    const trade = !['fist', 'club', 'sword', 'axe', 'distance', 'shielding', 'magic'].includes(c.skill);
    return t(trade ? '{skill} {level}+ · +{pct}% experience in {skill}' : '{skill} {level}+ · +{pct}% training in {skill}', { skill: skillWord(c.skill), level: c.level ?? 0, pct });
  }
  if (c.kind === 'mastery') return t('every trade skill {level} + one fighting art at cape level · +{pct}% experience in every trade skill', { level: TRADE_CAPE_LEVEL, pct });
  if (c.deed) return t(c.deed === 'dungeon_bosses' ? 'slay all 10 dungeon bosses · decorative' : 'slay all 3 world bosses · decorative');
  if (c.season) return t('sold in {season} · decorative', { season: trName(c.season.name) });
  return t('decorative');
}

function runeSummaryL(r: RuneEffect): string {
  switch (r.type) {
    case 'heal': return t('healing rune');
    case 'cure': return t('cures poison');
    case 'paralyze': return t('slows a monster for {s} s', { s: r.duration ?? 10 });
    case 'destroyField': return t('removes a magic field');
    case 'field': {
      const secs = r.duration ?? 30;
      if (r.field === 'wall') return t(r.shape === 'bomb' ? '3×3 magic wall, {s} s' : r.shape === 'wall' ? '5-tile magic wall, {s} s' : 'a magic wall, {s} s', { s: secs });
      const el = elementName(r.field);
      if (r.shape === 'bomb') return t('3×3 {element} fields, {s} s', { element: el, s: secs });
      if (r.shape === 'wall') return t('5-tile wall of {element} fields, {s} s', { element: el, s: secs });
      return t(r.shape === 'tile' ? '{element} field, {s} s' : '{element} fields, {s} s', { element: el, s: secs });
    }
    default: return t(r.radius ? '{element} area rune' : '{element} rune', { element: elementName(r.element) });
  }
}

const WEAPON: Record<string, string> = { sword: k('sword'), axe: k('axe'), club: k('club'), bow: k('bow'), crossbow: k('crossbow'), throwing: k('throwing'), wand: k('wand'), rod: k('rod') };

/** One-line stat summary for tooltips and shop lists, in the player's language. */
export function describeItemL(d: ItemDef): string {
  const parts: string[] = [];
  const elem = (n?: number, e?: string) => (n ? ` +${fmtNum(n)} ${elementName(e)}` : '');
  if (d.weaponType) {
    const wt = t(WEAPON[d.weaponType] ?? d.weaponType);
    if (d.magicDamage) parts.push(t('{element} {min}–{max} · {mana} mana/shot', { element: elementName(d.element), min: d.magicDamage[0], max: d.magicDamage[1], mana: d.manaPerShot ?? 0 }));
    else if (d.weaponType === 'bow' || d.weaponType === 'crossbow') parts.push(t(d.ammoType === 'bolt' ? '{type}, +{atk} attack, uses bolts' : '{type}, +{atk} attack, uses arrows', { type: wt, atk: d.attack ?? 0 }));
    else parts.push(`${wt}, ${t('Atk {n}', { n: d.attack ?? 0 })}${elem(d.elementDamage, d.element)}${d.defense ? `, ${t('Def {n}', { n: d.defense })}` : ''}`);
    if (d.range) parts.push(t('range {n}', { n: d.range }));
    if (d.twoHanded) parts.push(t('two-handed'));
  }
  if (d.kind === 'ammo') parts.push(`${t(d.ammoType === 'bolt' ? 'bolt' : 'arrow')}, ${t('Atk {n}', { n: d.attack ?? 0 })}${elem(d.elementDamage, d.element)}`);
  if (d.kind === 'shield') parts.push(t('Def {n}', { n: d.defense ?? 0 }));
  if (d.kind === 'cape' && CAPE_BY_ID[d.id]) parts.push(capeSummaryL(d.id));
  if (d.armor) parts.push(t('Arm {n}', { n: d.armor }));
  if (d.slots) parts.push(t('{n} slots', { n: d.slots }));
  if (d.heal) parts.push(t('heals {n}', { n: d.heal }));
  if (d.mana) parts.push(t('restores {n} mana', { n: d.mana }));
  if (d.rune) parts.push(runeSummaryL(d.rune));
  if (d.bonus) parts.push(...bonusPartsL(d.bonus));
  if (d.level) parts.push(t('lvl {n}+', { n: d.level }));
  if (d.vocations) parts.push(t('{list} only', { list: d.vocations.map((v) => trName(`${VOCATIONS[v].name}s`)).join('/') }));
  const pet = d.kind === 'pet' ? petForItem(d.id) : null;
  if (pet) parts.push(`${t('pet')}: ${trText(pet.perk)}`);
  parts.push(t('{n} oz', { n: d.weight }));
  const set = d.setId ? SET_BY_ID[d.setId] : undefined;
  return parts.join(' · ') + (d.note ? `. ${trText(d.note)}` : '') + (set ? `. ${setSummaryL(set)}` : '');
}
