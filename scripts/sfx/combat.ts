/**
 * Thornvale's combat sound bank: every recipe is a physically-inspired model rendered offline
 * (scripts/sfx/render.ts → public/audio/sfx/combat.mp3 + src/audio/combatClips.ts). No samples.
 *
 *   metal (armour, shields, blades): inharmonic plate / bar modes with fast high-mode decay
 *   wood (shields, arrow into wood): damped plank modes + the stuck arrow's buzzing shaft
 *   flesh: slap transient + chest thump with a pitch drop + wet squelch grains
 *   bone, chitin, stone, crystal: short hard modes + granular crackle and debris
 *   swings and arrows: turbulent noise shaped by a velocity curve (centroid follows speed,
 *   Doppler on the pass), blade whistle, fletching flutter
 *   bows: plucked-string model (Karplus–Strong) + limb knock + slap on the bracer
 *
 * Each sound has 3–5 variants (different seeds and physical sizes); the game also varies
 * pitch and level a little on every play.
 */
import {
  ad, bp, bump, Buf, buf, click, crackle, glideSine, grainNoise, grainTing, hp, lp, mix, Mode, modes, n,
  pluck, resonate, Rng, sat, scale, shape, SR, white,
} from './dsp';

export interface ClipSpec {
  name: string;
  variants: number;
  /** Short-term loudness target (dB, see dsp.loudness). */
  target: number;
  /** Room wet level and tail (s). */
  wet: number;
  rt: number;
  make: (rng: Rng, v: number) => Buf;
}

// ------------------------------------------------------------------ building blocks

const noiseEnv = (rng: Rng, sec: number, env: (t: number) => number) => shape(white(n(sec), rng), env);

/** A swing / flight: turbulent noise whose band follows the speed of the object. */
interface WhooshOpts {
  len: number; peak: number; f0: number; f1: number; q: number; sharp?: number;
  whistle?: number; whistleQ?: number; body?: number; flutter?: [number, number];
  /** Doppler: shifts the band peak earlier than the level peak (0 = none). */
  doppler?: number; recede?: boolean;
}
function whoosh(rng: Rng, o: WhooshOpts): Buf {
  const v = bump(o.len, o.peak, o.sharp ?? 2);
  const d = o.doppler ?? 0.12;
  const speed = (t: number) => (o.recede ? v(t) : v(Math.min(o.len * 0.999, t + d * o.len)));
  const fc = (t: number) => o.f0 + (o.f1 - o.f0) * speed(t);
  const len = n(o.len + 0.02);
  const fl = o.flutter;
  const am = (t: number) => (fl ? 1 + fl[1] * Math.sin(2 * Math.PI * fl[0] * t + 1.3) : 1);
  const out = new Float64Array(len);
  // main turbulence (two slightly different bands for a richer, less filtered sound)
  mix(out, shape(bp(white(len, rng), fc, o.q), (t) => Math.pow(v(t), 1.5) * am(t)), 0, 1);
  mix(out, shape(bp(white(len, rng), (t) => fc(t) * 1.7, o.q * 0.8), (t) => Math.pow(v(t), 2.2) * am(t)), 0, 0.45);
  if (o.whistle) mix(out, shape(bp(white(len, rng), (t) => fc(t) * 1.1, o.whistleQ ?? 10), (t) => Math.pow(v(t), 2.5)), 0, o.whistle * 2.2);
  if (o.body) mix(out, shape(lp(white(len, rng), (t) => 90 + 260 * v(t), 0.9), (t) => Math.pow(v(t), 2) * am(t)), 0, o.body * 2.5);
  return out;
}

/** Cloth and leather moving: sparse soft crackle. */
function rustle(rng: Rng, sec: number, count = 14): Buf {
  const b = crackle(n(sec + 0.02), rng, count, sec, (x) => Math.sin(Math.PI * x), (r) => grainNoise(r, r.r(1800, 5000), 1.2, r.r(0.004, 0.012)));
  mix(b, shape(bp(white(n(sec), rng), 1600, 0.6), bump(sec, 0.4, 1)), 0, 0.18);
  return b;
}

/** Inharmonic plate modes (struck metal sheet: armour, metal shield). */
const PLATE = [1, 1.47, 2.09, 2.56, 2.9, 3.6, 4.21, 5.1, 6.3, 7.7, 9.1];
function plate(rng: Rng, f1: number, t60: number, count = PLATE.length, bright = 1): Mode[] {
  const ms: Mode[] = [];
  for (let i = 0; i < count; i++) {
    const f = f1 * PLATE[i] * rng.r(0.985, 1.015);
    const a = rng.r(0.4, 1) / (1 + i * 0.35 / bright);
    const td = t60 * Math.pow(0.82, i) * rng.r(0.85, 1.15);
    ms.push({ f, t60: td, a, ph: rng.r(0, 6.28) });
    if (i < 4) ms.push({ f: f * rng.r(1.002, 1.006), t60: td, a: a * 0.6, ph: rng.r(0, 6.28) }); // beating pair
  }
  return ms;
}

/** Free-free bar modes (a blade). */
const BAR = [1, 2.756, 5.404, 8.933, 13.34];
function blade(rng: Rng, f1: number, t60: number, count = 4): Mode[] {
  return BAR.slice(0, count).flatMap((r, i) => {
    const f = f1 * r * rng.r(0.99, 1.01), a = 1 / (1 + i * 0.9), td = t60 * Math.pow(0.55, i);
    return [{ f, t60: td, a, ph: rng.r(0, 6.28) }, { f: f * 1.0035, t60: td * 0.9, a: a * 0.5, ph: rng.r(0, 6.28) }];
  });
}

