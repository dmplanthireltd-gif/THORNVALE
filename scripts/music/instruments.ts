/**
 * Instrument voices for Thornvale's soundtrack, synthesized offline (no samples, no dependencies).
 *
 *  - plucked strings (lute, harp, guitar, oud, pizzicato, upright bass) use Karplus-Strong
 *  - bowed strings (fiddle, cello, string section, contrabass) use detuned band-limited saws
 *    through a body filter, with a bow swell and delayed vibrato
 *  - winds (flute, whistle, pan pipes, ney, ocarina, recorder) are a few sine partials plus
 *    filtered breath noise
 *  - accordion and concertina are pairs of slightly detuned reeds
 *  - horns and brass use a saw with a rising filter "blare" and a small pitch scoop
 *  - bells, celesta and music box are FM; marimba and kalimba are struck partials
 *  - choir is saws through vowel formant filters
 *  - percussion kits (folk, hand drums, darbuka, orchestral, soft) are built from tuned drums,
 *    filtered noise and inharmonic metal partials
 */

export const SR = 44100;

export interface Out { add(i: number, v: number, pan: number): void }

// deterministic noise so a re-render gives identical files
let seed = 0x9e3779b9;
export function reseed(s: number): void { seed = s >>> 0 || 1; }
function rnd(): number {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const white = () => rnd() * 2 - 1;
const TAU = Math.PI * 2;

/** RBJ biquad filter. */
class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private type: 'lp' | 'bp' | 'hp', f: number, private q = 0.707) { this.set(f); }
  set(f: number): void {
    const w = (TAU * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * this.q);
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyblep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** Attack / release envelope; `i` and `len` in samples. */
function ar(i: number, len: number, atk: number, rel: number): number {
  const a = atk > 0 ? Math.min(1, i / (atk * SR)) : 1;
  if (i < len) return a * a * (3 - 2 * a); // smoothstep attack
  const r = 1 - (i - len) / (rel * SR);
  return r > 0 ? a * r * r : 0;
}

/** Vibrato multiplier: starts after `delay`, eases in. */
function vibrato(tt: number, depth: number, rate = 5.2, delay = 0.18): number {
  if (!depth || tt < delay) return 1;
  return 1 + depth * Math.sin(TAU * rate * (tt - delay)) * Math.min(1, (tt - delay) * 3);
}

// ------------------------------------------------------------------ plucked strings

interface PluckOpt { decay: number; bright: number; pick?: number; ring?: boolean; body?: number }

function pluck(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, p: PluckOpt): void {
  const N = SR / f, start = Math.floor(t0 * SR);
  const tail = p.ring ? p.decay : 0.22;
  const total = Math.floor(Math.min(dur + tail, 6) * SR), off = Math.floor(dur * SR);
  const y = new Float32Array(total + 2);
  // excitation: a burst of noise, darker for a soft finger and brighter for a pick
  const n0 = Math.ceil(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < n0 && i < total; i++) { lp += p.bright * (white() - lp); y[i] = lp; mean += lp; }
  mean /= n0;
  for (let i = 0; i < n0 && i < total; i++) y[i] -= mean;
  const gOn = Math.pow(10, -3 / (p.decay * f)), gOff = Math.pow(10, -3 / (0.12 * f));
  const s = 0.5 - p.bright * 0.42; // loop low-pass: brighter strings lose less treble per pass
  const read = (pos: number) => { const k = Math.floor(pos), fr = pos - k; return k < 0 ? 0 : y[k] + (y[k + 1] - y[k]) * fr; };
  for (let i = n0; i < total; i++) {
    const g = i < off || p.ring ? gOn : gOff;
    y[i] = g * ((1 - s) * read(i - N) + s * read(i - N - 1));
  }
  const pk = p.pick ? Math.max(1, Math.round(p.pick * N)) : 0;
  const body = p.body ? new Biquad('bp', p.body, 1.2) : null;
  for (let i = 0; i < total; i++) {
    let v = pk ? y[i] - (i >= pk ? y[i - pk] : 0) : y[i];
    if (body) v = v * 0.75 + body.run(v) * 0.9;
    const fade = i > total - 400 ? (total - i) / 400 : 1;
    o.add(start + i, v * vol * 1.6 * fade, pan);
  }
}

// ------------------------------------------------------------------ bowed strings

interface BowOpt { bright: number; vib?: number; atk?: number; rel?: number; voices?: number; detune?: number; spread?: number; marcato?: boolean }

function bowed(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, p: BowOpt): void {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR), rel = p.rel ?? 0.2;
  const total = len + Math.floor(rel * SR);
  const nv = p.voices ?? 1, det = p.detune ?? 0.004;
  const ph = new Float64Array(nv).map(() => rnd());
  const vr = new Float64Array(nv).map(() => 4.6 + rnd() * 1.2);
  const lpf = new Biquad('lp', Math.min(11000, f * p.bright), 0.9);
  const body = new Biquad('bp', Math.min(4000, f * 2.5 + 300), 0.8);
  const hiss = new Biquad('bp', Math.min(9000, f * 6), 1.5);
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let s = 0;
    for (let v = 0; v < nv; v++) {
      const d = nv === 1 ? 1 : 1 + det * ((v / (nv - 1)) * 2 - 1);
      const fr = f * d * vibrato(tt, p.vib ?? 0.0045, vr[v], 0.2);
      const dt = fr / SR;
      ph[v] += dt; ph[v] -= Math.floor(ph[v]);
      s += 2 * ph[v] - 1 - polyblep(ph[v], dt);
    }
    s /= Math.sqrt(nv);
    let e = ar(i, len, p.atk ?? 0.08, rel);
    if (p.marcato) e *= 0.65 + 0.35 * Math.exp(-tt * 12) * 1.6;
    const bow = hiss.run(white()) * 0.05 * Math.exp(-tt * 6);
    const x = lpf.run(s) * 0.8 + body.run(s) * 0.5 + bow;
    o.add(start + i, x * vol * e, pan);
  }
}

