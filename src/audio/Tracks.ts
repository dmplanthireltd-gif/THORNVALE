import type { Controller } from '../client/Controller';
import { Ground } from '../game/world/WorldMap';

/**
 * Plays Thornvale's pre-rendered chiptune soundtrack (public/audio/music/*.m4a, built by
 * scripts/music/render.ts). Picks a track from where the player stands, switches to battle
 * music during fights, crossfades between tracks and resumes each track where it left off.
 *
 * If the files can't be loaded (for example the single-file offline build), `init` returns
 * false and Music falls back to its live-synthesized pieces.
 */

export type Zone = 'town' | 'fields' | 'forest' | 'jungle' | 'swamp' | 'snow' | 'desert' | 'volcano' | 'deep' | 'sea' | 'battle';
export const ZONES: Zone[] = ['town', 'fields', 'forest', 'jungle', 'swamp', 'snow', 'desert', 'volcano', 'deep', 'sea', 'battle'];

const FADE = 1.6; // seconds for a normal crossfade
const BATTLE_FADE = 0.5;
const BATTLE_HOLD_MS = 7000; // battle music stays this long after the last blow
const SETTLE_MS = 2500; // a new area must hold this long before the music changes
const KEEP = 4; // decoded tracks kept in memory besides battle

interface Playing { zone: Zone; src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number }

export class Tracks {
  private buffers = new Map<Zone, AudioBuffer>();
  private loading = new Map<Zone, Promise<AudioBuffer | null>>();
  private used: Zone[] = [];
  private offsets = new Map<Zone, number>();
  private playing: Playing | null = null;
  private bus: GainNode;
  private wanted: Zone = 'town';
  private candidate: Zone = 'town';
  private candidateSince = 0;
  private lastCombat = -Infinity;
  private lastSample = 0;
  private sampled: Zone = 'town';
  private ctl: Controller | null = null;

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.85;
    this.bus.connect(out);
  }

  /** Loads and starts the first track. False when the soundtrack files aren't available. */
  async init(first: Zone): Promise<boolean> {
    const buf = await this.load(first);
    if (!buf) return false;
    this.wanted = this.candidate = this.sampled = first;
    this.switchTo(first, 0.8);
    void this.load('battle'); // fights start suddenly: have it ready
    return true;
  }

  attach(ctl: Controller): void {
    this.ctl = ctl;
    ctl.game.events.on((e) => {
      const pid = this.ctl?.pid;
      if (pid === undefined) return;
      if ((e.type === 'damage' && (e.targetId === pid || e.sourceId === pid)) || (e.type === 'attack' && (e.attackerId === pid || e.targetId === pid))) {
        this.lastCombat = performance.now();
      }
    });
  }

  /** Called every frame: cheap. Samples the surroundings once a second. */
  update(): void {
    const ctl = this.ctl;
    if (!ctl) return;
    const now = performance.now();
    const g = ctl.game;
    const p = g.getPlayer(ctl.pid);
    if (!p) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    const safe = g.world.isSafe(x, y, p.z);
    if (now - this.lastSample > 1000) {
      this.lastSample = now;
      this.sampled = p.z < 0 ? (this.surroundings(x, y, p.z) === 'volcano' ? 'volcano' : 'deep') : safe ? 'town' : this.surroundings(x, y, p.z);
    }
    const fighting = !safe && now - this.lastCombat < BATTLE_HOLD_MS;
    const next: Zone = fighting ? 'battle' : this.sampled;
    if (next === 'battle') {
      this.candidate = next;
      this.wanted = next;
    } else if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = now;
    } else if (now - this.candidateSince > SETTLE_MS || this.wanted === 'battle') {
      this.wanted = next;
    }
    if (this.playing?.zone !== this.wanted) {
      const buf = this.buffers.get(this.wanted);
      if (buf) this.switchTo(this.wanted, this.wanted === 'battle' || this.playing?.zone === 'battle' ? BATTLE_FADE : FADE);
      else void this.load(this.wanted);
    }
  }

  /** The kind of land within 4 tiles: snow, lava, sand, jungle, swamp, forest or water when they dominate. */
  private surroundings(cx: number, cy: number, z: number): Zone {
    const w = this.ctl!.game.world;
    let snow = 0, hot = 0, sand = 0, wild = 0, bog = 0, wood = 0, water = 0, n = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const gr = w.getGround(cx + dx, cy + dy, z);
        if (gr === Ground.Void) continue;
        n++;
        if (gr === Ground.Snow || gr === Ground.Ice) snow++;
        else if (gr === Ground.Lava || gr === Ground.Ash) hot++;
        else if (gr === Ground.Sand) sand++;
        else if (gr === Ground.Jungle) wild++;
        else if (gr === Ground.Swamp) bog++;
        else if (gr === Ground.DarkGrass) wood++;
        else if (gr === Ground.Water || gr === Ground.DeepWater) water++;
      }
    }
    if (!n) return 'fields';
    if (snow / n >= 0.25) return 'snow';
    if (hot / n >= 0.2) return 'volcano';
    if (sand / n >= 0.35) return 'desert';
    if (bog / n >= 0.3) return 'swamp';
    if (wild / n >= 0.3 || (wild + bog) / n >= 0.35) return 'jungle';
    if (water / n >= 0.4) return 'sea';
    if (wood / n >= 0.35) return 'forest';
    return 'fields';
  }

  private load(zone: Zone): Promise<AudioBuffer | null> {
    const have = this.buffers.get(zone);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(zone);
    if (pending) return pending;
    const url = new URL(`audio/music/${zone}.m4a`, document.baseURI).href;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => {
        this.buffers.set(zone, buf);
        this.touch(zone);
        return buf;
      })
      .catch(() => null)
      .finally(() => this.loading.delete(zone));
    this.loading.set(zone, p);
    return p;
  }

  /** Keeps memory small: forget the least recently used tracks (never battle or the one playing). */
  private touch(zone: Zone): void {
    this.used = [zone, ...this.used.filter((z) => z !== zone)];
    for (const z of this.used.slice(KEEP)) {
      if (z !== 'battle' && z !== this.playing?.zone) this.buffers.delete(z);
    }
    this.used = this.used.slice(0, KEEP);
  }

  private switchTo(zone: Zone, fade: number): void {
    const buf = this.buffers.get(zone);
    if (!buf) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const old = this.playing;
    if (old) {
      const pos = (old.offset + (t - old.startedAt)) % (old.src.buffer?.duration ?? 1);
      this.offsets.set(old.zone, pos);
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.src.stop(t + fade + 0.05);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(gain).connect(this.bus);
    // battle always starts from the top; other tracks pick up where they left off
    const offset = zone === 'battle' ? 0 : (this.offsets.get(zone) ?? 0) % buf.duration;
    src.start(t, offset);
    this.playing = { zone, src, gain, startedAt: t, offset };
    this.touch(zone);
  }

  /** The zone being played, for the HUD or debugging. */
  get current(): Zone | null {
    return this.playing?.zone ?? null;
  }
}
