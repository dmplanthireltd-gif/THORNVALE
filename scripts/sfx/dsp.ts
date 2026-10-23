/**
 * Small offline DSP kit for the combat sound bank (scripts/sfx/combat.ts). Everything is
 * synthesised from physical models: decaying modes (metal, wood, bone, stone), turbulent
 * noise shaped by a velocity curve (whooshes), plucked strings (bows), granular crackle
 * (crunch, debris, chainmail) and a short room so dry sounds sit in a space.
 * Mono, 44.1 kHz, Float64Array. Deterministic: every clip takes its own seeded Rng.
 */

export const SR = 44100;
export type Buf = Float64Array;

/** Seeded random numbers (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  r(a: number, b: number): number { return a + this.next() * (b - a); }
  /** Roughly normal (sum of uniforms). */
  g(): number { return this.next() + this.next() + this.next() - 1.5; }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
}

export const n = (sec: number): number => Math.max(1, Math.round(sec * SR));
export const buf = (sec: number): Buf => new Float64Array(n(sec));

export function white(len: number, rng: Rng): Buf {
  const b = new Float64Array(len);
  for (let i = 0; i < len; i++) b[i] = rng.next() * 2 - 1;
  return b;
}

/** Adds `src` into `dst` at `at` seconds, times `gain`. */
export function mix(dst: Buf, src: Buf, at = 0, gain = 1): Buf {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) {
    const j = i + o;
    if (j >= 0 && j < dst.length) dst[j] += src[i] * gain;
  }
  return dst;
}

export function scale(b: Buf, g: number): Buf { for (let i = 0; i < b.length; i++) b[i] *= g; return b; }

/** Multiplies by an envelope function of time (s). */
export function shape(b: Buf, f: (t: number) => number): Buf {
  for (let i = 0; i < b.length; i++) b[i] *= f(i / SR);
  return b;
}

/** Attack (linear-ish, s) then exponential decay with time constant tau (s). */
export const ad = (attack: number, tau: number) => (t: number): number =>
  t < attack ? Math.sin((t / attack) * Math.PI / 2) : Math.exp(-(t - attack) / tau);

/** A smooth bump peaking at `peak` (0..1 of `len`), skewed like a real swing. */
export const bump = (len: number, peak: number, sharp = 2) => (t: number): number => {
  const x = t / len;
  if (x <= 0 || x >= 1) return 0;
  const y = x < peak ? x / peak : (1 - x) / (1 - peak);
  return Math.pow(Math.sin(y * Math.PI / 2), sharp);
};

type Param = number | ((t: number) => number);
const at = (p: Param, t: number): number => (typeof p === 'number' ? p : p(t));

/**
 * State-variable filter (TPT / Zavalishin) with time-varying cutoff and Q.
 * mode: lp, bp (unity peak), hp, notch.
 */
export function svf(x: Buf, mode: 'lp' | 'bp' | 'hp', fc: Param, q: Param = 0.707): Buf {
  const y = new Float64Array(x.length);
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const f = Math.min(SR * 0.45, Math.max(10, at(fc, t)));
    const g = Math.tan(Math.PI * f / SR);
    const k = 1 / Math.max(0.05, at(q, t));
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    y[i] = mode === 'lp' ? v2 : mode === 'bp' ? v1 * k : x[i] - k * v1 - v2;
  }
  return y;
}

export const lp = (x: Buf, fc: Param, q: Param = 0.707) => svf(x, 'lp', fc, q);
export const hp = (x: Buf, fc: Param, q: Param = 0.707) => svf(x, 'hp', fc, q);
export const bp = (x: Buf, fc: Param, q: Param = 1) => svf(x, 'bp', fc, q);

/** A decaying mode: frequency (Hz), T60 (s), amplitude, start phase, optional pitch glide. */
export interface Mode { f: number; t60: number; a: number; ph?: number; glide?: number }

/** Sum of exponentially decaying sinusoids (impulse response of a struck object). */
export function modes(len: number, ms: Mode[]): Buf {
  const b = new Float64Array(len);
  for (const m of ms) {
    if (m.f >= SR * 0.45) continue;
    const tau = m.t60 / 6.91;
    let ph = m.ph ?? 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t / tau);
      if (e < 1e-4) break;
      const f = m.glide ? m.f * (1 + m.glide * Math.exp(-t / 0.02)) : m.f;
      ph += 2 * Math.PI * f / SR;
      b[i] += m.a * e * Math.sin(ph);
    }
  }
  return b;
}

/**
 * A resonator bank driven by an excitation (struck/scraped objects): each mode is a
 * two-pole resonator, so the excitation's spectrum and duration colour the ring.
 */