// ------------------------------------------------------------------ winds

interface WindOpt { breath: number; h2: number; h3: number; vib?: number; atk?: number; rel?: number; chiff?: number; octaveUp?: number }

function wind(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, p: WindOpt): void {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR), rel = p.rel ?? 0.12;
  const total = len + Math.floor(rel * SR);
  const air = new Biquad('bp', Math.min(12000, f * 2), 2.5);
  const chiff = new Biquad('hp', 2500, 0.7);
  let ph = rnd();
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    ph += (f * vibrato(tt, p.vib ?? 0.006, 5, 0.22)) / SR; ph -= Math.floor(ph);
    const w = ph * TAU;
    const tone = Math.sin(w) + p.h2 * Math.sin(2 * w) + p.h3 * Math.sin(3 * w);
    const e = ar(i, len, p.atk ?? 0.05, rel);
    const breath = air.run(white()) * p.breath * (0.6 + 0.4 * e);
    const ch = (p.chiff ?? 0.15) * chiff.run(white()) * Math.exp(-tt * 40);
    o.add(start + i, (tone * e + breath * e + ch) * vol * 0.8, pan);
  }
}

// ------------------------------------------------------------------ reeds (accordion, concertina)

function reed(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, bright: number, det = 0.0035): void {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR), rel = 0.09;
  const total = len + Math.floor(rel * SR);
  const lpf = new Biquad('lp', Math.min(8000, f * bright), 0.8);
  let a = rnd(), b = rnd();
  for (let i = 0; i < total; i++) {
    const fa = f * (1 - det), fb = f * (1 + det);
    a += fa / SR; a -= Math.floor(a);
    b += fb / SR; b -= Math.floor(b);
    const sa = 2 * a - 1 - polyblep(a, fa / SR);
    const pb = (b < 0.35 ? 1 : -1) + polyblep(b, fb / SR) - polyblep((b + 0.65) % 1, fb / SR);
    const e = ar(i, len, 0.03, rel);
    o.add(start + i, lpf.run(sa * 0.6 + pb * 0.4) * vol * e * 0.8, pan);
  }
}

