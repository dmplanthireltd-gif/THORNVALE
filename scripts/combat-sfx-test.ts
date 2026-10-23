/**
 * Combat sound logic: every monster has a sensible surface, blows layer the right clips,
 * every clip the logic can ask for exists in the rendered bank, and variants never repeat
 * back to back.   npx tsx scripts/combat-sfx-test.ts
 */
import { ENEMIES } from '../src/game/enemies/enemyDefs';
import { bodyOf } from '../src/audio/foley';
import {
  arrowImpact, blockLayers, fallOf, flightTime, hitLayers, jitter, MAX_VOICES, MONSTER_SURFACE, pickVariant,
  playerSurface, shieldMaterial, surfaceOf, SURFACES, type Striker,
} from '../src/audio/combatSurface';
import { COMBAT_CLIPS } from '../src/audio/combatBank';

let fails = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { fails++; console.error('FAIL', msg); } };

// every monster kind is mapped explicitly (new kinds must be added on purpose)
for (const kind of Object.keys(ENEMIES)) ok(kind in MONSTER_SURFACE, `monster ${kind} has a combat surface`);

// spot checks of the mapping
const want: Record<string, string> = {
  skeleton: 'bone', boss_bonebound: 'bone', dragon: 'scale', demon: 'scale', tarantula: 'chitin', scarab: 'chitin',
  ice_golem: 'crystal', wb_mountain: 'stone', lantern_jelly: 'slime', fire_elemental: 'ethereal', gloom_eel: 'water',
  orc_warrior: 'armour', dwarf_guard: 'armour', wolf: 'flesh', rat: 'flesh',
};
for (const [k, s] of Object.entries(want)) ok(surfaceOf(k) === s, `${k} → ${s} (got ${surfaceOf(k)})`);
// name fallbacks for kinds added later
ok(surfaceOf('bone_lich') === 'bone', 'fallback bone');
ok(surfaceOf('cave_spider') === 'chitin', 'fallback chitin');
ok(surfaceOf('hill_giant') === 'flesh', 'giant is not an ant');
ok(surfaceOf('stone_golem') === 'stone', 'fallback stone');
ok(surfaceOf('green_slime') === 'slime', 'fallback slime');
ok(surfaceOf('wraith') === 'ethereal', 'fallback ethereal');
ok(surfaceOf('sea_serpent') === 'scale', 'fallback scale');
ok(surfaceOf('farmer') === 'flesh', 'fallback flesh');

// players: metal body armour rings, cloth and leather don't
ok(playerSurface('Plate Armour') === 'armour', 'plate is armour');
ok(playerSurface('Chain Mail') === 'armour', 'chain is armour');
ok(playerSurface('Leather Armour') === 'flesh', 'leather is flesh');
ok(playerSurface('Mage Robe') === 'flesh', 'robe is flesh');
ok(playerSurface('Voidweave Robe') === 'flesh', 'weave is flesh');
ok(playerSurface(null) === 'flesh', 'naked is flesh');
ok(shieldMaterial('Wooden Shield') === 'wood' && shieldMaterial('Iron Kite Shield') === 'metal', 'shield materials');

// every clip the logic can ask for exists in the bank, with at least 2 variants for anything common
const strikers: Striker[] = ['sword', 'axe', 'club', 'fist', 'claw', 'big', 'arrow', 'bolt', 'spear', 'star', 'stone'];
const asked = new Set<string>();
for (const s of SURFACES) {
  for (const st of strikers) for (const heavy of [false, true]) for (const l of hitLayers(s, st, heavy)) asked.add(l.clip);
  for (const sh of ['wood', 'metal', null] as const) for (const w of [true, false]) for (const l of blockLayers(sh, w, s)) asked.add(l.clip);
  asked.add(arrowImpact(s));
}
for (const kind of Object.keys(ENEMIES)) asked.add(`fall_${fallOf(surfaceOf(kind), bodyOf(kind).size)}`);
for (const c of ['swing_blade', 'swing_axe', 'swing_club', 'swing_fist', 'swing_claw', 'swing_big', 'miss', 'bow', 'arrow_fly', 'crossbow', 'throw_spear', 'throw_star']) asked.add(c);
for (const el of ['energy', 'fire', 'ice', 'earth', 'death', 'holy']) { asked.add(`zap_${el}`); asked.add(`zaphit_${el}`); }
for (const c of asked) {
  const vs = COMBAT_CLIPS[c];
  ok(!!vs && vs.length >= 2, `bank has ${c} with ≥2 variants`);
  for (const [start, dur] of vs ?? []) ok(start > 0 && dur > 0.03 && dur < 1.6, `${c} slice is sane (${start}, ${dur})`);
}
// slices never overlap
const all = Object.values(COMBAT_CLIPS).flat().slice().sort((a, b) => a[0] - b[0]);
for (let i = 1; i < all.length; i++) ok(all[i - 1][0] + all[i - 1][1] < all[i][0], `slices don't overlap at ${all[i][0]}`);

// layering: blades slice, axes bite, clubs crunch; crits add weight; arrows use their own impacts
const names = (ls: { clip: string }[]) => ls.map((l) => l.clip).join(',');
ok(names(hitLayers('flesh', 'sword', false)) === 'hit_flesh,acc_slash', 'sword on flesh');
ok(names(hitLayers('armour', 'axe', false)) === 'hit_armour,acc_chop', 'axe on armour');
ok(names(hitLayers('bone', 'club', true)) === 'hit_bone,acc_crunch,crit', 'club crit on bone');
ok(names(hitLayers('flesh', 'arrow', false)) === 'arrow_flesh', 'arrow in flesh');
ok(names(hitLayers('stone', 'bolt', false)) === 'arrow_stone,hit_stone', 'bolt on stone');
ok(names(blockLayers('wood', true, 'flesh')) === 'block_wood', 'wooden shield');
ok(names(blockLayers('metal', true, 'flesh')) === 'block_metal', 'metal shield');
ok(names(blockLayers(null, true, 'flesh')) === 'parry', 'parry without a shield');
ok(fallOf('bone', 'medium') === 'bone' && fallOf('armour', 'small') === 'armour' && fallOf('scale', 'huge') === 'huge', 'falls');

// variants: never the same twice in a row, all reachable, in range
for (const count of [1, 2, 3, 4, 5]) {
  const seen = new Set<number>();
  let last = -1;
  for (let i = 0; i < 400; i++) {
    const v = pickVariant(count, last, Math.random());
    ok(v >= 0 && v < count, `variant in range (${count})`);
    if (count > 1) ok(v !== last, `no repeat (${count})`);
    seen.add(v);
    last = v;
  }
  ok(seen.size === count, `all ${count} variants reachable`);
}
ok(pickVariant(4, 3, 0.9999) === 2 && pickVariant(4, 0, 0) === 1, 'variant edges');
for (let i = 0; i < 100; i++) {
  const j = jitter(Math.random(), Math.random());
  ok(j.rate >= 0.96 && j.rate <= 1.04 && j.gain <= 1 && j.gain >= 0.84, 'jitter bounds');
}
ok(Math.abs(flightTime(1, true) - 0.12) < 1e-9 && Math.abs(flightTime(6, true) - 0.27) < 1e-9, 'flight time matches the renderer');
ok(MAX_VOICES >= 8 && MAX_VOICES <= 24, 'voice cap');

if (fails) { console.error(`combat-sfx-test: ${fails} failure(s)`); process.exit(1); }
console.log(`combat-sfx-test: ok (${Object.keys(ENEMIES).length} monsters, ${asked.size} clips checked)`);