/** Random hard, short modes (stone, bone, shell). */
function hardModes(rng: Rng, lo: number, hi: number, count: number, t60lo: number, t60hi: number): Mode[] {
  return Array.from({ length: count }, (_, i) => ({ f: rng.r(lo, hi), t60: rng.r(t60lo, t60hi), a: rng.r(0.3, 1) / (1 + i * 0.15), ph: rng.r(0, 6.28) }));
}

/** A low thump with a falling pitch (a body taking the blow). */
const thump = (rng: Rng, f0: number, f1: number, decay: number, len = decay * 6) =>
  glideSine(n(len), f0 * rng.r(0.93, 1.07), f1, decay * 0.5, ad(0.0015, decay), rng.r(0, 1));

/** Wet squelch: a few short, low grains and a closing low-pass. */
function squelch(rng: Rng, sec: number, fc = 1300, grains = 8): Buf {
  const b = crackle(n(sec + 0.03), rng, grains, sec, (x) => 1 - x * 0.7, (r) => grainNoise(r, r.r(fc * 0.4, fc), 1.6, r.r(0.006, 0.016)));
  mix(b, shape(lp(white(n(sec), rng), (t) => fc * Math.exp(-t / (sec * 0.6)) + 200, 1.2), ad(0.002, sec * 0.35)), 0, 0.5);
  return b;
}

/** A bubble (Minnaert): a sine that rises a little as it decays. */
function bubble(_rng: Rng, f0: number, tau: number): Buf {
  const len = n(tau * 6);
  const b = new Float64Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += 2 * Math.PI * f0 * (1 + 2.5 * t / (tau * 6)) / SR;
    b[i] = Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, t / 0.0008);
  }
  return b;
}

/** Hard contact transient: a short broadband click coloured around `fc`. */
function contact(rng: Rng, fc: number, width = 0.0006, q = 0.7): Buf {
  const len = n(0.03);
  const c = click(len, width);
  const nz = noiseEnv(rng, 0.03, ad(0.0002, 0.003));
  const s = new Float64Array(len);
  mix(s, c, 0, 0.8); mix(s, bp(nz, fc, q), 0, 1.2);
  return s;
}

// ------------------------------------------------------------------ hits by surface

function fleshHit(rng: Rng, heavy: number): Buf {
  const b = buf(0.35);
  mix(b, contact(rng, rng.r(1800, 2800), 0.0012, 0.6), 0, 0.55); // skin slap
  mix(b, thump(rng, rng.r(130, 165) / heavy, rng.r(55, 70), 0.05 * heavy), 0, 0.95); // chest thump
  mix(b, resonate(noiseEnv(rng, 0.012, ad(0.0005, 0.003)), hardModes(rng, 230, 620, 4, 0.03, 0.06)), 0, 0.9); // meat
  mix(b, squelch(rng, rng.r(0.05, 0.09), 1400, rng.r(5, 10) | 0), 0.003, 0.55); // wet
  mix(b, rustle(rng, 0.06, 5), 0.004, 0.25); // cloth/fur
  return sat(b, 1.6);
}

function armourHit(rng: Rng, v: number): Buf {
  const b = buf(0.6);
  const f1 = rng.r(480, 760) * (v % 2 ? 0.9 : 1.05);
  mix(b, contact(rng, 4200, 0.0004, 0.8), 0, 0.7);
  mix(b, modes(n(0.6), plate(rng, f1, rng.r(0.22, 0.34), 10, 1.2)), 0, 0.38); // the plate rings, damped by the body under it
  mix(b, crackle(n(0.2), rng, 16, 0.13, (x) => 1 - x, (r) => grainTing(r, r.r(3000, 8000), r.r(0.02, 0.05))), 0.004, 0.16); // mail jingle
  mix(b, thump(rng, 120, 60, 0.045), 0, 0.55); // the body inside
  return sat(b, 1.3);
}

function boneHit(rng: Rng): Buf {
  const b = buf(0.35);
  const f = rng.r(650, 950);
  mix(b, contact(rng, 3000, 0.0005), 0, 0.6);
  mix(b, modes(n(0.12), [{ f, t60: 0.05, a: 1 }, { f: f * 1.93, t60: 0.035, a: 0.6 }, { f: f * 3.07, t60: 0.02, a: 0.4 }, { f: f * 4.6, t60: 0.015, a: 0.25 }]), 0, 0.55); // dry tok
  mix(b, resonate(noiseEnv(rng, 0.008, ad(0.0003, 0.002)), [{ f: rng.r(260, 360), t60: 0.08, a: 1 }]), 0, 0.9); // hollow skull/ribs
  mix(b, crackle(n(0.05), rng, 18, 0.018, () => 1, (r) => grainNoise(r, r.r(2500, 7000), 1.5, 0.002)), 0, 0.5); // crack
  for (let i = 0, t = rng.r(0.04, 0.07); i < 3 + (rng.next() * 3 | 0); i++, t += rng.r(0.025, 0.06)) { // loose bones rattle
    const ff = rng.r(900, 2000);
    mix(b, modes(n(0.05), [{ f: ff, t60: 0.025, a: 1 }, { f: ff * 2.1, t60: 0.015, a: 0.4 }]), t, 0.22 / (1 + i * 0.5));
  }
  return sat(b, 1.4);
}