// ------------------------------------------------------------------ brass

function brass(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, bright: number, voices = 1): void {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR), rel = 0.14;
  const total = len + Math.floor(rel * SR);
  const lpf = new Biquad('lp', f * 1.5, 1.1);
  const ph = new Float64Array(voices).map(() => rnd());
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    const scoop = 1 - 0.025 * Math.exp(-tt / 0.035);
    let s = 0;
    for (let v = 0; v < voices; v++) {
      const fr = f * scoop * (1 + (v - (voices - 1) / 2) * 0.004) * vibrato(tt, 0.004, 5, 0.3), dt = fr / SR;
      ph[v] += dt; ph[v] -= Math.floor(ph[v]);
      s += 2 * ph[v] - 1 - polyblep(ph[v], dt);
    }
    s /= Math.sqrt(voices);
    const e = ar(i, len, 0.035, rel);
    if (i % 32 === 0) {
      const blare = 1.3 + (bright - 1.3) * (1 - Math.exp(-tt / 0.07)) * (0.8 + 0.2 * Math.exp(-tt * 3));
      lpf.set(Math.min(9000, f * blare * (0.5 + 0.5 * e)));
    }
    o.add(start + i, lpf.run(s) * vol * e, pan);
  }
}

// ------------------------------------------------------------------ struck: bells, celesta, mallets

function fmBell(o: Out, t0: number, f: number, vol: number, pan: number, ratio: number, index: number, decay: number): void {
  const start = Math.floor(t0 * SR), total = Math.floor(Math.min(decay * 1.3, 7) * SR);
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    const I = index * Math.exp(-tt / (decay * 0.25));
    const v = Math.sin(TAU * f * tt + I * Math.sin(TAU * f * ratio * tt));
    const e = Math.min(1, i / 60) * Math.exp((-tt * 6.9) / decay);
    o.add(start + i, v * vol * e, pan);
  }
}

function mallet(o: Out, t0: number, f: number, vol: number, pan: number, partials: [number, number, number][], click: number): void {
  const start = Math.floor(t0 * SR), longest = Math.max(...partials.map((p) => p[2]));
  const total = Math.floor(Math.min(longest * 1.2, 5) * SR);
  const bp = new Biquad('bp', Math.min(9000, f * 3), 1);
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let v = 0;
    for (const [ratio, amp, dec] of partials) if (f * ratio < SR * 0.45) v += amp * Math.sin(TAU * f * ratio * tt) * Math.exp((-tt * 6.9) / dec);
    v += click * bp.run(white()) * Math.exp(-tt * 300);
    o.add(start + i, v * vol * Math.min(1, i / 30), pan);
  }
}

// ------------------------------------------------------------------ choir

const VOWELS: Record<'ah' | 'oo', [number, number, number][]> = {
  ah: [[730, 1, 8], [1090, 0.5, 9], [2440, 0.25, 12]],
  oo: [[320, 1, 7], [800, 0.35, 8], [2300, 0.1, 12]],
};

function choir(o: Out, t0: number, dur: number, f: number, vol: number, pan: number, vowel: 'ah' | 'oo'): void {
  const start = Math.floor(t0 * SR), len = Math.floor(dur * SR), rel = 0.5;
  const total = len + Math.floor(rel * SR);
  const fs = VOWELS[vowel].map(([fr, , q]) => new Biquad('bp', fr, q));
  const amps = VOWELS[vowel].map(([, a]) => a);
  const ph = [rnd(), rnd(), rnd()], rates = [4.3, 5.1, 4.7], det = [-0.006, 0, 0.0055];
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let s = 0;
    for (let v = 0; v < 3; v++) {
      const fr = f * (1 + det[v]) * vibrato(tt, 0.005, rates[v], 0.3), dt = fr / SR;
      ph[v] += dt; ph[v] -= Math.floor(ph[v]);
      s += 2 * ph[v] - 1 - polyblep(ph[v], dt);
    }
    let x = 0;
    for (let k = 0; k < fs.length; k++) x += fs[k].run(s) * amps[k];
    o.add(start + i, x * vol * ar(i, len, 0.35, rel) * 1.4, pan);
  }
}

