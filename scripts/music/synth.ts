/**
 * Thornvale's soundtrack arranger (offline, no dependencies).
 *
 * Each song is written as chords + melody per bar (see songs.ts) and played by a small band of
 * synthesized instruments chosen for its region (see instruments.ts): a lead, an optional
 * harmony voice, a sustained pad, an accompaniment (arpeggios, finger-picking or strums), a bass
 * line and a percussion kit. A stereo echo, a room reverb and a soft limiter finish the mix.
 *
 * Output: a seamless loop. Every sound is written into a circular buffer one loop long, so the
 * tails of the last notes ring on into the first bar exactly as they will when the track loops.
 */
import { SR, play, hit, reseed, RINGS, type Inst, type KitName, type Out } from './instruments';

export { SR };

// ------------------------------------------------------------------ song format

export type BassStyle = 'root8' | 'pump' | 'gallop' | 'drone' | 'walk' | 'waltz';
export type ArpStyle = 'up' | 'updown' | 'down' | 'pick' | 'strum' | 'off';

export interface Section {
  chords: string[]; // one chord per bar, e.g. 'Am', 'F', 'G7', 'Eb', 'C#m'
  melody: string[]; // one string per bar: "e5/4 g5/2 r/2 c6/8" (note/length in 16ths)
  /** Harmony voice under the melody (closest chord tone below each melody note). */
  harmony?: boolean;
  /** Overrides for this section. */
  drums?: string;
  arp?: ArpStyle;
  leadOctave?: number; // shift the melody by octaves
  /** A different lead instrument for this section (variety between verses). */
  lead?: Inst;
  /** Leave the pad out (thinner texture). */
  noPad?: boolean;
}

/** Who plays what. */
export interface Band {
  lead: Inst;
  harmony?: Inst;
  pad?: Inst;
  arp?: Inst;
  bass: Inst;
  kit: KitName;
}

export interface Song {
  id: string;
  title: string;
  bpm: number;
  /** Sixteenths per bar (16 for 4/4, 12 for 3/4 or a lilting 6/8). */
  bar?: number;
  sections: Record<string, Section>;
  form: string[];
  band: Band;
  lead: { vol: number };
  bass: BassStyle;
  arp: ArpStyle;
  arpRate?: 8 | 16 | 32; // arpeggio note rate (8ths by default)
  arpOctave?: number;
  arpVol?: number;
  drums: string; // one char per 16th: k kick, s snare, h hat, o open hat, t low tom, p high tom, x crash, . rest
  drumVol?: number;
  padVol?: number;
  echo?: number; // 0..1 echo amount
  bassVol?: number;
  swing?: number; // 0..0.3 delay of every second 16th
  reverb?: number; // 0..1 room amount
  /** dB nudges to the default part levels, e.g. { drums: 3 } for a louder kit. */
  mix?: Partial<Record<Part, number>>;
  /** dB offset of the final loudness (0 = the shared outdoor level; indoor themes use about -6). */
  loudness?: number;
  /** Master low-pass in Hz (muffled underwater, softer indoors); none by default. */
  tone?: number;
  /**
   * Peak ceiling (linear sample peak, e.g. 0.5 = -6 dBFS; the AAC encoder adds up to ~3 dB on sharp plucks). When set, a smooth look-ahead limiter
   * replaces the soft clipper, so plucked attacks can't overshoot after AAC encoding.
   */
  ceiling?: number;
  /** AAC bit rate for render.ts in kbit/s (default 112) and whether to fold to mono. */
  kbps?: number;
  mono?: boolean;
}

// ------------------------------------------------------------------ notes and chords

