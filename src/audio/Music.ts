import type { Controller } from '../client/Controller';

/**
 * Background music, composed for Thornvale and synthesized live with Web Audio
 * (no sound files). Three pieces follow where the player is:
 *
 *  - "The Open Road"   (fields and forests): flute melody, harp, strings, war drums
 *  - "Hearth and Lantern" (inside a town's protection zone): gentle lute and harp
 *  - "Below the Stone" (underground): slow strings, bells and a low drone
 *
 * The scheduler queues notes a little ahead of time, so timing stays tight even
 * when the game is busy. Switching piece fades out at the end of a bar.
 */

export type Mood = 'road' | 'town' | 'deep';
type Note = [number | null, number]; // midi note (null = rest), length in beats

interface Piece {
  bpm: number;
  chords: number[][]; // one chord per bar (midi notes, lowest = bass root)
  melody: Note[][]; // one list of notes per bar, 4 beats each
  lead: 'flute' | 'lute' | 'bell';
  harp: 'eighths' | 'rolled' | 'sparse';
  drums: 'war' | 'light' | 'none';
  pad: number; // pad loudness
}

// chords
const Dm = [50, 57, 62, 65], Bb = [46, 53, 58, 62], F = [41, 53, 57, 60], C = [48, 55, 60, 64], A = [45, 52, 57, 61], Gm = [43, 55, 58, 62];
const Fh = [41, 57, 60, 65], Ch = [48, 55, 60, 64], Dmh = [50, 57, 62, 65], Bbh = [46, 58, 62, 65], Am = [45, 52, 57, 60], E = [40, 52, 56, 59], Dml = [38, 53, 57, 62];