// ------------------------------------------------------------------ the instrument list

export type Inst =
  | 'fiddle' | 'cello' | 'strings' | 'marcato' | 'contrabass'
  | 'lute' | 'harp' | 'guitar' | 'oud' | 'pizz' | 'upright'
  | 'flute' | 'whistle' | 'panpipe' | 'ney' | 'ocarina' | 'recorder'
  | 'accordion' | 'concertina'
  | 'horn' | 'brass' | 'tuba'
  | 'celesta' | 'glock' | 'musicbox' | 'bells' | 'marimba' | 'kalimba' | 'dulcimer'
  | 'choir' | 'choirOo';

/** Play one note. `vol` is the part's level; each instrument is pre-balanced against the others. */
export function play(inst: Inst, o: Out, t: number, dur: number, f: number, vol: number, pan: number): void {
  switch (inst) {
    case 'fiddle': return bowed(o, t, dur, f, vol * 0.55, pan, { bright: 7, vib: 0.006, atk: 0.05 });
    case 'cello': return bowed(o, t, dur, f, vol * 0.7, pan, { bright: 5, vib: 0.005, atk: 0.07 });
    case 'strings': return bowed(o, t, dur, f, vol * 0.45, pan, { bright: 4.5, vib: 0.004, atk: 0.35, rel: 0.5, voices: 3, detune: 0.005 });
    case 'marcato': return bowed(o, t, dur, f, vol * 0.5, pan, { bright: 6, vib: 0, atk: 0.012, rel: 0.08, voices: 3, detune: 0.004, marcato: true });
    case 'contrabass': return bowed(o, t, dur, f, vol * 0.85, pan, { bright: 3.5, vib: 0.003, atk: 0.12, rel: 0.3, voices: 2, detune: 0.003 });
    case 'lute': return pluck(o, t, dur, f, vol, pan, { decay: 1.6, bright: 0.55, pick: 0.14, body: 420 });
    case 'harp': return pluck(o, t, dur, f, vol * 0.9, pan, { decay: 3.2, bright: 0.45, ring: true, body: 300 });
    case 'guitar': return pluck(o, t, dur, f, vol, pan, { decay: 2.2, bright: 0.5, pick: 0.2, body: 200 });
    case 'oud': return pluck(o, t, dur, f, vol * 1.05, pan, { decay: 1.2, bright: 0.75, pick: 0.09, body: 330 });
    case 'pizz': return pluck(o, t, dur, f, vol, pan, { decay: 0.5, bright: 0.35, body: 250 });
    case 'upright': return pluck(o, t, Math.max(dur, 0.25), f, vol * 1.5, pan, { decay: 1.4, bright: 0.25, pick: 0.25, body: 110 });
    case 'flute': return wind(o, t, dur, f, vol * 0.5, pan, { breath: 0.18, h2: 0.22, h3: 0.06, vib: 0.007, atk: 0.06 });
    case 'whistle': return wind(o, t, dur, f, vol * 0.42, pan, { breath: 0.12, h2: 0.12, h3: 0.1, vib: 0.008, atk: 0.025, chiff: 0.25 });
    case 'recorder': return wind(o, t, dur, f, vol * 0.48, pan, { breath: 0.1, h2: 0.3, h3: 0.12, vib: 0.003, atk: 0.03, chiff: 0.2 });
    case 'panpipe': return wind(o, t, dur, f, vol * 0.5, pan, { breath: 0.4, h2: 0.08, h3: 0.03, vib: 0.005, atk: 0.04, chiff: 0.35 });
    case 'ney': return wind(o, t, dur, f, vol * 0.5, pan, { breath: 0.55, h2: 0.2, h3: 0.12, vib: 0.011, atk: 0.12, rel: 0.2 });
    case 'ocarina': return wind(o, t, dur, f, vol * 0.55, pan, { breath: 0.08, h2: 0.04, h3: 0.01, vib: 0.006, atk: 0.04 });
    case 'accordion': return reed(o, t, dur, f, vol * 0.4, pan, 5);
    case 'concertina': return reed(o, t, dur, f, vol * 0.42, pan, 7, 0.0025);
    case 'horn': return brass(o, t, dur, f, vol * 0.55, pan, 4, 1);
    case 'brass': return brass(o, t, dur, f, vol * 0.5, pan, 7, 3);
    case 'tuba': return brass(o, t, dur, f, vol * 0.85, pan, 3.2, 1);
    case 'celesta': return fmBell(o, t, f, vol * 0.55, pan, 1, 1.4, 1.6);
    case 'glock': return fmBell(o, t, f, vol * 0.4, pan, 3.5, 1.1, 2.2);
    case 'musicbox': return fmBell(o, t, f, vol * 0.5, pan, 2.0, 1.8, 1.4);
    case 'bells': return fmBell(o, t, f, vol * 0.45, pan, 1.4, 3.5, 4);
    case 'marimba': return mallet(o, t, f, vol * 0.9, pan, [[1, 1, 0.55], [3.9, 0.3, 0.12], [10.7, 0.05, 0.04]], 0.15);
    case 'kalimba': return mallet(o, t, f, vol * 0.8, pan, [[1, 1, 1.4], [5.4, 0.25, 0.15], [11.8, 0.06, 0.05]], 0.25);
    case 'dulcimer': return pluck(o, t, dur, f, vol * 0.9, pan, { decay: 2.4, bright: 0.85, ring: true, body: 700 });
    case 'choir': return choir(o, t, dur, f, vol * 0.45, pan, 'ah');
    case 'choirOo': return choir(o, t, dur, f, vol * 0.5, pan, 'oo');
  }
}

