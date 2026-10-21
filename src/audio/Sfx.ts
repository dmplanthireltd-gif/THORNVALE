import type { Controller } from '../client/Controller';
import type { Effect, GameEvent } from '../game/core/events';
import { chebyshev } from '../game/core/types';
import { itemDef } from '../game/inventory/items';
import { Ground, Obj } from '../game/world/WorldMap';
import { Enemy } from '../game/enemies/Enemy';
import { bodyFall, bodyOf, elementHit, footstep, impact, spellSweep, voice, type Body, type Cry, type Kit, type SpellElement } from './foley';
import { Ambience } from './ambience';

/**
 * Small synthesized sound effects (Web Audio, no sound files). Sounds near the
 * player are louder; anything on another floor or far away is silent.
 */
type Sound =
  | 'hit' | 'hitHard' | 'miss' | 'block' | 'swing' | 'bow' | 'throw'
  | 'fire' | 'energy' | 'ice' | 'earth' | 'death' | 'holy'
  | 'heal' | 'mana' | 'buff' | 'shield' | 'levelUp' | 'die' | 'monsterDie'
  | 'coins' | 'pickup' | 'drink' | 'click' | 'teleport' | 'dig' | 'error' | 'explosion' | 'chop' | 'treeFall' | 'skillUp' | 'cast' | 'splash'
  | 'boom' | 'thunder' | 'shatter' | 'implode' | 'roar' | 'quake' | 'healBig';