function chitinHit(rng: Rng): Buf {
  const b = buf(0.3);
  mix(b, contact(rng, rng.r(3500, 5000), 0.0003), 0, 0.8);
  mix(b, modes(n(0.08), hardModes(rng, 1000, 3800, 5, 0.02, 0.045)), 0, 0.35); // shell
  mix(b, crackle(n(0.1), rng, rng.r(22, 36) | 0, 0.055, (x) => 1 - x * 0.8, (r) => grainNoise(r, r.r(1800, 6500), 1.8, r.r(0.0015, 0.004))), 0.002, 0.65); // crunch
  mix(b, squelch(rng, 0.06, 1000, 4), 0.01, 0.3); // ichor
  mix(b, thump(rng, 160, 90, 0.025), 0, 0.4);
  return sat(b, 1.5);
}

function scaleHit(rng: Rng): Buf {
  const b = buf(0.4);
  mix(b, contact(rng, rng.r(1000, 1500), 0.0015, 0.5), 0, 0.7); // thick leathery slap
  mix(b, thump(rng, rng.r(100, 120), 48, 0.075), 0, 1.0); // big body
  mix(b, crackle(n(0.08), rng, 9, 0.05, (x) => 1 - x, (r) => grainNoise(r, r.r(1800, 3800), 3, r.r(0.004, 0.008))), 0.002, 0.45); // scales knock together
  mix(b, modes(n(0.06), hardModes(rng, 1300, 2600, 3, 0.015, 0.03)), 0, 0.2);
  mix(b, shape(lp(white(n(0.12), rng), 450), ad(0.002, 0.03)), 0, 0.6); // hide
  return sat(b, 1.6);
}

function stoneHit(rng: Rng): Buf {
  const b = buf(0.45);
  mix(b, contact(rng, rng.r(2500, 3500), 0.0003, 0.6), 0, 0.85);
  mix(b, modes(n(0.1), hardModes(rng, 450, 3600, 9, 0.015, 0.05)), 0, 0.3); // rock
  mix(b, thump(rng, 95, 50, 0.06), 0, 0.8);
  mix(b, crackle(n(0.4), rng, rng.r(14, 24) | 0, 0.3, (x) => Math.exp(-x * 4), (r) => grainNoise(r, r.r(1400, 5000), 2, r.r(0.003, 0.009))), 0.005, 0.35); // chips and pebbles
  mix(b, shape(lp(white(n(0.25), rng), 1800), ad(0.01, 0.06)), 0.01, 0.12); // grit
  return sat(b, 1.4);
}

function crystalHit(rng: Rng): Buf {
  const b = buf(0.6);
  mix(b, contact(rng, 5000, 0.0003), 0, 0.7);
  const ms = hardModes(rng, 1900, 6200, 7, 0.18, 0.45);
  mix(b, modes(n(0.6), ms), 0, 0.16); // glassy ring
  mix(b, crackle(n(0.3), rng, 12, 0.22, (x) => Math.exp(-x * 3), (r) => grainTing(r, r.r(3000, 9000), r.r(0.03, 0.08))), 0.003, 0.2); // tinkling shards
  mix(b, crackle(n(0.04), rng, 14, 0.015, () => 1, (r) => grainNoise(r, r.r(4000, 9000), 1.5, 0.0015)), 0, 0.5); // crack
  mix(b, thump(rng, 140, 80, 0.03), 0, 0.4);
  return sat(b, 1.3);
}

function slimeHit(rng: Rng): Buf {
  const b = buf(0.4);
  mix(b, shape(lp(white(n(0.03), rng), 2200), ad(0.0008, 0.006)), 0, 0.8); // wet slap
  const len = rng.r(0.1, 0.16);
  mix(b, shape(bp(white(n(len + 0.05), rng), (t) => 250 + 800 * bump(len, 0.3, 1)(t), 4), bump(len, 0.15, 1)), 0, 1.3); // gloop
  for (let i = 0, t = 0.02; i < 4 + (rng.next() * 4 | 0); i++, t += rng.r(0.015, 0.04)) mix(b, bubble(rng, rng.r(300, 950), rng.r(0.008, 0.02)), t, 0.35 / (1 + i * 0.25));
  mix(b, thump(rng, 110, 70, 0.04), 0, 0.5);
  return sat(b, 1.3);
}

function etherealHit(rng: Rng): Buf {
  const b = buf(0.5);
  const len = rng.r(0.14, 0.2);
  mix(b, shape(bp(white(n(len + 0.05), rng), (t) => 4200 * Math.exp(-t / 0.06) + 700, 1.4), ad(0.002, len * 0.35)), 0, 0.9); // the blade passes through mist
  const f = rng.r(200, 290);
  mix(b, resonate(noiseEnv(rng, 0.14, bump(0.14, 0.3, 1)), [{ f, t60: 0.4, a: 1 }, { f: f * 1.5, t60: 0.3, a: 0.6 }, { f: f * 2.01, t60: 0.25, a: 0.4 }], n(0.5)), 0, 1.6); // hollow moan
  mix(b, crackle(n(0.3), rng, 6, 0.2, () => 1, (r) => grainTing(r, r.r(4500, 9000), 0.06)), 0.01, 0.08); // sparkle
  return b;
}

function waterHit(rng: Rng): Buf {
  const b = buf(0.45);
  mix(b, contact(rng, 1500, 0.002, 0.6), 0, 0.6);
  mix(b, shape(lp(white(n(0.3), rng), (t) => 1800 * Math.exp(-t / 0.08) + 300), ad(0.002, 0.06)), 0, 0.8); // wash
  for (let i = 0; i < 12; i++) mix(b, bubble(rng, rng.r(500, 1800), rng.r(0.006, 0.016)), rng.r(0.01, 0.2), rng.r(0.08, 0.25)); // droplets and bubbles
  mix(b, thump(rng, 120, 70, 0.04), 0, 0.45);
  return sat(b, 1.2);
}

