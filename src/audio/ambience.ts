import type { Game } from '../game/Game';
import type { Player } from '../game/player/Player';
import { Ground, Obj } from '../game/world/WorldMap';
import { flashInfo, kindAmount, WeatherKind } from '../game/world/weather';

/**
 * Background ambience that follows the surroundings: wind on snow, ice and sand, birds in grass
 * and forest, insects and frogs in jungle and swamp, waves near water, rumbling and bubbling near
 * lava, crackling near campfires, and a low drone with water drips underground. Synthesized live; very quiet by design.
 */

type Bed = 'wind' | 'insects' | 'sea' | 'lava' | 'cave' | 'fire' | 'deep' | 'rain' | 'gale';

export class Ambience {
  private beds = new Map<Bed, GainNode>();
  private lastSample = 0;
  private level: Record<Bed, number> = { wind: 0, insects: 0, sea: 0, lava: 0, cave: 0, fire: 0, deep: 0, rain: 0, gale: 0 };
  /** Share of sea floor around you (the Sunken Reach): muffled swell and rising bubbles. */
  private bubbles = 0;
  private nextBubble = 0;
  /** Last lightning flash heard (weather), so each one thunders once; -1 = not seen any yet. */
  private lastFlash = -1;
  private readonly noise: AudioBuffer;
  private nextCrackle = 0;
  private birds = 0;
  private frogs = 0;
  private nextChirp = 0;
  private nextDrip = 0;
  private nextPop = 0;

  constructor(private readonly ctx: AudioContext, private readonly out: AudioNode, noise: AudioBuffer) {
    this.noise = noise;
    const mk = (bed: Bed, type: BiquadFilterType, freq: number, q: number, lfoRate: number, lfoDepth: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      // slow movement so a bed never sounds like static
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = lfoRate;
      depth.gain.value = lfoDepth;
      lfo.connect(depth).connect(f.frequency);
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(out);
      src.start(0, Math.random());
      lfo.start();
      this.beds.set(bed, g);
    };
    mk('wind', 'bandpass', 500, 0.9, 0.11, 260);
    mk('insects', 'bandpass', 5200, 6, 7, 300);
    mk('sea', 'lowpass', 520, 0.7, 0.09, 300);
    mk('lava', 'lowpass', 140, 0.8, 0.2, 40);
    mk('cave', 'lowpass', 180, 0.6, 0.05, 50);
    mk('fire', 'bandpass', 1800, 0.7, 0.6, 600);
    mk('deep', 'lowpass', 260, 0.9, 0.07, 120);
    // weather: a soft hiss of rain and a deeper gale for storms, blizzards and sandstorms
    mk('rain', 'bandpass', 2600, 0.45, 0.17, 900);
    mk('gale', 'bandpass', 320, 0.7, 0.07, 160);
  }