const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function midi(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name.trim().toLowerCase());
  if (!m) throw new Error(`Bad note "${name}"`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], '5': [0, 7],
};
/** Chord symbol → pitch classes relative to C plus the root pitch class. */
export function chord(sym: string): { root: number; tones: number[] } {
  const m = /^([A-G])(#|b)?(.*)$/.exec(sym.trim());
  if (!m || !(m[3] in QUALITY)) throw new Error(`Bad chord "${sym}"`);
  const root = (NOTE[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, tones: QUALITY[m[3]].map((i) => (root + i) % 12) };
}

interface Ev { start: number; len: number; note: number | null } // in 16ths
function parseBar(s: string, barLen: number, where: string): Ev[] {
  const out: Ev[] = [];
  let t = 0;
  for (const tok of s.trim().split(/\s+/).filter(Boolean)) {
    const [p, l] = tok.split('/');
    const len = Number(l);
    if (!len) throw new Error(`Missing length in "${tok}" (${where})`);
    out.push({ start: t, len, note: p === 'r' ? null : midi(p) });
    t += len;
  }
  if (t !== barLen) throw new Error(`${where}: bar is ${t} sixteenths long, expected ${barLen}: "${s}"`);
  return out;
}

// ------------------------------------------------------------------ rendering

/** Stereo buffer one loop long; writes past the end wrap to the start. */
class Loop implements Out {
  readonly l: Float32Array;
  readonly r: Float32Array;
  constructor(readonly n: number) {
    this.l = new Float32Array(n);
    this.r = new Float32Array(n);
  }
  add(i: number, v: number, pan: number): void {
    const k = ((i % this.n) + this.n) % this.n;
    this.l[k] += v * Math.min(1, 1 - pan);
    this.r[k] += v * Math.min(1, 1 + pan);
  }
}

export type Part = 'lead' | 'harmony' | 'pad' | 'arp' | 'bass' | 'drums';

/** Target loudness of each part in dB (RMS while it plays); songs can nudge these with `mix`. */
const MIX: Record<Part, number> = { lead: -21, harmony: -28, pad: -30, arp: -28.5, bass: -26, drums: -26 };

/** RMS in dB over the 50 ms blocks where the part is actually sounding. */
function activeDb(l: Float32Array, r: Float32Array): number {
  const B = Math.floor(SR * 0.05), blocks: number[] = [];
  for (let i = 0; i + B <= l.length; i += B) {
    let s = 0;
    for (let k = i; k < i + B; k++) s += l[k] * l[k] + r[k] * r[k];
    blocks.push(s / (2 * B));
  }
  const peak = Math.max(...blocks, 1e-12);
  const on = blocks.filter((e) => e > peak * 1e-3);
  return 10 * Math.log10(on.reduce((a, z) => a + z, 0) / Math.max(1, on.length) + 1e-12);
}

/** Render a song. `only` renders a single part (used to balance the mix). */
export function render(song: Song, only?: Part): { l: Float32Array; r: Float32Array; seconds: number } {
  reseed(song.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const barLen = song.bar ?? 16;
  const six = 60 / song.bpm / 4; // seconds per 16th
  const bars: { sec: Section; chord: string; mel: Ev[] }[] = [];
  for (const name of song.form) {
    const sec = song.sections[name];
    if (!sec) throw new Error(`${song.id}: unknown section ${name}`);
    if (sec.chords.length !== sec.melody.length) throw new Error(`${song.id}/${name}: ${sec.chords.length} chords but ${sec.melody.length} melody bars`);
    sec.chords.forEach((c, i) => bars.push({ sec, chord: c, mel: parseBar(sec.melody[i], barLen, `${song.id}/${name} bar ${i + 1}`) }));
  }
  const loopSec = bars.length * barLen * six;
  const n = Math.round(loopSec * SR);
  const stems = new Map<Part, Loop>();
  const stem = (p: Part) => { let s = stems.get(p); if (!s) stems.set(p, (s = new Loop(n))); return s; };
  const band = song.band;
  const want = (p: Part) => !only || only === p;
  const swing = (step: number) => (step % 2 === 1 ? (song.swing ?? 0) * six : 0);
  const at = (bar: number, step: number) => (bar * barLen + step) * six + swing(step);
  // tiny human timing drift so parts don't hit in perfect lockstep
  const human = (k: number) => Math.sin(k * 12.9898) * 0.006;

  // pad: one sustained chord per run of identical chords
  if (band.pad && want('pad')) {
    let i = 0;
    while (i < bars.length) {
      let j = i + 1;
      while (j < bars.length && bars[j].chord === bars[i].chord && !bars[j].sec.noPad) j++;
      if (!bars[i].sec.noPad) {
        const ch = chord(bars[i].chord);
        const tones = ch.tones.map((pc) => 55 + ((pc - 55 + 120) % 12)).sort((a, z) => a - z);
        tones.forEach((m, k) => play(band.pad!, stem('pad'), i * barLen * six, (j - i) * barLen * six, hz(m), (song.padVol ?? 0.1), k % 2 ? 0.35 : -0.35));
      }
      i = j;
    }
  }

  bars.forEach((bar, bi) => {
    const ch = chord(bar.chord);
    const rootBass = 36 + (ch.root % 12); // C2..B2
    const bassNote = rootBass > 43 ? rootBass - 12 : rootBass;
    const fifth = bassNote + 7;
    // melody + harmony
    const oct = (bar.sec.leadOctave ?? 0) * 12;
    const leadInst = bar.sec.lead ?? band.lead;
    bar.mel.forEach((e, k) => {
      if (e.note === null) return;
      const nn = e.note + oct;
      const dur = e.len * six;
      if (want('lead')) play(leadInst, stem('lead'), at(bi, e.start) + human(bi * 16 + k), dur, hz(nn), song.lead.vol, 0.05);
      if (bar.sec.harmony && band.harmony && want('harmony')) {
        let h = nn - 1;
        while (h > nn - 13 && !ch.tones.includes(((h % 12) + 12) % 12)) h--;
        if (h > nn - 13) play(band.harmony, stem('harmony'), at(bi, e.start) + 0.01, dur, hz(h), song.lead.vol * 0.5, -0.4);
      }
    });
    // accompaniment
    const arp = bar.sec.arp ?? song.arp;
    if (arp !== 'off' && band.arp && want('arp')) {
      const base = 60 + 12 * (song.arpOctave ?? 0);
      const tones = ch.tones.map((pc) => base + ((pc + 12) % 12)).sort((a, z) => a - z);
      const v = song.arpVol ?? 0.1;
      const ring = RINGS.has(band.arp);
      if (arp === 'strum') {
        // a strum on each beat (down on the beat, a lighter up-strum on the "and")
        const voicing = [tones[0] - 12, ...tones, tones[0] + 12];
        for (let s = 0; s < barLen; s += 2) {
          const down = s % 4 === 0, t = at(bi, s);
          const order = down ? voicing : [...voicing].reverse().slice(0, 3);
          order.forEach((m, k) => play(band.arp!, stem('arp'), t + k * 0.012, six * (down ? 2 : 1.5), hz(m), v * (down ? 0.55 : 0.32), -0.3 + k * 0.12));
        }
      } else {
        let seq: number[];
        if (arp === 'pick') { const [r, t3, t5] = [tones[0] - 12, tones[1], tones[2] ?? tones[0] + 7]; seq = [r, t5, t3 + 12 > t5 ? t3 : t3 + 12, t5, tones[0] + 12, t5, t3, t5]; }
        else if (arp === 'up') seq = [...tones, tones[0] + 12];
        else if (arp === 'down') seq = [tones[0] + 12, ...[...tones].reverse()];
        else seq = [...tones, tones[0] + 12, ...tones.slice(1).reverse()];
        const rate = song.arpRate ?? 8;
        const steps = rate === 32 ? barLen * 2 : rate === 16 ? barLen : barLen / 2;
        const d = (barLen * six) / steps;
        for (let i = 0; i < steps; i++) {
          const accent = i % (steps / (barLen / 4)) === 0 ? 1 : 0.75;
          play(band.arp, stem('arp'), bi * barLen * six + i * d + (i % 2 ? swing(1) : 0), ring ? d : d * 1.6, hz(seq[i % seq.length]), v * accent, 0.3 - (i % 3) * 0.15);
        }
      }
    }
    // bass
    if (want('bass')) {
      const bv = song.bassVol ?? 0.3;
      const q = (s: number) => at(bi, s);
      const B = (s: number, len: number, m: number, v = bv) => play(band.bass, stem('bass'), q(s), six * len, hz(m), v, 0);
      switch (song.bass) {
        case 'root8': for (let s = 0; s < barLen; s += 2) B(s, 1.9, s % 8 === 4 ? fifth : bassNote, s % 4 === 0 ? bv : bv * 0.7); break;
        case 'pump': for (let s = 0; s < barLen; s += 4) B(s, 3.8, s % 8 === 0 ? bassNote : fifth); break;
        case 'gallop': for (let s = 0; s < barLen; s += 4) { B(s, 1.9, bassNote); B(s + 2, 0.95, bassNote, bv * 0.7); B(s + 3, 0.95, bassNote + 12, bv * 0.6); } break;
        case 'drone': B(0, barLen, bassNote, bv * 0.9); break;
        case 'walk': { const st = [bassNote, bassNote + 4, fifth, bassNote + 9]; for (let s = 0, k = 0; s < barLen; s += 4, k++) B(s, 3.8, st[k % 4]); break; }
        case 'waltz': for (let s = 0; s < barLen; s += 4) B(s, s === 0 ? 3.8 : 1.9, s === 0 ? bassNote : fifth, s === 0 ? bv : bv * 0.55); break;
      }
    }
    // drums
    if (want('drums')) {
      const pat = bar.sec.drums ?? song.drums;
      const dv = song.drumVol ?? 0.5;
      for (let s = 0; s < barLen; s++) {
        const c = pat[s % pat.length];
        if (c && c !== '.') hit(band.kit, c, stem('drums'), at(bi, s) + human(bi * 31 + s) * 0.5, dv * (s % 4 === 0 ? 1 : 0.8));
      }
      // the opening crash, unless the song has no percussion at all
      if (bi === 0 && hasDrums(song)) hit(band.kit, 'x', stem('drums'), 0, dv * 0.6);
    }
  });

  // balance: bring every part to its target loudness (measured only where it is playing)
  const l = new Float32Array(n), r = new Float32Array(n);
  for (const [part, st] of stems) {
    const target = MIX[part] + (song.mix?.[part] ?? 0);
    const g = Math.pow(10, (target - activeDb(st.l, st.r)) / 20);
    for (let i = 0; i < n; i++) { l[i] += st.l[i] * g; r[i] += st.r[i] * g; }
  }
  if (only) return { l, r, seconds: n / SR };
  // stereo echo (wraps around the loop)
  const echo = song.echo ?? 0.1;
  if (echo > 0) {
    const d = Math.floor(six * 3 * SR);
    const el = new Float32Array(n), er = new Float32Array(n);
    for (let rep = 0; rep < 2; rep++) for (let i = 0; i < n; i++) {
      const j = (i - d + n * 4) % n;
      el[i] = l[j] * echo + er[j] * 0.3;
      er[i] = r[j] * echo + el[j] * 0.3;
    }
    for (let i = 0; i < n; i++) { l[i] += er[i] * 0.8; r[i] += el[i] * 0.8; }
  }
  // room reverb (Schroeder: 4 damped combs + 2 all-passes per side), also wrapped
  {
    const wet = song.reverb ?? 0.3;
    const combs = [1557, 1617, 1491, 1422].map((d) => Math.floor(d * 1.7));
    for (const [src, spread] of [[l, 0], [r, 37]] as const) {
      const acc = new Float32Array(n);
      for (const d0 of combs) {
        const d = d0 + spread, line = new Float32Array(d);
        let idx = 0, damp = 0;
        for (let rep = 0; rep < 2; rep++) for (let i = 0; i < n; i++) {
          const y = line[idx];
          damp = y * 0.55 + damp * 0.45;
          line[idx] = src[i] * 0.25 + damp * 0.84;
          idx = (idx + 1) % d;
          if (rep === 1) acc[i] += y;
        }
      }
      for (const d of [225 + spread, 556 + spread]) {
        const line = new Float32Array(d);
        let idx = 0;
        for (let i = 0; i < n; i++) {
          const bufout = line[idx], x = acc[i];
          line[idx] = x + bufout * 0.5;
          acc[i] = bufout - x * 0.5;
          idx = (idx + 1) % d;
        }
      }
      for (let i = 0; i < n; i++) src[i] += acc[i] * wet;
    }
  }
  // master low-pass (two passes so the filter state wraps around the loop like the reverb)
  if (song.tone) {
    for (const x of [l, r]) {
      const w = Math.exp((-2 * Math.PI * song.tone) / SR);
      let a = 0, b = 0;
      for (let rep = 0; rep < 2; rep++) for (let i = 0; i < n; i++) {
        a = x[i] * (1 - w) + a * w;
        b = a * (1 - w) + b * w;
        if (rep === 1) x[i] = b;
      }
    }
  }
  // remove DC, normalise to a shared loudness and soft-limit
  for (const x of [l, r]) { let m = 0; for (let i = 0; i < n; i++) m += x[i]; m /= n; for (let i = 0; i < n; i++) x[i] -= m; }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += l[i] * l[i] + r[i] * r[i];
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const g = (0.13 * Math.pow(10, (song.loudness ?? 0) / 20)) / rms;
  if (song.ceiling) {
    const gain = limiter(l, r, g, song.ceiling);
    for (let i = 0; i < n; i++) { l[i] *= g * gain[i]; r[i] *= g * gain[i]; }
  } else {
    for (let i = 0; i < n; i++) { l[i] = Math.tanh(l[i] * g) * 0.95; r[i] = Math.tanh(r[i] * g) * 0.95; }
  }
  return { l, r, seconds: n / SR };
}

/**
 * Gain curve that keeps |x * g * gain| under `ceiling`: it ducks smoothly ~6 ms ahead of each peak
 * and recovers over ~150 ms. Every pass wraps around the buffer, so the loop stays seamless.
 */
function limiter(l: Float32Array, r: Float32Array, g: number, ceiling: number): Float32Array {
  const n = l.length, out = new Float32Array(n).fill(1);
  const look = Math.floor(0.006 * SR);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(l[i]), Math.abs(r[i])) * g;
    if (p > ceiling) {
      const need = ceiling / p;
      for (let k = 0; k <= look; k++) { const j = (i - k + n) % n; if (out[j] > need) out[j] = need; }
    }
  }
  // ramp down before peaks (backwards in time), then recover slowly after them
  const att = Math.exp(-1 / (look / 3)), rel = Math.exp(-1 / (0.15 * SR));
  for (let rep = 0; rep < 2; rep++) { let v = 1; for (let k = 2 * n - 1; k >= 0; k--) { const i = k % n; v = Math.min(out[i], v + (1 - v) * (1 - att)); if (k < n) out[i] = v; } }
  for (let rep = 0; rep < 2; rep++) { let v = 1; for (let k = 0; k < 2 * n; k++) { const i = k % n; v = Math.min(out[i], v + (1 - v) * (1 - rel)); if (k >= n) out[i] = v; } }
  return out;
}

/** True when any section of the song plays percussion. */
function hasDrums(song: Song): boolean {
  const pats = [song.drums, ...Object.values(song.sections).map((s) => s.drums ?? song.drums)];
  return pats.some((p) => /[^.]/.test(p));
}

export function wav(l: Float32Array, r: Float32Array): Buffer {
  const n = l.length, data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))), 44 + i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))), 46 + i * 4);
  }
  return data;
}