// ------------------------------------------------------------------ weapon accents and crits

function slash(rng: Rng): Buf {
  const b = buf(0.12);
  mix(b, shape(hp(white(n(0.08), rng), 3000), ad(0.0006, 0.016)), 0, 0.9); // edge through skin/cloth
  mix(b, shape(bp(white(n(0.08), rng), (t) => 7500 * Math.exp(-t / 0.03) + 2500, 2), ad(0.001, 0.025)), 0, 0.7); // shk
  mix(b, modes(n(0.1), [{ f: rng.r(4000, 4600), t60: 0.06, a: 1 }, { f: rng.r(5900, 6400), t60: 0.04, a: 0.6 }]), 0, 0.08); // edge shimmer
  return b;
}

function chop(rng: Rng): Buf {
  const b = buf(0.15);
  const f = rng.r(170, 240);
  mix(b, modes(n(0.1), [{ f, t60: 0.06, a: 1 }, { f: f * 2.4, t60: 0.04, a: 0.5 }, { f: f * 4.1, t60: 0.02, a: 0.3 }]), 0, 0.7); // thock
  mix(b, shape(bp(white(n(0.04), rng), 900, 1), ad(0.0005, 0.008)), 0, 0.8);
  mix(b, crackle(n(0.05), rng, 12, 0.025, () => 1, (r) => grainNoise(r, r.r(1800, 5000), 1.5, 0.002)), 0.002, 0.5); // bite
  return sat(b, 1.4);
}

function crunch(rng: Rng): Buf {
  const b = buf(0.2);
  mix(b, crackle(n(0.1), rng, rng.r(30, 45) | 0, 0.06, (x) => 1 - x * 0.7, (r) => grainNoise(r, r.r(900, 4200), 1.6, r.r(0.002, 0.005))), 0, 0.8);
  mix(b, thump(rng, 105, 48, 0.06), 0, 1.0);
  return sat(b, 1.6);
}

function crit(rng: Rng): Buf {
  const b = buf(0.5);
  mix(b, thump(rng, rng.r(80, 95), 40, 0.12, 0.5), 0, 1.0); // heavy body blow
  mix(b, shape(hp(white(n(0.03), rng), 1800), ad(0.0003, 0.007)), 0, 0.7); // crack
  mix(b, shape(lp(white(n(0.3), rng), 260), ad(0.003, 0.07)), 0, 1.6); // air pushed out
  mix(b, crunch(rng), 0.002, 0.45);
  return sat(b, 2);
}

// ------------------------------------------------------------------ blocks and parries

function blockWood(rng: Rng, v: number): Buf {
  const b = buf(0.4);
  const f1 = rng.r(165, 235);
  const ratios = [1, 1.58, 2.31, 3.06, 3.95, 5.1, 6.4];
  const ms = ratios.map((r, i) => ({ f: f1 * r * rng.r(0.97, 1.03), t60: 0.13 * Math.pow(0.78, i), a: 1 / (1 + i * 0.4), ph: rng.r(0, 6.28) }));
  mix(b, contact(rng, rng.r(1200, 1800), 0.001, 0.5), 0, 0.8);
  mix(b, modes(n(0.3), ms), 0, 0.6); // planks
  mix(b, resonate(noiseEnv(rng, 0.006, ad(0.0003, 0.0015)), [{ f: f1 * 0.7, t60: 0.09, a: 1 }]), 0, 0.9); // hollow board on the arm
  if (v % 2 === 0) mix(b, modes(n(0.2), [{ f: rng.r(2000, 2600), t60: 0.15, a: 1 }, { f: rng.r(3300, 3900), t60: 0.09, a: 0.5 }]), 0.001, 0.05); // iron rim
  mix(b, thump(rng, 110, 70, 0.035), 0, 0.45); // the arm takes it
  mix(b, crackle(n(0.05), rng, 6, 0.02, () => 1, (r) => grainNoise(r, r.r(2000, 4000), 2, 0.002)), 0.001, 0.25); // splinters
  return sat(b, 1.3);
}

function blockMetal(rng: Rng): Buf {
  const b = buf(0.9);
  mix(b, contact(rng, 4500, 0.0003, 0.8), 0, 0.8);
  mix(b, modes(n(0.9), plate(rng, rng.r(330, 460), rng.r(0.45, 0.65), 11, 1.4)), 0, 0.32); // shield face
  mix(b, modes(n(0.6), blade(rng, rng.r(950, 1350), 0.45, 3)), 0, 0.12); // the weapon's own ring
  mix(b, thump(rng, 125, 70, 0.04), 0, 0.5);
  return sat(b, 1.2);
}

function parry(rng: Rng): Buf {
  const b = buf(1.0);
  mix(b, contact(rng, 5000, 0.0003, 0.9), 0, 0.7);
  mix(b, modes(n(1.0), blade(rng, rng.r(1050, 1450), rng.r(0.45, 0.65))), 0, 0.2); // blade one
  mix(b, modes(n(1.0), blade(rng, rng.r(820, 1200), rng.r(0.4, 0.6))), 0.002, 0.16); // blade two
  // the edges slide: a short scrape that keeps exciting the blades ("shiing")
  const sl = rng.r(0.07, 0.13);
  const scrape = shape(hp(white(n(sl + 0.02), rng), 1800), bump(sl, 0.2, 1));
  mix(b, resonate(scrape, blade(rng, rng.r(1500, 2000), 0.25, 3), n(0.5)), 0.008, 0.5);
  mix(b, shape(bp(white(n(sl + 0.02), rng), (t) => 5200 - 2000 * t / sl, 3), bump(sl, 0.3, 1)), 0.008, 0.25);
  return sat(b, 1.2);
}