export function resonate(exc: Buf, ms: Mode[], len = exc.length): Buf {
  const y = new Float64Array(len);
  for (const m of ms) {
    if (m.f >= SR * 0.45) continue;
    const r = Math.exp(-6.91 / (m.t60 * SR));
    const w = 2 * Math.PI * m.f / SR;
    const c1 = 2 * r * Math.cos(w), c2 = -r * r, g = m.a * 2 * Math.sin(w) * (1 - r); // unity gain at resonance
    let y1 = 0, y2 = 0;
    for (let i = 0; i < len; i++) {
      const xi = i < exc.length ? exc[i] : 0;
      const v = g * xi + c1 * y1 + c2 * y2;
      y2 = y1; y1 = v;
      y[i] += v;
      if (i > exc.length && Math.abs(v) < 1e-7 && Math.abs(y2) < 1e-7) break;
    }
  }
  return y;
}

/** A sine whose frequency glides from f0 to f1 (exponential, time constant tau). */
export function glideSine(len: number, f0: number, f1: number, tau: number, envf: (t: number) => number, ph = 0): Buf {
  const b = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / tau);
    ph += 2 * Math.PI * f / SR;
    b[i] = Math.sin(ph) * envf(t);
  }
  return b;
}

/** A short click: half-cosine pulse of `width` seconds (impact contact). */
export function click(len: number, width: number, at0 = 0): Buf {
  const b = new Float64Array(len);
  const w = Math.max(2, Math.round(width * SR)), o = Math.round(at0 * SR);
  for (let i = 0; i < w && o + i < len; i++) b[o + i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / w);
  return b;
}

/**
 * Granular crackle: `count` tiny events spread over `dur` following a density curve,
 * each a short burst built by `grain` (crunching shell, debris, chainmail, fire pops).
 */
export function crackle(len: number, rng: Rng, count: number, dur: number, density: (x: number) => number, grain: (rng: Rng) => Buf, gain = 1): Buf {
  const b = new Float64Array(len);
  let made = 0, guard = 0;
  while (made < count && guard++ < count * 50) {
    const x = rng.next();
    if (rng.next() > density(x)) continue;
    const g = grain(rng);
    mix(b, g, x * dur, gain * rng.r(0.4, 1));
    made++;
  }
  return b;
}

/** A tiny noise grain, band-limited around fc. */
export function grainNoise(rng: Rng, fc: number, q: number, sec: number): Buf {
  const g = white(n(sec), rng);
  const y = bp(g, fc, q);
  return shape(y, ad(0.0004, sec / 4));
}

/** A tiny metallic ting (two or three short modes). */
export function grainTing(rng: Rng, f: number, t60: number): Buf {
  return modes(n(t60 * 1.2), [
    { f, t60, a: 1, ph: rng.r(0, 6.28) },
    { f: f * rng.r(1.4, 1.6), t60: t60 * 0.7, a: 0.6, ph: rng.r(0, 6.28) },
    { f: f * rng.r(2.2, 2.7), t60: t60 * 0.4, a: 0.35, ph: rng.r(0, 6.28) },
  ]);
}

/** Plucked string (Karplus–Strong with a fractional delay, damping and pluck position). */
export function pluck(len: number, rng: Rng, f: number, t60: number, bright = 0.5, pos = 0.15): Buf {
  const period = SR / f;
  const N = Math.floor(period), frac = period - N;
  const line = new Float64Array(N + 2);
  // excitation: noise shaped by the pluck position (comb) and brightness
  let prev = 0;
  for (let i = 0; i < line.length; i++) {
    const w = rng.next() * 2 - 1;
    prev = prev + bright * (w - prev);
    line[i] = prev;
  }
  const p = Math.max(1, Math.round(N * pos));
  const ex = line.slice();
  for (let i = 0; i < line.length; i++) line[i] = ex[i] - ex[(i + p) % line.length];
  const loss = Math.pow(10, -3 / (t60 * f)); // per period
  const y = new Float64Array(len);
  const L = line.length;
  let idx = 0, lastOut = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx % L], b2 = line[(idx + 1) % L];
    const out = a + frac * (b2 - a);
    const filt = loss * (0.5 * out + 0.5 * lastOut);
    lastOut = out;
    line[idx % L] = filt;
    idx++;
    y[i] = out;
  }
  return y;
}

/** Soft saturation, keeps transients round and adds weight. */
export function sat(b: Buf, drive = 1.5): Buf {
  const k = Math.tanh(drive);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / k;
  return b;
}

/** Fades the last `sec` seconds out (cosine), and trims trailing silence. */
export function tail(b: Buf, sec = 0.02, floor = 0.0005): Buf {
  let end = b.length;
  let peak = 0;
  for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]));
  const thr = peak * floor;
  while (end > 1 && Math.abs(b[end - 1]) < thr) end--;
  end = Math.min(b.length, end + n(0.005));
  const out = b.slice(0, end);
  const f = Math.min(out.length, n(sec));
  for (let i = 0; i < f; i++) out[out.length - f + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / f);
  return out;
}