/** Instruments that keep sounding after the note ends (struck or ringing). */
export const RINGS = new Set<Inst>(['harp', 'celesta', 'glock', 'musicbox', 'bells', 'marimba', 'kalimba', 'dulcimer']);

// ------------------------------------------------------------------ percussion

function drumTone(o: Out, t0: number, f0: number, f1: number, sweep: number, dec: number, vol: number, pan: number, noiseAmt = 0, noiseF = 800, noiseDec = 0.05): void {
  const start = Math.floor(t0 * SR), total = Math.floor(Math.min(dec * 1.4, 3) * SR);
  const bp = new Biquad('bp', noiseF, 0.9);
  let ph = 0;
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-tt / sweep);
    ph += f / SR;
    const e = Math.min(1, i / 40) * Math.exp((-tt * 6.9) / dec);
    const n = noiseAmt ? bp.run(white()) * noiseAmt * Math.exp((-tt * 6.9) / noiseDec) : 0;
    o.add(start + i, (Math.sin(TAU * ph) * e + n) * vol, pan);
  }
}

function hiss(o: Out, t0: number, dec: number, vol: number, pan: number, hp: number, atk = 0.001, bp?: number): void {
  const start = Math.floor(t0 * SR), total = Math.floor(Math.min(dec * 1.3, 4) * SR);
  const h = new Biquad('hp', hp, 0.7), b = bp ? new Biquad('bp', bp, 1.2) : null;
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let x = h.run(white());
    if (b) x = b.run(x);
    o.add(start + i, x * vol * Math.min(1, tt / atk) * Math.exp((-tt * 6.9) / dec), pan);
  }
}