// ------------------------------------------------------------------ bows, crossbows, thrown

function bow(rng: Rng): Buf {
  const b = buf(0.45);
  mix(b, contact(rng, rng.r(2200, 3000), 0.0008, 0.6), 0, 0.6); // string slaps the bracer
  mix(b, lp(pluck(n(0.4), rng, rng.r(92, 128), rng.r(0.14, 0.22), 0.75, 0.12), 2600), 0, 0.85); // thrum
  const f = rng.r(270, 340);
  mix(b, modes(n(0.12), [{ f, t60: 0.07, a: 1 }, { f: f * 2.3, t60: 0.04, a: 0.4 }]), 0, 0.3); // limbs knock
  mix(b, whoosh(rng, { len: 0.16, peak: 0.12, f0: 900, f1: 2600, q: 1.6, recede: true, flutter: [rng.r(90, 130), 0.35] }), 0.004, 0.35); // arrow away
  return sat(b, 1.3);
}

function arrowFly(rng: Rng): Buf {
  const len = rng.r(0.24, 0.3);
  return whoosh(rng, { len, peak: 0.55, f0: 1100, f1: 3600, q: 2, sharp: 2.5, doppler: 0.18, flutter: [rng.r(90, 140), 0.45] });
}

function crossbow(rng: Rng): Buf {
  const b = buf(0.4);
  mix(b, grainTing(rng, rng.r(2400, 3200), 0.03), 0, 0.6); // trigger
  mix(b, grainTing(rng, rng.r(1800, 2400), 0.04), 0.011, 0.5); // latch
  mix(b, contact(rng, 2800, 0.0005), 0.012, 0.6);
  mix(b, lp(pluck(n(0.3), rng, rng.r(68, 88), rng.r(0.09, 0.13), 0.85, 0.1), 1900), 0.012, 1.0); // heavy prod
  mix(b, thump(rng, 150, 85, 0.03), 0.012, 0.5); // stock kicks
  mix(b, whoosh(rng, { len: 0.12, peak: 0.1, f0: 800, f1: 2200, q: 1.4, recede: true }), 0.016, 0.35); // bolt away
  return sat(b, 1.4);
}

function throwSpear(rng: Rng): Buf {
  const len = rng.r(0.3, 0.36);
  const b = whoosh(rng, { len, peak: 0.25, f0: 300, f1: 1500, q: 1.1, body: 0.3, recede: true, flutter: [rng.r(14, 22), 0.25] });
  mix(b, rustle(rng, 0.08, 6), 0, 0.3);
  return b;
}

function throwStar(rng: Rng): Buf {
  const len = rng.r(0.26, 0.32);
  const b = buf(len + 0.05);
  const spin0 = rng.r(26, 34);
  let ph = 0;
  const nz = bp(white(b.length, rng), (t) => 2800 - 900 * t / len, 2.5);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += 2 * Math.PI * (spin0 - 8 * t / len) / SR;
    b[i] = nz[i] * Math.pow(Math.abs(Math.sin(ph)), 3) * ad(0.01, len * 0.5)(t);
  }
  mix(b, grainTing(rng, rng.r(5200, 6400), 0.08), 0, 0.15);
  return b;
}

function arrowFlesh(rng: Rng): Buf {
  const b = buf(0.3);
  mix(b, contact(rng, 3200, 0.0004), 0, 0.7); // the point goes in
  mix(b, thump(rng, rng.r(200, 240), 85, 0.025), 0, 0.8); // thwuck
  mix(b, squelch(rng, 0.04, 1300, 4), 0.002, 0.4);
  const f = rng.r(170, 230);
  mix(b, modes(n(0.15), [{ f, t60: 0.1, a: 1 }, { f: f * 2.75, t60: 0.05, a: 0.4 }]), 0.003, 0.12); // the shaft quivers
  return sat(b, 1.5);
}

function arrowArmour(rng: Rng): Buf {
  const b = buf(0.4);
  mix(b, contact(rng, 5000, 0.0003), 0, 0.6);
  mix(b, modes(n(0.35), plate(rng, rng.r(850, 1250), 0.18, 8, 1.5)), 0, 0.28); // tink on plate
  mix(b, shape(bp(white(n(0.04), rng), 5500, 2), ad(0.0005, 0.01)), 0.001, 0.5); // the tip skids
  mix(b, whoosh(rng, { len: 0.12, peak: 0.1, f0: 1400, f1: 2800, q: 1.5, recede: true, flutter: [110, 0.4] }), 0.02, 0.2); // glances away
  return sat(b, 1.2);
}

function arrowWood(rng: Rng): Buf {
  const b = buf(0.45);
  const f = rng.r(330, 460);
  mix(b, contact(rng, 1800, 0.0006), 0, 0.7);
  mix(b, modes(n(0.12), [{ f, t60: 0.06, a: 1 }, { f: f * 2.2, t60: 0.04, a: 0.5 }, { f: f * 3.6, t60: 0.025, a: 0.3 }]), 0, 0.6); // thock
  // the stuck shaft buzzes: a decaying harmonic series that sags in pitch
  const f0 = rng.r(42, 60), len = n(0.35);
  const bz = new Float64Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += 2 * Math.PI * f0 * (1 - 0.05 * t) / SR;
    let s = 0;
    for (let h = 1; h <= 12; h++) s += Math.sin(ph * h) / h;
    bz[i] = s * Math.exp(-t / 0.07) * Math.min(1, t / 0.004);
  }
  mix(b, lp(bz, 1400), 0.004, 0.25);
  return sat(b, 1.3);
}

