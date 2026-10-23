import type { Controller } from '../client/Controller';
import { INDOOR_PLACES, MusicPicker, PLACE_TRACKS, PlaceFinder, loopSeconds, type Place, type Track } from './musicPlaces';

/**
 * Plays Thornvale's pre-rendered soundtrack (public/audio/music/*.m4a, built by scripts/music/render.ts).
 * The title theme plays on the login and hero-creator screens; in the world musicPlaces.ts picks the
 * place (region, special place, building) and its track, the main regions take turns between two
 * themes, battle music cuts in during fights, and everything crossfades. Each track resumes where it
 * left off, except a theme that played to its end hands over to the next one from the top.
 *
 * If the files can't be loaded (for example the single-file offline build), `init` returns
 * false and Music falls back to its live-synthesized pieces.
 */

export type { Track, Place } from './musicPlaces';

const FADE = 1.6; // seconds for a normal crossfade
const BATTLE_FADE = 0.5;
const TITLE_FADE = 3; // title screen → the world
const BATTLE_HOLD_MS = 7000; // battle music stays this long after the last blow
const SETTLE_MS = 2500; // a new area must hold this long before the music changes
const KEEP = 4; // decoded tracks kept in memory besides battle

interface Playing { track: Track; place: Place; src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; loop: number }

export class Tracks {
  private buffers = new Map<Track, AudioBuffer>();
  private loading = new Map<Track, Promise<AudioBuffer | null>>();
  private used: Track[] = [];
  private offsets = new Map<Track, number>();
  private playing: Playing | null = null;
  private bus: GainNode;
  private picker = new MusicPicker();
  private finder: PlaceFinder | null = null;
  /** The place the music is in (after settling), and the track chosen for it. */
  private place: Place = 'title';
  private wanted: Track | null = 'title';
  private candidate: Place = 'title';
  private candidateSince = 0;
  private lastCombat = -Infinity;
  private lastSample = 0;
  private sampled: Place = 'title';
  private ctl: Controller | null = null;
  /** False = "Music: outdoors only": the quiet indoor themes are silent. */
  indoorMusic = true;

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.85;
    this.bus.connect(out);
  }

  /** Loads and starts the first track (the title theme). False when the soundtrack files aren't available. */
  async init(first: Place = 'title'): Promise<boolean> {
    const track = this.picker.enter(first, performance.now());
    const buf = await this.load(track);
    if (!buf) return false;
    this.place = this.candidate = this.sampled = first;
    this.wanted = track;
    this.switchTo(track, first, 0.8);
    void this.load('battle'); // fights start suddenly: have it ready
    return true;
  }

  attach(ctl: Controller): void {
    this.ctl = ctl;
    this.finder = new PlaceFinder(ctl.game.world);
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
    if (!ctl || !this.finder) return; // still on the title screen
    const now = performance.now();
    const g = ctl.game;
    const p = g.getPlayer(ctl.pid);
    if (!p) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (now - this.lastSample > 1000 || this.sampled === 'title') {
      this.lastSample = now;
      this.sampled = this.finder.placeAt(x, y, p.z);
    }
    const fighting = !g.world.isSafe(x, y, p.z) && now - this.lastCombat < BATTLE_HOLD_MS;
    const next: Place = fighting ? 'battle' : this.sampled;
    let move = false;
    if (next === 'battle' || this.place === 'title') {
      // fights cut in at once; the title theme gives way as soon as the world is there
      this.candidate = next;
      move = next !== this.place;
    } else if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = now;
    } else if (next !== this.place && (now - this.candidateSince > SETTLE_MS || this.place === 'battle')) {
      move = true;
    }
    if (move) {
      this.place = next;
      this.wanted = this.picker.enter(next, now);
    }
    // a place with several themes: when one has played to its end, the next one takes over
    const pl = this.playing;
    if (pl && pl.place === this.place && pl.track === this.wanted && PLACE_TRACKS[pl.place].length > 1) {
      if (pl.offset + (this.ctx.currentTime - pl.startedAt) >= pl.loop - FADE) {
        this.offsets.delete(pl.track);
        this.wanted = this.picker.advance(pl.place);
      }
    }
    const silent = !this.indoorMusic && INDOOR_PLACES.has(this.place);
    const target = silent ? null : this.wanted;
    if (target === null) {
      if (this.playing) this.fadeOut(FADE);
      return;
    }
    if (this.playing?.track !== target) {
      const buf = this.buffers.get(target);
      const from = this.playing?.track;
      if (buf) this.switchTo(target, this.place, from === 'title' ? TITLE_FADE : target === 'battle' || from === 'battle' ? BATTLE_FADE : FADE);
      else void this.load(target);
    }
  }

  private load(track: Track): Promise<AudioBuffer | null> {
    const have = this.buffers.get(track);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(track);
    if (pending) return pending;
    const url = new URL(`audio/music/${track}.m4a`, document.baseURI).href;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => {
        this.buffers.set(track, buf);
        this.touch(track);
        return buf;
      })
      .catch(() => null)
      .finally(() => this.loading.delete(track));
    this.loading.set(track, p);
    return p;
  }

  /** Keeps memory small: forget the least recently used tracks (never battle or the one playing). */
  private touch(track: Track): void {
    this.used = [track, ...this.used.filter((z) => z !== track)];
    for (const z of this.used.slice(KEEP)) {
      if (z !== 'battle' && z !== this.playing?.track) this.buffers.delete(z);
    }
    this.used = this.used.slice(0, KEEP);
  }

  /** Fades the playing track out and remembers where it was. */
  private fadeOut(fade: number): void {
    const old = this.playing;
    if (!old) return;
    const t = this.ctx.currentTime;
    this.offsets.set(old.track, (old.offset + (t - old.startedAt)) % old.loop);
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + fade);
    old.src.stop(t + fade + 0.05);
    this.playing = null;
  }

  private switchTo(track: Track, place: Place, fade: number): void {
    const buf = this.buffers.get(track);
    if (!buf) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.fadeOut(fade);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // loop at the exact musical length: the AAC file carries a little encoder padding after it
    const loop = Math.min(buf.duration, loopSeconds(track));
    src.loopStart = 0;
    src.loopEnd = loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + fade);
    src.connect(gain).connect(this.bus);
    // battle always starts from the top; other tracks pick up where they left off
    const offset = track === 'battle' ? 0 : (this.offsets.get(track) ?? 0) % loop;
    src.start(t, offset);
    this.playing = { track, place, src, gain, startedAt: t, offset, loop };
    this.touch(track);
  }

  /** The track being played, for the HUD or debugging. */
  get current(): Track | null {
    return this.playing?.track ?? null;
  }
}
