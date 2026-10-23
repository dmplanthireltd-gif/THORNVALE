/**
 * Renders the OLD synthesized combat recipes (sfxlib.ts + foley.ts, Web Audio) offline in Node,
 * in the same order as the new reel, so the owner can compare before/after.
 *
 *   npx tsx scripts/sfx/before-reel.ts <dir>     → <dir>/combat-reel-before.mp3
 *
 * A small emulation of the Web Audio pieces the Kit uses (oscillators, RBJ biquads with
 * exponential sweeps, exponential gain envelopes). Close enough to hear the old sounds.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { limit, loudness, mix, peak, SR, wavMono } from './dsp';
import { SOUNDS } from '../../src/audio/sfxlib';
import { bodyFall, elementHit, impact, type Kit, type Material, type Body } from '../../src/audio/foley';

function expRamp(a: number, b: number, x: number): number { return a * Math.pow(Math.max(1e-6, b / a), Math.min(1, Math.max(0, x))); }

function render(build: (k: Kit) => void, sec = 2.5): Float64Array {
  const out = new Float64Array(Math.round(sec * SR));
  const env = (t: number, at: number, attack: number, peak: number, decay: number) => {
    const p = Math.max(0.0002, peak);
    if (t < at) return 0;
    if (t < at + attack) return expRamp(0.0001, p, (t - at) / attack);
    return expRamp(p, 0.0001, (t - at - attack) / decay);
  };
  const osc = (type: OscillatorType | 'pulse', ph: number, duty = 0.5): number => {
    const x = ph - Math.floor(ph);
    switch (type) {
      case 'sine': return Math.sin(2 * Math.PI * x);
      case 'square': return x < 0.5 ? 1 : -1;
      case 'sawtooth': return 2 * x - 1;
      case 'triangle': return 1 - 4 * Math.abs(x - 0.5);
      case 'pulse': return x < duty ? 1 : -1;
      default: return 0;
    }
  };
  const biquad = (type: BiquadFilterType, q: number) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x: number, f: number) => {
      const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w);
      let b0: number, b1: number, b2: number, a0: number;
      if (type === 'lowpass' || type === 'highpass') {
        const al = s / (2 * Math.pow(10, q / 20)); // Web Audio lowpass/highpass Q is in dB
        a0 = 1 + al;
        if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
        const a1 = -2 * c, a2 = 1 - al;
        const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
      }
      const al = s / (2 * Math.max(0.0001, q));
      a0 = 1 + al; b0 = al; b1 = 0; b2 = -al;
      const a1 = -2 * c, a2 = 1 - al;
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
    };
  };
  const voice = (type: OscillatorType | 'pulse' | 'noise', f0: number, f1: number, filt: [BiquadFilterType, number, number, number] | null, at: number, dur: number, peak: number, attack: number, duty = 0.5, trem = 0) => {
    const i0 = Math.max(0, Math.round(at * SR)), i1 = Math.min(out.length, Math.round((at + attack + dur + 0.05) * SR));
    let ph = 0;
    const bq = filt ? biquad(filt[0], filt[3]) : null;
    for (let i = i0; i < i1; i++) {
      const t = i / SR, x = (t - at) / dur;
      let s: number;
      if (type === 'noise') s = Math.random() * 2 - 1;
      else { ph += expRamp(f0, Math.max(20, f1), x) / SR; s = osc(type, ph, duty); }
      if (bq && filt) s = bq(s, expRamp(filt[1], Math.max(20, filt[2]), x));
      let g = env(t, at, attack, peak, dur);
      if (trem) g += peak * 0.6 * Math.sin(2 * Math.PI * trem * (t - at)) * (g > 0.0002 ? 1 : 0);
      out[i] += s * g;
    }
  };
  const k: Kit = {
    t: 0.01,
    r: (a, b) => a + Math.random() * (b - a),
    tone: (type, f0, f1, at, dur, peak, attack = 0.005) => voice(type, f0, f1, null, at, dur, peak, attack),
    ftone: (type, f0, f1, filter, c0, c1, at, dur, peak, q = 1, attack = 0.005) => voice(type, f0, f1, [filter, c0, c1, q], at, dur, peak, attack),
    noise: (filter, f0, f1, at, dur, peak, q = 1, attack = 0.005) => voice('noise', 0, 0, [filter, f0, f1, q], at, dur, peak, attack),
    pulse: (duty, f0, f1, at, dur, peak, tremolo) => voice('pulse', f0, f1, null, at, dur, peak, 0.005, duty, tremolo ?? 0),
  };
  build(k);
  let end = out.length;
  while (end > 1 && Math.abs(out[end - 1]) < 1e-4) end--;
  return out.slice(0, end + 100);
}

const S = (name: keyof typeof SOUNDS) => (k: Kit) => SOUNDS[name](k);
const I = (m: Material, hard = false) => (k: Kit) => impact(k, m, 1, hard);
const body = (material: Material, size: Body['size']): Body => ({ family: 'man', material, size });

// the same order as the new reel (scripts/sfx/render.ts), old equivalents
const ORDER: Array<[string, (k: Kit) => void]> = [
  ['swing_blade', S('swingBlade')], ['swing_axe', S('swingHeavy')], ['swing_club', S('swingBlunt')], ['swing_fist', S('swingFist')], ['swing_claw', S('swing')], ['swing_big', S('swing')],
  ['hit_flesh', I('flesh')], ['hit_armour', I('metal')], ['hit_bone', I('bone')], ['hit_chitin', I('chitin')], ['hit_scale', I('scale')], ['hit_stone', I('stone')], ['hit_crystal', I('crystal')],
  ['hit_slime', I('flesh')], ['hit_ethereal', I('fire')], ['hit_water', I('flesh')],
  ['acc_slash', S('hit')], ['acc_chop', S('hit')], ['acc_crunch', S('hitHard')], ['crit', I('flesh', true)], ['miss', S('miss')],
  ['block_wood', S('blockWood')], ['block_metal', S('block')], ['parry', S('block')],
  ['bow', S('bow')], ['arrow_fly', S('bow')], ['crossbow', S('crossbow')], ['throw_spear', S('throw')], ['throw_star', S('throw')],
  ['arrow_flesh', I('flesh')], ['arrow_armour', I('metal')], ['arrow_wood', I('stone')], ['arrow_stone', I('stone')],
  ...(['energy', 'fire', 'ice', 'earth', 'death', 'holy'] as const).flatMap((el) => [
    [`zap_${el}`, S(el)] as [string, (k: Kit) => void], [`zaphit_${el}`, (k: Kit) => elementHit(k, el, 1)] as [string, (k: Kit) => void]]),
  ['fall_small', (k) => bodyFall(k, body('flesh', 'small'), 1)], ['fall_medium', (k) => bodyFall(k, body('flesh', 'medium'), 1)],
  ['fall_large', (k) => bodyFall(k, body('flesh', 'large'), 1)], ['fall_huge', (k) => bodyFall(k, body('flesh', 'huge'), 1)],
  ['fall_bone', (k) => bodyFall(k, body('bone', 'medium'), 1)], ['fall_armour', (k) => bodyFall(k, body('metal', 'medium'), 1)],
];
const COMBOS: Array<Array<[(k: Kit) => void, number, number]>> = [
  [[S('swingBlade'), 0, 0.6], [I('flesh'), 0.17, 1]],
  [[S('swingHeavy'), 0, 0.6], [I('metal'), 0.22, 1]],
  [[S('swingBlunt'), 0, 0.6], [I('bone'), 0.26, 1]],
  [[S('swingBlade'), 0, 0.6], [I('scale', true), 0.17, 1]],
  [[S('swingBlade'), 0, 0.6], [S('block'), 0.17, 1]],
  [[S('bow'), 0, 0.8], [I('flesh'), 0.25, 1]],
  [[S('crossbow'), 0, 0.8], [I('stone'), 0.2, 1]],
  [[S('energy'), 0, 0.8], [(k) => elementHit(k, 'energy', 1), 0.22, 1]],
];

const dir = process.argv[2];
if (!dir) throw new Error('usage: before-reel.ts <dir> | --levels');
if (dir === '--levels') {
  // the old sounds' loudness at full volume, to level the new bank against (same measure as render.ts)
  for (const [name, fn] of ORDER) {
    const b = render(fn);
    console.log(`${name.padEnd(16)} loud ${loudness(b).toFixed(1)} dB  peak ${(20 * Math.log10(peak(b))).toFixed(1)} dBFS`);
  }
  process.exit(0);
}
const placed: Array<[Float64Array, number, number]> = [];
let len = 0.3;
for (const [, fn] of ORDER) { const b = render(fn); placed.push([b, len, 1]); len += b.length / SR + 0.32; }
for (const group of COMBOS) {
  let end = 0;
  for (const [fn, at, g] of group) { const b = render(fn); placed.push([b, len + at, g]); end = Math.max(end, at + b.length / SR); }
  len += end + 0.32;
}
const reel = new Float64Array(Math.ceil((len + 0.3) * SR));
// the old sounds played through the master volume (0.6) before the limiter; keep them at that level
for (const [b, at, g] of placed) mix(reel, b, at, g * 0.6 * 2.5); // + the same +8 dB make-up as the new reel
limit(reel, 0.89);
const wav = join(dir, 'combat-reel-before.wav');
writeFileSync(wav, wavMono(reel));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', join(dir, 'combat-reel-before.mp3')]);
console.log(`before reel ${len.toFixed(1)} s`);

/** Exposed for level comparison. */
export { render as renderOld, ORDER as OLD_ORDER };