function arrowStone(rng: Rng): Buf {
  const b = buf(0.35);
  const clack = (g: number, at0: number) => {
    mix(b, contact(rng, rng.r(2500, 4000), 0.0003), at0, 0.8 * g);
    mix(b, modes(n(0.06), hardModes(rng, 1500, 4500, 4, 0.012, 0.03)), at0, 0.35 * g);
  };
  clack(1, 0);
  mix(b, crackle(n(0.06), rng, 8, 0.03, () => 1, (r) => grainNoise(r, r.r(3000, 6000), 2, 0.002)), 0.002, 0.35); // splinters
  const t1 = rng.r(0.07, 0.12);
  clack(0.3, t1); clack(0.12, t1 + rng.r(0.05, 0.07)); // bounces
  return sat(b, 1.2);
}

// ------------------------------------------------------------------ wands and rods

type El = 'energy' | 'fire' | 'ice' | 'earth' | 'death' | 'holy';
function zap(rng: Rng, el: El): Buf {
  const b = buf(0.45);
  switch (el) {
    case 'energy': {
      // an electric arc: irregular discharge clicks over a mains-like buzz
      const len = rng.r(0.22, 0.3);
      const arc = new Float64Array(n(len));
      let t = 0;
      while (t < len) { const i = Math.round(t * SR); if (i < arc.length) arc[i] = rng.r(-1, 1); t += rng.r(0.0005, 0.004); }
      mix(b, shape(bp(arc, 3500, 0.7), ad(0.005, len * 0.4)), 0, 1.6);
      const f = rng.r(95, 120); let ph = 0;
      const hum = shape(new Float64Array(n(len)).map((_, i) => { ph += 2 * Math.PI * f * (1 + 0.02 * Math.sin(i / 300)) / SR; return Math.sign(Math.sin(ph)) * 0.5 + Math.sin(ph * 3) * 0.3; }), ad(0.01, len * 0.35));
      mix(b, lp(hum, 1400), 0, 0.04);
      mix(b, shape(hp(white(n(len), rng), 5000), ad(0.002, len * 0.3)), 0, 0.15);
      break;
    }
    case 'fire': {
      const len = rng.r(0.3, 0.38);
      mix(b, shape(lp(white(n(len), rng), (t) => 300 + 2200 * bump(len, 0.3, 1)(t), 0.9), bump(len, 0.25, 1.2)), 0, 1.3); // whoomph
      mix(b, crackle(n(len), rng, 14, len, (x) => 1 - x * 0.5, (r) => grainNoise(r, r.r(2000, 5000), 1.5, r.r(0.002, 0.005))), 0, 0.5); // pops
      mix(b, thump(rng, 120, 60, 0.05), 0, 0.3);
      break;
    }
    case 'ice': {
      const len = rng.r(0.25, 0.32);
      mix(b, shape(hp(white(n(len), rng), (t) => 6000 - 2500 * t / len), ad(0.004, len * 0.4)), 0, 0.6); // frost hiss
      mix(b, crackle(n(len + 0.1), rng, 12, len, (x) => 1 - x * 0.6, (r) => grainTing(r, r.r(3000, 8500), r.r(0.04, 0.09))), 0, 0.25);
      mix(b, crackle(n(0.03), rng, 8, 0.01, () => 1, (r) => grainNoise(r, r.r(4000, 8000), 1.5, 0.0015)), 0, 0.5);
      break;
    }
    case 'earth': {
      const len = rng.r(0.3, 0.36);
      mix(b, shape(lp(white(n(len), rng), (t) => 180 + 700 * bump(len, 0.3, 1)(t)), bump(len, 0.25, 1)), 0, 1.6);
      mix(b, crackle(n(len), rng, 20, len, (x) => 1 - x * 0.6, (r) => grainNoise(r, r.r(900, 3000), 2, r.r(0.003, 0.007))), 0, 0.45); // grit
      mix(b, thump(rng, 90, 50, 0.05), 0, 0.5);
      break;
    }
    case 'death': {
      const len = rng.r(0.32, 0.4);
      mix(b, shape(bp(white(n(len), rng), (t) => 650 - 380 * t / len, 3), bump(len, 0.45, 1.3)), 0, 1.3); // a dark breath
      const f = rng.r(120, 150);
      mix(b, resonate(noiseEnv(rng, len, bump(len, 0.5, 1)), [{ f, t60: 0.3, a: 1 }, { f: f * 1.41, t60: 0.25, a: 0.6 }, { f: f * 2.37, t60: 0.2, a: 0.4 }], n(len + 0.1)), 0, 2.2);
      break;
    }
    case 'holy': {
      const len = rng.r(0.28, 0.34);
      mix(b, shape(hp(white(n(len), rng), 3200), bump(len, 0.35, 1.2)), 0, 0.5); // airy
      const f = rng.r(840, 940);
      mix(b, modes(n(0.45), [{ f, t60: 0.5, a: 1 }, { f: f * 2.76, t60: 0.25, a: 0.35 }, { f: f * 5.4, t60: 0.1, a: 0.15 }, { f: f * 1.003, t60: 0.5, a: 0.5 }]), 0.02, 0.12);
      mix(b, crackle(n(len), rng, 8, len, () => 1, (r) => grainTing(r, r.r(4000, 8000), 0.07)), 0, 0.1);
      break;
    }
  }
  return b;
}