  /** Called every frame; samples the surroundings twice a second. */
  update(g: Game, me: Player): void {
    const now = this.ctx.currentTime;
    if (now - this.lastSample > 0.5) {
      this.lastSample = now;
      this.sample(g, me);
      for (const [bed, gain] of this.beds) gain.gain.setTargetAtTime(this.level[bed], now, 1.2);
    }
    // occasional one-off sounds
    if (this.birds > 0.05 && now > this.nextChirp) {
      this.nextChirp = now + 2.5 + Math.random() * 6;
      this.chirp(now, this.birds);
    }
    if (this.frogs > 0.05 && now > this.nextChirp - 1 && Math.random() < 0.004) this.croak(now, this.frogs);
    if (this.bubbles > 0.05 && now > this.nextBubble) {
      this.nextBubble = now + 0.6 + Math.random() * 2.4;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const f = 220 + Math.random() * 160;
        this.blip('sine', f, f * 2.6, now + i * 0.07, 0.07, 0.018 * Math.min(1, this.bubbles * 1.5));
      }
    }
    if (this.level.cave > 0.01 && now > this.nextDrip) {
      this.nextDrip = now + 1.5 + Math.random() * 4.5;
      this.drip(now);
    }
    if (this.level.fire > 0.005 && now > this.nextCrackle) {
      this.nextCrackle = now + 0.08 + Math.random() * 0.5;
      this.blip('square', 3000 + Math.random() * 3000, 1500, now, 0.012, this.level.fire * 1.2);
    }
    if (this.level.lava > 0.01 && now > this.nextPop) {
      this.nextPop = now + 0.6 + Math.random() * 2;
      this.pop(now, this.level.lava * 4);
    }
  }

  private sample(g: Game, me: Player): void {
    const cx = Math.round(me.x), cy = Math.round(me.y), z = me.z;
    let snow = 0, sand = 0, green = 0, wild = 0, water = 0, lava = 0, seabed = 0, n = 0;
    for (let dy = -6; dy <= 6; dy += 2) {
      for (let dx = -6; dx <= 6; dx += 2) {
        const gr = g.world.getGround(cx + dx, cy + dy, z);
        if (gr === Ground.Void) continue;
        n++;
        if (gr === Ground.Snow || gr === Ground.Ice) snow++;
        else if (gr === Ground.Sand) sand++;
        else if (gr === Ground.Grass || gr === Ground.DarkGrass || gr === Ground.Crop) green++;
        else if (gr === Ground.Jungle || gr === Ground.Swamp) wild++;
        else if (gr === Ground.Water || gr === Ground.DeepWater) water++;
        else if (gr === Ground.Lava || gr === Ground.Ash) lava++;
        else if (gr === Ground.Seabed) seabed++;
      }
    }
    // campfires within 5 tiles crackle, louder the closer you stand
    let fire = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (g.world.getObj(cx + dx, cy + dy, z) === Obj.Campfire) fire = Math.max(fire, 1 - Math.max(Math.abs(dx), Math.abs(dy)) / 6);
    }
    const f = (v: number) => (n ? v / n : 0);
    const under = z < 0;
    const indoors = g.world.isSafe(cx, cy, z);
    // weather of the zone: rain is muffled under a roof, nothing reaches you underground
    const w = g.weatherView(me.id);
    const roofed = !!g.world.houseAt(cx, cy, z);
    const wet = Math.min(1.3, kindAmount(w, WeatherKind.Rain) + kindAmount(w, WeatherKind.Storm) + kindAmount(w, WeatherKind.Downpour) * 1.3);
    const gale = Math.max(0, w.wind - 0.45) / 0.55;
    if (w.flash !== this.lastFlash) {
      if (this.lastFlash !== -1 && w.flash > 0 && !under) {
        const fi = flashInfo(w.flash, w.zone);
        this.thunder(this.ctx.currentTime + fi.delay, fi.power * (roofed ? 0.6 : 1));
      }
      this.lastFlash = w.flash;
    }
    this.level = {
      wind: under ? 0 : (f(snow) * 0.09 + f(sand) * 0.06 + (z > 0 ? 0.03 : 0)) * (indoors ? 0.3 : 1),
      insects: under ? 0 : f(wild) * 0.025,
      sea: under ? 0 : Math.min(1, f(water) * 1.6) * 0.07,
      lava: f(lava) * 0.12,
      cave: under ? (f(seabed) > 0.3 ? 0.01 : 0.06) : 0,
      fire: fire * 0.035,
      deep: under ? Math.min(1, f(seabed) * 1.4) * 0.1 : 0,
      rain: under ? 0 : wet * (roofed ? 0.035 : 0.075),
      gale: under ? 0 : gale * (roofed || indoors ? 0.03 : 0.08),
    };
    this.bubbles = under ? f(seabed) : 0;
    this.birds = under || indoors ? 0 : f(green) + f(wild) * 0.5;
    this.frogs = under ? 0 : f(wild);
  }

  private blip(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number): void {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A short bird phrase: 2–4 quick rising notes. */
  private chirp(t: number, amount: number): void {
    const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.blip('square', base * (1 + i * 0.08), base * (1.15 + i * 0.08), t + i * 0.09, 0.06, 0.012 * Math.min(1, amount * 1.5));
  }

  private croak(t: number, amount: number): void {
    for (let i = 0; i < 2; i++) this.blip('square', 140, 110, t + i * 0.14, 0.1, 0.02 * Math.min(1, amount * 1.5));
  }

  private drip(t: number): void {
    const f = 1300 + Math.random() * 900;
    this.blip('sine', f, f * 1.7, t, 0.08, 0.035);
  }

  /** Thunder: a sharp crack (louder when close) and a long low roll. */
  private thunder(t: number, power: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 * power + 200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = ctx.createGain();
    const peak = 0.22 * power;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.04 + (1 - power) * 0.3);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.6);
    g.gain.linearRampToValueAtTime(peak * 0.5, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    src.connect(lp).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 4.4);
    // the rumble underneath
    this.blip('sine', 60 + power * 20, 34, t, 2.8, 0.09 * power);
  }

  private pop(t: number, amount: number): void {
    this.blip('sine', 240 + Math.random() * 80, 70, t, 0.12, 0.05 * Math.min(1, amount));
  }
}