/** In-place iterative radix-2 FFT (re/im of length 2^k); inverse when `inv`. */
function fft(re: Float64Array, im: Float64Array, inv = false): void {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inv ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}

/** Linear convolution by FFT. */
export function convolve(x: Buf, h: Buf): Buf {
  const len = x.length + h.length - 1;
  let N = 1;
  while (N < len) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(x); br.set(h);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < N; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  return ar.slice(0, len);
}

/**
 * A diffuse impulse response: sparse early reflections, then dense noise that decays with
 * T60 `rt` and darkens as it decays (air and soft surfaces absorb highs first).
 */
export function roomIR(rng: Rng, rt: number, dark = 3500): Buf {
  const len = n(rt * 1.1);
  const ir = new Float64Array(len);
  for (const [d, g] of [[0.0043, 0.5], [0.0079, -0.38], [0.0121, 0.3], [0.0167, -0.24], [0.0213, 0.2]] as const) {
    const i = Math.round(d * rng.r(0.9, 1.1) * SR);
    if (i < len) ir[i] += g;
  }
  const tau = rt / 6.91;
  const nz = white(len, rng);
  // two bands mixed over time: bright early, dark late
  const bright = lp(nz, Math.min(9000, dark * 2.2)), darkB = lp(nz, dark * 0.45);
  const start = n(0.006);
  for (let i = start; i < len; i++) {
    const t = (i - start) / SR, x = Math.min(1, t / rt);
    const fadeIn = Math.min(1, t / 0.012);
    ir[i] += ((1 - x) * bright[i] + x * darkB[i] * 1.6) * Math.exp(-t / tau) * fadeIn * 0.35;
  }
  // unit energy
  let e = 0;
  for (let i = 0; i < len; i++) e += ir[i] * ir[i];
  return scale(ir, 1 / Math.sqrt(e));
}

/** The dry sound plus a short, diffuse room (`wet` level, `rt` T60 in seconds). */
export function room(x: Buf, rng: Rng, wet = 0.12, rt = 0.35, dark = 3500): Buf {
  const w = convolve(x, roomIR(rng, rt, dark));
  const y = new Float64Array(w.length);
  y.set(x);
  for (let i = 0; i < w.length; i++) y[i] += w[i] * wet;
  return y;
}

/** Fades the end of a buffer (dry models end exactly at their buffer length). */
export function fadeEnd(b: Buf, sec = 0.012): Buf {
  const f = Math.min(b.length, n(sec));
  for (let i = 0; i < f; i++) b[b.length - f + i] *= 0.5 + 0.5 * Math.cos((Math.PI * (i + 1)) / f);
  return b;
}

export function peak(b: Buf): number {
  let p = 0;
  for (let i = 0; i < b.length; i++) p = Math.max(p, Math.abs(b[i]));
  return p;
}

/**
 * Short-term loudness proxy (dB): the loudest 50 ms RMS of a K-weighting-ish signal
 * (high-pass 60 Hz + high-shelf-ish presence). Used to level clips against each other.
 */
export function loudness(b: Buf): number {
  const k = hp(hp(b, 60, 0.5), 60, 0.5);
  const pres = hp(k, 1500, 0.7);
  const w = new Float64Array(k.length);
  for (let i = 0; i < k.length; i++) w[i] = k[i] + 0.4 * pres[i];
  const win = n(0.05);
  let sum = 0, best = 0;
  for (let i = 0; i < w.length; i++) {
    sum += w[i] * w[i];
    if (i >= win) sum -= w[i - win] * w[i - win];
    best = Math.max(best, sum / win);
  }
  return 10 * Math.log10(best + 1e-12);
}

/** A look-ahead-free soft limiter: anything above `ceil` is bent under it smoothly. */
export function limit(b: Buf, ceil = 0.89): Buf {
  for (let i = 0; i < b.length; i++) {
    const a = Math.abs(b[i]);
    if (a > ceil * 0.8) {
      const knee = ceil * 0.8, over = a - knee, room2 = ceil - knee;
      b[i] = Math.sign(b[i]) * (knee + room2 * Math.tanh(over / room2));
    }
  }
  return b;
}

/** 16-bit mono WAV. */
export function wavMono(b: ArrayLike<number>, sr = SR): Buffer {
  const out = Buffer.alloc(44 + b.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + b.length * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(b.length * 2, 40);
  for (let i = 0; i < b.length; i++) out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(b[i] * 32767))), 44 + i * 2);
  return out;
}