function zapHit(rng: Rng, el: El): Buf {
  const b = buf(0.4);
  switch (el) {
    case 'energy':
      mix(b, contact(rng, 4000, 0.0003), 0, 0.8);
      mix(b, crackle(n(0.08), rng, 30, 0.05, (x) => 1 - x, (r) => grainNoise(r, r.r(2000, 7000), 1, 0.0012)), 0, 0.6); // snap
      mix(b, thump(rng, 130, 80, 0.025), 0, 0.4);
      break;
    case 'fire':
      mix(b, shape(lp(white(n(0.15), rng), 1600), ad(0.002, 0.03)), 0, 1.1); // whump
      mix(b, shape(hp(white(n(0.3), rng), 3500), ad(0.01, 0.07)), 0, 0.3); // sizzle
      mix(b, crackle(n(0.2), rng, 8, 0.15, (x) => 1 - x, (r) => grainNoise(r, r.r(2000, 5000), 1.5, 0.003)), 0.01, 0.4);
      break;
    case 'ice':
      mix(b, crystalHit(rng), 0, 0.8);
      break;
    case 'earth':
      mix(b, thump(rng, 95, 45, 0.06), 0, 0.9);
      mix(b, crackle(n(0.3), rng, 16, 0.2, (x) => Math.exp(-x * 3), (r) => grainNoise(r, r.r(900, 3500), 2, r.r(0.003, 0.008))), 0, 0.45);
      mix(b, shape(lp(white(n(0.1), rng), 700), ad(0.002, 0.03)), 0, 0.6);
      break;
    case 'death':
      mix(b, thump(rng, 75, 38, 0.08), 0, 1.0);
      mix(b, shape(bp(white(n(0.25), rng), 420, 2.5), ad(0.004, 0.06)), 0, 0.9);
      break;
    case 'holy': {
      const f = rng.r(1250, 1400);
      mix(b, modes(n(0.4), [{ f, t60: 0.35, a: 1 }, { f: f * 2.76, t60: 0.18, a: 0.35 }, { f: f * 1.5, t60: 0.3, a: 0.4 }]), 0, 0.2);
      mix(b, shape(hp(white(n(0.2), rng), 6000), ad(0.002, 0.04)), 0, 0.35);
      mix(b, thump(rng, 160, 100, 0.02), 0, 0.3);
      break;
    }
  }
  return b;
}

// ------------------------------------------------------------------ falls and misses

const SIZES = { small: 0.65, medium: 1, large: 1.45, huge: 2.1 } as const;
function fall(rng: Rng, size: keyof typeof SIZES): Buf {
  const sz = SIZES[size];
  const b = buf(0.5 + sz * 0.5);
  const hits = size === 'small' ? 1 : size === 'huge' ? 3 : 2;
  let t = 0;
  for (let i = 0; i < hits; i++) {
    const g = i === hits - 1 ? 1 : 0.55; // knees, then the body
    mix(b, thump(rng, 105 / Math.sqrt(sz), 42 / Math.pow(sz, 0.3), 0.055 * sz), t, g);
    mix(b, shape(lp(white(n(0.15 * sz), rng), 650 / Math.sqrt(sz)), ad(0.002, 0.025 * sz)), t, g * 0.9);
    t += rng.r(0.08, 0.14) * Math.sqrt(sz);
  }
  mix(b, rustle(rng, 0.12 * sz, 8), 0, 0.25); // gear and cloth
  mix(b, shape(lp(white(n(0.4 * sz), rng), 1400), ad(0.03, 0.08 * sz)), t * 0.8, 0.12); // dust
  if (size === 'huge' || size === 'large') {
    mix(b, shape(lp(white(n(0.6 * sz), rng), 110), ad(0.01, 0.15 * sz)), t * 0.7, size === 'huge' ? 2 : 1.1); // ground shakes
    mix(b, crackle(n(0.4 * sz), rng, 14, 0.3 * sz, (x) => Math.exp(-x * 3), (r) => grainNoise(r, r.r(900, 3000), 2, 0.006)), t * 0.7, 0.2);
  }
  return sat(b, 1.4);
}

function fallBone(rng: Rng): Buf {
  const b = buf(0.9);
  const count = rng.r(18, 26) | 0;
  for (let i = 0; i < count; i++) {
    const x = Math.pow(rng.next(), 1.8); // most bones land at once, a few roll on
    const f = rng.r(600, 2200);
    mix(b, modes(n(0.06), [{ f, t60: rng.r(0.02, 0.05), a: 1, ph: rng.r(0, 6) }, { f: f * rng.r(1.8, 2.4), t60: 0.02, a: 0.5 }]), 0.02 + x * 0.6, rng.r(0.25, 0.7) * (1 - x * 0.6));
  }
  mix(b, resonate(noiseEnv(rng, 0.01, ad(0.0003, 0.002)), [{ f: rng.r(250, 330), t60: 0.08, a: 1 }]), 0.12, 0.8); // the skull
  mix(b, thump(rng, 120, 70, 0.03), 0.02, 0.4);
  return sat(b, 1.3);
}

function fallArmour(rng: Rng): Buf {
  const b = fall(rng, 'medium');
  for (let i = 0; i < 9; i++) mix(b, modes(n(0.25), plate(rng, rng.r(700, 1600), rng.r(0.08, 0.18), 5, 1)), rng.r(0.0, 0.35), rng.r(0.04, 0.12)); // plates rattle
  mix(b, crackle(n(0.4), rng, 20, 0.3, (x) => 1 - x, (r) => grainTing(r, r.r(3000, 8000), 0.03)), 0.01, 0.15); // mail
  return b;
}