function metal(o: Out, t0: number, freqs: number[], dec: number, vol: number, pan: number): void {
  const start = Math.floor(t0 * SR), total = Math.floor(Math.min(dec * 1.2, 4) * SR);
  for (let i = 0; i < total; i++) {
    const tt = i / SR;
    let v = 0;
    freqs.forEach((f, k) => { v += Math.sin(TAU * f * tt) * Math.exp((-tt * 6.9 * (1 + k * 0.3)) / dec); });
    o.add(start + i, (v / freqs.length) * vol * Math.min(1, i / 20), pan);
  }
}

export type KitName = 'folk' | 'hand' | 'darbuka' | 'orchestral' | 'taiko' | 'soft';

type Hit = (o: Out, t: number, v: number) => void;

const KITS: Record<KitName, Record<string, Hit>> = {
  // bodhran, tambourine and shaker: taverns and sea shanties
  folk: {
    k: (o, t, v) => drumTone(o, t, 130, 72, 0.03, 0.28, v * 0.9, 0, 0.3, 300, 0.04),
    s: (o, t, v) => { drumTone(o, t, 210, 170, 0.02, 0.12, v * 0.45, 0.1, 0.5, 1800, 0.05); },
    h: (o, t, v) => hiss(o, t, 0.06, v * 0.12, 0.25, 6000, 0.008),
    o: (o, t, v) => { hiss(o, t, 0.16, v * 0.16, -0.2, 7000, 0.002); metal(o, t, [5300, 6900, 8800], 0.12, v * 0.06, -0.2); },
    t: (o, t, v) => drumTone(o, t, 100, 65, 0.04, 0.35, v * 0.9, -0.1, 0.2, 250, 0.05),
    p: (o, t, v) => drumTone(o, t, 180, 140, 0.03, 0.16, v * 0.6, 0.2, 0.3, 1200, 0.04),
    x: (o, t, v) => { for (let k = 0; k < 4; k++) hiss(o, t + k * 0.035, 0.12, v * 0.14, -0.2, 7000, 0.002); metal(o, t, [5300, 6900, 8800], 0.5, v * 0.08, -0.2); },
  },
  // djembe, congas, bongos, shaker, rain stick: jungle and swamp
  hand: {
    k: (o, t, v) => drumTone(o, t, 95, 62, 0.03, 0.32, v, 0, 0.25, 220, 0.05),
    s: (o, t, v) => { drumTone(o, t, 420, 380, 0.01, 0.06, v * 0.35, 0.15); hiss(o, t, 0.05, v * 0.4, 0.15, 900, 0.001, 1800); },
    h: (o, t, v) => hiss(o, t, 0.07, v * 0.13, 0.3, 5000, 0.012),
    o: (o, t, v) => hiss(o, t, 0.2, v * 0.1, 0.3, 4000, 0.06),
    t: (o, t, v) => drumTone(o, t, 210, 185, 0.02, 0.22, v * 0.7, -0.25, 0.15, 900, 0.03),
    p: (o, t, v) => drumTone(o, t, 340, 310, 0.015, 0.14, v * 0.55, 0.35, 0.2, 1600, 0.02),
    x: (o, t, v) => hiss(o, t, 1.0, v * 0.08, -0.3, 3000, 0.4),
  },
  // doum, tek and finger cymbals: the desert
  darbuka: {
    k: (o, t, v) => drumTone(o, t, 110, 78, 0.03, 0.4, v, 0, 0.2, 300, 0.04),
    s: (o, t, v) => { drumTone(o, t, 650, 600, 0.01, 0.04, v * 0.3, 0.2); hiss(o, t, 0.035, v * 0.4, 0.2, 2000, 0.001, 3500); },
    h: (o, t, v) => metal(o, t, [3150, 4620, 6230, 8080], 0.35, v * 0.08, 0.35),
    o: (o, t, v) => { hiss(o, t, 0.12, v * 0.12, -0.2, 6500, 0.003); metal(o, t, [4800, 6100, 7900], 0.15, v * 0.05, -0.2); },
    t: (o, t, v) => drumTone(o, t, 95, 70, 0.04, 0.5, v * 0.9, -0.1, 0.2, 250, 0.05),
    p: (o, t, v) => { drumTone(o, t, 560, 520, 0.01, 0.05, v * 0.28, 0.3); hiss(o, t, 0.03, v * 0.32, 0.3, 2000, 0.001, 3000); },
    x: (o, t, v) => metal(o, t, [3150, 4620, 6230, 8080], 1.4, v * 0.12, 0),
  },
  // timpani, snare, suspended cymbal: battle and danger
  orchestral: {
    k: (o, t, v) => { drumTone(o, t, 78, 66, 0.05, 0.9, v * 0.9, 0, 0.25, 180, 0.08); drumTone(o, t, 104, 99, 0.05, 0.5, v * 0.25, 0); },
    s: (o, t, v) => { hiss(o, t, 0.14, v * 0.32, 0.1, 1500, 0.001, 3200); drumTone(o, t, 200, 180, 0.01, 0.07, v * 0.25, 0.1); },
    h: (o, t, v) => hiss(o, t, 0.05, v * 0.1, 0.2, 2500, 0.001, 4500),
    o: (o, t, v) => hiss(o, t, 0.6, v * 0.08, -0.25, 5000, 0.05),
    t: (o, t, v) => drumTone(o, t, 70, 52, 0.06, 0.7, v, -0.15, 0.3, 160, 0.1),
    p: (o, t, v) => drumTone(o, t, 98, 82, 0.05, 0.5, v * 0.8, 0.15, 0.25, 200, 0.08),
    x: (o, t, v) => { hiss(o, t, 1.8, v * 0.2, -0.1, 3500, 0.004); metal(o, t, [420, 1170, 2650, 4100], 1.6, v * 0.06, -0.1); },
  },
  // big drums, rim clicks and an anvil: the volcano
  taiko: {
    k: (o, t, v) => drumTone(o, t, 88, 50, 0.06, 0.8, v * 1.05, 0, 0.45, 150, 0.12),
    s: (o, t, v) => { drumTone(o, t, 900, 880, 0.005, 0.03, v * 0.25, 0.2); hiss(o, t, 0.03, v * 0.25, 0.2, 2500, 0.001, 4000); },
    h: (o, t, v) => metal(o, t, [1180, 2770, 4330, 5940], 0.25, v * 0.08, 0.3),
    o: (o, t, v) => metal(o, t, [1180, 2770, 4330, 5940], 0.8, v * 0.12, 0.3),
    t: (o, t, v) => drumTone(o, t, 120, 70, 0.05, 0.55, v * 0.9, -0.2, 0.35, 200, 0.1),
    p: (o, t, v) => drumTone(o, t, 170, 120, 0.04, 0.35, v * 0.75, 0.2, 0.3, 300, 0.06),
    x: (o, t, v) => { hiss(o, t, 1.5, v * 0.16, -0.1, 3000, 0.004); drumTone(o, t, 60, 45, 0.1, 1.2, v * 0.6, 0); },
  },
  // distant drum, wood block, chimes: caves, snow and quiet places
  soft: {
    k: (o, t, v) => drumTone(o, t, 70, 55, 0.05, 0.9, v * 0.7, 0, 0.15, 120, 0.1),
    s: (o, t, v) => drumTone(o, t, 820, 800, 0.005, 0.06, v * 0.25, 0.25),
    h: (o, t, v) => fmBell(o, t, 2637, v * 0.04, 0.35, 3.5, 0.6, 0.6),
    o: (o, t, v) => hiss(o, t, 0.5, v * 0.05, -0.3, 6000, 0.08),
    t: (o, t, v) => drumTone(o, t, 95, 80, 0.04, 0.6, v * 0.6, -0.2),
    p: (o, t, v) => drumTone(o, t, 1150, 1100, 0.005, 0.05, v * 0.2, 0.3),
    x: (o, t, v) => hiss(o, t, 2.5, v * 0.07, -0.1, 4000, 1.2),
  },
};

export function hit(kit: KitName, c: string, o: Out, t: number, vol: number): void {
  KITS[kit][c]?.(o, t, vol);
}