const HEARING = 11;

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<Sound, number>();
  private pulses = new Map<number, PeriodicWave>();
  private lastVoice = new Map<number, number>();
  private steps = new Map<number, { x: number; y: number; z: number; alt: boolean }>();
  private ambience: Ambience | null = null;
  volume = 0.6;
  muted = false;

  constructor(private readonly ctl: Controller) {
    try {
      const v = storage()?.getItem('thornvale.volume');
      if (v !== null && v !== undefined) this.volume = Math.max(0, Math.min(1, Number(v)));
      this.muted = storage()?.getItem('thornvale.muted') === '1';
    } catch {
      /* defaults */
    }
    // browsers only allow sound after the player interacts with the page
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    ctl.game.events.on((e) => this.onEvent(e));
    // footsteps and ambience follow movement, so they run on the animation clock
    const frame = () => {
      try { this.tick(); } catch { /* never break the game over a sound */ }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // a gentle limiter so the big explosions can be loud without clipping
    const limit = this.ctx.createDynamicsCompressor();
    limit.threshold.value = -10;
    limit.knee.value = 8;
    limit.ratio.value = 6;
    limit.attack.value = 0.003;
    limit.release.value = 0.25;
    this.master.connect(limit).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ambience = new Ambience(this.ctx, this.master, this.noiseBuf);
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
    try {
      storage()?.setItem('thornvale.volume', String(this.volume));
    } catch {
      /* ignore */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try {
      storage()?.setItem('thornvale.muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!this.muted) this.play('click');
    return this.muted;
  }

  // ------------------------------------------------------------------ building blocks

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.005): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private noise(out: AudioNode, filter: BiquadFilterType, f0: number, f1: number, t: number, dur: number, peak: number, q = 1, attack = 0.005): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + dur + 0.05);
  }

  /** Plays a sound; `gain` scales it (distance falloff). */
  play(s: Sound, gain = 1, delay = 0): void {
    if (this.muted || gain <= 0.02) return;
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    // don't stack the same sound many times in one instant
    const now = c.currentTime;
    if (now - (this.last.get(s) ?? -1) < 0.035) return;
    this.last.set(s, now);
    const out = c.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    const t = now + 0.005 + delay;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (s) {
      case 'hit':
        this.noise(out, 'bandpass', 900, 300, t, 0.09, 0.6, 1.5);
        this.tone(out, 'triangle', 160, 70, t, 0.08, 0.35);
        break;
      case 'hitHard':
        this.noise(out, 'lowpass', 1600, 200, t, 0.16, 0.8, 0.8);
        this.tone(out, 'sine', 110, 45, t, 0.18, 0.6);
        break;
      case 'miss':
        this.noise(out, 'bandpass', 2400, 900, t, 0.12, 0.25, 2);
        break;
      case 'block':
        this.tone(out, 'square', r(780, 900), 600, t, 0.09, 0.12);
        this.tone(out, 'triangle', 1500, 1300, t, 0.15, 0.12);
        break;
      case 'swing':
        this.noise(out, 'bandpass', 600, 2500, t, 0.14, 0.25, 3, 0.03);
        break;
      case 'bow':
        this.tone(out, 'triangle', 420, 180, t, 0.12, 0.25);
        this.noise(out, 'highpass', 3000, 6000, t + 0.02, 0.12, 0.15, 1);
        break;
      case 'throw':
        this.noise(out, 'bandpass', 900, 2200, t, 0.2, 0.25, 2, 0.04);
        break;
      case 'fire':
        this.noise(out, 'lowpass', 900, 3500, t, 0.35, 0.6, 1, 0.03);
        this.noise(out, 'bandpass', 300, 120, t + 0.05, 0.4, 0.4, 1);
        break;
      case 'boom':
        // a heavy, deep blast: sub-bass drop, a crack on top, a long rumble tail
        this.tone(out, 'sine', 120, 28, t, 0.9, 1.0, 0.004);
        this.tone(out, 'triangle', 70, 30, t, 0.7, 0.6, 0.004);
        this.noise(out, 'lowpass', 4000, 300, t, 0.25, 1.0, 0.7, 0.002);
        this.noise(out, 'lowpass', 600, 60, t + 0.05, 1.4, 0.8, 0.8, 0.02);
        break;
      case 'roar':
        // a rushing firestorm
        this.noise(out, 'lowpass', 500, 2600, t, 0.5, 0.8, 0.8, 0.04);
        this.noise(out, 'bandpass', 240, 90, t + 0.1, 1.2, 0.7, 0.9, 0.05);
        for (let i = 0; i < 6; i++) this.noise(out, 'highpass', 2500, 1800, t + 0.15 + i * r(0.07, 0.15), 0.04, 0.25, 1);
        break;
      case 'thunder':
        // a sharp crack followed by rolling thunder
        this.noise(out, 'highpass', 6000, 1500, t, 0.08, 1.0, 0.7, 0.001);
        for (let i = 0; i < 6; i++) this.tone(out, 'sawtooth', r(1200, 3000), r(150, 400), t + i * 0.03, 0.06, 0.18);
        this.noise(out, 'lowpass', 900, 70, t + 0.06, 1.3, 0.9, 0.8, 0.03);
        this.tone(out, 'sine', 80, 32, t + 0.05, 0.9, 0.6, 0.01);
        break;
      case 'shatter':
        // ice bursting: glassy breaks over a cold boom
        for (let i = 0; i < 9; i++) this.tone(out, 'triangle', r(2200, 5200), r(1500, 3500), t + i * r(0.015, 0.05), 0.12, 0.18);
        this.noise(out, 'highpass', 7000, 3000, t, 0.4, 0.4, 1);
        this.noise(out, 'bandpass', 900, 300, t + 0.05, 0.9, 0.5, 0.7, 0.05);
        break;
      case 'quake':
        // the ground erupts
        this.noise(out, 'lowpass', 350, 50, t, 1.4, 1.0, 1, 0.03);
        for (let i = 0; i < 7; i++) this.noise(out, 'lowpass', r(700, 1400), 150, t + i * r(0.06, 0.14), 0.12, 0.6, 1);
        this.tone(out, 'sine', 60, 25, t, 1.1, 0.8, 0.02);
        break;
      case 'implode':
        // the air sucked in, then a dead, hollow thud
        this.noise(out, 'bandpass', 300, 3000, t, 0.14, 0.35, 2, 0.12);
        this.tone(out, 'sawtooth', 160, 40, t + 0.14, 0.5, 0.35, 0.005);
        this.tone(out, 'sine', 110, 30, t + 0.14, 0.6, 0.8, 0.005);
        this.tone(out, 'sine', 233, 120, t + 0.14, 0.6, 0.15, 0.02);
        break;
      case 'healBig':
        // a warm swell of bells
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(out, 'sine', f, f, t + i * 0.05, 0.6, 0.15, 0.01));
        [262, 392].forEach((f) => this.tone(out, 'triangle', f, f, t, 0.8, 0.1, 0.15));
        this.noise(out, 'bandpass', 3000, 6000, t, 0.7, 0.08, 3, 0.2);
        break;
      case 'explosion':
        this.noise(out, 'lowpass', 2500, 120, t, 0.55, 0.9, 0.7);
        this.tone(out, 'sine', 90, 30, t, 0.5, 0.7);
        break;
      case 'energy':
        for (let i = 0; i < 4; i++) this.tone(out, 'sawtooth', r(900, 2200), r(200, 500), t + i * 0.035, 0.07, 0.12);
        this.noise(out, 'highpass', 4000, 2000, t, 0.25, 0.25, 1);
        break;
      case 'ice':
        for (let i = 0; i < 5; i++) this.tone(out, 'sine', r(1800, 3200), r(2600, 4000), t + i * 0.04, 0.18, 0.12);
        this.noise(out, 'highpass', 5000, 7000, t, 0.3, 0.15, 1);
        break;
      case 'earth':
        this.noise(out, 'lowpass', 400, 80, t, 0.45, 0.8, 1);
        for (let i = 0; i < 3; i++) this.tone(out, 'triangle', r(120, 200), 60, t + i * 0.06, 0.12, 0.3);
        break;
      case 'death':
        this.tone(out, 'sawtooth', 220, 55, t, 0.5, 0.25, 0.02);
        this.tone(out, 'sine', 233, 58, t, 0.5, 0.25, 0.02);
        this.noise(out, 'lowpass', 600, 100, t, 0.4, 0.3, 2);
        break;
      case 'holy':
        [880, 1109, 1319].forEach((f, i) => this.tone(out, 'sine', f, f * 1.01, t + i * 0.05, 0.4, 0.18, 0.02));
        break;
      case 'heal':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(out, 'sine', f, f, t + i * 0.06, 0.25, 0.16, 0.01));
        break;
      case 'mana':
        [392, 523, 659].forEach((f, i) => this.tone(out, 'triangle', f, f * 1.02, t + i * 0.06, 0.25, 0.14, 0.01));
        break;
      case 'buff':
        this.tone(out, 'sine', 300, 900, t, 0.35, 0.2, 0.05);
        this.noise(out, 'bandpass', 800, 3000, t, 0.35, 0.15, 2, 0.05);
        break;
      case 'shield':
        this.tone(out, 'sine', 200, 400, t, 0.5, 0.25, 0.08);
        this.tone(out, 'sine', 300, 600, t, 0.5, 0.15, 0.08);
        break;
      case 'levelUp':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(out, 'square', f, f, t + i * 0.09, 0.22, 0.09, 0.01));
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(out, 'sine', f * 2, f * 2, t + i * 0.09, 0.3, 0.06, 0.01));
        break;
      case 'die':
        [392, 330, 262, 196].forEach((f, i) => this.tone(out, 'triangle', f, f * 0.97, t + i * 0.16, 0.3, 0.2, 0.01));
        break;
      case 'monsterDie':
        this.tone(out, 'sawtooth', 300, 60, t, 0.35, 0.18, 0.01);
        this.noise(out, 'lowpass', 1200, 150, t, 0.3, 0.35, 1);
        break;
      case 'coins':
        for (let i = 0; i < 4; i++) this.tone(out, 'square', r(2000, 3200), r(1800, 3000), t + i * 0.05, 0.06, 0.06);
        break;
      case 'pickup':
        this.tone(out, 'triangle', 600, 900, t, 0.08, 0.2);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) this.tone(out, 'sine', r(300, 450), r(600, 800), t + i * 0.09, 0.07, 0.25);
        break;
      case 'click':
        this.tone(out, 'square', 1200, 900, t, 0.03, 0.08);
        break;
      case 'teleport':
        this.tone(out, 'sine', 200, 1200, t, 0.35, 0.18, 0.05);
        this.noise(out, 'bandpass', 500, 4000, t, 0.35, 0.12, 3, 0.05);
        break;
      case 'dig':
        this.noise(out, 'lowpass', 700, 200, t, 0.18, 0.6, 1);
        this.noise(out, 'lowpass', 700, 200, t + 0.2, 0.18, 0.5, 1);
        break;
      case 'error':
        this.tone(out, 'square', 180, 160, t, 0.12, 0.08);
        break;
      case 'chop':
        // an axe biting into wood: a dull knock with a woody ring
        this.noise(out, 'bandpass', r(500, 650), 220, t, 0.09, 0.7, 2.5);
        this.tone(out, 'triangle', r(190, 230), 110, t, 0.1, 0.35);
        break;
      case 'treeFall':
        this.noise(out, 'bandpass', 1400, 400, t, 0.35, 0.35, 1.5, 0.05);
        this.noise(out, 'lowpass', 500, 80, t + 0.35, 0.45, 0.8, 0.8);
        this.tone(out, 'sine', 80, 40, t + 0.35, 0.4, 0.5);
        break;
      case 'cast':
        // the line whips out and the float drops in: a soft plop
        this.noise(out, 'bandpass', 2400, 900, t, 0.12, 0.08, 1.2);
        this.tone(out, 'sine', r(520, 600), 260, t + 0.12, 0.09, 0.08);
        break;
      case 'splash':
        // a fish breaks the surface
        this.noise(out, 'lowpass', 2200, 400, t, 0.3, 0.3, 0.8, 0.01);
        this.noise(out, 'bandpass', 900, 1600, t + 0.08, 0.22, 0.12, 2);
        break;
      case 'skillUp':
        [659, 784, 988].forEach((f, i) => this.tone(out, 'triangle', f, f, t + i * 0.07, 0.18, 0.12, 0.01));
        break;
    }
  }

  // ------------------------------------------------------------------ game events → sounds

  /** Volume for something happening at a creature or tile (0 = inaudible). */
  private at(x: number, y: number, z: number): number {
    const me = this.ctl.game.getPlayer(this.ctl.pid);
    if (!me || z !== me.z) return 0;
    const d = chebyshev(x, y, me.x, me.y);
    if (d > HEARING) return 0;
    return 1 - (d / HEARING) * 0.8;
  }

  private atId(id: number): number {
    const c = this.ctl.game.getCreature(id);
    return c ? this.at(c.x, c.y, c.z) : 0;
  }

  private elementSound(e: Effect): Sound | null {
    switch (e) {
      case 'fire': return 'fire';
      case 'energy': return 'energy';
      case 'ice': return 'ice';
      case 'earth': case 'stone': return 'earth';
      case 'death': return 'death';
      case 'holy': case 'light': return 'holy';
      case 'heal': return 'heal';
      case 'haste': return 'buff';
      case 'shield': return 'shield';
      case 'arrow': case 'bolt': return 'bow';
      case 'spear': case 'star': return 'throw';
      default: return null;
    }
  }

  private onEvent(e: GameEvent): void {
    const me = this.ctl.pid;
    switch (e.type) {
      case 'attack': {
        const v = this.atId(e.attackerId);
        if (v) this.play('swing', v * 0.6);
        const body = this.bodyOfId(e.attackerId);
        if (v && body && Math.random() < 0.45) this.cry(e.attackerId, body, 'attack', v, 3500);
        break;
      }
      case 'damage': {
        const v = this.atId(e.targetId);
        if (!v) break;
        if (e.result === 'miss') this.play('miss', v);
        else if (e.result === 'blocked') this.play('block', v);
        else {
          const body = this.bodyOfId(e.targetId);
          const c = this.ctl.game.getCreature(e.targetId);
          const big = !!c && e.amount >= c.maxHp * 0.15;
          if (e.element === 'physical') this.sound((k) => impact(k, body?.material ?? 'flesh', 1, e.amount > 60 || big), v);
          else { const el = spellElement(e.element); if (el) this.sound((k) => elementHit(k, el, big ? 1 : 0.7), v * 0.8); }
          if (body && big && !c?.dead) this.cry(e.targetId, body, 'hurt', v, 1200);
          if (e.targetId === me && big) this.cry(me, { family: 'man', material: 'flesh', size: 'medium' }, 'hurt', 0.7, 1500);
        }
        break;
      }
      case 'projectile': {
        const s = this.elementSound(e.effect);
        const v = Math.max(this.atId(e.fromId), this.atId(e.toId));
        if (s) this.play(s, v * 0.8);
        if (e.effect === 'death') this.play('implode', v * 0.9, 0.1);
        break;
      }
      case 'tiles': {
        if (!e.tiles.length) break;
        const s = this.elementSound(e.effect);
        const v = this.at(e.tiles[0], e.tiles[1], e.z);
        if (s) this.play(s, v);
        const el = spellElement(e.effect), size = e.tiles.length / 2;
        if (el && size >= 3) this.sound((k) => spellSweep(k, el, size, 1), v * 0.8);
        break;
      }
      case 'area': {
        const v = this.at(e.x, e.y, e.z);
        const s = this.elementSound(e.effect);
        if (s) this.play(s, v);
        const el = spellElement(e.effect);
        if (el && e.radius >= 1) this.sound((k) => spellSweep(k, el, (e.radius * 2 + 1) ** 2, 1), v * 0.7);
        if (e.radius >= 4) {
          // the ultimate explosions: as loud and deep as it gets
          const big: Partial<Record<Effect, Sound>> = { fire: 'roar', energy: 'thunder', ice: 'shatter', earth: 'quake', stone: 'quake', death: 'implode' };
          const layer = big[e.effect];
          this.play('boom', Math.min(1.6, v * 1.8), 0.16);
          if (layer) this.play(layer, Math.min(1.5, v * 1.5), 0.14);
        } else if (e.radius >= 1 && e.effect !== 'heal' && e.effect !== 'blood') {
          this.play('explosion', v * (e.radius >= 2 ? 1 : 0.6), 0.1);
          if (e.radius >= 2 && e.effect === 'energy') this.play('thunder', v * 0.8, 0.1);
          if (e.radius >= 2 && e.effect === 'ice') this.play('shatter', v * 0.8, 0.1);
          if (e.radius >= 2 && (e.effect === 'earth' || e.effect === 'stone')) this.play('quake', v * 0.7, 0.1);
        }
        break;
      }
      case 'heal': {
        if (e.targetId === me) {
          const p = this.ctl.game.getPlayer(me);
          this.play(p && e.amount > p.maxHp * 0.3 ? 'healBig' : 'heal', 0.8);
        }
        break;
      }
      case 'mana':
        if (e.to === me) this.play('mana', 0.8);
        break;
      case 'buff':
        if (e.on && e.id === me) this.play(e.buff === 'magicShield' ? 'shield' : e.buff === 'haste' ? 'buff' : 'holy', 0.8);
        break;
      case 'levelUp':
        if (e.id === me) this.play('levelUp');
        break;
      case 'death':
        if (e.id === me) this.play('die');
        else {
          const v = this.atId(e.id);
          const body = this.bodyOfId(e.id);
          if (v && body) {
            this.sound((k) => voice(k, body, 'die', 1), v);
            this.sound((k) => bodyFall(k, body, 1), v);
          } else if (v) this.play('monsterDie', v);
        }
        break;
      case 'teleport':
        if (e.id === me) this.play('teleport', 0.6);
        break;
      case 'tileChanged': {
        // holes being dug; felled and regrowing trees make their own sounds (chop events)
        const o = this.ctl.game.world.getObj(e.x, e.y, e.z);
        if (o === Obj.Hole || o === Obj.LooseStone) this.play('dig', this.at(e.x, e.y, e.z));
        break;
      }
      case 'chop': {
        const v = this.at(e.x, e.y, e.z);
        this.play('chop', v);
        if (e.felled) this.play('treeFall', v);
        break;
      }
      case 'fish': {
        const v = this.at(e.x, e.y, e.z);
        this.play(e.got ? 'splash' : 'cast', v * 0.8);
        break;
      }
      case 'skillUp':
        if (e.to === me && e.level > 0) this.play('skillUp', 0.7);
        break;
      case 'message':
        if (e.to !== me) break;
        if (e.kind === 'loot') this.play(/gold/i.test(e.text) ? 'coins' : 'pickup', 0.8);
        else if (e.kind === 'warn' && /exhausted|cannot|need|too far|full/i.test(e.text)) this.play('error', 0.7);
        else if (e.kind === 'trade' && /sold|bought|gold/i.test(e.text)) this.play('coins', 0.7);
        break;
      case 'inventoryChanged':
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ foley (footsteps, materials, voices)

  /** A pulse wave of the given duty cycle (cached), the classic chiptune voice. */
  private pulseWave(duty: number): PeriodicWave {
    const key = Math.round(duty * 1000);
    let w = this.pulses.get(key);
    if (!w) {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      w = this.ctx!.createPeriodicWave(re, im);
      this.pulses.set(key, w);
    }
    return w;
  }

  /** Builds a Kit (see foley.ts) writing into `out` at time `t`. */
  private kit(out: AudioNode, t: number): Kit {
    const c = this.ctx!;
    return {
      t,
      r: (a, b) => a + Math.random() * (b - a),
      tone: (type, f0, f1, at, dur, peak, attack) => this.tone(out, type, f0, f1, at, dur, peak, attack),
      noise: (filter, f0, f1, at, dur, peak, q, attack) => this.noise(out, filter, f0, f1, at, dur, peak, q, attack),
      pulse: (duty, f0, f1, at, dur, peak, tremolo) => {
        const o = c.createOscillator();
        o.setPeriodicWave(this.pulseWave(duty));
        o.frequency.setValueAtTime(f0, at);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
        const g = c.createGain();
        this.env(g, at, 0.005, peak, dur);
        if (tremolo) {
          const lfo = c.createOscillator(), depth = c.createGain();
          lfo.frequency.value = tremolo;
          depth.gain.value = peak * 0.6;
          lfo.connect(depth).connect(g.gain);
          lfo.start(at);
          lfo.stop(at + dur + 0.05);
        }
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + dur + 0.06);
      },
    };
  }

  /** Plays a foley sound built from the kit, at a volume (distance falloff). */
  private sound(build: (k: Kit) => void, gain: number): void {
    if (this.muted || gain <= 0.02) return;
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    const out = c.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    build(this.kit(out, c.currentTime + 0.005));
  }

  private bodyOfId(id: number): Body | null {
    const c = this.ctl.game.getCreature(id);
    return c instanceof Enemy ? bodyOf(c.enemyKind) : null;
  }

  /** A creature's voice, at most once per `cooldownMs` for that creature. */
  private cry(id: number, body: Body, cry: Cry, gain: number, cooldownMs: number): void {
    const now = performance.now();
    if (now - (this.lastVoice.get(id) ?? -Infinity) < cooldownMs) return;
    this.lastVoice.set(id, now);
    this.sound((k) => voice(k, body, cry, 1), gain);
  }

  /** Every frame: footsteps for the player and big monsters, and the ambience bed. */
  private tick(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const g = this.ctl.game;
    const me = g.getPlayer(this.ctl.pid);
    if (!me) return;
    this.stepCheck(me.id, me.x, me.y, me.z, 0.55, false);
    for (const e of g.enemies) {
      if (e.dead || e.z !== me.z) continue;
      const b = bodyOf(e.enemyKind);
      if (b.size !== 'huge' && b.size !== 'large') continue;
      if (chebyshev(e.x, e.y, me.x, me.y) > 9) { this.steps.delete(e.id); continue; }
      this.stepCheck(e.id, e.x, e.y, e.z, this.at(e.x, e.y, e.z) * (b.size === 'huge' ? 0.9 : 0.5), b.size === 'huge');
    }
    if (this.ambience && !this.muted) this.ambience.update(g, me);
  }

  private stepCheck(id: number, x: number, y: number, z: number, gain: number, heavy: boolean): void {
    const prev = this.steps.get(id);
    if (!prev) { this.steps.set(id, { x, y, z, alt: false }); return; }
    if (prev.x === x && prev.y === y && prev.z === z) return;
    const moved = prev.z === z && chebyshev(prev.x, prev.y, x, y) <= 1;
    prev.x = x; prev.y = y; prev.z = z; prev.alt = !prev.alt;
    if (!moved) return; // teleports and floor changes aren't steps
    const ground = this.ctl.game.world.getGround(x, y, z);
    const alt = prev.alt;
    this.sound((k) => footstep(k, ground === Ground.Void ? Ground.Cave : ground, 1, alt, heavy), gain);
  }

  /** Called by the UI when the player drinks or uses something. */
  used(itemId: string): void {
    try {
      const d = itemDef(itemId);
      if (d.kind === 'consumable') this.play('drink', 0.8);
    } catch {
      /* unknown item */
    }
  }
}

/** The six spell elements that get their own wave, beam and hit sounds. */
function spellElement(e: string): SpellElement | null {
  if (e === 'fire' || e === 'energy' || e === 'ice' || e === 'earth' || e === 'death' || e === 'holy') return e;
  if (e === 'stone') return 'earth';
  if (e === 'light') return 'holy';
  return null;
}