function miss(rng: Rng): Buf {
  const len = rng.r(0.12, 0.16);
  const b = whoosh(rng, { len, peak: 0.45, f0: 1200, f1: 3800, q: 1.3, sharp: 2.5, doppler: 0.2 });
  mix(b, rustle(rng, 0.1, 6), 0.02, 0.35); // the dodge
  return b;
}

// ------------------------------------------------------------------ the bank

const S = (name: string, variants: number, target: number, make: ClipSpec['make'], wet = 0.1, rt = 0.3): ClipSpec => ({ name, variants, target, wet, rt, make });

export const CLIPS: ClipSpec[] = [
  // swings, by weapon weight
  S('swing_blade', 4, -23, (r) => {
    const len = r.r(0.18, 0.24);
    const b = whoosh(r, { len, peak: 0.55, f0: 700, f1: 3800, q: 1.6, whistle: 0.35, whistleQ: 10 });
    return mix(b, rustle(r, 0.08, 5), 0, 0.15);
  }, 0.08),
  S('swing_axe', 4, -22, (r) => {
    const len = r.r(0.24, 0.3);
    const b = whoosh(r, { len, peak: 0.6, f0: 380, f1: 1800, q: 1.2, whistle: 0.15, whistleQ: 6, body: 0.35, flutter: [r.r(18, 28), 0.15] });
    return mix(b, rustle(r, 0.1, 6), 0, 0.15);
  }, 0.08),
  S('swing_club', 4, -22, (r) => {
    const len = r.r(0.28, 0.34);
    const b = whoosh(r, { len, peak: 0.62, f0: 220, f1: 1100, q: 0.9, body: 0.6 });
    return mix(b, rustle(r, 0.1, 6), 0, 0.18);
  }, 0.08),
  S('swing_fist', 3, -25, (r) => {
    const len = r.r(0.12, 0.15);
    const b = whoosh(r, { len, peak: 0.5, f0: 700, f1: 2400, q: 1 });
    return mix(b, rustle(r, 0.1, 8), 0, 0.4);
  }, 0.08),
  S('swing_claw', 3, -24, (r) => {
    const len = r.r(0.16, 0.2);
    const b = whoosh(r, { len, peak: 0.55, f0: 600, f1: 2600, q: 1.1 });
    return mix(b, rustle(r, 0.1, 6), 0, 0.3);
  }, 0.08),
  S('swing_big', 3, -21, (r) => whoosh(r, { len: r.r(0.38, 0.46), peak: 0.6, f0: 130, f1: 700, q: 0.8, body: 0.9 }), 0.1, 0.4),
  // hits by surface
  S('hit_flesh', 5, -13, (r, v) => fleshHit(r, 1 + (v % 3) * 0.12)),
  S('hit_armour', 4, -14, armourHit, 0.12, 0.35),
  S('hit_bone', 4, -14, boneHit),
  S('hit_chitin', 4, -14, chitinHit),
  S('hit_scale', 4, -13, scaleHit),
  S('hit_stone', 4, -13, stoneHit, 0.12, 0.35),
  S('hit_crystal', 4, -15, crystalHit, 0.12, 0.4),
  S('hit_slime', 4, -14, slimeHit),
  S('hit_ethereal', 4, -16, etherealHit, 0.15, 0.45),
  S('hit_water', 4, -14, waterHit),
  // weapon accents (layered on top of the surface) and critical hits
  S('acc_slash', 3, -19, slash, 0.05),
  S('acc_chop', 3, -18, chop, 0.05),
  S('acc_crunch', 3, -17, crunch, 0.05),
  S('crit', 3, -12, crit, 0.12, 0.4),
  S('miss', 3, -22, miss, 0.08),
  // blocks and parries
  S('block_wood', 4, -13, blockWood, 0.1),
  S('block_metal', 4, -14, blockMetal, 0.12, 0.4),
  S('parry', 4, -15, parry, 0.12, 0.4),
  // ranged
  S('bow', 4, -15, bow, 0.08),
  S('arrow_fly', 3, -23, arrowFly, 0.05),
  S('crossbow', 3, -14, crossbow, 0.08),
  S('throw_spear', 3, -20, throwSpear, 0.06),
  S('throw_star', 3, -21, throwStar, 0.06),
  S('arrow_flesh', 3, -15, arrowFlesh),
  S('arrow_armour', 3, -16, arrowArmour, 0.1),
  S('arrow_wood', 3, -15, arrowWood),
  S('arrow_stone', 3, -16, arrowStone),
  // wand and rod bolts and their hits
  ...(['energy', 'fire', 'ice', 'earth', 'death', 'holy'] as El[]).flatMap((el) => [
    S(`zap_${el}`, 2, -15, (r) => zap(r, el), 0.1, 0.35),
    S(`zaphit_${el}`, 2, -14, (r) => zapHit(r, el), 0.1, 0.35),
  ]),
  // bodies falling
  S('fall_small', 2, -16, (r) => fall(r, 'small'), 0.12),
  S('fall_medium', 3, -13, (r) => fall(r, 'medium'), 0.12),
  S('fall_large', 3, -12, (r) => fall(r, 'large'), 0.14, 0.4),
  S('fall_huge', 2, -11, (r) => fall(r, 'huge'), 0.15, 0.5),
  S('fall_bone', 2, -14, fallBone, 0.12),
  S('fall_armour', 2, -13, fallArmour, 0.12),
];

export { scale };