const PIECES: Record<Mood, Piece> = {
  road: {
    bpm: 88,
    chords: [Dm, Bb, F, C, Dm, Bb, C, A, Dm, Bb, F, C, Dm, Bb, Gm, A, Bb, C, Dm, Dm],
    melody: [
      [[62, 1], [65, 0.5], [69, 0.5], [74, 1.5], [72, 0.5]],
      [[70, 1], [69, 0.5], [67, 0.5], [65, 2]],
      [[69, 1], [72, 0.5], [77, 0.5], [76, 1], [74, 1]],
      [[72, 3], [null, 1]],
      [[74, 1], [77, 0.5], [76, 0.5], [74, 1], [72, 1]],
      [[70, 1.5], [72, 0.5], [74, 2]],
      [[72, 1], [70, 0.5], [69, 0.5], [67, 1], [64, 1]],
      [[69, 3], [null, 1]],
      [[62, 1], [65, 0.5], [69, 0.5], [74, 1.5], [76, 0.5]],
      [[77, 1], [76, 0.5], [74, 0.5], [70, 2]],
      [[72, 1], [69, 0.5], [72, 0.5], [77, 1], [79, 1]],
      [[76, 3], [null, 1]],
      [[81, 1.5], [79, 0.5], [77, 1], [74, 1]],
      [[77, 1], [74, 0.5], [72, 0.5], [70, 2]],
      [[70, 1], [69, 0.5], [67, 0.5], [70, 1], [67, 1]],
      [[69, 2], [73, 2]],
      [[74, 1], [72, 1], [70, 1], [74, 1]],
      [[76, 1], [74, 1], [72, 1], [67, 1]],
      [[69, 1.5], [65, 0.5], [62, 2]],
      [[null, 4]],
    ],
    lead: 'flute', harp: 'eighths', drums: 'war', pad: 0.5,
  },
  town: {
    bpm: 96,
    chords: [Fh, Ch, Dmh, Bbh, Fh, Ch, Bbh, Ch, Dmh, Bbh, Fh, Ch, Bbh, Ch, Fh, Fh],
    melody: [
      [[72, 1], [69, 1], [72, 1], [77, 1]],
      [[76, 2], [72, 2]],
      [[74, 1], [72, 1], [69, 1], [65, 1]],
      [[67, 3], [null, 1]],
      [[69, 1], [72, 1], [77, 1.5], [76, 0.5]],
      [[74, 1], [72, 1], [76, 2]],
      [[74, 1], [72, 1], [70, 1], [69, 1]],
      [[67, 2], [72, 2]],
      [[74, 1.5], [72, 0.5], [69, 1], [74, 1]],
      [[70, 2], [65, 2]],
      [[69, 1], [72, 1], [77, 1], [81, 1]],
      [[79, 3], [null, 1]],
      [[77, 1], [74, 1], [70, 1], [74, 1]],
      [[72, 1], [76, 1], [79, 1], [76, 1]],
      [[77, 3], [null, 1]],
      [[null, 4]],
    ],
    lead: 'lute', harp: 'rolled', drums: 'light', pad: 0.35,
  },
  deep: {
    bpm: 60,
    chords: [Am, Dml, Am, E, Am, F, Dml, E],
    melody: [
      [[69, 2], [null, 2]],
      [[72, 1], [71, 1], [null, 2]],
      [[null, 2], [64, 2]],
      [[68, 4]],
      [[76, 2], [72, 2]],
      [[null, 2], [69, 1], [72, 1]],
      [[74, 2], [null, 2]],
      [[71, 3], [null, 1]],
    ],
    lead: 'bell', harp: 'sparse', drums: 'none', pad: 0.75,
  },
};

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private bus: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private mood: Mood = 'town';
  private wanted: Mood = 'town';
  private bar = 0;
  private nextBarTime = 0;
  private timer: number | null = null;
  get running(): boolean { return this.timer !== null; }
  volume = 0.5;
  muted = false;

  private ctl: Controller | null = null;

  /** Plays the town theme on the title screen; follow the player once `attach` is called. */
  constructor() {
    const st = storage();
    try {
      const v = st?.getItem('thornvale.musicVolume');
      if (v !== null && v !== undefined) this.volume = Math.max(0, Math.min(1, Number(v)));
      this.muted = st?.getItem('thornvale.musicMuted') === '1';
    } catch {
      /* defaults */
    }
    // browsers only allow sound after the player interacts with the page
    const unlock = () => {
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.setup(this.ctx);
    this.mood = this.wanted;
    this.bar = 0;
    this.nextBarTime = this.ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private setup(ctx: AudioContext): void {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : this.volume * 0.55;
    this.out.connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.out);
    // a soft hall: generated impulse response
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    rev.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(rev);
    rev.connect(this.bus);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  /** Renders a piece offline (for previews and the website); returns the audio. */
  static async preview(mood: Mood, seconds: number): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
    const m = new Music();
    m.setup(ctx as unknown as AudioContext);
    m.mood = mood;
    m.wanted = mood;
    m.nextBarTime = 0.1;
    const piece = PIECES[mood];
    const beat = 60 / piece.bpm;
    let bar = 0;
    while (m.nextBarTime < seconds) {
      m.playBar(piece, bar % piece.chords.length, m.nextBarTime, beat);
      m.nextBarTime += beat * 4;
      bar++;
    }
    return ctx.startRendering();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.out && !this.muted) this.out.gain.setTargetAtTime(this.volume * 0.55, this.ctx!.currentTime, 0.1);
    try { storage()?.setItem('thornvale.musicVolume', String(this.volume)); } catch { /* ignore */ }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.55, this.ctx.currentTime, 0.2);
    try { storage()?.setItem('thornvale.musicMuted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    return this.muted;
  }

  attach(ctl: Controller): void {
    this.ctl = ctl;
  }

  /** Picks the piece for where the player stands (called every frame; cheap). */
  update(): void {
    if (!this.ctl) return;
    const g = this.ctl.game;
    const p = g.getPlayer(this.ctl.pid);
    if (!p) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    this.wanted = p.z < 0 ? 'deep' : g.world.isSafe(x, y, p.z) ? 'town' : 'road';
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    if (ctx.state !== 'running') return;
    // keep ~0.6 s of music queued
    while (this.nextBarTime < ctx.currentTime + 0.6) {
      if (this.nextBarTime < ctx.currentTime - 0.5) this.nextBarTime = ctx.currentTime + 0.05; // tab was asleep
      // change piece only at the start of a phrase (every 4 bars) or when the piece ends
      if (this.wanted !== this.mood && this.bar % 4 === 0) {
        this.mood = this.wanted;
        this.bar = 0;
        this.bus.gain.setValueAtTime(0.0001, this.nextBarTime);
        this.bus.gain.exponentialRampToValueAtTime(1, this.nextBarTime + 2.5);
      }
      const piece = PIECES[this.mood];
      const beat = 60 / piece.bpm;
      this.playBar(piece, this.bar % piece.chords.length, this.nextBarTime, beat);
      this.nextBarTime += beat * 4;
      this.bar = (this.bar + 1) % piece.chords.length;
    }
  }

  // ---------------------------------------------------------------- one bar

  private playBar(piece: Piece, i: number, t0: number, beat: number): void {
    const chord = piece.chords[i];
    const bar = beat * 4;
    // strings pad
    for (const n of chord.slice(1)) this.pad(hz(n), t0, bar * 1.02, 0.045 * piece.pad);
    // bass
    if (piece.drums === 'none') this.bass(hz(chord[0] - 12), t0, bar, 0.16);
    else {
      this.bass(hz(chord[0] - 12), t0, beat * 1.8, 0.2);
      this.bass(hz(chord[0] - 12), t0 + beat * 2, beat * 1.8, 0.17);
    }
    // harp
    const up = [...chord.slice(1), chord[1] + 12, chord[2] + 12];
    if (piece.harp === 'eighths') {
      const order = [0, 1, 2, 3, 4, 3, 2, 1];
      order.forEach((k, j) => this.pluck(hz(up[k]), t0 + j * beat * 0.5, 0.06));
    } else if (piece.harp === 'rolled') {
      up.forEach((n, j) => this.pluck(hz(n), t0 + j * 0.07, 0.06));
      up.slice(0, 3).forEach((n, j) => this.pluck(hz(n), t0 + beat * 2 + j * 0.07, 0.045));
    } else {
      this.pluck(hz(up[2]), t0 + beat * 1, 0.05);
      this.pluck(hz(up[4] ?? up[3]), t0 + beat * 3, 0.04);
    }
    // drums
    if (piece.drums === 'war') {
      this.drum(t0, 0.5);
      this.drum(t0 + beat * 1.5, 0.28);
      this.drum(t0 + beat * 2, 0.4);
      if (i % 4 === 3) { this.drum(t0 + beat * 3, 0.3); this.drum(t0 + beat * 3.5, 0.35); }
      for (let j = 0; j < 8; j++) this.shaker(t0 + j * beat * 0.5, j % 2 ? 0.015 : 0.03);
    } else if (piece.drums === 'light') {
      this.drum(t0, 0.18);
      this.drum(t0 + beat * 2, 0.12);
      for (let j = 0; j < 4; j++) this.shaker(t0 + j * beat + beat * 0.5, 0.02);
    } else if (i % 4 === 0) this.drum(t0, 0.3, 48);
    // melody
    let t = t0;
    for (const [n, len] of piece.melody[i] ?? []) {
      if (n !== null) {
        if (piece.lead === 'flute') this.flute(hz(n), t, len * beat, 0.09);
        else if (piece.lead === 'lute') this.lute(hz(n), t, len * beat, 0.11);
        else this.bell(hz(n), t, len * beat, 0.08);
      }
      t += len * beat;
    }
  }

  // ---------------------------------------------------------------- instruments

  private env(g: GainNode, t: number, a: number, peak: number, hold: number, rel: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, hold) + rel);
  }

  private route(node: AudioNode, wet = 0.6): void {
    node.connect(this.bus!);
    const s = this.ctx!.createGain();
    s.gain.value = wet;
    node.connect(s);
    s.connect(this.wet!);
  }

  private pad(f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.4;
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 1.6);
    }
    lp.connect(g);
    this.env(g, t, len * 0.35, vol, len * 0.7, 1.2);
    this.route(g, 0.8);
  }

  private bass(f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    o.connect(g);
    this.env(g, t, 0.02, vol, len * 0.6, len * 0.5);
    this.route(g, 0.15);
    o.start(t);
    o.stop(t + len + 0.2);
  }

  private pluck(f: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    this.env(g, t, 0.004, vol, 0.01, 1.4);
    this.route(g, 0.7);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.6);
    o2.stop(t + 1.6);
  }

  private flute(f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.4, len));
    vib.connect(vg);
    vg.connect(o.frequency);
    // breath
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    n.connect(bp);
    bp.connect(ng);
    const h = ctx.createOscillator();
    h.type = 'triangle';
    h.frequency.value = f;
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    h.connect(hg);
    const g = ctx.createGain();
    o.connect(g);
    hg.connect(g);
    ng.connect(g);
    this.env(g, t, 0.06, vol, len * 0.85, 0.25);
    this.route(g, 0.55);
    for (const s of [o, vib, h]) { s.start(t); s.stop(t + len + 0.4); }
    n.start(t);
    n.stop(t + len + 0.4);
  }

  private lute(f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 6, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.6);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    lp.connect(g);
    this.env(g, t, 0.005, vol, 0.02, Math.min(1.6, len + 0.6));
    this.route(g, 0.6);
    o.start(t);
    o.stop(t + len + 0.8);
    // a soft double an octave up
    this.pluck(f * 2, t + 0.01, vol * 0.25);
  }

  private bell(f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.15]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + len + 3);
    }
    this.env(g, t, 0.005, vol, 0.01, 2.6);
    this.route(g, 1);
  }

  private drum(t: number, vol: number, base = 62): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(base * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(base, t + 0.18);
    const g = ctx.createGain();
    o.connect(g);
    this.env(g, t, 0.003, vol, 0.02, 0.45);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    n.connect(lp);
    lp.connect(ng);
    this.env(ng, t, 0.002, vol * 0.35, 0.01, 0.12);
    this.route(g, 0.35);
    this.route(ng, 0.35);
    o.start(t);
    o.stop(t + 0.6);
    n.start(t);
    n.stop(t + 0.2);
  }

  private shaker(t: number, vol: number): void {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    n.connect(hp);
    hp.connect(g);
    this.env(g, t, 0.004, vol, 0.01, 0.06);
    this.route(g, 0.2);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.1);
  }
}
