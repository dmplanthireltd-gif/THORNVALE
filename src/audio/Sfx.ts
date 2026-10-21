import type { Controller } from '../client/Controller';
import type { Command } from '../game/net/protocol';
import type { ItemDef } from '../game/inventory/items';
import type { Effect, GameEvent } from '../game/core/events';
import { chebyshev } from '../game/core/types';
import { itemDef } from '../game/inventory/items';
import { Ground, Obj } from '../game/world/WorldMap';
import { Enemy } from '../game/enemies/Enemy';
import { bodyFall, bodyOf, elementHit, footstep, impact, spellSweep, voice, type Body, type Cry, type Kit, type SpellElement } from './foley';
import { Ambience } from './ambience';
import { SOUNDS, type SoundName } from './sfxlib';

/**
 * Small synthesized sound effects (Web Audio, no sound files). Sounds near the
 * player are louder; anything on another floor or far away is silent.
 */
type Sound = SoundName;

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
  private myZ: number | null = null;
  private lastChat = 0;
  private gear = new Map<string, string | null>();
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
    // listen to the player's own actions (opening doors, eating, moving items). This only
    // observes: the command still goes to Controller.send unchanged.
    const send = ctl.send.bind(ctl);
    ctl.send = (cmd: Command) => {
      try { this.onCommand(cmd); } catch { /* never block an action over a sound */ }
      send(cmd);
    };
    // a soft click for every button in the interface
    document.addEventListener('click', (ev) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest?.('button')) this.play('click', 0.35);
    }, true);
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

  /** Plays a sound from the library (sfxlib.ts); `gain` scales it (distance falloff). */
  play(s: Sound, gain = 1, delay = 0): void {
    if (this.muted || gain <= 0.02) return;
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    // don't stack the same sound many times in one instant
    const now = c.currentTime;
    if (now - (this.last.get(s) ?? -1) < 0.035) return;
    this.last.set(s, now);
    this.sound(SOUNDS[s], gain, delay);
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
      case 'arrow': return 'bow';
      case 'bolt': return 'crossbow';
      case 'spear': case 'star': return 'throw';
      default: return null;
    }
  }

  private onEvent(e: GameEvent): void {
    const me = this.ctl.pid;
    switch (e.type) {
      case 'attack': {
        const v = this.atId(e.attackerId);
        const sw = this.swingOf(e.attackerId);
        if (v && sw) this.play(sw, v * 0.6);
        const body = this.bodyOfId(e.attackerId);
        if (v && body && Math.random() < 0.45) this.cry(e.attackerId, body, 'attack', v, 3500);
        break;
      }
      case 'damage': {
        const v = this.atId(e.targetId);
        if (!v) break;
        if (e.result === 'miss') this.play('miss', v);
        else if (e.result === 'blocked') this.play(this.blockOf(e.targetId), v);
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
      case 'teleport': {
        if (e.id !== me) break;
        const p = this.ctl.game.getPlayer(me);
        if (p && this.myZ !== null && p.z !== this.myZ) {
          // stairs, ladders and holes: a few quick steps on the new floor
          const gr = this.ctl.game.world.getGround(Math.round(p.x), Math.round(p.y), p.z);
          for (let i = 0; i < 3; i++) this.later(i * 110, () => this.sound((k) => footstep(k, gr === Ground.Void ? Ground.Stone : gr, 1, i % 2 === 1, false), 0.5));
        } else this.play('teleport', 0.6);
        break;
      }
      case 'cast': {
        const v = this.atId(e.casterId);
        if (v) this.play('spellCast', v * 0.7);
        break;
      }
      case 'chat': {
        if (e.id === me) break;
        const v = this.atId(e.id), now = performance.now();
        if (v && now - this.lastChat > 1500) { this.lastChat = now; this.play('chat', v * 0.6); }
        break;
      }
      case 'mine': {
        const v = this.at(e.x, e.y, e.z);
        this.play(e.got ? 'mineOre' : 'mineHit', v);
        if (e.depleted) this.later(150, () => this.play('rockBreak', v));
        break;
      }
      case 'craft': {
        const v = this.at(e.x, e.y, e.z);
        this.play(e.station === 'furnace' ? 'furnace' : 'anvil', v);
        if (e.made && e.id === me) this.later(e.station === 'furnace' ? 650 : 600, () => this.play('crafted', 0.7));
        break;
      }
      case 'equipmentChanged':
        if (e.id === me) this.gearChanged();
        break;
      case 'outfitChanged':
        if (e.id === me) this.play('pickupCloth', 0.6);
        break;
      case 'playerRespawn':
        if (e.id === me) this.play('respawn', 0.8);
        break;
      case 'questChanged':
        if (e.to === me) this.play('quest', 0.7);
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
        if (e.kind === 'loot') this.play(/gold/i.test(e.text) ? 'coins' : /potion/i.test(e.text) ? 'pickupGlass' : /gem|ruby|sapphire|emerald|diamond|amethyst|pearl/i.test(e.text) ? 'pickupGem' : 'pickup', 0.8);
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
      ftone: (type, f0, f1, filter, c0, c1, at, dur, peak, q = 1, attack = 0.005) => {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, at);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
        f.type = filter;
        f.Q.value = q;
        f.frequency.setValueAtTime(c0, at);
        f.frequency.exponentialRampToValueAtTime(Math.max(20, c1), at + dur);
        this.env(g, at, attack, peak, dur);
        o.connect(f).connect(g).connect(out);
        o.start(at);
        o.stop(at + attack + dur + 0.05);
      },
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
  private sound(build: (k: Kit) => void, gain: number, delay = 0): void {
    if (this.muted || gain <= 0.02) return;
    const c = this.ensure();
    if (!c || !this.master || c.state !== 'running') return;
    const out = c.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    build(this.kit(out, c.currentTime + 0.005 + delay));
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
    this.myZ = me.z;
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
    if (id === this.ctl.pid && this.ctl.game.world.getObj(x, y, z) === Obj.Door) this.play('door', 0.5);
    this.sound((k) => footstep(k, ground === Ground.Void ? Ground.Cave : ground, 1, alt, heavy), gain);
  }

  /** Sounds for the player's own actions that have no game event of their own. */
  private onCommand(cmd: Command): void {
    const g = this.ctl.game, sess = g.session(this.ctl.pid);
    switch (cmd.c) {
      case 'useItem': this.used(cmd.item); break;
      case 'useSlot': { const it = sess?.inventory.slots[cmd.slot]; if (it) this.used(it.id); break; }
      case 'useTile': {
        const me = g.getPlayer(this.ctl.pid);
        if (!me) break;
        const o = g.world.getObj(cmd.x, cmd.y, me.z);
        if (o === Obj.Door) this.play('door', 0.6);
        else if (o === Obj.Chest || o === Obj.Locker) this.play('chest', 0.7);
        break;
      }
      case 'moveSlot': case 'moveBag': case 'deposit': case 'withdraw': this.play('itemMove', 0.6); break;
      case 'drop': this.play('drop', 0.6); break;
      case 'throw': this.play('throw', 0.4); this.later(250, () => this.play('drop', 0.5)); break;
      case 'pickup': this.play('pickup', 0.6); break;
      case 'talk': this.play('uiOpen', 0.5); break;
      case 'tradeAccept': this.play('coins', 0.6); break;
    }
  }

  /** Drinking and eating. */
  used(itemId: string): void {
    const d = this.def(itemId);
    if (!d || d.kind !== 'consumable') return;
    this.play(/potion|mead/.test(d.id) ? 'drink' : 'eat', 0.8);
  }

  private def(id: string): ItemDef | null {
    try { return itemDef(id); } catch { return null; }
  }

  /** Metal gear clanks; leather, cloth and jewellery rustle. */
  private isMetal(d: ItemDef): boolean {
    if (/leather|robe|cape|cloth|wool|hat|sandal|studded|fur|silk|hood|wood|bow|staff|wand|rod/i.test(d.name)) return false;
    return d.kind === 'weapon' || /steel|iron|plate|chain|mail|bronze|copper|knight|crown|golden|silver|scale|helmet|shield|starsteel|darkstone/i.test(d.name);
  }

  /** The player's equipment changed: clank for what went on, rustle for what came off. */
  private gearChanged(): void {
    const eq = this.ctl.game.session(this.ctl.pid)?.inventory.equipment;
    if (!eq) return;
    let on: string | null = null, off = false;
    for (const [slot, it] of Object.entries(eq)) {
      const id = it?.id ?? null, before = this.gear.get(slot);
      if (before !== undefined && before !== id) { if (id) on = id; else off = true; }
      this.gear.set(slot, id);
    }
    if (on) { const d = this.def(on); this.play(d && this.isMetal(d) ? 'equipMetal' : 'equipLeather', 0.7); }
    else if (off) this.play('unequip', 0.6);
  }

  /** Swing sound from what the attacker holds; ranged weapons are heard through their projectile. */
  private swingOf(id: number): Sound | null {
    const c = this.ctl.game.getCreature(id);
    if (!c) return null;
    if (c instanceof Enemy) return 'swing';
    const w = this.ctl.game.session(id)?.inventory.equipment.weapon?.id;
    const d = w ? this.def(w) : null;
    switch (d?.weaponType) {
      case undefined: return 'swingFist';
      case 'sword': return 'swingBlade';
      case 'axe': return 'swingHeavy';
      case 'club': return 'swingBlunt';
      default: return null;
    }
  }

  /** A blocked blow rings on metal and knocks on wood or hide. */
  private blockOf(id: number): Sound {
    const sh = this.ctl.game.session(id)?.inventory.equipment.shield?.id;
    if (sh) { const d = this.def(sh); return d && /wood|bark|hide|leather/i.test(d.name) ? 'blockWood' : 'block'; }
    const body = this.bodyOfId(id);
    if (body) return ['metal', 'stone', 'crystal', 'bone', 'ice'].includes(body.material) ? 'block' : 'blockWood';
    return 'block';
  }

  private later(ms: number, fn: () => void): void {
    setTimeout(() => { try { fn(); } catch { /* ignore */ } }, ms);
  }
}

/** The six spell elements that get their own wave, beam and hit sounds. */
function spellElement(e: string): SpellElement | null {
  if (e === 'fire' || e === 'energy' || e === 'ice' || e === 'earth' || e === 'death' || e === 'holy') return e;
  if (e === 'stone') return 'earth';
  if (e === 'light') return 'holy';
  return null;
}
